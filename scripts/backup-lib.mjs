import { DatabaseSync } from "node:sqlite";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  chmodSync,
  readdirSync,
  lstatSync,
} from "node:fs";
import { dirname, resolve, join } from "node:path";

const keyFrom = (hex) => {
  if (!/^[0-9a-f]{64}$/i.test(hex || ""))
    throw Error("BACKUP_ENCRYPTION_KEY deve conter 64 caracteres hex.");
  return Buffer.from(hex, "hex");
};
export function backupDatabase({ dbPath, outDir, keyHex, keep = 14 }) {
  const key = keyFrom(keyHex);
  if (!Number.isInteger(keep) || keep < 1 || keep > 365)
    throw Error("Retenção inválida (1 a 365 cópias).");
  const directory = resolve(outDir);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const suffix = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomBytes(6).toString("hex")}`;
  const snapshot = join(directory, `snapshot-${suffix}.sqlite`);
  const destination = join(directory, `duelou-${suffix}.sqlite.enc`);
  try {
    const db = new DatabaseSync(resolve(dbPath), { readOnly: true });
    try {
      db.exec(
        `PRAGMA busy_timeout=5000; VACUUM INTO '${snapshot.replace(/'/g, "''")}'`,
      );
    } finally {
      db.close();
    }
    chmodSync(snapshot, 0o600);
    const check = new DatabaseSync(snapshot, { readOnly: true });
    try {
      if (check.prepare("PRAGMA quick_check").get().quick_check !== "ok")
        throw Error("Snapshot inconsistente.");
    } finally {
      check.close();
    }
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([
      cipher.update(readFileSync(snapshot)),
      cipher.final(),
    ]);
    writeFileSync(
      destination,
      Buffer.concat([iv, cipher.getAuthTag(), encrypted]),
      { flag: "wx", mode: 0o600 },
    );
    // Only our own regular encrypted files are eligible for retention cleanup.
    const files = readdirSync(directory)
      .filter((name) =>
        /^duelou-\d{4}-\d{2}-\d{2}T[\d-]+Z-[a-f0-9]{12}\.sqlite\.enc$/.test(
          name,
        ),
      )
      .filter((name) => {
        const stat = lstatSync(join(directory, name));
        return stat.isFile() && !stat.isSymbolicLink();
      })
      .sort()
      .reverse();
    for (const name of files.slice(keep)) rmSync(join(directory, name));
    return destination;
  } finally {
    rmSync(snapshot, { force: true });
  }
}
export function restoreDatabase({ input, destination, keyHex }) {
  const key = keyFrom(keyHex),
    raw = readFileSync(resolve(input));
  if (raw.length < 29) throw Error("Backup incompleto.");
  const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  const plain = Buffer.concat([
    decipher.update(raw.subarray(28)),
    decipher.final(),
  ]);
  if (plain.subarray(0, 16).toString() !== "SQLite format 3\0")
    throw Error("Backup não contém um banco SQLite.");
  const target = resolve(destination);
  mkdirSync(dirname(target), { recursive: true });
  // Never overwrite an existing file, including the live database.
  writeFileSync(target, plain, { flag: "wx", mode: 0o600 });
  try {
    const check = new DatabaseSync(target, { readOnly: true });
    try {
      if (
        check.prepare("PRAGMA integrity_check").get().integrity_check !== "ok"
      )
        throw Error("Banco restaurado inconsistente.");
    } finally {
      check.close();
    }
  } catch (error) {
    rmSync(target);
    throw error;
  }
  return target;
}

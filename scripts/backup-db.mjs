// Cria uma cópia consistente do banco (mesmo com WAL ativo) via VACUUM INTO,
// depois cifra o arquivo com AES-256-GCM. A chave nunca fica no repositório:
// vem de BACKUP_ENCRYPTION_KEY (64 caracteres hex = 32 bytes) no ambiente.
import { DatabaseSync } from "node:sqlite";
import { createCipheriv, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const dbPath = process.env.DB_PATH || "data/duelou.sqlite";
const outDir = process.env.BACKUP_DIR || "backups";
const keyHex = process.env.BACKUP_ENCRYPTION_KEY;

if (!keyHex || !/^[0-9a-f]{64}$/i.test(keyHex)) {
  console.error(
    "Defina BACKUP_ENCRYPTION_KEY com 64 caracteres hex (32 bytes). Gere uma com:\n" +
      "  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  );
  process.exit(1);
}
const key = Buffer.from(keyHex, "hex");

mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const snapshotPath = resolve(outDir, `snapshot-${stamp}.sqlite`);
const encryptedPath = resolve(outDir, `duelou-${stamp}.sqlite.enc`);

mkdirSync(dirname(resolve(dbPath)), { recursive: true });
const db = new DatabaseSync(dbPath, { readOnly: true });
try {
  db.exec(`VACUUM INTO '${snapshotPath.replace(/'/g, "''")}'`);
} finally {
  db.close();
}

const plain = readFileSync(snapshotPath);
const iv = randomBytes(12);
const cipher = createCipheriv("aes-256-gcm", key, iv);
const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
const authTag = cipher.getAuthTag();
// Formato do arquivo: [12 bytes IV][16 bytes auth tag][dados cifrados]
writeFileSync(encryptedPath, Buffer.concat([iv, authTag, encrypted]));
rmSync(snapshotPath);

console.log(`Backup cifrado salvo em ${encryptedPath} (${encrypted.length} bytes).`);

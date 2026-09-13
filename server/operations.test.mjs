import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { backupDatabase, restoreDatabase } from "../scripts/backup-lib.mjs";
import { startOperations } from "./operations.mjs";
import { checkHealth } from "../scripts/check-health.mjs";

test("backup cifrado restaura WAL, retém cópias e nunca sobrescreve o destino", () => {
  const dir = mkdtempSync(join(tmpdir(), "duelou-backup-test-")),
    dbPath = join(dir, "live.sqlite");
  const keyHex = randomBytes(32).toString("hex"),
    outDir = join(dir, "backups");
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE test(value TEXT); INSERT INTO test VALUES('preserved');",
    );
    const file = backupDatabase({ dbPath, outDir, keyHex, keep: 2 });
    assert.ok(!readFileSync(file).includes(Buffer.from("preserved")));
    const destination = join(dir, "restored.sqlite");
    restoreDatabase({ input: file, destination, keyHex });
    const restored = new DatabaseSync(destination, { readOnly: true });
    try {
      assert.equal(
        restored.prepare("SELECT value FROM test").get().value,
        "preserved",
      );
    } finally {
      restored.close();
    }
    assert.throws(
      () => restoreDatabase({ input: file, destination, keyHex }),
      /EEXIST/,
    );
    assert.throws(() =>
      restoreDatabase({
        input: file,
        destination: join(dir, "wrong.sqlite"),
        keyHex: randomBytes(32).toString("hex"),
      }),
    );
    const damaged = readFileSync(file);
    damaged[damaged.length - 1] ^= 1;
    writeFileSync(join(dir, "damaged.enc"), damaged);
    assert.throws(() =>
      restoreDatabase({
        input: join(dir, "damaged.enc"),
        destination: join(dir, "damaged.sqlite"),
        keyHex,
      }),
    );
    for (let i = 0; i < 3; i++)
      backupDatabase({ dbPath, outDir, keyHex, keep: 2 });
    assert.equal(
      readdirSync(outDir).filter((n) => n.endsWith(".enc")).length,
      2,
    );
    assert.ok(readdirSync(outDir).every((n) => !n.startsWith("snapshot-")));
  } finally {
    db.close();
  }
});
test("agendador evita concorrência, sinaliza erro e permite recuperação", async () => {
  const workers = [],
    logs = [];
  const operations = startOperations({
    dbPath: "unused.sqlite",
    env: {
      BACKUP_ENCRYPTION_KEY: "a".repeat(64),
      BACKUP_INTERVAL_MINUTES: "5",
    },
    log: (x) => logs.push(x),
    launch: () => {
      const worker = new EventEmitter();
      workers.push(worker);
      return worker;
    },
  });
  const first = operations.run();
  assert.equal(workers.length, 1);
  workers[0].emit("error", Error("simulated"));
  assert.equal(await first, false);
  assert.equal(operations.status.state, "failed");
  const second = operations.run();
  workers[1].emit("exit", 0);
  assert.equal(await second, true);
  assert.ok(operations.status.lastSuccess);
  assert.equal(operations.status.state, "ok");
  await operations.stop();
  assert.equal(await operations.run(), false);
  assert.equal(logs.length, 2);
  assert.ok(logs.every((x) => !x.includes("a".repeat(64))));
});
test("monitor detecta falha HTTP, backup atrasado e serviço recuperado", async () => {
  const fetcher = (data) => async () =>
    new Response(JSON.stringify(data), { status: 200 });
  assert.equal(
    (
      await checkHealth("unused", {
        fetcher: fetcher({ ok: true }),
        requireBackup: true,
      })
    ).ok,
    false,
  );
  assert.equal(
    (
      await checkHealth("unused", {
        fetcher: fetcher({
          ok: true,
          backup: { state: "ok", lastSuccess: 1, intervalMinutes: 5 },
        }),
        requireBackup: true,
        now: 9999999,
      })
    ).ok,
    false,
  );
  assert.equal(
    (
      await checkHealth("unused", {
        fetcher: fetcher({
          ok: true,
          backup: { state: "ok", lastSuccess: 99999, intervalMinutes: 5 },
        }),
        requireBackup: true,
        now: 100000,
      })
    ).ok,
    true,
  );
  assert.equal(
    (
      await checkHealth("unused", {
        fetcher: async () => {
          throw Error("offline");
        },
      })
    ).ok,
    false,
  );
});

test("worker real executa backup fora do servidor", async () => {
  const dir = mkdtempSync(join(tmpdir(), "duelou-worker-test-")),
    dbPath = join(dir, "source.sqlite"),
    outDir = join(dir, "backups");
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE example(value INTEGER); INSERT INTO example VALUES(7)");
  const keyHex = randomBytes(32).toString("hex");
  const operations = startOperations({
    dbPath,
    env: {
      ...process.env,
      BACKUP_ENCRYPTION_KEY: keyHex,
      BACKUP_DIR: outDir,
      BACKUP_INTERVAL_MINUTES: "5",
    },
    log: () => {},
  });
  try {
    assert.equal(await operations.run(), true);
    const file = readdirSync(outDir).find((n) => n.endsWith(".enc"));
    assert.ok(file);
    restoreDatabase({
      input: join(outDir, file),
      destination: join(dir, "restored.sqlite"),
      keyHex,
    });
    assert.equal(operations.status.state, "ok");
  } finally {
    await operations.stop();
    db.close();
  }
});

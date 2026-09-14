import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createArenaPersistence } from "./arena-persistence.mjs";

// Banco mínimo em memória com só o que arena_matches referencia (players),
// mesma pragma de foreign_keys=ON que server.mjs usa de verdade.
function makeDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE players(id TEXT PRIMARY KEY, name TEXT NOT NULL, token TEXT UNIQUE NOT NULL, created INTEGER NOT NULL);`);
  db.prepare("INSERT INTO players VALUES(?,?,?,?)").run("alice", "Alice", "tok-a", 1);
  db.prepare("INSERT INTO players VALUES(?,?,?,?)").run("bob", "Bob", "tok-b", 1);
  return db;
}

test("recordMatch grava uma linha consultável por getMatch", () => {
  const db = makeDb();
  let clock = 5000;
  const persistence = createArenaPersistence(db, () => clock);
  persistence.recordMatch({
    matchId: "m1",
    playerA: "alice",
    playerB: "bob",
    winner: "alice",
    durationSeconds: 87,
    finalPlayerHp: 42,
    finalEnemyHp: 0,
    reason: "played",
  });
  const row = persistence.getMatch("m1");
  assert.ok(row);
  assert.equal(row.player_a, "alice");
  assert.equal(row.player_b, "bob");
  assert.equal(row.winner, "alice");
  assert.equal(row.duration_seconds, 87);
  assert.equal(row.final_player_hp, 42);
  assert.equal(row.final_enemy_hp, 0);
  assert.equal(row.reason, "played");
  assert.equal(row.created, 5000);
});

test("recordMatch grava winner nulo em caso de empate", () => {
  const db = makeDb();
  const persistence = createArenaPersistence(db, () => 1);
  persistence.recordMatch({
    matchId: "m1",
    playerA: "alice",
    playerB: "bob",
    winner: null,
    durationSeconds: 100,
    finalPlayerHp: 0,
    finalEnemyHp: 0,
    reason: "played",
  });
  assert.equal(persistence.getMatch("m1").winner, null);
});

test("recordMatch é idempotente: chamar de novo com o mesmo matchId não duplica nem sobrescreve", () => {
  const db = makeDb();
  const persistence = createArenaPersistence(db, () => 1);
  persistence.recordMatch({
    matchId: "m1",
    playerA: "alice",
    playerB: "bob",
    winner: "alice",
    durationSeconds: 50,
    finalPlayerHp: 10,
    finalEnemyHp: 0,
    reason: "played",
  });
  // Segunda chamada pro mesmo id, com dados diferentes — não deveria mudar nada.
  persistence.recordMatch({
    matchId: "m1",
    playerA: "alice",
    playerB: "bob",
    winner: "bob",
    durationSeconds: 999,
    finalPlayerHp: 0,
    finalEnemyHp: 99,
    reason: "disconnect",
  });
  const count = db.prepare("SELECT COUNT(*) AS n FROM arena_matches WHERE id=?").get("m1").n;
  assert.equal(count, 1, "não pode duplicar linha pro mesmo matchId");
  const row = persistence.getMatch("m1");
  assert.equal(row.winner, "alice", "a segunda chamada não deveria sobrescrever a primeira gravação");
});

test("getMatch devolve null pra partida que nunca foi gravada", () => {
  const db = makeDb();
  const persistence = createArenaPersistence(db, () => 1);
  assert.equal(persistence.getMatch("nao-existe"), null);
});

test("recordMatch não derruba o processo se um jogador já foi excluído (FOREIGN KEY) — só não grava a linha", () => {
  const db = makeDb();
  const persistence = createArenaPersistence(db, () => 1);
  db.prepare("DELETE FROM players WHERE id=?").run("bob"); // conta excluída (DELETE /v1/me de verdade)
  assert.doesNotThrow(() => {
    persistence.recordMatch({
      matchId: "m2",
      playerA: "alice",
      playerB: "bob", // não existe mais
      winner: "alice",
      durationSeconds: 30,
      finalPlayerHp: 50,
      finalEnemyHp: 0,
      reason: "disconnect",
    });
  });
  assert.equal(persistence.getMatch("m2"), null, "sem gravar a linha, mas sem quebrar o servidor");
});

import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createArenaRating } from "./arena-rating.mjs";
import { createArenaPersistence } from "./arena-persistence.mjs";

function makeDb(players = ["alice", "bob", "carol"]) {
  const db = new DatabaseSync(":memory:");
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE players(id TEXT PRIMARY KEY, name TEXT NOT NULL, token TEXT UNIQUE NOT NULL, created INTEGER NOT NULL);`);
  for (const id of players)
    db.prepare("INSERT INTO players VALUES(?,?,?,?)").run(
      id,
      id[0].toUpperCase() + id.slice(1),
      `tok-${id}`,
      1,
    );
  return db;
}

test("jogador novo começa com a nota inicial e em colocação", () => {
  const rating = createArenaRating(makeDb());
  const stats = rating.statsFor("alice");
  assert.equal(stats.rating, 1000);
  assert.equal(stats.matches, 0);
  assert.equal(stats.placement, true);
  assert.equal(stats.placementRemaining, 10);
});

test("vencer sobe a nota de quem ganhou exatamente o que desce da de quem perdeu (mesma nota inicial)", () => {
  const rating = createArenaRating(makeDb());
  const deltas = rating.applyResult({ playerA: "alice", playerB: "bob", winner: "alice" });
  assert.ok(deltas.alice.delta > 0);
  assert.equal(deltas.bob.delta, -deltas.alice.delta);
  assert.equal(rating.statsFor("alice").wins, 1);
  assert.equal(rating.statsFor("bob").losses, 1);
  assert.equal(rating.statsFor("alice").streak, 1);
  assert.equal(rating.statsFor("bob").streak, -1);
});

test("ganhar de quem tem nota muito maior vale mais que ganhar de quem tem nota menor", () => {
  const rating = createArenaRating(makeDb());
  // Bob vira favorito com uma sequência de vitórias sobre Carol.
  for (let i = 0; i < 6; i++)
    rating.applyResult({ playerA: "bob", playerB: "carol", winner: "bob" });
  assert.ok(rating.statsFor("bob").rating > rating.statsFor("alice").rating);

  const zebra = rating.applyResult({ playerA: "alice", playerB: "bob", winner: "alice" });
  const esperado = rating.applyResult({ playerA: "alice", playerB: "carol", winner: "alice" });
  assert.ok(
    zebra.alice.delta > esperado.alice.delta,
    "derrubar o favorito tem que valer mais do que ganhar de quem já vinha perdendo",
  );
});

test("empate aproxima as notas em vez de não valer nada", () => {
  const rating = createArenaRating(makeDb());
  for (let i = 0; i < 6; i++)
    rating.applyResult({ playerA: "bob", playerB: "carol", winner: "bob" });
  const deltas = rating.applyResult({ playerA: "alice", playerB: "bob", winner: null });
  assert.ok(deltas.alice.delta > 0, "empatar com quem é mais forte sobe a nota");
  assert.ok(deltas.bob.delta < 0);
  assert.equal(rating.statsFor("alice").draws, 1);
  assert.equal(rating.statsFor("alice").streak, 0, "empate zera a sequência, não continua a anterior");
});

test("a nota nunca fica negativa, por pior que seja a sequência", () => {
  const rating = createArenaRating(makeDb());
  for (let i = 0; i < 200; i++)
    rating.applyResult({ playerA: "alice", playerB: "bob", winner: "bob" });
  assert.ok(rating.statsFor("alice").rating >= 0);
});

test("sequência: guarda a melhor e reinicia ao trocar de resultado", () => {
  const rating = createArenaRating(makeDb());
  for (let i = 0; i < 4; i++)
    rating.applyResult({ playerA: "alice", playerB: "bob", winner: "alice" });
  assert.equal(rating.statsFor("alice").streak, 4);
  assert.equal(rating.statsFor("alice").bestStreak, 4);
  rating.applyResult({ playerA: "alice", playerB: "bob", winner: "bob" });
  assert.equal(rating.statsFor("alice").streak, -1, "perder corta a sequência de vitórias");
  assert.equal(rating.statsFor("alice").bestStreak, 4, "o recorde anterior continua guardado");
});

test("guarda o maior combo já feito pelo jogador", () => {
  const rating = createArenaRating(makeDb());
  rating.applyResult({ playerA: "alice", playerB: "bob", winner: "alice", combos: { alice: 7, bob: 3 } });
  rating.applyResult({ playerA: "alice", playerB: "bob", winner: "bob", combos: { alice: 2, bob: 9 } });
  assert.equal(rating.statsFor("alice").bestCombo, 7);
  assert.equal(rating.statsFor("bob").bestCombo, 9);
});

test("a classificação só lista quem terminou a colocação, do maior pro menor", () => {
  const rating = createArenaRating(makeDb());
  assert.deepEqual(rating.leaderboard(), [], "ninguém entra na tabela com uma partida só");
  for (let i = 0; i < 10; i++)
    rating.applyResult({ playerA: "alice", playerB: "bob", winner: i % 3 === 0 ? "bob" : "alice" });
  const table = rating.leaderboard();
  assert.equal(table.length, 2);
  assert.equal(table[0].id, "alice");
  assert.ok(table[0].rating > table[1].rating);
  assert.equal(table[0].name, "Alice");
});

test("resultado inválido (mesmo jogador dos dois lados, id faltando) não grava nada", () => {
  const rating = createArenaRating(makeDb());
  assert.equal(rating.applyResult({ playerA: "alice", playerB: "alice", winner: "alice" }), null);
  assert.equal(rating.applyResult({ playerA: "alice", playerB: null, winner: "alice" }), null);
  assert.equal(rating.statsFor("alice").matches, 0);
});

test("histórico sai na perspectiva de quem consulta, com adversário e placar", () => {
  const db = makeDb();
  const rating = createArenaRating(db);
  let time = 1000;
  const persistence = createArenaPersistence(db, () => (time += 1000));
  persistence.recordMatch({
    matchId: "m1",
    playerA: "alice",
    playerB: "bob",
    winner: "alice",
    durationSeconds: 90,
    finalPlayerHp: 55,
    finalEnemyHp: 0,
    reason: "played",
  });
  persistence.recordMatch({
    matchId: "m2",
    playerA: "bob",
    playerB: "alice",
    winner: null,
    durationSeconds: 100,
    finalPlayerHp: 30,
    finalEnemyHp: 30,
    reason: "played",
  });

  const daAlice = rating.historyFor("alice");
  assert.equal(daAlice.length, 2);
  assert.equal(daAlice[0].id, "m2", "mais recente primeiro");
  assert.equal(daAlice[0].outcome, "draw");
  assert.equal(daAlice[1].outcome, "win");
  assert.equal(daAlice[1].opponent, "Bob");
  assert.equal(daAlice[1].myBaseHp, 55);
  assert.equal(daAlice[1].theirBaseHp, 0);

  const doBob = rating.historyFor("bob");
  assert.equal(doBob[1].outcome, "loss", "a mesma partida, do outro lado, é derrota");
  assert.equal(doBob[1].myBaseHp, 0);
  assert.equal(doBob[1].opponent, "Alice");
});

test("a Arena Rush não cria nem toca em nada da classificação competitiva", () => {
  const db = makeDb();
  createArenaRating(db);
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((t) => t.name);
  assert.ok(tables.includes("arena_ratings"));
  assert.ok(
    !tables.some((name) => name.includes("competitive")),
    "a classificação da Arena é uma tabela própria e não encosta na fila competitiva",
  );
});

test("API: ficha, classificação e histórico da Arena exigem sessão e saem na perspectiva de quem pede", async () => {
  const { createApp } = await import("./server.mjs");
  const app = createApp(":memory:", () => Date.parse("2026-09-14T12:00:00Z"));
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + app.server.address().port;
  const call = async (path, token) => {
    const r = await fetch(base + path, {
      headers: token ? { Authorization: "Bearer " + token } : {},
    });
    return { status: r.status, data: await r.json() };
  };
  try {
    assert.equal((await call("/v1/arena/me")).status, 401, "sem sessão não vê ficha nenhuma");

    const novo = async (name) =>
      (
        await (
          await fetch(base + "/v1/guests", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
          })
        ).json()
      ).token;
    const tokenA = await novo("Alice");
    const tokenB = await novo("Bruno");

    const ficha = await call("/v1/arena/me", tokenA);
    assert.equal(ficha.status, 200);
    assert.equal(ficha.data.rating, 1000);
    assert.equal(ficha.data.matches, 0);
    assert.equal(ficha.data.placement, true);
    assert.deepEqual((await call("/v1/arena/leaderboard", tokenA)).data, []);
    assert.deepEqual((await call("/v1/arena/history", tokenA)).data, []);

    // Uma partida de verdade gravada pelos mesmos módulos que o tempo real usa.
    const rating = createArenaRating(app.db);
    const persistence = createArenaPersistence(app.db);
    const [idA, idB] = [
      (await call("/v1/me", tokenA)).data.id,
      (await call("/v1/me", tokenB)).data.id,
    ];
    persistence.recordMatch({
      matchId: "m1",
      playerA: idA,
      playerB: idB,
      winner: idA,
      durationSeconds: 74,
      finalPlayerHp: 38,
      finalEnemyHp: 0,
      reason: "played",
    });
    rating.applyResult({ playerA: idA, playerB: idB, winner: idA, combos: { [idA]: 6 } });

    const depois = (await call("/v1/arena/me", tokenA)).data;
    assert.equal(depois.wins, 1);
    assert.equal(depois.streak, 1);
    assert.equal(depois.bestCombo, 6);
    assert.ok(depois.rating > 1000);

    const historico = (await call("/v1/arena/history", tokenA)).data;
    assert.equal(historico.length, 1);
    assert.equal(historico[0].outcome, "win");
    assert.equal(historico[0].opponent, "Bruno");
    assert.equal((await call("/v1/arena/history", tokenB)).data[0].outcome, "loss");
  } finally {
    await new Promise((r) => app.server.close(r));
  }
});

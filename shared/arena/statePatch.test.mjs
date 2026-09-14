import test from "node:test";
import assert from "node:assert/strict";
import { applyPatch, diffState, flipPatch } from "./statePatch.ts";
import { createArenaState, spawn, step } from "./engine.ts";

const noRandom = () => 0.5;
const clone = (state) => structuredClone(state);
// Mesma tolerância da precisão mandada na rede (um décimo da pista).
const closeEnough = (a, b, message) =>
  assert.ok(Math.abs(a - b) <= 0.05, `${message}: ${a} ≠ ${b}`);

function sameMatch(applied, real) {
  closeEnough(applied.timeRemaining, real.timeRemaining, "tempo");
  closeEnough(applied.playerBaseHp, real.playerBaseHp, "base do jogador");
  closeEnough(applied.enemyBaseHp, real.enemyBaseHp, "base inimiga");
  assert.deepEqual(applied.combo, real.combo);
  assert.deepEqual(applied.stats, real.stats);
  assert.equal(applied.over, real.over);
  assert.equal(applied.winner, real.winner);
  assert.deepEqual(
    applied.troops.map((t) => t.id).sort(),
    real.troops.map((t) => t.id).sort(),
    "as mesmas tropas em campo",
  );
  for (const troop of real.troops) {
    const mirrored = applied.troops.find((t) => t.id === troop.id);
    closeEnough(mirrored.position, troop.position, `posição da tropa ${troop.id}`);
    closeEnough(mirrored.hp, troop.hp, `vida da tropa ${troop.id}`);
    assert.equal(mirrored.side, troop.side);
    assert.equal(mirrored.type, troop.type);
  }
}

test("uma partida inteira acompanhada só por patches termina igual à partida real", () => {
  const real = createArenaState(30);
  let sent = clone(real);
  let mirror = clone(real); // o que o cliente tem
  let messages = 0;

  for (let tick = 0; tick < 450 && !real.over; tick++) {
    if (tick % 7 === 0) spawn(real, "player", tick % 3 === 0 ? "tank" : "scout");
    if (tick % 5 === 0) spawn(real, "enemy", "soldier");
    if (tick % 11 === 0) real.combo.player++;
    step(real, 0.067, noRandom);

    const patch = diffState(sent, real);
    if (patch) {
      messages++;
      mirror = applyPatch(mirror, patch);
      sent = clone(real);
    }
  }

  sameMatch(mirror, real);
  assert.ok(messages > 10, "a partida precisa ter gerado patches de verdade");
});

test("nada muda entre dois tiques parados: patch nulo, mensagem nenhuma na rede", () => {
  const state = createArenaState(100);
  assert.equal(diffState(state, clone(state)), null);
  // Movimento menor que a precisão da rede também não vira mensagem: é bem
  // menos que um pixel na tela.
  const quieto = clone(state);
  spawn(state, "player", "scout");
  spawn(quieto, "player", "scout");
  quieto.troops[0].position += 0.01;
  assert.equal(diffState(state, quieto), null);
});

test("patch carrega só o que mudou", () => {
  const before = createArenaState(100);
  spawn(before, "player", "scout");
  const after = clone(before);
  after.troops[0].position = 42;

  const patch = diffState(before, after);
  assert.deepEqual(Object.keys(patch), ["upd"], "só a tropa que andou");
  assert.deepEqual(patch.upd, [[1, 42, 30]]);
});

test("tropa que nasce, anda e morre aparece como add, upd e del", () => {
  const empty = createArenaState(100);
  const born = clone(empty);
  spawn(born, "player", "tank");
  const nasceu = diffState(empty, born);
  assert.equal(nasceu.add.length, 1);
  assert.equal(nasceu.add[0].type, "tank");

  const moved = clone(born);
  moved.troops[0].position = 20;
  moved.troops[0].hp = 100;
  assert.deepEqual(diffState(born, moved).upd, [[1, 20, 100]]);

  const died = clone(moved);
  died.troops = [];
  assert.deepEqual(diffState(moved, died).del, [1]);
});

test("aplicar um patch não altera o estado anterior (o React precisa de objeto novo)", () => {
  const before = createArenaState(100);
  spawn(before, "player", "scout");
  const snapshot = clone(before);
  const after = clone(before);
  after.troops[0].position = 55;
  after.playerBaseHp = 80;

  const applied = applyPatch(before, diffState(snapshot, after));
  assert.notEqual(applied, before);
  assert.equal(before.troops[0].position, 0, "o estado antigo continua intacto");
  assert.equal(before.playerBaseHp, 100);
  assert.equal(applied.troops[0].position, 55);
  assert.equal(applied.playerBaseHp, 80);
});

test("patch de tropa desconhecida não quebra nada (o retrato completo seguinte conserta)", () => {
  const state = createArenaState(100);
  const applied = applyPatch(state, { upd: [[999, 50, 10]], del: [123] });
  assert.deepEqual(applied.troops, []);
  assert.equal(applied.over, false);
});

test("flipPatch entrega ao outro lado exatamente a partida espelhada", () => {
  const before = createArenaState(100);
  spawn(before, "player", "scout");
  spawn(before, "enemy", "tank");
  const after = clone(before);
  after.troops[0].position = 30;
  after.troops[1].position = 64;
  after.playerBaseHp = 70;
  after.combo.player = 4;
  after.stats.player.hits = 3;
  after.over = true;
  after.winner = "player";

  // O que o adversário tem em mãos é a partida invertida.
  const flipStateFor = (state) => ({
    ...structuredClone(state),
    playerBaseHp: state.enemyBaseHp,
    enemyBaseHp: state.playerBaseHp,
    combo: { player: state.combo.enemy, enemy: state.combo.player },
    stats: { player: structuredClone(state.stats.enemy), enemy: structuredClone(state.stats.player) },
    winner: state.winner === "player" ? "enemy" : state.winner === "enemy" ? "player" : state.winner,
    troops: state.troops.map((t) => ({
      ...t,
      side: t.side === "player" ? "enemy" : "player",
      position: 100 - t.position,
    })),
  });

  const applied = applyPatch(flipStateFor(before), flipPatch(diffState(before, after)));
  sameMatch(applied, flipStateFor(after));
});

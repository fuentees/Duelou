import test from "node:test";
import assert from "node:assert/strict";
import { toViewerPerspective } from "./perspective.ts";
import { createArenaState, spawn } from "../../shared/arena/engine.ts";

function sampleState() {
  const state = createArenaState(100);
  spawn(state, "player", "scout");
  spawn(state, "enemy", "tank");
  state.troops[0].position = 30;
  state.troops[1].position = 65;
  state.playerBaseHp = 80;
  state.enemyBaseHp = 55;
  state.combo = { player: 3, enemy: 1 };
  state.stats.player.hits = 4;
  state.stats.enemy.hits = 2;
  state.winner = "player";
  return state;
}

test("perspectiva 'player' devolve o mesmo estado, sem nenhuma cópia", () => {
  const state = sampleState();
  assert.equal(toViewerPerspective(state, "player"), state);
});

test("perspectiva 'enemy' inverte bases, combo, stats, vencedor e cada tropa (lado e posição espelhada)", () => {
  const state = sampleState();
  const flipped = toViewerPerspective(state, "enemy");

  assert.equal(flipped.playerBaseHp, 55);
  assert.equal(flipped.enemyBaseHp, 80);
  assert.equal(flipped.combo.player, 1);
  assert.equal(flipped.combo.enemy, 3);
  assert.equal(flipped.stats.player.hits, 2);
  assert.equal(flipped.stats.enemy.hits, 4);
  assert.equal(flipped.winner, "enemy", "quem era 'player' (vencedor real) vira 'enemy' na perspectiva de quem estava do outro lado");

  const scout = flipped.troops.find((t) => t.type === "scout");
  const tank = flipped.troops.find((t) => t.type === "tank");
  assert.equal(scout.side, "enemy");
  assert.equal(scout.position, 70, "posição 30 vira 70 (100 - 30)");
  assert.equal(tank.side, "player");
  assert.equal(tank.position, 35, "posição 65 vira 35 (100 - 65)");

  // Não deve mutar o estado original.
  assert.equal(state.playerBaseHp, 80);
  assert.equal(state.troops[0].side, "player");
});

test("empate e ausência de vencedor não mudam ao inverter a perspectiva", () => {
  const draw = sampleState();
  draw.winner = "draw";
  assert.equal(toViewerPerspective(draw, "enemy").winner, "draw");

  const none = sampleState();
  none.winner = null;
  assert.equal(toViewerPerspective(none, "enemy").winner, null);
});

test("inverter duas vezes (ida e volta) recupera exatamente os valores originais", () => {
  const state = sampleState();
  const flipped = toViewerPerspective(state, "enemy");
  const roundTrip = toViewerPerspective(flipped, "enemy");
  assert.equal(roundTrip.playerBaseHp, state.playerBaseHp);
  assert.equal(roundTrip.enemyBaseHp, state.enemyBaseHp);
  assert.equal(roundTrip.combo.player, state.combo.player);
  assert.equal(roundTrip.combo.enemy, state.combo.enemy);
  assert.equal(roundTrip.winner, state.winner);
  const originalScout = state.troops.find((t) => t.type === "scout");
  const roundTripScout = roundTrip.troops.find((t) => t.type === "scout");
  assert.equal(roundTripScout.side, originalScout.side);
  assert.equal(roundTripScout.position, originalScout.position);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  createArenaState,
  spawn,
  step,
  TROOP_CONFIG,
  MAX_TROOPS_PER_SIDE,
} from "./engine.ts";

const noRandom = () => 0.5; // sem variação de dano, deixa os testes previsíveis

test("tropa que chega tira vida da base", () => {
  const state = createArenaState(100);
  spawn(state, "player", "scout");
  let events = [];
  // Nada no caminho — a tropa deve atravessar a pista inteira e bater na base.
  for (let i = 0; i < 200 && !events.some((e) => e.type === "baseHit"); i++)
    events = step(state, 0.1, noRandom);
  const hit = events.find((e) => e.type === "baseHit");
  assert.ok(hit, "deveria emitir baseHit ao atravessar a pista inteira");
  assert.equal(hit.side, "enemy");
  assert.equal(hit.dmg, TROOP_CONFIG.scout.baseDamage);
  assert.equal(state.enemyBaseHp, 100 - TROOP_CONFIG.scout.baseDamage);
  assert.equal(state.troops.length, 0, "a tropa é consumida ao bater na base");
});

test("combate mata a mais fraca", () => {
  const state = createArenaState(100);
  spawn(state, "player", "tank");
  spawn(state, "enemy", "scout");
  // Coloca as duas na mesma posição pra engajar em combate imediatamente,
  // sem depender de quanto tempo levam pra se encontrar na pista.
  state.troops[0].position = 50;
  state.troops[1].position = 50;
  let allEvents = [];
  for (let i = 0; i < 50 && state.troops.length > 1; i++)
    allEvents = allEvents.concat(step(state, 0.1, noRandom));
  const died = allEvents.filter((e) => e.type === "troopDied");
  assert.equal(died.length, 1, "só a tropa mais fraca deveria morrer");
  assert.equal(died[0].troopType, "scout");
  assert.equal(died[0].side, "enemy");
  assert.equal(state.troops.length, 1);
  assert.equal(state.troops[0].type, "tank");
  assert.ok(state.troops[0].hp > 0 && state.troops[0].hp < TROOP_CONFIG.tank.hp, "o tanque deveria ter perdido alguma vida, mas sobrevivido");
});

test("contagem de tropas respeita o teto", () => {
  const state = createArenaState(100);
  for (let i = 0; i < MAX_TROOPS_PER_SIDE; i++)
    assert.equal(spawn(state, "player", "scout"), true);
  assert.equal(
    state.troops.filter((t) => t.side === "player").length,
    MAX_TROOPS_PER_SIDE,
  );
  assert.equal(spawn(state, "player", "scout"), false, "não pode passar do teto");
  assert.equal(
    state.troops.filter((t) => t.side === "player").length,
    MAX_TROOPS_PER_SIDE,
    "a tentativa acima do teto não deveria criar tropa nenhuma",
  );
  // O teto é por lado — o time inimigo não é afetado pelo teto do jogador.
  assert.equal(spawn(state, "enemy", "scout"), true);
});

test("partida termina quando uma base zera", () => {
  const state = createArenaState(1000);
  // Uma tropa só nunca derruba uma base sozinha (dano é só no impacto, a
  // tropa some em seguida) — precisa de várias chegando em sequência.
  for (let i = 0; i < 6; i++) spawn(state, "player", "tank");
  let events = [];
  for (let i = 0; i < 2000 && !state.over; i++)
    events = events.concat(step(state, 0.1, noRandom));
  assert.equal(state.over, true);
  assert.equal(state.enemyBaseHp, 0);
  assert.equal(state.winner, "player");
  assert.ok(events.some((e) => e.type === "matchOver" && e.winner === "player"));
  // Depois de terminada, step() não faz mais nada (sem eventos, sem mudar estado).
  const hpBefore = state.enemyBaseHp;
  const after = step(state, 1, noRandom);
  assert.deepEqual(after, []);
  assert.equal(state.enemyBaseHp, hpBefore);
});

test("tropas do mesmo lado nunca se sobrepõem, mesmo em fila", () => {
  const state = createArenaState(100);
  // Espaça os nascimentos como numa partida de verdade (um a cada resposta),
  // não simultâneos — nascer é sempre na borda da base (ver comentário em
  // spawn()), quem evita empilhar de verdade é o espaçamento do movimento.
  for (let i = 0; i < 5; i++) {
    spawn(state, "player", "scout");
    step(state, 0.3, noRandom);
  }
  for (let i = 0; i < 300; i++) {
    step(state, 0.05, noRandom);
    const positions = state.troops
      .filter((t) => t.side === "player")
      .map((t) => t.position)
      .sort((a, b) => a - b);
    for (let j = 1; j < positions.length; j++)
      assert.ok(positions[j] - positions[j - 1] >= 3.9, "tropas do mesmo lado não podem quase se sobrepor");
  }
});

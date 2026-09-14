import test from "node:test";
import assert from "node:assert/strict";
import {
  createArenaState,
  decideTroopType,
  spawn,
  step,
  TROOP_CONFIG,
  MAX_TROOPS_PER_SIDE,
  SUDDEN_DEATH_MULTIPLIER,
  SUDDEN_DEATH_SECONDS,
  COMBO_SPEND_COST,
  COUNTER_BONUS,
  counterMultiplier,
  spendCombo,
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

test("decideTroopType: acerto normal (não rápido, combo baixo) sai scout", () => {
  assert.equal(decideTroopType(false, 0), "scout");
  assert.equal(decideTroopType(false, 2), "scout");
});

test("decideTroopType: rápido OU combo >= 3 (não os dois) sai soldier", () => {
  assert.equal(decideTroopType(true, 0), "soldier");
  assert.equal(decideTroopType(false, 3), "soldier");
});

test("decideTroopType: rápido E combo >= 3 sai tank", () => {
  assert.equal(decideTroopType(true, 3), "tank");
  assert.equal(decideTroopType(true, 5), "tank");
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

test("morte súbita: nos últimos segundos o dano à base vale dobrado", () => {
  const normal = createArenaState(100);
  spawn(normal, "player", "scout");
  normal.troops[0].position = 99.9;
  const normalEvents = step(normal, 0.1, noRandom);
  assert.equal(
    normalEvents.find((e) => e.type === "baseHit").dmg,
    TROOP_CONFIG.scout.baseDamage,
  );

  const ending = createArenaState(SUDDEN_DEATH_SECONDS);
  spawn(ending, "player", "scout");
  ending.troops[0].position = 99.9;
  const endingEvents = step(ending, 0.1, noRandom);
  assert.equal(
    endingEvents.find((e) => e.type === "baseHit").dmg,
    TROOP_CONFIG.scout.baseDamage * SUDDEN_DEATH_MULTIPLIER,
    "travar a partida no fim não pode ser a melhor jogada",
  );
  assert.equal(
    ending.enemyBaseHp,
    100 - TROOP_CONFIG.scout.baseDamage * SUDDEN_DEATH_MULTIPLIER,
  );
});

test("tempo esgotado com bases empatadas: decide por tropa em campo, combo e invocações", () => {
  const byTroops = createArenaState(0.05);
  spawn(byTroops, "player", "scout");
  step(byTroops, 0.1, noRandom);
  assert.equal(byTroops.over, true);
  assert.equal(byTroops.winner, "player", "quem terminou com tropa em campo leva");

  const byCombo = createArenaState(0.05);
  byCombo.stats.enemy.maxCombo = 5;
  byCombo.stats.player.maxCombo = 2;
  step(byCombo, 0.1, noRandom);
  assert.equal(byCombo.winner, "enemy");

  const byHits = createArenaState(0.05);
  byHits.stats.player.maxCombo = 3;
  byHits.stats.enemy.maxCombo = 3;
  byHits.stats.player.hits = 9;
  byHits.stats.enemy.hits = 7;
  step(byHits, 0.1, noRandom);
  assert.equal(byHits.winner, "player");

  // Empate de verdade continua existindo: duas partidas idênticas em tudo.
  const tie = createArenaState(0.05);
  step(tie, 0.1, noRandom);
  assert.equal(tie.winner, "draw");
});

test("spawn avisa quando a pista está cheia, em vez de engolir o acerto", () => {
  const state = createArenaState(100);
  for (let i = 0; i < MAX_TROOPS_PER_SIDE; i++)
    assert.equal(spawn(state, "player", "scout"), true);
  assert.equal(spawn(state, "player", "scout"), false, "no teto, spawn precisa devolver false");
  assert.equal(spawn(state, "enemy", "scout"), true, "o teto é por lado, não da pista inteira");
});

test("vantagem de tipo: batedor cerca tanque, tanque atropela soldado, soldado segura batedor", () => {
  assert.equal(counterMultiplier("scout", "tank"), COUNTER_BONUS);
  assert.equal(counterMultiplier("tank", "soldier"), COUNTER_BONUS);
  assert.equal(counterMultiplier("soldier", "scout"), COUNTER_BONUS);
  // Sem vantagem nos outros cruzamentos, inclusive contra o mesmo tipo.
  assert.equal(counterMultiplier("tank", "scout"), 1);
  assert.equal(counterMultiplier("scout", "soldier"), 1);
  assert.equal(counterMultiplier("soldier", "tank"), 1);
  for (const type of ["scout", "soldier", "tank"]) assert.equal(counterMultiplier(type, type), 1);
});

test("a vantagem de tipo muda o dano trocado no combate, não só a tabela", () => {
  // noRandom = 0.5 zera a variação de ±15%, então o dano do tique é exato.
  const state = createArenaState(100);
  spawn(state, "player", "scout"); // batedor cerca tanque: bônus pro jogador
  spawn(state, "enemy", "tank"); // tanque não tem bônus contra batedor
  state.troops[0].position = 50;
  state.troops[1].position = 50;
  const [scout, tank] = state.troops;
  step(state, 0.1, noRandom);
  assert.equal(
    Math.round(100 * (tank.maxHp - tank.hp)) / 100,
    Math.round(100 * TROOP_CONFIG.scout.dps * 0.1 * COUNTER_BONUS) / 100,
    "o batedor com vantagem tem que bater mais forte no tanque",
  );
  assert.equal(
    Math.round(100 * (scout.maxHp - scout.hp)) / 100,
    Math.round(100 * TROOP_CONFIG.tank.dps * 0.1) / 100,
    "o tanque não tem vantagem contra batedor: dano normal",
  );
});

test("gastar combo invoca um tanque na hora e zera o combo", () => {
  const state = createArenaState(100);
  state.combo.player = COMBO_SPEND_COST;
  assert.equal(spendCombo(state, "player"), true);
  assert.equal(state.troops.length, 1);
  assert.equal(state.troops[0].type, "tank");
  assert.equal(state.troops[0].side, "player");
  assert.equal(state.combo.player, 0, "o combo é o preço: não dá pra gastar e manter");
  assert.equal(state.stats.player.hits, 1);
});

test("gastar combo é recusado sem combo suficiente, com a pista cheia ou com a partida encerrada", () => {
  const semCombo = createArenaState(100);
  semCombo.combo.player = COMBO_SPEND_COST - 1;
  assert.equal(spendCombo(semCombo, "player"), false);
  assert.equal(semCombo.troops.length, 0);
  assert.equal(semCombo.combo.player, COMBO_SPEND_COST - 1, "recusar não pode cobrar o preço");

  const cheia = createArenaState(100);
  cheia.combo.player = COMBO_SPEND_COST;
  for (let i = 0; i < MAX_TROOPS_PER_SIDE; i++) spawn(cheia, "player", "scout");
  assert.equal(spendCombo(cheia, "player"), false);
  assert.equal(cheia.combo.player, COMBO_SPEND_COST);

  const acabada = createArenaState(100);
  acabada.combo.player = COMBO_SPEND_COST;
  acabada.over = true;
  assert.equal(spendCombo(acabada, "player"), false);
});

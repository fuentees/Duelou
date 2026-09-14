import test from "node:test";
import assert from "node:assert/strict";
import { createArenaMatchEngine } from "./arena-match.mjs";
import { decideTroopType, FAST_CHOICE_MS } from "../shared/arena/engine.ts";

function fakeScheduler() {
  let captured = null;
  return {
    setIntervalFn: (fn) => {
      captured = fn;
      return "fake-timer";
    },
    clearIntervalFn: () => {
      captured = null;
    },
    tick: () => captured?.(),
  };
}

function makeEngine(overrides = {}) {
  const scheduler = fakeScheduler();
  const engine = createArenaMatchEngine({
    tickMs: 100,
    random: () => 0.5,
    setIntervalFn: scheduler.setIntervalFn,
    clearIntervalFn: scheduler.clearIntervalFn,
    ...overrides,
  });
  return { engine, scheduler };
}

test("tickAll avança a simulação de verdade: tropas spawnadas via applyAnswer chegam e tiram vida da base", () => {
  const { engine, scheduler } = makeEngine();
  engine.createMatch("m1", "alice", "bob");

  // Alice (side "player") acerta 8 desafios devagar (não rápido) — spawna
  // scouts/soldiers reais através do mesmo caminho que o WS layer vai usar.
  for (let i = 0; i < 8; i++) {
    const result = engine.applyAnswer("m1", "alice", {
      correct: true,
      elapsedMs: FAST_CHOICE_MS + 1000,
      kind: "choice",
    });
    assert.notEqual(result, null);
  }

  const before = engine.getMatch("m1").state.enemyBaseHp;
  // 8 tropas devem ter tempo de sobra pra cruzar a pista em ~30s simulados.
  for (let i = 0; i < 300; i++) scheduler.tick();
  const after = engine.getMatch("m1").state.enemyBaseHp;
  assert.ok(after < before, "base inimiga deveria ter tomado dano das tropas da Alice");
  engine.stop();
});

test("applyAnswer reproduz exatamente a regra decideTroopType do modo offline, por lado, sem se contaminar", () => {
  const { engine, scheduler } = makeEngine();
  engine.createMatch("m1", "alice", "bob");

  // Alice erra uma vez (zera combo dela), Bob nunca respondeu ainda.
  engine.applyAnswer("m1", "alice", { correct: false, elapsedMs: 0, kind: "choice" });
  let state = engine.getMatch("m1").state;
  assert.equal(state.combo.player, 0);
  assert.equal(state.combo.enemy, 0, "resposta da Alice não pode afetar o combo do Bob");
  assert.equal(state.stats.player.challengesTotal, 1);
  assert.equal(state.stats.enemy.challengesTotal, 0);

  // Bob acerta rápido 3x seguidas -> combo 1 (soldier, rápido), 2 (soldier),
  // 3 (tank, rápido E combo>=3) — mesma tabela de decideTroopType.
  const fastElapsed = 10;
  let r1 = engine.applyAnswer("m1", "bob", { correct: true, elapsedMs: fastElapsed, kind: "choice" });
  let r2 = engine.applyAnswer("m1", "bob", { correct: true, elapsedMs: fastElapsed, kind: "choice" });
  let r3 = engine.applyAnswer("m1", "bob", { correct: true, elapsedMs: fastElapsed, kind: "choice" });
  assert.equal(r1.troopType, decideTroopType(true, 1));
  assert.equal(r2.troopType, decideTroopType(true, 2));
  assert.equal(r3.troopType, decideTroopType(true, 3));
  assert.equal(r3.troopType, "tank");

  state = engine.getMatch("m1").state;
  assert.equal(state.combo.enemy, 3);
  assert.equal(state.combo.player, 0, "as respostas do Bob não podem afetar o combo da Alice");
  assert.equal(state.stats.player.challengesTotal, 1, "estatística da Alice não deveria ter mudado");
  engine.stop();
});

test("applyAnswer errado não invoca tropa e zera o combo daquele lado", () => {
  const { engine } = makeEngine();
  engine.createMatch("m1", "alice", "bob");
  engine.applyAnswer("m1", "alice", { correct: true, elapsedMs: 10, kind: "choice" });
  const result = engine.applyAnswer("m1", "alice", { correct: false, elapsedMs: 10, kind: "choice" });
  assert.equal(result.troopType, null);
  assert.equal(engine.getMatch("m1").state.combo.player, 0);
  engine.stop();
});

test("applyAnswer devolve null pra partida inexistente ou jogador que não participa dela", () => {
  const { engine } = makeEngine();
  engine.createMatch("m1", "alice", "bob");
  assert.equal(engine.applyAnswer("partida-que-nao-existe", "alice", { correct: true, elapsedMs: 1, kind: "choice" }), null);
  assert.equal(engine.applyAnswer("m1", "estranho", { correct: true, elapsedMs: 1, kind: "choice" }), null);
  engine.stop();
});

test("forfeit declara o outro lado vencedor na hora e emite matchOver", () => {
  const { engine } = makeEngine();
  engine.createMatch("m1", "alice", "bob");
  const events = [];
  engine.on("matchOver", (payload) => events.push(payload));

  const result = engine.forfeit("m1", "player", "disconnect"); // Alice (player) desistiu
  assert.equal(result.winner, "enemy", "Bob deveria vencer, já que a Alice ('player') desistiu");
  assert.equal(events.length, 1);
  assert.equal(events[0].reason, "disconnect");
  assert.equal(engine.getMatch("m1").ended, true);
  engine.stop();
});

test("forfeit numa partida já encerrada não emite matchOver de novo", () => {
  const { engine } = makeEngine();
  engine.createMatch("m1", "alice", "bob");
  let count = 0;
  engine.on("matchOver", () => count++);
  engine.forfeit("m1", "player");
  const second = engine.forfeit("m1", "player");
  assert.equal(second, null);
  assert.equal(count, 1);
  engine.stop();
});

test("uma partida com startsAt no futuro não avança até esse instante (fase de contagem/revelação)", () => {
  let currentTime = 1000;
  const scheduler = fakeScheduler();
  const engine = createArenaMatchEngine({
    tickMs: 100,
    random: () => 0.5,
    now: () => currentTime,
    setIntervalFn: scheduler.setIntervalFn,
    clearIntervalFn: scheduler.clearIntervalFn,
  });
  engine.createMatch("m1", "alice", "bob", currentTime + 3000); // começa em 3s
  engine.applyAnswer("m1", "alice", { correct: true, elapsedMs: 10, kind: "choice" });
  const before = engine.getMatch("m1").state.timeRemaining;
  scheduler.tick();
  scheduler.tick();
  assert.equal(engine.getMatch("m1").state.timeRemaining, before, "não deveria ter avançado antes de startsAt");

  currentTime += 3100;
  scheduler.tick();
  assert.ok(engine.getMatch("m1").state.timeRemaining < before, "deveria avançar depois de startsAt");
  engine.stop();
});

test("pauseMatch congela timeRemaining e as tropas; resumeMatch volta a avançar de onde parou", () => {
  const { engine, scheduler } = makeEngine();
  engine.createMatch("m1", "alice", "bob");
  engine.applyAnswer("m1", "alice", { correct: true, elapsedMs: 10, kind: "choice" });
  for (let i = 0; i < 20; i++) scheduler.tick(); // deixa o motor rodar um pouco antes de pausar

  const ok = engine.pauseMatch("m1");
  assert.equal(ok, true);
  const frozenTime = engine.getMatch("m1").state.timeRemaining;
  const frozenPositions = engine.getMatch("m1").state.troops.map((t) => t.position);
  for (let i = 0; i < 30; i++) scheduler.tick();
  assert.equal(engine.getMatch("m1").state.timeRemaining, frozenTime, "pausada, timeRemaining não deveria mudar");
  assert.deepEqual(
    engine.getMatch("m1").state.troops.map((t) => t.position),
    frozenPositions,
    "pausada, as tropas não deveriam se mover",
  );

  const resumed = engine.resumeMatch("m1");
  assert.equal(resumed, true);
  for (let i = 0; i < 5; i++) scheduler.tick();
  assert.ok(
    engine.getMatch("m1").state.timeRemaining < frozenTime,
    "depois de resumeMatch, o tempo deveria voltar a passar",
  );
  engine.stop();
});

test("pauseMatch/resumeMatch numa partida inexistente ou já encerrada devolve false sem quebrar", () => {
  const { engine } = makeEngine();
  assert.equal(engine.pauseMatch("nao-existe"), false);
  assert.equal(engine.resumeMatch("nao-existe"), false);

  engine.createMatch("m1", "alice", "bob");
  engine.forfeit("m1", "player");
  assert.equal(engine.pauseMatch("m1"), false, "partida já encerrada não pode ser pausada");
  assert.equal(engine.resumeMatch("m1"), false);
  engine.stop();
});

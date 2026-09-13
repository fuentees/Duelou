import test from "node:test";
import assert from "node:assert/strict";
import { createArenaChallenges } from "./arena-challenges.mjs";

// PRNG determinístico simples (mulberry32) — só pra não repetir sempre o
// mesmo 0.5 nos testes (o que poderia mascarar bugs de shuffle/sorteio),
// mas ainda ser 100% reprodutível.
function seeded(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fakeClock(start = 1000) {
  let t = start;
  return { now: () => t, advance: (ms) => (t += ms) };
}

// setTimeout/clearTimeout falsos: nada dispara sozinho, só quando o teste
// manda — assim dá pra controlar exatamente o momento do "vai" do reflexo.
function fakeScheduler() {
  const timers = new Map();
  let nextId = 1;
  return {
    setTimeoutFn: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { fn, ms });
      return id;
    },
    clearTimeoutFn: (id) => timers.delete(id),
    fireLatest: () => {
      const id = Math.max(...timers.keys());
      const t = timers.get(id);
      timers.delete(id);
      t.fn();
    },
    pendingCount: () => timers.size,
  };
}

function issueUntil(challenges, kind, playerId = "p1", onGo) {
  let issued;
  for (let i = 0; i < 20; i++) {
    issued = challenges.issue(playerId, 0, onGo);
    if (issued.public.kind === kind) return issued;
  }
  throw new Error(`não saiu nenhum desafio do tipo "${kind}" em 20 tentativas`);
}

test("payload público nunca contém gabarito nem waitMs do reflexo", () => {
  const clock = fakeClock();
  const challenges = createArenaChallenges({ now: clock.now, random: seeded(1) });
  for (let i = 0; i < 20; i++) {
    const { public: pub } = challenges.issue("p1", i);
    if (pub.kind === "choice") {
      assert.equal("answerIndex" in pub, false, "gabarito não pode ir pro cliente");
      assert.equal("answer" in pub, false);
    } else {
      assert.equal(
        "waitMs" in pub,
        false,
        "waitMs do reflexo não pode vazar, senão dá pra cravar reação ~0ms sem ver o sinal",
      );
    }
  }
});

test("submit() valida a resposta de múltipla escolha contra o gabarito guardado no servidor", () => {
  const clock = fakeClock();
  const challenges = createArenaChallenges({ now: clock.now, random: seeded(2) });
  const issued = issueUntil(challenges, "choice");

  const wrongIndex = (0 + 1) % issued.public.options.length;
  const result = challenges.submit(issued.challengeId, { index: wrongIndex });
  assert.equal(result.kind, "choice");
  // Não sabemos qual índice é o certo sem expor o gabarito, mas sabemos que
  // ele é determinístico pra essa seed — comparar contra a mesma seed de
  // novo, numa segunda instância, deve dar exatamente o mesmo veredito.
  const clock2 = fakeClock();
  const challenges2 = createArenaChallenges({ now: clock2.now, random: seeded(2) });
  const issued2 = issueUntil(challenges2, "choice");
  const result2 = challenges2.submit(issued2.challengeId, { index: wrongIndex });
  assert.equal(result2.correct, result.correct, "mesma seed, mesmo índice -> mesmo veredito");
});

test("submit() rejeita challengeId desconhecido e bloqueia replay do mesmo desafio", () => {
  const clock = fakeClock();
  const challenges = createArenaChallenges({ now: clock.now, random: seeded(3) });
  assert.equal(challenges.submit("id-que-nao-existe", { index: 0 }), null);

  const issued = issueUntil(challenges, "choice");
  const first = challenges.submit(issued.challengeId, { index: 0 });
  assert.notEqual(first, null);
  const replay = challenges.submit(issued.challengeId, { index: 0 });
  assert.equal(replay, null, "responder o mesmo challengeId de novo (replay) deve ser rejeitado");
});

test("reflexo: tocar antes do go conta como erro, sem precisar o cliente dizer isso", () => {
  const clock = fakeClock();
  const scheduler = fakeScheduler();
  const challenges = createArenaChallenges({
    now: clock.now,
    random: seeded(4),
    setTimeoutFn: scheduler.setTimeoutFn,
    clearTimeoutFn: scheduler.clearTimeoutFn,
  });
  const issued = issueUntil(challenges, "reflex");

  const early = challenges.submit(issued.challengeId, { tapped: true });
  assert.equal(early.correct, false);
  assert.equal(early.elapsedMs, 0);
});

test("reflexo: tempo de reação vem só do goAt do servidor, mesmo se o cliente mandar outra coisa", () => {
  const clock = fakeClock();
  const scheduler = fakeScheduler();
  const challenges = createArenaChallenges({
    now: clock.now,
    random: seeded(5),
    setTimeoutFn: scheduler.setTimeoutFn,
    clearTimeoutFn: scheduler.clearTimeoutFn,
  });
  let goFired = false;
  const issued = issueUntil(challenges, "reflex", "p1", () => (goFired = true));

  scheduler.fireLatest(); // simula o momento do "vai", sem o teste saber o waitMs
  assert.equal(goFired, true, "onGo deveria disparar quando o timer do go dispara");
  clock.advance(250); // "humano" reage 250ms depois do go

  // O cliente manda um campo extra (`elapsedMs`) tentando se autodeclarar
  // mais rápido do que foi — submit() nem aceita esse campo, só calcula.
  const result = challenges.submit(issued.challengeId, { tapped: true, elapsedMs: 1 });
  assert.equal(result.correct, true);
  assert.equal(result.elapsedMs, 250, "elapsedMs tem que vir do relógio do servidor, não do que o cliente mandou");
});

test("reflexo: responder antes do disparo cancela o timer pendente (sem sobrar timer perdido)", () => {
  const clock = fakeClock();
  const scheduler = fakeScheduler();
  const challenges = createArenaChallenges({
    now: clock.now,
    random: seeded(6),
    setTimeoutFn: scheduler.setTimeoutFn,
    clearTimeoutFn: scheduler.clearTimeoutFn,
  });
  const issued = issueUntil(challenges, "reflex");
  assert.equal(scheduler.pendingCount(), 1);
  challenges.submit(issued.challengeId, { tapped: true }); // tocou cedo demais
  assert.equal(scheduler.pendingCount(), 0, "o timer do go não deveria continuar pendente depois de já ter sido respondido");
});

test("stop() cancela todos os timers pendentes", () => {
  const clock = fakeClock();
  const scheduler = fakeScheduler();
  const challenges = createArenaChallenges({
    now: clock.now,
    random: seeded(7),
    setTimeoutFn: scheduler.setTimeoutFn,
    clearTimeoutFn: scheduler.clearTimeoutFn,
  });
  issueUntil(challenges, "reflex");
  challenges.stop();
  assert.equal(scheduler.pendingCount(), 0);
});

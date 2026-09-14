// Regressão de concorrência: 30 pessoas (1 professor + 29 alunos) numa sala
// só, de verdade — cria conta, entra, dá heartbeat, começa a prova e
// termina, tudo em paralelo onde faz sentido (entrada e término). Não usa
// Playwright de propósito: o que importa aqui é HTTP/SQLite sob
// concorrência, não a interface — puro fetch() contra um servidor em
// processo (mesmo padrão de scripts/check-competitive.mjs).
import assert from "node:assert/strict";
import { createApp } from "../server/server.mjs";

const CLASS_SIZE = 30; // 1 professor + 29 alunos
const RESPONSE_BUDGET_MS = 2000; // teto generoso pra cada chamada individual

const app = createApp(":memory:");
await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + app.server.address().port;

async function call(path, token, body, method) {
  const startedAt = Date.now();
  const r = await fetch(base + path, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  return { status: r.status, data, ms: Date.now() - startedAt };
}

function assertFast(result, label) {
  assert.ok(
    result.ms <= RESPONSE_BUDGET_MS,
    `${label} levou ${result.ms}ms, acima do teto de ${RESPONSE_BUDGET_MS}ms`,
  );
}

try {
  const t0 = Date.now();

  const host = (await call("/v1/guests", null, { name: "Professor" })).data;
  const roomResult = await call("/v1/rooms", host.token, {
    mode: "math",
    capacity: CLASS_SIZE,
    public: false,
    format: "md1",
  });
  assert.equal(roomResult.status, 201, JSON.stringify(roomResult.data));
  const room = roomResult.data;
  assert.equal(room.capacity, CLASS_SIZE);

  // 29 alunos criam conta em sequência (rajada real de IP único — Ticket 31
  // também subiu o limite de /v1/guests pra 40/min exatamente pra isso).
  const students = [];
  for (let i = 0; i < CLASS_SIZE - 1; i++) {
    const g = await call("/v1/guests", null, { name: "Aluno" + i });
    assert.equal(g.status, 201, `criação da conta do aluno ${i} falhou: ${JSON.stringify(g.data)}`);
    students.push(g.data);
  }

  // Entram todos ao mesmo tempo — é isso que estressa concorrência de
  // verdade (contagem de capacidade, inserção em room_members).
  const joins = await Promise.all(
    students.map((s) => call(`/v1/rooms/${room.code}/join`, s.token, {})),
  );
  joins.forEach((j, i) => {
    assert.equal(j.status, 200, `entrada do aluno ${i} falhou: ${JSON.stringify(j.data)}`);
    assertFast(j, `entrada do aluno ${i}`);
  });

  const everyone = [host, ...students];
  const heartbeats = await Promise.all(
    everyone.map((p) => call(`/v1/rooms/${room.code}/heartbeat`, p.token, {})),
  );
  heartbeats.forEach((h) => assert.equal(h.status, 200, JSON.stringify(h.data)));

  const roomAfterJoins = (await call(`/v1/rooms/${room.code}`, host.token)).data;
  assert.equal(roomAfterJoins.members.length, CLASS_SIZE, "todo mundo deveria ter entrado");

  const started = await call(`/v1/rooms/${room.code}/start`, host.token, {});
  assert.equal(started.status, 200, JSON.stringify(started.data));

  // room.starts = agora+5000 (server/rooms.mjs) — espera de verdade a
  // largada acontecer, é tempo real, não um relógio falso.
  await new Promise((r) => setTimeout(r, 5300));

  const finishes = await Promise.all(
    everyone.map((p) => call(`/v1/rooms/${room.code}/finish`, p.token, { answers: [] })),
  );
  finishes.forEach((f, i) => {
    assert.equal(f.status, 200, `término do membro ${i} falhou: ${JSON.stringify(f.data)}`);
    assertFast(f, `término do membro ${i}`);
  });

  const final = (await call(`/v1/rooms/${room.code}`, host.token)).data;
  assert.equal(final.members.length, CLASS_SIZE);
  assert.equal(final.state, "finished");
  assert.ok(
    final.members.every((m) => m.score !== null),
    "todo mundo deveria ter uma pontuação registrada",
  );

  const elapsedMs = Date.now() - t0;
  console.log(
    `PASS: ${CLASS_SIZE} membros (1 professor + ${CLASS_SIZE - 1} alunos) criaram conta, entraram, jogaram e terminaram uma sala real em ${elapsedMs}ms.`,
  );
} finally {
  await new Promise((r) => app.server.close(r));
  app.db.close();
}

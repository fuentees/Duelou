import test from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { createApp } from "./server.mjs";
import { attachArenaRealtime } from "./arena-ws.mjs";

// Teste de integração de ponta a ponta de verdade: servidor HTTP real
// escutando numa porta, dois clientes WebSocket reais, tempo real (não dá
// pra usar relógio/scheduler falso aqui — o motor autoritativo roda num
// setInterval de verdade). Por isso a partida usa durationSeconds bem
// curto, só pra terminar rápido dentro do teste.
async function withServer(fn) {
  const app = createApp(":memory:", Date.now);
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const port = app.server.address().port;
  const realtime = attachArenaRealtime(app.server, app.db, Date.now, {
    countdownMs: 50,
    durationSeconds: 3,
  });
  const base = "http://127.0.0.1:" + port;
  const wsBase = "ws://127.0.0.1:" + port;
  const call = async (path, token, body, method) => {
    const r = await fetch(base + path, {
      method: method || (body ? "POST" : "GET"),
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, data: await r.json() };
  };
  try {
    await fn({ app, call, wsBase });
  } finally {
    realtime.stop();
    await new Promise((r) => app.server.close(r));
    app.db.close();
  }
}

function connect(wsBase, token) {
  return new WebSocket(`${wsBase}/v1/arena-realtime?token=${token}`);
}

function collect(ws) {
  const messages = [];
  ws.on("message", (raw) => messages.push(JSON.parse(raw.toString())));
  return messages;
}

function waitFor(messages, type, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const check = () => {
      const found = messages.find((m) => m.type === type);
      if (found) return resolve(found);
      if (Date.now() > deadline)
        return reject(new Error(`timeout esperando mensagem "${type}"`));
      setTimeout(check, 15);
    };
    check();
  });
}

function answerWhateverComesFirst(ws, challengeMsg) {
  const matchId = challengeMsg.matchId;
  const payload =
    challengeMsg.challenge.kind === "reflex"
      ? { type: "answer", matchId, challengeId: challengeMsg.challengeId, tapped: true }
      : { type: "answer", matchId, challengeId: challengeMsg.challengeId, index: 0 };
  ws.send(JSON.stringify(payload));
}

test("PvP via WebSocket: dois jogadores reais emparelham, jogam e o resultado fica gravado", async () => {
  await withServer(async ({ app, call, wsBase }) => {
    const a = (await call("/v1/guests", null, { name: "Alice" })).data;
    const b = (await call("/v1/guests", null, { name: "Bob" })).data;

    const wsA = connect(wsBase, a.token);
    const wsB = connect(wsBase, b.token);
    await Promise.all([
      new Promise((resolve, reject) => {
        wsA.once("open", resolve);
        wsA.once("error", reject);
      }),
      new Promise((resolve, reject) => {
        wsB.once("open", resolve);
        wsB.once("error", reject);
      }),
    ]);
    const msgsA = collect(wsA);
    const msgsB = collect(wsB);

    wsA.send(JSON.stringify({ type: "queue" }));
    await waitFor(msgsA, "queued");
    wsB.send(JSON.stringify({ type: "queue" }));

    const foundA = await waitFor(msgsA, "matchFound");
    const foundB = await waitFor(msgsB, "matchFound");
    assert.equal(foundA.opponent.name, "Bob");
    assert.equal(foundB.opponent.name, "Alice");
    assert.notEqual(foundA.you, foundB.you, "os dois lados têm que ser diferentes");
    const matchId = foundA.matchId;
    assert.equal(foundB.matchId, matchId);

    const challengeA = await waitFor(msgsA, "challenge");
    const challengeB = await waitFor(msgsB, "challenge");
    assert.equal("answerIndex" in (challengeA.challenge ?? {}), false, "gabarito não pode vazar pro cliente");

    answerWhateverComesFirst(wsA, challengeA);
    answerWhateverComesFirst(wsB, challengeB);
    await waitFor(msgsA, "answerResult");
    await waitFor(msgsB, "answerResult");

    // Confirma que o motor está de fato rodando (broadcasts de estado
    // chegando pros dois, não só o eco da própria resposta).
    await waitFor(msgsA, "state");
    await waitFor(msgsB, "state");

    // durationSeconds:3 no withServer() — a partida termina sozinha.
    const overA = await waitFor(msgsA, "matchOver", 8000);
    const overB = await waitFor(msgsB, "matchOver", 8000);
    assert.equal(overA.matchId, matchId);
    assert.equal(overA.winner, overB.winner);

    const row = app.db.prepare("SELECT * FROM arena_matches WHERE id=?").get(matchId);
    assert.ok(row, "a partida deveria ter sido gravada em arena_matches");
    assert.equal([a.profile.id, b.profile.id].includes(row.player_a), true);
    assert.equal([a.profile.id, b.profile.id].includes(row.player_b), true);

    wsA.close();
    wsB.close();
  });
});

test("conexão sem token (ou com token inválido) é rejeitada no handshake", async () => {
  await withServer(async ({ wsBase }) => {
    const ws = connect(wsBase, "token-que-nao-existe");
    const closeCode = await new Promise((resolve) => {
      ws.once("unexpected-response", (_req, res) => resolve(res.statusCode));
      ws.once("close", (code) => resolve(code));
      ws.once("open", () => resolve("open-inesperado"));
    });
    assert.notEqual(closeCode, "open-inesperado", "não deveria conseguir conectar sem sessão válida");
  });
});

test("mensagem 'answer' referenciando desafio de outro jogador é rejeitada", async () => {
  await withServer(async ({ call, wsBase }) => {
    const a = (await call("/v1/guests", null, { name: "Alice2" })).data;
    const b = (await call("/v1/guests", null, { name: "Bob2" })).data;
    const wsA = connect(wsBase, a.token);
    const wsB = connect(wsBase, b.token);
    await Promise.all([
      new Promise((r) => wsA.once("open", r)),
      new Promise((r) => wsB.once("open", r)),
    ]);
    const msgsA = collect(wsA);
    const msgsB = collect(wsB);
    wsA.send(JSON.stringify({ type: "queue" }));
    await waitFor(msgsA, "queued");
    wsB.send(JSON.stringify({ type: "queue" }));
    const foundA = await waitFor(msgsA, "matchFound");
    const challengeA = await waitFor(msgsA, "challenge");

    // Bob tenta responder o desafio que foi emitido pra Alice.
    wsB.send(
      JSON.stringify({
        type: "answer",
        matchId: foundA.matchId,
        challengeId: challengeA.challengeId,
        index: 0,
      }),
    );
    const err = await waitFor(msgsB, "error");
    assert.match(err.message, /não é seu|expirou/);

    wsA.close();
    wsB.close();
  });
});

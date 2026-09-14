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
async function withServer(fn, options = {}) {
  const app = createApp(":memory:", Date.now);
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const port = app.server.address().port;
  const realtime = attachArenaRealtime(app.server, app.db, Date.now, {
    countdownMs: 50,
    durationSeconds: 3,
    reconnectGraceMs: 300,
    ...options,
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
    assert.equal(foundA.me.name, "Alice", "matchFound também traz o próprio nome/avatar, não só o do adversário");
    assert.equal(foundB.me.name, "Bob");
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

test("fechar a conexão sem reconectar: opponentDisconnected primeiro, depois matchOver por timeout de reconexão", async () => {
  await withServer(async ({ app, call, wsBase }) => {
    const a = (await call("/v1/guests", null, { name: "Alice3" })).data;
    const b = (await call("/v1/guests", null, { name: "Bob3" })).data;
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
    const foundB = await waitFor(msgsB, "matchFound");

    // Alice cai (fecha a conexão) e nunca mais volta.
    wsA.close();

    const disconnected = await waitFor(msgsB, "opponentDisconnected");
    assert.equal(disconnected.matchId, foundA.matchId);
    assert.ok(disconnected.expiresAt > Date.now(), "expiresAt deveria ser no futuro");

    // withServer usa reconnectGraceMs:300 — bem menor que o padrão de
    // produção (20s), só pra este teste não demorar.
    const over = await waitFor(msgsB, "matchOver", 3000);
    // Bob é "enemy" (ver protocolo: quem chama startMatch(opponent, uid)
    // passa quem emparelhou primeiro como side "player") — o importante é
    // que quem ficou (Bob) seja sempre o vencedor, não um lado fixo.
    assert.equal(over.winner, foundB.you);

    const row = app.db.prepare("SELECT * FROM arena_matches WHERE id=?").get(foundA.matchId);
    assert.equal(row.reason, "disconnect_timeout");

    wsB.close();
  });
});

test("reconectar dentro do prazo resume a partida sem passar pela fila de novo", async () => {
  await withServer(async ({ call, wsBase }) => {
    const a = (await call("/v1/guests", null, { name: "AliceReconnect" })).data;
    const b = (await call("/v1/guests", null, { name: "BobReconnect" })).data;
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
    await waitFor(msgsB, "matchFound");

    wsA.close();
    await waitFor(msgsB, "opponentDisconnected");

    // Reconecta com o mesmo token, bem dentro da janela de 300ms. collect()
    // logo após connect() (antes de esperar "open") — matchResumed chega
    // automaticamente assim que a conexão é aceita, sem esperar nenhuma
    // mensagem do cliente; um listener registrado depois desse instante
    // perderia a mensagem.
    const wsA2 = connect(wsBase, a.token);
    const msgsA2 = collect(wsA2);
    await new Promise((r) => wsA2.once("open", r));
    wsA2.send(JSON.stringify({ type: "queue" })); // reflexo do cliente de verdade

    const resumed = await waitFor(msgsA2, "matchResumed");
    assert.equal(resumed.matchId, foundA.matchId);
    assert.equal(resumed.you, foundA.you);
    assert.ok(resumed.state, "matchResumed deveria trazer o estado atual da partida");
    // O "queue" reflexo não deveria ter jogado a Alice numa fila/partida nova.
    assert.equal(msgsA2.some((m) => m.type === "matchFound"), false);

    // O desafio que a Alice tinha em mãos antes de cair ficou órfão (o
    // socket antigo já era) — sem um novo, ela ficaria olhando pro campo de
    // batalha sem nada pra responder até a partida acabar sozinha.
    const resumedChallenge = await waitFor(msgsA2, "challenge");
    assert.equal(resumedChallenge.matchId, foundA.matchId);

    await waitFor(msgsB, "opponentReconnected");

    // Passa bem da janela de reconexão (300ms) sem ninguém ser desistido —
    // prova que resumeMatch() realmente cancelou o forfeit agendado.
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(msgsA2.some((m) => m.type === "matchOver"), false);
    assert.equal(msgsB.some((m) => m.type === "matchOver"), false);

    wsA2.close();
    wsB.close();
  });
});

test("fechar 1 de 2 abas da mesma conta não afeta a partida (nem faz o outro lado ficar mudo)", async () => {
  await withServer(async ({ call, wsBase }) => {
    const a = (await call("/v1/guests", null, { name: "AliceDuasAbas" })).data;
    const b = (await call("/v1/guests", null, { name: "BobDuasAbas" })).data;
    const wsA1 = connect(wsBase, a.token);
    const wsB = connect(wsBase, b.token);
    await Promise.all([
      new Promise((r) => wsA1.once("open", r)),
      new Promise((r) => wsB.once("open", r)),
    ]);
    const msgsA1 = collect(wsA1);
    const msgsB = collect(wsB);
    wsA1.send(JSON.stringify({ type: "queue" }));
    await waitFor(msgsA1, "queued");
    wsB.send(JSON.stringify({ type: "queue" }));
    await waitFor(msgsA1, "matchFound");
    await waitFor(msgsB, "matchFound");

    // Alice abre uma segunda aba (mesma conta) e fecha a primeira. collect()
    // logo após connect() — matchResumed chega assim que a conexão é
    // aceita, antes de qualquer "open"/mensagem do cliente.
    const wsA2 = connect(wsBase, a.token);
    const msgsA2 = collect(wsA2);
    await new Promise((r) => wsA2.once("open", r));
    await waitFor(msgsA2, "matchResumed");
    wsA1.close();

    // Ninguém deveria ver opponentDisconnected — ainda sobra a aba 2.
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(msgsB.some((m) => m.type === "opponentDisconnected"), false);

    // E a partida continua "falando" com Bob (broadcasts de "state" não
    // pararam) — prova que fechar 1 de 2 abas não deixa a partida muda.
    const stateCountBefore = msgsB.filter((m) => m.type === "state").length;
    await new Promise((r) => setTimeout(r, 300));
    const stateCountAfter = msgsB.filter((m) => m.type === "state").length;
    assert.ok(stateCountAfter > stateCountBefore, "broadcasts de state deveriam continuar chegando");

    wsA2.close();
    wsB.close();
  });
});

test("mensagem 'forfeit' referenciando uma partida da qual não se participa é ignorada sem quebrar nada", async () => {
  await withServer(async ({ call, wsBase }) => {
    const stranger = (await call("/v1/guests", null, { name: "Estranho" })).data;
    const ws = connect(wsBase, stranger.token);
    await new Promise((r) => ws.once("open", r));
    const msgs = collect(ws);
    ws.send(JSON.stringify({ type: "forfeit", matchId: "partida-que-nao-existe" }));
    // Não deveria travar nem fechar a conexão — confere que ainda responde.
    ws.send(JSON.stringify({ type: "queue" }));
    await waitFor(msgs, "queued");
    ws.close();
  });
});

test("uma quinta conexão (acima do limite por conta) é rejeitada no handshake", async () => {
  await withServer(async ({ call, wsBase }) => {
    const p = (await call("/v1/guests", null, { name: "MuitasAbas" })).data;
    const ws1 = connect(wsBase, p.token);
    const ws2 = connect(wsBase, p.token);
    await Promise.all([
      new Promise((r) => ws1.once("open", r)),
      new Promise((r) => ws2.once("open", r)),
    ]);
    const ws3 = connect(wsBase, p.token);
    const rejected = await new Promise((resolve) => {
      ws3.once("unexpected-response", (_req, res) => resolve(res.statusCode));
      ws3.once("close", () => resolve("closed"));
      ws3.once("open", () => resolve("open-inesperado"));
    });
    assert.notEqual(rejected, "open-inesperado", "a terceira conexão simultânea deveria ser rejeitada");
    ws1.close();
    ws2.close();
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

test("conta excluída (DELETE /v1/me) em partida ativa não derruba o servidor pros outros jogadores", async () => {
  await withServer(async ({ app, call, wsBase }) => {
    const a = (await call("/v1/guests", null, { name: "AliceExcluida" })).data;
    const b = (await call("/v1/guests", null, { name: "BobSobrevive" })).data;
    const wsA = connect(wsBase, a.token);
    const wsB = connect(wsBase, b.token);
    await Promise.all([
      new Promise((r) => wsA.once("open", r)),
      new Promise((r) => wsB.once("open", r)),
    ]);
    const msgsB = collect(wsB);
    wsA.send(JSON.stringify({ type: "queue" }));
    await new Promise((r) => setTimeout(r, 100));
    wsB.send(JSON.stringify({ type: "queue" }));
    await waitFor(msgsB, "matchFound");

    // Alice exclui a própria conta (rota real, /v1/me) enquanto ainda está
    // na partida — cenário que derrubava o servidor inteiro antes da
    // correção em server/arena-persistence.mjs (FOREIGN KEY não tratado).
    const deleted = await call("/v1/me", a.token, undefined, "DELETE");
    assert.equal(deleted.status, 200);
    wsA.close();

    // Bob deveria ganhar por desistência (Alice "caiu" e nunca reconecta,
    // já que a conta nem existe mais) sem o servidor cair — se tivesse
    // caído, esta chamada HTTP comum já falharia.
    await waitFor(msgsB, "opponentDisconnected");
    await waitFor(msgsB, "matchOver", 3000);
    const health = await call("/health", null);
    assert.equal(health.status, 200, "servidor deveria continuar respondendo normalmente");

    wsB.close();
  });
});

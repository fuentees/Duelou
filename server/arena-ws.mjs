// Ligação por WebSocket do PvP da Arena Rush — combina fila (arena-queue),
// motor autoritativo (arena-match), desafios anti-trapaça (arena-challenges)
// e histórico (arena-persistence) através de um socket persistente, único
// jeito de ter o boneco andando liso em vez de "aos pulos" (o resto do app
// usa só polling HTTP, mas isso não dá conta de uma partida sub-segundo).
//
// Não toca em server/competitive.mjs, server/rooms.mjs nem
// shared/competition.mjs — matchmaking, partidas e histórico daqui são
// inteiramente independentes (ver arena-queue.mjs e arena-persistence.mjs).

import { WebSocketServer } from "ws";
import { randomUUID, createHash } from "node:crypto";
import { readAvatar } from "../shared/avatar.mjs";
import { rateLimiter } from "./rate-limit.mjs";
import { createArenaChallenges } from "./arena-challenges.mjs";
import { createArenaMatchEngine } from "./arena-match.mjs";
import { createArenaPersistence } from "./arena-persistence.mjs";
import { createArenaQueue } from "./arena-queue.mjs";
import { createArenaRating } from "./arena-rating.mjs";
import { createLatencyTracker } from "./arena-latency.mjs";
import { RECONNECT_GRACE_MS } from "../shared/arena/reconnect.ts";
import { levelForElapsed } from "../shared/arena/deck.ts";

const hash = (t) => createHash("sha256").update(t).digest("hex");
const PATH = "/v1/arena-realtime";
// Duas abas/dispositivos no máximo por conta — não impede jogar em outro
// lugar, só evita alguém abrir sockets sem limite (a cota por minuto do
// rate limiter já existe, isso é sobre quantas conexões ficam abertas ao
// mesmo tempo).
const MAX_SOCKETS_PER_PLAYER = 2;
// De quanto em quanto tempo o servidor mede a rede de cada conexão. Usa o
// ping/pong do próprio protocolo WebSocket: o navegador (e o React Native)
// respondem sozinhos, sem nenhuma mensagem nova do lado do cliente.
const PING_INTERVAL_MS = 4000;
// De quanto em quanto tempo a fila tenta juntar quem já está esperando. O
// pareamento por nota tem janela que abre com o tempo (ver arena-queue.mjs);
// sem essa varredura, duas pessoas de notas distantes ficariam paradas pra
// sempre só porque ninguém novo entrou depois delas.
const QUEUE_SWEEP_MS = 2000;

export function attachArenaRealtime(server, db, clock = Date.now, options = {}) {
  const {
    countdownMs = 3000,
    durationSeconds = 100,
    reconnectGraceMs = RECONNECT_GRACE_MS,
  } = options;

  const wss = new WebSocketServer({ noServer: true });
  const limitRequest = rateLimiter(clock);
  const challenges = createArenaChallenges({ now: clock });
  const matches = createArenaMatchEngine({ now: clock, durationSeconds });
  const persistence = createArenaPersistence(db, clock);
  const rating = createArenaRating(db, clock);
  const queue = createArenaQueue({ now: clock });
  const latency = createLatencyTracker();

  const socketsByPlayer = new Map(); // uid -> Set<ws>
  const matchSockets = new Map(); // matchId -> Map(uid -> ws)
  const activeMatchOf = new Map(); // uid -> matchId, só enquanto em partida/contagem
  const challengeOwner = new Map(); // challengeId -> { matchId, uid } (tamper guard)
  const disconnectTimers = new Map(); // uid -> { matchId, handle } (grace period pendente)

  function playerRow(uid) {
    return db.prepare("SELECT id,name,avatar FROM players WHERE id=?").get(uid);
  }

  function send(ws, type, payload) {
    if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type, ...payload }));
  }

  function broadcastToMatch(matchId, type, payload) {
    const sockets = matchSockets.get(matchId);
    if (!sockets) return;
    for (const ws of sockets.values()) send(ws, type, payload);
  }

  function issueNextChallenge(matchId, uid) {
    const match = matches.getMatch(matchId);
    if (!match || match.ended) return;
    const side = match.sideOf.get(uid);
    const ws = matchSockets.get(matchId)?.get(uid);
    if (!side || !ws) return;
    // Índice no baralho da partida: quantos desafios esse lado já respondeu.
    // O nível NÃO vem daí — vem do relógio da partida, igual pros dois lados
    // (ver shared/arena/deck.ts): quem está jogando melhor não pode receber
    // perguntas mais difíceis que o adversário só por estar na frente.
    const index = match.state.stats[side].challengesTotal;
    const level = levelForElapsed(durationSeconds - match.state.timeRemaining, durationSeconds);
    const { challengeId, public: pub } = challenges.issue({ matchId, index, level }, (cid) => {
      // "Vai!" do reflexo: o cliente nunca sabe waitMs de antemão (ver
      // comentário em arena-challenges.mjs), então é esse aviso em tempo
      // real que diz o momento certo de trocar "ESPERE…" por "TOQUE!".
      send(ws, "reflexGo", { matchId, challengeId: cid });
    });
    challengeOwner.set(challengeId, { matchId, uid });
    send(ws, "challenge", { matchId, challengeId, challenge: pub });
  }

  function finishMatch(matchId, { state, winner, reason }) {
    const match = matches.getMatch(matchId);
    if (!match) return; // já processado (ver nota em handleForfeit)
    for (const [cid, owner] of challengeOwner) {
      if (owner.matchId === matchId) {
        challenges.discard(cid);
        challengeOwner.delete(cid);
      }
    }
    for (const [pendingUid, entry] of disconnectTimers) {
      if (entry.matchId === matchId) {
        clearTimeout(entry.handle);
        disconnectTimers.delete(pendingUid);
      }
    }
    const [playerAId, playerBId] = match.playerIds;
    const winnerUid = winner === "player" ? playerAId : winner === "enemy" ? playerBId : null;
    persistence.recordMatch({
      matchId,
      playerA: playerAId,
      playerB: playerBId,
      winner: winnerUid,
      durationSeconds: Math.round(durationSeconds - state.timeRemaining),
      finalPlayerHp: state.playerBaseHp,
      finalEnemyHp: state.enemyBaseHp,
      reason,
    });
    // Classificação da Arena (tabela própria — nada de Elo competitivo, ver
    // server/arena-rating.mjs). Em try/catch como todo o resto daqui: uma
    // linha que não pôde ser gravada não pode derrubar o processo e, com
    // ele, a partida de todo mundo que está conectado.
    let deltas = null;
    try {
      deltas = rating.applyResult({
        playerA: playerAId,
        playerB: playerBId,
        winner: winnerUid,
        combos: {
          [playerAId]: state.stats.player.maxCombo,
          [playerBId]: state.stats.enemy.maxCombo,
        },
      });
    } catch (e) {
      console.warn(
        JSON.stringify({ event: "arena_rating_failed", matchId, error: e?.message }),
      );
    }
    const sockets = matchSockets.get(matchId);
    for (const uid of match.playerIds)
      send(sockets?.get(uid), "matchOver", {
        matchId,
        winner,
        state,
        rating: deltas?.[uid] ?? null,
      });
    for (const uid of match.playerIds) activeMatchOf.delete(uid);
    matchSockets.delete(matchId);
    matches.endMatch(matchId);
  }

  matches.on("tick", ({ matchId, state }) => {
    broadcastToMatch(matchId, "state", { matchId, state });
  });
  matches.on("matchOver", ({ matchId, state, winner, reason }) =>
    finishMatch(matchId, { state, winner, reason }),
  );

  function startMatch(uidA, uidB) {
    const matchId = randomUUID();
    const startsAt = clock() + countdownMs;
    matches.createMatch(matchId, uidA, uidB, startsAt);
    activeMatchOf.set(uidA, matchId);
    activeMatchOf.set(uidB, matchId);
    const sockets = new Map();
    matchSockets.set(matchId, sockets);
    for (const uid of [uidA, uidB]) {
      const ws = [...(socketsByPlayer.get(uid) || [])][0];
      if (ws) sockets.set(uid, ws);
    }
    const a = playerRow(uidA);
    const b = playerRow(uidB);
    const meA = { id: a.id, name: a.name, avatar: readAvatar(a.avatar) };
    const meB = { id: b.id, name: b.name, avatar: readAvatar(b.avatar) };
    // Manda o próprio avatar/nome junto (não só o do adversário) — evita a
    // tela ter que depender de um perfil carregado à parte só pra saber
    // "quem sou eu" na revelação do confronto (Ticket 24).
    send(sockets.get(uidA), "matchFound", {
      matchId,
      you: "player",
      me: meA,
      opponent: meB,
      startsAt,
    });
    send(sockets.get(uidB), "matchFound", {
      matchId,
      you: "enemy",
      me: meB,
      opponent: meA,
      startsAt,
    });
    setTimeout(() => {
      issueNextChallenge(matchId, uidA);
      issueNextChallenge(matchId, uidB);
    }, countdownMs);
  }

  function ratingOf(uid) {
    try {
      return rating.statsFor(uid).rating;
    } catch {
      // Sem ficha (banco indisponível, conta recém-criada em corrida), o
      // jogador entra como mediano em vez de ficar de fora da fila.
      return 1000;
    }
  }

  function handleQueue(ws, uid) {
    if (activeMatchOf.has(uid))
      return send(ws, "error", { message: "Você já está em uma partida." });
    limitRequest(`arena_queue:${uid}`, 20);
    const result = queue.join(uid, ratingOf(uid));
    if (!result.paired) return send(ws, "queued", {});
    startMatch(result.opponent, uid);
  }

  function handleAnswer(ws, uid, msg) {
    limitRequest(`arena_answer:${uid}`, 120);
    const { matchId, challengeId } = msg;
    if (typeof matchId !== "string" || typeof challengeId !== "string")
      return send(ws, "error", { message: "Mensagem de resposta inválida." });
    const owner = challengeOwner.get(challengeId);
    if (!owner || owner.matchId !== matchId || owner.uid !== uid)
      return send(ws, "error", { message: "Esse desafio não é seu ou já expirou." });
    challengeOwner.delete(challengeId);
    const match = matches.getMatch(matchId);
    if (!match || match.ended)
      return send(ws, "error", { message: "Essa partida não está mais ativa." });
    const submission = msg.tapped ? { tapped: true } : { index: msg.index };
    const result = challenges.submit(challengeId, submission);
    if (!result) return send(ws, "error", { message: "Desafio desconhecido ou já respondido." });
    // O relógio de quem mede continua sendo o do servidor (anti-trapaça),
    // mas descontando a viagem da rede: sem isso, quem joga com 150ms de
    // latência aparece 150ms mais lento e quase nunca alcança o limiar de
    // "resposta rápida" (ver server/arena-latency.mjs).
    const applied = matches.applyAnswer(matchId, uid, {
      ...result,
      elapsedMs: latency.compensate(uid, result.elapsedMs),
    });
    send(ws, "answerResult", {
      matchId,
      challengeId,
      correct: result.correct,
      troopType: applied?.troopType ?? null,
      // false + correct:true = acertou, mas a pista está no teto de tropas.
      // O cliente avisa em vez de deixar o acerto sumir sem explicação.
      spawned: applied?.spawned ?? false,
    });
    issueNextChallenge(matchId, uid);
  }

  function handleForfeit(uid, msg) {
    const matchId = msg?.matchId;
    const match = typeof matchId === "string" ? matches.getMatch(matchId) : null;
    if (!match || match.ended || !match.sideOf.has(uid)) return;
    matches.forfeit(matchId, match.sideOf.get(uid), "forfeit");
  }

  /**
   * Chamado quando o socket de `uid` cai (aba fechada, app derrubado, sem
   * internet). Decisão revisada pelo usuário (Ticket 39 — reverte o Ticket
   * 20): em vez de desistência na hora, a partida pausa (matches.pauseMatch,
   * congela sozinho) e espera `reconnectGraceMs` por uma reconexão antes de
   * desistir de verdade. `opponentDisconnected` avisa o outro lado com o
   * prazo; se `uid` reconectar a tempo (ver wss.on("connection")), o timer é
   * cancelado e a partida retoma de onde parou.
   */
  function handleDisconnect(uid) {
    // Ainda tem outra aba/dispositivo da mesma conta conectado — não é uma
    // queda de verdade (bug corrigido de brinde: antes, fechar 1 de 2 abas
    // já derrubava a partida inteira).
    if (socketsByPlayer.get(uid)?.size) return;
    const matchId = activeMatchOf.get(uid);
    if (!matchId) return;
    const match = matches.getMatch(matchId);
    if (!match || match.ended) return;

    matches.pauseMatch(matchId);
    const remainingUid = match.playerIds.find((id) => id !== uid);
    send(matchSockets.get(matchId)?.get(remainingUid), "opponentDisconnected", {
      matchId,
      expiresAt: clock() + reconnectGraceMs,
    });
    const handle = setTimeout(() => {
      disconnectTimers.delete(uid);
      const stillActive = matches.getMatch(matchId);
      if (!stillActive || stillActive.ended) return;
      matches.forfeit(matchId, stillActive.sideOf.get(uid), "disconnect_timeout");
    }, reconnectGraceMs);
    disconnectTimers.set(uid, { matchId, handle });
  }

  /**
   * Chamado quando uma conexão nova chega de um uid que já tinha uma
   * partida ativa — religa o socket nela (o cliente reflexivamente manda
   * "queue" ao abrir, mas isso vira só um erro inofensivo já que
   * activeMatchOf continua marcado). Se havia um timer de desistência
   * pendente pra esse uid especificamente, cancela e retoma a partida.
   */
  function tryResumeMatch(uid, ws) {
    const matchId = activeMatchOf.get(uid);
    if (!matchId) return;
    const match = matches.getMatch(matchId);
    if (!match || match.ended) return;
    matchSockets.get(matchId)?.set(uid, ws);

    const pending = disconnectTimers.get(uid);
    const opponentUid = match.playerIds.find((id) => id !== uid);
    if (pending) {
      clearTimeout(pending.handle);
      disconnectTimers.delete(uid);
      matches.resumeMatch(matchId);
      send(matchSockets.get(matchId)?.get(opponentUid), "opponentReconnected", { matchId });
    }
    const opponentRow = playerRow(opponentUid);
    send(ws, "matchResumed", {
      matchId,
      you: match.sideOf.get(uid),
      opponent: { id: opponentRow.id, name: opponentRow.name, avatar: readAvatar(opponentRow.avatar) },
      state: match.state,
    });
    // O desafio que "uid" tinha em mãos antes de cair ficou órfão (a
    // resposta dele, se algum dia chegar, não tem mais socket vivo pra
    // devolver o resultado) — sem isso, quem reconecta fica olhando pro
    // campo de batalha sem nada pra responder até a partida acabar sozinha.
    issueNextChallenge(matchId, uid);
  }

  function handleMessage(ws, uid, msg) {
    if (!msg || typeof msg.type !== "string")
      return send(ws, "error", { message: "Mensagem inválida." });
    switch (msg.type) {
      case "queue":
        return handleQueue(ws, uid);
      case "leaveQueue":
        return queue.leave(uid);
      case "answer":
        return handleAnswer(ws, uid, msg);
      case "forfeit":
        return handleForfeit(uid, msg);
      default:
        return send(ws, "error", { message: "Tipo de mensagem desconhecido." });
    }
  }

  // Um timer só pra todas as conexões — mede a rede de cada uma e devolve o
  // número pro próprio jogador ver ("seu ping"), como qualquer jogo
  // competitivo faz.
  const pingTimer = setInterval(() => {
    for (const [uid, sockets] of socketsByPlayer) {
      for (const ws of sockets) {
        if (ws.readyState !== ws.OPEN) continue;
        try {
          ws.ping(String(clock()));
        } catch (e) {
          console.warn(JSON.stringify({ event: "arena_ping_failed", uid, error: e?.message }));
        }
      }
    }
  }, PING_INTERVAL_MS);
  pingTimer.unref?.();

  const sweepTimer = setInterval(() => {
    try {
      for (const [a, b] of queue.sweep()) {
        // Alguém pode ter fechado a aba entre a varredura e agora: sem os
        // dois sockets vivos, devolve quem sobrou pra fila em vez de criar
        // uma partida contra ninguém.
        const aliveA = socketsByPlayer.get(a)?.size;
        const aliveB = socketsByPlayer.get(b)?.size;
        if (aliveA && aliveB) startMatch(a, b);
        else if (aliveA) queue.join(a, ratingOf(a));
        else if (aliveB) queue.join(b, ratingOf(b));
      }
    } catch (e) {
      console.warn(JSON.stringify({ event: "arena_queue_sweep_failed", error: e?.message }));
    }
  }, QUEUE_SWEEP_MS);
  sweepTimer.unref?.();

  wss.on("connection", (ws, req, uid) => {
    ws.uid = uid;
    if (!socketsByPlayer.has(uid)) socketsByPlayer.set(uid, new Set());
    socketsByPlayer.get(uid).add(ws);
    ws.on("pong", (data) => {
      try {
        const sentAt = Number(data?.toString());
        if (!Number.isFinite(sentAt)) return;
        const rttMs = clock() - sentAt;
        latency.record(uid, rttMs);
        send(ws, "latency", { rttMs: Math.round(rttMs) });
      } catch (e) {
        // Igual aos outros listeners deste arquivo: um erro solto aqui
        // derrubaria o processo inteiro e, com ele, a partida de todo mundo.
        console.warn(JSON.stringify({ event: "arena_pong_failed", uid, error: e?.message }));
      }
    });
    try {
      ws.ping(String(clock()));
    } catch {}
    try {
      tryResumeMatch(uid, ws);
    } catch (e) {
      console.warn(JSON.stringify({ event: "arena_resume_failed", uid, error: e?.message }));
    }

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return send(ws, "error", { message: "JSON inválido." });
      }
      try {
        handleMessage(ws, uid, msg);
      } catch (e) {
        send(ws, "error", { message: e?.status ? e.message : "Erro interno." });
      }
    });

    ws.on("close", () => {
      socketsByPlayer.get(uid)?.delete(ws);
      const remaining = socketsByPlayer.get(uid);
      if (remaining?.size === 0) socketsByPlayer.delete(uid);

      // Essa era a conexão "oficial" da partida (quem recebe os broadcasts
      // de "state"/"challenge"), mas ainda sobra outra aba dessa mesma
      // conta — repassa a referência pra ela, senão a partida ficaria muda
      // pra esse jogador mesmo sem ele ter caído de verdade.
      const matchId = activeMatchOf.get(uid);
      if (matchId && remaining?.size) {
        const sockets = matchSockets.get(matchId);
        if (sockets?.get(uid) === ws) sockets.set(uid, [...remaining][0]);
      }

      queue.leave(uid);
      if (!remaining?.size) latency.forget(uid);
      try {
        handleDisconnect(uid);
      } catch (e) {
        // Nunca deixa um erro aqui derrubar o processo — isso fecharia a
        // conexão de todo mundo, não só desse jogador (mesmo espírito do
        // try/catch em "message" acima).
        console.warn(JSON.stringify({ event: "arena_disconnect_failed", uid, error: e?.message }));
      }
    });
  });

  function rejectUpgrade(socket, status, message) {
    const body = JSON.stringify({ message });
    socket.write(
      `HTTP/1.1 ${status} Error\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`,
    );
    socket.destroy();
  }

  function onUpgrade(req, socket, head) {
    let url;
    try {
      url = new URL(req.url, "http://local");
    } catch {
      socket.destroy();
      return;
    }
    if (url.pathname !== PATH) {
      socket.destroy();
      return;
    }
    const token = url.searchParams.get("token");
    const now = clock();
    const player =
      token &&
      db
        .prepare("SELECT id FROM players WHERE token=? AND token_expires>?")
        .get(hash(token), now);
    if (!player) return rejectUpgrade(socket, 401, "Sessão inválida.");
    try {
      limitRequest(`arena_connect:${player.id}`, 30);
    } catch (e) {
      return rejectUpgrade(socket, e.status || 429, e.message);
    }
    if ((socketsByPlayer.get(player.id)?.size ?? 0) >= MAX_SOCKETS_PER_PLAYER)
      return rejectUpgrade(socket, 429, "Muitas conexões abertas ao mesmo tempo.");
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req, player.id);
    });
  }

  server.on("upgrade", onUpgrade);

  function stop() {
    clearInterval(pingTimer);
    clearInterval(sweepTimer);
    latency.stop();
    server.removeListener("upgrade", onUpgrade);
    for (const sockets of socketsByPlayer.values())
      for (const ws of sockets) ws.terminate();
    for (const { handle } of disconnectTimers.values()) clearTimeout(handle);
    disconnectTimers.clear();
    matches.stop();
    challenges.stop();
    wss.close();
  }

  return { stop };
}

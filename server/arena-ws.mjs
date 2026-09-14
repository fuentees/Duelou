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

const hash = (t) => createHash("sha256").update(t).digest("hex");
const PATH = "/v1/arena-realtime";
// Duas abas/dispositivos no máximo por conta — não impede jogar em outro
// lugar, só evita alguém abrir sockets sem limite (a cota por minuto do
// rate limiter já existe, isso é sobre quantas conexões ficam abertas ao
// mesmo tempo).
const MAX_SOCKETS_PER_PLAYER = 2;

export function attachArenaRealtime(server, db, clock = Date.now, options = {}) {
  const { countdownMs = 3000, durationSeconds = 100 } = options;

  const wss = new WebSocketServer({ noServer: true });
  const limitRequest = rateLimiter(clock);
  const challenges = createArenaChallenges({ now: clock });
  const matches = createArenaMatchEngine({ now: clock, durationSeconds });
  const persistence = createArenaPersistence(db, clock);
  const queue = createArenaQueue();

  const socketsByPlayer = new Map(); // uid -> Set<ws>
  const matchSockets = new Map(); // matchId -> Map(uid -> ws)
  const activeMatchOf = new Map(); // uid -> matchId, só enquanto em partida/contagem
  const challengeOwner = new Map(); // challengeId -> { matchId, uid } (tamper guard)

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
    const difficulty = match.state.stats[side].challengesTotal;
    const { challengeId, public: pub } = challenges.issue(uid, difficulty, (cid) => {
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
    broadcastToMatch(matchId, "matchOver", { matchId, winner, state });
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

  function handleQueue(ws, uid) {
    if (activeMatchOf.has(uid))
      return send(ws, "error", { message: "Você já está em uma partida." });
    limitRequest(`arena_queue:${uid}`, 20);
    const result = queue.join(uid);
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
    const applied = matches.applyAnswer(matchId, uid, result);
    send(ws, "answerResult", {
      matchId,
      challengeId,
      correct: result.correct,
      troopType: applied?.troopType ?? null,
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
   * internet). Decisão já tomada com o usuário: sem tolerância — o outro
   * lado vence na hora. `opponentLeft` avisa a queda antes do `matchOver`
   * (disparado por matches.forfeit -> o listener "matchOver" já registrado)
   * trazer o resultado.
   */
  function handleDisconnect(uid) {
    const matchId = activeMatchOf.get(uid);
    if (!matchId) return;
    const match = matches.getMatch(matchId);
    if (!match || match.ended) return;
    const remainingUid = match.playerIds.find((id) => id !== uid);
    send(matchSockets.get(matchId)?.get(remainingUid), "opponentLeft", { matchId });
    matches.forfeit(matchId, match.sideOf.get(uid), "disconnect");
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

  wss.on("connection", (ws, req, uid) => {
    ws.uid = uid;
    if (!socketsByPlayer.has(uid)) socketsByPlayer.set(uid, new Set());
    socketsByPlayer.get(uid).add(ws);

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
      if (socketsByPlayer.get(uid)?.size === 0) socketsByPlayer.delete(uid);
      queue.leave(uid);
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
    server.removeListener("upgrade", onUpgrade);
    for (const sockets of socketsByPlayer.values())
      for (const ws of sockets) ws.terminate();
    matches.stop();
    challenges.stop();
    wss.close();
  }

  return { stop };
}

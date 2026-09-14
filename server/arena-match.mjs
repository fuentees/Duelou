// Motor autoritativo do PvP da Arena Rush — roda shared/arena/engine.ts (o
// mesmo motor do modo offline contra bot) num timer só, cobrindo todas as
// partidas ativas, e aplica as respostas dos dois jogadores de verdade via
// spawn(). Não guarda nada em SQLite (ver server/arena-persistence.mjs pro
// resultado final) nem sabe nada de WebSocket (ver server/arena-ws.mjs) —
// só orquestra o estado da partida em memória.

import {
  FAST_CHOICE_MS,
  FAST_REFLEX_MS,
  createArenaState,
  decideTroopType,
  spawn,
  step,
} from "../shared/arena/engine.ts";

const DEFAULT_TICK_MS = 67; // ~15Hz — ver justificativa no plano (Ticket 16)
const DEFAULT_DURATION_SECONDS = 100;

export function createArenaMatchEngine({
  tickMs = DEFAULT_TICK_MS,
  durationSeconds = DEFAULT_DURATION_SECONDS,
  now = Date.now,
  random = Math.random,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
} = {}) {
  const matches = new Map(); // matchId -> { state, sideOf, playerIds, startsAt, ended }
  const listeners = { tick: new Set(), matchOver: new Set() };

  function emit(event, payload) {
    for (const fn of listeners[event]) fn(payload);
  }

  function on(event, fn) {
    listeners[event]?.add(fn);
    return () => listeners[event]?.delete(fn);
  }

  /**
   * Registra uma nova partida entre dois jogadores de verdade. Quem é
   * "player"/"enemy" no motor é arbitrário (nunca surge pro cliente sem
   * passar pela inversão de perspectiva do Ticket 21) — só importa que os
   * dois ids fiquem mapeados pro lado certo aqui dentro. `startsAt` (padrão:
   * agora mesmo) deixa a partida "pausada" até esse instante, pro tempo de
   * revelação/contagem do Ticket 19 sem o motor já processando tropas.
   */
  function createMatch(matchId, playerAId, playerBId, startsAt = now()) {
    const state = createArenaState(durationSeconds);
    const sideOf = new Map([
      [playerAId, "player"],
      [playerBId, "enemy"],
    ]);
    matches.set(matchId, {
      state,
      sideOf,
      playerIds: [playerAId, playerBId],
      startsAt,
      ended: false,
      paused: false,
    });
    return { matchId, startsAt };
  }

  function getMatch(matchId) {
    return matches.get(matchId) ?? null;
  }

  /**
   * Pausa/retoma uma partida (Ticket 39: dá tempo de quem caiu reconectar
   * sem perder na hora). tickAll() simplesmente pula partidas pausadas — o
   * dt de cada tick é sempre fixo (tickMs/1000, nunca calculado a partir do
   * relógio de verdade), então "não chamar step()" já congela timeRemaining
   * e as tropas sozinho, sem precisar de nenhuma lógica extra de retomada.
   */
  function pauseMatch(matchId) {
    const match = matches.get(matchId);
    if (!match || match.ended) return false;
    match.paused = true;
    return true;
  }

  function resumeMatch(matchId) {
    const match = matches.get(matchId);
    if (!match || match.ended) return false;
    match.paused = false;
    return true;
  }

  function sideOfPlayer(matchId, uid) {
    return matches.get(matchId)?.sideOf.get(uid) ?? null;
  }

  /**
   * Aplica a resposta de um jogador — espelha exatamente a regra de
   * src/arena/ArenaScreen.tsx (handleAnswer), só que por lado em vez de
   * hardcoded em "player", pra não divergir do que já foi validado offline.
   * Devolve null se a partida não existe/já acabou ou o uid não participa
   * dela; senão `{ troopType }` (null quando errou, não invoca nada).
   */
  function applyAnswer(matchId, uid, { correct, elapsedMs, kind }) {
    const match = matches.get(matchId);
    if (!match || match.ended) return null;
    const side = match.sideOf.get(uid);
    if (!side) return null;

    const state = match.state;
    state.stats[side].challengesTotal++;
    if (!correct) {
      state.combo[side] = 0;
      return { troopType: null };
    }
    state.combo[side]++;
    state.stats[side].maxCombo = Math.max(state.stats[side].maxCombo, state.combo[side]);
    const fast = kind === "reflex" ? elapsedMs < FAST_REFLEX_MS : elapsedMs < FAST_CHOICE_MS;
    const troopType = decideTroopType(fast, state.combo[side]);
    spawn(state, side, troopType);
    state.stats[side].hits++;
    return { troopType };
  }

  /**
   * Encerra a partida por desistência — o lado oposto a `loserSide` vence
   * na hora (decisão do usuário: sem tolerância de reconexão, ver Ticket 20).
   */
  function forfeit(matchId, loserSide, reason = "forfeit") {
    const match = matches.get(matchId);
    if (!match || match.ended) return null;
    match.state.over = true;
    match.state.winner = loserSide === "player" ? "enemy" : "player";
    match.ended = true;
    const result = { matchId, state: match.state, winner: match.state.winner, reason };
    emit("matchOver", result);
    return result;
  }

  function endMatch(matchId) {
    const match = matches.get(matchId);
    if (match) match.ended = true;
    matches.delete(matchId);
  }

  function tickAll() {
    const nowMs = now();
    for (const [matchId, match] of matches) {
      if (match.ended || match.paused || nowMs < match.startsAt) continue;
      const events = step(match.state, tickMs / 1000, random);
      emit("tick", { matchId, state: match.state, events });
      if (match.state.over) {
        match.ended = true;
        emit("matchOver", {
          matchId,
          state: match.state,
          winner: match.state.winner,
          reason: "played",
        });
      }
    }
  }

  const interval = setIntervalFn(tickAll, tickMs);

  function stop() {
    clearIntervalFn(interval);
    matches.clear();
  }

  return {
    createMatch,
    getMatch,
    sideOfPlayer,
    applyAnswer,
    forfeit,
    pauseMatch,
    resumeMatch,
    endMatch,
    on,
    tickAll, // exposto pra teste disparar manualmente com scheduler falso
    stop,
  };
}

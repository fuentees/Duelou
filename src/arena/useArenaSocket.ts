import { useCallback, useEffect, useRef, useState } from "react";
import { WS_URL, getSessionToken } from "../api";
import type { ArenaState, Side, TroopType } from "../../shared/arena/engine";
import type { PublicArenaChallenge } from "./challenges";
import { toViewerPerspective } from "./perspective";
import { applyPatch, flipPatch } from "../../shared/arena/statePatch";
import { RECONNECT_BACKOFF_MS, RECONNECT_GRACE_MS } from "../../shared/arena/reconnect";

export type ArenaOpponent = { id: string; name: string; avatar: unknown };
export type ArenaSocketPhase =
  | "connecting"
  | "queued"
  | "matchFound"
  | "playing"
  | "reconnecting"
  | "ended"
  | "error";
export type AnswerSubmission = { index: number } | { tapped: true };
// Quanto a nota da Arena mudou nessa partida (server/arena-rating.mjs).
export type ArenaRatingDelta = { before: number; after: number; delta: number };
// Estado do convite de revanche, na tela de resultado:
// "offered" = o adversário chamou e está esperando você;
// "waiting" = você chamou e está esperando ele;
// "declined" = não vai rolar (ele saiu ou o prazo acabou).
export type ArenaRematchState = "idle" | "offered" | "waiting" | "declined";
// Como esta conexão começou: fila normal, criando um convite pra um amigo ou
// entrando no convite de alguém.
export type ArenaIntent =
  | { type: "queue" }
  | { type: "host" }
  | { type: "join"; code: string };
export type ArenaAnswerFeedback = {
  seq: number;
  correct: boolean;
  troopType: TroopType | null;
  // false com correct=true: acertou, mas a pista já estava no teto de tropas.
  spawned: boolean;
  // "combo" = invocação avulsa pedida pelo jogador (gastar combo), não
  // resposta de desafio — o aviso na tela é outro.
  source: "answer" | "combo";
};

// Conecta na Arena Rush online (server/arena-ws.mjs) e entra na fila
// automaticamente ao abrir — quem usa esse hook já decidiu "quero um
// duelo ao vivo agora" (a escolha de modo acontece antes, ver Ticket 25).
// Cada "state" recebido já sai daqui na perspectiva de quem está jogando
// (toViewerPerspective, Ticket 21) — quem usa o hook nunca vê "player"/
// "enemy" cru do motor, só "eu"/"adversário".
//
// Ticket 40: se a conexão cair sem ter sido uma saída deliberada (Menu/
// Desistir), tenta reconectar sozinho com backoff, até RECONNECT_GRACE_MS
// (mesmo prazo que o servidor usa pra não desistir da partida — ver
// server/arena-ws.mjs). Reconectar dentro da janela, numa partida já em
// andamento, recebe "matchResumed" do servidor em vez de cair na fila de
// novo.
export default function useArenaSocket(intent: ArenaIntent = { type: "queue" }) {
  const [phase, setPhase] = useState<ArenaSocketPhase>("connecting");
  const [matchId, setMatchId] = useState<string | null>(null);
  const [you, setYou] = useState<Side | null>(null);
  const [me, setMe] = useState<ArenaOpponent | null>(null);
  const [opponent, setOpponent] = useState<ArenaOpponent | null>(null);
  const [state, setState] = useState<ArenaState | null>(null);
  const [challenge, setChallenge] = useState<PublicArenaChallenge | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<{ correct: boolean } | null>(null);
  const [reflexGo, setReflexGo] = useState(false);
  const [winner, setWinner] = useState<Side | "draw" | null>(null);
  // true enquanto o adversário está caído mas ainda dentro do prazo de
  // reconexão dele — diferente de opponentLeft (final: ele nunca voltou).
  const [opponentReconnecting, setOpponentReconnecting] = useState(false);
  const [opponentLeft, setOpponentLeft] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  // Tempo de ida e volta medido pelo servidor (ping/pong do protocolo). Só
  // informativo: quem desconta a rede do tempo de resposta é o servidor,
  // nunca o cliente (ver server/arena-latency.mjs).
  const [rttMs, setRttMs] = useState<number | null>(null);
  // Último veredito com o que ele produziu em campo — a tela usa isso pro
  // retorno imediato ("Tanque invocado", "pista cheia"). `seq` existe porque
  // dois acertos seguidos idênticos precisam disparar o aviso duas vezes.
  const [lastAnswer, setLastAnswer] = useState<ArenaAnswerFeedback | null>(null);
  const [ratingDelta, setRatingDelta] = useState<ArenaRatingDelta | null>(null);
  // Instante local (não o do servidor, que o cliente não tem) em que a
  // partida começa — a tela de revelação conta até lá.
  const [countdownEndsAt, setCountdownEndsAt] = useState<number | null>(null);
  const [rematch, setRematch] = useState<ArenaRematchState>("idle");
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [friendly, setFriendly] = useState(false);
  // A intenção é lida dentro dos handlers do socket (montados uma vez por
  // conexão), então precisa de referência — e ela também vale na reconexão.
  const intentRef = useRef(intent);
  intentRef.current = intent;
  const lastMatchIdRef = useRef<string | null>(null);
  const answerSeqRef = useRef(0);

  // Espelham o estado mais recente pra uso dentro de closures que não são
  // recriadas a cada render (os handlers do socket, montados uma vez por
  // conexão) — sem isso, cairia em stale closure.
  const phaseRef = useRef<ArenaSocketPhase>("connecting");
  const youRef = useRef<Side | null>(null);
  const matchIdRef = useRef<string | null>(null);
  const challengeIdRef = useRef<string | null>(null);
  const opponentReconnectingRef = useRef(false);
  // Último estado recebido, já na perspectiva de quem está vendo a tela. Os
  // patches do servidor (ver shared/arena/statePatch.ts) são aplicados em
  // cima dele — um retrato completo chega de tempos em tempos e realinha
  // tudo, então nunca se acumula diferença por muito tempo.
  const stateRef = useRef<ArenaState | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  // Referência estável de connect(), definida dentro do efeito — permite
  // reconectNow() (fora do efeito) disparar uma tentativa nova sem duplicar
  // a lógica de abrir socket/registrar handlers.
  const connectRef = useRef<() => void>(() => {});
  // true só depois de uma saída deliberada (disconnect()/desmontar) — o
  // onclose não deveria tentar reconectar depois disso.
  const intentionalCloseRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const reconnectDeadlineRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setPhaseBoth = (next: ArenaSocketPhase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  useEffect(() => {
    let cancelled = false;

    function scheduleReconnect() {
      if (cancelled || intentionalCloseRef.current) return;
      // Partida já resolvida — não tem sentido reconectar, só ficaria
      // girando roleta sem ninguém do outro lado.
      if (phaseRef.current === "ended") return;
      const now = Date.now();
      if (reconnectDeadlineRef.current === null) {
        reconnectDeadlineRef.current = now + RECONNECT_GRACE_MS;
      }
      if (now >= reconnectDeadlineRef.current) {
        setErrorMessage("Não foi possível reconectar. Verifique sua internet.");
        setPhaseBoth("error");
        return;
      }
      setPhaseBoth("reconnecting");
      const attempt = reconnectAttemptRef.current++;
      const delay = RECONNECT_BACKOFF_MS[Math.min(attempt, RECONNECT_BACKOFF_MS.length - 1)];
      reconnectTimerRef.current = setTimeout(connect, delay);
    }

    function connect() {
      if (cancelled) return;
      const token = getSessionToken();
      const ws = new WebSocket(
        `${WS_URL}/v1/arena-realtime?token=${encodeURIComponent(token)}`,
      );
      wsRef.current = ws;

      // Cada handler confere que `ws` ainda é o socket ativo antes de agir —
      // evita que um evento tardio de um socket já substituído (ex.: um
      // reconnectNow() fechando o antigo pra abrir um novo na hora) dispare
      // lógica de retry duplicada.
      const isCurrent = () => wsRef.current === ws;

      ws.onopen = () => {
        if (cancelled || !isCurrent()) return;
        reconnectAttemptRef.current = 0;
        reconnectDeadlineRef.current = null;
        // Numa partida já em andamento o servidor responde com "matchResumed"
        // e ignora isso — mandar a intenção original de novo é inofensivo e
        // cobre o caso de a queda ter acontecido antes de qualquer partida.
        const current = intentRef.current;
        if (current.type === "host") ws.send(JSON.stringify({ type: "createInvite" }));
        else if (current.type === "join")
          ws.send(JSON.stringify({ type: "joinInvite", code: current.code }));
        else ws.send(JSON.stringify({ type: "queue" }));
        // Convite não passa pela fila, então nunca chega um "queued" do
        // servidor — sem isso a tela ficaria em "Conectando…" o tempo todo
        // da espera, que é justamente quando o código precisa aparecer.
        if (current.type !== "queue" && phaseRef.current === "connecting")
          setPhaseBoth("queued");
      };
      ws.onerror = () => {
        // onclose sempre vem em seguida numa falha de conexão — só ele
        // decide o que fazer, pra não duplicar a lógica de retry aqui.
      };
      ws.onclose = () => {
        if (cancelled || !isCurrent()) return;
        scheduleReconnect();
      };
      ws.onmessage = (event) => {
        if (cancelled || !isCurrent()) return;
        let msg: any;
        try {
          msg = JSON.parse(String(event.data));
        } catch {
          return;
        }
        switch (msg.type) {
          case "queued":
            setPhaseBoth("queued");
            break;
          case "matchFound":
            youRef.current = msg.you;
            matchIdRef.current = msg.matchId;
            lastMatchIdRef.current = msg.matchId;
            setInviteCode(null);
            setFriendly(!!msg.friendly);
            stateRef.current = null;
            // Uma revanche é uma partida nova: limpa o campo, o placar e o
            // convite da anterior antes da revelação.
            setRematch("idle");
            setState(null);
            setWinner(null);
            setRatingDelta(null);
            setOpponentLeft(false);
            setChallenge(null);
            setYou(msg.you);
            setMatchId(msg.matchId);
            setMe(msg.me);
            setOpponent(msg.opponent);
            setCountdownEndsAt(
              Date.now() + (typeof msg.countdownMs === "number" ? msg.countdownMs : 3000),
            );
            setPhaseBoth("matchFound");
            break;
          case "matchResumed":
            // Reconectou numa partida que já estava rolando — restaura tudo
            // de uma vez, sem passar pela revelação/contagem de novo.
            youRef.current = msg.you;
            matchIdRef.current = msg.matchId;
            opponentReconnectingRef.current = false;
            setYou(msg.you);
            setMatchId(msg.matchId);
            setOpponent(msg.opponent);
            setOpponentReconnecting(false);
            if (msg.state) {
              const resumed = toViewerPerspective(msg.state, msg.you);
              stateRef.current = resumed;
              setState(resumed);
            }
            setPhaseBoth("playing");
            break;
          case "challenge":
            challengeIdRef.current = msg.challengeId;
            setChallenge(msg.challenge);
            setChallengeId(msg.challengeId);
            setVerdict(null);
            setReflexGo(false);
            setPhaseBoth(phaseRef.current === "matchFound" ? "playing" : phaseRef.current);
            break;
          case "reflexGo":
            if (msg.challengeId === challengeIdRef.current) setReflexGo(true);
            break;
          case "answerResult":
            if (msg.challengeId === challengeIdRef.current) {
              setVerdict({ correct: msg.correct });
              setLastAnswer({
                seq: ++answerSeqRef.current,
                correct: !!msg.correct,
                troopType: msg.troopType ?? null,
                spawned: !!msg.spawned,
                source: "answer",
              });
            }
            break;
          case "state":
            if (youRef.current) {
              const fresh = toViewerPerspective(msg.state, youRef.current);
              stateRef.current = fresh;
              setState(fresh);
            }
            break;
          case "statePatch": {
            const current = stateRef.current;
            // Patch antes do primeiro retrato completo não tem em que ser
            // aplicado — o próximo retrato (a cada ~2s) resolve.
            if (!current || !youRef.current || !msg.patch) break;
            const patched = applyPatch(
              current,
              youRef.current === "enemy" ? flipPatch(msg.patch) : msg.patch,
            );
            stateRef.current = patched;
            setState(patched);
            break;
          }
          case "opponentDisconnected":
            opponentReconnectingRef.current = true;
            setOpponentReconnecting(true);
            break;
          case "opponentReconnected":
            opponentReconnectingRef.current = false;
            setOpponentReconnecting(false);
            break;
          case "matchOver":
            if (youRef.current) {
              const last = toViewerPerspective(msg.state, youRef.current);
              stateRef.current = last;
              setState(last);
            }
            setWinner(msg.winner);
            setRatingDelta(msg.rating ?? null);
            // Se o adversário ainda estava com a reconexão pendente quando a
            // partida acabou, foi o timeout dele que decidiu — equivalente
            // ao antigo "opponentLeft" (Ticket 20), só que agora é uma
            // conclusão, não uma reação instantânea.
            if (opponentReconnectingRef.current) setOpponentLeft(true);
            setPhaseBoth("ended");
            break;
          case "inviteCreated":
            setInviteCode(msg.code ?? null);
            break;
          case "inviteExpired":
            setInviteCode(null);
            break;
          case "rematchPending":
            setRematch("waiting");
            break;
          case "rematchRequested":
            setRematch("offered");
            break;
          case "rematchDeclined":
            setRematch("declined");
            break;
          case "comboSpent":
            setLastAnswer({
              seq: ++answerSeqRef.current,
              correct: true,
              troopType: "tank",
              spawned: !!msg.spent,
              source: "combo",
            });
            break;
          case "latency":
            if (typeof msg.rttMs === "number") setRttMs(msg.rttMs);
            break;
          case "error":
            setErrorMessage(typeof msg.message === "string" ? msg.message : "Erro desconhecido.");
            break;
        }
      };
    }

    connectRef.current = connect;
    connect();

    return () => {
      cancelled = true;
      intentionalCloseRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, []);

  const submitAnswer = useCallback((payload: AnswerSubmission) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== ws.OPEN || !matchIdRef.current || !challengeIdRef.current)
      return;
    ws.send(
      JSON.stringify({
        type: "answer",
        matchId: matchIdRef.current,
        challengeId: challengeIdRef.current,
        ...payload,
      }),
    );
  }, []);

  const forfeit = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === ws.OPEN && matchIdRef.current)
      ws.send(JSON.stringify({ type: "forfeit", matchId: matchIdRef.current }));
  }, []);

  // Pedido de "gastar combo" — quem valida se há combo suficiente é sempre o
  // servidor (ver spendCombo em shared/arena/engine.ts); aqui é só o pedido.
  const useCombo = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === ws.OPEN && matchIdRef.current)
      ws.send(JSON.stringify({ type: "useCombo", matchId: matchIdRef.current }));
  }, []);

  // "Revanche" na tela de resultado: reencontra o mesmo adversário sem passar
  // pela fila. Vale nota igual a qualquer partida — é uma partida de verdade.
  const askRematch = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== ws.OPEN || !lastMatchIdRef.current) return;
    setRematch("waiting");
    ws.send(JSON.stringify({ type: "rematch", matchId: lastMatchIdRef.current }));
  }, []);

  const leaveQueue = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "leaveQueue" }));
  }, []);

  // Saída deliberada (botão Menu, por exemplo) — nunca deve tentar
  // reconectar depois disso.
  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    wsRef.current?.close();
  }, []);

  // Botão manual de "Tentar novamente" depois de phase==="error" — reseta o
  // orçamento de tentativas e reconecta na hora, sem esperar o backoff.
  const reconnectNow = useCallback(() => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectAttemptRef.current = 0;
    reconnectDeadlineRef.current = null;
    setErrorMessage("");
    setPhaseBoth("connecting");
    wsRef.current?.close();
    connectRef.current();
  }, []);

  // "Jogar outra" na tela de resultado: volta pra fila sem passar pelo menu.
  // Limpa tudo o que era da partida anterior antes de reconectar — senão a
  // próxima busca apareceria com o campo e o placar da partida que acabou.
  const playAgain = useCallback(() => {
    stateRef.current = null;
    setState(null);
    setWinner(null);
    setChallenge(null);
    setChallengeId(null);
    setVerdict(null);
    setReflexGo(false);
    setLastAnswer(null);
    setRatingDelta(null);
    setRematch("idle");
    setOpponent(null);
    setOpponentLeft(false);
    setOpponentReconnecting(false);
    opponentReconnectingRef.current = false;
    youRef.current = null;
    matchIdRef.current = null;
    challengeIdRef.current = null;
    setMatchId(null);
    setYou(null);
    reconnectNow();
  }, [reconnectNow]);


  return {
    phase,
    matchId,
    you,
    me,
    opponent,
    state,
    challenge,
    challengeId,
    verdict,
    reflexGo,
    winner,
    opponentReconnecting,
    opponentLeft,
    errorMessage,
    rttMs,
    countdownEndsAt,
    lastAnswer,
    rematch,
    askRematch,
    inviteCode,
    friendly,
    ratingDelta,
    submitAnswer,
    forfeit,
    useCombo,
    leaveQueue,
    playAgain,
    disconnect,
    reconnectNow,
  };
}

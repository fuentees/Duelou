import { useCallback, useEffect, useRef, useState } from "react";
import { WS_URL, getSessionToken } from "../api";
import type { ArenaState, Side } from "../../shared/arena/engine";
import type { PublicArenaChallenge } from "./challenges";
import { toViewerPerspective } from "./perspective";

export type ArenaOpponent = { id: string; name: string; avatar: unknown };
export type ArenaSocketPhase =
  | "connecting"
  | "queued"
  | "matchFound"
  | "playing"
  | "ended"
  | "error";
export type AnswerSubmission = { index: number } | { tapped: true };

// Conecta na Arena Rush online (server/arena-ws.mjs) e entra na fila
// automaticamente ao abrir — quem usa esse hook já decidiu "quero um
// duelo ao vivo agora" (a escolha de modo acontece antes, ver Ticket 25).
// Cada "state" recebido já sai daqui na perspectiva de quem está jogando
// (toViewerPerspective, Ticket 21) — quem usa o hook nunca vê "player"/
// "enemy" cru do motor, só "eu"/"adversário".
export default function useArenaSocket() {
  const [phase, setPhase] = useState<ArenaSocketPhase>("connecting");
  const [matchId, setMatchId] = useState<string | null>(null);
  const [you, setYou] = useState<Side | null>(null);
  const [opponent, setOpponent] = useState<ArenaOpponent | null>(null);
  const [state, setState] = useState<ArenaState | null>(null);
  const [challenge, setChallenge] = useState<PublicArenaChallenge | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<{ correct: boolean } | null>(null);
  const [reflexGo, setReflexGo] = useState(false);
  const [winner, setWinner] = useState<Side | "draw" | null>(null);
  const [opponentLeft, setOpponentLeft] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  // Espelham o estado mais recente pra uso dentro de closures que não são
  // recriadas a cada render (o handler de mensagem do socket, montado uma
  // única vez) — sem isso, cairia em stale closure e sempre leria o valor
  // do primeiro render.
  const youRef = useRef<Side | null>(null);
  const matchIdRef = useRef<string | null>(null);
  const challengeIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const token = getSessionToken();
    const ws = new WebSocket(
      `${WS_URL}/v1/arena-realtime?token=${encodeURIComponent(token)}`,
    );
    wsRef.current = ws;

    ws.onopen = () => {
      if (cancelled) return;
      ws.send(JSON.stringify({ type: "queue" }));
    };
    ws.onerror = () => {
      if (cancelled) return;
      setErrorMessage("Não foi possível conectar. Verifique sua internet.");
      setPhase("error");
    };
    ws.onclose = () => {
      if (cancelled) return;
      setPhase((prev) => (prev === "ended" ? prev : "error"));
    };
    ws.onmessage = (event) => {
      if (cancelled) return;
      let msg: any;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      switch (msg.type) {
        case "queued":
          setPhase("queued");
          break;
        case "matchFound":
          youRef.current = msg.you;
          matchIdRef.current = msg.matchId;
          setYou(msg.you);
          setMatchId(msg.matchId);
          setOpponent(msg.opponent);
          setPhase("matchFound");
          break;
        case "challenge":
          challengeIdRef.current = msg.challengeId;
          setChallenge(msg.challenge);
          setChallengeId(msg.challengeId);
          setVerdict(null);
          setReflexGo(false);
          setPhase((prev) => (prev === "matchFound" ? "playing" : prev));
          break;
        case "reflexGo":
          if (msg.challengeId === challengeIdRef.current) setReflexGo(true);
          break;
        case "answerResult":
          if (msg.challengeId === challengeIdRef.current)
            setVerdict({ correct: msg.correct });
          break;
        case "state":
          if (youRef.current) setState(toViewerPerspective(msg.state, youRef.current));
          break;
        case "matchOver":
          if (youRef.current) setState(toViewerPerspective(msg.state, youRef.current));
          setWinner(msg.winner);
          setPhase("ended");
          break;
        case "opponentLeft":
          setOpponentLeft(true);
          break;
        case "error":
          setErrorMessage(typeof msg.message === "string" ? msg.message : "Erro desconhecido.");
          break;
      }
    };

    return () => {
      cancelled = true;
      ws.close();
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

  const leaveQueue = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "leaveQueue" }));
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
  }, []);

  return {
    phase,
    matchId,
    you,
    opponent,
    state,
    challenge,
    challengeId,
    verdict,
    reflexGo,
    winner,
    opponentLeft,
    errorMessage,
    submitAnswer,
    forfeit,
    leaveQueue,
    disconnect,
  };
}

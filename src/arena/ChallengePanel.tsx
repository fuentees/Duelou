import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Pressy from "../components/Pressy";
import { arena, palette, radius } from "../theme";
import { ArenaChallenge, PublicArenaChallenge } from "./challenges";

type SubmitPayload = { index: number } | { tapped: true };
// `correct: null` = já respondeu, esperando o veredito chegar (só existe no
// modo online — offline sempre sabe na hora, porque o gabarito está aqui).
type Tapped =
  | { index: number; correct: boolean | null }
  | { reflex: true; correct: boolean | null };

// Componente "burro" de propósito: só mede o tempo de resposta e devolve
// (correto, ms) pra quem chama — a lógica de combo/invocação de tropa mora
// em ArenaScreen, junto do resto do estado da partida (engine.ArenaState já
// tem o combo, não faz sentido duplicar aqui).
//
// Dois modos, escolhidos pela presença de `onSubmit`:
// - offline (onAnswer): o gabarito está no próprio `challenge`, o painel se
//   autocorrige na hora — igual sempre foi.
// - online/PvP (onSubmit + verdict): `challenge` não tem gabarito nem
//   waitMs do reflexo (anti-trapaça, ver server/arena-challenges.mjs) — o
//   painel só manda a resposta e espera o `verdict` chegar de fora (via
//   prop, sem remontar) pra saber se acertou; o "vai!" do reflexo também
//   vem de fora (`reflexGo`), nunca de um timer local.
export default function ChallengePanel({
  challenge,
  onAnswer,
  onSubmit,
  verdict,
  reflexGo,
  dark = false,
}: {
  challenge: ArenaChallenge | PublicArenaChallenge;
  onAnswer?: (correct: boolean, elapsedMs: number) => void;
  onSubmit?: (payload: SubmitPayload, elapsedMs: number) => void;
  verdict?: { correct: boolean } | null;
  reflexGo?: boolean;
  // A partida online roda no tema escuro da arena (ver src/theme.ts); o
  // treino contra o robô continua na tela clara do resto do app.
  dark?: boolean;
}) {
  const online = !!onSubmit;
  const [tapped, setTapped] = useState<Tapped | null>(null);
  const [reflexPhase, setReflexPhase] = useState<"waiting" | "go">("waiting");
  const shownAt = useRef(performance.now());
  const goAt = useRef(0);
  const waitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    shownAt.current = performance.now();
    if (challenge.kind === "reflex") {
      setReflexPhase("waiting");
      // Offline sabe o waitMs de antemão e agenda localmente; online nunca
      // recebe esse valor (ver comentário em server/arena-challenges.mjs) —
      // quem avisa o momento certo é o `reflexGo` vindo de fora.
      if (!online && "waitMs" in challenge) {
        waitTimer.current = setTimeout(() => {
          goAt.current = performance.now();
          setReflexPhase("go");
        }, challenge.waitMs);
      }
    }
    return () => {
      if (waitTimer.current) clearTimeout(waitTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // o componente é remontado a cada novo desafio (key em quem chama)

  // Atualiza o veredito de uma resposta já enviada, sem remontar (o mesmo
  // desafio continua na tela até o próximo chegar).
  useEffect(() => {
    if (!verdict) return;
    setTapped((prev) => (prev ? { ...prev, correct: verdict.correct } : prev));
  }, [verdict]);

  // "Vai!" chegando do servidor (WebSocket) em vez de um timer local.
  useEffect(() => {
    if (online && reflexGo && reflexPhase === "waiting") {
      goAt.current = performance.now();
      setReflexPhase("go");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reflexGo]);

  const answerChoice = (index: number) => {
    if (tapped) return;
    const elapsedMs = performance.now() - shownAt.current;
    if (online) {
      setTapped({ index, correct: null });
      onSubmit!({ index }, elapsedMs);
      return;
    }
    if (challenge.kind !== "choice" || !("answerIndex" in challenge)) return;
    const correct = index === challenge.answerIndex;
    setTapped({ index, correct });
    onAnswer!(correct, elapsedMs);
  };

  const answerReflex = () => {
    if (tapped || challenge.kind !== "reflex") return;
    if (online) {
      const elapsedMs = reflexPhase === "go" ? performance.now() - goAt.current : 0;
      setTapped({ reflex: true, correct: null });
      onSubmit!({ tapped: true }, elapsedMs);
      return;
    }
    if (reflexPhase === "waiting") {
      setTapped({ reflex: true, correct: false });
      onAnswer!(false, 0);
    } else {
      setTapped({ reflex: true, correct: true });
      onAnswer!(true, performance.now() - goAt.current);
    }
  };

  const tone = (correct: boolean | null | undefined) =>
    correct === true ? palette.green : correct === false ? palette.red : "#8A7FF5"; // pendente: nem acerto nem erro

  if (challenge.kind === "reflex") {
    const label = reflexPhase === "go" ? "TOQUE!" : "ESPERE…";
    const pending = tapped && "correct" in tapped && tapped.correct === null;
    return (
      <View style={s.panel}>
        <Pressy
          disabled={!!tapped}
          accessibilityLabel={pending ? `${label} (respondido, aguardando resultado)` : label}
          onPress={answerReflex}
          outerStyle={s.reflexButton}
          style={[
            s.reflexInner,
            {
              backgroundColor:
                tapped && "correct" in tapped
                  ? tone(tapped.correct)
                  : reflexPhase === "go"
                    ? palette.green
                    : "#5B4FE8",
            },
          ]}
        >
          <Text style={s.reflexText}>{label}</Text>
        </Pressy>
      </View>
    );
  }

  return (
    <View style={s.panel}>
      <Text
        style={[
          s.prompt,
          dark ? { color: arena.text } : null,
          // A cor do enunciado é a própria pergunta no jogo "Cor certa" —
          // ela sempre vence o tema.
          challenge.promptColor ? { color: challenge.promptColor } : null,
        ]}
      >
        {challenge.prompt}
      </Text>
      <View style={s.options}>
        {challenge.options.map((opt, i) => {
          const isTapped = tapped && "index" in tapped && tapped.index === i;
          const pending = isTapped && tapped!.correct === null;
          return (
            <Pressy
              key={i}
              disabled={!!tapped}
              accessibilityLabel={
                pending ? `Opção ${i + 1}: ${opt} (respondida, aguardando resultado)` : `Opção ${i + 1}: ${opt}`
              }
              onPress={() => answerChoice(i)}
              outerStyle={s.option}
              style={[
                s.optionInner,
                dark && !challenge.optionColors ? s.optionInnerDark : null,
                challenge.optionColors ? { backgroundColor: challenge.optionColors[i] } : null,
                isTapped ? { backgroundColor: tone(tapped!.correct) } : null,
              ]}
            >
              <Text
                style={[
                  s.optionText,
                  dark && !challenge.optionColors && !isTapped ? { color: arena.text } : null,
                  isTapped ? { color: "#FFFFFF" } : null,
                ]}
              >
                {opt}
              </Text>
            </Pressy>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  panel: { gap: 10 },
  prompt: { fontSize: 24, fontWeight: "900", color: palette.text, textAlign: "center" },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: { flexGrow: 1, flexBasis: "45%" },
  optionInnerDark: { backgroundColor: arena.surfaceAlt, borderWidth: 1, borderColor: arena.border },
  optionInner: {
    // 56 e não 48: é um alvo tocado sob pressão de tempo, com o polegar, e
    // errar a alternativa por causa do tamanho do botão não é dificuldade do
    // jogo, é defeito de tela.
    minHeight: 56,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  optionText: { fontSize: 18, fontWeight: "800", color: palette.text },
  reflexButton: { width: "100%" },
  reflexInner: { minHeight: 96, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  reflexText: { color: "#FFFFFF", fontSize: 20, fontWeight: "900" },
});

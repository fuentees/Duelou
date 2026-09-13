import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Pressy from "../components/Pressy";
import { palette, radius } from "../theme";
import { ArenaChallenge } from "./challenges";

type Tapped = { index: number; correct: boolean } | { reflex: true; correct: boolean };

// Componente "burro" de propósito: só mede o tempo de resposta e devolve
// (correto, ms) pra quem chama — a lógica de combo/invocação de tropa mora
// em ArenaScreen, junto do resto do estado da partida (engine.ArenaState já
// tem o combo, não faz sentido duplicar aqui).
export default function ChallengePanel({
  challenge,
  onAnswer,
}: {
  challenge: ArenaChallenge;
  onAnswer: (correct: boolean, elapsedMs: number) => void;
}) {
  const [tapped, setTapped] = useState<Tapped | null>(null);
  const [reflexPhase, setReflexPhase] = useState<"waiting" | "go">("waiting");
  const shownAt = useRef(performance.now());
  const goAt = useRef(0);
  const waitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    shownAt.current = performance.now();
    if (challenge.kind === "reflex") {
      setReflexPhase("waiting");
      waitTimer.current = setTimeout(() => {
        goAt.current = performance.now();
        setReflexPhase("go");
      }, challenge.waitMs);
    }
    return () => {
      if (waitTimer.current) clearTimeout(waitTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // o componente é remontado a cada novo desafio (key em ArenaScreen)

  const answerChoice = (index: number) => {
    if (tapped || challenge.kind !== "choice") return;
    const correct = index === challenge.answerIndex;
    setTapped({ index, correct });
    onAnswer(correct, performance.now() - shownAt.current);
  };

  const answerReflex = () => {
    if (tapped || challenge.kind !== "reflex") return;
    if (reflexPhase === "waiting") {
      setTapped({ reflex: true, correct: false });
      onAnswer(false, 0);
    } else {
      setTapped({ reflex: true, correct: true });
      onAnswer(true, performance.now() - goAt.current);
    }
  };

  if (challenge.kind === "reflex") {
    const label = reflexPhase === "go" ? "TOQUE!" : "ESPERE…";
    return (
      <View style={s.panel}>
        <Pressy
          disabled={!!tapped}
          accessibilityLabel={label}
          onPress={answerReflex}
          outerStyle={s.reflexButton}
          style={[
            s.reflexInner,
            {
              backgroundColor:
                tapped && "correct" in tapped
                  ? tapped.correct
                    ? palette.green
                    : palette.red
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
        style={[s.prompt, challenge.promptColor ? { color: challenge.promptColor } : null]}
      >
        {challenge.prompt}
      </Text>
      <View style={s.options}>
        {challenge.options.map((opt, i) => {
          const isTapped = tapped && "index" in tapped && tapped.index === i;
          return (
            <Pressy
              key={i}
              disabled={!!tapped}
              accessibilityLabel={`Opção ${i + 1}: ${opt}`}
              onPress={() => answerChoice(i)}
              outerStyle={s.option}
              style={[
                s.optionInner,
                challenge.optionColors ? { backgroundColor: challenge.optionColors[i] } : null,
                isTapped && "correct" in tapped!
                  ? { backgroundColor: tapped!.correct ? palette.green : palette.red }
                  : null,
              ]}
            >
              <Text style={s.optionText}>{opt}</Text>
            </Pressy>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  panel: { gap: 10 },
  prompt: { fontSize: 22, fontWeight: "800", color: palette.text, textAlign: "center" },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: { flexGrow: 1, flexBasis: "45%" },
  optionInner: {
    minHeight: 48,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  optionText: { fontSize: 17, fontWeight: "800", color: palette.text },
  reflexButton: { width: "100%" },
  reflexInner: { minHeight: 96, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  reflexText: { color: "#FFFFFF", fontSize: 20, fontWeight: "900" },
});

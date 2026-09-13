import React, { useEffect, useRef, useState } from "react";
import { Animated, AppState, Easing, Text, View } from "react-native";
import { ArcadeConfig } from "../../shared/arcade.mjs";
import { contrastText, gameColors, palette } from "../theme";
import useReducedMotion from "../useReducedMotion";
import PatternPiece from "./PatternPiece";
import SkillRound from "./SkillRound";
import Pressy from "../components/Pressy";
import { s } from "./styles";

function ChoiceRound({
  config,
  seconds,
  onFinish,
}: {
  config: ArcadeConfig;
  seconds: number;
  onFinish: (answers: number[]) => void;
}) {
  const reducedMotion = useReducedMotion();
  const [answers, setAnswers] = useState<number[]>([]),
    [remaining, setRemaining] = useState(seconds),
    // Só dá pra saber se a resposta está certa na hora quando `answer` vem no
    // config — nas salas online o servidor tira isso antes de mandar (só sabe
    // o placar no fim, senão dava pra ler a resposta certa pelo dev tools).
    // No offline (config sempre completo), mostra o combo em tempo real —
    // sem isso, o bônus de sequência da pontuação era invisível durante o jogo.
    [streak, setStreak] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [gridWidth, setGridWidth] = useState(0);
  const tapping = useRef(false);
  const values = useRef<number[]>([]),
    done = useRef(false),
    deadline = useRef(Date.now() + seconds * 1000);
  const progress = useRef(new Animated.Value(0)).current;
  const comboPop = useRef(new Animated.Value(1)).current;
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onFinish(values.current);
  };
  useEffect(() => {
    const id = setInterval(() => {
      const left = Math.max(
        0,
        Math.ceil((deadline.current - Date.now()) / 1000),
      );
      setRemaining(left);
      if (!left) finish();
    }, 150);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") finish();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, []);
  useEffect(() => {
    tapping.current = false;
  }, [answers.length]);
  const current = config.rounds[answers.length];
  const total = config.rounds.length;
  useEffect(() => {
    if (reducedMotion) {
      progress.stopAnimation();
      progress.setValue(answers.length / total);
      comboPop.stopAnimation();
      comboPop.setValue(1);
      return;
    }
    Animated.timing(progress, {
      toValue: answers.length / total,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => progress.stopAnimation();
  }, [answers.length, reducedMotion]);
  if (!current) return <Text style={s.title}>Concluindo…</Text>;
  const accent = gameColors[config.mode] || gameColors.math;
  const urgent = remaining <= 10;
  return (
    <View style={s.round}>
      <View style={s.row}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={s.eyebrow}>
            RODADA {answers.length + 1} / {total}
          </Text>
          {streak >= 2 && (
            <Animated.View
              style={[s.comboChip, { transform: [{ scale: comboPop }] }]}
            >
              <Text style={s.comboChipText}>🔥 {streak} seguidas</Text>
            </Animated.View>
          )}
        </View>
        <View
          style={[
            s.timerChip,
            urgent && { backgroundColor: "#FFE4E6", borderColor: "#FFB3BA" },
          ]}
        >
          <Text style={[s.timerChipText, urgent && { color: palette.red }]}>
            {remaining}s
          </Text>
        </View>
      </View>
      <View style={s.progress}>
        <Animated.View
          style={[
            s.progressFill,
            {
              backgroundColor: accent[0],
              width: progress.interpolate({
                inputRange: [0, 1],
                outputRange: ["0%", "100%"],
              }),
            },
          ]}
        />
      </View>
      {!!feedback && (
        <Text accessibilityLiveRegion="polite" style={s.caption}>
          {feedback}
        </Text>
      )}
      <Text
        accessibilityLabel={
          current.promptColor
            ? `${current.prompt}. Cor da tinta: ${current.options[current.optionColors?.indexOf(current.promptColor) ?? -1] ?? ""}`
            : current.prompt
        }
        style={[
          s.question,
          current.promptColor
            ? {
                color: current.promptColor,
                backgroundColor: "#172036",
                borderRadius: 12,
                paddingHorizontal: 12,
              }
            : null,
        ]}
      >
        {current.prompt}
      </Text>
      <View
        onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}
        style={[s.grid, config.mode === "odd" && { gap: 6 }]}
      >
        {current.options.map((value, index) => {
          const swatch = current.optionColors?.[index];
          const big = current.options.length >= 16;
          return (
            <Pressy
              key={index}
              accessibilityLabel={`Opção ${index + 1}: ${value}`}
              onPress={() => {
                if (done.current || tapping.current) return;
                tapping.current = true;
                if (typeof current.answer === "number") {
                  const nextStreak = index === current.answer ? streak + 1 : 0;
                  setStreak(nextStreak);
                  setFeedback(
                    index === current.answer
                      ? "Acertou!"
                      : "Resposta: " +
                          current.options[current.answer] +
                          ". " +
                          (current.explanation || ""),
                  );
                  if (nextStreak >= 2 && !reducedMotion) {
                    comboPop.setValue(1.25);
                    Animated.spring(comboPop, {
                      toValue: 1,
                      friction: 4,
                      useNativeDriver: true,
                    }).start();
                  }
                }
                const next = [...values.current, index];
                values.current = next;
                setAnswers(next);
                if (next.length === total) finish();
              }}
              outerStyle={[
                s.option,
                swatch ? { backgroundColor: swatch } : null,
                config.mode === "odd" && {
                  width: gridWidth
                    ? (gridWidth -
                        (Math.sqrt(current.options.length) - 1) * 6) /
                      Math.sqrt(current.options.length)
                    : "14%",
                  minHeight: 44,
                  height: gridWidth
                    ? Math.max(
                        44,
                        Math.min(
                          80,
                          (gridWidth -
                            (Math.sqrt(current.options.length) - 1) * 6) /
                            Math.sqrt(current.options.length),
                        ),
                      )
                    : 44,
                  padding: 0,
                },
              ]}
            >
              {config.mode === "odd" ? (
                <PatternPiece value={String(value)} />
              ) : (
                <Text
                  style={[
                    s.optionText,
                    big && { fontSize: 20 },
                    swatch && String(value).length > 5 && { fontSize: 22 },
                    swatch ? { color: contrastText(swatch) } : null,
                  ]}
                >
                  {value}
                </Text>
              )}
            </Pressy>
          );
        })}
      </View>
      <Text style={s.caption}>
        Uma resposta por rodada. Acertos seguidos aumentam o combo, até 1.000
        pontos.
      </Text>
    </View>
  );
}
export default function Round(props: {
  config: ArcadeConfig;
  seconds: number;
  onFinish: (answers: number[]) => void;
}) {
  return ["timer", "reflex", "aim", "memory"].includes(props.config.mode) ? (
    <SkillRound {...props} />
  ) : (
    <ChoiceRound {...props} />
  );
}

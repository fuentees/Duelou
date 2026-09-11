import React, { useEffect, useRef, useState } from "react";
import { Animated, AppState, Easing, Text, View } from "react-native";
import { ArcadeConfig } from "../../shared/arcade.mjs";
import { contrastText, gameColors, palette } from "../theme";
import Pressy from "../components/Pressy";
import { s } from "./styles";

export default function Round({
  config,
  seconds,
  onFinish,
}: {
  config: ArcadeConfig;
  seconds: number;
  onFinish: (answers: number[]) => void;
}) {
  const [answers, setAnswers] = useState<number[]>([]),
    [remaining, setRemaining] = useState(seconds);
  const values = useRef<number[]>([]),
    done = useRef(false),
    deadline = useRef(Date.now() + seconds * 1000);
  const progress = useRef(new Animated.Value(0)).current;
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
  const current = config.rounds[answers.length];
  const total = config.rounds.length;
  useEffect(() => {
    Animated.timing(progress, {
      toValue: answers.length / total,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [answers.length]);
  if (!current) return <Text style={s.title}>Concluindo…</Text>;
  const accent = gameColors[config.mode] || gameColors.math;
  const urgent = remaining <= 10;
  return (
    <View style={s.round}>
      <View style={s.row}>
        <Text style={s.eyebrow}>
          RODADA {answers.length + 1} / {total}
        </Text>
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
      <Text
        style={[
          s.question,
          current.promptColor ? { color: current.promptColor } : null,
        ]}
      >
        {current.prompt}
      </Text>
      <View style={s.grid}>
        {current.options.map((value, index) => {
          const swatch = current.optionColors?.[index];
          const big =
            current.options.length === 16 || current.options.length === 25;
          return (
            <Pressy
              key={index}
              accessibilityLabel={`Opção ${index + 1}: ${value}`}
              onPress={() => {
                if (done.current) return;
                const next = [...values.current, index];
                values.current = next;
                setAnswers(next);
                if (next.length === total) finish();
              }}
              outerStyle={[
                s.option,
                swatch ? { backgroundColor: swatch } : null,
                config.mode === "odd" && {
                  width:
                    current.options.length === 25
                      ? "18%"
                      : current.options.length === 16
                        ? "22%"
                        : current.options.length === 9
                          ? "30%"
                          : "47%",
                  minHeight:
                    current.options.length === 25
                      ? 44
                      : current.options.length === 16
                        ? 58
                        : 90,
                },
              ]}
            >
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
            </Pressy>
          );
        })}
      </View>
      <Text style={s.caption}>
        Uma resposta por rodada. A pontuação é normalizada em até 1.000.
      </Text>
    </View>
  );
}

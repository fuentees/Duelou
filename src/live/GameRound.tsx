import React, { useEffect, useRef, useState } from "react";
import { Animated, AppState, Pressable, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { gradients, palette, shadow } from "../theme";
import Button from "../components/Button";
import { levelGuide, title, Game } from "./catalog";
import { s } from "./styles";

type Config = {
  game: Game;
  difficulty: number;
  targetMs: number;
  toleranceMs: number;
  hideAfterMs: number | null;
  waitMs: number;
  waits?: number[];
  sequence: number[];
  flashMs: number;
};
type Match = { id: string; config: Config; expires: number };

function ReflexSignal({
  phase,
  children,
}: {
  phase: string;
  children: React.ReactNode;
}) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (phase !== "wait") {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.02,
          duration: 480,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 480,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [phase]);
  return (
    <Animated.View style={{ transform: [{ scale: pulse }] }}>
      {children}
    </Animated.View>
  );
}

export default function GameRound({
  match,
  finish,
}: {
  match: Match;
  finish: (data: object) => void;
}) {
  const c = match.config;
  const [phase, setPhase] = useState("idle"),
    [elapsed, setElapsed] = useState(0),
    [active, setActive] = useState(-1),
    [answers, setAnswers] = useState<number[]>([]);
  const phaseRef = useRef("idle"),
    reactions = useRef<number[]>([]),
    start = useRef(0),
    done = useRef(false),
    alive = useRef(true),
    timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const change = (p: string) => {
    phaseRef.current = p;
    setPhase(p);
  };
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      if (alive.current && !done.current) fn();
    }, ms);
    timers.current.push(id);
  };
  const submit = (data: object) => {
    if (done.current) return;
    done.current = true;
    timers.current.forEach(clearTimeout);
    finish(data);
  };
  useEffect(() => {
    alive.current = true;
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active" && phaseRef.current !== "idle") {
        done.current = true;
        timers.current.forEach(clearTimeout);
        change("interrupted");
      }
    });
    return () => {
      alive.current = false;
      timers.current.forEach(clearTimeout);
      sub.remove();
    };
  }, []);
  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(
      () => setElapsed(performance.now() - start.current),
      30,
    );
    return () => clearInterval(id);
  }, [phase]);
  const armReflex = () => {
    change("wait");
    later(
      () => {
        start.current = performance.now();
        change("go");
      },
      (c.waits || [c.waitMs])[reactions.current.length],
    );
  };
  const reactNow = () => {
    if (phaseRef.current !== "go" || done.current) return;
    reactions.current.push(performance.now() - start.current);
    if (reactions.current.length === (c.waits?.length || 1))
      submit({ reactions: reactions.current });
    else armReflex();
  };
  const begin = () => {
    if (phaseRef.current !== "idle") return;
    if (c.game === "timer") {
      start.current = performance.now();
      change("running");
      later(() => {
        change("timeout");
      }, 30000);
    } else if (c.game === "reflex") {
      armReflex();
    } else {
      change("show");
      let t = 250;
      for (const n of c.sequence) {
        later(() => setActive(n), t);
        t += c.flashMs;
        later(() => setActive(-1), t);
        t += 250;
      }
      later(() => change("answer"), t);
    }
  };
  if (phase === "interrupted" || phase === "timeout")
    return (
      <View style={s.round}>
        <Text style={s.heading}>Partida interrompida</Text>
        <Text style={s.muted}>
          Feche esta tela e inicie uma nova tentativa. Em duelos, retome antes
          do prazo da partida.
        </Text>
      </View>
    );
  const nearTarget =
    c.game === "timer" && Math.abs(elapsed - c.targetMs) < c.toleranceMs / 3;
  return (
    <View style={s.round}>
      <Text style={s.label}>
        DIFICULDADE {c.difficulty} · {title(c.game)}
      </Text>
      {phase === "idle" && (
        <Text style={s.muted}>{levelGuide[c.game][c.difficulty - 1]}</Text>
      )}
      {c.game === "timer" ? (
        <>
          <Text
            style={[
              s.big,
              nearTarget && {
                color: palette.green,
                textShadowColor: palette.green,
                textShadowRadius: 18,
                textShadowOffset: { width: 0, height: 0 },
              },
            ]}
          >
            {c.hideAfterMs && elapsed >= c.hideAfterMs
              ? "?,??"
              : (elapsed / 1000).toFixed(2).replace(".", ",")}
          </Text>
          <Text style={s.muted}>
            {c.hideAfterMs
              ? "O relógio desaparece. Conte o tempo."
              : "Pare o mais perto possível de 5 segundos."}
          </Text>
          <Button
            onPress={() =>
              phaseRef.current === "idle"
                ? begin()
                : submit({ elapsedMs: performance.now() - start.current })
            }
          >
            {phase === "idle" ? "Iniciar" : "Parar relógio"}
          </Button>
        </>
      ) : c.game === "reflex" ? (
        <ReflexSignal phase={phase}>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              phaseRef.current === "idle"
                ? begin()
                : phaseRef.current === "wait"
                  ? submit({ falseStart: true })
                  : phaseRef.current === "go"
                    ? reactNow()
                    : null
            }
          >
            <LinearGradient
              colors={
                phase === "go"
                  ? gradients.success
                  : phase === "wait"
                    ? gradients.danger
                    : (["#D7FF46", "#B8DE2E"] as const)
              }
              style={s.reflex}
            >
              <Text style={s.dark}>
                Rodada{" "}
                {Math.min(reactions.current.length + 1, c.waits?.length || 1)}{" "}
                de {c.waits?.length || 1} · vale a mediana
              </Text>
              <Text style={s.reflexText}>
                {phase === "idle"
                  ? "TOQUE PARA COMEÇAR"
                  : phase === "wait"
                    ? "ESPERE…"
                    : "AGORA!"}
              </Text>
            </LinearGradient>
          </Pressable>
        </ReflexSignal>
      ) : (
        <>
          <Text style={s.heading}>
            {phase === "show"
              ? "Observe"
              : phase === "answer"
                ? "Sua vez"
                : "Memorize " + c.sequence.length + " passos"}
          </Text>
          <View style={s.grid}>
            {["#8C7CFF", "#3DE0D8", "#FF6FA5", "#FFB74D"].map((color, n) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={"Bloco " + (n + 1)}
                disabled={phase !== "answer"}
                key={n}
                style={[
                  s.tile,
                  {
                    backgroundColor: color,
                    opacity: phase === "show" ? (active === n ? 1 : 0.25) : 1,
                  },
                  phase === "show" && active === n && shadow.glow(color),
                ]}
                onPress={() => {
                  if (done.current || phaseRef.current !== "answer") return;
                  const next = [...answers, n];
                  setAnswers(next);
                  if (
                    n !== c.sequence[next.length - 1] ||
                    next.length === c.sequence.length
                  )
                    submit({ answers: next });
                }}
              >
                <Text style={s.tileText}>{n + 1}</Text>
              </Pressable>
            ))}
          </View>
          {phase === "idle" ? (
            <Button onPress={begin}>Mostrar sequência</Button>
          ) : (
            <Text style={s.muted}>
              {answers.length} / {c.sequence.length}
            </Text>
          )}
        </>
      )}
    </View>
  );
}

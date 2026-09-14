import React, { useEffect, useRef, useState } from "react";
import {
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { ArcadeConfig } from "../../shared/arcade.mjs";
import Button from "../components/Button";
import { playTap } from "../audio/sounds";
import { palette, contrastText } from "../theme";

type Phase =
  "ready" | "running" | "wait" | "go" | "between" | "show" | "answer" | "done";
// Tamanho fixo (não %) pra posicionar os alvos em pixels de verdade —
// round.x/y/radius vêm do servidor como unidades virtuais 0-100, sem
// depender do tamanho real da tela (mesma ideia dos outros jogos, em 2D).
const ARENA = 280;
// Quanto tempo o bloco certo fica à mostra depois de um erro na memória.
const MEMORY_REVEAL_MS = 1200;
export default function SkillRound({
  config,
  seconds,
  onFinish,
}: {
  config: ArcadeConfig;
  seconds: number;
  onFinish: (answers: number[]) => void;
}) {
  const ARENA = Math.max(180, Math.min(280, useWindowDimensions().width - 64));
  const [phase, setPhase] = useState<Phase>("ready"),
    [elapsed, setElapsed] = useState(0),
    [active, setActive] = useState(-1),
    [count, setCount] = useState(0),
    [hitTick, setHitTick] = useState(0);
  // Memória: qual bloco era o certo, quando a pessoa erra. Antes a prova
  // simplesmente acabava no toque errado, sem dizer onde foi o tropeço — dava
  // pra repetir o mesmo erro a prova inteira sem nunca saber.
  const [missed, setMissed] = useState<{ picked: number; correct: number; step: number } | null>(null);
  // Mira: toques no vazio. Não contam pontos (a pontuação é do servidor), mas
  // sem isso a pessoa não tinha como saber que estava errando a mira — só que
  // "o alvo sumiu".
  const strayTaps = useRef(0);
  const [strayTick, setStrayTick] = useState(0);
  const phaseRef = useRef<Phase>("ready"),
    answers = useRef<number[]>([]),
    start = useRef(0),
    alive = useRef(true),
    done = useRef(false),
    timers = useRef<ReturnType<typeof setTimeout>[]>([]),
    // Alvo (índice global -> ms desde que nasceu, ou -1 se sumiu sem ser
    // tocado) — cada alvo é independente, não precisa fechar em grupo.
    hits = useRef<Map<number, number>>(new Map());
  const round = config.rounds[Math.min(count, config.rounds.length - 1)];
  const transition = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };
  const finish = () => {
    if (done.current) return;
    if (config.mode === "aim")
      answers.current = config.rounds.map((_, i) => hits.current.get(i) ?? -1);
    done.current = true;
    timers.current.forEach(clearTimeout);
    transition("done");
    onFinish([...answers.current]);
  };
  const later = (fn: () => void, ms: number) => {
    timers.current.push(
      setTimeout(() => {
        if (alive.current && !done.current) fn();
      }, ms),
    );
  };
  useEffect(() => {
    alive.current = true;
    later(finish, Math.max(0, seconds) * 1000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") finish();
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
      16,
    );
    return () => clearInterval(id);
  }, [phase]);
  const begin = () => {
    if (done.current || !["ready", "between"].includes(phaseRef.current))
      return;
    if (config.mode === "timer") {
      start.current = performance.now();
      transition("running");
    } else if (config.mode === "reflex") {
      const attempt = answers.current.length;
      transition("wait");
      later(() => {
        if (phaseRef.current !== "wait" || answers.current.length !== attempt)
          return;
        start.current = performance.now();
        transition("go");
      }, round.waitMs!);
    } else if (config.mode === "aim") {
      hits.current = new Map();
      start.current = performance.now();
      setElapsed(0);
      transition("running");
    } else {
      transition("show");
      let t = 0;
      for (const n of round.sequence!) {
        later(() => setActive(n), t);
        t += round.flashMs!;
        later(() => setActive(-1), t);
        t += 200;
      }
      later(() => transition("answer"), t);
    }
  };
  // Cada alvo tem seu próprio prazo (spawnMs+visMs) — reaproveita o mesmo
  // ticker de 16ms do modo "timer" (useEffect logo acima) pra marcar como
  // perdido (-1) quem sumiu sem ser tocado, sem depender de toque nenhum.
  useEffect(() => {
    if (config.mode !== "aim" || phaseRef.current !== "running") return;
    let changed = false;
    for (let i = 0; i < config.rounds.length; i++) {
      if (hits.current.has(i)) continue;
      const r = config.rounds[i];
      if (elapsed >= r.spawnMs! + r.visMs!) {
        hits.current.set(i, -1);
        changed = true;
      }
    }
    if (changed) setHitTick((t) => t + 1);
    if (hits.current.size >= config.rounds.length) finish();
  }, [elapsed]);
  const tapAimTarget = (i: number) => {
    if (done.current || phaseRef.current !== "running" || hits.current.has(i))
      return;
    const r = config.rounds[i];
    const at = performance.now() - start.current;
    if (at < r.spawnMs! || at >= r.spawnMs! + r.visMs!) return;
    playTap();
    hits.current.set(i, Math.round(at - r.spawnMs!));
    setHitTick((t) => t + 1);
    if (hits.current.size >= config.rounds.length) finish();
  };
  const reaction = () => {
    if (done.current) return;
    if (phaseRef.current === "ready" || phaseRef.current === "between") {
      begin();
      return;
    }
    if (phaseRef.current !== "wait" && phaseRef.current !== "go") return;
    const ms =
      phaseRef.current === "wait"
        ? -1
        : Math.round(performance.now() - start.current);
    // Cancel only the pending signal; preserve the overall deadline by checking phase in the callback.
    answers.current.push(ms);
    setCount(answers.current.length);
    if (answers.current.length === config.rounds.length) finish();
    else transition("between");
  };
  const format = (ms: number) =>
    (ms / 1000).toFixed(3).replace(".", ",") + " s";
  const aimEndMs =
    config.mode === "aim"
      ? config.rounds[config.rounds.length - 1].spawnMs! +
        config.rounds[config.rounds.length - 1].visMs!
      : 0;
  return (
    <View style={s.container}>
      <Text style={s.meta}>
        NÍVEL {config.difficulty} ·{" "}
        {config.mode === "reflex"
          ? "TENTATIVA " +
            Math.min(count + 1, config.rounds.length) +
            " / " +
            config.rounds.length
          : config.mode === "aim"
            ? hits.current.size + " / " + config.rounds.length + " ALVOS"
            : "SUA TENTATIVA"}
      </Text>
      {config.mode === "timer" ? (
        <>
          <Text style={s.subtitle}>Pare no alvo</Text>
          <Text style={s.target}>{format(round.targetMs!)}</Text>
          <Text style={s.clock}>
            {round.hideAfterMs && elapsed >= round.hideAfterMs
              ? "?,??? s"
              : format(elapsed)}
          </Text>
          <Text style={s.body}>
            {round.hideAfterMs
              ? "O relógio vai desaparecer. Mantenha a contagem."
              : "Toque em parar quando alcançar o tempo acima."}
          </Text>
          <Button
            disabled={phase === "done"}
            onPress={() => {
              if (phaseRef.current === "ready") begin();
              else if (phaseRef.current === "running") {
                answers.current = [
                  Math.round(performance.now() - start.current),
                ];
                finish();
              }
            }}
          >
            {phase === "ready" ? "Iniciar relógio" : "Parar relógio"}
          </Button>
        </>
      ) : config.mode === "aim" ? (
        <>
          <Text style={s.body}>
            Toque nos alvos antes que sumam. O resultado é quantos você
            conseguir pegar, não quão rápido você reage.
          </Text>
          {phase === "running" && (
            <Text style={s.wave}>
              ⏱ {Math.max(0, (aimEndMs - elapsed) / 1000).toFixed(1)}s
            </Text>
          )}
          <Pressable
            accessibilityRole="none"
            accessible={false}
            // Toque que não pega alvo nenhum: não tira ponto (a pontuação é
            // do servidor), mas passa a ser contado e mostrado — dá pra ver
            // se o problema é mira ou velocidade.
            onPress={() => {
              if (phaseRef.current !== "running" || done.current) return;
              strayTaps.current++;
              setStrayTick((t) => t + 1);
            }}
            style={[s.arena, { width: ARENA, height: ARENA }]}
          >
            {phase === "running" &&
              config.rounds.map((r, i) => {
                if (hits.current.has(i)) return null;
                if (elapsed < r.spawnMs! || elapsed >= r.spawnMs! + r.visMs!)
                  return null;
                const diameter = (r.radius! / 100) * ARENA * 2,
                  cx = (r.x! / 100) * ARENA,
                  cy = (r.y! / 100) * ARENA;
                return (
                  <Pressable
                    key={i}
                    accessibilityRole="button"
                    accessibilityLabel="Alvo"
                    onPress={() => tapAimTarget(i)}
                    style={{
                      position: "absolute",
                      left: cx - diameter / 2,
                      top: cy - diameter / 2,
                      width: diameter,
                      height: diameter,
                      borderRadius: diameter / 2,
                      backgroundColor: palette.red,
                    }}
                  />
                );
              })}
          </Pressable>
          {phase === "running" && (
            <Text style={s.body}>
              {[...hits.current.values()].filter((ms) => ms >= 0).length} pegos ·{" "}
              {[...hits.current.values()].filter((ms) => ms < 0).length} perdidos ·{" "}
              {strayTaps.current} no vazio
            </Text>
          )}
          {phase === "ready" && <Button onPress={begin}>Começar</Button>}
        </>
      ) : config.mode === "reflex" ? (
        <>
          <Text style={s.body}>
            Espere aparecer AGORA. Antecipar o sinal zera esta tentativa.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              phase === "go"
                ? "Agora"
                : phase === "wait"
                  ? "Espere"
                  : "Iniciar tentativa"
            }
            onPress={reaction}
            disabled={phase === "done"}
            style={[
              s.signal,
              {
                backgroundColor:
                  phase === "go"
                    ? "#177044"
                    : phase === "wait"
                      ? "#923248"
                      : "#214A82",
              },
            ]}
          >
            <Text style={s.signalText}>
              {phase === "wait"
                ? "ESPERE…"
                : phase === "go"
                  ? "AGORA!"
                  : phase === "between"
                    ? "PRÓXIMA TENTATIVA"
                    : "COMEÇAR"}
            </Text>
          </Pressable>
          {phase === "between" && (
            <Text style={s.body}>
              {answers.current[count - 1] < 0
                ? "Você antecipou o sinal."
                : "Sua reação: " + format(answers.current[count - 1])}
            </Text>
          )}
        </>
      ) : (
        <>
          <Text style={s.target}>
            {phase === "show"
              ? "Observe"
              : phase === "answer"
                ? "Sua vez"
                : "Memorize " + round.sequence!.length + " passos"}
          </Text>
          <Text accessibilityLiveRegion="assertive" style={s.body}>
            {phase === "show" && active >= 0
              ? `Bloco ${active + 1}`
              : phase === "answer"
                ? "Sua vez de repetir"
                : "Blocos numerados de 1 a 4"}
          </Text>
          <View style={s.grid}>
            {["#4F80E8", "#19A590", "#D55078", "#E8AD3F"].map((color, n) => (
              <Pressable
                key={n}
                accessibilityRole="button"
                accessibilityLabel={"Bloco " + (n + 1)}
                disabled={phase !== "answer"}
                style={[
                  s.tile,
                  {
                    backgroundColor: color,
                    opacity:
                      (phase === "show" && active !== n) ||
                      (missed && n !== missed.correct && n !== missed.picked)
                        ? 0.35
                        : 1,
                    borderWidth: 4,
                    borderColor:
                      (phase === "show" && active === n) ||
                      (missed && n === missed.correct)
                        ? palette.green
                        : missed && n === missed.picked
                          ? palette.red
                          : "transparent",
                  },
                ]}
                onPress={() => {
                  if (done.current || phaseRef.current !== "answer" || missed) return;
                  playTap();
                  const i = answers.current.length;
                  answers.current.push(n);
                  setCount(answers.current.length);
                  const wrong = n !== round.sequence![i];
                  if (wrong) {
                    // Mostra o bloco certo por um instante antes de encerrar.
                    setMissed({ picked: n, correct: round.sequence![i], step: i + 1 });
                    setTimeout(finish, MEMORY_REVEAL_MS);
                    return;
                  }
                  if (answers.current.length === round.sequence!.length) finish();
                }}
              >
                <Text style={[s.signalText, { color: contrastText(color) }]}>
                  {n + 1}
                </Text>
              </Pressable>
            ))}
          </View>
          {missed ? (
            <Text accessibilityLiveRegion="assertive" style={[s.body, { color: palette.red, fontWeight: "700" }]}>
              No passo {missed.step}, o certo era o bloco {missed.correct + 1}.
            </Text>
          ) : phase === "ready" ? (
            <Button onPress={begin}>Mostrar sequência</Button>
          ) : (
            <Text style={s.body}>
              {count} / {round.sequence!.length} passos
            </Text>
          )}
        </>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  container: { gap: 22, paddingVertical: 18 },
  meta: {
    fontSize: 11,
    fontWeight: "800",
    color: palette.textFaint,
    letterSpacing: 1,
  },
  subtitle: { fontSize: 18, textAlign: "center", color: palette.textDim },
  target: {
    fontSize: 30,
    fontWeight: "800",
    color: palette.text,
    textAlign: "center",
  },
  clock: {
    fontSize: 52,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    textAlign: "center",
    color: palette.cyan,
    paddingVertical: 22,
  },
  body: {
    color: palette.textDim,
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
  },
  signal: {
    minHeight: 230,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  arena: {
    width: ARENA,
    height: ARENA,
    alignSelf: "center",
    backgroundColor: palette.surfaceAlt,
    borderRadius: 16,
    overflow: "hidden",
  },
  wave: {
    fontSize: 22,
    fontWeight: "800",
    color: palette.red,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  signalText: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: {
    width: "47%",
    height: 120,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
});

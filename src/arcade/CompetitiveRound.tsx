import React, { useEffect, useRef, useState } from "react";
import { Text, View, AppState } from "react-native";
import { ArcadeConfig } from "../../shared/arcade.mjs";
import { api } from "../api";
import Button from "../components/Button";
import Pressy from "../components/Pressy";
import { s } from "./styles";
type Step = {
  done: boolean;
  ticket?: string;
  block?: number;
  index: number;
  total: number;
  remainingMs: number;
  question: ArcadeConfig["rounds"][number];
  feedback?: {
    correct: boolean;
    combo: number;
    message: string;
    explanation: string;
  };
};
export default function CompetitiveRound({
  code,
  gameIndex,
  onRefresh,
}: {
  code: string;
  gameIndex: number;
  onRefresh: () => Promise<void>;
}) {
  const [step, setStep] = useState<Step | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [seconds, setSeconds] = useState(0);
  const alive = useRef(true),
    lock = useRef(false),
    deadline = useRef(0),
    last = useRef<Record<string, unknown>>({}),
    expired = useRef(false);
  const send = async (body: Record<string, unknown> = {}) => {
    if (lock.current) return;
    lock.current = true;
    last.current = body;
    setBusy(true);
    setError("");
    try {
      const next = await api<Step>(`/v1/rooms/${code}/round`, {
        ...body,
        gameIndex,
      });
      if (!alive.current) return;
      if (next.done) {
        await onRefresh();
        return;
      }
      deadline.current = performance.now() + next.remainingMs;
      setSeconds(Math.ceil(next.remainingMs / 1000));
      setStep(next);
    } catch (e) {
      if (alive.current) {
        setError(e instanceof Error ? e.message : "Falha de conexão");
        await onRefresh().catch(() => {});
      }
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  useEffect(() => {
    alive.current = true;
    send();
    const timer = setInterval(() => {
      if (!deadline.current) return;
      const remaining = Math.max(
        0,
        Math.ceil((deadline.current - performance.now()) / 1000),
      );
      setSeconds(remaining);
      if (!remaining && !expired.current && !lock.current) {
        expired.current = true;
        send();
      }
    }, 200);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") send();
    });
    return () => {
      alive.current = false;
      clearInterval(timer);
      sub.remove();
    };
  }, []);
  return (
    <View style={s.round}>
      <Text style={s.eyebrow}>COMPETITIVO · {seconds}s</Text>
      {!!error && (
        <>
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
          <Button disabled={busy} onPress={() => send(last.current)}>
            Tentar novamente
          </Button>
        </>
      )}
      {step ? (
        <>
          <Text style={s.caption}>
            Bloco {step.block || 1} · a dificuldade cresce durante a prova
          </Text>
          <Text style={s.body}>
            Rodada {step.index + 1} / {step.total}
          </Text>
          {step.feedback && (
            <Text accessibilityLiveRegion="polite" style={s.body}>
              {step.feedback.message}{" "}
              {step.feedback.combo >= 2
                ? `🔥 ${step.feedback.combo} seguidas`
                : step.feedback.explanation}
            </Text>
          )}
          <Text style={s.question}>{step.question.prompt}</Text>
          <View style={s.grid}>
            {step.question.options.map((option, i) => (
              <Pressy
                key={`${step.index}-${i}`}
                disabled={busy || !!error || seconds === 0}
                accessibilityLabel={`Opção ${i + 1}: ${option}`}
                outerStyle={s.option}
                onPress={() =>
                  send({ index: step.index, answer: i, ticket: step.ticket })
                }
              >
                <Text style={s.optionText}>{option}</Text>
              </Pressy>
            ))}
          </View>
          <Text style={s.caption}>
            {busy
              ? "Confirmando resposta…"
              : "Mais acertos seguidos, mais pontos. Pontuação igual é empate."}
          </Text>
        </>
      ) : (
        <Text style={s.body}>Preparando sua primeira questão…</Text>
      )}
    </View>
  );
}

import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Button from "../components/Button";
import LiveStatus from "../components/LiveStatus";
import useReducedMotion from "../useReducedMotion";
import { palette } from "../theme";

// A partir de quantos segundos de espera a tela oferece treinar contra o
// robô. Antes daqui, atrapalha mais do que ajuda: a maioria das filas resolve
// em poucos segundos.
const BOT_OFFER_AFTER_SECONDS = 25;

export default function MatchmakingScreen({
  status,
  errorMessage,
  onCancel,
  onRetry,
  onTrainWithBot,
}: {
  status: "connecting" | "queued" | "reconnecting" | "error";
  errorMessage?: string;
  onCancel: () => void;
  onRetry?: () => void;
  // Fila vazia não pode virar tela de espera infinita: passado um tempo, a
  // pessoa pode treinar contra o robô (modo que já existe e é testado) em vez
  // de só olhar a animação. Não vale nota — a tela diz isso.
  onTrainWithBot?: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const pulse = useRef(new Animated.Value(0.4)).current;
  const stalled = status === "error" || status === "reconnecting";
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    setSeconds(0);
    if (status !== "queued") return;
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (reducedMotion || stalled) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, status]);

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.center}>
        {stalled ? (
          <LiveStatus
            mode="screen"
            state={status === "error" ? "lost" : "reconnecting"}
            message={
              status === "error"
                ? errorMessage || "Verifique sua internet e tente de novo."
                : "Tentando te trazer de volta pra partida…"
            }
            onRetry={status === "error" ? onRetry : undefined}
          />
        ) : (
          <>
            <Animated.Text
              accessibilityElementsHidden
              style={[s.icon, !reducedMotion && { opacity: pulse }]}
            >
              ⚔️
            </Animated.Text>
            <Text style={s.title} accessibilityLiveRegion="polite">
              {status === "connecting" ? "Conectando…" : "Procurando adversário…"}
            </Text>
            <Text style={s.body}>Assim que alguém entrar, a partida começa na hora.</Text>
            {status === "queued" && <Text style={s.body}>Tempo na fila: {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</Text>}
            <Text style={s.body}>
              {seconds >= BOT_OFFER_AFTER_SECONDS
                ? "A busca está demorando — pode ser que tenha pouca gente online agora. Continue esperando (a partida começa sozinha quando alguém entrar) ou treine contra o robô enquanto isso."
                : "Acerte desafios para invocar tropas. Uma sequência de acertos ajuda a criar tropas mais fortes."}
            </Text>
            {status === "queued" && seconds >= BOT_OFFER_AFTER_SECONDS && onTrainWithBot && (
              <>
                <Button onPress={onTrainWithBot}>Treinar contra o robô</Button>
                <Text style={s.body}>O treino não altera sua nota na Arena.</Text>
              </>
            )}
          </>
        )}
        <Button secondary onPress={onCancel}>
          {status === "error" ? "Voltar" : "Cancelar"}
        </Button>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 24 },
  icon: { fontSize: 48 },
  title: { fontSize: 22, fontWeight: "800", color: palette.text, textAlign: "center" },
  body: { fontSize: 14, lineHeight: 21, color: palette.textDim, textAlign: "center" },
});

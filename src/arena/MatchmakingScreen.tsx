import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Button from "../components/Button";
import useReducedMotion from "../useReducedMotion";
import { palette } from "../theme";

export default function MatchmakingScreen({
  status,
  errorMessage,
  onCancel,
}: {
  status: "connecting" | "queued" | "error";
  errorMessage?: string;
  onCancel: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (reducedMotion || status === "error") return;
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
        {status === "error" ? (
          <>
            <Text style={s.title}>Não deu pra conectar</Text>
            <Text style={s.body}>
              {errorMessage || "Verifique sua internet e tente de novo."}
            </Text>
          </>
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

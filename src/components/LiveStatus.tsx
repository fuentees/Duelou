import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { palette, radius } from "../theme";
import Button from "./Button";

export type LiveStatusState = "live" | "reconnecting" | "lost";

// Componente único de status de conexão, reaproveitado tanto pelas salas/
// competitivo (RoomView.tsx) quanto pela Arena Rush (MatchmakingScreen.tsx,
// ArenaOnlineScreen.tsx) — mesma linguagem visual nos dois sistemas em vez
// de cada um inventar a própria "reconectando".
//
// `mode="inline"`: um selo pequeno (mesma ideia de presencePill já usada em
// RoomView.tsx), pra sobrepor numa tela que continua visível por trás.
// `mode="screen"`: bloco centralizado com título/mensagem/botão, pra quando
// a reconexão toma a tela inteira (sem SafeAreaView própria — quem chama
// decide o wrapper, já que os dois lugares que usam isso hoje têm o seu).
const COPY: Record<LiveStatusState, { label: string; symbol: string }> = {
  live: { label: "Ao vivo", symbol: "✓" },
  reconnecting: { label: "Reconectando…", symbol: "…" },
  lost: { label: "Conexão perdida", symbol: "×" },
};

export default function LiveStatus({
  mode = "inline",
  state,
  message,
  onRetry,
}: {
  mode?: "inline" | "screen";
  state: LiveStatusState;
  message?: string;
  onRetry?: () => void;
}) {
  const copy = COPY[state];
  const toneStyle =
    state === "live" ? s.live : state === "reconnecting" ? s.reconnecting : s.lost;
  const toneTextStyle =
    state === "live"
      ? s.liveText
      : state === "reconnecting"
        ? s.reconnectingText
        : s.lostText;

  if (mode === "inline") {
    return (
      <View style={[s.pill, toneStyle]} accessibilityLiveRegion="polite">
        <Text style={[s.pillText, toneTextStyle]}>
          {copy.symbol} {copy.label}
        </Text>
      </View>
    );
  }

  return (
    <View style={s.screenBlock}>
      <Text style={s.screenTitle} accessibilityLiveRegion="polite">
        {copy.label}
      </Text>
      {!!message && <Text style={s.screenMessage}>{message}</Text>}
      {state === "lost" && !!onRetry && (
        <Button secondary onPress={onRetry}>
          Tentar novamente
        </Button>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillText: { fontSize: 12, fontWeight: "800" },
  live: { backgroundColor: "#DCFCE7" },
  liveText: { color: palette.green },
  reconnecting: { backgroundColor: "#FFF3D6" },
  reconnectingText: { color: palette.amber },
  lost: { backgroundColor: "#FEE2E2" },
  lostText: { color: palette.red },
  screenBlock: { alignItems: "center", gap: 12 },
  screenTitle: { fontSize: 20, fontWeight: "800", color: palette.text, textAlign: "center" },
  screenMessage: {
    fontSize: 14,
    lineHeight: 21,
    color: palette.textDim,
    textAlign: "center",
  },
});

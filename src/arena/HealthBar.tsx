import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { palette, radius } from "../theme";

// Extraído de ArenaScreen.tsx (Ticket 3) quando ganhou um segundo consumidor
// (ArenaOnlineScreen, Ticket 24) — mesmo visual nos dois modos, offline e
// online.
export default function HealthBar({
  label,
  hp,
  color,
  flash = false,
  danger = false,
}: {
  label: string;
  hp: number;
  color: string;
  flash?: boolean;
  danger?: boolean;
}) {
  return (
    <View style={s.healthBlock} accessibilityLabel={`${label}: ${Math.round(hp)} de 100`}>
      <View style={s.row}>
        <Text style={s.caption}>{label} · {Math.max(0, Math.round(hp))}/100</Text>
        {danger && (
          <Text style={s.danger} accessibilityLiveRegion="polite">
            ⚠ CRÍTICO
          </Text>
        )}
      </View>
      <View style={s.healthTrack} accessibilityRole="progressbar" accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: 100, now: Math.max(0, Math.min(100, hp)) }}>
        <View
          style={[
            s.healthFill,
            { width: `${Math.max(0, Math.min(100, hp))}%`, backgroundColor: danger ? palette.red : color },
          ]}
        />
        {/* Flash branco por cima ao ser atingida — some sozinho logo em
            seguida (ver BASE_FLASH_MS em quem chama). */}
        {flash && <View style={s.healthFlash} />}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  caption: { fontSize: 12, fontWeight: "700", color: palette.textFaint },
  danger: { fontSize: 11, fontWeight: "900", color: palette.red },
  healthBlock: { gap: 4 },
  healthTrack: {
    height: 14,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    overflow: "hidden",
    position: "relative",
  },
  healthFill: { height: 14 },
  healthFlash: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#FFFFFFB0" },
});

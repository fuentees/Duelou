import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { palette, radius } from "../theme";
import Pressy from "../components/Pressy";

const STEPS = 10;

// Sem depender de nenhuma lib de slider nova: passos de 10% em botões, no
// mesmo estilo de grade já usado pra escolher nível (ver BrowseView.tsx).
export default function VolumeControl({
  label,
  value,
  muted,
  onChange,
  onToggleMuted,
}: {
  label: string;
  value: number;
  muted: boolean;
  onChange: (v: number) => void;
  onToggleMuted: () => void;
}) {
  const percent = Math.round(value * 100);
  return (
    <View style={s.block}>
      <View style={s.row}>
        <Text style={s.label}>{label}</Text>
        <Pressy
          accessibilityLabel={
            muted ? label + ": ativar som" : label + ": silenciar"
          }
          onPress={onToggleMuted}
          style={[s.muteButton, muted && s.muteButtonActive]}
        >
          <Text style={[s.muteText, muted && s.muteTextActive]}>
            {muted ? "🔇 Mudo" : "🔊 Ativo"}
          </Text>
        </Pressy>
      </View>
      <View
        style={s.stepsRow}
        accessibilityLabel={label + ": " + percent + "%"}
      >
        {Array.from({ length: STEPS }, (_, i) => i + 1).map((n) => (
          <Pressy
            key={n}
            accessibilityLabel={label + ": definir " + n * 10 + "%"}
            disabled={muted}
            accessibilityState={{
              selected: percent === n * 10,
              disabled: muted,
            }}
            onPress={() => onChange(n / STEPS)}
            outerStyle={s.stepOuter}
            style={[
              s.step,
              n <= Math.round(value * STEPS) && !muted && s.stepFilled,
              muted && s.stepDisabled,
            ]}
          >
            <Text
              style={{
                fontSize: 11,
                color:
                  n <= Math.round(value * STEPS) && !muted
                    ? "#FFFFFF"
                    : palette.text,
              }}
            >
              {n * 10}%
            </Text>
          </Pressy>
        ))}
      </View>
      <Text style={s.percent}>{muted ? "Silenciado" : percent + "%"}</Text>
    </View>
  );
}
const s = StyleSheet.create({
  block: { gap: 10 },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: { fontSize: 15, fontWeight: "700", color: palette.text },
  muteButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
  },
  muteButtonActive: { backgroundColor: "#3A1E24" },
  muteText: { fontSize: 12, fontWeight: "700", color: palette.textDim },
  muteTextActive: { color: palette.red },
  stepsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  stepOuter: { flexGrow: 1, flexBasis: 44 },
  step: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
    backgroundColor: palette.surfaceAlt,
  },
  stepFilled: { backgroundColor: palette.violet },
  stepDisabled: { opacity: 0.35 },
  percent: { fontSize: 12, color: palette.textFaint, fontWeight: "700" },
});

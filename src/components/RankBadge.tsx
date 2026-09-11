import React from "react";
import { StyleSheet, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { contrastText, radius, rankFor } from "../theme";

export default function RankBadge({ level }: { level: number }) {
  const rank = rankFor(level);
  const textColor = contrastText(rank.colors[0]);
  return (
    <LinearGradient
      colors={rank.colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={s.badge}
    >
      <Text style={s.icon}>{rank.icon}</Text>
      <Text style={[s.name, { color: textColor }]}>{rank.name}</Text>
    </LinearGradient>
  );
}
const s = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  icon: { fontSize: 14 },
  name: { fontSize: 11, fontWeight: "800" },
});

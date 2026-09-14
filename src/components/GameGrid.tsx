import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Pressy from "./Pressy";
import { gameColors, palette } from "../theme";

export const gameArt: Record<string, any> = {
  math: require("../../assets/games/optimized/math.jpg"),
  order: require("../../assets/games/optimized/order.jpg"),
  odd: require("../../assets/games/optimized/odd.jpg"),
  sequence: require("../../assets/games/optimized/sequence.jpg"),
  colors: require("../../assets/games/optimized/colors.jpg"),
  timer: require("../../assets/games/optimized/timer.jpg"),
  reflex: require("../../assets/games/optimized/reflex.jpg"),
  memory: require("../../assets/games/optimized/memory.jpg"),
  // "aim" ainda não tem capa gerada (ver assets/games/PROMPTS.md pro estilo
  // usado nas outras) — cai no símbolo colorido abaixo até alguém gerar uma.
};
export default function GameGrid({
  games,
  onChoose,
  progress,
}: {
  games: { id: string; name: string; desc: string; symbol?: string }[];
  onChoose: (id: string) => void;
  // Fase atual e estrelas de cada jogo. A lista mostrava nove capas iguais,
  // sem dizer em qual deles a pessoa já estava indo bem ou nem tinha começado.
  progress?: Record<string, { level: number; stars: number }>;
}) {
  return (
    <View style={s.grid}>
      {games.map((g) => {
        const art = gameArt[g.id];
        const accent = gameColors[g.id]?.[0] || palette.violet;
        const done = progress?.[g.id];
        const started = !!done && (done.level > 1 || done.stars > 0);
        return (
          <Pressy
            key={g.id}
            accessibilityLabel={
              started ? `${g.name}. Fase ${done!.level}, ${done!.stars} estrelas.` : g.name
            }
            onPress={() => onChoose(g.id)}
            outerStyle={s.item}
            style={s.card}
          >
            {art ? (
              <Image source={art} resizeMode="cover" style={s.image} />
            ) : (
              <View style={[s.image, s.fallback, { backgroundColor: accent }]}>
                <Text style={s.fallbackSymbol}>{g.symbol || "?"}</Text>
              </View>
            )}
            {started && (
              <View style={[s.badge, { backgroundColor: accent }]}>
                <Text style={s.badgeText}>
                  fase {done!.level}
                  {done!.stars > 0 ? ` · ★ ${done!.stars}` : ""}
                </Text>
              </View>
            )}
            <View style={s.caption}>
              <Text style={s.name}>{g.name}</Text>
              <Text numberOfLines={2} style={s.description}>{g.desc}</Text>
            </View>
          </Pressy>
        );
      })}
    </View>
  );
}
const s = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  item: { width: "47%", maxWidth: 180 },
  card: {
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  image: { width: "100%", height: 96 },
  badge: {
    position: "absolute",
    top: 8,
    left: 8,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 11, fontWeight: "900", color: "#FFFFFF" },
  fallback: { alignItems: "center", justifyContent: "center" },
  fallbackSymbol: { fontSize: 40, fontWeight: "800", color: "#FFFFFF" },
  caption: {
    paddingHorizontal: 10,
    paddingVertical: 12,
    backgroundColor: "rgba(6,13,27,0.88)",
    minHeight: 46,
    justifyContent: "center",
  },
  name: { fontSize: 14, fontWeight: "800", color: "#FFFFFF" },
  description: { fontSize: 12, lineHeight: 17, minHeight: 34, marginTop: 4, color: "#DCE3F2" },
});

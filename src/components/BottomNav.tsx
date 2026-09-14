import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { palette } from "../theme";

export type Section =
  "menu" | "home" | "arcade" | "ranking" | "profile" | "audio" | "arenaRush";

const items: {
  id: Section;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: "home", label: "Início", icon: "home" },
  { id: "arcade", label: "Arena", icon: "game-controller" },
  // O duelo em tempo real é o modo principal do app (LiveApp.tsx só expõe o
  // PvP) e estava escondido atrás do Menu, a dois toques. Entrada própria,
  // com nome próprio: "Arena" são os jogos, "Duelo" é o 1×1 ao vivo.
  { id: "arenaRush", label: "Duelo", icon: "flash" },
  { id: "ranking", label: "Ranking", icon: "trophy" },
  { id: "menu", label: "Menu", icon: "menu" },
];

// Uma única barra, usada tanto pelo Arcade quanto pelos jogos clássicos —
// antes cada metade do app tinha sua própria navegação, então trocar de
// "mundo" exigia achar um botão escondido no fim da tela. Com isso sempre
// visível, os quatro destinos ficam a um toque, de qualquer lugar.
export default function BottomNav({
  section,
  onChange,
}: {
  section: Section;
  onChange: (section: Section) => void;
}) {
  return (
    <View style={s.nav}>
      {items.map((item) => {
        const active =
          section === item.id ||
          ((section === "profile" || section === "audio") && item.id === "menu");
        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(item.id)}
            style={s.item}
          >
            <View style={[s.iconWrap, active && s.iconWrapActive]}>
              <Ionicons
                name={item.icon}
                size={20}
                color={active ? palette.violet : palette.textFaint}
              />
            </View>
            <Text style={active ? s.labelActive : s.label}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
const s = StyleSheet.create({
  nav: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: 8,
    paddingBottom: 9,
    borderTopWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  item: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    // Cinco destinos precisam caber num aparelho de 320px de largura sem
    // estourar a linha — daí 56 em vez dos 64 de quando eram quatro.
    minWidth: 56,
    minHeight: 48,
    padding: 2,
  },
  iconWrap: {
    width: 42,
    height: 28,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapActive: { backgroundColor: "#EFEAFF" },
  label: { fontSize: 11, fontWeight: "700", color: palette.textFaint },
  labelActive: { fontSize: 11, fontWeight: "800", color: palette.violet },
});

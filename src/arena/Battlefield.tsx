import React from "react";
import { View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { arena } from "../theme";
import { ENEMY_COLOR, PLAYER_COLOR } from "./colors";

// Decorative only: no moving layer or input surface over the battle.
export default function Battlefield() {
  return <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}>
    <LinearGradient colors={arena.lane} style={StyleSheet.absoluteFill} />
    {/* Corredor central: sinaliza por onde as tropas andam, sem competir
        com elas em contraste. */}
    <View style={{ position: "absolute", top: 0, bottom: 0, left: "22%", width: "56%", backgroundColor: "#FFFFFF08", borderLeftWidth: 1, borderRightWidth: 1, borderColor: "#FFFFFF14" }} />
    {[20, 40, 60, 80].map(top => <View key={top} style={{ position: "absolute", top: `${top}%`, left: 0, right: 0, height: 1, backgroundColor: "#FFFFFF10" }} />)}
    <View style={{ position: "absolute", top: "50%", left: "50%", width: 64, height: 64, marginLeft: -32, marginTop: -32, borderWidth: 2, borderColor: "#FFFFFF1A", borderRadius: 32 }} />
    {/* Linha de cada base, na cor do lado — o topo é sempre o inimigo e a
        base de baixo é sempre a sua, em qualquer partida. */}
    <View style={{ position: "absolute", top: 0, left: "18%", width: "64%", height: 6, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, backgroundColor: ENEMY_COLOR }} />
    <View style={{ position: "absolute", bottom: 0, left: "18%", width: "64%", height: 6, borderTopLeftRadius: 6, borderTopRightRadius: 6, backgroundColor: PLAYER_COLOR }} />
  </View>;
}

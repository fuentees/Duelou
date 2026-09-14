import React from "react";
import { View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

// Decorative only: no moving layer or input surface over the battle.
export default function Battlefield() {
  return <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}>
    <LinearGradient colors={["#F8E7EE", "#EAE8FA", "#DEF4F5"]} style={StyleSheet.absoluteFill} />
    <View style={{ position: "absolute", top: 0, bottom: 0, left: "25%", width: "50%", backgroundColor: "#FFFFFF50", borderLeftWidth: 1, borderRightWidth: 1, borderColor: "#FFFFFF90" }} />
    {[20, 40, 60, 80].map(top => <View key={top} style={{ position: "absolute", top: `${top}%`, left: 0, right: 0, height: 1, backgroundColor: "#FFFFFF90" }} />)}
    <View style={{ position: "absolute", top: "50%", left: "50%", width: 60, height: 60, marginLeft: -30, marginTop: -30, borderWidth: 2, borderColor: "#BBB2DE", borderRadius: 30 }} />
    {[0, 1].map(side => <View key={side} style={{ position: "absolute", ...(side ? { bottom: 0 } : { top: 0 }), left: "30%", width: "40%", height: 8, borderRadius: 4, backgroundColor: side ? "#087E8B" : "#C13E71" }} />)}
  </View>;
}

import React from "react";
import { Text, View } from "react-native";
import { palette } from "../theme";
export default function PatternPiece({ value }: { value: string }) {
  const circle = value.startsWith("círculo"),
    diamond = value.startsWith("losango"),
    square = value.startsWith("quadrado");
  if (!circle && !diamond && !square)
    return <Text style={{ fontSize: 20, color: palette.text }}>{value}</Text>;
  const hollow = value.includes("vazio"),
    dot = value.includes("ponto");
  return (
    <View
      accessible={false}
      style={{
        width: 22,
        height: 22,
        borderRadius: circle ? 11 : 2,
        transform: diamond ? [{ rotate: "45deg" }] : [],
        borderWidth: 2,
        borderColor: palette.text,
        backgroundColor: hollow || dot ? "transparent" : palette.text,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {dot && (
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: palette.text,
          }}
        />
      )}
    </View>
  );
}

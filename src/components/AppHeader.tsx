import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { gradients, palette, shadow } from "../theme";

export default function AppHeader({
  status,
  connected,
}: {
  status?: string;
  connected?: boolean;
}) {
  return (
    <LinearGradient
      colors={gradients.hero}
      style={s.header}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <View
        style={{ flexShrink: 1, flexGrow: 1, flexBasis: 160, maxWidth: "100%" }}
      >
        <Text style={s.brand}>
          duelou<Text style={s.dot}>.</Text>
        </Text>
        <Text style={s.subtitle}>MINIGAMES COMPETITIVOS</Text>
      </View>
      {!!status && (
        <View style={s.status}>
          {connected !== undefined && (
            <View
              style={[
                s.liveDot,
                { backgroundColor: connected ? palette.green : "#FFE16B" },
              ]}
            />
          )}
          <Text style={s.statusText}>{status}</Text>
        </View>
      )}
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  header: {
    paddingHorizontal: 22,
    paddingVertical: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
    alignItems: "center",
    ...shadow.soft,
  },
  brand: {
    color: "#FFFFFF",
    fontSize: 27,
    lineHeight: 29,
    fontWeight: "900",
    letterSpacing: -1.2,
  },
  dot: { color: "#FFF06A" },
  subtitle: {
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  status: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    maxWidth: "100%",
    backgroundColor: "rgba(255,255,255,.14)",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: {
    flexShrink: 1,
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
});

import React from "react";
import { StyleSheet, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Pressy from "./Pressy";
import { gradients, palette, radius } from "../theme";

export default function Button({
  children,
  onPress,
  secondary = false,
  disabled = false,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressy
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={disabled ? { opacity: 0.45 } : undefined}
    >
      <LinearGradient
        colors={secondary ? [palette.surfaceAlt, palette.surfaceAlt] : gradients.primaryButton}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[s.button, secondary && s.secondary]}
      >
        <Text style={[s.text, secondary && s.secondaryText]}>{children}</Text>
      </LinearGradient>
    </Pressy>
  );
}
const s = StyleSheet.create({
  button: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: radius.sm,
    alignItems: "center",
    minHeight: 48,
  },
  secondary: { backgroundColor: palette.surfaceRaised },
  text: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
  secondaryText: { color: palette.text },
});

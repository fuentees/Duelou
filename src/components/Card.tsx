import React from "react";
import { StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { gradients, palette, radius, shadow } from "../theme";

// Generic elevated gradient panel used across screens for grouped content.
export default function Card({
  children,
  active = false,
  style,
  accessible,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  active?: boolean;
  style?: any;
  accessible?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <LinearGradient
      colors={active ? gradients.cardActive : gradients.card}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[s.card, style]}
      accessible={accessible}
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </LinearGradient>
  );
}
const s = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: palette.border,
    padding: 20,
    borderRadius: radius.lg,
    gap: 14,
    ...shadow.soft,
  },
});

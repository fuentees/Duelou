import React, { useRef } from "react";
import { Animated, Pressable } from "react-native";

// Wraps any pressable content with a subtle press-scale animation.
// `outerStyle` lands on the actual Pressable (the flex item) so percentage-based
// sizing (e.g. width: "47%" in a wrapping grid) resolves correctly; `style` lands
// on the inner Animated.View for paint-only styling (colors, centering).
export default function Pressy({
  children,
  onPress,
  disabled,
  style,
  outerStyle,
  accessibilityRole = "button",
  accessibilityLabel,
  accessibilityState,
}: {
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  style?: any;
  outerStyle?: any;
  accessibilityRole?: "button" | "radio" | "tab";
  accessibilityLabel?: string;
  accessibilityState?: any;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const animate = (to: number) =>
    Animated.spring(scale, {
      toValue: to,
      useNativeDriver: true,
      speed: 40,
      bounciness: 6,
    }).start();
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => !disabled && animate(0.96)}
      onPressOut={() => animate(1)}
      style={outerStyle}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

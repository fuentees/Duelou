import React, { useRef, useState, useEffect } from "react";
import { Animated, Pressable } from "react-native";
import useReducedMotion from "../useReducedMotion";
import { palette } from "../theme";
import { ensureMusicPlaying, playTap } from "../audio/sounds";

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
  const reducedMotion = useReducedMotion();
  const [focused, setFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reducedMotion) {
      scale.stopAnimation();
      scale.setValue(1);
    }
  }, [reducedMotion]);
  const animate = (to: number) => {
    if (reducedMotion) return;
    Animated.spring(scale, {
      toValue: to,
      useNativeDriver: true,
      speed: 40,
      bounciness: 6,
    }).start();
  };
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ ...accessibilityState, disabled: !!disabled }}
      aria-checked={
        accessibilityRole === "radio" ? accessibilityState?.checked : undefined
      }
      aria-selected={
        accessibilityRole === "tab" ? accessibilityState?.selected : undefined
      }
      disabled={disabled}
      onPress={() => {
        playTap();
        ensureMusicPlaying();
        onPress();
      }}
      onPressIn={() => !disabled && animate(0.96)}
      onPressOut={() => animate(1)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[
        { minWidth: 44, minHeight: 44 },
        outerStyle,
        focused && {
          outlineWidth: 3,
          outlineColor: palette.violet,
          outlineOffset: 2,
        },
      ]}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

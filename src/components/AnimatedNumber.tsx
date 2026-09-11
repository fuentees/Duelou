import React, { useEffect, useRef, useState } from "react";
import { Animated } from "react-native";

// Counts up to `value` with an ease-out curve and a small entrance bounce.
export default function AnimatedNumber({
  value,
  style,
}: {
  value: number;
  style?: any;
}) {
  const [shown, setShown] = useState(0);
  const scale = useRef(new Animated.Value(0.7)).current;
  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 14,
      bounciness: 12,
    }).start();
    const start = Date.now(),
      duration = 700;
    let raf: ReturnType<typeof requestAnimationFrame>;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      setShown(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <Animated.Text style={[style, { transform: [{ scale }] }]}>
      {shown}
    </Animated.Text>
  );
}

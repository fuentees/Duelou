import { useSyncExternalStore } from "react";
import { AccessibilityInfo, Platform } from "react-native";

let reduced = true;
let generation = 0;
const listeners = new Set<() => void>();
let stop: (() => void) | undefined;
const update = (value: boolean) => {
  reduced = value;
  listeners.forEach((listener) => listener());
};
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    const current = ++generation;
    if (Platform.OS === "web") {
      const query = window.matchMedia("(prefers-reduced-motion: reduce)");
      update(query.matches);
      const change = () => update(query.matches);
      query.addEventListener("change", change);
      stop = () => query.removeEventListener("change", change);
    } else {
      const subscription = AccessibilityInfo.addEventListener(
        "reduceMotionChanged",
        value => {generation++;update(value);},
      );
      AccessibilityInfo.isReduceMotionEnabled()
        .then((value) => {
          if (current === generation) update(value);
        })
        .catch(() => {});
      stop = () => subscription.remove();
    }
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      generation++;
      stop?.();
      stop = undefined;
    }
  };
}
export default function useReducedMotion() {
  return useSyncExternalStore(
    subscribe,
    () => reduced,
    () => true,
  );
}

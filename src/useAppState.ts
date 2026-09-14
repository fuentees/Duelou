import { useSyncExternalStore } from "react";
import { AppState, AppStateStatus } from "react-native";

// Hook fino em cima de AppState, só pros novos pontos de reconexão
// (useArenaSocket.ts) — não substitui os usos inline já existentes em
// Round.tsx/SkillRound.tsx/ArenaScreen.tsx/sounds.ts, que resolvem um
// problema diferente (pausar um loop local), não reconectar rede.
function subscribe(listener: () => void) {
  const sub = AppState.addEventListener("change", listener);
  return () => sub.remove();
}

export default function useAppState(): AppStateStatus {
  return useSyncExternalStore(
    subscribe,
    () => AppState.currentState,
    () => AppState.currentState,
  );
}

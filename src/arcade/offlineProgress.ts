import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { MAX_LEVEL } from "../../shared/arcade.mjs";

// Progresso do Arcade offline (sem conta) fica só no aparelho — não existe
// jogador pra guardar isso no servidor. Sobe pelo mesmo critério do online:
// só ao concluir com boa pontuação a fase em que você está agora.
const KEY = "duelou.offline.level.v1";

export async function getOfflineLevel(): Promise<number> {
  const raw =
    Platform.OS === "web"
      ? typeof localStorage !== "undefined"
        ? localStorage.getItem(KEY)
        : null
      : await SecureStore.getItemAsync(KEY);
  const n = raw ? parseInt(raw, 10) : 1;
  return Number.isFinite(n) && n >= 1 && n <= MAX_LEVEL ? n : 1;
}

export async function setOfflineLevel(level: number): Promise<void> {
  const value = String(Math.max(1, Math.min(MAX_LEVEL, level)));
  if (Platform.OS === "web") {
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, value);
  } else {
    await SecureStore.setItemAsync(KEY, value);
  }
}

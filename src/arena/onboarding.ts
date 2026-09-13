import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// Só isso: "essa conta neste aparelho já jogou uma partida da Arena Rush
// antes?" — decide se a próxima é o tutorial (fácil, com dica) ou uma
// partida normal. Coleção/estatísticas de verdade são do Ticket 11, não
// deste arquivo.
const KEY = "duelou.arena.onboarded.v1";

async function read(): Promise<string | null> {
  return Platform.OS === "web"
    ? Promise.resolve(typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null)
    : SecureStore.getItemAsync(KEY);
}
async function write(value: string): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, value);
  } else {
    await SecureStore.setItemAsync(KEY, value);
  }
}

export async function hasCompletedArenaTutorial(): Promise<boolean> {
  try {
    return (await read()) === "1";
  } catch {
    return false;
  }
}
export async function markArenaTutorialComplete(): Promise<void> {
  try {
    await write("1");
  } catch {
    // Sem armazenamento disponível, sem problema — a pior consequência é
    // ver o tutorial de novo na próxima partida, não é destrutivo.
  }
}

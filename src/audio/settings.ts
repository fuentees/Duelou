import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";

export type AudioSettings = {
  sfxVolume: number; // 0..1
  musicVolume: number; // 0..1
  sfxMuted: boolean;
  musicMuted: boolean;
};

const KEY = "duelou.audio.v1";
const DEFAULTS: AudioSettings = {
  sfxVolume: 0.8,
  musicVolume: 0.35,
  sfxMuted: false,
  musicMuted: false,
};

let state: AudioSettings = { ...DEFAULTS };
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

const clamp01 = (n: unknown, fallback: number) =>
  typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;

async function readRaw(): Promise<string | null> {
  if (Platform.OS === "web")
    return typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
  return (await SecureStore.getItemAsync(KEY)) ?? null;
}
function persist() {
  const value = JSON.stringify(state);
  (async () => {
    try {
      if (Platform.OS === "web") {
        if (typeof localStorage !== "undefined") localStorage.setItem(KEY, value);
      } else await SecureStore.setItemAsync(KEY, value);
    } catch {}
  })();
}

// Carrega uma vez, assim que o módulo é importado — não precisa de nenhum
// componente pra disparar isso; telas que usam useAudioSettings() já
// reagem quando o valor persistido chega.
(async () => {
  try {
    const raw = await readRaw();
    if (raw) {
      const parsed = JSON.parse(raw);
      state = {
        sfxVolume: clamp01(parsed.sfxVolume, DEFAULTS.sfxVolume),
        musicVolume: clamp01(parsed.musicVolume, DEFAULTS.musicVolume),
        sfxMuted: !!parsed.sfxMuted,
        musicMuted: !!parsed.musicMuted,
      };
      notify();
    }
  } catch {}
})();

export function getAudioSettings(): AudioSettings {
  return state;
}
export function subscribeAudioSettings(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function setSfxVolume(v: number) {
  state = { ...state, sfxVolume: Math.max(0, Math.min(1, v)) };
  persist();
  notify();
}
export function setMusicVolume(v: number) {
  state = { ...state, musicVolume: Math.max(0, Math.min(1, v)) };
  persist();
  notify();
}
export function toggleSfxMuted() {
  state = { ...state, sfxMuted: !state.sfxMuted };
  persist();
  notify();
}
export function toggleMusicMuted() {
  state = { ...state, musicMuted: !state.musicMuted };
  persist();
  notify();
}
export function useAudioSettings(): AudioSettings {
  return useSyncExternalStore(subscribeAudioSettings, getAudioSettings);
}

import { AppState } from "react-native";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import type { AudioPlayer } from "expo-audio";
import { getAudioSettings, subscribeAudioSettings } from "./settings";

const sfxSources = {
  tap: require("../../assets/sounds/tap.wav"),
  success: require("../../assets/sounds/success.wav"),
  fail: require("../../assets/sounds/fail.wav"),
} as const;
type SfxName = keyof typeof sfxSources;

// Toda chamada aqui é best-effort: um blip de UI nunca pode derrubar a tela
// nem travar teste automatizado — plataformas sem áudio de verdade (ex.
// navegador headless em CI) simplesmente não tocam nada, em silêncio.
const sfxPlayers: Partial<Record<SfxName, AudioPlayer>> = {};
function ensureSfxPlayer(name: SfxName): AudioPlayer | null {
  try {
    if (!sfxPlayers[name]) sfxPlayers[name] = createAudioPlayer(sfxSources[name]);
    return sfxPlayers[name]!;
  } catch {
    return null;
  }
}
function playSfx(name: SfxName) {
  const { sfxVolume, sfxMuted } = getAudioSettings();
  if (sfxMuted || sfxVolume <= 0) return;
  try {
    const player = ensureSfxPlayer(name);
    if (!player) return;
    player.volume = sfxVolume;
    player.seekTo(0).catch(() => {});
    player.play();
  } catch {}
}
export const playTap = () => playSfx("tap");
export const playSuccess = () => playSfx("success");
export const playFail = () => playSfx("fail");

let musicPlayer: AudioPlayer | null = null;
let musicStarted = false;
function applyMusicVolume() {
  if (!musicPlayer) return;
  const { musicVolume, musicMuted } = getAudioSettings();
  try {
    musicPlayer.volume = musicMuted ? 0 : musicVolume;
  } catch {}
}
function ensureMusicPlayer(): AudioPlayer | null {
  if (musicPlayer) return musicPlayer;
  try {
    musicPlayer = createAudioPlayer(require("../../assets/sounds/music.wav"));
    musicPlayer.loop = true;
    applyMusicVolume();
    return musicPlayer;
  } catch {
    return null;
  }
}
// Só começa a tocar dentro de um gesto real do usuário (ex. o primeiro toque
// na tela) — autoplay sem interação é bloqueado por navegadores e, mesmo
// fora da web, começar música sem pedir é uma experiência ruim.
export function ensureMusicPlaying() {
  if (musicStarted) return;
  const { musicMuted } = getAudioSettings();
  if (musicMuted) return;
  const player = ensureMusicPlayer();
  if (!player) return;
  musicStarted = true;
  try {
    player.play();
  } catch {}
}
subscribeAudioSettings(() => {
  applyMusicVolume();
  if (!getAudioSettings().musicMuted) ensureMusicPlaying();
  else if (musicPlayer) {
    try {
      musicPlayer.pause();
    } catch {}
    musicStarted = false;
  }
});
setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false }).catch(() => {});
AppState.addEventListener("change", (next) => {
  if (!musicPlayer) return;
  try {
    if (next === "active") {
      if (musicStarted && !getAudioSettings().musicMuted) musicPlayer.play();
    } else musicPlayer.pause();
  } catch {}
});

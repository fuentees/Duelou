import React from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AppHeader from "./components/AppHeader";
import BottomNav, { Section } from "./components/BottomNav";
import Button from "./components/Button";
import Card from "./components/Card";
import VolumeControl from "./audio/VolumeControl";
import {
  useAudioSettings,
  setSfxVolume,
  setMusicVolume,
  toggleSfxMuted,
  toggleMusicMuted,
} from "./audio/settings";
import { playSuccess, ensureMusicPlaying } from "./audio/sounds";
import { palette } from "./theme";

export default function AudioSettingsScreen({ onNavigate }: { onNavigate: (section: Section) => void }) {
  const settings = useAudioSettings();
  return (
    <SafeAreaView style={s.screen}>
      <AppHeader status="SOM E MÚSICA" />
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.title}>Áudio</Text>
        <Text style={s.body}>Ajuste separadamente os efeitos sonoros e a música de fundo, ou silencie qualquer um dos dois.</Text>
        <Card>
          <VolumeControl
            label="Efeitos sonoros"
            value={settings.sfxVolume}
            muted={settings.sfxMuted}
            onChange={setSfxVolume}
            onToggleMuted={toggleSfxMuted}
          />
          <Button secondary accessibilityLabel="Testar efeito sonoro" onPress={playSuccess}>
            Testar som
          </Button>
        </Card>
        <Card>
          <VolumeControl
            label="Música"
            value={settings.musicVolume}
            muted={settings.musicMuted}
            onChange={(v) => {
              setMusicVolume(v);
              ensureMusicPlaying();
            }}
            onToggleMuted={toggleMusicMuted}
          />
        </Card>
        <Text style={s.caption}>
          As preferências ficam salvas neste aparelho. A música só começa a tocar depois do primeiro toque na tela — é uma regra dos navegadores, não um bug.
        </Text>
      </ScrollView>
      <BottomNav section="menu" onChange={onNavigate} />
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  content: { padding: 24, gap: 18, maxWidth: 660, width: "100%", alignSelf: "center" },
  title: { fontSize: 32, fontWeight: "800", color: palette.text },
  body: { fontSize: 14, lineHeight: 22, color: palette.textDim },
  caption: { fontSize: 12, lineHeight: 18, color: palette.textFaint },
});

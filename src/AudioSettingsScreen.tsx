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
import useReducedMotion from "./useReducedMotion";
import { palette } from "./theme";

// Era só "Som e música". Virou a tela de Configurações do app: som continua
// aqui, junto com o que antes não tinha lugar nenhum — o estado do movimento
// reduzido (o app respeita, mas ninguém tinha como saber disso) e onde cada
// tipo de progresso fica guardado, que é a dúvida mais comum de quem troca de
// aparelho.
export default function AudioSettingsScreen({ onNavigate }: { onNavigate: (section: Section) => void }) {
  const settings = useAudioSettings();
  const reducedMotion = useReducedMotion();
  return (
    <SafeAreaView style={s.screen}>
      <AppHeader status="CONFIGURAÇÕES" />
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.title}>Configurações</Text>
        <Text style={s.heading}>Som</Text>
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
          As preferências de som ficam salvas neste aparelho. A música só começa a tocar depois do primeiro toque na tela — é uma regra dos navegadores, não um bug.
        </Text>

        <Text style={s.heading}>Movimento</Text>
        <Card>
          <Text style={s.cardTitle}>
            Animações {reducedMotion ? "reduzidas" : "normais"}
          </Text>
          <Text style={s.body}>
            {reducedMotion
              ? "Seu aparelho está com movimento reduzido ligado, então o Duelou corta animações, tremores e pulsos — o jogo continua inteiro, só mais parado."
              : "O Duelou segue a preferência de movimento do seu aparelho. Se ligar “reduzir movimento” nos ajustes do sistema, as animações somem daqui também."}
          </Text>
        </Card>

        <Text style={s.heading}>Onde fica seu progresso</Text>
        <Card>
          <Text style={s.cardTitle}>Neste aparelho</Text>
          <Text style={s.body}>
            Campanha, estrelas e recordes de cada jogo, além das preferências de
            som. Sai daqui se você desinstalar o app ou limpar os dados do
            navegador.
          </Text>
        </Card>
        <Card>
          <Text style={s.cardTitle}>Na sua conta</Text>
          <Text style={s.body}>
            XP, conquistas, histórico de provas, patente competitiva e a nota da
            Arena Rush. Acompanham você em qualquer aparelho onde entrar com o
            código de recuperação.
          </Text>
        </Card>
        <Text style={s.caption}>
          A campanha só vai pra conta se você ligar a sincronização, na tela do
          jogo. Ela une as melhores fases dos dois lados e não altera
          classificação nenhuma.
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
  heading: { fontSize: 18, fontWeight: "800", color: palette.text, marginTop: 6 },
  cardTitle: { fontSize: 15, fontWeight: "800", color: palette.text },
  body: { fontSize: 14, lineHeight: 22, color: palette.textDim },
  caption: { fontSize: 12, lineHeight: 18, color: palette.textFaint },
});

import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Character from "../components/Character";
import Button from "../components/Button";
import Card from "../components/Card";
import ArenaOnlineScreen from "./ArenaOnlineScreen";
import { gradients, palette } from "../theme";

export default function ArenaLobby({ avatar, onExit }: { avatar?: unknown; onExit: () => void }) {
  const [playing, setPlaying] = useState(false);
  if (playing) return <ArenaOnlineScreen onExit={() => setPlaying(false)} />;
  return <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }}>
    <ScrollView contentContainerStyle={s.content}>
      <Button secondary onPress={onExit}>Voltar ao menu</Button>
      <LinearGradient colors={gradients.hero} style={s.hero}>
        <Text style={s.eyebrow}>DUELOU / DUELO EM TEMPO REAL</Text>
        <View style={s.versus}>
          <Character avatar={avatar} size={88} />
          <Text style={s.vs}>VS</Text>
          <Character avatar={{ species: "alien", color: "sunset", accessory: "visor", frame: "round" }} size={88} />
        </View>
        <Text style={s.title}>Arena Rush</Text>
        <Text style={s.lead}>Pense rápido. Invoque suas tropas. Defenda sua base.</Text>
        <Text style={s.tag}>1 × 1 ONLINE · ATÉ 100 SEGUNDOS</Text>
      </LinearGradient>
      <Button onPress={() => setPlaying(true)}>Buscar adversário</Button>
      <Text style={s.note}>A busca começa ao tocar no botão. Você pode cancelar enquanto espera.</Text>
      <Card>
        <Text style={s.heading}>Comande seu exército 3D</Text>
        <Text style={s.note}>Seu personagem vira suas tropas. Escolha a postura antes de responder: ela afeta apenas as próximas invocações, sem mudar as que já estão no campo.</Text>
        <Text style={s.note}>Investida: +30% velocidade e −20% vida. Use para pressionar a pista livre.</Text>
        <Text style={s.note}>Guarda: +30% vida e −20% velocidade. Use para segurar a linha de frente. Equilíbrio mantém os atributos normais.</Text>
      </Card>
      <Card>
        <Text style={s.heading}>Seu primeiro duelo, sem mistério</Text>
        {[
          ["01", "Acerte para invocar", "Cada acerto envia uma tropa. Ela avança e luta automaticamente."],
          ["02", "Construa seu combo", "Acertos seguidos e respostas rápidas ajudam a invocar tropas mais fortes. Errar quebra o combo."],
          ["03", "Proteja sua base", "Derrube a base rival. Ao fim do tempo, vence quem tiver mais vida; vidas iguais dão empate."],
        ].map(([n, title, text]) => <View key={n} style={s.rule}>
          <Text style={s.number}>{n}</Text><View style={{ flex: 1, gap: 4 }}>
            <Text style={s.heading}>{title}</Text><Text style={s.note}>{text}</Text>
          </View>
        </View>)}
      </Card>
    </ScrollView>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  content: { padding: 20, gap: 16, width: "100%", maxWidth: 660, alignSelf: "center" },
  hero: { padding: 24, borderRadius: 24, gap: 16 },
  eyebrow: { color: "#E5DFFF", fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  versus: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 },
  vs: { color: "#FFFFFF", fontSize: 20, fontWeight: "900" },
  title: { color: "#FFFFFF", fontSize: 34, fontWeight: "900" },
  lead: { color: "#FFFFFF", fontSize: 16, lineHeight: 24 },
  tag: { color: "#D9FFF5", fontSize: 11, fontWeight: "800" },
  note: { color: palette.textDim, fontSize: 13, lineHeight: 20 },
  heading: { color: palette.text, fontWeight: "800", fontSize: 16 },
  rule: { flexDirection: "row", gap: 12, paddingVertical: 6 },
  number: { fontSize: 18, fontWeight: "900", color: palette.violet },
});

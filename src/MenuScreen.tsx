import React, { useState } from "react";
import { ScrollView, Text, View, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AppHeader from "./components/AppHeader";
import BottomNav, { Section } from "./components/BottomNav";
import Button from "./components/Button";
import Card from "./components/Card";
import { modes } from "../shared/arcade.mjs";
import { palette } from "./theme";

// O menu tinha "Duelo ao vivo", "Todos os jogos" e "Ranking da Arena" — os
// três a um toque na barra de baixo, que agora tem cinco destinos. Ficou o
// que não está na barra: perfil, configurações e a ajuda.
export default function MenuScreen({
  onNavigate,
}: {
  onNavigate: (section: Section) => void;
}) {
  const [help, setHelp] = useState(false);
  return (
    <SafeAreaView style={s.screen}>
      <AppHeader status="DUELOU" />
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.title}>Menu</Text>
        <Text style={s.body}>
          Seu jogador, suas preferências e as regras do jogo.
        </Text>
        <Button onPress={() => onNavigate("profile")}>
          Meu perfil e conquistas
        </Button>
        <Button secondary onPress={() => onNavigate("audio")}>
          Configurações
        </Button>
        <Button secondary onPress={() => setHelp(!help)}>
          {help ? "Fechar ajuda" : "Como jogar"}
        </Button>
        {help && (
          <>
            <Card>
              <Text style={s.heading}>Os quatro caminhos</Text>
              <Text style={s.body}>
                <Text style={s.term}>Campanha:</Text> 30 fases por jogo, em seis
                capítulos, cada uma destravando a próxima. Fica neste aparelho.
              </Text>
              <Text style={s.body}>
                <Text style={s.term}>Treino livre:</Text> qualquer nível, quantas
                vezes quiser, sem alterar nada.
              </Text>
              <Text style={s.body}>
                <Text style={s.term}>Salas:</Text> a mesma prova para todo mundo
                da sala, para jogar com a turma. Não mexe em classificação.
              </Text>
              <Text style={s.body}>
                <Text style={s.term}>Competitivo:</Text> fila 1 × 1, melhor de
                três, com patente por habilidade. E o{" "}
                <Text style={s.term}>Duelo (Arena Rush)</Text>, que é o 1 × 1 ao
                vivo, com nota e divisão próprias.
              </Text>
            </Card>

            <Card>
              <Text style={s.heading}>Como cada jogo funciona</Text>
              {modes.map((mode) => (
                <Text key={mode.id} style={s.body}>
                  <Text style={s.term}>{mode.name}:</Text> {mode.description}
                </Text>
              ))}
              <Text style={s.note}>
                Antes de cada fase nova da campanha você vê um exemplo sem
                cronômetro. Ao errar uma rodada, o jogo mostra qual era a
                resposta certa antes de seguir.
              </Text>
            </Card>

            <Card>
              <Text style={s.heading}>Pontos e estrelas</Text>
              <Text style={s.body}>
                Toda prova vale até 1.000 pontos, e acertos seguidos valem mais
                que acertos espalhados. Bom: 500+. Ótimo: 700+. Excelente: 850+.
                Profissional: 950+.
              </Text>
              <Text style={s.body}>
                Na campanha, cada fase dá até três estrelas: concluir, alcançar a
                meta que libera a próxima fase e alcançar a excelência. São 90
                estrelas por jogo.
              </Text>
            </Card>

            <Card>
              <Text style={s.heading}>O que conta onde</Text>
              <Text style={s.body}>
                A patente competitiva só muda na fila competitiva. A nota da
                Arena Rush só muda no duelo ao vivo — e amistoso por convite não
                mexe nela. XP e conquistas vêm das partidas online. Campanha e
                estrelas ficam no aparelho, com sincronização opcional.
              </Text>
            </Card>
          </>
        )}
        <View style={s.footer}>
          <Text style={s.note}>
            Duelou · {modes.length} jogos, uma Arena e um duelo ao vivo.
          </Text>
        </View>
      </ScrollView>
      <BottomNav section="menu" onChange={onNavigate} />
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  content: {
    padding: 24,
    gap: 18,
    maxWidth: 660,
    width: "100%",
    alignSelf: "center",
  },
  title: { fontSize: 32, fontWeight: "800", color: palette.text },
  heading: { fontSize: 18, fontWeight: "800", color: palette.text },
  term: { fontWeight: "800", color: palette.text },
  body: { fontSize: 14, lineHeight: 23, color: palette.textDim },
  note: { fontSize: 13, lineHeight: 20, color: palette.textFaint },
  footer: { marginTop: 16 },
});

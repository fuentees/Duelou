import React, { useState } from "react";
import { ScrollView, Text, View, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AppHeader from "./components/AppHeader";
import BottomNav, { Section } from "./components/BottomNav";
import Button from "./components/Button";
import Card from "./components/Card";
import { modes } from "../shared/arcade.mjs";
import { palette } from "./theme";
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
          Seu jogador, suas partidas e tudo sobre o Duelou.
        </Text>
        <Button secondary onPress={() => onNavigate("profile")}>
          Meu perfil e conquistas
        </Button>
        <Button secondary onPress={() => onNavigate("arcade")}>
          Todos os jogos
        </Button>
        <Button secondary onPress={() => onNavigate("ranking")}>
          Ranking da Arena
        </Button>
        <Button secondary onPress={() => onNavigate("audio")}>
          Som e música
        </Button>
        <Button secondary onPress={() => setHelp(!help)}>
          {help ? "Fechar ajuda" : "Como jogar"}
        </Button>
        {help && (
          <Card>
            <Text style={s.heading}>Sempre o mesmo caminho</Text>
            <Text style={s.body}>
              Campanha: avance sozinho em seis capítulos e ganhe estrelas.
              Treino livre: qualquer nível sem alterar progresso. Multijogador:
              salas casuais com amigos. Jogar competitivo: fila única 1 × 1 com
              melhor de três e classificação por habilidade.
            </Text>
            <Text style={s.heading}>Pontos e avaliações</Text>
            <Text style={s.body}>
              Todas as provas valem até 1.000 pontos. Bom: 500+. Ótimo: 700+.
              Excelente: 850+. Profissional: 950+. A avaliação descreve sua
              tentativa, não é uma patente.
            </Text>
            <Text style={s.heading}>Progresso</Text>
            <Text style={s.body}>
              Na campanha, consulte a meta de estrelas de cada fase; reflexo e
              memória têm metas próprias. O progresso fica no aparelho, com
              sincronização opcional na conta. XP e conquistas da
              conta vêm das partidas online. A patente só muda na fila
              competitiva; empates não usam velocidade da conexão. Salas e
              revanches entre amigos são casuais.
            </Text>
            <Text style={s.heading}>Tempo certo</Text>
            <Text style={s.body}>
              Cada partida sorteia um alvo entre 2 e 12 segundos. Todos na sala
              recebem o mesmo alvo. Você vê seu tempo e a diferença no
              resultado.
            </Text>
            <Text style={s.heading}>Mira certeira</Text>
            <Text style={s.body}>
              Os alvos vão aparecendo e sumindo sozinhos — em geral um de cada
              vez, às vezes dois juntos. Toque neles antes que sumam: o
              resultado é quantos você conseguiu pegar no total, não quão rápido
              você reagiu. Níveis altos trazem alvos mais rápidos e com menos
              tempo na tela.
            </Text>
          </Card>
        )}
        <View style={s.footer}>
          <Text style={s.body}>Duelou · {modes.length} jogos, uma Arena.</Text>
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
  body: { fontSize: 14, lineHeight: 23, color: palette.textDim },
  footer: { marginTop: 16 },
});

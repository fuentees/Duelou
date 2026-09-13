import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "./api";
import { modes } from "../shared/arcade.mjs";
import { palette } from "./theme";
import AppHeader from "./components/AppHeader";
import BottomNav, { Section } from "./components/BottomNav";
import Button from "./components/Button";
import Card from "./components/Card";

type Player = {
  id: string;
  name: string;
  level: number;
  xp: number;
  current: number;
  needed: number;
  streak: number;
  played: number;
  achievements: { unlocked: boolean }[];
};
type Summary = { played: number; wins: number; best: number; level: number };
export default function HomeScreen({
  player,
  onNavigate,
}: {
  player: Player | null;
  onNavigate: (section: Section) => void;
}) {
  const [stats, setStats] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (player)
      api<Summary>("/v1/rooms/stats")
        .then((s) => {
          if (active) setStats(s);
        })
        .catch(() => {
          if (active) setError("Resumo da Arena indisponível no momento.");
        });
    return () => {
      active = false;
    };
  }, [player?.id]);
  return (
    <SafeAreaView style={s.screen}>
      <AppHeader status={player?.name || "BEM-VINDO"} />
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.greeting}>
          <Text style={s.kicker}>INÍCIO</Text>
          <Text style={s.title}>
            {player
              ? "Bom te ver, " + player.name + "."
              : "Seu próximo duelo começa aqui."}
          </Text>
        </View>
        <View style={s.hero}>
          <Text style={s.heroLabel}>DUELOU / ARENA</Text>
          <Text style={s.heroTitle}>Qual vai ser o{"\n"}jogo de hoje?</Text>
          <Text style={s.body}>
            {modes.length} jogos. Partidas solo e disputas com a turma.
          </Text>
          <Button onPress={() => onNavigate("arcade")}>Jogar</Button>
        </View>
        <Text style={s.heading}>Seu resumo</Text>
        <View style={s.stats}>
          <View style={s.stat}>
            <Text style={s.value}>{player ? (stats?.played ?? 0) : "—"}</Text>
            <Text style={s.label}>Partidas</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.value}>{stats?.wins ?? "—"}</Text>
            <Text style={s.label}>Vitórias na Arena</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.value}>{player?.streak ?? "—"}</Text>
            <Text style={s.label}>Dias seguidos</Text>
          </View>
        </View>
        {!!error && <Text style={s.body}>{error}</Text>}
        {player ? (
          <Card>
            <View style={s.row}>
              <Text style={s.heading}>Experiência · nível {player.level}</Text>
              <Text style={s.label}>{player.xp} XP</Text>
            </View>
            <View style={s.track}>
              <View
                style={[
                  s.fill,
                  {
                    width:
                      `${Math.min(1, player.current / Math.max(1, player.needed)) * 100}%` as `${number}%`,
                  },
                ]}
              />
            </View>
            <Text style={s.body}>
              Campanha e estrelas ficam no aparelho. XP mede sua experiência; a
              patente vem somente da fila competitiva.
            </Text>
            <Text style={s.label}>
              {player.achievements.filter((a) => a.unlocked).length} conquistas
              desbloqueadas
            </Text>
            <Button secondary onPress={() => onNavigate("profile")}>
              Ver meu perfil
            </Button>
          </Card>
        ) : (
          <Card>
            <Text style={s.heading}>Faça cada partida contar</Text>
            <Text style={s.body}>
              Crie seu jogador para salvar resultados e acompanhar sua evolução.
              Os jogos offline já estão disponíveis na Arena.
            </Text>
            <Button secondary onPress={() => onNavigate("profile")}>
              Entrar ou criar jogador
            </Button>
          </Card>
        )}
        <View style={s.row}>
          <Text style={s.heading}>Próxima parada</Text>
        </View>
        <Button secondary onPress={() => onNavigate("ranking")}>
          Ver ranking
        </Button>
      </ScrollView>
      <BottomNav section="home" onChange={onNavigate} />
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  content: {
    padding: 22,
    gap: 20,
    maxWidth: 660,
    width: "100%",
    alignSelf: "center",
    paddingBottom: 32,
  },
  greeting: { gap: 8 },
  kicker: {
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "800",
    color: palette.textFaint,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    color: palette.text,
  },
  hero: {
    padding: 22,
    gap: 16,
    borderRadius: 16,
    backgroundColor: "#142B50",
    borderWidth: 1,
    borderColor: "#274B7A",
  },
  heroLabel: {
    fontSize: 10,
    letterSpacing: 2,
    color: "#79B5FF",
    fontWeight: "800",
  },
  heroTitle: {
    fontSize: 32,
    lineHeight: 36,
    color: "#FFFFFF",
    fontWeight: "900",
  },
  body: { fontSize: 14, lineHeight: 22, color: palette.textDim },
  heading: { fontSize: 18, fontWeight: "800", color: palette.text },
  stats: { flexDirection: "row", gap: 8 },
  stat: {
    flex: 1,
    padding: 12,
    gap: 8,
    backgroundColor: palette.surface,
    borderRadius: 12,
  },
  value: { fontSize: 26, fontWeight: "800", color: palette.text },
  label: { fontSize: 11, lineHeight: 16, color: palette.textDim },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  track: {
    height: 6,
    backgroundColor: palette.surfaceAlt,
    borderRadius: 3,
    overflow: "hidden",
  },
  fill: { height: 6, backgroundColor: "#438CFF" },
});

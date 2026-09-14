import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Character from "../components/Character";
import Button from "../components/Button";
import Card from "../components/Card";
import ArenaOnlineScreen from "./ArenaOnlineScreen";
import ArenaScreen from "./ArenaScreen";
import { api } from "../api";
import { gradients, palette } from "../theme";

type ArenaStats = {
  rating: number;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  bestStreak: number;
  bestCombo: number;
  placement: boolean;
  placementRemaining: number;
};
type ArenaHistoryRow = {
  id: string;
  opponent: string;
  outcome: "win" | "loss" | "draw";
  myBaseHp: number;
  theirBaseHp: number;
};

export default function ArenaLobby({ avatar, onExit }: { avatar?: unknown; onExit: () => void }) {
  const [playing, setPlaying] = useState(false);
  const [training, setTraining] = useState(false);
  const [stats, setStats] = useState<ArenaStats | null>(null);
  const [history, setHistory] = useState<ArenaHistoryRow[]>([]);
  // Recarrega ao voltar de uma partida (playing volta a false): a nota e o
  // cartel mudaram agora mesmo, seria estranho a tela mostrar o de antes.
  useEffect(() => {
    if (playing || training) return;
    let alive = true;
    Promise.all([api<ArenaStats>("/v1/arena/me"), api<ArenaHistoryRow[]>("/v1/arena/history")])
      .then(([s, h]) => {
        if (!alive) return;
        setStats(s);
        setHistory(h.slice(0, 5));
      })
      .catch(() => {
        // Ficha é complemento, não pré-requisito pra jogar: sem ela a tela
        // continua inteira e o botão de buscar adversário segue funcionando.
      });
    return () => {
      alive = false;
    };
  }, [playing, training]);
  if (training) return <ArenaScreen onExit={() => setTraining(false)} />;
  if (playing)
    return (
      <ArenaOnlineScreen
        onExit={() => setPlaying(false)}
        onTrainWithBot={() => {
          setPlaying(false);
          setTraining(true);
        }}
      />
    );
  const outcomeLabel = { win: "Vitória", loss: "Derrota", draw: "Empate" } as const;
  const outcomeColor = { win: palette.green, loss: palette.red, draw: palette.textDim } as const;
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
      {stats && (
        <Card>
          <View style={s.statsHeader}>
            <View style={{ flex: 1, minWidth: 120 }}>
              <Text style={s.statsLabel}>SUA NOTA NA ARENA</Text>
              <Text style={s.rating}>{stats.rating}</Text>
            </View>
            {stats.placement ? (
              <Text style={s.note}>
                Colocação: faltam {stats.placementRemaining}{" "}
                {stats.placementRemaining === 1 ? "partida" : "partidas"} pra entrar na tabela.
              </Text>
            ) : (
              <Text style={s.note}>
                {stats.streak > 1
                  ? `🔥 ${stats.streak} vitórias seguidas`
                  : stats.streak < -1
                    ? `${Math.abs(stats.streak)} derrotas seguidas — hora de virar`
                    : `Melhor sequência: ${stats.bestStreak}`}
              </Text>
            )}
          </View>
          <View style={s.record}>
            {[
              [`${stats.wins}`, "Vitórias"],
              [`${stats.losses}`, "Derrotas"],
              [`${stats.draws}`, "Empates"],
              [`x${stats.bestCombo}`, "Melhor combo"],
            ].map(([value, label]) => (
              <View key={label} style={s.recordItem}>
                <Text style={s.recordValue}>{value}</Text>
                <Text style={s.statsLabel}>{label}</Text>
              </View>
            ))}
          </View>
          {history.length > 0 && (
            <View style={{ gap: 6 }}>
              <Text style={s.heading}>Últimas partidas</Text>
              {history.map((h) => (
                <View key={h.id} style={s.historyRow}>
                  <Text style={[s.historyOutcome, { color: outcomeColor[h.outcome] }]}>
                    {outcomeLabel[h.outcome]}
                  </Text>
                  <Text style={[s.note, { flex: 1, minWidth: 80 }]} numberOfLines={1}>
                    vs {h.opponent}
                  </Text>
                  <Text style={s.historyScore}>
                    {Math.round(h.myBaseHp)} × {Math.round(h.theirBaseHp)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </Card>
      )}
      <Button onPress={() => setPlaying(true)}>Buscar adversário</Button>
      <Text style={s.note}>A busca começa ao tocar no botão. Você pode cancelar enquanto espera.</Text>
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
  statsHeader: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  statsLabel: { fontSize: 10, fontWeight: "900", letterSpacing: 1, color: palette.textFaint },
  rating: { fontSize: 34, fontWeight: "900", color: palette.text, fontVariant: ["tabular-nums"] },
  record: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  recordItem: { flexGrow: 1, minWidth: 64, gap: 2 },
  recordValue: { fontSize: 20, fontWeight: "900", color: palette.text, fontVariant: ["tabular-nums"] },
  historyRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  historyOutcome: { fontSize: 13, fontWeight: "900", minWidth: 68 },
  historyScore: { fontSize: 13, fontWeight: "800", color: palette.textDim, fontVariant: ["tabular-nums"] },
});

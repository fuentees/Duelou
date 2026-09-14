import Character from "../components/Character";
import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "../api";
import { arenaTierFor, gradients, palette } from "../theme";
import SegmentedControl from "../components/SegmentedControl";
import { s } from "./styles";

type ArenaRow = {
  id: string;
  name: string;
  rating: number;
  wins: number;
  losses: number;
  bestStreak: number;
};

// Duas classificações diferentes, que sempre foram duas coisas diferentes e
// dividiam o mesmo título: a patente da fila competitiva (MD3, rooms) e a
// nota do duelo em tempo real (Arena Rush). Cada uma na sua aba, dizendo o
// que mede — em vez de uma só chamada "Ranking da Arena" que não mostrava
// nenhuma partida de Arena Rush.
export default function RankingTab({
  ranking,
  profileId,
}: {
  ranking: any[];
  profileId: string;
}) {
  const [tab, setTab] = useState<"rush" | "competitive">("rush");
  const [arena, setArena] = useState<ArenaRow[] | null>(null);
  const [arenaError, setArenaError] = useState("");

  useEffect(() => {
    if (tab !== "rush") return;
    let alive = true;
    api<ArenaRow[]>("/v1/arena/leaderboard")
      .then((rows) => {
        if (alive) setArena(rows);
      })
      .catch(() => {
        if (alive) setArenaError("Classificação da Arena Rush indisponível agora.");
      });
    return () => {
      alive = false;
    };
  }, [tab]);

  return (
    <>
      <SegmentedControl
        role="tab"
        value={tab}
        onChange={setTab}
        items={[
          { id: "rush", label: "Arena Rush" },
          { id: "competitive", label: "Competitivo" },
        ]}
      />
      {tab === "competitive" ? (
        <>
          <Text style={s.muted}>
            Competitivo 1 × 1. Classificação por habilidade; campanha, treino e
            salas casuais não contam. As primeiras cinco séries são de colocação.
          </Text>
          {ranking.length === 0 ? (
            <Text style={s.heading}>
              Jogue uma série na fila competitiva para aparecer aqui.
            </Text>
          ) : (
            ranking.map((r, i) => (
              <LinearGradient
                key={r.id}
                colors={r.id === profileId ? gradients.cardActive : gradients.card}
                style={[s.between, s.rankRow, { flexWrap: "wrap" }]}
              >
                <Character
                  avatar={r.avatar}
                  size={48}
                  label={`Personagem de ${r.name}`}
                />
                <Text
                  style={[
                    r.id === profileId ? s.accent : s.heading,
                    { flex: 1, minWidth: 100 },
                  ]}
                >
                  {i === 0 ? "🥇 " : i === 1 ? "🥈 " : i === 2 ? "🥉 " : ""}
                  {i + 1}. {r.name}
                </Text>
                <Text style={s.heading}>
                  {r.rank} · {r.rating} pontos{r.provisional ? " · colocação" : ""}
                </Text>
              </LinearGradient>
            ))
          )}
        </>
      ) : (
        <>
          <Text style={s.muted}>
            Duelo em tempo real 1 × 1. A nota sobe ao vencer e cai ao perder, e
            vale mais derrubar quem está acima de você. Entra na tabela quem já
            fez dez partidas. Não altera a patente competitiva.
          </Text>
          {!!arenaError && <Text style={s.muted}>{arenaError}</Text>}
          {arena === null && !arenaError ? (
            <Text style={s.heading}>Carregando…</Text>
          ) : arena && arena.length === 0 ? (
            <Text style={s.heading}>
              Ninguém terminou as dez partidas de colocação ainda. Pode ser você.
            </Text>
          ) : (
            (arena ?? []).map((r, i) => (
              <LinearGradient
                key={r.id}
                colors={r.id === profileId ? gradients.cardActive : gradients.card}
                style={[s.between, s.rankRow, { flexWrap: "wrap" }]}
              >
                <Text
                  style={[
                    r.id === profileId ? s.accent : s.heading,
                    { flex: 1, minWidth: 100 },
                  ]}
                >
                  {i === 0 ? "🥇 " : i === 1 ? "🥈 " : i === 2 ? "🥉 " : ""}
                  {i + 1}. {r.name}
                </Text>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={s.heading}>
                    {arenaTierFor(r.rating).icon} {r.rating} pontos
                  </Text>
                  <Text style={[s.muted, { color: palette.textFaint }]}>
                    {r.wins}V · {r.losses}D
                    {r.bestStreak >= 3 ? ` · melhor sequência ${r.bestStreak}` : ""}
                  </Text>
                </View>
              </LinearGradient>
            ))
          )}
        </>
      )}
    </>
  );
}

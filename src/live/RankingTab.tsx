import React from "react";
import { Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { gradients } from "../theme";
import { s } from "./styles";

export default function RankingTab({
  ranking,
  profileId,
}: {
  ranking: any[];
  profileId: string;
}) {
  return (
    <>
      <Text style={s.muted}>
        Últimos 7 dias. Soma do melhor resultado em cada jogo e dificuldade.
        Empates mantêm a ordem de cadastro.
      </Text>
      {ranking.length === 0 ? (
        <Text style={s.heading}>
          O ranking começa com sua primeira partida.
        </Text>
      ) : (
        ranking.map((r, i) => (
          <LinearGradient
            key={r.id}
            colors={r.id === profileId ? gradients.cardActive : gradients.card}
            style={[s.between, s.rankRow]}
          >
            <Text style={r.id === profileId ? s.accent : s.heading}>
              {i === 0 ? "🥇 " : i === 1 ? "🥈 " : i === 2 ? "🥉 " : ""}
              {i + 1}. {r.name}
            </Text>
            <Text style={s.heading}>{r.points}</Text>
          </LinearGradient>
        ))
      )}
    </>
  );
}

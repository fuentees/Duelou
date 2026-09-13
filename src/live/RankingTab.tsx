import Character from "../components/Character";
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
            style={[s.between, s.rankRow]}
          >
            <Character avatar={r.avatar} size={48} label={`Personagem de ${r.name}`}/>
            <Text style={r.id === profileId ? s.accent : s.heading}>
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
  );
}

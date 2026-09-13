import React from "react";
import { Share, StyleSheet, Text, View } from "react-native";
import Button from "../components/Button";
import { palette, radius } from "../theme";
import { ENEMY_COLOR, PLAYER_COLOR } from "./colors";
import type { ArenaState } from "../../shared/arena/engine";

const err = (e: unknown) => (e instanceof Error ? e.message : "Algo deu errado.");

export default function ResultCard({
  state,
  comeback,
  onRematch,
  onMenu,
  onError,
}: {
  state: ArenaState;
  // Se a própria base do jogador chegou a ficar crítica em algum momento e
  // ele venceu mesmo assim — dá pro destaque "virou nos últimos segundos".
  comeback: boolean;
  onRematch: () => void;
  onMenu: () => void;
  onError?: (message: string) => void;
}) {
  const outcome =
    state.winner === "player" ? "VITÓRIA" : state.winner === "enemy" ? "DERROTA" : "EMPATE";
  const accuracy = state.stats.challengesTotal
    ? Math.round((100 * state.stats.hits) / state.stats.challengesTotal)
    : 0;
  const won = state.winner === "player";
  const highlight = won
    ? comeback
      ? "Virou nos últimos segundos!"
      : state.stats.maxCombo >= 6
        ? "Sequência impecável de acertos!"
        : "Base inimiga derrubada!"
    : state.winner === "enemy"
      ? "Quase lá — bora de novo?"
      : "Ninguém levou a melhor desta vez.";

  // Só dados da própria partida — nenhum nome, identificador ou dado do
  // adversário (o "bot" nem tem nome de verdade pra vazar).
  const shareText = [
    "Duelou · Arena Rush",
    `${outcome} — base final ${Math.round(state.playerBaseHp)} × ${Math.round(state.enemyBaseHp)}`,
    `Maior combo: x${state.stats.maxCombo} · ${state.stats.hits} bonecos invocados · ${accuracy}% de acerto`,
    highlight,
  ].join("\n");

  return (
    <View style={s.card} accessibilityLabel={`Resultado: ${outcome}`}>
      <Text style={s.brand}>DUELOU · ARENA RUSH</Text>
      <Text style={[s.outcome, won && s.outcomeWon]}>{outcome}</Text>
      <Text style={s.highlight}>{highlight}</Text>
      <View style={s.scoreRow}>
        <View style={s.scoreBlock}>
          <Text style={[s.scoreValue, { color: PLAYER_COLOR }]}>{Math.round(state.playerBaseHp)}</Text>
          <Text style={s.scoreLabel}>SUA BASE</Text>
        </View>
        <Text style={s.vs}>×</Text>
        <View style={s.scoreBlock}>
          <Text style={[s.scoreValue, { color: ENEMY_COLOR }]}>{Math.round(state.enemyBaseHp)}</Text>
          <Text style={s.scoreLabel}>BASE INIMIGA</Text>
        </View>
      </View>
      <View style={s.statsRow}>
        <Text style={s.stat}>🔥 combo máx. x{state.stats.maxCombo}</Text>
        <Text style={s.stat}>⚔ {state.stats.hits} bonecos</Text>
        <Text style={s.stat}>🎯 {accuracy}% de acerto</Text>
      </View>
      <Button onPress={onRematch}>Revanche</Button>
      <Button
        secondary
        accessibilityLabel="Compartilhar resultado"
        onPress={() => {
          Share.share({ message: shareText }).catch((e) => onError?.(err(e)));
        }}
      >
        Compartilhar resultado
      </Button>
      <Button secondary onPress={onMenu}>
        Menu
      </Button>
      <Text style={s.privacy}>
        O que você compartilha mostra só o seu resultado — nada do adversário. Compartilhar é sempre sua escolha, o app nunca publica nada sozinho.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    gap: 12,
    padding: 20,
    borderRadius: radius.lg,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
  },
  brand: { fontSize: 11, fontWeight: "900", letterSpacing: 1.5, color: palette.textFaint },
  outcome: { fontSize: 30, fontWeight: "900", color: palette.text },
  outcomeWon: { color: palette.green },
  highlight: { fontSize: 14, fontWeight: "700", color: palette.textDim, textAlign: "center" },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  scoreBlock: { alignItems: "center", gap: 2 },
  scoreValue: { fontSize: 34, fontWeight: "900" },
  scoreLabel: { fontSize: 10, fontWeight: "800", color: palette.textFaint, letterSpacing: 0.5 },
  vs: { fontSize: 18, fontWeight: "800", color: palette.textFaint },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center" },
  stat: { fontSize: 12, fontWeight: "700", color: palette.textDim },
  privacy: { fontSize: 11, lineHeight: 16, color: palette.textFaint, textAlign: "center" },
});

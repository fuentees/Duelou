import React from "react";
import { Share, StyleSheet, Text, View } from "react-native";
import Button from "../components/Button";
import { palette, radius } from "../theme";
import { ENEMY_COLOR, PLAYER_COLOR } from "./colors";
import type { ArenaState } from "../../shared/arena/engine";
import Character from "../components/Character";
import { LinearGradient } from "expo-linear-gradient";

const err = (e: unknown) => (e instanceof Error ? e.message : "Algo deu errado.");

export default function ResultCard({
  state,
  comeback,
  showTutorialInfo = false,
  onRematch,
  onMenu,
  onError,
  rematchLabel = "Revanche",
  avatar,
  playerName,
  rating,
  friendly = false,
}: {
  state: ArenaState;
  // Se a própria base do jogador chegou a ficar crítica em algum momento e
  // ele venceu mesmo assim — dá pro destaque "virou nos últimos segundos".
  comeback: boolean;
  // Só true na primeira partida de quem nunca jogou (o tutorial) — não
  // afogamos o novato explicando tudo antes disso.
  showTutorialInfo?: boolean;
  onRematch: () => void;
  onMenu: () => void;
  onError?: (message: string) => void;
  rematchLabel?: string;
  avatar?: unknown;
  playerName?: string;
  // Nota da Arena depois desta partida. Ausente no modo contra o robô, que
  // não vale classificação — e a tela diz isso, em vez de ficar ambígua.
  rating?: { before: number; after: number; delta: number } | null;
  // Partida por convite direto: conta no histórico, não na nota.
  friendly?: boolean;
}) {
  // Sempre a perspectiva de quem está vendo a tela — em PvP, o cliente já
  // recebe o estado invertido pra "player" ser sempre "eu" (ver Ticket 21).
  const stats = state.stats.player;
  const outcome =
    state.winner === "player" ? "VITÓRIA" : state.winner === "enemy" ? "DERROTA" : "EMPATE";
  const accuracy = stats.challengesTotal
    ? Math.round((100 * stats.hits) / stats.challengesTotal)
    : 0;
  const won = state.winner === "player";
  const endedByExit = state.timeRemaining > 0 && state.playerBaseHp > 0 && state.enemyBaseHp > 0 && state.winner !== "draw";
  const highlight = endedByExit
    ? won ? "Vitória por saída do adversário." : "A partida foi encerrada por saída."
    : won
    ? comeback
      ? "Virou nos últimos segundos!"
      : stats.maxCombo >= 6
        ? "Sequência impecável de acertos!"
        : state.enemyBaseHp <= 0 ? "Base inimiga derrubada!" : "Sua base resistiu melhor até o fim!"
    : state.winner === "enemy"
      ? "Quase lá — bora de novo?"
      : "Ninguém levou a melhor desta vez.";

  // Só dados da própria partida — nenhum nome, identificador ou dado do
  // adversário (o "bot" nem tem nome de verdade pra vazar).
  const shareText = [
    "Duelou · Arena Rush",
    `${outcome} — base final ${Math.round(state.playerBaseHp)} × ${Math.round(state.enemyBaseHp)}`,
    `Maior combo: x${stats.maxCombo} · ${stats.hits} bonecos invocados · ${accuracy}% de acerto`,
    highlight,
  ].join("\n");

  return (
    <View style={s.card} accessibilityLabel={`Resultado: ${outcome}`}>
      <Text style={s.brand}>DUELOU · ARENA RUSH</Text>
      <LinearGradient colors={won ? ["#FFF3CA", "#EFE7FF"] : ["#E8ECFA", "#F6F8FF"]}
        style={{ alignItems: "center", gap: 10, padding: 20, borderRadius: 24, alignSelf: "stretch" }}>
        <Character avatar={avatar} size={80} />
        {!!playerName && <Text style={s.highlight}>{playerName}</Text>}
      <Text style={[s.outcome, won && s.outcomeWon]}>{outcome}</Text>
      <Text style={s.highlight}>{highlight}</Text>
      </LinearGradient>
      {friendly ? (
        <View style={s.ratingRow}>
          <Text style={s.ratingLabel}>AMISTOSO</Text>
          <Text style={s.highlight}>Partida por convite — não altera sua nota.</Text>
        </View>
      ) : rating ? (
        <View style={s.ratingRow}>
          <Text style={s.ratingLabel}>NOTA DA ARENA</Text>
          <Text style={s.ratingValue}>
            {rating.after}{" "}
            <Text
              style={{
                color: rating.delta > 0 ? palette.green : rating.delta < 0 ? palette.red : palette.textDim,
              }}
            >
              {rating.delta > 0 ? "▲ +" : rating.delta < 0 ? "▼ " : "= "}
              {rating.delta !== 0 ? Math.abs(rating.delta) : ""}
            </Text>
          </Text>
        </View>
      ) : null}
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
        <Text style={s.stat}>🔥 combo máx. x{stats.maxCombo}</Text>
        <Text style={s.stat}>⚔ {stats.hits} bonecos</Text>
        <Text style={s.stat}>🎯 {accuracy}% de acerto</Text>
      </View>
      <Text style={s.highlight}>
        {stats.challengesTotal === 0
          ? "Responda aos desafios para invocar suas tropas."
          : accuracy < 70
            ? "Na próxima: priorize acertar para manter suas tropas em campo."
            : "Na próxima: combine precisão e velocidade para invocar tropas mais fortes."}
      </Text>
      {showTutorialInfo && (
        <View style={s.tutorialBox}>
          <Text style={s.tutorialTitle}>Como invocar mais forte</Text>
          <Text style={s.tutorialLine}>Batedor — rápido, mas fraco. Cerca tanques.</Text>
          <Text style={s.tutorialLine}>Soldado — acerte rápido ou emende combo. Segura batedores.</Text>
          <Text style={s.tutorialLine}>Tanque — rápido E com combo x3+. Atropela soldados.</Text>
          <Text style={s.tutorialLine}>
            Combo é sua sequência de acertos seguidos — errar zera ele. Com
            combo 4 dá pra invocar um tanque na hora, gastando o combo.
          </Text>
        </View>
      )}
      <Button onPress={onRematch}>{rematchLabel}</Button>
      <Button
        secondary
        accessibilityLabel="Compartilhar resultado"
        onPress={() => {
          Share.share({ message: shareText }).catch((e) => onError?.(err(e)));
        }}
      >
        Compartilhar resultado
      </Button>
      {onMenu !== onRematch && <Button secondary onPress={onMenu}>
        Menu
      </Button>}
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
  ratingRow: {
    alignItems: "center",
    gap: 2,
    alignSelf: "stretch",
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
  },
  ratingLabel: { fontSize: 10, fontWeight: "900", letterSpacing: 1, color: palette.textFaint },
  ratingValue: {
    fontSize: 24,
    fontWeight: "900",
    color: palette.text,
    fontVariant: ["tabular-nums"],
  },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  scoreBlock: { alignItems: "center", gap: 2 },
  scoreValue: { fontSize: 34, fontWeight: "900" },
  scoreLabel: { fontSize: 10, fontWeight: "800", color: palette.textFaint, letterSpacing: 0.5 },
  vs: { fontSize: 18, fontWeight: "800", color: palette.textFaint },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center" },
  stat: { fontSize: 12, fontWeight: "700", color: palette.textDim },
  privacy: { fontSize: 11, lineHeight: 16, color: palette.textFaint, textAlign: "center" },
  tutorialBox: {
    alignSelf: "stretch",
    gap: 4,
    padding: 12,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
  },
  tutorialTitle: { fontSize: 12, fontWeight: "900", color: palette.text },
  tutorialLine: { fontSize: 12, fontWeight: "600", color: palette.textDim },
});

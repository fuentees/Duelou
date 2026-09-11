import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { contrastText, gameColors, gradients } from "../theme";
import Button from "../components/Button";
import Card from "../components/Card";
import Pressy from "../components/Pressy";
import RankBadge from "../components/RankBadge";
import { catalog, levelGuide, title, Game } from "./catalog";
import { s } from "./styles";

type Profile = {
  level: number;
  streak: number;
  played: number;
  xp: number;
  current: number;
  needed: number;
};
type Daily = {
  config: { game: Game; difficulty: number };
  completed: boolean;
  score: number | null;
};

function XpBar({ current, needed }: { current: number; needed: number }) {
  const width = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(width, {
      toValue: needed ? current / needed : 0,
      duration: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [current, needed]);
  return (
    <View style={s.track}>
      <Animated.View
        style={[
          s.fill,
          {
            width: width.interpolate({
              inputRange: [0, 1],
              outputRange: ["0%", "100%"],
            }),
          },
        ]}
      />
    </View>
  );
}

export default function TreinoTab({
  profile,
  daily,
  difficulty,
  setDifficulty,
  busy,
  onPlay,
  onPlayDaily,
}: {
  profile: Profile;
  daily: Daily | null;
  difficulty: number;
  setDifficulty: (n: number) => void;
  busy: boolean;
  onPlay: (game: Game) => void;
  onPlayDaily: () => void;
}) {
  return (
    <>
      <Text style={s.muted}>
        Escolha um jogo e pratique antes de desafiar alguém. A dificuldade
        abaixo vale para o seu treino.
      </Text>
      <Card>
        <View style={s.between}>
          <Text style={s.heading}>
            {profile.streak} dias de sequência
            {profile.streak >= 3 ? " 🔥" : ""}
          </Text>
          <RankBadge level={profile.level} />
        </View>
        <Text style={s.muted}>
          {profile.played} partidas · {profile.xp} XP acumulados
        </Text>
        <XpBar current={profile.current} needed={profile.needed} />
        <Text style={s.label}>
          {profile.current} / {profile.needed} XP PARA O PRÓXIMO NÍVEL
        </Text>
      </Card>
      {daily && (
        <LinearGradient colors={gradients.cardActive} style={s.dailyCard}>
          <Text style={s.label}>DESAFIO DO DIA · IGUAL PARA TODOS</Text>
          <View style={s.row}>
            <Text style={s.dailyIcon}>
              {catalog.find((g) => g.id === daily.config.game)?.icon}
            </Text>
            <Text style={s.dailyTitle}>{title(daily.config.game)}</Text>
          </View>
          <Text style={s.muted}>
            Dificuldade {daily.config.difficulty} · uma tentativa por dia
          </Text>
          {daily.completed ? (
            <Text style={s.dailyDone}>
              ✓ Concluído com {daily.score} pontos
            </Text>
          ) : (
            <Button disabled={busy} onPress={onPlayDaily}>
              Jogar desafio diário
            </Button>
          )}
        </LinearGradient>
      )}
      <Text style={s.heading}>Escolha a dificuldade</Text>
      <View style={s.choices}>
        {["Iniciante", "Desafio", "Mestre"].map((x, i) => (
          <Pressable
            key={x}
            onPress={() => setDifficulty(i + 1)}
            style={[s.choice, difficulty === i + 1 && s.selected]}
          >
            <Text style={difficulty === i + 1 ? s.accent : s.muted}>{x}</Text>
          </Pressable>
        ))}
      </View>
      {catalog.map((g) => {
        const c = gameColors[g.id];
        return (
          <Pressy disabled={busy} key={g.id} onPress={() => onPlay(g.id)}>
            <LinearGradient
              colors={gradients.card}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[s.game, { borderColor: c[0] + "40" }]}
            >
              <View style={s.row}>
                <LinearGradient colors={c} style={s.gameIcon}>
                  <Text
                    style={[s.gameIconText, { color: contrastText(c[0]) }]}
                  >
                    {g.icon}
                  </Text>
                </LinearGradient>
                <Text style={s.gameTitle}>
                  {g.icon} {g.name}
                </Text>
              </View>
              <Text style={s.muted}>{g.desc}</Text>
              <Text style={s.muted}>{levelGuide[g.id][difficulty - 1]}</Text>
              <Text style={[s.gameFoot, { color: c[0] }]}>JOGAR →</Text>
            </LinearGradient>
          </Pressy>
        );
      })}
      <Text style={s.muted}>
        Recompensas nas primeiras 30 partidas do dia (UTC). Treinar continua
        liberado.
      </Text>
    </>
  );
}

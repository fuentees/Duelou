import CharacterEditor from "../components/CharacterEditor";
import Character from "../components/Character";
import React, { useEffect, useRef, useState } from "react";
import { captureSession } from "../api";
import { Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { gradients, palette, shadow } from "../theme";
import { modes } from "../../shared/arcade.mjs";
import Button from "../components/Button";
import Card from "../components/Card";
import RankBadge from "../components/RankBadge";
import { s } from "./styles";

const title = (mode: string) => modes.find((m) => m.id === mode)?.name || mode;

type Achievement = {
  key: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
};
type Profile = {
  id: string;
  avatar?: unknown;
  name: string;
  weekly?: { name: string; current: number; target: number }[];
  competitive?: { rank: string; rating: number; provisional: boolean } | null;
  level: number;
  xp: number;
  coins: number;
  achievements: Achievement[];
};

export default function PerfilTab({
  profile,
  history,
  busy,
  deleting,
  setDeleting,
  onSignOut,
  onProfileUpdated,
  onDeleteAccount,
}: {
  profile: Profile;
  history: any[];
  busy: boolean;
  deleting: boolean;
  setDeleting: (v: boolean) => void;
  onSignOut: () => void;
  onProfileUpdated: (profile: any) => void;
  onDeleteAccount: () => void;
}) {
  const [older, setOlder] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [hasMore, setHasMore] = useState(true);
  const identity = useRef(profile.id);
  identity.current = profile.id;
  useEffect(() => {
    setOlder([]);
    setHasMore(true);
    setHistoryError("");
    setLoadingHistory(false);
  }, [profile.id]);
  const records = [
    ...new Map([...history, ...older].map((h) => [h.id, h])).values(),
  ].sort((a, b) => b.cursor - a.cursor);
  const loadMore = async () => {
    if (loadingHistory || !records.length) return;
    const uid = profile.id,
      request = captureSession();
    setLoadingHistory(true);
    setHistoryError("");
    try {
      const page = await request<any[]>(
        `/v1/history?before=${records[records.length - 1].cursor}`,
      );
      if (identity.current !== uid) return;
      setOlder((current) => [...current, ...page]);
      setHasMore(page.length === 30);
    } catch {
      if (identity.current === uid)
        setHistoryError("Não foi possível carregar. Tente novamente.");
    } finally {
      if (identity.current === uid) setLoadingHistory(false);
    }
  };
  return (
    <>
      <LinearGradient colors={gradients.cardActive} style={s.heroCard}>
        <Character
          avatar={profile.avatar}
          size={64}
          label={`Personagem de ${profile.name}`}
        />
        <Text style={s.heroName}>{profile.name}</Text>
        <RankBadge level={profile.level} />
        <Text style={s.heroCompetitive}>
          {profile.competitive
            ? `${profile.competitive.rank} · ${profile.competitive.rating}${profile.competitive.provisional ? " · colocação" : ""}`
            : "Sem classificação competitiva"}
        </Text>
      </LinearGradient>
      <CharacterEditor
        key={profile.id}
        uid={profile.id}
        avatar={profile.avatar}
        onSaved={onProfileUpdated}
      />
      <Card>
        <Text style={s.heading}>Conexão e permissões</Text>
        <Text style={s.muted}>
          Internet é necessária para entrar em salas e salvar resultados. A
          autorização de rede é concedida na instalação.
        </Text>
        <Text style={s.muted}>
          Os jogos da Arena não acessam câmera, microfone, localização ou
          contatos. Compartilhar abre o menu do seu aparelho.
        </Text>
      </Card>
      <Text style={s.muted}>
        Nível de experiência {profile.level} · {profile.xp} XP · {profile.coins}{" "}
        moedas
      </Text>
      <Card>
        <Text style={s.heading}>Objetivos da semana</Text>
        <Text style={s.muted}>
          Opcionais. Renovam na segunda-feira às 00h UTC.
        </Text>
        {profile.weekly?.map((m) => (
          <Text key={m.name} style={s.muted}>
            {m.current >= m.target ? "✓" : "○"} {m.name} · {m.current}/
            {m.target}
          </Text>
        ))}
        {!!profile.weekly?.length &&
          profile.weekly.every((m) => m.current === m.target) && (
            <Text style={s.accent}>🏅 Rival da semana</Text>
          )}
      </Card>
      <Text style={s.heading}>Conquistas</Text>
      <View style={s.achievementGrid}>
        {profile.achievements.map((achievement) =>
          achievement.unlocked ? (
            <Card
              key={achievement.key}
              active
              style={[s.achievement, shadow.glow(palette.violet)]}
            >
              <Text style={s.achievementIcon}>{achievement.icon}</Text>
              <Text style={s.achievementName}>{achievement.name}</Text>
              <Text style={s.achievementDesc}>{achievement.description}</Text>
            </Card>
          ) : (
            <View
              key={achievement.key}
              style={[s.achievement, s.achievementLocked]}
            >
              <Text style={s.achievementIcon}>🔒</Text>
              <Text style={s.achievementName}>{achievement.name}</Text>
              <Text style={s.achievementDesc}>{achievement.description}</Text>
            </View>
          ),
        )}
      </View>
      <Text style={s.heading}>Histórico de provas</Text>
      {history.length === 0 && (
        <Text style={s.muted}>Jogue uma sala na Arena para começar.</Text>
      )}
      {records.map((h) => (
        <Card key={h.id}>
          <Text style={s.heading}>
            {title(h.mode)} · nível {h.difficulty}
          </Text>
          <Text style={s.muted}>
            {h.score} pontos · {h.ranked ? "Competitivo" : "Casual"} · prova{" "}
            {h.game_index + 1}
          </Text>
          <Text style={s.muted}>
            {new Date(h.finished).toLocaleString("pt-BR")} ·{" "}
            {
              (
                {
                  win: "Vitória",
                  loss: "Derrota",
                  draw: "Empate",
                  void: "Sem pontuação",
                } as Record<string, string>
              )[h.outcome]
            }
          </Text>
          {h.details?.map((detail: string, index: number) => (
            <Text key={index} style={s.muted}>
              {detail}
            </Text>
          ))}
        </Card>
      ))}
      {!!historyError && <Text style={s.error}>{historyError}</Text>}
      {hasMore && history.length === 30 && (
        <Button secondary disabled={loadingHistory} onPress={loadMore}>
          {loadingHistory
            ? "Carregando histórico…"
            : "Carregar histórico anterior"}
        </Button>
      )}
      <Text style={s.muted}>
        Moedas ainda não têm loja ou valor monetário. Apagar a conta remove
        também suas salas e resultados na Arena.
      </Text>
      <Button disabled={busy} onPress={onSignOut}>
        Sair deste aparelho
      </Button>
      {deleting ? (
        <>
          <Text style={s.error}>
            Excluir permanentemente seu jogador e histórico?
          </Text>
          <Button disabled={busy} onPress={onDeleteAccount}>
            Confirmar exclusão
          </Button>
          <Button onPress={() => setDeleting(false)}>Cancelar</Button>
        </>
      ) : (
        <Button onPress={() => setDeleting(true)}>Excluir conta</Button>
      )}
    </>
  );
}

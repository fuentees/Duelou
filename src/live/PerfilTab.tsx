import React from "react";
import { Text, View } from "react-native";
import { palette, shadow } from "../theme";
import Button from "../components/Button";
import Card from "../components/Card";
import RankBadge from "../components/RankBadge";
import { title } from "./catalog";
import { s } from "./styles";

type Achievement = {
  key: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
};
type Profile = {
  name: string;
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
  onDeleteAccount,
}: {
  profile: Profile;
  history: any[];
  busy: boolean;
  deleting: boolean;
  setDeleting: (v: boolean) => void;
  onSignOut: () => void;
  onDeleteAccount: () => void;
}) {
  return (
    <>
      <View style={s.between}>
        <Text style={s.hero}>{profile.name}</Text>
        <RankBadge level={profile.level} />
      </View>
      <Card>
        <Text style={s.heading}>Conexão e permissões</Text>
        <Text style={s.muted}>
          Internet é necessária para entrar em salas e salvar resultados. A
          autorização de rede é concedida na instalação.
        </Text>
        <Text style={s.muted}>
          Os jogos de precisão, reflexo e memória não acessam câmera,
          microfone, localização ou contatos. Compartilhar abre o menu do seu
          aparelho.
        </Text>
      </Card>
      <Text style={s.muted}>
        Nível {profile.level} · {profile.xp} XP · {profile.coins} moedas
      </Text>
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
            <View key={achievement.key} style={[s.achievement, s.achievementLocked]}>
              <Text style={s.achievementIcon}>🔒</Text>
              <Text style={s.achievementName}>{achievement.name}</Text>
              <Text style={s.achievementDesc}>{achievement.description}</Text>
            </View>
          ),
        )}
      </View>
      <Text style={s.heading}>Histórico recente</Text>
      {history.length === 0 && (
        <Text style={s.muted}>Jogue uma partida para começar.</Text>
      )}
      {history.map((h) => (
        <Card key={h.id}>
          <Text style={s.heading}>
            {title(h.config.game)} · {h.config.difficulty}
          </Text>
          <Text style={s.muted}>
            {h.score} pontos · +{h.xp} XP
          </Text>
        </Card>
      ))}
      <Text style={s.muted}>
        Moedas ainda não têm loja ou valor monetário. Apagar a conta remove
        também os duelos que você criou.
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

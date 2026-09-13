import React, { useEffect, useState } from "react";
import {
  BackHandler,
  Platform,
  Text,
  TextInput,
  View,
  StyleSheet,
} from "react-native";
import {
  modes,
  ArcadeMode,
  MAX_LEVEL,
  levelDetails,
} from "../../shared/arcade.mjs";
import { palette } from "../theme";
import Button from "../components/Button";
import Pressy from "../components/Pressy";
import GameGrid from "../components/GameGrid";
import {
  CampaignProgress,
  chapterFor,
  starsFor,
  campaignGoals,
} from "../../shared/progression.mjs";
import SegmentedControl from "../components/SegmentedControl";

type Stats = {
  played: number;
  wins: number;
  best: number;
  average: number;
  level: number;
};
type Leader = Stats & { id: string; name: string };
type PlayTab = "online" | "friends" | "offline";
type Props = {
  campaign: CampaignProgress;
  campaignReady: boolean;
  syncEnabled: boolean;
  syncBusy: boolean;
  syncStatus: string;
  onToggleSync: () => void;
  onRetrySync: () => void;
  soloKind: "campaign" | "training" | "daily";
  setSoloKind: (kind: "campaign" | "training" | "daily") => void;
  onCompetitive: () => void;
  onDaily: () => void;
  difficulty: number;
  setDifficulty: (level: number) => void;
  player: { id: string; name: string } | null;
  stats: Stats | null;
  leaders: Leader[];
  rooms: any[];
  connected: boolean;
  busy: boolean;
  tab: PlayTab;
  setTab: (tab: PlayTab) => void;
  mode: ArcadeMode;
  setMode: (mode: ArcadeMode) => void;
  format: "md1" | "md3";
  setFormat: (format: "md1" | "md3") => void;
  capacity: number;
  setCapacity: (n: number) => void;
  code: string;
  setCode: (code: string) => void;
  onFindOpponent: () => void;
  onCreateRoom: () => void;
  onJoin: (code: string) => void;
  onPlayOffline: () => void;
  onLogin: () => void;
  onClearError: () => void;
};

export default function BrowseView(p: Props) {
  const [step, setStep] = useState("home");
  const games = modes.map((g) => ({
    id: g.id,
    name: g.name,
    desc: g.description,
    symbol: g.symbol,
  }));
  const selected = games.find((g) => g.id === p.mode)!;
  const choose = (id: string) => {
    p.setMode(id as ArcadeMode);
    p.setDifficulty(1);
    p.onClearError();
    setStep("mode");
  };
  const back = () =>
    setStep(
      step === "mode"
        ? "home"
        : step === "difficulty" || step === "online"
          ? "mode"
          : "online",
    );
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (step === "home") return false;
      back();
      return true;
    });
    return () => sub.remove();
  }, [step]);
  const solo = (kind: "campaign" | "training") => {
    p.setTab("offline");
    p.setSoloKind(kind);
    p.setDifficulty(kind === "campaign" ? p.campaign.unlocked : 1);
    setStep("difficulty");
  };
  return (
    <View style={v.page}>
      {step !== "home" && (
        <Pressy onPress={back}>
          <Text style={v.back}>← Voltar</Text>
        </Pressy>
      )}
      {step === "home" ? (
        <>
          <Text style={v.title}>Arena</Text>
          {p.code.length === 8 && (
            <Button secondary onPress={() => p.onJoin(p.code)}>
              Entrar no convite {p.code}
            </Button>
          )}
          <Text style={v.description}>
            Aprenda sozinho. Desafie a turma. Conquiste sua patente.
          </Text>
          <Button disabled={p.busy} onPress={p.onCompetitive}>
            Jogar competitivo
          </Button>
          <Text style={v.description}>
            Fila única 1 × 1 · melhor de 3 · jogo em rotação · classificação por
            habilidade. Cinco séries iniciais de colocação. Até cinco séries por
            rival por dia alteram sua classificação.
          </Text>
          <Button secondary onPress={p.onDaily}>
            Desafio do dia
          </Button>
          <Text style={v.heading}>
            Campanha, treino e amigos · {games.length} jogos
          </Text>
          <GameGrid games={games} onChoose={choose} />
        </>
      ) : (
        <>
          <Text style={v.title}>{selected.name}</Text>
          {step === "mode" ? (
            <>
              <Text style={v.description}>Como você quer jogar?</Text>
              <Button
                disabled={!p.campaignReady}
                onPress={() => solo("campaign")}
              >
                Jogar sozinho
              </Button>
              <Text style={v.description}>
                Campanha · 30 fases · progresso salvo neste aparelho, mesmo sem
                conta. Fase atual: {p.campaign.unlocked}.
              </Text>
              <Text style={v.description}>{p.syncStatus}</Text>
              <Text style={v.description}>
                Sincronização opcional: une as melhores fases deste aparelho com
                sua conta, sem alterar a classificação.
              </Text>
              <Button secondary disabled={p.syncBusy} onPress={p.onToggleSync}>
                {!p.player
                  ? "Entrar para sincronizar"
                  : p.syncEnabled
                    ? "Desativar sincronização"
                    : "Ativar sincronização"}
              </Button>
              {p.syncEnabled && (
                <Button secondary disabled={p.syncBusy} onPress={p.onRetrySync}>
                  Sincronizar agora
                </Button>
              )}
              <Button secondary onPress={() => solo("training")}>
                Treino livre
              </Button>
              <Text style={v.description}>
                Escolha qualquer nível. Pratique sem afetar campanha ou patente.
              </Text>
              <Button
                secondary
                onPress={() => {
                  p.setTab("online");
                  setStep("online");
                }}
              >
                Multijogador
              </Button>
            </>
          ) : step === "difficulty" ? (
            <>
              <Text style={v.heading}>
                {p.soloKind === "campaign"
                  ? "Sua campanha"
                  : "Escolha a dificuldade"}
              </Text>
              <Text style={v.description}>{levelDetails[p.mode]}</Text>
              <Text style={v.description}>
                {p.soloKind === "campaign"
                  ? `★ Concluir · ★★ ${campaignGoals(p.mode, p.difficulty).clear} pontos libera a próxima fase · ★★★ ${campaignGoals(p.mode, p.difficulty).excellent} pontos. Estrelas ficam salvas por fase.`
                  : "Todos os níveis liberados para praticar. O treino não altera seu progresso."}
              </Text>
              <Button disabled={!p.campaignReady} onPress={p.onPlayOffline}>
                Jogar fase {p.difficulty}
              </Button>
              <Text style={v.description}>
                {Object.entries(p.campaign.best).reduce(
                  (sum, [level, score]) =>
                    sum + starsFor(score, p.mode, Number(level)),
                  0,
                )}{" "}
                / 90 estrelas neste jogo
              </Text>
              {[0, 1, 2, 3, 4, 5].map((ch) => (
                <View key={ch} style={{ gap: 10 }}>
                  <Text style={v.heading}>
                    {ch + 1}. {chapterFor(p.mode, ch * 5 + 1).name}
                  </Text>
                  <Text style={v.description}>
                    {chapterFor(p.mode, ch * 5 + 1).lesson}
                  </Text>
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                  >
                    {Array.from({ length: 5 }, (_, i) => ch * 5 + i + 1).map(
                      (n) => {
                        const locked =
                          p.soloKind === "campaign" && n > p.campaign.unlocked;
                        return (
                          <Pressy
                            key={n}
                            disabled={locked}
                            accessibilityLabel={
                              locked ? `Nível ${n}, trancado` : `Nível ${n}`
                            }
                            accessibilityState={{
                              selected: n === p.difficulty,
                              disabled: locked,
                            }}
                            onPress={() => p.setDifficulty(n)}
                            style={{
                              padding: 10,
                              minWidth: 48,
                              borderRadius: 8,
                              backgroundColor:
                                n === p.difficulty
                                  ? "#246DF0"
                                  : palette.surface,
                              opacity: locked ? 0.4 : 1,
                            }}
                          >
                            <Text
                              style={{
                                color:
                                  n === p.difficulty ? "#FFFFFF" : palette.text,
                                fontWeight: "800",
                              }}
                            >
                              {locked ? "🔒" : n}
                            </Text>
                            <Text
                              style={{
                                color:
                                  n === p.difficulty ? "#FFFFFF" : palette.text,
                                fontSize: 10,
                              }}
                            >
                              {"★".repeat(
                                starsFor(p.campaign.best[n] || 0, p.mode, n),
                              ) || "☆"}
                            </Text>
                          </Pressy>
                        );
                      },
                    )}
                  </View>
                </View>
              ))}
              <Text style={v.description}>
                Fase {p.difficulty}:{" "}
                {chapterFor(p.mode, p.difficulty).mastery
                  ? "Prova de domínio — "
                  : ""}
                {chapterFor(p.mode, p.difficulty).lesson}
              </Text>
              <Button disabled={!p.campaignReady} onPress={p.onPlayOffline}>
                Continuar
              </Button>
            </>
          ) : !p.player ? (
            <Button onPress={p.onLogin}>Entrar para jogar online</Button>
          ) : step === "online" ? (
            <>
              <Text style={v.description}>
                Salas casuais. Resultados não alteram sua classificação
                competitiva.
              </Text>
              <Button disabled={p.busy} onPress={p.onFindOpponent}>
                Encontrar partida
              </Button>
              <Button secondary onPress={() => setStep("join")}>
                Entrar em uma sala
              </Button>
              <Button secondary onPress={() => setStep("create")}>
                Criar sala
              </Button>
            </>
          ) : step === "create" ? (
            <>
              <Text style={v.heading}>Criar sala</Text>
              <SegmentedControl
                value={p.tab === "friends" ? "friends" : "online"}
                onChange={p.setTab}
                items={[
                  { id: "online", label: "Pública" },
                  { id: "friends", label: "Só por convite" },
                ]}
              />
              <Text style={v.description}>
                Nível da sala: {p.difficulty}. Mesma prova para todos.
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => (
                  <Pressy
                    key={n}
                    accessibilityLabel={`Nível ${n}`}
                    onPress={() => p.setDifficulty(n)}
                    style={{
                      padding: 12,
                      backgroundColor:
                        n === p.difficulty ? "#246DF0" : palette.surface,
                    }}
                  >
                    <Text style={{ color: palette.text }}>{n}</Text>
                  </Pressy>
                ))}
              </View>
              <SegmentedControl
                value={p.format}
                onChange={p.setFormat}
                items={[
                  { id: "md1", label: "Melhor de 1" },
                  { id: "md3", label: "Melhor de 3" },
                ]}
              />
              <SegmentedControl
                value={String(p.capacity)}
                onChange={(n) => p.setCapacity(Number(n))}
                items={[
                  { id: "2", label: "2 pessoas" },
                  { id: "4", label: "4 pessoas" },
                  { id: "6", label: "6 pessoas" },
                ]}
              />
              <Text style={v.description}>
                Até três provas. Empate em vitórias termina empatado.
              </Text>
              <Button disabled={p.busy} onPress={p.onCreateRoom}>
                Criar e entrar
              </Button>
            </>
          ) : (
            <>
              <Text style={v.heading}>Entrar em uma sala</Text>
              <TextInput
                accessibilityLabel="Código da sala"
                placeholder="Código de 8 caracteres"
                value={p.code}
                onChangeText={p.setCode}
                maxLength={8}
                autoCapitalize="characters"
                style={v.input}
              />
              <Button
                disabled={p.busy || p.code.trim().length !== 8}
                onPress={() => p.onJoin(p.code)}
              >
                Entrar pelo código
              </Button>
              <Text style={v.heading}>Partidas abertas</Text>
              {!p.rooms.filter((r) => r.mode === p.mode).length && (
                <Text style={v.description}>
                  Nenhuma sala deste jogo disponível agora. Você pode jogar a
                  campanha enquanto isso.
                </Text>
              )}
              {p.rooms
                .filter((r) => r.mode === p.mode)
                .map((r) => (
                  <Button
                    key={r.code}
                    secondary
                    onPress={() => p.onJoin(r.code)}
                  >
                    {r.code} · {r.count}/{r.capacity} jogadores
                  </Button>
                ))}
            </>
          )}
        </>
      )}
    </View>
  );
}
const v = StyleSheet.create({
  page: { gap: 20 },
  title: {
    fontSize: 34,
    fontWeight: "800",
    color: palette.text,
    letterSpacing: -1,
  },
  heading: {
    fontSize: 19,
    fontWeight: "700",
    color: palette.text,
    marginTop: 12,
  },
  count: { color: palette.textFaint, fontSize: 13 },
  description: { fontSize: 14, lineHeight: 21, color: palette.textDim },
  back: { fontSize: 14, color: palette.textDim, paddingVertical: 10 },
  game: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingVertical: 17,
    borderBottomWidth: 1,
    borderColor: palette.border,
  },
  gameText: { flex: 1, gap: 5 },
  number: {
    width: 28,
    fontSize: 17,
    fontWeight: "600",
    color: palette.textFaint,
  },
  name: { fontSize: 17, fontWeight: "700", color: palette.text },
  arrow: { fontSize: 20, color: palette.textDim },
  input: {
    padding: 16,
    borderWidth: 1,
    borderColor: palette.border,
    fontSize: 17,
    color: palette.text,
    borderRadius: 6,
  },
});

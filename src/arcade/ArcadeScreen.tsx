import React, { useEffect, useRef, useState } from "react";
import {
  AppState,
  BackHandler,
  Platform,
  ScrollView,
  Text,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, captureSession } from "../api";
import {
  modes,
  makeArcade,
  arcadeScore,
  performanceLabel,
  resultDetails,
  CLEAR_SCORE,
  ArcadeMode,
  ArcadeConfig,
} from "../../shared/arcade.mjs";
import {
  CampaignProgress,
  campaignGoals,
  mergeCampaign,
  chapterFor,
  recordProgress,
  starsFor,
  dailyRandom,
} from "../../shared/progression.mjs";
import {
  readCampaign,
  saveCampaign,
  campaignSyncEnabled,
  setCampaignSync,
  syncCampaign,
  importAndSyncCampaigns,
} from "./campaign";
import Lesson from "./Lesson";
import Card from "../components/Card";
import Button from "../components/Button";
import AnimatedNumber from "../components/AnimatedNumber";
import Round from "./Round";
import RoomView from "./RoomView";
import BrowseView from "./BrowseView";
import BottomNav, { Section } from "../components/BottomNav";
import AppHeader from "../components/AppHeader";
import { playFail, playSuccess } from "../audio/sounds";
import { s } from "./styles";

type ArcadeFormat = "md1" | "md3";
type Member = {
  id: string;
  name: string;
  online: boolean;
  avatar?:unknown;
  ready?:boolean;
  forfeited?:boolean;
  rank?:number|null;
  score: number | null;
  seriesWins: number;
  durationMs: number | null;
  details?: string[];
};
type Stats = {
  played: number;
  wins: number;
  best: number;
  average: number;
  level: number;
};
type Leader = Stats & { id: string; name: string };
type HistoryEntry = {
  scores: Record<string, number>;
  durations: Record<string, number>;
  winner: string | null;
};
type Room = {
  code: string;
  host: string;
  mode: ArcadeMode;
  difficulty: number;
  format: ArcadeFormat;
  gameIndex: number;
  gamesNeeded: number;
  history: HistoryEntry[];
  capacity: number;
  ranked?: boolean;
  ratingResult?: { delta: number; rating: number; outcome: number } | null;
  public: boolean;
  state: string;
  starts: number | null;
  breakStarted?:number|null;
  breakUntil?:number|null;
  ends: number | null;
  serverNow: number;
  config: ArcadeConfig | null;
  members: Member[];
  nextCode: string | null;
  nextAction?: "continue" | "rematch" | null;
  nextDifficulty?: number | null;
};

export default function ArcadeScreen({
  player,
  inviteCode,
  onInviteConsumed,
  onNavigate,
  onLogin,
}: {
  player: { id: string; name: string } | null;
  inviteCode: string;
  onInviteConsumed: () => void;
  onNavigate: (section: Section) => void;
  onLogin: () => void;
}) {
  const [campaign, setCampaign] = useState<CampaignProgress>({
    unlocked: 1,
    best: {},
  });
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncStatus, setSyncStatus] = useState(
    "Progresso salvo neste aparelho.",
  );
  const syncIdentity = useRef("");
  const [campaignReady, setCampaignReady] = useState(false);
  const [soloKind, setSoloKind] = useState<"campaign" | "training" | "daily">(
    "campaign",
  );
  const [lesson, setLesson] = useState(false);
  const [queueTraining, setQueueTraining] = useState(false);
  const [dailyDate, setDailyDate] = useState("");
  const [dailyBest, setDailyBest] = useState(0);
  const [previousBest, setPreviousBest] = useState(0);
  const [browseKey, setBrowseKey] = useState(0);
  const [tab, setTab] = useState<"online" | "friends" | "offline">("online"),
    [mode, setMode] = useState<ArcadeMode>("math"),
    [difficulty, setDifficulty] = useState(1),
    [format, setFormat] = useState<ArcadeFormat>("md1"),
    [capacity, setCapacity] = useState(4),
    [code, setCode] = useState("");
  const [rooms, setRooms] = useState<any[]>([]),
    [room, setRoom] = useState<Room | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [connected, setConnected] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [localAnswers, setLocalAnswers] = useState<number[]>([]);
  const [offline, setOffline] = useState<ArcadeConfig | null>(null),
    [localScore, setLocalScore] = useState<number | null>(null),
    [pending, setPending] = useState<number[] | null>(null),
    [now, setNow] = useState(Date.now()),
    // Guarda o código da revanche recusada — some do aviso só pra quem
    // recusou; não precisa avisar o servidor, é só uma preferência local.
    [dismissedRematch, setDismissedRematch] = useState<string | null>(null);
  const lock = useRef(false),
    offset = useRef(0),
    epoch = useRef(0);
  syncIdentity.current = (player?.id || "guest") + ":" + mode;
  useEffect(() => {
    const request = captureSession();
    let active = true;
    setCampaignReady(false);
    setCampaign({ unlocked: 1, best: {} });
    setSyncEnabled(false);
    setSyncBusy(false);
    (async () => {
      try {
        const [local, enabled] = await Promise.all([
          readCampaign(mode, player?.id),
          campaignSyncEnabled(player?.id),
        ]);
        if (!active) return;
        setCampaign(local);
        setCampaignReady(true);
        setSyncEnabled(enabled);
        setSyncStatus(
          enabled
            ? "Sincronizando com sua conta…"
            : "Progresso salvo neste aparelho.",
        );
        if (enabled && player) {
          const merged = await syncCampaign(mode, player.id, request);
          if (active) {
            setCampaign((c) => mergeCampaign(c, merged));
            setSyncStatus("Campanha sincronizada com sua conta.");
          }
        }
      } catch {
        if (active) {
          setCampaignReady(true);
          setSyncStatus(
            "Sincronização pendente. Seu progresso local continua disponível.",
          );
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [mode, player?.id]);
  const toggleCampaignSync = async () => {
    if (!player) {
      onLogin();
      return;
    }
    const identity = syncIdentity.current,
      request = captureSession();
    setSyncBusy(true);
    try {
      await setCampaignSync(player.id, !syncEnabled);
      if (syncIdentity.current !== identity) return;
      if (syncEnabled) {
        setSyncEnabled(false);
        setSyncStatus(
          "Sincronização desativada. A cópia na conta foi mantida.",
        );
      } else {
        setSyncEnabled(true);
        setSyncStatus("Unindo o progresso deste aparelho e da conta…");
        await importAndSyncCampaigns(player.id, request);
        const merged = await readCampaign(mode, player.id);
        if (syncIdentity.current === identity) {
          setCampaign(merged);
          setSyncStatus("Campanha sincronizada com sua conta.");
        }
      }
    } catch {
      if (syncIdentity.current === identity)
        setSyncStatus(
          "Não foi possível sincronizar agora. Tente novamente quando houver conexão.",
        );
    } finally {
      if (syncIdentity.current === identity) setSyncBusy(false);
    }
  };
  const retryCampaignSync = async () => {
    if (!player) return;
    const identity = syncIdentity.current,
      request = captureSession();
    setSyncBusy(true);
    try {
      await importAndSyncCampaigns(player.id, request);
      const merged = await readCampaign(mode, player.id);
      if (syncIdentity.current === identity) {
        setCampaign(merged);
        setSyncStatus("Campanha sincronizada com sua conta.");
      }
    } catch {
      if (syncIdentity.current === identity)
        setSyncStatus(
          "Sincronização pendente. Os resultados locais estão preservados.",
        );
    } finally {
      if (syncIdentity.current === identity) setSyncBusy(false);
    }
  };
  const pendingRound = useRef<number | null>(null);
  const adopt = (next: Room) => {
    if (next.code !== room?.code) epoch.current++;
    if (queueTraining && next.starts) {
      setQueueTraining(false);
      setOffline(null);
      setLocalScore(null);
      setLesson(false);
    }
    if (
      pendingRound.current !== null &&
      next.gameIndex !== pendingRound.current
    ) {
      pendingRound.current = null;
      setPending(null);
    }
    offset.current = next.serverNow - Date.now();
    setNow(Date.now() + offset.current);
    setRoom(next);
  };
  const act = async (fn: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset.current), 200);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (
      !player ||
      (tab === "offline" && !queueTraining) ||
      (offline && !queueTraining)
    )
      return;
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    const generation = ++epoch.current;
    const poll = async () => {
      if (AppState.currentState === "background") {
        timer = setTimeout(poll, 3000);
        return;
      }
      try {
        if (room) {
          const next = await api<Room>(`/v1/rooms/${room.code}/heartbeat`, {});
          if (!stopped && generation === epoch.current) adopt(next);
        } else {
          // Nível é por jogo — sem isso, mostraria o nível de outro jogo
          // enquanto o jogador decide se joga multijogador (que agora usa
          // esse nível automaticamente, sem perguntar).
          const [active, list, nextStats, nextLeaders] = await Promise.all([
            api<Room | null>("/v1/rooms/active"),
            api<any[]>("/v1/rooms"),
            api<Stats>(`/v1/rooms/stats?mode=${mode}`),
            api<Leader[]>(`/v1/rooms/leaderboard?mode=${mode}`),
          ]);
          if (!stopped && generation === epoch.current) {
            if (active) adopt(active);
            else {
              setRooms(list);
              setStats(nextStats);
              setLeaders(nextLeaders);
            }
          }
        }
        if (!stopped) setConnected(true);
      } catch (e) {
        if (!stopped) {
          setConnected(false);
          setError(e instanceof Error ? e.message : "Falha de conexão");
        }
      }
      if (!stopped) timer = setTimeout(poll, room?.ranked ? 2000 : 3000);
    };
    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [player?.id, room?.code, tab, offline, mode, queueTraining]);
  const startRoom = (random = false) => {
    if (!player) {
      onLogin();
      return;
    }
    act(async () => {
      setPending(null);
      adopt(
        await api<Room>(random ? "/v1/rooms/random" : "/v1/rooms", {
          mode,
          // Só manda nível explícito pra sala privada (por convite) — sala
          // pública e pareamento automático sempre usam o nível atual do
          // jogador no servidor, senão exigir o mesmo nível escolhido
          // manualmente por duas pessoas deixaria pouca gente pra parear.
          ...(!random ? { difficulty } : {}),
          format,
          capacity,
          public: tab === "online",
        }),
      );
    });
  };
  useEffect(() => {
    if (inviteCode) setCode(inviteCode);
  }, [inviteCode]);
  const join = (value: string) => {
    if (!player) {
      onLogin();
      return;
    }
    act(async () => {
      setPending(null);
      adopt(
        await api<Room>(`/v1/rooms/${value.trim().toUpperCase()}/join`, {}),
      );
      onInviteConsumed();
    });
  };
  const finish = async (answers: number[]) => {
    const gameIndex = pendingRound.current ?? room!.gameIndex;
    pendingRound.current = gameIndex;
    setPending(answers);
    await act(async () => {
      const next = await api<Room>(`/v1/rooms/${room!.code}/finish`, {
        answers,
        gameIndex,
      });
      adopt(next);
      pendingRound.current = null;
      setPending(null);
      const mine = next.members.find((m) => m.id === player?.id)?.score;
      if (mine !== null && mine !== undefined)
        (mine >= CLEAR_SCORE ? playSuccess : playFail)();
    });
  };
  const mine = room?.members.find((m) => m.id === player?.id),
    game = modes.find((m) => m.id === (room?.mode || mode))!;
  const leave = () =>
    act(async () => {
      if (room) await api(`/v1/rooms/${room.code}`, undefined, "DELETE");
      epoch.current++;
      setRoom(null);
      setPending(null);
    });
  // Enquanto uma prova está rolando (sala em jogo ou rodada offline sem
  // resultado ainda), engole o botão voltar — sair sem querer no meio de uma
  // rodada perderia o resultado. Na tela de resultado, volta = sair da sala /
  // escolher outro jogo. Sem sala nem prova offline, quem decide é o
  // BrowseView (seu próprio "← Voltar" pelos passos do assistente).
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (offline) {
        if (localScore !== null) {
          setOffline(null);
          setLocalScore(null);
        }
        return true;
      }
      if (room) {
        if (room.state === "waiting" || room.state === "finished") leave();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [offline, room, localScore]);
  const rematch = () =>
    act(async () => {
      setPending(null);
      adopt(await api<Room>(`/v1/rooms/${room!.code}/rematch`, {}));
    });
  const continuePlaying = () =>
    act(async () => {
      setPending(null);
      pendingRound.current = null;
      setDismissedRematch(null);
      setQueueTraining(false);
      setOffline(null);
      setTab("online");
      adopt(
        await api<Room>(
          room!.ranked
            ? "/v1/rooms/competitive"
            : `/v1/rooms/${room!.code}/continue`,
          {},
        ),
      );
    });
  const acceptRematch = () =>
    act(async () => {
      setPending(null);
      setDismissedRematch(null);
      adopt(await api<Room>(`/v1/rooms/${room!.nextCode}/join`, {}));
    });
  const declineRematch = () => setDismissedRematch(room?.nextCode ?? null);
  const practiceWhileWaiting = () => {
    if (!room || room.state !== "waiting") return;
    setQueueTraining(true);
    setSoloKind("training");
    setLocalScore(null);
    setLesson(false);
    setOffline(makeArcade(room.mode, 1));
  };
  const playOffline = () => {
    if (soloKind === "campaign" && difficulty > campaign.unlocked) return;
    setPreviousBest(campaign.best[difficulty] || 0);
    setLocalScore(null);
    setLocalAnswers([]);
    setLesson(true);
    setOffline(
      makeArcade(
        mode,
        difficulty,
        soloKind === "daily" ? dailyRandom(dailyDate) : undefined,
      ),
    );
  };
  const playDaily = async () => {
    const date = new Date().toISOString().slice(0, 10);
    const dailyMode = (["math", "order", "sequence"] as ArcadeMode[])[
      Math.floor(Date.now() / 86400000) % 3
    ];
    setDailyDate(date);
    setSoloKind("daily");
    setTab("offline");
    setLocalScore(null);
    setLocalAnswers([]);
    setLesson(true);
    setOffline(makeArcade(dailyMode, 5, dailyRandom(date)));
    try {
      setDailyBest((await readCampaign("daily-" + date)).best[1] || 0);
    } catch {
      setDailyBest(0);
    }
  };
  const competitive = () => {
    if (!player) {
      onLogin();
      return;
    }
    setTab("online");
    act(async () => adopt(await api<Room>("/v1/rooms/competitive", {})));
  };
  // Campanha salva localmente; treino e desafio diário não alteram seus desbloqueios.
  const finishOffline = async (answers: number[]) => {
    const request = captureSession();
    const score = arcadeScore(offline!, answers);
    setLocalScore(score);
    setLocalAnswers(answers);
    if (soloKind === "daily") {
      const best = Math.max(dailyBest, score);
      setDailyBest(best);
      try {
        await saveCampaign("daily-" + dailyDate, {
          unlocked: 1,
          best: { 1: best },
        });
      } catch {
        setError("Não foi possível salvar o recorde diário neste aparelho.");
      }
    }
    if (soloKind === "campaign") {
      const next = recordProgress(
        campaign,
        offline!.difficulty,
        score,
        offline!.mode,
      );
      setCampaign(next);
      try {
        await saveCampaign(offline!.mode, next, player?.id);
        if (syncEnabled && player) {
          const identity = syncIdentity.current;
          try {
            const merged = await syncCampaign(
              offline!.mode,
              player.id,
              request,
            );
            if (identity === syncIdentity.current) {
              setCampaign((c) => mergeCampaign(c, merged));
              setSyncStatus("Campanha sincronizada com sua conta.");
            }
          } catch {
            setSyncStatus(
              "Sincronização pendente. Os resultados locais estão preservados.",
            );
          }
        }
      } catch {
        setError(
          "Fase concluída, mas não foi possível salvar. Mantenha o app aberto e tente novamente.",
        );
      }
    }
    (score >= CLEAR_SCORE ? playSuccess : playFail)();
  };
  return (
    <SafeAreaView style={s.screen}>
      <AppHeader
        status={
          tab === "offline"
            ? "MODO OFFLINE"
            : player
              ? player.name
              : "JOGUE DO SEU JEITO"
        }
        connected={tab !== "offline" && player ? connected : undefined}
      />
      <ScrollView
        contentContainerStyle={[
          s.content,
          (offline?.mode || room?.mode) === "odd" &&
            (offline?.difficulty || room?.difficulty || 1) >= 26 && {
              paddingHorizontal: 12,
            },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {queueTraining && (
          <Card>
            <Text style={s.body}>
              Treino durante a busca. Você volta automaticamente quando um rival
              entrar.
            </Text>
            <Button
              secondary
              onPress={() => {
                setQueueTraining(false);
                setOffline(null);
                setLocalScore(null);
              }}
            >
              Voltar à busca
            </Button>
          </Card>
        )}
        {!!error && (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        )}
        {offline ? (
          localScore !== null ? (
            <Card>
              <Text style={s.eyebrow}>PARTIDA OFFLINE CONCLUÍDA</Text>
              <Text style={s.body}>
                {soloKind === "campaign"
                  ? `Campanha · fase ${offline.difficulty} · ${"★".repeat(starsFor(localScore, offline.mode, offline.difficulty))}${"☆".repeat(3 - starsFor(localScore, offline.mode, offline.difficulty))}`
                  : soloKind === "daily"
                    ? `Desafio ${dailyDate} · mesma prova para todos · sem classificação`
                    : "Treino livre · sua patente permanece igual"}
              </Text>
              <AnimatedNumber value={localScore} style={s.score} />
              <Text style={s.title}>{performanceLabel(localScore)}</Text>
              {resultDetails(offline, localAnswers).map((line) => (
                <Text key={line} style={s.body}>
                  {line}
                </Text>
              ))}
              <Text style={s.caption}>
                de 1.000 pontos · resultado desta partida
              </Text>
              {soloKind === "daily" && (
                <Text style={s.body}>
                  Seu melhor de hoje: {dailyBest} pontos. Você pode tentar
                  novamente; o desafio muda às 00h UTC.
                </Text>
              )}
              {soloKind === "campaign" && (
                <>
                  <Text style={s.body}>
                    {localScore > previousBest
                      ? "Novo recorde nesta fase! "
                      : ""}
                    Melhor: {campaign.best[offline.difficulty] || 0} pontos.
                  </Text>
                  <Text style={s.body}>
                    {localScore >=
                    campaignGoals(offline.mode, offline.difficulty).clear
                      ? offline.difficulty === 30
                        ? "Campanha dominada! Busque três estrelas nas fases anteriores."
                        : "Próxima fase liberada!"
                      : `Faça ${campaignGoals(offline.mode, offline.difficulty).clear} pontos para avançar. Pratique o exemplo antes de tentar novamente.`}
                  </Text>
                  {localScore >=
                    campaignGoals(offline.mode, offline.difficulty).clear &&
                    offline.difficulty < 30 && (
                      <Button
                        onPress={() => {
                          const next = offline.difficulty + 1;
                          setDifficulty(next);
                          setPreviousBest(campaign.best[next] || 0);
                          setLocalScore(null);
                          setLesson(true);
                          setOffline(makeArcade(offline.mode, next));
                        }}
                      >
                        Próxima fase
                      </Button>
                    )}
                </>
              )}
              <Button
                accessibilityLabel="Jogar novamente"
                onPress={
                  queueTraining
                    ? practiceWhileWaiting
                    : soloKind === "daily"
                      ? playDaily
                      : playOffline
                }
              >
                Jogar novamente
              </Button>
              <Button
                secondary
                accessibilityLabel="Escolher outro jogo"
                onPress={() => {
                  setOffline(null);
                  setLocalScore(null);
                }}
              >
                Escolher outro jogo
              </Button>
            </Card>
          ) : lesson ? (
            <Lesson
              mode={offline.mode}
              level={offline.difficulty}
              onReady={() => act(async () => {adopt(await api<Room>(`/v1/rooms/${room!.code}/ready`,{gameIndex:room!.gameIndex}));})}
          onStart={() => setLesson(false)}
            />
          ) : (
            <Round
              key={JSON.stringify(offline)}
              config={offline}
              seconds={offline.seconds}
              onFinish={finishOffline}
            />
          )
        ) : room ? (
          <RoomView
            room={room}
            onQueuePractice={practiceWhileWaiting}
            onRefresh={async () =>
              adopt(await api<Room>(`/v1/rooms/${room!.code}`))
            }
            player={player}
            game={game}
            connected={connected}
            now={now}
            busy={busy}
            pending={pending}
            onReady={() => act(async () => {adopt(await api<Room>(`/v1/rooms/${room!.code}/ready`,{gameIndex:room!.gameIndex}));})}
          onStart={() =>
              act(async () =>
                adopt(await api<Room>(`/v1/rooms/${room.code}/start`, {})),
              )
            }
            onFinish={finish}
            onLeave={leave}
            onRematch={rematch}
            onContinue={continuePlaying}
            onAcceptRematch={acceptRematch}
            onDeclineRematch={declineRematch}
            rematchDismissed={dismissedRematch === room.nextCode}
            onError={setError}
          />
        ) : (
          <BrowseView
            key={browseKey}
            player={player}
            campaign={campaign}
            syncEnabled={syncEnabled}
            syncBusy={syncBusy}
            syncStatus={syncStatus}
            onToggleSync={toggleCampaignSync}
            onRetrySync={retryCampaignSync}
            campaignReady={campaignReady}
            soloKind={soloKind}
            setSoloKind={setSoloKind}
            onCompetitive={competitive}
            onDaily={playDaily}
            stats={stats}
            leaders={leaders}
            rooms={rooms}
            connected={connected}
            busy={busy}
            tab={tab}
            setTab={setTab}
            mode={mode}
            setMode={setMode}
            format={format}
            setFormat={setFormat}
            difficulty={difficulty}
            setDifficulty={setDifficulty}
            capacity={capacity}
            setCapacity={setCapacity}
            code={code}
            setCode={setCode}
            onFindOpponent={() => startRoom(true)}
            onCreateRoom={() => startRoom()}
            onJoin={join}
            onPlayOffline={playOffline}
            onLogin={onLogin}
            onClearError={() => setError("")}
          />
        )}
      </ScrollView>
      <BottomNav
        section="arcade"
        onChange={(next) => {
          if (next === "arcade" && !room) {
            setOffline(null);
            setLocalScore(null);
            setBrowseKey((value) => value + 1);
          } else onNavigate(next);
        }}
      />
    </SafeAreaView>
  );
}

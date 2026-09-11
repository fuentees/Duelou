import React, { useEffect, useRef, useState } from "react";
import { AppState, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "../api";
import {
  modes,
  makeArcade,
  arcadeScore,
  CLEAR_SCORE,
  MAX_LEVEL,
  ArcadeMode,
  ArcadeConfig,
} from "../../shared/arcade.mjs";
import { gradients, palette } from "../theme";
import Card from "../components/Card";
import Button from "../components/Button";
import AnimatedNumber from "../components/AnimatedNumber";
import Round from "./Round";
import RoomView from "./RoomView";
import BrowseView from "./BrowseView";
import { getOfflineLevel, setOfflineLevel } from "./offlineProgress";
import { s } from "./styles";

type ArcadeFormat = "md1" | "md3";
type Member = {
  id: string;
  name: string;
  online: boolean;
  score: number | null;
  seriesWins: number;
  durationMs: number | null;
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
  public: boolean;
  state: string;
  starts: number | null;
  ends: number | null;
  serverNow: number;
  config: ArcadeConfig | null;
  members: Member[];
};

export default function ArcadeScreen({
  player,
  onBack,
  onLogin,
}: {
  player: { id: string; name: string } | null;
  onBack: () => void;
  onLogin: () => void;
}) {
  const [tab, setTab] = useState<"online" | "friends" | "offline">("online"),
    [mode, setMode] = useState<ArcadeMode>("math"),
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
  const [offlineLevel, setOfflineLevelState] = useState(1);
  const [offline, setOffline] = useState<ArcadeConfig | null>(null),
    [localScore, setLocalScore] = useState<number | null>(null),
    [pending, setPending] = useState<number[] | null>(null),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    getOfflineLevel().then(setOfflineLevelState);
  }, []);
  const lock = useRef(false),
    offset = useRef(0),
    epoch = useRef(0);
  const adopt = (next: Room) => {
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
    if (!player || tab === "offline" || offline) return;
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
          const [active, list, nextStats, nextLeaders] = await Promise.all([
            api<Room | null>("/v1/rooms/active"),
            api<any[]>("/v1/rooms"),
            api<Stats>("/v1/rooms/stats"),
            api<Leader[]>("/v1/rooms/leaderboard"),
          ]);
          if (!stopped) {
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
      if (!stopped) timer = setTimeout(poll, 3000);
    };
    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [player?.id, room?.code, tab, offline]);
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
          format,
          capacity,
          public: tab === "online",
        }),
      );
    });
  };
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
    });
  };
  const finish = async (answers: number[]) => {
    setPending(answers);
    await act(async () => {
      adopt(await api<Room>(`/v1/rooms/${room!.code}/finish`, { answers }));
      setPending(null);
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
  const rematch = () =>
    act(async () => {
      const previous = room!;
      setPending(null);
      adopt(
        await api<Room>("/v1/rooms", {
          mode: previous.mode,
          format: previous.format,
          capacity: previous.capacity,
          public: previous.public,
        }),
      );
    });
  const playOffline = () => {
    setLocalScore(null);
    setOffline(makeArcade(mode, offlineLevel));
  };
  const finishOffline = (answers: number[]) => {
    const score = arcadeScore(offline!, answers);
    setLocalScore(score);
    // Mesma regra do online: só sobe de nível jogando a fase em que você está,
    // com nota boa — repetir uma fase já vencida não avança mais.
    if (score >= CLEAR_SCORE && offlineLevel < MAX_LEVEL) {
      const next = offlineLevel + 1;
      setOfflineLevelState(next);
      setOfflineLevel(next);
    }
  };
  return (
    <SafeAreaView style={s.screen}>
      <LinearGradient
        colors={gradients.hero}
        style={s.top}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voltar ao perfil e jogos clássicos"
          onPress={onBack}
        >
          <Text style={s.brand}>
            duelou<Text style={s.dot}>.</Text>
          </Text>
        </Pressable>
        <View style={s.row}>
          {tab !== "offline" && player && (
            <View
              style={[
                s.liveDot,
                { backgroundColor: connected ? palette.green : palette.red },
              ]}
            />
          )}
          <Text style={s.headerTag}>
            {tab === "offline"
              ? "SEM INTERNET"
              : player
                ? player.name
                : "JOGUE DO SEU JEITO"}
          </Text>
        </View>
      </LinearGradient>
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        {!!error && (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        )}
        {offline ? (
          localScore !== null ? (
            <Card>
              <Text style={s.eyebrow}>PARTIDA OFFLINE CONCLUÍDA</Text>
              <AnimatedNumber value={localScore} style={s.score} />
              <Text style={s.caption}>
                de 1.000 pontos · resultado desta partida
              </Text>
              <Button accessibilityLabel="Jogar novamente" onPress={playOffline}>
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
            player={player}
            game={game}
            connected={connected}
            now={now}
            busy={busy}
            pending={pending}
            onStart={() =>
              act(async () =>
                adopt(await api<Room>(`/v1/rooms/${room.code}/start`, {})),
              )
            }
            onFinish={finish}
            onLeave={leave}
            onRematch={rematch}
            onError={setError}
          />
        ) : (
          <BrowseView
            player={player}
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
            level={tab === "offline" ? offlineLevel : stats?.level || 1}
            capacity={capacity}
            setCapacity={setCapacity}
            code={code}
            setCode={setCode}
            onFindOpponent={() => startRoom(true)}
            onCreateRoom={() => startRoom()}
            onJoin={join}
            onPlayOffline={playOffline}
            onLogin={onLogin}
            onBack={onBack}
            onClearError={() => setError("")}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

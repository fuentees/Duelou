import React, { useEffect, useRef, useState } from "react";
import {
  AppState,
  Modal,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { api, restore, remember, forget } from "./api";
import Arcade from "./arcade/ArcadeScreen";
import { gradients } from "./theme";
import Button from "./components/Button";
import AnimatedNumber from "./components/AnimatedNumber";
import { catalog, title, Game } from "./live/catalog";
import AuthScreen from "./live/AuthScreen";
import GameRound from "./live/GameRound";
import TreinoTab from "./live/TreinoTab";
import DuelosTab from "./live/DuelosTab";
import RankingTab from "./live/RankingTab";
import PerfilTab from "./live/PerfilTab";
import { s } from "./live/styles";

type Config = {
  game: Game;
  difficulty: number;
  targetMs: number;
  toleranceMs: number;
  hideAfterMs: number | null;
  waitMs: number;
  waits?: number[];
  sequence: number[];
  flashMs: number;
};
type Match = { id: string; config: Config; expires: number };
type Profile = {
  id: string;
  name: string;
  xp: number;
  coins: number;
  played: number;
  streak: number;
  level: number;
  current: number;
  needed: number;
  achievements: {
    key: string;
    name: string;
    description: string;
    icon: string;
    unlocked: boolean;
  }[];
};
type Daily = {
  key: string;
  config: Config;
  completed: boolean;
  score: number | null;
  resetsAt: number;
};
const err = (e: unknown) =>
  e instanceof Error ? e.message : "Algo deu errado.";

export default function LiveApp() {
  const [arcadeOpen, setArcadeOpen] = useState(true);
  const [returnToArcade, setReturnToArcade] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null),
    [boot, setBoot] = useState(true),
    [newRecoveryCode, setNewRecoveryCode] = useState(""),
    [tab, setTab] = useState("Duelos"),
    [connected, setConnected] = useState(false),
    [difficulty, setDifficulty] = useState(1),
    [match, setMatch] = useState<Match | null>(null),
    [result, setResult] = useState<any>(null),
    [pending, setPending] = useState<object | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [code, setCode] = useState(""),
    [duels, setDuels] = useState<any[]>([]),
    [ranking, setRanking] = useState<any[]>([]),
    [history, setHistory] = useState<any[]>([]),
    [daily, setDaily] = useState<Daily | null>(null),
    [deleting, setDeleting] = useState(false),
    [suggestRecovery, setSuggestRecovery] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    if (!profile || arcadeOpen) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const sync = async () => {
      if (AppState.currentState === "background") {
        timer = setTimeout(sync, 5000);
        return;
      }
      try {
        await api("/v1/presence", {});
        const rooms = await api<any[]>("/v1/duels");
        if (!stopped) {
          setDuels(rooms);
          setConnected(true);
        }
      } catch {
        if (!stopped) setConnected(false);
      }
      if (!stopped) timer = setTimeout(sync, 5000);
    };
    sync();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [profile?.id, arcadeOpen]);
  const refresh = async () => {
    const [p, d, r, h, today] = await Promise.all([
      api<Profile>("/v1/me"),
      api("/v1/duels"),
      api("/v1/leaderboard"),
      api("/v1/history"),
      api<Daily>("/v1/daily"),
    ]);
    setProfile(p);
    setDuels(d);
    setRanking(r);
    setHistory(h);
    setDaily(today);
  };
  const action = async (fn: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(err(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  useEffect(() => {
    (async () => {
      try {
        if (await restore()) await refresh();
      } catch (e) {
        setError(err(e));
      } finally {
        setBoot(false);
      }
    })();
  }, []);
  const play = async (game: Game, duelCode?: string) =>
    action(async () => {
      const m = await api<Match>(
        "/v1/matches",
        duelCode ? { code: duelCode } : { game, difficulty },
      );
      setResult(null);
      setPending(null);
      setMatch(m);
    });
  const playDaily = async () =>
    action(async () => {
      const m = await api<Match>("/v1/matches", { daily: true });
      setResult(null);
      setPending(null);
      setMatch(m);
    });
  const finish = async (data: object) => {
    setPending(data);
    await action(async () => {
      const r = await api("/v1/matches/" + match!.id + "/finish", data);
      setResult(r);
      setProfile(r.profile);
      setPending(null);
    });
  };
  const create = async (game: Game) =>
    action(async () => {
      const d = await api("/v1/duels", { game, difficulty });
      setCode(d.code);
      await refresh();
      await Share.share({
        message:
          "Duelou! " +
          title(game) +
          " · dificuldade " +
          difficulty +
          ". Meu código é " +
          d.code +
          ". Entre em Online no app. Válido por 24h.",
      });
    });
  const handleCreateAccount = (name: string) =>
    action(async () => {
      const r = await api("/v1/guests", { name });
      await remember(r.token);
      setNewRecoveryCode(r.recoveryCode);
      await refresh();
    });
  const handleRecover = (code: string) =>
    action(async () => {
      const r = await api("/v1/sessions/recover", { code });
      await remember(r.token);
      await refresh();
      if (returnToArcade) {
        setReturnToArcade(false);
        setArcadeOpen(true);
      }
    });
  const handleJoinDuel = () =>
    action(async () => {
      const d = await api("/v1/duels/join", { code });
      await refresh();
      setCode(d.code);
    });
  const handleSignOut = () =>
    action(async () => {
      await api("/v1/session", undefined, "DELETE");
      await forget();
      setProfile(null);
      setSuggestRecovery(true);
      setTab("Jogar");
    });
  const handleDeleteAccount = () =>
    action(async () => {
      await api("/v1/me", undefined, "DELETE");
      await forget();
      setProfile(null);
      setDeleting(false);
      setSuggestRecovery(false);
      setTab("Jogar");
    });
  if (boot)
    return (
      <SafeAreaView style={s.screen}>
        <Text style={s.heading}>Carregando seu progresso…</Text>
      </SafeAreaView>
    );
  if (arcadeOpen)
    return (
      <Arcade
        player={profile}
        onBack={() => setArcadeOpen(false)}
        onLogin={() => {
          setReturnToArcade(true);
          setArcadeOpen(false);
        }}
      />
    );
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
          accessibilityLabel="Abrir novas salas e offline"
          onPress={() => setArcadeOpen(true)}
        >
          <Text style={s.brand}>duelou.</Text>
        </Pressable>
        {profile && (
          <View style={s.row}>
            <Text style={s.headerLabel}>
              NÍVEL {profile.level} · {profile.coins} MOEDAS
            </Text>
          </View>
        )}
      </LinearGradient>
      {!profile ? (
        <AuthScreen
          busy={busy}
          error={error}
          defaultRecoveryOpen={suggestRecovery}
          onCreate={handleCreateAccount}
          onRecover={(code) => handleRecover(code)}
        />
      ) : (
        <>
          <ScrollView contentContainerStyle={s.content}>
            <View style={s.between}>
              <Text style={s.heading}>
                {tab === "Jogar"
                  ? "Treino"
                  : tab === "Duelos"
                    ? "Jogue com amigos"
                    : tab}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => action(refresh)}
              >
                <Text style={s.accent}>{busy ? "…" : "Atualizar"}</Text>
              </Pressable>
            </View>
            {!!error && (
              <Text accessibilityRole="alert" style={s.error}>
                {error}
              </Text>
            )}
            {tab === "Jogar" ? (
              <TreinoTab
                profile={profile}
                daily={daily}
                difficulty={difficulty}
                setDifficulty={setDifficulty}
                busy={busy}
                onPlay={(game) => play(game)}
                onPlayDaily={playDaily}
              />
            ) : tab === "Duelos" ? (
              <DuelosTab
                connected={connected}
                code={code}
                setCode={setCode}
                difficulty={difficulty}
                setDifficulty={setDifficulty}
                duels={duels}
                profileId={profile.id}
                busy={busy}
                onJoinDuel={handleJoinDuel}
                onCreateDuel={create}
                onPlayDuel={play}
                onError={setError}
              />
            ) : tab === "Ranking" ? (
              <RankingTab ranking={ranking} profileId={profile.id} />
            ) : (
              <PerfilTab
                profile={profile}
                history={history}
                busy={busy}
                deleting={deleting}
                setDeleting={setDeleting}
                onSignOut={handleSignOut}
                onDeleteAccount={handleDeleteAccount}
              />
            )}
          </ScrollView>
          <View style={s.nav}>
            {["Jogar", "Duelos", "Ranking", "Perfil"].map((t) => (
              <Pressable
                key={t}
                accessibilityRole="button"
                onPress={() => setTab(t)}
              >
                <Text style={tab === t ? s.accent : s.muted}>
                  {t === "Jogar" ? "Treino" : t === "Duelos" ? "Online" : t}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
      <Modal
        visible={!!newRecoveryCode}
        animationType="fade"
        transparent
        onRequestClose={() => undefined}
      >
        <View style={s.overlay}>
          <LinearGradient colors={gradients.card} style={s.recoveryCard}>
            <Text style={s.label}>CÓDIGO DE RECUPERAÇÃO</Text>
            <Text style={s.heading}>Guarde antes de jogar</Text>
            <Text style={s.muted}>
              Este código é exibido uma única vez. Ele recupera seu jogador em
              outro aparelho e encerra a sessão antiga.
            </Text>
            <Text selectable style={s.recoveryCode}>
              {newRecoveryCode}
            </Text>
            <Button
              onPress={() =>
                Share.share({
                  message:
                    "Código de recuperação do Duelou: " + newRecoveryCode,
                }).catch((e) => setError(err(e)))
              }
            >
              Salvar ou compartilhar
            </Button>
            <Button
              onPress={() => {
                setNewRecoveryCode("");
                if (returnToArcade) {
                  setReturnToArcade(false);
                  setArcadeOpen(true);
                }
              }}
            >
              Já guardei o código
            </Button>
          </LinearGradient>
        </View>
      </Modal>
      <Modal
        visible={!!match}
        animationType="slide"
        onRequestClose={() => {
          if (!busy) setMatch(null);
        }}
      >
        <SafeAreaView style={s.screen}>
          <LinearGradient
            colors={gradients.hero}
            style={s.top}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={s.brand}>DUELOU</Text>
            <Pressable
              disabled={busy}
              onPress={() => {
                setMatch(null);
                action(refresh);
              }}
            >
              <Text style={s.headerAccent}>Fechar</Text>
            </Pressable>
          </LinearGradient>
          {match &&
            (result ? (
              <View style={s.round}>
                <Text style={s.label}>RESULTADO SALVO</Text>
                <AnimatedNumber value={result.score} style={s.big} />
                <Text style={s.heading}>
                  +{result.xp} XP · +{result.coins} moedas
                </Text>
                <Button
                  onPress={() => {
                    setMatch(null);
                    action(refresh);
                  }}
                >
                  Continuar
                </Button>
              </View>
            ) : pending ? (
              <View style={s.round}>
                <Text style={s.heading}>
                  {busy ? "Salvando resultado…" : "Resultado ainda não salvo"}
                </Text>
                {!!error && <Text style={s.error}>{error}</Text>}
                <Button disabled={busy} onPress={() => finish(pending)}>
                  Tentar salvar novamente
                </Button>
              </View>
            ) : (
              <GameRound key={match.id} match={match} finish={finish} />
            ))}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

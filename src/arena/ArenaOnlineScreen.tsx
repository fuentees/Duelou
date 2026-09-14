import React, { useEffect, useRef, useState } from "react";
import { Animated, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import useArenaSocket from "./useArenaSocket";
import MatchmakingScreen from "./MatchmakingScreen";
import ChallengePanel from "./ChallengePanel";
import HealthBar from "./HealthBar";
import Troop from "./Troop";
import ResultCard from "./ResultCard";
import BattlePresentation, { BattleMember } from "../arcade/BattlePresentation";
import { ENEMY_COLOR, PLAYER_COLOR } from "./colors";
import type { ArenaState, Side, TroopType } from "../../shared/arena/engine";
import { SUDDEN_DEATH_SECONDS } from "../../shared/arena/engine";
import { playFail, playSuccess } from "../audio/sounds";
import useReducedMotion from "../useReducedMotion";
import { palette, radius } from "../theme";
import Button from "../components/Button";
import LiveStatus from "../components/LiveStatus";
import Battlefield from "./Battlefield";
import { hasCompletedArenaTutorial, markArenaTutorialComplete } from "./onboarding";

// Quanto tempo o "poof" fica visível depois de uma tropa sumir (ver o
// comentário de EDGE_THRESHOLD abaixo sobre como decidimos "morreu" vs
// "chegou na base").
const POOF_DURATION_MS = 350;
const BASE_FLASH_MS = 220;
const DANGER_THRESHOLD = 25;
// Diferente do modo offline (que roda step() localmente e recebe os
// eventos troopDied/baseHit prontos), aqui só chegam retratos (snapshots)
// de "state" pelo socket — pra saber se uma tropa que sumiu morreu em
// combate (poof) ou chegou na base (sem poof, só o flash/tremor da base),
// comparamos com o retrato anterior: uma tropa só desaparece "perto da
// borda oposta" se tiver chegado lá (o motor a consome no mesmo tick que
// registra o dano); combate só acontece longe da borda, porque exige uma
// tropa inimiga no caminho.
const EDGE_THRESHOLD = 6;
// Quanto tempo o aviso de invocação fica na tela.
const SUMMON_TOAST_MS = 1100;
const TROOP_LABEL: Record<TroopType, string> = {
  scout: "⚡ Batedor",
  soldier: "🛡 Soldado",
  tank: "🛡🛡 Tanque",
};

type Poof = { key: number; position: number; side: Side };

export default function ArenaOnlineScreen({ onExit }: { onExit?: () => void }) {
  const socket = useArenaSocket();
  const reducedMotion = useReducedMotion();
  const [laneHeight, setLaneHeight] = useState(0);
  const [poofs, setPoofs] = useState<Poof[]>([]);
  const poofSeq = useRef(0);
  const [baseFlash, setBaseFlash] = useState({ player: false, enemy: false });
  const shakeX = useRef(new Animated.Value(0)).current;
  const prevStateRef = useRef<ArenaState | null>(null);
  const wasCriticalRef = useRef(false);
  // Aviso curto do que a última resposta produziu em campo. Sem isso, o
  // jogador acerta, alguma coisa nasce lá embaixo e ele não sabe o quê — e,
  // quando a pista está no teto, não nasce nada e ele nem fica sabendo.
  const [summon, setSummon] = useState<{ text: string; tone: "good" | "warn" } | null>(null);
  const lastAnswerSeqRef = useRef(0);
  // Quem nunca jogou uma partida da Arena Rush neste aparelho vê, no
  // resultado, como cada tropa é invocada. Isso já existia no modo contra o
  // robô e nunca tinha chegado ao PvP — que é justamente por onde todo mundo
  // entra hoje (ver LiveApp.tsx).
  const [isFirstMatch, setIsFirstMatch] = useState(false);
  useEffect(() => {
    let alive = true;
    hasCompletedArenaTutorial().then((done) => {
      if (alive) setIsFirstMatch(!done);
    });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (socket.phase === "ended") markArenaTutorialComplete();
  }, [socket.phase]);

  useEffect(() => {
    const answer = socket.lastAnswer;
    if (!answer || answer.seq === lastAnswerSeqRef.current) return;
    lastAnswerSeqRef.current = answer.seq;
    if (!answer.correct) {
      playFail();
      setSummon(null);
      return;
    }
    if (answer.spawned) {
      playSuccess();
      setSummon({ text: `${TROOP_LABEL[answer.troopType ?? "scout"]} invocado`, tone: "good" });
    } else {
      setSummon({ text: "Pista cheia — espere abrir espaço", tone: "warn" });
    }
    const timer = setTimeout(() => setSummon(null), SUMMON_TOAST_MS);
    return () => clearTimeout(timer);
  }, [socket.lastAnswer]);

  useEffect(() => {
    const prev = prevStateRef.current;
    const current = socket.state;
    prevStateRef.current = current;
    if (!prev || !current || prev === current) return;

    const currentIds = new Set(current.troops.map((t) => t.id));
    const newPoofs: Poof[] = [];
    for (const t of prev.troops) {
      if (currentIds.has(t.id)) continue;
      const nearEdge = t.side === "player" ? t.position >= 100 - EDGE_THRESHOLD : t.position <= EDGE_THRESHOLD;
      if (!nearEdge) newPoofs.push({ key: poofSeq.current++, position: t.position, side: t.side });
    }
    if (newPoofs.length) {
      setPoofs((p) => [...p, ...newPoofs]);
      newPoofs.forEach((p) => {
        setTimeout(() => setPoofs((prevPoofs) => prevPoofs.filter((x) => x.key !== p.key)), POOF_DURATION_MS);
      });
    }

    const hitPlayer = current.playerBaseHp < prev.playerBaseHp;
    const hitEnemy = current.enemyBaseHp < prev.enemyBaseHp;
    if (hitPlayer || hitEnemy) {
      setBaseFlash({ player: hitPlayer, enemy: hitEnemy });
      setTimeout(() => setBaseFlash({ player: false, enemy: false }), BASE_FLASH_MS);
      if (hitPlayer) playFail();
      if (!reducedMotion) {
        shakeX.setValue(0);
        Animated.sequence([
          Animated.timing(shakeX, { toValue: 6, duration: 40, useNativeDriver: true }),
          Animated.timing(shakeX, { toValue: -6, duration: 40, useNativeDriver: true }),
          Animated.timing(shakeX, { toValue: 3, duration: 40, useNativeDriver: true }),
          Animated.timing(shakeX, { toValue: 0, duration: 40, useNativeDriver: true }),
        ]).start();
      }
    }
    if (current.playerBaseHp < DANGER_THRESHOLD) wasCriticalRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket.state]);

  const handleExit = () => {
    socket.disconnect();
    onExit?.();
  };

  if (socket.phase === "connecting" || socket.phase === "queued")
    return <MatchmakingScreen status={socket.phase} onCancel={handleExit} />;

  // Se já tinha uma partida em andamento (temos "state"), a reconexão fica
  // dentro da própria tela de batalha (campo congelado + selo sobreposto,
  // ver abaixo) — só cai na tela cheia de "reconectando" se a queda
  // aconteceu antes de qualquer estado de batalha chegar (ex.: durante a
  // revelação do adversário).
  if (socket.phase === "reconnecting" && !socket.state)
    return (
      <MatchmakingScreen
        status="reconnecting"
        onCancel={handleExit}
        onRetry={socket.reconnectNow}
      />
    );

  if (socket.phase === "error")
    return (
      <MatchmakingScreen
        status="error"
        errorMessage={socket.errorMessage}
        onCancel={handleExit}
        onRetry={socket.reconnectNow}
      />
    );

  if (socket.phase === "matchFound") {
    const members: BattleMember[] =
      socket.me && socket.opponent
        ? [
            { id: socket.me.id, name: socket.me.name, avatar: socket.me.avatar, seriesWins: 0 },
            { id: socket.opponent.id, name: socket.opponent.name, avatar: socket.opponent.avatar, seriesWins: 0 },
          ]
        : [];
    return (
      <SafeAreaView style={s.screen}>
        <View style={s.center}>
          <BattlePresentation members={members} playerId={socket.me?.id} />
        </View>
      </SafeAreaView>
    );
  }

  const state = socket.state;

  // Sem seriesWins/melhor-de-N pra fazer sentido aqui (é uma partida só,
  // não uma série) — o resultado final é o ResultCard que já existe, sem
  // passar pela tela de "final" do BattlePresentation (essa é pensada pra
  // séries de várias provas).
  if (socket.phase === "ended" && state) {
    return (
      <SafeAreaView style={s.screen}>
        <ScrollView contentContainerStyle={[s.center, { flex: undefined, flexGrow: 1 }]}>
          {socket.opponentLeft && (
            <Text style={s.opponentLeft} accessibilityLiveRegion="polite">
              Seu adversário saiu da partida.
            </Text>
          )}
          <ResultCard
            state={state}
            showTutorialInfo={isFirstMatch}
            rating={socket.ratingDelta}
            avatar={socket.me?.avatar}
            playerName={socket.me?.name}
            comeback={state.winner === "player" && wasCriticalRef.current}
            onRematch={handleExit}
            rematchLabel="Voltar para jogar"
            onMenu={handleExit}
            onError={() => {}}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!state) return <MatchmakingScreen status="connecting" onCancel={handleExit} />;

  const playerFront = state.troops.reduce((m, t) => (t.side === "player" ? Math.max(m, t.position) : m), -1);
  const enemyFront = state.troops.reduce((m, t) => (t.side === "enemy" ? Math.min(m, t.position) : m), 101);
  const frontLine =
    playerFront >= 0 && enemyFront <= 100 && enemyFront - playerFront <= 10
      ? (playerFront + enemyFront) / 2
      : null;

  return (
    <SafeAreaView style={s.screen}>
      <Animated.View style={[s.match, { transform: [{ translateX: shakeX }] }]}>
        <View style={s.row}>
          <View style={s.opponentNameRow}>
            <Text style={s.caption}>ARENA RUSH · 1 × 1</Text>
            {socket.rttMs !== null && (
              <Text
                style={[
                  s.ping,
                  { color: socket.rttMs < 120 ? palette.green : socket.rttMs < 250 ? palette.amber : palette.red },
                ]}
                accessibilityLabel={`Sua conexão: ${socket.rttMs} milissegundos de ida e volta`}
              >
                {socket.rttMs} ms
              </Text>
            )}
          </View>
          <Text accessibilityLabel={`Tempo restante: ${Math.ceil(state.timeRemaining)} segundos`}
            style={{ fontSize: 20, fontWeight: "900", color: state.timeRemaining <= 15 ? palette.red : palette.text, fontVariant: ["tabular-nums"] }}>
            {Math.floor(Math.max(0, Math.ceil(state.timeRemaining)) / 60)}:{String(Math.max(0, Math.ceil(state.timeRemaining)) % 60).padStart(2, "0")}
          </Text>
        </View>
        {socket.phase === "reconnecting" && (
          <View style={s.reconnectingBanner} accessibilityLiveRegion="polite">
            <LiveStatus mode="inline" state="reconnecting" />
            <Text style={s.reconnectingBannerText}>Reconectando você à partida…</Text>
          </View>
        )}
        {state.timeRemaining <= SUDDEN_DEATH_SECONDS && !state.over && (
          <Text style={s.suddenDeath} accessibilityLiveRegion="polite">
            ⚡ MORTE SÚBITA · DANO NA BASE VALE O DOBRO
          </Text>
        )}
        <HealthBar
          label="BASE INIMIGA"
          hp={state.enemyBaseHp}
          color={ENEMY_COLOR}
          flash={baseFlash.enemy}
          danger={state.enemyBaseHp < DANGER_THRESHOLD}
        />
        <View style={s.lane} onLayout={(e) => setLaneHeight(e.nativeEvent.layout.height)}>
          <Battlefield />
          {frontLine !== null && (
            <View
              accessibilityElementsHidden
              style={[s.frontLine, { top: laneHeight * (1 - frontLine / 100) - 1 }]}
            />
          )}
          {state.troops.map((troop) => (
            <Troop key={troop.id} troop={troop} laneHeight={laneHeight} />
          ))}
          {summon && (
            <Text
              accessibilityLiveRegion="polite"
              style={[s.summon, summon.tone === "warn" ? s.summonWarn : s.summonGood]}
            >
              {summon.text}
            </Text>
          )}
          {poofs.map((p) => (
            <Text
              key={p.key}
              accessibilityElementsHidden
              style={[
                s.poof,
                {
                  top: laneHeight * (1 - p.position / 100) - 10,
                  color: p.side === "player" ? PLAYER_COLOR : ENEMY_COLOR,
                },
              ]}
            >
              💥
            </Text>
          ))}
        </View>
        <HealthBar
          label="SUA BASE"
          hp={state.playerBaseHp}
          color={PLAYER_COLOR}
          flash={baseFlash.player}
          danger={state.playerBaseHp < DANGER_THRESHOLD}
        />
        <View style={s.row}>
          <View style={s.opponentNameRow}>
            <Text style={s.caption}>{socket.opponent?.name || "Adversário"}</Text>
            {socket.opponentReconnecting && <LiveStatus mode="inline" state="reconnecting" />}
            {/* Ver o combo do rival é metade da tensão de um 1×1: o dado já
                chegava pelo socket e não aparecia em lugar nenhum. */}
            {state.combo.enemy >= 2 && (
              <Text style={s.enemyCombo}>🔥 x{state.combo.enemy}</Text>
            )}
          </View>
          {state.combo.player >= 2 && (
            <Text style={s.combo} accessibilityLiveRegion="polite">
              🔥 SEU COMBO x{state.combo.player}
            </Text>
          )}
        </View>
        <View style={s.panel}>
          {socket.challenge && (
            <ChallengePanel
              key={socket.challengeId}
              challenge={socket.challenge}
              onSubmit={(payload) => socket.submitAnswer(payload)}
              verdict={socket.verdict}
              reflexGo={socket.reflexGo}
            />
          )}
        </View>
        <Button secondary onPress={socket.forfeit}>
          Desistir
        </Button>
      </Animated.View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 24 },
  match: { flex: 1, padding: 12, gap: 8, width: "100%", maxWidth: 660, alignSelf: "center" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  opponentNameRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", flex: 1, minWidth: 0, gap: 8 },
  caption: { fontSize: 12, fontWeight: "700", color: palette.textFaint, flexShrink: 1 },
  combo: { fontSize: 13, fontWeight: "900", color: palette.amber },
  ping: { fontSize: 11, fontWeight: "800", fontVariant: ["tabular-nums"] },
  enemyCombo: { fontSize: 12, fontWeight: "900", color: ENEMY_COLOR },
  suddenDeath: {
    fontSize: 12,
    fontWeight: "900",
    color: palette.red,
    textAlign: "center",
    letterSpacing: 0.5,
  },
  summon: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 8,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "900",
    paddingVertical: 6,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  summonGood: { color: "#FFFFFF", backgroundColor: PLAYER_COLOR },
  summonWarn: { color: "#3A2A00", backgroundColor: palette.amber },
  opponentLeft: { fontSize: 13, fontWeight: "700", color: palette.textDim, textAlign: "center" },
  reconnectingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "center",
  },
  reconnectingBannerText: { fontSize: 12, fontWeight: "700", color: palette.textDim },
  frontLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: palette.amber,
    opacity: 0.6,
  },
  lane: {
    flex: 1,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.md,
    overflow: "hidden",
    position: "relative",
  },
  poof: { position: "absolute", left: "50%", marginLeft: -12, fontSize: 22 },
  panel: {
    padding: 16,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
});

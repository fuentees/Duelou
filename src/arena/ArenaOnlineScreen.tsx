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
import type { ArenaState, Side } from "../../shared/arena/engine";
import { playFail } from "../audio/sounds";
import useReducedMotion from "../useReducedMotion";
import { palette, radius } from "../theme";
import Button from "../components/Button";
import LiveStatus from "../components/LiveStatus";
import Battlefield from "./Battlefield";
import { invocationText } from "../../shared/arena/feedback";
import Pressy from "../components/Pressy";
import { TACTICS, MAX_TROOPS_PER_SIDE, type Tactic } from "../../shared/arena/engine";

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

type Poof = { key: number; position: number; side: Side };

export default function ArenaOnlineScreen({ onExit }: { onExit?: () => void }) {
  const socket = useArenaSocket();
  const [tactic, setTactic] = useState<Tactic>("balanced");
  const [showFeedback, setShowFeedback] = useState(false);
  useEffect(() => {
    if (!socket.lastAnswer) return;
    setShowFeedback(true);
    const timer = setTimeout(() => setShowFeedback(false), 2200);
    return () => clearTimeout(timer);
  }, [socket.lastAnswer]);
  const reducedMotion = useReducedMotion();
  const [laneHeight, setLaneHeight] = useState(0);
  const [poofs, setPoofs] = useState<Poof[]>([]);
  const poofSeq = useRef(0);
  const [baseFlash, setBaseFlash] = useState({ player: false, enemy: false });
  const shakeX = useRef(new Animated.Value(0)).current;
  const prevStateRef = useRef<ArenaState | null>(null);
  const wasCriticalRef = useRef(false);
  const [shareError, setShareError] = useState("");
  const effectTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const later = (callback: () => void, delay: number) => {
    const timer = setTimeout(() => {
      effectTimers.current.delete(timer);
      callback();
    }, delay);
    effectTimers.current.add(timer);
    return timer;
  };
  useEffect(
    () => () => {
      effectTimers.current.forEach(clearTimeout);
      effectTimers.current.clear();
      shakeX.stopAnimation();
    },
    [shakeX],
  );

  useEffect(() => {
    const prev = prevStateRef.current;
    const current = socket.state;
    prevStateRef.current = current;
    if (!prev || !current || prev === current) return;

    const currentIds = new Set(current.troops.map((t) => t.id));
    const newPoofs: Poof[] = [];
    for (const t of prev.troops) {
      if (currentIds.has(t.id)) continue;
      const nearEdge =
        t.side === "player"
          ? t.position >= 100 - EDGE_THRESHOLD
          : t.position <= EDGE_THRESHOLD;
      if (!nearEdge)
        newPoofs.push({
          key: poofSeq.current++,
          position: t.position,
          side: t.side,
        });
    }
    if (newPoofs.length && !reducedMotion) {
      setPoofs((p) => [...p, ...newPoofs]);
      newPoofs.forEach((p) => {
        later(
          () =>
            setPoofs((prevPoofs) => prevPoofs.filter((x) => x.key !== p.key)),
          POOF_DURATION_MS,
        );
      });
    }

    const hitPlayer = current.playerBaseHp < prev.playerBaseHp;
    const hitEnemy = current.enemyBaseHp < prev.enemyBaseHp;
    if (hitPlayer || hitEnemy) {
      if (!reducedMotion) {
        setBaseFlash({ player: hitPlayer, enemy: hitEnemy });
        if (flashTimer.current) {
          clearTimeout(flashTimer.current);
          effectTimers.current.delete(flashTimer.current);
        }
        flashTimer.current = later(
          () => setBaseFlash({ player: false, enemy: false }),
          BASE_FLASH_MS,
        );
      }
      if (hitPlayer) playFail();
      if (!reducedMotion) {
        shakeX.setValue(0);
        Animated.sequence([
          Animated.timing(shakeX, {
            toValue: 6,
            duration: 40,
            useNativeDriver: true,
          }),
          Animated.timing(shakeX, {
            toValue: -6,
            duration: 40,
            useNativeDriver: true,
          }),
          Animated.timing(shakeX, {
            toValue: 3,
            duration: 40,
            useNativeDriver: true,
          }),
          Animated.timing(shakeX, {
            toValue: 0,
            duration: 40,
            useNativeDriver: true,
          }),
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
            {
              id: socket.me.id,
              name: socket.me.name,
              avatar: socket.me.avatar,
              seriesWins: 0,
            },
            {
              id: socket.opponent.id,
              name: socket.opponent.name,
              avatar: socket.opponent.avatar,
              seriesWins: 0,
            },
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
        <ScrollView
          contentContainerStyle={[s.center, { flex: undefined, flexGrow: 1 }]}
        >
          {!!shareError && (
            <Text accessibilityRole="alert" style={{ color: palette.red }}>
              {shareError}
            </Text>
          )}
          {socket.opponentLeft && (
            <Text style={s.opponentLeft} accessibilityLiveRegion="polite">
              Seu adversário saiu da partida.
            </Text>
          )}
          <ResultCard
            state={state}
            avatar={socket.me?.avatar}
            playerName={socket.me?.name}
            comeback={state.winner === "player" && wasCriticalRef.current}
            onRematch={handleExit}
            rematchLabel="Voltar para jogar"
            onMenu={handleExit}
            onError={() =>
              setShareError(
                "Não foi possível compartilhar. Tente novamente pelo botão abaixo.",
              )
            }
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!state)
    return <MatchmakingScreen status="connecting" onCancel={handleExit} />;

  const playerFront = state.troops.reduce(
    (m, t) => (t.side === "player" ? Math.max(m, t.position) : m),
    -1,
  );
  const enemyFront = state.troops.reduce(
    (m, t) => (t.side === "enemy" ? Math.min(m, t.position) : m),
    101,
  );
  const frontLine =
    playerFront >= 0 && enemyFront <= 100 && enemyFront - playerFront <= 10
      ? (playerFront + enemyFront) / 2
      : null;

  return (
    <SafeAreaView style={s.screen}>
      <Animated.View style={[s.match, { transform: [{ translateX: shakeX }] }]}>
        <View style={s.row}>
          <Text style={s.caption}>ARENA RUSH · 1 × 1</Text>
          <Text
            accessibilityLabel={`Tempo restante: ${Math.ceil(state.timeRemaining)} segundos`}
            style={{
              fontSize: 20,
              fontWeight: "900",
              color: state.timeRemaining <= 15 ? palette.red : palette.text,
              fontVariant: ["tabular-nums"],
            }}
          >
            {Math.floor(Math.max(0, Math.ceil(state.timeRemaining)) / 60)}:
            {String(Math.max(0, Math.ceil(state.timeRemaining)) % 60).padStart(
              2,
              "0",
            )}
          </Text>
        </View>
        {socket.phase === "reconnecting" && (
          <View style={s.reconnectingBanner} accessibilityLiveRegion="polite">
            <LiveStatus mode="inline" state="reconnecting" />
            <Text style={s.reconnectingBannerText}>
              Reconectando você à partida…
            </Text>
          </View>
        )}
        <HealthBar
          label="BASE INIMIGA"
          hp={state.enemyBaseHp}
          color={ENEMY_COLOR}
          flash={baseFlash.enemy}
          danger={state.enemyBaseHp < DANGER_THRESHOLD}
        />
        <View
          style={s.lane}
          onLayout={(e) => setLaneHeight(e.nativeEvent.layout.height)}
        >
          <Battlefield />
          {showFeedback && socket.lastAnswer && <View pointerEvents="none" style={{ position: "absolute", top: 12, left: 8, right: 8, zIndex: 10, padding: 10, borderRadius: 12, backgroundColor: "#FFFFFFEE" }}>
            <Text accessibilityLiveRegion="polite" style={{ color: socket.lastAnswer.correct ? palette.green : palette.red, fontSize: 12, fontWeight: "800", textAlign: "center" }}>{invocationText(socket.lastAnswer)}</Text>
          </View>}
          {frontLine !== null && (
            <View
              accessibilityElementsHidden
              style={[
                s.frontLine,
                { top: laneHeight * (1 - frontLine / 100) - 1 },
              ]}
            />
          )}
          {state.troops.map((troop) => (
            <Troop
              key={troop.id}
              troop={troop}
              laneHeight={laneHeight}
              avatar={
                troop.side === "player"
                  ? socket.me?.avatar
                  : socket.opponent?.avatar
              }
            />
          ))}
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
            <Text style={s.caption}>
              {socket.opponent?.name || "Adversário"}
            </Text>
            {socket.opponentReconnecting && (
              <LiveStatus mode="inline" state="reconnecting" />
            )}
          </View>
          {state.combo.player >= 2 && (
            <Text style={s.combo} accessibilityLiveRegion="polite">
              🔥 combo x{state.combo.player}
            </Text>
          )}
        </View>
        <View style={{ gap: 4 }}>
          <Text style={s.caption}>
            Tropas: {state.troops.filter(t => t.side === "player").length}/{MAX_TROOPS_PER_SIDE}
            {state.troops.filter(t => t.side === "player").length >= MAX_TROOPS_PER_SIDE ? " · Campo cheio; acertos mantêm o combo." : " · Escolha a próxima invocação"}
          </Text>
          <View style={{ flexDirection: "row", gap: 4 }}>
            {(Object.keys(TACTICS) as Tactic[]).map((id) => (
              <Pressy
                key={id}
                accessibilityRole="radio"
                accessibilityLabel={`Estratégia: ${TACTICS[id].name}`}
                accessibilityState={{ checked: tactic === id }}
                onPress={() => setTactic(id)}
                outerStyle={{ flex: 1 }}
                style={{
                  minHeight: 44,
                  justifyContent: "center",
                  alignItems: "center",
                  borderRadius: 10,
                  backgroundColor:
                    tactic === id ? palette.violet : palette.surfaceAlt,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "800",
                    color: tactic === id ? "#FFFFFF" : palette.text,
                  }}
                >
                  {TACTICS[id].name}
                </Text>
              </Pressy>
            ))}
          </View>
          <Text style={{ fontSize: 11, color: palette.textDim }}>
            {tactic === "rush"
              ? "Próximas tropas: +30% velocidade, −20% vida."
              : tactic === "guard"
                ? "Próximas tropas: +30% vida, −20% velocidade."
                : "Próximas tropas: vida e velocidade normais."}
          </Text>
        </View>
        <View style={s.panel}>
          {(socket.phase !== "playing" || socket.opponentReconnecting) && (
            <Text accessibilityLiveRegion="polite" style={s.caption}>
              Partida pausada. Aguarde a reconexão para responder.
            </Text>
          )}
          {socket.challenge && (
            <ChallengePanel
              key={socket.challengeId}
              challenge={socket.challenge}
              onSubmit={(payload) =>
                socket.submitAnswer({ ...payload, tactic })
              }
              verdict={socket.verdict}
              reflexGo={socket.reflexGo}
              disabled={
                socket.phase !== "playing" || socket.opponentReconnecting
              }
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
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 24,
  },
  match: {
    flex: 1,
    padding: 12,
    gap: 8,
    width: "100%",
    maxWidth: 660,
    alignSelf: "center",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  opponentNameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  caption: {
    fontSize: 12,
    fontWeight: "700",
    color: palette.textFaint,
    flexShrink: 1,
  },
  combo: { fontSize: 13, fontWeight: "900", color: palette.amber },
  opponentLeft: {
    fontSize: 13,
    fontWeight: "700",
    color: palette.textDim,
    textAlign: "center",
  },
  reconnectingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "center",
  },
  reconnectingBannerText: {
    fontSize: 12,
    fontWeight: "700",
    color: palette.textDim,
  },
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

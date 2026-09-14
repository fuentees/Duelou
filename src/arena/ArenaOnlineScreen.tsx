import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import useArenaSocket, { ArenaIntent } from "./useArenaSocket";
import MatchmakingScreen from "./MatchmakingScreen";
import ChallengePanel from "./ChallengePanel";
import HealthBar from "./HealthBar";
import Troop from "./Troop";
import ResultCard from "./ResultCard";
import BattlePresentation, { BattleMember } from "../arcade/BattlePresentation";
import { ENEMY_COLOR, PLAYER_COLOR } from "./colors";
import type { ArenaState, Side, TroopType } from "../../shared/arena/engine";
import { COMBO_SPEND_COST, SUDDEN_DEATH_SECONDS } from "../../shared/arena/engine";
import { playFail, playSuccess } from "../audio/sounds";
import useReducedMotion from "../useReducedMotion";
import { arena, palette, radius } from "../theme";
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
// Sem emoji: o escudo (🛡) não existe em toda fonte e aparece como outro
// símbolo em parte dos aparelhos e navegadores. Em campo a tropa já se
// distingue por forma, tamanho e ícone (ver Troop.tsx).
const TROOP_LABEL: Record<TroopType, string> = {
  scout: "Batedor",
  soldier: "Soldado",
  tank: "Tanque",
};

type Poof = { key: number; position: number; side: Side };

export default function ArenaOnlineScreen({
  onExit,
  onTrainWithBot,
  intent = { type: "queue" },
}: {
  onExit?: () => void;
  onTrainWithBot?: () => void;
  // Fila normal, criando convite pra um amigo ou entrando num código.
  intent?: ArenaIntent;
}) {
  const socket = useArenaSocket(intent);
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
      setSummon({
        text:
          answer.source === "combo"
            ? "Combo insuficiente ou pista cheia"
            : "Pista cheia — espere abrir espaço",
        tone: "warn",
      });
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

  // Contagem da largada: sem ela, o primeiro desafio aparecia de surpresa,
  // logo depois da revelação do adversário.
  const [countdown, setCountdown] = useState<number | null>(null);
  useEffect(() => {
    const endsAt = socket.countdownEndsAt;
    if (socket.phase !== "matchFound" || !endsAt) {
      setCountdown(null);
      return;
    }
    setCountdown(endsAt - Date.now());
    const timer = setInterval(() => setCountdown(endsAt - Date.now()), 120);
    return () => clearInterval(timer);
  }, [socket.phase, socket.countdownEndsAt]);

  const handleExit = () => {
    socket.disconnect();
    onExit?.();
  };

  if (socket.phase === "connecting" || socket.phase === "queued")
    return (
      <MatchmakingScreen
        status={socket.phase}
        onCancel={handleExit}
        inviteCode={socket.inviteCode}
        waitingForFriend={intent.type !== "queue"}
        onTrainWithBot={
          intent.type !== "queue"
            ? undefined
            : 
              onTrainWithBot &&
              (() => {
                // Sai da fila antes de ir treinar: ficar na fila enquanto joga
                // contra o robô faria o adversário de verdade cair numa partida
                // sem ninguém do outro lado.
                socket.leaveQueue();
                socket.disconnect();
                onTrainWithBot();
              })
        }
      />
    );

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
    const secondsToStart = countdown === null ? null : Math.max(0, Math.ceil(countdown / 1000));
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
          {secondsToStart !== null && (
            <Text style={s.countdown} accessibilityLiveRegion="assertive">
              {secondsToStart > 0 ? secondsToStart : "JÁ!"}
            </Text>
          )}
          <Text style={s.countdownHint}>
            {secondsToStart && secondsToStart > 0
              ? "Prepare o polegar: o primeiro desafio aparece já já."
              : "Responda para invocar."}
          </Text>
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
        {/* Sem centralizar na vertical: o conteúdo do resultado é mais alto
            que a tela, e um container centralizado que transborda corta o
            topo — era o que escondia a revanche e deixava o começo do card
            fora de alcance, sem rolagem que chegasse lá. */}
        <ScrollView contentContainerStyle={s.endedContent}>
          {socket.opponentLeft && (
            <Text style={s.opponentLeft} accessibilityLiveRegion="polite">
              Seu adversário saiu da partida.
            </Text>
          )}
          {/* Revanche: reencontra quem você acabou de enfrentar, sem voltar
              pra fila e correr o risco de cair com outra pessoa. */}
          <View style={s.rematchBox}>
            {socket.rematch === "offered" && (
              <Text style={s.rematchText} accessibilityLiveRegion="polite">
                {socket.opponent?.name || "Seu adversário"} quer a revanche.
              </Text>
            )}
            {socket.rematch === "waiting" && (
              <Text style={s.rematchText} accessibilityLiveRegion="polite">
                Revanche chamada — esperando a resposta.
              </Text>
            )}
            {socket.rematch === "declined" && (
              <Text style={s.rematchText} accessibilityLiveRegion="polite">
                A revanche não rolou desta vez. Dá pra procurar outro adversário.
              </Text>
            )}
            {socket.rematch !== "waiting" && socket.rematch !== "declined" && (
              <Button onPress={socket.askRematch}>
                {socket.rematch === "offered" ? "Aceitar revanche" : "Revanche"}
              </Button>
            )}
          </View>
          <ResultCard
            state={state}
            showTutorialInfo={isFirstMatch}
            rating={socket.ratingDelta}
            friendly={socket.friendly}
            avatar={socket.me?.avatar}
            playerName={socket.me?.name}
            comeback={state.winner === "player" && wasCriticalRef.current}
            onRematch={socket.playAgain}
            rematchLabel="Jogar outra"
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
                  { color: socket.rttMs < 120 ? arena.good : socket.rttMs < 250 ? arena.warn : arena.danger },
                ]}
                accessibilityLabel={`Sua conexão: ${socket.rttMs} milissegundos de ida e volta`}
              >
                {socket.rttMs} ms
              </Text>
            )}
          </View>
          <Text accessibilityLabel={`Tempo restante: ${Math.ceil(state.timeRemaining)} segundos`}
            style={{
              fontSize: 26,
              fontWeight: "900",
              color: state.timeRemaining <= SUDDEN_DEATH_SECONDS ? arena.danger : arena.text,
              fontVariant: ["tabular-nums"],
            }}>
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
          dark
          label="BASE INIMIGA"
          name={socket.opponent?.name || "Adversário"}
          avatar={socket.opponent?.avatar}
          hp={state.enemyBaseHp}
          color={ENEMY_COLOR}
          flash={baseFlash.enemy}
          danger={state.enemyBaseHp < DANGER_THRESHOLD}
          trailing={
            <>
              {socket.opponentReconnecting && <LiveStatus mode="inline" state="reconnecting" />}
              {/* Ver o combo do rival é metade da tensão de um 1×1: o dado
                  já chegava pelo socket e não aparecia em lugar nenhum. */}
              {state.combo.enemy >= 2 && (
                <Text style={s.enemyCombo}>🔥 x{state.combo.enemy}</Text>
              )}
            </>
          }
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
          dark
          label="SUA BASE"
          name={socket.me?.name || "Você"}
          avatar={socket.me?.avatar}
          hp={state.playerBaseHp}
          color={PLAYER_COLOR}
          flash={baseFlash.player}
          danger={state.playerBaseHp < DANGER_THRESHOLD}
          trailing={
            state.combo.player >= 2 ? (
              <Text style={s.combo} accessibilityLiveRegion="polite">
                🔥 COMBO x{state.combo.player}
              </Text>
            ) : null
          }
        />
        {/* A única decisão da partida que não é "responda mais rápido":
            segurar o combo deixa as próximas invocações mais fortes, gastar
            coloca um tanque em campo agora. */}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: state.combo.player < COMBO_SPEND_COST }}
          accessibilityLabel={
            state.combo.player >= COMBO_SPEND_COST
              ? "Gastar combo para invocar um tanque agora"
              : `Invocar tanque: precisa de combo ${COMBO_SPEND_COST}, você tem ${state.combo.player}`
          }
          disabled={state.combo.player < COMBO_SPEND_COST}
          onPress={socket.useCombo}
          style={[
            s.comboButton,
            state.combo.player >= COMBO_SPEND_COST ? s.comboButtonReady : null,
          ]}
        >
          <Text
            style={[
              s.comboButtonText,
              state.combo.player >= COMBO_SPEND_COST ? s.comboButtonTextReady : null,
            ]}
          >
            {state.combo.player >= COMBO_SPEND_COST
              ? `INVOCAR TANQUE AGORA · GASTA COMBO x${COMBO_SPEND_COST}`
              : `Tanque na hora: combo ${state.combo.player}/${COMBO_SPEND_COST}`}
          </Text>
        </Pressable>
        <View style={s.panel}>
          {socket.challenge && (
            <ChallengePanel
              dark
              key={socket.challengeId}
              challenge={socket.challenge}
              onSubmit={(payload) => socket.submitAnswer(payload)}
              verdict={socket.verdict}
              reflexGo={socket.reflexGo}
            />
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={socket.forfeit}
          style={s.forfeit}
        >
          <Text style={s.forfeitText}>Desistir</Text>
        </Pressable>
      </Animated.View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: arena.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 24 },
  endedContent: { alignItems: "center", gap: 16, padding: 24, paddingBottom: 40, flexGrow: 1 },
  match: { flex: 1, padding: 12, gap: 8, width: "100%", maxWidth: 660, alignSelf: "center" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  opponentNameRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", flex: 1, minWidth: 0, gap: 8 },
  caption: { fontSize: 12, fontWeight: "800", color: arena.textFaint, flexShrink: 1, letterSpacing: 0.5 },
  combo: { fontSize: 13, fontWeight: "900", color: arena.warn },
  ping: { fontSize: 11, fontWeight: "800", fontVariant: ["tabular-nums"] },
  countdown: {
    fontSize: 64,
    fontWeight: "900",
    color: arena.text,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
  },
  countdownHint: { fontSize: 13, color: arena.textDim, textAlign: "center" },
  rematchBox: { alignSelf: "stretch", gap: 8, maxWidth: 420, width: "100%" },
  rematchText: { fontSize: 14, fontWeight: "700", color: arena.text, textAlign: "center" },
  enemyCombo: { fontSize: 12, fontWeight: "900", color: ENEMY_COLOR },
  suddenDeath: {
    fontSize: 12,
    fontWeight: "900",
    color: arena.danger,
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
  summonWarn: { color: "#3A2A00", backgroundColor: arena.warn },
  opponentLeft: { fontSize: 13, fontWeight: "700", color: arena.textDim, textAlign: "center" },
  reconnectingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "center",
  },
  reconnectingBannerText: { fontSize: 12, fontWeight: "700", color: arena.textDim },
  frontLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: arena.warn,
    opacity: 0.6,
  },
  lane: {
    flex: 1,
    // Piso pra pista não virar uma faixa fina entre as barras de vida e o
    // painel — mas com flexShrink, senão numa tela baixa a soma das alturas
    // mínimas empurra o "Desistir" pra fora da tela (era o que acontecia
    // depois que o botão de combo entrou).
    minHeight: 150,
    flexShrink: 1,
    backgroundColor: arena.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: arena.border,
    overflow: "hidden",
    position: "relative",
  },
  poof: { position: "absolute", left: "50%", marginLeft: -12, fontSize: 22 },
  panel: {
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: arena.surface,
    borderWidth: 1,
    borderColor: arena.border,
    // Altura mínima pro painel não "pular" entre um desafio de escolha (com
    // enunciado e quatro alternativas) e um de reflexo (um botão só).
    minHeight: 172,
    flexShrink: 0,
    justifyContent: "center",
  },
  comboButton: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: arena.border,
    backgroundColor: arena.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  comboButtonReady: { backgroundColor: arena.warn, borderColor: arena.warn },
  comboButtonText: { fontSize: 13, fontWeight: "800", color: arena.textFaint, textAlign: "center" },
  comboButtonTextReady: { color: "#2A1D00", fontWeight: "900" },
  forfeit: { alignSelf: "center", minHeight: 44, minWidth: 96, justifyContent: "center", flexShrink: 0 },
  forfeitText: { color: arena.textFaint, fontWeight: "800", fontSize: 13, textAlign: "center" },
});

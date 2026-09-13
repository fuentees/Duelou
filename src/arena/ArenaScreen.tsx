import React, { useEffect, useRef, useState } from "react";
import { Animated, AppState, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArenaState,
  FAST_CHOICE_MS,
  FAST_REFLEX_MS,
  Side,
  createArenaState,
  decideTroopType,
  spawn,
  step,
} from "../../shared/arena/engine";
import { ArenaChallenge, nextChallenge, resetChallengeSequence } from "./challenges";
import ChallengePanel from "./ChallengePanel";
import Troop from "./Troop";
import ResultCard from "./ResultCard";
import { ENEMY_COLOR, PLAYER_COLOR } from "./colors";
import type { BotDifficulty } from "./bot";
import { createBotState, stepBot } from "./bot";
import { hasCompletedArenaTutorial, markArenaTutorialComplete } from "./onboarding";
import { playFail, playSuccess } from "../audio/sounds";
import useReducedMotion from "../useReducedMotion";
import { palette, radius } from "../theme";
import Button from "../components/Button";

type Screen = "start" | "playing" | "end";
const MATCH_SECONDS = 100;
// Pequena pausa depois de responder, pra dar tempo de ver o feedback
// certo/errado antes do próximo desafio aparecer.
const NEXT_CHALLENGE_DELAY_MS = 280;
// Quanto tempo o "poof" fica visível depois de uma tropa morrer.
const POOF_DURATION_MS = 350;
// Quanto tempo o flash branco fica na barra de vida atingida.
const BASE_FLASH_MS = 220;
// Abaixo disso (de 100), a base entra em "modo perigo" (cor de alerta).
const DANGER_THRESHOLD = 25;

type Poof = { key: number; position: number; side: Side };

export default function ArenaScreen({
  difficulty = "medium",
  onExit,
}: {
  // Ticket 9 usa "easy" na primeira partida do onboarding.
  difficulty?: BotDifficulty;
  // Sem isso (antes do Ticket 9 ligar a navegação de verdade), "Menu" só
  // volta pra tela inicial da própria Arena.
  onExit?: () => void;
}) {
  const [screen, setScreen] = useState<Screen>("start");
  const screenRef = useRef<Screen>("start");
  const setScreenState = (next: Screen) => {
    screenRef.current = next;
    setScreen(next);
  };

  const arenaRef = useRef<ArenaState>(createArenaState(MATCH_SECONDS));
  const [, bump] = useState(0);
  const rerender = () => bump((n) => n + 1);

  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const botRef = useRef(createBotState(difficulty));

  // null enquanto ainda não sabemos se este aparelho já jogou antes —
  // "Entrar na Arena" fica desabilitado esse tempinho pra não começar com a
  // dificuldade errada por engano.
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const [isTutorial, setIsTutorial] = useState(false);
  useEffect(() => {
    let alive = true;
    hasCompletedArenaTutorial().then((done) => {
      if (alive) setOnboarded(done);
    });
    return () => {
      alive = false;
    };
  }, []);

  // TODO(Ticket 6/replay): trocar por um random com seed pra permitir repetir
  // uma partida — por enquanto Math.random é aceitável (motor não depende
  // disso pra nada além de uma pequena variação de dano no combate).
  const random = () => Math.random();

  const [challenge, setChallenge] = useState<ArenaChallenge | null>(null);
  const [challengeSeq, setChallengeSeq] = useState(0);
  const nextChallengeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reducedMotion = useReducedMotion();
  const [laneHeight, setLaneHeight] = useState(0);
  const [poofs, setPoofs] = useState<Poof[]>([]);
  const poofSeq = useRef(0);
  const [baseFlash, setBaseFlash] = useState<{ player: boolean; enemy: boolean }>({
    player: false,
    enemy: false,
  });
  const shakeX = useRef(new Animated.Value(0)).current;
  // Guarda a posição de cada tropa no tick anterior — quando uma morre, o
  // evento troopDied não carrega posição (já foi removida do estado), então
  // é daqui que tiramos "mais ou menos onde" pra colocar o poof.
  const lastPositions = useRef<Map<number, { position: number; side: Side }>>(new Map());
  // Se a própria base chegou a ficar crítica em algum momento e ainda assim
  // a partida foi vencida — vira o destaque "virou nos últimos segundos" no
  // cartão de resultado (Ticket 8).
  const wasCriticalRef = useRef(false);
  const [shareError, setShareError] = useState("");

  const queueNextChallenge = () => {
    const state = arenaRef.current;
    if (nextChallengeTimer.current) clearTimeout(nextChallengeTimer.current);
    nextChallengeTimer.current = setTimeout(() => {
      if (screenRef.current !== "playing") return;
      setChallenge(nextChallenge(random, state.stats.challengesTotal));
      setChallengeSeq((n) => n + 1);
    }, NEXT_CHALLENGE_DELAY_MS);
  };

  // Regra de invocação (decideTroopType, em shared/arena/engine.ts): acerto
  // rápido OU combo >= 3 sai soldier; os dois juntos saem tank; acerto normal
  // sai scout; erro não invoca nada e zera o combo. Compartilhada com o
  // futuro motor do servidor (PvP), pra não divergir do que sai aqui offline.
  const handleAnswer = (correct: boolean, elapsedMs: number) => {
    const state = arenaRef.current;
    const kind = challenge?.kind;
    state.stats.challengesTotal++;
    if (!correct) {
      state.combo = 0;
      playFail();
    } else {
      state.combo++;
      state.stats.maxCombo = Math.max(state.stats.maxCombo, state.combo);
      const fast = kind === "reflex" ? elapsedMs < FAST_REFLEX_MS : elapsedMs < FAST_CHOICE_MS;
      const troopType = decideTroopType(fast, state.combo);
      spawn(state, "player", troopType);
      state.stats.hits++;
      playSuccess();
    }
    rerender();
    queueNextChallenge();
  };

  const tick = (ts: number) => {
    if (screenRef.current !== "playing") return;
    if (lastTsRef.current === null) lastTsRef.current = ts;
    // Limita o dt: depois de um frame perdido (ou de voltar do 2º plano) não
    // dá pra simular "de uma vez" o tempo todo que passou.
    const dt = Math.min(0.25, (ts - lastTsRef.current) / 1000);
    lastTsRef.current = ts;

    const state = arenaRef.current;
    stepBot(state, botRef.current, dt, random);
    const events = step(state, dt, random);
    const died = events.filter((e) => e.type === "troopDied") as Extract<
      (typeof events)[number],
      { type: "troopDied" }
    >[];
    if (died.length) {
      const newPoofs = died.map((e) => ({
        key: poofSeq.current++,
        position: lastPositions.current.get(e.id)?.position ?? (e.side === "player" ? 100 : 0),
        side: e.side,
      }));
      setPoofs((prev) => [...prev, ...newPoofs]);
      newPoofs.forEach((p) => {
        setTimeout(() => setPoofs((prev) => prev.filter((x) => x.key !== p.key)), POOF_DURATION_MS);
      });
    }
    lastPositions.current = new Map(state.troops.map((t) => [t.id, { position: t.position, side: t.side }]));

    const baseHits = events.filter((e) => e.type === "baseHit") as Extract<
      (typeof events)[number],
      { type: "baseHit" }
    >[];
    if (baseHits.length) {
      const hitPlayer = baseHits.some((e) => e.side === "player");
      const hitEnemy = baseHits.some((e) => e.side === "enemy");
      setBaseFlash({ player: hitPlayer, enemy: hitEnemy });
      setTimeout(() => setBaseFlash({ player: false, enemy: false }), BASE_FLASH_MS);
      // Som só pra quando é a SUA base — evita repetir o mesmo som de
      // acerto/erro do painel de desafio com frequência demais.
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
    if (state.playerBaseHp < DANGER_THRESHOLD) wasCriticalRef.current = true;
    rerender();
    if (events.some((e) => e.type === "matchOver")) {
      setScreenState("end");
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    if (screen !== "playing") return;
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [screen]);

  // Pausa de verdade em segundo plano — cancela o loop (não só zera o
  // relógio), senão o navegador/SO pode continuar chamando o callback com
  // dt gigante quando o app volta.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active") {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
      } else if (screenRef.current === "playing" && rafRef.current === null) {
        lastTsRef.current = null;
        rafRef.current = requestAnimationFrame(tick);
      }
    });
    return () => sub.remove();
  }, []);

  const startMatch = () => {
    // A primeira partida de quem nunca jogou é sempre fácil e com dica —
    // independente do que foi passado por prop (Ticket 9).
    const tutorial = onboarded === false;
    setIsTutorial(tutorial);
    arenaRef.current = createArenaState(MATCH_SECONDS);
    lastTsRef.current = null;
    botRef.current = createBotState(tutorial ? "easy" : difficulty);
    lastPositions.current = new Map();
    setPoofs([]);
    setBaseFlash({ player: false, enemy: false });
    shakeX.setValue(0);
    wasCriticalRef.current = false;
    setShareError("");
    resetChallengeSequence();
    setChallenge(nextChallenge(random, 0));
    setChallengeSeq((n) => n + 1);
    setScreenState("playing");
  };

  const handleMenu = () => {
    if (onExit) onExit();
    else setScreenState("start");
  };

  // Fim do tutorial: marca como concluído (não repete numa revanche, nem em
  // sessões futuras) assim que a primeira partida termina, ganhando ou não —
  // é sobre já ter jogado uma vez, não sobre ter vencido.
  useEffect(() => {
    if (screen === "end" && isTutorial) {
      setOnboarded(true);
      markArenaTutorialComplete();
    }
  }, [screen, isTutorial]);

  // Nenhum desafio pendente deveria resolver sozinho depois que a tela sai
  // do ar ou a partida acaba (senão viraria um "boneco fantasma" invocado
  // sem ninguém ver).
  useEffect(() => {
    return () => {
      if (nextChallengeTimer.current) clearTimeout(nextChallengeTimer.current);
    };
  }, []);
  useEffect(() => {
    if (screen !== "playing" && nextChallengeTimer.current) {
      clearTimeout(nextChallengeTimer.current);
      nextChallengeTimer.current = null;
    }
  }, [screen]);

  const state = arenaRef.current;
  // Onde os dois exércitos se encontram — mesmo sem estarem literalmente
  // trocando dano neste instante, dá pra ver pra onde a disputa está indo.
  // null quando não há choque de verdade (times ainda distantes ou lado sem
  // tropa nenhuma).
  const playerFront = state.troops.reduce((m, t) => (t.side === "player" ? Math.max(m, t.position) : m), -1);
  const enemyFront = state.troops.reduce((m, t) => (t.side === "enemy" ? Math.min(m, t.position) : m), 101);
  const frontLine =
    playerFront >= 0 && enemyFront <= 100 && enemyFront - playerFront <= 10
      ? (playerFront + enemyFront) / 2
      : null;

  return (
    <SafeAreaView style={s.screen}>
      {screen === "start" ? (
        <View style={s.center}>
          <Text style={s.eyebrow}>EXPERIMENTAL · BETA</Text>
          <Text style={s.title}>Arena Rush</Text>
          <Text style={s.body}>
            Responda desafios pra invocar bonecos e derrube a base do
            adversário antes que ele derrube a sua.
          </Text>
          <Button disabled={onboarded === null} onPress={startMatch}>
            Entrar na Arena
          </Button>
        </View>
      ) : screen === "playing" ? (
        <Animated.View style={[s.match, { transform: [{ translateX: shakeX }] }]}>
          {isTutorial && (
            <Text style={s.tutorialHint} accessibilityLiveRegion="polite">
              💡 Acerte um desafio pra invocar um boneco — ele anda sozinho até
              a base inimiga e causa dano quando chega lá.
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
            {frontLine !== null && (
              <View
                accessibilityElementsHidden
                style={[s.frontLine, { top: laneHeight * (1 - frontLine / 100) - 1 }]}
              />
            )}
            {state.troops.map((troop) => (
              <Troop key={troop.id} troop={troop} laneHeight={laneHeight} />
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
            <Text style={s.caption}>Tempo restante: {Math.ceil(state.timeRemaining)}s</Text>
            {state.combo >= 2 && (
              <Text style={s.combo} accessibilityLiveRegion="polite">
                🔥 combo x{state.combo}
              </Text>
            )}
          </View>
          <View style={s.panel}>
            {challenge && (
              <ChallengePanel key={challengeSeq} challenge={challenge} onAnswer={handleAnswer} />
            )}
          </View>
        </Animated.View>
      ) : (
        <View style={s.center}>
          {!!shareError && (
            <Text accessibilityRole="alert" style={s.shareError}>
              {shareError}
            </Text>
          )}
          <ResultCard
            state={state}
            comeback={state.winner === "player" && wasCriticalRef.current}
            showTutorialInfo={isTutorial}
            onRematch={startMatch}
            onMenu={handleMenu}
            onError={setShareError}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

function HealthBar({
  label,
  hp,
  color,
  flash = false,
  danger = false,
}: {
  label: string;
  hp: number;
  color: string;
  flash?: boolean;
  danger?: boolean;
}) {
  return (
    <View style={s.healthBlock} accessibilityLabel={`${label}: ${Math.round(hp)} de 100`}>
      <View style={s.row}>
        <Text style={s.caption}>{label}</Text>
        {danger && (
          <Text style={s.danger} accessibilityLiveRegion="polite">
            ⚠ CRÍTICO
          </Text>
        )}
      </View>
      <View style={s.healthTrack}>
        <View
          style={[
            s.healthFill,
            { width: `${Math.max(0, Math.min(100, hp))}%`, backgroundColor: danger ? palette.red : color },
          ]}
        />
        {/* Flash branco por cima ao ser atingida — some sozinho logo em
            seguida (ver BASE_FLASH_MS). */}
        {flash && <View style={s.healthFlash} />}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 24 },
  eyebrow: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.5,
    color: palette.textFaint,
  },
  title: { fontSize: 28, fontWeight: "800", color: palette.text, textAlign: "center" },
  body: { fontSize: 14, lineHeight: 21, color: palette.textDim, textAlign: "center" },
  caption: { fontSize: 12, fontWeight: "700", color: palette.textFaint },
  match: { flex: 1, padding: 16, gap: 10 },
  tutorialHint: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    color: palette.text,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.sm,
    padding: 10,
    textAlign: "center",
  },
  healthBlock: { gap: 4 },
  healthTrack: {
    height: 14,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    overflow: "hidden",
    position: "relative",
  },
  healthFill: { height: 14 },
  healthFlash: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#FFFFFFB0" },
  danger: { fontSize: 11, fontWeight: "900", color: palette.red },
  shareError: { fontSize: 13, fontWeight: "700", color: palette.red, textAlign: "center" },
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
  poof: {
    position: "absolute",
    left: "50%",
    marginLeft: -12,
    fontSize: 22,
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  combo: { fontSize: 13, fontWeight: "900", color: palette.amber },
  panel: {
    padding: 16,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
});

import React, { useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArenaState,
  Side,
  TroopType,
  createArenaState,
  spawn,
  step,
} from "../../shared/arena/engine";
import { ArenaChallenge, nextChallenge, resetChallengeSequence } from "./challenges";
import ChallengePanel from "./ChallengePanel";
import Troop from "./Troop";
import { ENEMY_COLOR, PLAYER_COLOR } from "./colors";
import type { BotDifficulty } from "./bot";
import { createBotState, stepBot } from "./bot";
import { playFail, playSuccess } from "../audio/sounds";
import { palette, radius } from "../theme";
import Button from "../components/Button";

type Screen = "start" | "playing" | "end";
const MATCH_SECONDS = 100;
// Limiares de "resposta rápida" — abaixo disso, conta como rápido pra
// efeito da regra de invocação (ver handleAnswer).
const FAST_CHOICE_MS = 1500;
const FAST_REFLEX_MS = 340;
// Pequena pausa depois de responder, pra dar tempo de ver o feedback
// certo/errado antes do próximo desafio aparecer.
const NEXT_CHALLENGE_DELAY_MS = 280;
// Quanto tempo o "poof" fica visível depois de uma tropa morrer.
const POOF_DURATION_MS = 350;

type Poof = { key: number; position: number; side: Side };

export default function ArenaScreen({
  difficulty = "medium",
}: {
  // Ticket 9 usa "easy" na primeira partida do onboarding.
  difficulty?: BotDifficulty;
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

  // TODO(Ticket 6/replay): trocar por um random com seed pra permitir repetir
  // uma partida — por enquanto Math.random é aceitável (motor não depende
  // disso pra nada além de uma pequena variação de dano no combate).
  const random = () => Math.random();

  const [challenge, setChallenge] = useState<ArenaChallenge | null>(null);
  const [challengeSeq, setChallengeSeq] = useState(0);
  const nextChallengeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [laneHeight, setLaneHeight] = useState(0);
  const [poofs, setPoofs] = useState<Poof[]>([]);
  const poofSeq = useRef(0);
  // Guarda a posição de cada tropa no tick anterior — quando uma morre, o
  // evento troopDied não carrega posição (já foi removida do estado), então
  // é daqui que tiramos "mais ou menos onde" pra colocar o poof.
  const lastPositions = useRef<Map<number, { position: number; side: Side }>>(new Map());

  const queueNextChallenge = () => {
    const state = arenaRef.current;
    if (nextChallengeTimer.current) clearTimeout(nextChallengeTimer.current);
    nextChallengeTimer.current = setTimeout(() => {
      if (screenRef.current !== "playing") return;
      setChallenge(nextChallenge(random, state.stats.challengesTotal));
      setChallengeSeq((n) => n + 1);
    }, NEXT_CHALLENGE_DELAY_MS);
  };

  // Regra de invocação: acerto rápido OU combo >= 3 sai soldier; os dois
  // juntos saem tank; acerto normal sai scout; erro não invoca nada e zera
  // o combo.
  const handleAnswer = (correct: boolean, elapsedMs: number) => {
    const state = arenaRef.current;
    const kind = challenge?.kind;
    state.stats.challengesTotal++;
    if (!correct) {
      state.combo = 0;
      playFail();
    } else {
      state.combo++;
      const fast = kind === "reflex" ? elapsedMs < FAST_REFLEX_MS : elapsedMs < FAST_CHOICE_MS;
      const troopType: TroopType =
        fast && state.combo >= 3 ? "tank" : fast || state.combo >= 3 ? "soldier" : "scout";
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
    arenaRef.current = createArenaState(MATCH_SECONDS);
    lastTsRef.current = null;
    botRef.current = createBotState(difficulty);
    lastPositions.current = new Map();
    setPoofs([]);
    resetChallengeSequence();
    setChallenge(nextChallenge(random, 0));
    setChallengeSeq((n) => n + 1);
    setScreenState("playing");
  };

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

  return (
    <SafeAreaView style={s.screen}>
      {screen === "start" ? (
        <View style={s.center}>
          <Text style={s.title}>Arena Rush</Text>
          <Text style={s.body}>
            Responda desafios pra invocar bonecos e derrube a base do
            adversário antes que ele derrube a sua.
          </Text>
          <Button onPress={startMatch}>Entrar na Arena</Button>
        </View>
      ) : screen === "playing" ? (
        <View style={s.match}>
          <HealthBar label="BASE INIMIGA" hp={state.enemyBaseHp} color={ENEMY_COLOR} />
          <View style={s.lane} onLayout={(e) => setLaneHeight(e.nativeEvent.layout.height)}>
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
          <HealthBar label="SUA BASE" hp={state.playerBaseHp} color={PLAYER_COLOR} />
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
        </View>
      ) : (
        <View style={s.center}>
          <Text style={s.title}>
            {state.winner === "player"
              ? "Você venceu!"
              : state.winner === "enemy"
                ? "Você perdeu"
                : "Empate"}
          </Text>
          <Text style={s.body}>
            Sua base: {Math.round(state.playerBaseHp)} · Base inimiga: {Math.round(state.enemyBaseHp)}
          </Text>
          <Button onPress={startMatch}>Jogar de novo</Button>
        </View>
      )}
    </SafeAreaView>
  );
}

function HealthBar({ label, hp, color }: { label: string; hp: number; color: string }) {
  return (
    <View style={s.healthBlock} accessibilityLabel={`${label}: ${Math.round(hp)} de 100`}>
      <Text style={s.caption}>{label}</Text>
      <View style={s.healthTrack}>
        <View style={[s.healthFill, { width: `${Math.max(0, Math.min(100, hp))}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 24 },
  title: { fontSize: 28, fontWeight: "800", color: palette.text, textAlign: "center" },
  body: { fontSize: 14, lineHeight: 21, color: palette.textDim, textAlign: "center" },
  caption: { fontSize: 12, fontWeight: "700", color: palette.textFaint },
  match: { flex: 1, padding: 16, gap: 10 },
  healthBlock: { gap: 4 },
  healthTrack: { height: 14, borderRadius: radius.sm, backgroundColor: palette.surfaceAlt, overflow: "hidden" },
  healthFill: { height: 14 },
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

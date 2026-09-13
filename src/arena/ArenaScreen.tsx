import React, { useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArenaState,
  createArenaState,
  spawn,
  step,
} from "../../shared/arena/engine";
import { palette, radius } from "../theme";
import Button from "../components/Button";

type Screen = "start" | "playing" | "end";
const MATCH_SECONDS = 100;
// Stub simples pro bot — Ticket 6 troca isso por um oponente de verdade.
const BOT_SPAWN_INTERVAL = 3;
// A paleta compartilhada não tem um azul de verdade (cyan/violet são os mais
// próximos, mas nenhum lê como "time azul" claramente) — cor local só pra
// distinguir os dois lados, junto com a paleta existente pro resto (rosa e
// âmbar já existem em src/theme.ts).
const PLAYER_COLOR = "#2D6CDF";
const ENEMY_COLOR = palette.pink;

export default function ArenaScreen() {
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
  const botClockRef = useRef(0);

  // TODO(Ticket 6/replay): trocar por um random com seed pra permitir repetir
  // uma partida — por enquanto Math.random é aceitável (motor não depende
  // disso pra nada além de uma pequena variação de dano no combate).
  const random = () => Math.random();

  const tick = (ts: number) => {
    if (screenRef.current !== "playing") return;
    if (lastTsRef.current === null) lastTsRef.current = ts;
    // Limita o dt: depois de um frame perdido (ou de voltar do 2º plano) não
    // dá pra simular "de uma vez" o tempo todo que passou.
    const dt = Math.min(0.25, (ts - lastTsRef.current) / 1000);
    lastTsRef.current = ts;

    const state = arenaRef.current;
    botClockRef.current += dt;
    if (botClockRef.current >= BOT_SPAWN_INTERVAL) {
      botClockRef.current -= BOT_SPAWN_INTERVAL;
      spawn(state, "enemy", "soldier");
    }
    const events = step(state, dt, random);
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
    botClockRef.current = 0;
    setScreenState("playing");
  };

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
          <View style={s.lane}>
            {state.troops.map((troop) => (
              <View
                key={troop.id}
                style={[
                  s.troop,
                  {
                    backgroundColor: troop.side === "player" ? PLAYER_COLOR : ENEMY_COLOR,
                    bottom: `${troop.position}%`,
                  },
                ]}
              />
            ))}
          </View>
          <HealthBar label="SUA BASE" hp={state.playerBaseHp} color={PLAYER_COLOR} />
          <View style={s.panelPlaceholder}>
            <Text style={s.caption}>
              Tempo restante: {Math.ceil(state.timeRemaining)}s
            </Text>
            <Text style={s.caption}>Painel de desafio (Ticket 4)</Text>
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
  troop: {
    position: "absolute",
    left: "50%",
    marginLeft: -10,
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  panelPlaceholder: {
    padding: 16,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
    gap: 4,
  },
});

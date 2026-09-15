import React, { useEffect, useRef } from "react";
import { Animated, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { Troop as TroopData, TroopType } from "../../shared/arena/engine";
import useReducedMotion from "../useReducedMotion";
import { ENEMY_COLOR, PLAYER_COLOR } from "./colors";
import Character from "../components/Character";

// Diferencia por forma/tamanho, não só cor — scout pequeno e ágil, tank
// grande e pesado; cada um com um ícone próprio, pra não depender de
// enxergar a diferença entre azul e rosa (daltonismo).
const TROOP_VISUAL: Record<
  TroopType,
  { size: number; icon: keyof typeof Ionicons.glyphMap }
> = {
  scout: { size: 42, icon: "flash" },
  soldier: { size: 50, icon: "person" },
  tank: { size: 60, icon: "shield" },
};

export default function Troop({
  troop,
  laneHeight,
  avatar,
}: {
  troop: TroopData;
  laneHeight: number;
  avatar?: unknown;
}) {
  const reducedMotion = useReducedMotion();
  const visual = TROOP_VISUAL[troop.type];
  const color = troop.side === "player" ? PLAYER_COLOR : ENEMY_COLOR;
  const targetTop =
    Math.max(0, laneHeight - visual.size) * (1 - troop.position / 100);

  const scale = useRef(new Animated.Value(reducedMotion ? 1 : 0.3)).current;
  const top = useRef(new Animated.Value(targetTop)).current;

  // Efeito de "aterrissagem" só uma vez, quando a tropa nasce.
  useEffect(() => {
    if (reducedMotion) {
      scale.setValue(1);
      return;
    }
    Animated.spring(scale, {
      toValue: 1,
      friction: 5,
      tension: 140,
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Interpola a posição em vez de "saltar" direto pro novo valor a cada
  // tick — importante se o dispositivo perder frames.
  useEffect(() => {
    if (reducedMotion) {
      top.setValue(targetTop);
      return;
    }
    Animated.timing(top, {
      toValue: targetTop,
      duration: 120,
      useNativeDriver: false,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetTop]);

  // Deslocamento horizontal estável por tropa (não sorteado a cada render)
  // só pra parecer uma multidão, não uma fila única perfeitamente alinhada.
  const jitter = ((troop.id * 137) % 41) - 20;
  const hpRatio = Math.max(0, troop.hp / troop.maxHp);

  return (
    <Animated.View
      style={{
        position: "absolute",
        top,
        left: "50%",
        marginLeft: jitter - visual.size / 2,
        width: visual.size,
        height: visual.size,
        transform: [{ scale }],
      }}
    >
      <Character
        avatar={avatar}
        size={visual.size}
        framed={false}
        yaw={troop.side === "player" ? -0.5 : 0.5}
      />
      <View
        style={{
          position: "absolute",
          right: -3,
          bottom: 0,
          backgroundColor: color,
          borderRadius: 8,
          padding: 2,
        }}
      >
        <Ionicons name={visual.icon} size={11} color="#FFFFFF" />
      </View>
      {troop.tactic && troop.tactic !== "balanced" && (
        <Text
          style={{
            position: "absolute",
            left: -4,
            bottom: 0,
            fontSize: 10,
            color,
            fontWeight: "900",
          }}
        >
          {troop.tactic === "rush" ? "»" : "+"}
        </Text>
      )}

      {/* Barrinha de vida — sem isso, a troca de dano no combate é uma caixa
          preta: dá pra ver o ícone perdendo cor, mas não "quanto falta". */}
      {hpRatio < 1 && (
        <View
          style={{
            position: "absolute",
            bottom: -6,
            width: visual.size,
            height: 3,
            borderRadius: 2,
            backgroundColor: "#00000030",
            overflow: "hidden",
          }}
        >
          <View
            style={{
              width: `${hpRatio * 100}%`,
              height: 3,
              backgroundColor: hpRatio < 0.3 ? "#E11D48" : "#FFFFFF",
            }}
          />
        </View>
      )}
      {/* Seta de direção — reforça de que lado é cada tropa sem depender só
          da cor (útil pra quem não distingue bem azul de rosa). */}
      <Text
        accessibilityElementsHidden
        style={{
          position: "absolute",
          top: -13,
          width: visual.size,
          textAlign: "center",
          fontSize: 11,
          color,
          fontWeight: "900",
        }}
      >
        {troop.side === "player" ? "▲" : "▼"}
      </Text>
    </Animated.View>
  );
}

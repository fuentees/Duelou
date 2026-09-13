import React, { useEffect, useRef } from "react";
import { Animated, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Troop as TroopData, TroopType } from "../../shared/arena/engine";
import useReducedMotion from "../useReducedMotion";
import { ENEMY_COLOR, PLAYER_COLOR } from "./colors";

// Diferencia por forma/tamanho, não só cor — scout pequeno e ágil, tank
// grande e pesado; cada um com um ícone próprio, pra não depender de
// enxergar a diferença entre azul e rosa (daltonismo).
const TROOP_VISUAL: Record<TroopType, { size: number; icon: keyof typeof Ionicons.glyphMap }> = {
  scout: { size: 24, icon: "flash" },
  soldier: { size: 32, icon: "person" },
  tank: { size: 46, icon: "shield" },
};

export default function Troop({
  troop,
  laneHeight,
}: {
  troop: TroopData;
  laneHeight: number;
}) {
  const reducedMotion = useReducedMotion();
  const visual = TROOP_VISUAL[troop.type];
  const color = troop.side === "player" ? PLAYER_COLOR : ENEMY_COLOR;
  const targetTop = laneHeight * (1 - troop.position / 100);

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
      <View
        style={{
          width: visual.size,
          height: visual.size,
          borderRadius: visual.size / 2,
          backgroundColor: color,
          alignItems: "center",
          justifyContent: "center",
          // Fica visivelmente mais "pálido" conforme perde vida — mais um
          // sinal, além da cor do lado, de que algo está acontecendo com ela.
          opacity: 0.45 + 0.55 * hpRatio,
        }}
      >
        <Ionicons name={visual.icon} size={visual.size * 0.55} color="#FFFFFF" />
      </View>
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

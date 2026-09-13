// O estado que o servidor manda pro PvP é canônico e simétrico — "player" e
// "enemy" são só rótulos arbitrários do motor (shared/arena/engine.ts),
// atribuídos na hora que a partida é criada (ver server/arena-match.mjs).
// Toda a tela hoje (Troop.tsx, cores, ResultCard "SUA BASE"/"BASE INIMIGA")
// assume que "player" é sempre "eu, embaixo". Essa função converte o estado
// canônico pra perspectiva de quem está olhando a tela — pura, sem nenhuma
// dependência de React Native, igual o resto do motor.

import type { ArenaState, Side, Troop } from "../../shared/arena/engine";

const other = (side: Side): Side => (side === "player" ? "enemy" : "player");

export function toViewerPerspective(state: ArenaState, viewerSide: Side): ArenaState {
  if (viewerSide === "player") return state;

  const troops: Troop[] = state.troops.map((t) => ({
    ...t,
    side: other(t.side),
    position: 100 - t.position,
  }));

  return {
    ...state,
    playerBaseHp: state.enemyBaseHp,
    enemyBaseHp: state.playerBaseHp,
    troops,
    combo: { player: state.combo.enemy, enemy: state.combo.player },
    stats: { player: state.stats.enemy, enemy: state.stats.player },
    winner:
      state.winner === "player" ? "enemy" : state.winner === "enemy" ? "player" : state.winner,
  };
}

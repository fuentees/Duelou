// Bot oponente da Arena Rush — client-only, não tem nada a ver com o
// pareamento/rating do servidor (isso é outra coisa, ver server/competitive.mjs).
// Joga pelas mesmas regras do jogador: gasta "energia" acumulada com o tempo
// pra invocar tropa, respeitando o mesmo teto (MAX_TROOPS_PER_SIDE) e a
// mesma função spawn() — não existe invocação de graça ou fora da regra.

import type { ArenaState, TroopType } from "../../shared/arena/engine.ts";
import { MAX_TROOPS_PER_SIDE, spawn } from "../../shared/arena/engine.ts";

export type BotDifficulty = "easy" | "medium";

export type BotState = {
  energy: number;
  difficulty: BotDifficulty;
};

type DifficultyConfig = { regenPerSecond: number; maxEnergy: number };
const DIFFICULTY_CONFIG: Record<BotDifficulty, DifficultyConfig> = {
  // Fácil: energia enche bem mais devagar — dá folga real pro primeiro
  // contato, pensado pro tutorial (Ticket 9 usa "easy" na primeira partida).
  easy: { regenPerSecond: 8, maxEnergy: 100 },
  medium: { regenPerSecond: 10.5, maxEnergy: 100 },
};

// Custo de energia por tropa, proporcional ao poder — tank é bem mais caro
// que scout, então sai bem menos vezes por minuto.
const TROOP_COST: Record<TroopType, number> = { scout: 20, soldier: 35, tank: 65 };

// Se a base do bot está sofrendo (pouca vida, ou tropa do jogador já perto),
// gasta energia em defesa assim que possível, sem economizar.
const UNDER_PRESSURE_BASE_HP = 40;
const UNDER_PRESSURE_LANE_POSITION = 65; // tropa do jogador além disso já é ameaça
// Se está claramente na frente, seguraum pouco a energia pra um push de tank
// em vez de gastar tudo em scouts — não fica 100% parado, só mais seletivo.
const DOMINATING_MARGIN = 25;

export function createBotState(difficulty: BotDifficulty = "medium"): BotState {
  // Começa com alguma energia — sem isso, o bot fica mudo nos primeiros
  // segundos até a primeira tropa ficar paga, o que parece "quebrado" pra
  // quem está testando.
  return { energy: 30, difficulty };
}

export function stepBot(
  state: ArenaState,
  bot: BotState,
  dtSeconds: number,
  random: () => number,
): void {
  const config = DIFFICULTY_CONFIG[bot.difficulty];
  bot.energy = Math.min(config.maxEnergy, bot.energy + config.regenPerSecond * dtSeconds);

  const ownTroops = state.troops.reduce((n, t) => n + (t.side === "enemy" ? 1 : 0), 0);
  if (ownTroops >= MAX_TROOPS_PER_SIDE) return;

  const underPressure =
    state.enemyBaseHp < UNDER_PRESSURE_BASE_HP ||
    state.troops.some((t) => t.side === "player" && t.position >= UNDER_PRESSURE_LANE_POSITION);
  const dominating = state.enemyBaseHp - state.playerBaseHp > DOMINATING_MARGIN;

  const trySpawn = (type: TroopType): boolean => {
    if (bot.energy < TROOP_COST[type]) return false;
    spawn(state, "enemy", type);
    bot.energy -= TROOP_COST[type];
    return true;
  };

  if (underPressure) {
    // Defesa: gasta o que der o quanto antes, do mais forte pro mais fraco.
    if (trySpawn("tank")) return;
    if (trySpawn("soldier")) return;
    trySpawn("scout");
    return;
  }
  if (dominating) {
    // Ataque guardado: só solta tank quando a energia já está quase cheia,
    // com scouts ocasionais só pra manter alguma pressão enquanto junta.
    if (bot.energy >= config.maxEnergy * 0.9 && trySpawn("tank")) return;
    if (random() < 0.15) trySpawn("scout");
    return;
  }
  // Ritmo normal: mistura scout e soldier, com alguma variedade.
  if (random() < 0.5 && trySpawn("soldier")) return;
  trySpawn("scout");
}

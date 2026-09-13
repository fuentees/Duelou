// Motor de simulação da Arena Rush — TypeScript puro, sem nenhuma dependência
// de React Native. É a fonte da verdade da partida (por enquanto só offline,
// contra bot). Fase 2 (tempo real) pretende reaproveitar este mesmo motor
// rodando no servidor — por isso ele fica em shared/, não em src/, e por isso
// nunca lê Math.random diretamente (tudo injetável, pra dar pra repetir uma
// partida a partir de uma seed).

export type Side = "player" | "enemy";
export type TroopType = "scout" | "soldier" | "tank";

export type TroopConfig = {
  hp: number;
  dps: number; // dano por segundo, só enquanto engajado em combate
  speed: number; // % da pista por segundo (pista vai de 0 a 100)
  baseDamage: number; // dano causado à base inimiga ao chegar (dano único, a tropa é consumida)
};

// Valores fáceis de tunar — scout é rápido e frágil, tank é lento e forte.
export const TROOP_CONFIG: Record<TroopType, TroopConfig> = {
  scout: { hp: 30, dps: 12, speed: 18, baseDamage: 6 },
  soldier: { hp: 60, dps: 20, speed: 10, baseDamage: 12 },
  tank: { hp: 140, dps: 30, speed: 5, baseDamage: 22 },
};

export const MAX_TROOPS_PER_SIDE = 10;
// Espaço mínimo entre duas tropas do mesmo lado na pista (0-100), pra não
// ficarem sobrepostas nem quando uma fila inteira está parada atrás da linha
// de frente engajada em combate.
const MIN_GAP = 4;
// Distância na pista em que as duas linhas de frente já se consideram
// engajadas em combate (param de avançar, trocam dano a cada tick).
const ENGAGE_DISTANCE = 3;

export type Troop = {
  id: number;
  side: Side;
  type: TroopType;
  hp: number;
  maxHp: number;
  position: number; // 0 = base do jogador, 100 = base do inimigo
};

export type ArenaEvent =
  | { type: "spawn"; side: Side; troopType: TroopType; id: number }
  | { type: "combat"; playerTroopId: number; enemyTroopId: number }
  | { type: "troopDied"; side: Side; troopType: TroopType; id: number }
  | { type: "baseHit"; side: Side; dmg: number; troopType: TroopType }
  | { type: "matchOver"; winner: Side | "draw" };

export type ArenaStats = {
  troopsSpawned: number;
  challengesTotal: number;
  hits: number;
  // Maior combo alcançado na partida — quem atualiza é quem controla o
  // combo (hoje, o painel de desafio em src/arena/), não o motor: combo é
  // sobre acerto de desafio, não sobre nada que step() resolva sozinho.
  maxCombo: number;
};

export type ArenaState = {
  timeRemaining: number; // segundos
  playerBaseHp: number; // 0..100
  enemyBaseHp: number; // 0..100
  troops: Troop[];
  combo: number;
  stats: ArenaStats;
  over: boolean;
  winner: Side | "draw" | null;
  nextTroopId: number;
};

export function createArenaState(durationSeconds = 100): ArenaState {
  return {
    timeRemaining: durationSeconds,
    playerBaseHp: 100,
    enemyBaseHp: 100,
    troops: [],
    combo: 0,
    stats: { troopsSpawned: 0, challengesTotal: 0, hits: 0, maxCombo: 0 },
    over: false,
    winner: null,
    nextTroopId: 1,
  };
}

// Devolve a tropa mais avançada de um lado (a "linha de frente"), ou
// undefined se o lado não tiver nenhuma tropa viva na pista.
function frontOf(troops: Troop[], side: Side): Troop | undefined {
  const list = troops.filter((t) => t.side === side);
  if (!list.length) return undefined;
  return side === "player"
    ? list.reduce((a, b) => (b.position > a.position ? b : a))
    : list.reduce((a, b) => (b.position < a.position ? b : a));
}

export function spawn(
  state: ArenaState,
  side: Side,
  type: TroopType,
): boolean {
  if (state.over) return false;
  const count = state.troops.reduce(
    (n, t) => n + (t.side === side ? 1 : 0),
    0,
  );
  if (count >= MAX_TROOPS_PER_SIDE) return false;
  // Nasce sempre na borda da própria base — se outra tropa já estiver bem
  // ali (spawns quase simultâneos), quem cuida de não empilhar é o próprio
  // espaçamento do movimento em step(), não o spawn (não dá pra "nascer atrás
  // da base": não existe posição além de 0/100 na pista).
  const config = TROOP_CONFIG[type];
  state.troops.push({
    id: state.nextTroopId++,
    side,
    type,
    hp: config.hp,
    maxHp: config.hp,
    position: side === "player" ? 0 : 100,
  });
  state.stats.troopsSpawned++;
  return true;
}

// Avança a simulação em dtSeconds. `random` é sempre usado no lugar de
// Math.random (aqui só entra numa pequena variação de dano de combate, pra
// não ficar mecânico) — nunca chamado diretamente, pra manter a partida
// determinística e repetível a partir de uma seed.
export function step(
  state: ArenaState,
  dtSeconds: number,
  random: () => number,
): ArenaEvent[] {
  const events: ArenaEvent[] = [];
  if (state.over || dtSeconds <= 0) return events;
  state.timeRemaining = Math.max(0, state.timeRemaining - dtSeconds);

  const playerFront = frontOf(state.troops, "player");
  const enemyFront = frontOf(state.troops, "enemy");
  const engaged =
    !!playerFront &&
    !!enemyFront &&
    enemyFront.position - playerFront.position <= ENGAGE_DISTANCE;

  if (engaged && playerFront && enemyFront) {
    const variance = () => 0.85 + random() * 0.3; // ±15%, evita sensação "robótica"
    enemyFront.hp -= TROOP_CONFIG[playerFront.type].dps * dtSeconds * variance();
    playerFront.hp -= TROOP_CONFIG[enemyFront.type].dps * dtSeconds * variance();
    events.push({
      type: "combat",
      playerTroopId: playerFront.id,
      enemyTroopId: enemyFront.id,
    });
  }

  for (const side of ["player", "enemy"] as const) {
    const list = state.troops
      .filter((t) => t.side === side)
      .sort((a, b) => (side === "player" ? b.position - a.position : a.position - b.position));
    for (let i = 0; i < list.length; i++) {
      const troop = list[i]!;
      const isFrontline = i === 0;
      if (isFrontline && engaged) continue; // linha de frente parada, trocando dano
      const dir = side === "player" ? 1 : -1;
      let next = troop.position + dir * TROOP_CONFIG[troop.type].speed * dtSeconds;
      const ahead = list[i - 1];
      if (ahead) {
        next =
          side === "player"
            ? Math.min(next, ahead.position - MIN_GAP)
            : Math.max(next, ahead.position + MIN_GAP);
      }
      troop.position = side === "player" ? Math.min(100, Math.max(0, next)) : Math.max(0, Math.min(100, next));
    }
  }

  // Mortes por combate.
  state.troops = state.troops.filter((t) => {
    if (t.hp > 0) return true;
    events.push({ type: "troopDied", side: t.side, troopType: t.type, id: t.id });
    return false;
  });

  // Chegada na base — dano único, a tropa é consumida no impacto.
  const arrived = state.troops.filter(
    (t) => (t.side === "player" && t.position >= 100) || (t.side === "enemy" && t.position <= 0),
  );
  for (const t of arrived) {
    const dmg = TROOP_CONFIG[t.type].baseDamage;
    if (t.side === "player") state.enemyBaseHp = Math.max(0, state.enemyBaseHp - dmg);
    else state.playerBaseHp = Math.max(0, state.playerBaseHp - dmg);
    events.push({
      type: "baseHit",
      side: t.side === "player" ? "enemy" : "player",
      dmg,
      troopType: t.type,
    });
  }
  if (arrived.length) {
    const arrivedIds = new Set(arrived.map((t) => t.id));
    state.troops = state.troops.filter((t) => !arrivedIds.has(t.id));
  }

  if (state.playerBaseHp <= 0 || state.enemyBaseHp <= 0 || state.timeRemaining <= 0) {
    state.over = true;
    state.winner =
      state.playerBaseHp <= 0 && state.enemyBaseHp <= 0
        ? "draw"
        : state.playerBaseHp <= 0
          ? "enemy"
          : state.enemyBaseHp <= 0
            ? "player"
            : state.playerBaseHp === state.enemyBaseHp
              ? "draw"
              : state.playerBaseHp > state.enemyBaseHp
                ? "player"
                : "enemy";
    events.push({ type: "matchOver", winner: state.winner });
  }
  return events;
}

// Regra de invocação, compartilhada entre o cliente offline (contra bot) e o
// futuro motor autoritativo do servidor (PvP) — os dois precisam decidir o
// mesmo tipo de tropa a partir da mesma resposta rápida/combo, sem duplicar
// (e arriscar divergir) a lógica em dois lugares.
export const FAST_CHOICE_MS = 1500;
export const FAST_REFLEX_MS = 340;

// Acerto rápido OU combo >= 3 sai soldier; os dois juntos saem tank; acerto
// normal sai scout.
export function decideTroopType(fast: boolean, combo: number): TroopType {
  return fast && combo >= 3 ? "tank" : fast || combo >= 3 ? "soldier" : "scout";
}

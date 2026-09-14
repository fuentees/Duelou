// Envio por diferença (delta) do estado da partida.
//
// O motor autoritativo roda a ~15Hz e, até aqui, cada tique mandava o estado
// inteiro pra cada socket: todas as tropas, com posição e vida, quinze vezes
// por segundo, para os dois lados de cada partida. Funciona com poucas
// partidas e desperdiça banda de todo mundo quando o jogo tiver gente —
// principalmente em rede de celular, onde é o jogador que paga a conta.
//
// Aqui ficam as duas metades da conversa, puras e testáveis: o servidor
// calcula o que mudou desde o último envio (`diffState`) e o cliente aplica
// em cima do que já tem (`applyPatch`). Nenhum dos dois lados adivinha nada:
// de tempos em tempos o servidor manda um retrato completo de novo (ver
// FULL_SYNC_EVERY em server/arena-ws.mjs), então uma mensagem perdida ou um
// arredondamento acumulado nunca vira uma partida divergente por muito tempo.

import type { ArenaState, Side, Troop, TroopType } from "./engine.ts";

// Casas decimais mandadas na rede. Um décimo de uma pista de 0 a 100 é bem
// menos que um pixel na tela — mandar mais que isso é gastar banda com
// diferença que ninguém enxerga (e evita mandar tropa "que mudou" quando ela
// não andou nada de visível).
const PRECISION = 1;
const round = (value: number) => Number(value.toFixed(PRECISION));

export type TroopUpdate = [id: number, position: number, hp: number];
export type StatePatch = {
  time?: number;
  playerBaseHp?: number;
  enemyBaseHp?: number;
  combo?: [player: number, enemy: number];
  stats?: Record<Side, [challengesTotal: number, hits: number, maxCombo: number, troopsSpawned: number]>;
  over?: { over: boolean; winner: ArenaState["winner"] };
  add?: Troop[];
  upd?: TroopUpdate[];
  del?: number[];
};

function sameStats(a: ArenaState, b: ArenaState): boolean {
  return (["player", "enemy"] as const).every((side) => {
    const x = a.stats[side];
    const y = b.stats[side];
    return (
      x.challengesTotal === y.challengesTotal &&
      x.hits === y.hits &&
      x.maxCombo === y.maxCombo &&
      x.troopsSpawned === y.troopsSpawned
    );
  });
}

/**
 * O que mudou entre dois retratos da mesma partida. Devolve null quando nada
 * mudou de forma visível — aí não se manda mensagem nenhuma.
 */
export function diffState(previous: ArenaState, next: ArenaState): StatePatch | null {
  const patch: StatePatch = {};
  if (round(previous.timeRemaining) !== round(next.timeRemaining))
    patch.time = round(next.timeRemaining);
  if (round(previous.playerBaseHp) !== round(next.playerBaseHp))
    patch.playerBaseHp = round(next.playerBaseHp);
  if (round(previous.enemyBaseHp) !== round(next.enemyBaseHp))
    patch.enemyBaseHp = round(next.enemyBaseHp);
  if (
    previous.combo.player !== next.combo.player ||
    previous.combo.enemy !== next.combo.enemy
  )
    patch.combo = [next.combo.player, next.combo.enemy];
  if (!sameStats(previous, next))
    patch.stats = {
      player: [
        next.stats.player.challengesTotal,
        next.stats.player.hits,
        next.stats.player.maxCombo,
        next.stats.player.troopsSpawned,
      ],
      enemy: [
        next.stats.enemy.challengesTotal,
        next.stats.enemy.hits,
        next.stats.enemy.maxCombo,
        next.stats.enemy.troopsSpawned,
      ],
    };
  if (previous.over !== next.over || previous.winner !== next.winner)
    patch.over = { over: next.over, winner: next.winner };

  const before = new Map(previous.troops.map((t) => [t.id, t]));
  const add: Troop[] = [];
  const upd: TroopUpdate[] = [];
  for (const troop of next.troops) {
    const old = before.get(troop.id);
    if (!old) {
      add.push({ ...troop, position: round(troop.position), hp: round(troop.hp) });
      continue;
    }
    before.delete(troop.id);
    if (round(old.position) !== round(troop.position) || round(old.hp) !== round(troop.hp))
      upd.push([troop.id, round(troop.position), round(troop.hp)]);
  }
  const del = [...before.keys()];
  if (add.length) patch.add = add;
  if (upd.length) patch.upd = upd;
  if (del.length) patch.del = del;

  return Object.keys(patch).length ? patch : null;
}

/**
 * Aplica um patch em cima do estado que o cliente já tem. Devolve um objeto
 * novo (não altera o anterior) — o React precisa disso pra saber que mudou.
 * Um patch que fale de uma tropa desconhecida é ignorado em silêncio: o
 * retrato completo seguinte conserta, e travar a tela por causa disso seria
 * pior que seguir com um boneco a menos por um segundo.
 */
export function applyPatch(state: ArenaState, patch: StatePatch): ArenaState {
  const removed = new Set(patch.del ?? []);
  const updates = new Map((patch.upd ?? []).map(([id, position, hp]) => [id, { position, hp }]));
  const troops = state.troops
    .filter((troop) => !removed.has(troop.id))
    .map((troop) => {
      const update = updates.get(troop.id);
      return update ? { ...troop, position: update.position, hp: update.hp } : troop;
    });
  for (const troop of patch.add ?? []) troops.push({ ...troop });

  return {
    ...state,
    timeRemaining: patch.time ?? state.timeRemaining,
    playerBaseHp: patch.playerBaseHp ?? state.playerBaseHp,
    enemyBaseHp: patch.enemyBaseHp ?? state.enemyBaseHp,
    combo: patch.combo
      ? { player: patch.combo[0], enemy: patch.combo[1] }
      : state.combo,
    stats: patch.stats
      ? {
          player: {
            challengesTotal: patch.stats.player[0],
            hits: patch.stats.player[1],
            maxCombo: patch.stats.player[2],
            troopsSpawned: patch.stats.player[3],
          },
          enemy: {
            challengesTotal: patch.stats.enemy[0],
            hits: patch.stats.enemy[1],
            maxCombo: patch.stats.enemy[2],
            troopsSpawned: patch.stats.enemy[3],
          },
        }
      : state.stats,
    over: patch.over ? patch.over.over : state.over,
    winner: patch.over ? patch.over.winner : state.winner,
    troops,
  };
}

/**
 * Espelha um patch pra perspectiva do outro lado. O cliente sempre recebe a
 * partida com "player" sendo ele mesmo (ver src/arena/perspective.ts); como o
 * patch fala dos mesmos campos, ele precisa da mesma inversão antes de ser
 * aplicado.
 */
export function flipPatch(patch: StatePatch): StatePatch {
  const flipped: StatePatch = { ...patch };
  if (patch.playerBaseHp !== undefined || patch.enemyBaseHp !== undefined) {
    flipped.playerBaseHp = patch.enemyBaseHp;
    flipped.enemyBaseHp = patch.playerBaseHp;
    if (flipped.playerBaseHp === undefined) delete flipped.playerBaseHp;
    if (flipped.enemyBaseHp === undefined) delete flipped.enemyBaseHp;
  }
  if (patch.combo) flipped.combo = [patch.combo[1], patch.combo[0]];
  if (patch.stats) flipped.stats = { player: patch.stats.enemy, enemy: patch.stats.player };
  if (patch.over)
    flipped.over = {
      over: patch.over.over,
      winner:
        patch.over.winner === "player"
          ? "enemy"
          : patch.over.winner === "enemy"
            ? "player"
            : patch.over.winner,
    };
  if (patch.add)
    flipped.add = patch.add.map((troop) => ({
      ...troop,
      side: (troop.side === "player" ? "enemy" : "player") as Side,
      position: 100 - troop.position,
    }));
  if (patch.upd)
    flipped.upd = patch.upd.map(([id, position, hp]) => [id, round(100 - position), hp]);
  return flipped;
}

export type { TroopType };

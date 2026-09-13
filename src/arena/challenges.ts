// Adaptador de desafios rápidos pra Arena Rush — reaproveita os geradores
// que já existem (shared/arcade.mjs, shared/skillGames.mjs) e devolve um
// formato único e simples pra UI, que não precisa conhecer o formato
// interno de cada jogo.
//
// IMPORTANTE: a Arena hoje é só offline (contra bot), então pode manter a
// resposta certa no cliente sem problema. Se um dia isso virar um modo
// competitivo online de verdade, a validação da resposta TEM que ir pro
// servidor (como já acontece em server/competitive.mjs, que usa
// publicArcade pra nunca mandar o gabarito pro cliente) — este atalho aqui
// NÃO pode ir pra produção competitiva.

import { makeArcade, MAX_LEVEL } from "../../shared/arcade.mjs";
import { makeSkillGame } from "../../shared/skillGames.mjs";

export type ChoiceChallenge = {
  kind: "choice";
  prompt: string;
  promptColor?: string;
  options: string[];
  optionColors?: string[];
  answerIndex: number;
};
export type ReflexChallenge = {
  kind: "reflex";
  waitMs: number;
};
export type ArenaChallenge = ChoiceChallenge | ReflexChallenge;

// Formato que server/arena-challenges.mjs manda pro cliente no PvP online:
// mesma cara, sem o gabarito nem o waitMs do reflexo (anti-trapaça — ver o
// comentário desse arquivo no servidor). ChallengePanel aceita os dois
// formatos (ArenaChallenge | PublicArenaChallenge), escolhendo o modo pela
// presença de `onSubmit`.
export type PublicChoiceChallenge = Omit<ChoiceChallenge, "answerIndex">;
export type PublicReflexChallenge = Omit<ReflexChallenge, "waitMs">;
export type PublicArenaChallenge = PublicChoiceChallenge | PublicReflexChallenge;

// Só entram na rotação os modos rápidos de resolver — a Arena precisa de
// respostas em ~1-2s pra manter o ritmo do combate; "menor ou maior" e
// "sequência lógica" pedem mais leitura e ficariam fora de compasso.
const CHOICE_MODES = ["math", "colors"] as const;
const KINDS = [...CHOICE_MODES, "reflex"] as const;
type Kind = (typeof KINDS)[number];

// A cada N pontos de "difficulty" sobe 1 nível — a partida começa fácil e
// aperta aos poucos. Uma partida de ~90-120s costuma passar por umas 40-80
// respostas, o que leva o nível a ~15-27: aperta, mas não estoura o teto
// antes do fim (ver Ticket 6, que mede a duração real de uma partida).
const DIFFICULTY_PER_LEVEL = 3;

function levelFor(difficulty: number): number {
  const level = 1 + Math.floor(Math.max(0, difficulty) / DIFFICULTY_PER_LEVEL);
  return Math.min(MAX_LEVEL, Math.max(1, level));
}

function buildChoiceChallenge(
  mode: (typeof CHOICE_MODES)[number],
  level: number,
  random: () => number,
): ChoiceChallenge {
  const round = makeArcade(mode, level, random).rounds[0]!;
  return {
    kind: "choice",
    prompt: round.prompt,
    promptColor: round.promptColor,
    options: round.options.map((value) => String(value)),
    optionColors: round.optionColors,
    // math/colors sempre têm `answer` definido — o tipo é compartilhado com
    // modos que não têm (aim, memory etc.), por isso o "!" aqui.
    answerIndex: round.answer!,
  };
}

function buildReflexChallenge(level: number, random: () => number): ReflexChallenge {
  // shared/skillGames.mjs não tem um .d.mts (diferente de arcade.mjs), então
  // o TypeScript infere uma união de todos os formatos de rodada possíveis
  // (timer/reflex/aim/memory) em vez de saber que este é especificamente o
  // do reflexo — daí a asserção local, em vez de mexer no arquivo shared/.
  const round = makeSkillGame("reflex", level, random).rounds[0] as { waitMs: number };
  return { kind: "reflex", waitMs: round.waitMs };
}

// Lembra o último tipo devolvido só pra não repetir duas vezes seguidas —
// use resetChallengeSequence() no início de cada partida/teste pra não
// vazar estado de uma sessão pra outra.
let lastKind: Kind | null = null;

/**
 * Devolve o próximo desafio da Arena, nunca repetindo o mesmo tipo duas
 * vezes seguidas. `difficulty` sobe conforme a partida avança (por exemplo,
 * quantos desafios já foram respondidos) — quem chama decide a métrica,
 * aqui só mapeamos isso pro nível dos geradores existentes.
 */
export function nextChallenge(
  random: () => number,
  difficulty: number,
): ArenaChallenge {
  const level = levelFor(difficulty);
  const choices = KINDS.filter((kind) => kind !== lastKind);
  const kind = choices[Math.floor(random() * choices.length)]!;
  lastKind = kind;
  return kind === "reflex"
    ? buildReflexChallenge(level, random)
    : buildChoiceChallenge(kind, level, random);
}

export function resetChallengeSequence(): void {
  lastKind = null;
}

import { createHash, randomInt } from "node:crypto";
export const games = [
  {
    id: "timer",
    name: "5,00 cravado",
    description: "Pare o relógio em 5 segundos.",
  },
  {
    id: "reflex",
    name: "Reflexo relâmpago",
    description: "Espere o sinal. Toque quando aparecer AGORA.",
  },
  {
    id: "memory",
    name: "Memória turbo",
    description: "Observe e repita a sequência numerada.",
  },
];
export function challenge(game, difficulty) {
  if (!games.some((g) => g.id === game) || ![1, 2, 3].includes(difficulty))
    throw Error("Jogo ou dificuldade inválidos");
  return {
    version: 2,
    game,
    difficulty,
    targetMs: 5000,
    toleranceMs: [2000, 1200, 700][difficulty - 1],
    hideAfterMs: [null, 3000, 1000][difficulty - 1],
    waitMs: randomInt(1800, 4301),
    waits: Array.from({ length: [1, 3, 5][difficulty - 1] }, () =>
      randomInt(1800, 4301),
    ),
    sequence: Array.from({ length: [4, 6, 8][difficulty - 1] }, () =>
      randomInt(0, 4),
    ),
    flashMs: [550, 400, 280][difficulty - 1],
  };
}
export function dailyChallenge(date) {
  const bytes = createHash("sha256")
    .update("duelou-daily-v2:" + date)
    .digest();
  const game = games[bytes[0] % games.length].id;
  const difficulty = 1 + (bytes[1] % 3);
  const c = challenge(game, difficulty);
  c.waitMs = 1800 + (bytes[2] % 26) * 100;
  c.waits = Array.from(
    { length: [1, 3, 5][difficulty - 1] },
    (_, i) => 1800 + (bytes[3 + i] % 26) * 100,
  );
  c.sequence = Array.from(
    { length: [4, 6, 8][difficulty - 1] },
    (_, i) => bytes[10 + i] % 4,
  );
  return c;
}
export function score(c, input) {
  if (c.game === "timer") {
    if (
      !Number.isFinite(input.elapsedMs) ||
      input.elapsedMs < 0 ||
      input.elapsedMs > 30000
    )
      throw Error("Tempo inválido");
    return Math.max(
      0,
      Math.round(
        1000 * (1 - Math.abs(input.elapsedMs - c.targetMs) / c.toleranceMs),
      ),
    );
  }
  if (c.game === "reflex") {
    if (input.falseStart === true) return 0;
    const times = input.reactions || [input.reactionMs];
    if (
      !Array.isArray(times) ||
      times.length !== (c.waits?.length || 1) ||
      times.some((t) => !Number.isFinite(t) || t < 100 || t > 5000)
    )
      throw Error("Reação inválida");
    return Math.max(
      0,
      Math.min(
        1000,
        Math.round(
          (1000 *
            (1000 -
              [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)])) /
            850,
        ),
      ),
    );
  }
  if (
    !Array.isArray(input.answers) ||
    input.answers.length > c.sequence.length ||
    input.answers.some((x) => !Number.isInteger(x) || x < 0 || x > 3)
  )
    throw Error("Sequência inválida");
  let correct = 0;
  for (let i = 0; i < input.answers.length; i++) {
    if (input.answers[i] !== c.sequence[i]) break;
    correct++;
  }
  return Math.round((correct / c.sequence.length) * 1000);
}
export function progression(xp) {
  let level = 1,
    base = 0;
  while (xp >= base + level * 100) {
    base += level * 100;
    level++;
  }
  return { level, current: xp - base, needed: level * 100 };
}
export function reward(points, difficulty, playsToday) {
  if (playsToday >= 30 || points === 0) return { xp: 0, coins: 0 };
  const xp = 10 + Math.floor(points / 100) + 5 * (difficulty - 1);
  return { xp, coins: Math.floor(xp / 5) };
}

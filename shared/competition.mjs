import { makeArcade } from "./arcade.mjs";

// A configuração é congelada na entrada do segundo jogador e compartilhada.
// A dificuldade cresce dentro da prova, sem usar a conexão como desempate.
export function competitiveBase(rating) {
  return rating < 900 ? 1 : rating < 1200 ? 6 : rating < 1500 ? 11 : 16;
}
export function makeCompetitive(mode, baseLevel = 6) {
  const levels = [
    baseLevel,
    Math.min(30, baseLevel + 5),
    Math.min(30, baseLevel + 10),
  ];
  const rounds = levels.flatMap((level) =>
    makeArcade(mode, level).rounds.slice(0, 6),
  );
  return {
    mode,
    difficulty: baseLevel,
    seconds: 45,
    rulesVersion: 7,
    competitiveVersion: 1,
    roundLevels: levels.flatMap((level) => Array(6).fill(level)),
    rounds,
  };
}

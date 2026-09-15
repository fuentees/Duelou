import type { ArenaState } from "./engine";

export function invocationText(answer: { correct: boolean; troopType: string | null; tactic: string; combo: number }) {
  if (!answer.correct) return "Errou — respire e recomece o combo.";
  if (!answer.troopType) return `Acertou! Campo cheio · combo ×${answer.combo}`;
  const troop = { scout: "Batedor", soldier: "Soldado", tank: "Tanque" }[answer.troopType] ?? "Tropa";
  const tactic = { balanced: "Equilíbrio", rush: "Investida", guard: "Guarda" }[answer.tactic] ?? "Equilíbrio";
  return `${troop} invocado! ${tactic} · combo ×${answer.combo}`;
}

export function matchAdvice(state: ArenaState) {
  const stats = state.stats.player;
  if (!stats.challengesTotal) return "Experimente a aula guiada para aprender a invocar e escolher uma postura.";
  if (stats.hits / stats.challengesTotal < 0.7) return "Priorize a precisão: cada erro quebra o combo e deixa de invocar uma tropa.";
  if (stats.hits > stats.troopsSpawned) return "Seu campo ficou cheio. Os acertos extras mantiveram o combo, mas precisavam de uma vaga para invocar.";
  if (stats.maxCombo < 3) return "Seu próximo objetivo: três acertos seguidos. Combine isso com rapidez para conseguir um tanque.";
  if (state.winner === "enemy") return "Você manteve bons acertos. Experimente Guarda antes de a pressão rival chegar à sua base.";
  if (state.winner === "draw") return "As bases terminaram iguais. Experimente Investida quando houver espaço para avançar.";
  return "Boa sequência! Na próxima, observe quando a pista abre para aproveitar a Investida.";
}

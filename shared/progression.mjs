export const chapterNames = [
  "Primeiros passos",
  "Atenção",
  "Novas regras",
  "Combinações",
  "Consistência",
  "Domínio",
];
const lessons = {
  math: [
    "Somas e diferenças positivas",
    "Subtrações com negativos",
    "Multiplicações",
    "Multiplicar antes de somar",
    "Duas multiplicações",
    "Mistura de operações",
  ],
  order: [
    "Comparar inteiros positivos",
    "Alternar menor e maior",
    "Comparar negativos",
    "Uma casa decimal",
    "Duas casas decimais",
    "Comparações mistas",
  ],
  odd: [
    "Reconhecer formas",
    "Procurar em 3 × 3",
    "Observar detalhes",
    "Explorar 4 × 4",
    "Explorar 5 × 5",
    "Dominar 6 × 6",
  ],
  sequence: [
    "Somar um passo fixo",
    "Sequências decrescentes",
    "Alternar progressões",
    "Multiplicar a cada passo",
    "Somar os dois anteriores",
    "Reconhecer padrões mistos",
  ],
  colors: [
    "Cor da tinta",
    "Ignorar a palavra",
    "Quatro cores",
    "Alternar quatro cores",
    "Cinco cores",
    "Seis cores",
  ],
  timer: [
    "Conhecer o relógio",
    "Reduzir o erro",
    "Contar sem ver",
    "Manter o ritmo",
    "Pouca referência visual",
    "Precisão máxima",
  ],
  reflex: [
    "Esperar o sinal",
    "Evitar antecipações",
    "Repetir com consistência",
    "Mais tentativas",
    "Reduzir a variação",
    "Dominar a reação",
  ],
  aim: [
    "Encontrar o alvo",
    "Manter a precisão",
    "Alvos simultâneos",
    "Acompanhar o ritmo",
    "Menos tempo por alvo",
    "Consistência na mira",
  ],
  memory: [
    "Quatro passos",
    "Ampliar a sequência",
    "Agrupar passos",
    "Manter a ordem",
    "Sequências rápidas",
    "Doze passos",
  ],
};
export function chapterFor(mode, level) {
  const chapter = Math.min(5, Math.floor((level - 1) / 5));
  return {
    number: chapter + 1,
    name: chapterNames[chapter],
    lesson: lessons[mode][chapter],
    mastery: level % 5 === 0,
  };
}
export function campaignGoals(mode, level = 1) {
  if (mode === "reflex") return { clear: 600, excellent: 850 };
  if (mode === "memory") {
    const length = 4 + Math.floor(((level - 1) / 29) * 8);
    return {
      clear: Math.round((Math.ceil(0.65 * length) / length) * 1000),
      excellent: Math.round((Math.ceil(0.9 * length) / length) * 1000),
    };
  }
  return { clear: 650, excellent: 900 };
}
export function starsFor(score, mode, level = 1) {
  const goals = campaignGoals(mode, level);
  return score >= goals.excellent
    ? 3
    : score >= goals.clear
      ? 2
      : score > 0
        ? 1
        : 0;
}
export function mergeCampaign(a, b) {
  const best = { ...a.best };
  for (const [level, score] of Object.entries(b.best || {}))
    best[level] = Math.max(best[level] || 0, score);
  return { unlocked: Math.max(a.unlocked || 1, b.unlocked || 1), best };
}
export function recordProgress(progress, level, score, mode) {
  if (
    !Number.isInteger(level) ||
    level < 1 ||
    level > 30 ||
    !Number.isInteger(score) ||
    score < 0 ||
    score > 1000
  )
    throw Error("Resultado inválido");
  const best = {
    ...progress.best,
    [level]: Math.max(progress.best?.[level] || 0, score),
  };
  const unlocked = Math.min(
    30,
    Math.max(
      progress.unlocked || 1,
      score >= campaignGoals(mode, level).clear &&
        level <= (progress.unlocked || 1)
        ? level + 1
        : 1,
    ),
  );
  return { unlocked, best };
}
export function ratingName(rating) {
  return rating < 900
    ? "Bronze"
    : rating < 1100
      ? "Prata"
      : rating < 1300
        ? "Ouro"
        : rating < 1500
          ? "Platina"
          : rating < 1700
            ? "Diamante"
            : "Lendário";
}
export function ratingChange(a, b, outcome, played) {
  return Math.round(
    (played < 5 ? 48 : 24) * (outcome - 1 / (1 + 10 ** ((b - a) / 400))),
  );
}
export function dailyRandom(date) {
  let seed = [...date].reduce(
    (s, c) => (Math.imul(s, 31) + c.charCodeAt(0)) >>> 0,
    7,
  );
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

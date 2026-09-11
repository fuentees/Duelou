export const modes = [
  {
    id: "math",
    name: "Conta rápida",
    tag: "RACIOCÍNIO",
    description: "Resolva contas antes que o tempo termine.",
    symbol: "+",
  },
  {
    id: "order",
    name: "Qual é o menor?",
    tag: "ATENÇÃO",
    description: "Encontre o menor número em cada rodada.",
    symbol: "01",
  },
  {
    id: "odd",
    name: "Fora do padrão",
    tag: "OBSERVAÇÃO",
    description: "Toque na única peça diferente em cada grade.",
    symbol: "≠",
  },
  {
    id: "sequence",
    name: "Sequência lógica",
    tag: "PADRÕES",
    description: "Descubra o próximo número da sequência.",
    symbol: "→",
  },
  {
    id: "colors",
    name: "Cor certa",
    tag: "REFLEXO",
    description: "Toque na cor real da tinta, não na palavra.",
    symbol: "◉",
  },
];
// Escada de níveis numerada, não mais 4 nomes fixos — 20 hoje, sobe pra 30+ só
// mudando esta constante. Tudo (rodadas, tempo, conteúdo de cada jogo) escala
// em função de `level` (1..MAX_LEVEL), em vez de 4 blocos fixos repetidos.
export const MAX_LEVEL = 20;
// Pontuação mínima (de 1.000) pra considerar a fase "passada" e destravar a
// próxima — mesmo critério usado no servidor (rooms.mjs) e no offline (client).
export const CLEAR_SCORE = 650;
export const levels = Array.from({ length: MAX_LEVEL }, (_, i) => `Nível ${i + 1}`);
export const levelRules = Array.from({ length: MAX_LEVEL }, (_, i) => {
  const level = i + 1;
  return {
    rounds: Math.min(18, 8 + Math.floor((level - 1) / 2)),
    seconds: Math.max(35, 75 - (level - 1) * 2),
  };
});
export const levelDetails = {
  math: "Contas ficam maiores e ganham mais operações conforme o nível sobe.",
  order: "Mais opções, números maiores e com casas decimais conforme o nível sobe.",
  odd: "A grade cresce e as diferenças ficam mais sutis conforme o nível sobe.",
  sequence: "Padrões mais complexos — de soma simples a geométrico e Fibonacci.",
  colors: "Mais cores no jogo e menos tempo pra pensar conforme o nível sobe.",
};
const colorPalette = [
  { name: "VERMELHO", hex: "#FF6B6B" },
  { name: "AZUL", hex: "#4D96FF" },
  { name: "VERDE", hex: "#4CE297" },
  { name: "AMARELO", hex: "#FFD166" },
  { name: "ROXO", hex: "#8C7CFF" },
  { name: "LARANJA", hex: "#FF9F4D" },
];
// Peças por sutileza crescente: cada tier é escolhido conforme o nível avança,
// e reaproveitado (com sorteio) quando os níveis excedem os tiers definidos.
const oddPairTiers = [
  [
    ["O", "X"],
    ["+", "−"],
    ["A", "B"],
  ],
  [
    ["O", "Q"],
    ["E", "F"],
    ["P", "R"],
  ],
  [
    ["O", "Q"],
    ["I", "l"],
    ["8", "B"],
  ],
  [
    ["O", "0"],
    ["1", "l"],
    ["S", "5"],
  ],
  [
    ["6", "9"],
    ["N", "Z"],
    ["W", "M"],
  ],
];
const oddGridSizes = [4, 9, 16, 25, 36];
export function makeArcade(mode, level = 1, random = Math.random) {
  if (!modes.some((m) => m.id === mode)) throw Error("Modo inválido");
  if (!Number.isInteger(level) || level < 1 || level > MAX_LEVEL)
    throw Error("Nível inválido");
  const int = (n) => Math.floor(random() * n),
    shuffle = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
    // N valores distintos sorteados dentro de [lo, hi], não uma sequência de passo fixo —
    // evita que a resposta vire "olhar só o último dígito".
    uniqueValues = (n, lo, hi, decimals = 0) => {
      const scale = 10 ** decimals,
        span = Math.round((hi - lo) * scale),
        seen = new Set(),
        out = [];
      // Amostragem por rejeição tem um teto de tentativas: um `random` degenerado
      // (ou um ajuste futuro de faixa/quantidade) não pode travar o servidor.
      let attempts = 0;
      while (out.length < n && attempts++ < n * 200) {
        const raw = int(span + 1);
        if (seen.has(raw)) continue;
        seen.add(raw);
        out.push(Number((lo + raw / scale).toFixed(decimals)));
      }
      while (out.length < n) out.push(Number((lo + out.length / scale).toFixed(decimals)));
      return out;
    },
    // Progresso de 0 a 1 dentro da escada, usado para escalar cada jogo suavemente
    // em vez de 4 blocos fixos — cresce automaticamente se MAX_LEVEL aumentar.
    p = (level - 1) / (MAX_LEVEL - 1),
    tier = (count) => Math.min(count - 1, Math.floor(p * count)),
    rules = levelRules[level - 1];
  return {
    mode,
    difficulty: level,
    seconds: rules.seconds,
    rulesVersion: 4,
    rounds: Array.from({ length: rules.rounds }, () => {
      if (mode === "math") {
        const t = tier(4),
          magnitude = 8 + Math.round(level * 4);
        const a = 2 + int(magnitude),
          b = 2 + int(magnitude),
          add = int(2) === 0;
        const x = 2 + int(4 + Math.round(level / 2)),
          y = 2 + int(4 + Math.round(level / 2)),
          z = int(4 + level),
          w = 2 + int(2 + Math.round(level / 3));
        let answer, prompt;
        if (t === 3) {
          answer = x * y - z * w;
          prompt = `${x} × ${y} − ${z} × ${w}`;
        } else if (t === 2) {
          answer = x * y + z;
          prompt = `${x} × ${y} + ${z}`;
        } else if (t === 1) {
          answer = a - b;
          prompt = `${a} − ${b}`;
        } else {
          answer = add ? a + b : Math.abs(a - b);
          prompt = `${add ? a : Math.max(a, b)} ${add ? "+" : "−"} ${add ? b : Math.min(a, b)}`;
        }
        const options = [
          answer,
          answer + 1 + int(4),
          answer - 1 - int(4),
          answer + 6 + int(5),
        ];
        shuffle(options);
        return { prompt, options, answer: options.indexOf(answer) };
      }
      if (mode === "order") {
        const count = Math.min(8, 4 + Math.round(p * 4)),
          decimals = tier(3),
          allowNegative = p > 0.12,
          magnitude = 15 + Math.round(level * 4),
          lo = allowNegative ? -magnitude : 1,
          hi = magnitude;
        const options = uniqueValues(count, lo, hi, decimals);
        const min = Math.min(...options);
        shuffle(options);
        return {
          prompt: "Qual é o menor número?",
          options,
          answer: options.indexOf(min),
        };
      }
      if (mode === "odd") {
        const count = oddGridSizes[tier(oddGridSizes.length)],
          answer = int(count);
        const pairTier = oddPairTiers[tier(oddPairTiers.length)];
        const pair = pairTier[int(pairTier.length)];
        return {
          prompt: "Encontre a peça diferente",
          options: Array.from(
            { length: count },
            (_, i) => pair[i === answer ? 1 : 0],
          ),
          answer,
        };
      }
      if (mode === "sequence") {
        const t = tier(4);
        let terms, next;
        if (t === 0) {
          const start = 1 + int(6 + level),
            step = 1 + int(3 + Math.round(level / 2));
          terms = Array.from({ length: 4 }, (_, i) => start + i * step);
          next = start + 4 * step;
        } else if (t === 1) {
          const start = 5 + int(15 + level * 2),
            step = 2 + int(5 + level),
            down = int(2) === 0;
          terms = Array.from({ length: 4 }, (_, i) =>
            down ? start - i * step : start + i * step,
          );
          next = down ? start - 4 * step : start + 4 * step;
        } else if (t === 2) {
          const ratio = 2 + int(2),
            start = 1 + int(4 + Math.round(level / 3));
          terms = Array.from({ length: 4 }, (_, i) => start * ratio ** i);
          next = start * ratio ** 4;
        } else {
          let a = 1 + int(4 + Math.round(level / 3)),
            b = 2 + int(4 + Math.round(level / 3));
          terms = [a, b];
          for (let i = 0; i < 2; i++)
            terms.push(terms[terms.length - 1] + terms[terms.length - 2]);
          next = terms[terms.length - 1] + terms[terms.length - 2];
        }
        const options = [
          next,
          next + 1 + int(4),
          next - 1 - int(4),
          next + 6 + int(5),
        ];
        shuffle(options);
        return {
          prompt: terms.join(", ") + ", ?",
          options,
          answer: options.indexOf(next),
        };
      }
      const poolSize = 3 + tier(4);
      const pool = colorPalette.slice(0, poolSize);
      const word = pool[int(poolSize)];
      let ink = pool[int(poolSize)];
      if (level > 1 && ink.name === word.name)
        ink = pool[(pool.indexOf(ink) + 1) % poolSize];
      const optionPool = shuffle([...pool]);
      return {
        prompt: word.name,
        promptColor: ink.hex,
        options: optionPool.map((c) => c.name),
        optionColors: optionPool.map((c) => c.hex),
        answer: optionPool.findIndex((c) => c.name === ink.name),
      };
    }),
  };
}
export function arcadeScore(config, answers) {
  if (
    !Array.isArray(answers) ||
    answers.length > config.rounds.length ||
    answers.some(
      (v, i) =>
        !Number.isInteger(v) || v < 0 || v >= config.rounds[i].options.length,
    )
  )
    throw Error("Respostas inválidas");
  const correct = answers.reduce(
    (sum, v, i) => sum + (v === config.rounds[i].answer ? 1 : 0),
    0,
  );
  return Math.round((correct * 1000) / config.rounds.length);
}
export function publicArcade(config) {
  return {
    ...config,
    rounds: config.rounds.map(({ answer, ...round }) => round),
  };
}

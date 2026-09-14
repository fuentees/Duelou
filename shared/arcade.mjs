import { skillModes, makeSkillGame, skillScore } from "./skillGames.mjs";
export {
  performanceLabel,
  resultDetails,
  minimumAttemptMs,
} from "./skillGames.mjs";
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
    name: "Menor ou maior?",
    tag: "ATENÇÃO",
    description: "Encontre o menor ou o maior número, conforme pedido.",
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
  {
    id: "timer",
    name: "Tempo certo",
    tag: "PRECISÃO",
    description: "Pare o relógio no alvo sorteado.",
    symbol: "◷",
  },
  {
    id: "reflex",
    name: "Reflexo relâmpago",
    tag: "REAÇÃO",
    description: "Espere o sinal e toque o mais rápido possível.",
    symbol: "ϟ",
  },
  {
    id: "aim",
    name: "Mira certeira",
    tag: "MIRA",
    description: "Toque no alvo antes que ele suma.",
    symbol: "◎",
  },
  {
    id: "memory",
    name: "Memória turbo",
    tag: "MEMÓRIA",
    description: "Observe, memorize e repita a sequência.",
    symbol: "▦",
  },
];
// Escada de níveis numerada, não mais 4 nomes fixos. Tudo (rodadas, tempo,
// conteúdo de cada jogo) escala em função de `level` (1..MAX_LEVEL), em vez de
// 4 blocos fixos repetidos. 30 (não mais 20) porque a patente do jogador
// (src/theme.ts: Bronze/Prata/Ouro/Platina/Diamante/Lendário, 5 níveis cada)
// só chega em Lendário a partir do nível 26 — com o teto em 20, a patente máxima
// do jogo nunca era alcançável por ninguém.
export const MAX_LEVEL = 30;
// Pontuação mínima (de 1.000) pra considerar a fase "passada" e destravar a
// próxima — mesmo critério usado no servidor (rooms.mjs) e no offline (client).
export const CLEAR_SCORE = 650;
// Opções de tamanho de sala oferecidas na criação — fonte única compartilhada
// entre server/rooms.mjs (validação) e o seletor no cliente
// (src/arcade/BrowseView.tsx), pra nunca o cliente oferecer um tamanho que o
// servidor recusa. Vai até 30 pra caber uma turma de sala de aula inteira;
// não afeta a fila 1×1 (competitiva/pública), que sempre usa capacidade 2
// hardcoded em server/rooms.mjs, fora desta lista de propósito.
export const ROOM_CAPACITIES = [2, 4, 6, 8, 10, 15, 20, 25, 30];
export const levels = Array.from(
  { length: MAX_LEVEL },
  (_, i) => `Nível ${i + 1}`,
);
export const levelRules = Array.from({ length: MAX_LEVEL }, (_, i) => {
  const level = i + 1;
  return {
    rounds: 8 + 2 * Math.floor((level - 1) / 5),
    seconds: 75 - ((level - 1) % 5) * 3,
  };
});
export const levelDetails = {
  timer:
    "O alvo muda a cada partida. Nos níveis altos, o relógio desaparece e a margem diminui.",
  reflex: "Mais tentativas e menos margem conforme o nível aumenta.",
  aim: "Alvos aparecem mais rápido e somem mais rápido conforme o nível aumenta.",
  memory: "Sequências mais longas e rápidas conforme o nível aumenta.",
  math: "Contas ficam maiores e ganham mais operações conforme o nível sobe.",
  order:
    "Mais opções, números maiores e com casas decimais conforme o nível sobe.",
  odd: "A grade cresce e as diferenças ficam mais sutis conforme o nível sobe.",
  sequence:
    "Padrões mais complexos — de soma simples a geométrico e Fibonacci.",
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
  [["círculo cheio", "quadrado cheio"]],
  [["quadrado cheio", "losango cheio"]],
  [
    ["círculo vazio", "círculo cheio"],
    ["quadrado vazio", "quadrado cheio"],
  ],
  [
    ["círculo vazio", "círculo com ponto"],
    ["quadrado vazio", "quadrado com ponto"],
  ],
  [
    ["losango vazio", "losango com ponto"],
    ["quadrado com ponto", "losango com ponto"],
  ],
];
const oddGridSizes = [4, 9, 16, 25, 36];
export function makeArcade(mode, level = 1, random = Math.random) {
  if (!modes.some((m) => m.id === mode)) throw Error("Modo inválido");
  if (!Number.isInteger(level) || level < 1 || level > MAX_LEVEL)
    throw Error("Nível inválido");
  if (skillModes.includes(mode)) return makeSkillGame(mode, level, random);
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
      while (out.length < n)
        out.push(Number((lo + out.length / scale).toFixed(decimals)));
      return out;
    },
    // Progresso de 0 a 1 dentro da escada, usado para escalar cada jogo suavemente
    // em vez de 4 blocos fixos — cresce automaticamente se MAX_LEVEL aumentar.
    p = (level - 1) / (MAX_LEVEL - 1),
    // Fixo por nível — só pra coisas que não podem mudar de tamanho a cada
    // rodada sem ficar estranho visualmente (hoje: só o tamanho da grade de
    // "Fora do padrão"). Tudo que é conteúdo (não layout) usa roundTier.
    tier = (count) => Math.min(count - 1, Math.floor(p * count)),
    // Sorteia o "tier" de conteúdo pesado pelo progresso do nível, mas varia
    // rodada a rodada — sem isso, cada nível repetia a mesma operação/regra em
    // todas as rodadas (só os números mudavam), o que parecia mais "decoreba"
    // que desafio. Ainda fica mais difícil conforme o nível sobe, só que sem
    // travar numa única variação por 8-18 rodadas seguidas.
    roundTier = (count) => {
      const center = p * (count - 1);
      const roll = center + (random() - 0.5) * Math.min(2.4, count);
      return Math.min(count - 1, Math.max(0, Math.round(roll)));
    },
    rules = levelRules[level - 1];
  // Assinatura enxuta pra detectar rodada repetida (mesmo enunciado e mesma
  // resposta certa) e sortear de novo — a geração é aleatória, então pode
  // colidir, principalmente nos tiers mais fáceis com pouca variação possível.
  const signature = (round) =>
    round.prompt + "|" + round.options.join(",") + "|" + round.answer;
  const buildRound = () => {
    if (mode === "math") {
      const chapter = Math.floor((level - 1) / 5),
        t =
          chapter === 0
            ? 0
            : chapter === 1
              ? 1
              : chapter < 4
                ? 2
                : chapter === 4
                  ? 3
                  : 1 + int(3),
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
        answer = x * y + (chapter === 2 ? 0 : z);
        prompt = chapter === 2 ? `${x} × ${y}` : `${x} × ${y} + ${z}`;
      } else if (t === 1) {
        answer = a - b;
        prompt = `${a} − ${b}`;
      } else {
        answer = add ? a + b : Math.abs(a - b);
        prompt = `${add ? a : Math.max(a, b)} ${add ? "+" : "−"} ${add ? b : Math.min(a, b)}`;
      }
      const errors =
        t === 3
          ? [x * y + z * w, (x * y - z) * w, x * (y - z) * w]
          : t === 2
            ? [x + y + z, x * (y + z), x * (y + 1)]
            : [a + b, b - a, a - b, answer + 10, answer - 10];
      const options = [...new Set([answer, ...shuffle(errors)])].slice(0, 4);
      for (let delta = 1; options.length < 4; delta++) {
        const value = answer + (delta % 2 ? delta : -delta);
        if (!options.includes(value)) options.push(value);
      }
      shuffle(options);
      return { prompt, options, answer: options.indexOf(answer) };
    }
    if (mode === "order") {
      const count = Math.min(8, 4 + Math.round(p * 4)),
        decimals = level <= 15 ? 0 : level <= 20 ? 1 : level <= 25 ? 2 : int(3),
        allowNegative = level > 10,
        magnitude = 15 + Math.round(level * 4),
        lo = allowNegative ? -magnitude : 1,
        hi = magnitude;
      const options = uniqueValues(count, lo, hi, decimals);
      // Alterna menor/maior a cada rodada — mesma habilidade (comparar todo
      // o grupo), mas obriga reler o enunciado em vez de virar reflexo de
      // "sempre o mesmo botão de tanto treinar o mesmo pedido".
      const findMax = random() < 0.5;
      const target = findMax ? Math.max(...options) : Math.min(...options);
      shuffle(options);
      return {
        prompt: findMax ? "Qual é o maior número?" : "Qual é o menor número?",
        options,
        answer: options.indexOf(target),
      };
    }
    if (mode === "odd") {
      const count = oddGridSizes[[0, 1, 1, 2, 3, 4][Math.floor((level - 1) / 5)]],
        answer = int(count);
      const pairTier = oddPairTiers[roundTier(oddPairTiers.length)];
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
      const chapter = Math.floor((level - 1) / 5);
      const t =
        chapter === 0
          ? 0
          : chapter < 3
            ? 1
            : chapter === 3
              ? 2
              : chapter === 4
                ? 3
                : int(4);
      let terms, next, explanation;
      if (t === 0) {
        const start = 1 + int(6 + level),
          step = 1 + int(3 + Math.round(level / 2));
        terms = Array.from({ length: 4 }, (_, i) => start + i * step);
        next = start + 4 * step;
        explanation = `Some ${step} a cada passo.`;
      } else if (t === 1) {
        const start = 5 + int(15 + level * 2),
          step = 2 + int(5 + level),
          down = chapter === 1 || int(2) === 0;
        terms = Array.from({ length: 4 }, (_, i) =>
          down ? start - i * step : start + i * step,
        );
        next = down ? start - 4 * step : start + 4 * step;
        explanation = `${down ? "Subtraia" : "Some"} ${step} a cada passo.`;
      } else if (t === 2) {
        const ratio = 2 + int(2),
          start = 1 + int(4 + Math.round(level / 3));
        terms = Array.from({ length: 4 }, (_, i) => start * ratio ** i);
        next = start * ratio ** 4;
        explanation = `Multiplique por ${ratio} a cada passo.`;
      } else {
        let a = 1 + int(4 + Math.round(level / 3)),
          b = 2 + int(4 + Math.round(level / 3));
        terms = [a, b];
        for (let i = 0; i < 2; i++)
          terms.push(terms[terms.length - 1] + terms[terms.length - 2]);
        next = terms[terms.length - 1] + terms[terms.length - 2];
        explanation = "Some os dois números anteriores.";
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
        explanation,
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
  };
  const rounds = [];
  let previous = null;
  for (let i = 0; i < rules.rounds; i++) {
    let round = buildRound();
    // Poucas tentativas bastam: só existe pra evitar repetir a rodada anterior
    // igualzinha (mais provável nos tiers fáceis, com pouca variação), não
    // pra garantir unicidade em toda a prova.
    let attempts = 0;
    while (previous && signature(round) === previous && attempts++ < 5)
      round = buildRound();
    rounds.push(round);
    previous = signature(round);
  }
  return {
    mode,
    difficulty: level,
    seconds: rules.seconds,
    rulesVersion: 6,
    rounds,
  };
}
export function arcadeScore(config, answers) {
  if (skillModes.includes(config.mode)) return skillScore(config, answers);
  if (
    !Array.isArray(answers) ||
    answers.length > config.rounds.length ||
    answers.some(
      (v, i) =>
        !Number.isInteger(v) || v < 0 || v >= config.rounds[i].options.length,
    )
  )
    throw Error("Respostas inválidas");
  // Cada acerto vale mais quanto maior a sequência de acertos seguidos que ele
  // fecha — recompensa consistência de verdade, não só "acertar metade
  // espalhado pela prova". Normalizado pelo total possível (toda a prova
  // certa, em sequência) pra manter 1.000 no gabarito perfeito e 0 sem nenhum
  // acerto, igual antes.
  const STREAK_CAP = 5,
    STREAK_BONUS = 0.15;
  const weightAt = (streak) =>
    1 + Math.min(streak - 1, STREAK_CAP - 1) * STREAK_BONUS;
  let possible = 0;
  for (let i = 0; i < config.rounds.length; i++) possible += weightAt(i + 1);
  let streak = 0,
    earned = 0;
  for (let i = 0; i < answers.length; i++) {
    if (answers[i] === config.rounds[i].answer) {
      streak++;
      earned += weightAt(streak);
    } else streak = 0;
  }
  return Math.round((1000 * earned) / possible);
}
export function publicArcade(config) {
  return {
    ...config,
    rounds: config.rounds.map(({ answer, explanation, ...round }) => round),
  };
}

// Regras de precisão, reflexo, mira e memória utilizadas pelo servidor e pelo solo.
export const skillModes = ["timer", "reflex", "aim", "memory"];
export function makeSkillGame(mode, level, random) {
  const p = (level - 1) / 29;
  const int = (n) => Math.floor(random() * n);
  const common = { mode, difficulty: level, rulesVersion: 6 };
  if (mode === "timer") {
    const targetMs = (20 + int(101)) * 100;
    return {
      ...common,
      seconds: 35,
      rounds: [
        {
          prompt: "Pare no tempo-alvo",
          options: [],
          targetMs,
          toleranceMs: Math.round(1200 - p * 950),
          hideAfterMs:
            level < 10
              ? null
              : Math.round(targetMs * (level < 20 ? 0.65 : 0.25)),
        },
      ],
    };
  }
  if (mode === "reflex")
    return {
      ...common,
      seconds: 40,
      rounds: Array.from({ length: 3 + Math.floor(p * 2) }, () => ({
        prompt: "Espere o sinal",
        options: [],
        waitMs: 900 + int(1701),
        toleranceMs: Math.round(800 - p * 350),
      })),
    };
  if (mode === "aim") {
    // Cada "rodada" é um alvo com seu próprio instante de aparição (spawnMs,
    // relativo ao início da prova) e tempo de vida (visMs) — não é uma leva
    // que precisa ser limpa antes de avançar. Normalmente um alvo de cada
    // vez, mas dois podem nascer juntos (mesmo spawnMs). x/y são unidades
    // virtuais 0-100 (não pixels), o cliente escala pro tamanho real da
    // arena. Nada aqui é segredo (saber onde/quando o alvo aparece não ajuda
    // a "trapacear": ainda precisa tocar lá fisicamente no momento certo),
    // diferente do waitMs do reflexo ou do sequence da memória — por isso
    // pode ir direto na config pública sem revelação separada por rodada.
    const visMs = Math.round(1100 - p * 600); // 1100ms..500ms visível até sumir
    const gapMs = Math.round(900 - p * 450); // 900ms..450ms entre um alvo e o próximo
    const doubleChance = 0.08 + p * 0.27; // 8%..35% de chance de nascerem 2 juntos
    const totalMs = 30000; // duração fixa da prova — a dificuldade vem da quantidade/tempo, não da duração
    const radius = 10; // fixo — a dificuldade vem da quantidade e do tempo, não do tamanho
    const minGap = radius * 2.4; // espaço mínimo entre alvos simultâneos, pra não empilhar
    const rounds = [];
    for (
      let spawnMs = 0;
      spawnMs < totalMs;
      spawnMs += gapMs + Math.round(gapMs * 0.3 * (random() - 0.5))
    ) {
      const placed = rounds
        .filter((r) => r.spawnMs + r.visMs > spawnMs)
        .map((r) => ({ x: r.x, y: r.y }));
      for (let k = 0; k < (random() < doubleChance ? 2 : 1); k++) {
        let x,
          y,
          attempts = 0;
        do {
          x = 12 + int(76);
          y = 12 + int(76);
          attempts++;
        } while (
          attempts < 30 &&
          placed.some((q) => Math.hypot(q.x - x, q.y - y) < minGap)
        );
        if (placed.some((q) => Math.hypot(q.x - x, q.y - y) < minGap)) {
          const spaces = [15, 40, 65, 85].flatMap((x) =>
            [15, 40, 65, 85].map((y) => ({ x, y })),
          );
          const free = spaces.find((v) =>
            placed.every((q) => Math.hypot(q.x - v.x, q.y - v.y) >= minGap),
          );
          if (!free) continue;
          ({ x, y } = free);
        }
        placed.push({ x, y });
        rounds.push({
          prompt: "Toque no alvo antes que suma",
          options: [],
          spawnMs,
          visMs,
          radius,
          x,
          y,
        });
      }
    }
    const lastRound = rounds[rounds.length - 1];
    return {
      ...common,
      seconds: Math.ceil((lastRound.spawnMs + lastRound.visMs) / 1000) + 1,
      rounds,
    };
  }
  return {
    ...common,
    seconds: 50,
    rounds: [
      {
        prompt: "Repita a sequência",
        options: [0, 1, 2, 3],
        sequence: Array.from({ length: 4 + Math.floor(p * 8) }, () => int(4)),
        flashMs: Math.round(650 - p * 370),
      },
    ],
  };
}
export function skillScore(config, answers) {
  const { mode, rounds } = config;
  const limit = mode === "memory" ? rounds[0].sequence.length : rounds.length;
  const negativeOk = mode === "reflex" || mode === "aim";
  if (
    !Array.isArray(answers) ||
    answers.length > limit ||
    answers.some(
      (v) =>
        !Number.isFinite(v) ||
        (mode === "memory"
          ? !Number.isInteger(v) || v < 0 || v > 3
          : (v < 0 && !(negativeOk && v === -1)) || v > config.seconds * 1000),
    )
  )
    throw Error("Respostas inválidas");
  if (!answers.length) return 0;
  if (mode === "timer") {
    if (answers[0] < 0) return 0;
    return Math.round(
      1000 *
        Math.max(
          0,
          1 - Math.abs(answers[0] - rounds[0].targetMs) / rounds[0].toleranceMs,
        ),
    );
  }
  if (mode === "reflex") {
    // Antecipações e tentativas ausentes valem zero; cada rodada tem o mesmo peso.
    return Math.round(
      answers.reduce(
        (sum, ms, i) =>
          sum +
          (config.rulesVersion < 6
            ? ms < 80
              ? 0
              : 1000 *
                Math.max(0, 1 - Math.max(0, ms - 180) / rounds[i].toleranceMs)
            : ms < 100
              ? 0
              : 1000 * Math.max(0, 1 - (ms - 100) / rounds[i].toleranceMs)),
        0,
      ) / rounds.length,
    );
  }
  if (mode === "aim") {
    // Não é sobre velocidade de reação, é sobre quantos alvos você pegou:
    // cada toque dentro da janela vale o mesmo, cada alvo perdido (-1) vale zero.
    return Math.round(
      (1000 *
        answers.filter((ms, i) => ms >= 0 && ms < rounds[i].visMs).length) /
        rounds.length,
    );
  }
  let correct = 0;
  for (let i = 0; i < answers.length; i++) {
    if (answers[i] !== rounds[0].sequence[i]) break;
    correct++;
  }
  return Math.round((1000 * correct) / rounds[0].sequence.length);
}
export function performanceLabel(score) {
  if (score >= 950) return "Profissional";
  if (score >= 850) return "Excelente";
  if (score >= 700) return "Ótimo";
  if (score >= 500) return "Bom";
  return "Continue praticando";
}
export function resultDetails(config, answers) {
  if (!answers?.length) return ["Nenhuma tentativa concluída"];
  const seconds = (ms) => (ms / 1000).toFixed(3).replace(".", ",") + " s";
  if (config.mode === "timer")
    return [
      "Alvo: " + seconds(config.rounds[0].targetMs),
      "Seu tempo: " + seconds(answers[0]),
      "Diferença: " +
        seconds(Math.abs(answers[0] - config.rounds[0].targetMs)) +
        (answers[0] < config.rounds[0].targetMs
          ? " antes do alvo"
          : answers[0] > config.rounds[0].targetMs
            ? " depois do alvo"
            : " — no alvo!"),
    ];
  if (config.mode === "reflex")
    return answers.map(
      (ms, i) =>
        "Tentativa " +
        (i + 1) +
        ": " +
        (ms < 0 ? "Antecipou o sinal" : seconds(ms)),
    );
  if (config.mode === "aim")
    return [
      answers.filter((ms, i) => ms >= 0 && ms < config.rounds[i].visMs).length +
        " de " +
        config.rounds.length +
        " alvos tocados",
    ];
  if (config.mode === "memory") {
    let correct = 0;
    for (let i = 0; i < answers.length; i++) {
      if (answers[i] !== config.rounds[0].sequence[i]) break;
      correct++;
    }
    return [
      correct + " de " + config.rounds[0].sequence.length + " passos corretos",
    ];
  }
  const correct = answers.filter(
    (v, i) => v === config.rounds[i].answer,
  ).length;
  const details = [
    correct + " de " + config.rounds.length + " respostas corretas",
  ];
  const wrong = config.rounds.findIndex(
    (r, i) => i < answers.length && answers[i] !== r.answer,
  );
  if (wrong >= 0) {
    const r = config.rounds[wrong];
    details.push(
      `Rodada ${wrong + 1}: ${r.prompt} → ${r.options[r.answer]}.${r.explanation ? " " + r.explanation : ""}`,
    );
  }
  details.push(
    correct === config.rounds.length
      ? "Prova perfeita! Mantenha essa consistência na próxima partida."
      : "Priorize acertos seguidos: o combo aumenta os pontos.",
  );
  return details;
}
export function minimumAttemptMs(config, answers) {
  if (config.mode === "timer") return Math.max(0, answers[0] || 0);
  if (config.mode === "reflex")
    return answers.reduce(
      (sum, ms, i) => sum + (ms < 0 ? 0 : config.rounds[i].waitMs + ms),
      0,
    );
  if (config.mode === "aim")
    // Cada alvo já carrega seu instante real na linha do tempo (spawnMs) —
    // o piso é só o mais tarde que qualquer resposta poderia ter acontecido:
    // quando o alvo nasceu, mais quanto ele foi visível até ser tocado (ou
    // sumir, se perdido). Alvos simultâneos (mesmo spawnMs) já se resolvem
    // sozinhos aqui, sem precisar agrupar.
    return answers.reduce((max, ms, i) => {
      const r = config.rounds[i];
      return Math.max(max, r.spawnMs + (ms < 0 ? r.visMs : ms));
    }, 0);
  if (config.mode === "memory" && answers.length)
    return config.rounds[0].sequence.length * (config.rounds[0].flashMs + 200);
  return 0;
}

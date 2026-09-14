// Desafios da Arena Rush pro PvP — versão server-side, independente de
// src/arena/challenges.ts (que é só pro cliente offline contra bot e diz
// isso explicitamente no próprio comentário: "se um dia isso virar um modo
// competitivo online de verdade, a validação da resposta TEM que ir pro
// servidor"). Aqui é esse "um dia".
//
// Mesmo espírito de server/competitive.mjs (que este arquivo NÃO importa,
// só imita o padrão): o gabarito nunca sai do servidor, e o tempo de
// resposta é sempre medido pelo relógio do próprio servidor — nunca
// confiado do cliente.
//
// Cuidado extra pro desafio de reflexo: se o cliente soubesse `waitMs` de
// antemão, um script poderia mandar a resposta exatamente `waitMs` depois
// do desafio chegar, sem nunca "ver" o sinal de verdade, e cravar reação
// perto de zero sempre. Por isso o `waitMs` NUNCA vai no payload público —
// o servidor avisa o momento de "vai" através do callback `onGo` (quem
// estiver ligando isso a um socket manda o aviso pro cliente na hora).

import { makeArcade, MAX_LEVEL } from "../shared/arcade.mjs";
import { makeSkillGame } from "../shared/skillGames.mjs";
import { kindAt, seedFrom, seededRandom } from "../shared/arena/deck.ts";

// Mais variedade que os dois jogos de escolha originais (math/colors):
// "order" e "sequence" já geram rodada de alternativa pronta em
// shared/arcade.mjs e cabem no mesmo painel, sem nenhuma regra nova.
const CHOICE_MODES = ["math", "colors", "order", "sequence"];
const KINDS = [...CHOICE_MODES, "reflex"];

function buildChoice(mode, level, random) {
  const round = makeArcade(mode, level, random).rounds[0];
  return {
    kind: "choice",
    prompt: round.prompt,
    promptColor: round.promptColor,
    options: round.options.map((value) => String(value)),
    optionColors: round.optionColors,
    answerIndex: round.answer,
  };
}

/**
 * Fábrica dos desafios da Arena Rush online. Uma instância cobre todos os
 * jogadores/partidas ativos (não é por partida) — o que separa uma partida
 * da outra é a semente derivada do matchId em cada issue(), não estado
 * guardado aqui dentro.
 */
export function createArenaChallenges({
  now = Date.now,
  random = Math.random,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  const pending = new Map(); // challengeId -> entry
  let nextId = 1;

  /**
   * Gera e registra o desafio da posição `index` do baralho da partida
   * `matchId`, no nível `level`. Devolve `{challengeId, public}` — `public` é
   * seguro de mandar pro cliente (sem gabarito, sem waitMs do reflexo).
   *
   * O conteúdo vem sempre de uma semente derivada de (matchId, index, level),
   * nunca do `random` global: os dois lados da mesma partida, no mesmo índice
   * e no mesmo nível, recebem exatamente o mesmo desafio (ver
   * shared/arena/deck.ts). `random` continua injetável e só é usado quando
   * não há partida (`matchId` vazio), em teste.
   *
   * `onGo(challengeId)`, se passado, é chamado no momento exato (medido pelo
   * relógio injetado) em que um desafio de reflexo vira "vai" — quem estiver
   * ligando isso a um socket usa esse gancho pra avisar o cliente em tempo
   * real.
   */
  function issue({ matchId = "", index = 0, level = 1 }, onGo) {
    const safeLevel = Number.isFinite(level)
      ? Math.min(MAX_LEVEL, Math.max(1, Math.round(level)))
      : 1;
    const kind = matchId
      ? kindAt(KINDS, matchId, index)
      : KINDS[Math.floor(random() * KINDS.length)];
    const draw = matchId
      ? seededRandom(seedFrom(matchId, index, safeLevel))
      : random;
    const challengeId = String(nextId++);
    const issuedAt = now();

    if (kind === "reflex") {
      const round = makeSkillGame("reflex", safeLevel, draw).rounds[0];
      const entry = { kind: "reflex", issuedAt, goAt: null, timer: null };
      pending.set(challengeId, entry);
      entry.timer = setTimeoutFn(() => {
        entry.goAt = now();
        onGo?.(challengeId);
      }, round.waitMs);
      return { challengeId, public: { kind: "reflex" } };
    }

    const built = buildChoice(kind, safeLevel, draw);
    pending.set(challengeId, {
      kind: "choice",
      issuedAt,
      answerIndex: built.answerIndex,
    });
    return {
      challengeId,
      public: {
        kind: "choice",
        prompt: built.prompt,
        promptColor: built.promptColor,
        options: built.options,
        optionColors: built.optionColors,
      },
    };
  }

  /**
   * Processa a resposta de um desafio pendente. Devolve `null` se o id é
   * desconhecido, expirou ou já foi respondido (proteção contra replay) —
   * caso contrário `{correct, elapsedMs, kind}`, sempre calculado a partir
   * do relógio do próprio servidor, nunca de nada que o cliente informe.
   */
  function submit(challengeId, submission) {
    const entry = pending.get(challengeId);
    if (!entry) return null;
    pending.delete(challengeId);
    if (entry.timer) clearTimeoutFn(entry.timer);

    if (entry.kind === "reflex") {
      if (entry.goAt === null) {
        // Tocou antes do "vai" aparecer — errou, igual ao modo offline.
        return { correct: false, elapsedMs: 0, kind: "reflex" };
      }
      return { correct: true, elapsedMs: Math.max(0, now() - entry.goAt), kind: "reflex" };
    }

    const correct =
      Number.isInteger(submission?.index) && submission.index === entry.answerIndex;
    return { correct, elapsedMs: Math.max(0, now() - entry.issuedAt), kind: "choice" };
  }

  /**
   * Descarta um desafio pendente sem pontuar nada — usado por quem estiver
   * ligando isso a partidas (arena-ws.mjs) pra limpar desafios órfãos
   * quando uma partida termina antes do jogador responder o último
   * desafio emitido, evitando que fiquem esquecidos em `pending` pra
   * sempre.
   */
  function discard(challengeId) {
    const entry = pending.get(challengeId);
    if (!entry) return;
    pending.delete(challengeId);
    if (entry.timer) clearTimeoutFn(entry.timer);
  }

  function stop() {
    for (const entry of pending.values()) if (entry.timer) clearTimeoutFn(entry.timer);
    pending.clear();
  }

  return { issue, submit, discard, stop };
}

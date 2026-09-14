// Fila de matchmaking da Arena Rush — em memória, sem tabela no banco (a
// fila vive segundos, não precisa sobreviver a um restart). Deliberadamente
// independente de server/rooms.mjs e server/competitive.mjs: a nota que ela
// usa pra parear é a da Arena (server/arena-rating.mjs), nunca a patente
// competitiva.
//
// Era FIFO puro: juntava os dois primeiros que aparecessem, e um jogador de
// 1400 caía contra um de 800 como se fosse a mesma coisa. Agora pareia por
// proximidade de nota, com uma janela que abre com o tempo de espera: quem
// acabou de entrar só encara gente do seu nível; quem está esperando há um
// tempo aceita qualquer um, porque partida nenhuma é pior que fila eterna.

// Janela inicial (pontos de diferença aceitáveis) e o quanto ela abre por
// segundo de espera. Em ~20s de fila, a janela já passa de 800 pontos, que
// na prática é "qualquer pessoa".
const INITIAL_WINDOW = 120;
const WINDOW_GROWTH_PER_SECOND = 40;

export function createArenaQueue({
  now = Date.now,
  initialWindow = INITIAL_WINDOW,
  growthPerSecond = WINDOW_GROWTH_PER_SECOND,
} = {}) {
  const waiting = new Map(); // uid -> { rating, since }

  function windowFor(entry, at) {
    return initialWindow + (Math.max(0, at - entry.since) / 1000) * growthPerSecond;
  }

  // Vale a janela de quem está esperando há mais tempo — é ela que cresce, e
  // é isso que garante que a fila sempre anda. Se valesse a menor, quem
  // acabou de chegar (janela no mínimo) travaria de novo a espera de quem já
  // está há muito tempo na fila, que é exatamente o caso que isso resolve.
  function accepts(a, b, at) {
    const gap = Math.abs(a.rating - b.rating);
    return gap <= Math.max(windowFor(a, at), windowFor(b, at));
  }

  /**
   * Coloca `uid` na fila. Se houver alguém compatível esperando, empareia com
   * o de nota mais próxima (desempate: quem está esperando há mais tempo) e
   * devolve o oponente. Entrar de novo enquanto já espera só atualiza a nota,
   * sem duplicar nem reiniciar o relógio de espera.
   */
  function join(uid, rating = 1000) {
    const at = now();
    const mine = { rating: Number.isFinite(rating) ? rating : 1000, since: at };
    if (waiting.has(uid)) {
      waiting.get(uid).rating = mine.rating;
      return { paired: false };
    }

    let best = null;
    for (const [otherUid, entry] of waiting) {
      if (!accepts(mine, entry, at)) continue;
      const gap = Math.abs(entry.rating - mine.rating);
      if (!best || gap < best.gap || (gap === best.gap && entry.since < best.since))
        best = { uid: otherUid, gap, since: entry.since };
    }
    if (best) {
      waiting.delete(best.uid);
      return { paired: true, opponent: best.uid };
    }
    waiting.set(uid, mine);
    return { paired: false };
  }

  /**
   * Junta quem já estava esperando e agora cabe na janela um do outro — sem
   * isso, três pessoas de notas distantes poderiam ficar paradas pra sempre,
   * já que o pareamento só acontecia na entrada de alguém novo. Devolve os
   * pares formados; quem chama é que cria as partidas.
   */
  function sweep() {
    const at = now();
    const pairs = [];
    const ordered = [...waiting.entries()].sort((a, b) => a[1].since - b[1].since);
    const used = new Set();
    for (const [uid, entry] of ordered) {
      if (used.has(uid)) continue;
      let best = null;
      for (const [otherUid, other] of ordered) {
        if (otherUid === uid || used.has(otherUid)) continue;
        if (!accepts(entry, other, at)) continue;
        const gap = Math.abs(entry.rating - other.rating);
        if (!best || gap < best.gap) best = { uid: otherUid, gap };
      }
      if (!best) continue;
      used.add(uid);
      used.add(best.uid);
      waiting.delete(uid);
      waiting.delete(best.uid);
      pairs.push([uid, best.uid]);
    }
    return pairs;
  }

  function leave(uid) {
    waiting.delete(uid);
  }

  function size() {
    return waiting.size;
  }

  function isWaiting(uid) {
    return waiting.has(uid);
  }

  /** Há quanto tempo (ms) `uid` está esperando — null se não está na fila. */
  function waitingSince(uid) {
    const entry = waiting.get(uid);
    return entry ? now() - entry.since : null;
  }

  return { join, leave, size, isWaiting, sweep, waitingSince };
}

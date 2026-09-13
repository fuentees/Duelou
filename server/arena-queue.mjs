// Fila de matchmaking da Arena Rush — FIFO simples em memória, sem rating,
// sem tolerância, sem tabela no banco (a fila vive segundos, não precisa
// sobreviver a um restart). Deliberadamente independente de server/rooms.mjs
// (que faz emparelhamento por sala/tolerância de rating): aqui é só "junta
// os dois primeiros que apareceram".

export function createArenaQueue() {
  const waiting = []; // uids em ordem de chegada

  /**
   * Coloca `uid` na fila. Se já havia alguém esperando, empareia os dois
   * (FIFO: quem chegou primeiro sai primeiro) e devolve o oponente; senão
   * fica esperando. Entrar de novo enquanto já está esperando não duplica.
   */
  function join(uid) {
    if (waiting.includes(uid)) return { paired: false };
    if (waiting.length > 0) {
      const opponent = waiting.shift();
      return { paired: true, opponent };
    }
    waiting.push(uid);
    return { paired: false };
  }

  function leave(uid) {
    const i = waiting.indexOf(uid);
    if (i !== -1) waiting.splice(i, 1);
  }

  function size() {
    return waiting.length;
  }

  function isWaiting(uid) {
    return waiting.includes(uid);
  }

  return { join, leave, size, isWaiting };
}

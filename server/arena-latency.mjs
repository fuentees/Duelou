// Compensação de latência da Arena Rush.
//
// O tempo de resposta é medido no relógio do servidor (ver
// arena-challenges.mjs — isso é proposital e não muda: é o que impede o
// cliente de se autodeclarar mais rápido do que foi). Só que esse número
// inclui a viagem do desafio até o aparelho e a da resposta de volta: quem
// joga com 150 ms de rede aparece 150 ms mais lento do que realmente é. Com
// FAST_REFLEX_MS em 340 ms (shared/arena/engine.ts), isso praticamente
// impedia essa pessoa de invocar tanque — a rede dela virava habilidade.
//
// Aqui o servidor mede o tempo de ida e volta de cada conexão (ping/pong do
// próprio protocolo WebSocket, o navegador responde sozinho) e desconta esse
// tempo antes de classificar a resposta como rápida.
//
// Dois cuidados contra trapaça:
// - usa o MENOR tempo de ida e volta recente, não a média: atrasar respostas
//   de propósito só aumenta os números e não compra desconto nenhum;
// - o desconto tem teto (MAX_COMPENSATION_MS), então nem uma conexão
//   declarada absurdamente ruim vira resposta instantânea.

export const MAX_COMPENSATION_MS = 300;
const SAMPLES = 5;

export function createLatencyTracker({
  maxCompensationMs = MAX_COMPENSATION_MS,
  samples = SAMPLES,
} = {}) {
  const recent = new Map(); // uid -> number[] (últimos tempos de ida e volta)

  function record(uid, rttMs) {
    if (!Number.isFinite(rttMs) || rttMs < 0) return;
    const list = recent.get(uid) ?? [];
    list.push(rttMs);
    if (list.length > samples) list.shift();
    recent.set(uid, list);
  }

  /**
   * Quanto descontar do tempo medido desse jogador, em milissegundos. Zero
   * enquanto não houver nenhuma medição (nunca "adivinha" uma latência).
   */
  function compensationFor(uid) {
    const list = recent.get(uid);
    if (!list?.length) return 0;
    return Math.min(maxCompensationMs, Math.min(...list));
  }

  /**
   * Tempo de resposta descontada a viagem da rede — nunca negativo, pra não
   * existir resposta "antes do desafio".
   */
  function compensate(uid, elapsedMs) {
    if (!Number.isFinite(elapsedMs)) return 0;
    return Math.max(0, elapsedMs - compensationFor(uid));
  }

  /** Último tempo de ida e volta medido, só pra mostrar na tela. */
  function lastRtt(uid) {
    const list = recent.get(uid);
    return list?.length ? list[list.length - 1] : null;
  }

  function forget(uid) {
    recent.delete(uid);
  }

  function stop() {
    recent.clear();
  }

  return { record, compensationFor, compensate, lastRtt, forget, stop };
}

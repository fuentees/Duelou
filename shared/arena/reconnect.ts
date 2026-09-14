// Constantes de reconexão compartilhadas entre servidor (arena-ws.mjs) e
// cliente (useArenaSocket.ts) — mesmo espírito de shared/arena/engine.ts
// cruzando os dois lados, pra não duplicar (e arriscar divergir) os
// mesmos números em dois lugares.

// Quanto tempo uma partida fica pausada esperando quem caiu voltar antes
// do forfeit automático (Ticket 39). Mesma ordem de grandeza do limiar de
// 16s que server/rooms.mjs já usa pra considerar alguém "online".
export const RECONNECT_GRACE_MS = 20000;

// Backoff do cliente tentando reconectar (Ticket 40) — cresce até o teto,
// não fica martelando o servidor a cada tentativa.
export const RECONNECT_BACKOFF_MS = [500, 1000, 2000, 4000, 4000];

import test from "node:test";
import assert from "node:assert/strict";
import { createArenaQueue } from "./arena-queue.mjs";

test("primeiro a entrar espera; o segundo empareia os dois (FIFO)", () => {
  const queue = createArenaQueue();
  const first = queue.join("alice");
  assert.equal(first.paired, false);
  assert.equal(queue.size(), 1);

  const second = queue.join("bob");
  assert.equal(second.paired, true);
  assert.equal(second.opponent, "alice");
  assert.equal(queue.size(), 0, "os dois saem da fila assim que emparelham");
});

test("um terceiro jogador não empareia com ninguém depois que os dois primeiros já saíram", () => {
  const queue = createArenaQueue();
  queue.join("alice");
  queue.join("bob"); // empareia alice+bob, fila fica vazia
  const third = queue.join("carol");
  assert.equal(third.paired, false);
  assert.equal(queue.size(), 1);
});

test("entrar de novo enquanto já está esperando não duplica na fila", () => {
  const queue = createArenaQueue();
  queue.join("alice");
  queue.join("alice");
  assert.equal(queue.size(), 1);
});

test("leave() antes de emparelhar remove da fila de forma limpa", () => {
  const queue = createArenaQueue();
  queue.join("alice");
  queue.leave("alice");
  assert.equal(queue.size(), 0);
  assert.equal(queue.isWaiting("alice"), false);
  // Agora um novo par deveria formar do zero, sem "sobra" da alice.
  queue.join("bob");
  const result = queue.join("carol");
  assert.equal(result.paired, true);
  assert.equal(result.opponent, "bob");
});

test("leave() de quem não está na fila não quebra nada", () => {
  const queue = createArenaQueue();
  queue.leave("ninguem");
  assert.equal(queue.size(), 0);
});

test("depois de emparelhar, entrar de novo começa uma espera nova e limpa", () => {
  const queue = createArenaQueue();
  queue.join("alice");
  queue.join("bob"); // empareia, fila vazia
  const rejoin = queue.join("alice");
  assert.equal(rejoin.paired, false, "sem memória da partida anterior");
  assert.equal(queue.size(), 1);
});

test("ordem FIFO é respeitada com três chegadas: quem chegou primeiro empareia primeiro", () => {
  const queue = createArenaQueue();
  queue.join("alice");
  queue.join("bob");
  // alice+bob já emparelharam na chamada acima; agora testamos uma fila
  // nova com ordem de chegada diferente.
  queue.join("carol");
  const result = queue.join("dave");
  assert.equal(result.opponent, "carol", "carol chegou antes de dave nessa nova fila");
});

// --- Pareamento por nota (antes era FIFO puro: 1400 contra 800 dava na mesma)

function fakeClock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms) => (t += ms) };
}

test("quem acabou de entrar não encara alguém de nota muito distante", () => {
  const clock = fakeClock();
  const queue = createArenaQueue({ now: clock.now });
  queue.join("veterano", 1600);
  const novato = queue.join("novato", 900);
  assert.equal(novato.paired, false, "700 pontos de diferença não é partida, é atropelo");
  assert.equal(queue.size(), 2);
});

test("entre vários esperando, pareia com a nota mais próxima", () => {
  const clock = fakeClock();
  const queue = createArenaQueue({ now: clock.now });
  queue.join("longe", 1400);
  queue.join("perto", 1040);
  const entrando = queue.join("entrando", 1000);
  assert.equal(entrando.paired, true);
  assert.equal(entrando.opponent, "perto");
  assert.equal(queue.size(), 1, "quem sobrou continua esperando");
});

test("a janela abre com o tempo de espera: fila eterna é pior que partida desigual", () => {
  const clock = fakeClock();
  const queue = createArenaQueue({ now: clock.now });
  queue.join("veterano", 1600);
  assert.equal(queue.join("novato", 900).paired, false);
  queue.leave("novato");

  clock.advance(20_000); // o veterano está esperando há 20 segundos
  const depois = queue.join("novato", 900);
  assert.equal(depois.paired, true, "depois de esperar, aceita qualquer adversário");
  assert.equal(depois.opponent, "veterano");
});

test("sweep() junta quem já estava esperando quando as janelas abrem", () => {
  const clock = fakeClock();
  const queue = createArenaQueue({ now: clock.now });
  queue.join("a", 1500);
  queue.join("b", 800);
  assert.deepEqual(queue.sweep(), [], "no começo as janelas ainda não se alcançam");

  clock.advance(15_000);
  const pairs = queue.sweep();
  assert.equal(pairs.length, 1);
  assert.deepEqual(pairs[0].sort(), ["a", "b"]);
  assert.equal(queue.size(), 0, "quem foi pareado sai da fila");
  assert.deepEqual(queue.sweep(), []);
});

test("sweep() com número ímpar de gente deixa o último esperando, sem repetir ninguém", () => {
  const clock = fakeClock();
  const queue = createArenaQueue({ now: clock.now });
  // Notas distantes o bastante pra ninguém emparelhar na entrada — é o sweep
  // que decide, depois que as janelas abrem.
  queue.join("a", 800);
  queue.join("b", 1500);
  queue.join("c", 2200);
  assert.equal(queue.size(), 3);
  clock.advance(15_000);
  const pairs = queue.sweep();
  assert.equal(pairs.length, 1);
  assert.equal(queue.size(), 1);
  const emparelhados = pairs.flat();
  assert.equal(new Set(emparelhados).size, 2, "ninguém pode aparecer em dois pares");
});

test("reentrar na fila atualiza a nota sem reiniciar o tempo de espera", () => {
  const clock = fakeClock();
  const queue = createArenaQueue({ now: clock.now });
  queue.join("alice", 1000);
  clock.advance(10_000);
  queue.join("alice", 1500);
  assert.equal(queue.size(), 1);
  assert.equal(queue.waitingSince("alice"), 10_000, "o relógio de espera não pode reiniciar");
});

test("nota inválida não quebra o pareamento", () => {
  const queue = createArenaQueue();
  queue.join("alice", undefined);
  assert.equal(queue.join("bob", NaN).paired, true, "sem nota, trata como jogador médio");
});

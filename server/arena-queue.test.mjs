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

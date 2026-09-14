import test from "node:test";
import assert from "node:assert/strict";
import {
  LEVEL_STEPS,
  kindAt,
  levelForElapsed,
  seedFrom,
  seededRandom,
} from "./deck.ts";

test("a mesma semente sempre gera a mesma sequência; sementes diferentes divergem", () => {
  const draw = (seed) => Array.from({ length: 5 }, seededRandom(seed));
  assert.deepEqual(draw(seedFrom("m1", 3, 5)), draw(seedFrom("m1", 3, 5)));
  assert.notDeepEqual(draw(seedFrom("m1", 3, 5)), draw(seedFrom("m1", 4, 5)));
  assert.notDeepEqual(draw(seedFrom("m1", 3, 5)), draw(seedFrom("m2", 3, 5)));
  // Nível diferente também precisa mudar o conteúdo, senão subir a
  // dificuldade no meio da partida não mudaria nada.
  assert.notDeepEqual(draw(seedFrom("m1", 3, 5)), draw(seedFrom("m1", 3, 6)));
});

test("seededRandom devolve sempre um número em [0,1)", () => {
  for (const seed of [0, 1, 7, 12345, 0xffffffff]) {
    const next = seededRandom(seed);
    for (let i = 0; i < 200; i++) {
      const value = next();
      assert.ok(value >= 0 && value < 1, `valor fora da faixa: ${value}`);
    }
  }
});

test("o nível sobe com o tempo de partida, nunca com o desempenho de quem joga", () => {
  assert.equal(levelForElapsed(0, 100), 1);
  assert.equal(levelForElapsed(100, 100), LEVEL_STEPS);
  // Monótono e igual pros dois lados: o mesmo instante dá sempre o mesmo
  // nível, não importa quem pergunta.
  let previous = 0;
  for (let elapsed = 0; elapsed <= 100; elapsed += 5) {
    const level = levelForElapsed(elapsed, 100);
    assert.ok(level >= previous, "o nível nunca pode cair no meio da partida");
    previous = level;
  }
});

test("tempo fora da faixa (pausa, relógio estranho, duração zero) não gera nível inválido", () => {
  assert.equal(levelForElapsed(-10, 100), 1);
  assert.equal(levelForElapsed(500, 100), LEVEL_STEPS);
  assert.equal(levelForElapsed(10, 0), 1);
});

test("kindAt é determinístico por partida e nunca repete o tipo duas vezes seguidas", () => {
  const kinds = ["a", "b", "c", "d"];
  const sequence = Array.from({ length: 60 }, (_, i) => kindAt(kinds, "partida-1", i));
  assert.deepEqual(
    sequence,
    Array.from({ length: 60 }, (_, i) => kindAt(kinds, "partida-1", i)),
    "mesma partida tem que dar sempre a mesma sequência de tipos",
  );
  for (let i = 1; i < sequence.length; i++)
    assert.notEqual(sequence[i], sequence[i - 1], `tipo repetido na posição ${i}`);
  assert.notDeepEqual(
    sequence,
    Array.from({ length: 60 }, (_, i) => kindAt(kinds, "partida-2", i)),
  );
  // Todos os tipos aparecem: nenhum jogo do rodízio pode ficar de fora.
  assert.deepEqual([...new Set(sequence)].sort(), [...kinds].sort());
});

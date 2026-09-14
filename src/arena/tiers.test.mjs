import test from "node:test";
import assert from "node:assert/strict";
import { arenaTierFor, nextArenaTier } from "../theme.ts";

test("a divisão da Arena acompanha a nota, do começo ao topo", () => {
  assert.equal(arenaTierFor(0).name, "Bronze");
  assert.equal(arenaTierFor(999).name, "Prata");
  assert.equal(arenaTierFor(1000).name, "Prata", "a nota inicial começa na segunda divisão");
  assert.equal(arenaTierFor(1100).name, "Ouro");
  assert.equal(arenaTierFor(1250).name, "Platina");
  assert.equal(arenaTierFor(1400).name, "Diamante");
  assert.equal(arenaTierFor(1500).name, "Lendário");
  assert.equal(arenaTierFor(9999).name, "Lendário", "não existe divisão acima da última");
});

test("a divisão nunca cai quando a nota sobe", () => {
  let previous = -1;
  const ordem = ["Bronze", "Prata", "Ouro", "Platina", "Diamante", "Lendário"];
  for (let rating = 0; rating <= 1700; rating += 25) {
    const index = ordem.indexOf(arenaTierFor(rating).name);
    assert.ok(index >= previous, `divisão caiu em ${rating}`);
    previous = index;
  }
});

test("quanto falta pra próxima divisão, e nada a dizer pra quem está no topo", () => {
  assert.deepEqual(
    { nome: nextArenaTier(1000).tier.name, falta: nextArenaTier(1000).missing },
    { nome: "Ouro", falta: 50 },
  );
  assert.equal(nextArenaTier(1500), null);
  assert.equal(nextArenaTier(2000), null);
});

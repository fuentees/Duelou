import test from "node:test";
import assert from "node:assert/strict";
import { MAX_COMPENSATION_MS, createLatencyTracker } from "./arena-latency.mjs";

test("sem nenhuma medição, não desconta nada (nunca adivinha latência)", () => {
  const latency = createLatencyTracker();
  assert.equal(latency.compensationFor("p1"), 0);
  assert.equal(latency.compensate("p1", 900), 900);
  assert.equal(latency.lastRtt("p1"), null);
});

test("desconta a viagem da rede do tempo de resposta medido pelo servidor", () => {
  const latency = createLatencyTracker();
  latency.record("p1", 120);
  latency.record("p1", 140);
  // 300ms de tempo medido com 120ms de rede = 180ms de reação humana.
  assert.equal(latency.compensate("p1", 300), 180);
});

test("usa o menor tempo recente: atrasar respostas de propósito não compra desconto", () => {
  const latency = createLatencyTracker();
  latency.record("trapaceiro", 40);
  latency.record("trapaceiro", 5000);
  latency.record("trapaceiro", 5000);
  assert.equal(
    latency.compensationFor("trapaceiro"),
    40,
    "fingir uma conexão pior que a real não pode aumentar o desconto",
  );
});

test("o desconto tem teto, mesmo com uma conexão realmente péssima", () => {
  const latency = createLatencyTracker();
  latency.record("p1", 4000);
  assert.equal(latency.compensationFor("p1"), MAX_COMPENSATION_MS);
  assert.equal(latency.compensate("p1", 1000), 1000 - MAX_COMPENSATION_MS);
});

test("o tempo compensado nunca fica negativo", () => {
  const latency = createLatencyTracker();
  latency.record("p1", 250);
  assert.equal(latency.compensate("p1", 100), 0);
});

test("só guarda as medições recentes; uma rede que melhorou passa a valer", () => {
  const latency = createLatencyTracker({ samples: 3 });
  for (const rtt of [400, 380, 390]) latency.record("p1", rtt);
  assert.equal(latency.compensationFor("p1"), 300); // teto
  for (const rtt of [60, 55, 58]) latency.record("p1", rtt);
  assert.equal(latency.compensationFor("p1"), 55);
  assert.equal(latency.lastRtt("p1"), 58);
});

test("medição inválida é ignorada em vez de contaminar a compensação", () => {
  const latency = createLatencyTracker();
  latency.record("p1", NaN);
  latency.record("p1", -10);
  latency.record("p1", undefined);
  assert.equal(latency.compensationFor("p1"), 0);
  latency.record("p1", 80);
  assert.equal(latency.compensationFor("p1"), 80);
  assert.equal(latency.compensate("p1", NaN), 0);
});

test("forget() apaga as medições de quem saiu", () => {
  const latency = createLatencyTracker();
  latency.record("p1", 90);
  latency.forget("p1");
  assert.equal(latency.compensationFor("p1"), 0);
});

// Regressão de ponta a ponta do PvP da Arena Rush — dois jogadores reais
// (duas páginas), servidor de verdade. Convenção de scripts/check-arena-flow.mjs:
// roda manualmente (não está em nenhum script do package.json), contra o
// ambiente de desenvolvimento já no ar (npm run api + npm run web:8083).
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";

const API = "http://127.0.0.1:3001";
const WEB = "http://localhost:8083";

const browser = await chromium.launch({ channel: "msedge", headless: true });
const tokens = [];

async function guest(name) {
  const r = await fetch(API + "/v1/guests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const data = await r.json();
  assert.ok(data.token, "criação de convidado deveria devolver um token");
  tokens.push(data.token);
  return data;
}

async function playerPage(token) {
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(
    (t) => sessionStorage.setItem("duelou.session.v1", t),
    token,
  );
  await page.goto(WEB);
  return { page, errors };
}

function challengeLocator(page) {
  return page.getByRole("button", { name: /^Opção 1:|^TOQUE!|^ESPERE…/ }).first();
}

async function enterArenaRush(page) {
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page
    .getByRole("button", { name: "Duelo ao vivo · Arena Rush (Beta)", exact: true })
    .click();
}

// Responde o que estiver na tela (múltipla escolha ou reflexo) por um
// tempo — não importa acertar sempre, só provar que o ciclo completo
// (responder -> servidor valida -> desafio seguinte chega) está de verdade
// funcionando pelos dois lados. Devolve quantas respostas foram enviadas.
//
// Não afirmamos que alguma base toma dano: com os dois lados respondendo no
// mesmo ritmo simétrico, os exércitos podem só se chocar no meio da pista
// sem ninguém furar a linha de frente durante a janela do teste — isso é um
// resultado de jogo legítimo, não um sinal de bug (o dano em si já tem
// cobertura de sobra nos testes unitários do motor).
async function answerFor(page, ms) {
  let answered = 0;
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const toque = page.getByRole("button", { name: /^TOQUE!/ });
    if (await toque.isVisible().catch(() => false)) {
      await toque.click().then(() => answered++).catch(() => {});
    } else {
      const opt1 = page.getByRole("button", { name: /^Opção 1:/ });
      if (await opt1.isVisible().catch(() => false))
        await opt1.click().then(() => answered++).catch(() => {});
    }
    await page.waitForTimeout(150);
  }
  return answered;
}

try {
  // --- Cenário 1: partida completa, os dois jogando até um lado desistir ---
  const alice = await guest("PvPAlice" + Date.now().toString().slice(-6));
  const bob = await guest("PvPBob" + Date.now().toString().slice(-6));
  const a = await playerPage(alice.token);
  const b = await playerPage(bob.token);

  await enterArenaRush(a.page);
  await enterArenaRush(b.page);

  await a.page.getByText("BATALHA ENCONTRADA", { exact: true }).waitFor({ timeout: 15000 });
  await b.page.getByText("BATALHA ENCONTRADA", { exact: true }).waitFor({ timeout: 15000 });

  // "Opção 1: ..." só existe no accessibilityLabel (rótulo de leitor de
  // tela), não no texto visível — por isso getByRole (nome acessível), não
  // innerText, que só pegaria "ESPERE…"/"TOQUE!" (esses sim são texto).
  await Promise.all([
    challengeLocator(a.page).waitFor({ timeout: 8000 }),
    challengeLocator(b.page).waitFor({ timeout: 8000 }),
  ]);

  // Joga de verdade por um tempo — várias respostas processadas dos dois
  // lados prova que o ciclo completo (responder -> servidor valida via
  // WebSocket -> próximo desafio chega) está de pé, sem depender de um
  // resultado de combate específico (ver comentário de answerFor).
  const [answeredA, answeredB] = await Promise.all([
    answerFor(a.page, 20000),
    answerFor(b.page, 20000),
  ]);
  assert.ok(answeredA >= 3, `Alice deveria ter respondido vários desafios em 20s (respondeu ${answeredA})`);
  assert.ok(answeredB >= 3, `Bob deveria ter respondido vários desafios em 20s (respondeu ${answeredB})`);

  // Termina a partida desistindo — resultado determinístico e rápido, sem
  // esperar os 100s inteiros da partida (a mecânica de "jogar" já foi
  // provada acima).
  await a.page.getByRole("button", { name: "Desistir", exact: true }).click();
  await a.page.getByText(/VITÓRIA|DERROTA|EMPATE/).waitFor({ timeout: 8000 });
  await b.page.getByText(/VITÓRIA|DERROTA|EMPATE/).waitFor({ timeout: 8000 });
  const outcomeA = await a.page.getByText(/VITÓRIA|DERROTA|EMPATE/).innerText();
  const outcomeB = await b.page.getByText(/VITÓRIA|DERROTA|EMPATE/).innerText();
  assert.equal(outcomeA, "DERROTA", "quem desiste perde");
  assert.equal(outcomeB, "VITÓRIA", "o outro lado vence na hora");
  assert.deepEqual(a.errors, []);
  assert.deepEqual(b.errors, []);
  console.log("PASS: cenário 1 — partida completa jogada nos dois lados, desistência decide o resultado certo.");

  await a.page.close();
  await b.page.close();

  // --- Cenário 2: fechar a aba de um jogador no meio da partida ---
  const carol = await guest("PvPCarol" + Date.now().toString().slice(-6));
  const dave = await guest("PvPDave" + Date.now().toString().slice(-6));
  const c = await playerPage(carol.token);
  const d = await playerPage(dave.token);

  await enterArenaRush(c.page);
  await enterArenaRush(d.page);
  await c.page.getByText("BATALHA ENCONTRADA", { exact: true }).waitFor({ timeout: 15000 });
  await d.page.getByText("BATALHA ENCONTRADA", { exact: true }).waitFor({ timeout: 15000 });
  await challengeLocator(d.page).waitFor({ timeout: 8000 });

  // Carol "cai" (fecha a aba) — Dave deveria ganhar sem precisar fazer nada.
  await c.page.close();
  await d.page.getByText("Seu adversário saiu da partida.", { exact: true }).waitFor({ timeout: 8000 });
  await d.page.getByText(/VITÓRIA|DERROTA|EMPATE/).waitFor({ timeout: 8000 });
  assert.equal(await d.page.getByText(/VITÓRIA|DERROTA|EMPATE/).innerText(), "VITÓRIA");
  assert.deepEqual(d.errors, []);
  console.log("PASS: cenário 2 — fechar a aba de um jogador declara vitória pro outro na hora.");

  await d.page.close();
} finally {
  // Fecha as conexões (e com isso qualquer partida ainda ativa por causa de
  // um assert que falhou no meio) ANTES de excluir as contas — excluir uma
  // conta que ainda está numa partida ativa é justamente o cenário do bug
  // corrigido antes deste ticket (ver commit "conta excluída em partida
  // ativa derrubava o servidor"); a ordem certa evita provocar isso à toa.
  await browser.close();
  for (const token of tokens) {
    await fetch(API + "/v1/me", {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token },
    }).catch(() => {});
  }
}

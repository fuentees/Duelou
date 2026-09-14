import { createApp } from "../server/server.mjs";
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import assert from "node:assert/strict";
const app = createApp(":memory:");
await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({ channel: "msedge", headless: true });
const base = "http://127.0.0.1:" + app.server.address().port,
  users = [];
const errors = [];
const call = async (path, token, body, method) => {
  const r = await fetch(base + path, {
    method: method || (body ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw Error(await r.text());
  return r.json();
};
// Resolve a conta lendo o texto renderizado (modo "Conta rápida", nível 1: só
// soma/subtração) e clica na opção certa — garante que o anfitrião vence de
// verdade por pontuação, sem depender de quem respondeu mais rápido.
const solveAndClickCorrect = async (page) => {
  const promptText = (
    await page.locator("text=/^-?\\d+ [+−] -?\\d+$/").first().textContent()
  ).trim();
  const m = promptText.match(/^(-?\d+)\s*([+−])\s*(-?\d+)$/);
  const answer =
    m[2] === "+" ? Number(m[1]) + Number(m[3]) : Number(m[1]) - Number(m[3]);
  const buttons = await page.getByRole("button", { name: /Opção \d+:/ }).all();
  for (const btn of buttons) {
    const label = await btn.evaluate((el) => el.getAttribute("aria-label"));
    if (Number(label.split(":")[1]?.trim()) === answer) {
      await btn.click();
      return;
    }
  }
  throw Error(`resposta ${answer} não encontrada para "${promptText}"`);
};
const clickFirstOption = (page) =>
  page.getByRole("button", { name: /Opção 1:/ }).click({ timeout: 15000 });
// Cada jogador responde na sua própria aba, em sequência — não em paralelo.
// O estado de rodada de cada um é local àquela aba; jogar em paralelo com
// Promise.all criava uma corrida de coordenação só do script de teste (uma
// aba avança mais rápido que a outra e o texto da rodada muda debaixo do
// script), não uma corrida real do produto. Sequencial é determinístico.
const playAllRounds = async (page, total, solver) => {
  for (let i = 1; i <= total; i++) {
    await page.getByText(`RODADA ${i} / ${total}`, { exact: true }).waitFor();
    await solver(page);
  }
};
try {
  mkdirSync("work", { recursive: true });
  for (let i = 0; i < 2; i++) {
    const user = await call("/v1/guests", null, {
      name: `MD3${i}${Date.now().toString().slice(-6)}`,
    });
    users.push(user);
    user.context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await user.context.addInitScript(
      (token) => sessionStorage.setItem("duelou.session.v1", token),
      user.token,
    );
    user.page = await user.context.newPage();
    await user.page.route("**:3001/**", async (route) => {
      const u = new URL(route.request().url());
      const response = await route.fetch({ url: base + u.pathname + u.search });
      await route.fulfill({ response });
    });
    user.page.on("pageerror", (e) => errors.push(e.message));
    await user.page.goto("http://localhost:8083");
    await user.page.getByText(user.profile.name, { exact: true }).waitFor();
    await user.page.getByRole("button", { name: "Arena", exact: true }).click();
    await user.page
      .getByRole("button", { name: "Conta rápida", exact: true })
      .click();
    await user.page
      .getByText("Como você quer jogar?", { exact: true })
      .waitFor();
    await user.page
      .getByRole("button", { name: "Multijogador", exact: true })
      .click();
  }
  const [host, guest] = users;
  await host.page
    .getByRole("button", { name: "Criar sala", exact: true })
    .click();
  await host.page
    .getByRole("button", { name: "Só por convite", exact: true })
    .click();
  await host.page.getByRole("button", { name: "Nível 1", exact: true }).click();
  await host.page
    .getByRole("button", { name: "Melhor de 3", exact: true })
    .click();
  const created = host.page.waitForResponse(
    (r) => r.url().endsWith("/v1/rooms") && r.request().method() === "POST",
  );
  await host.page
    .getByRole("button", { name: "Criar e entrar", exact: true })
    .click();
  const room = await (await created).json();
  assert.equal(room.format, "md3");
  assert.equal(room.gamesNeeded, 3);
  assert.equal(room.mode, "math");
  await guest.page
    .getByRole("button", { name: "Entrar em uma sala", exact: true })
    .click();
  await guest.page
    .getByLabel("Código da sala", { exact: true })
    .fill(room.code);
  await guest.page
    .getByRole("button", { name: "Entrar pelo código", exact: true })
    .click();
  await host.page
    .getByText(guest.profile.name, { exact: true })
    .waitFor({ timeout: 15000 });
  await host.page
    .getByRole("button", { name: "Começar partida", exact: true })
    .click();
  await host.page.getByText("PROVA 1 DE 3", { exact: true }).waitFor();
  await host.page.screenshot({ path: "work/md3-game1-countdown.png" });
  // Prova 1: anfitrião resolve certo (1.000 garantido), convidado clica às
  // cegas — o anfitrião vence por pontuação de verdade, não por corrida.
  await playAllRounds(guest.page, 8, clickFirstOption);
  await playAllRounds(host.page, 8, solveAndClickCorrect);
  await host.page
    .getByText("PROVA 2 DE 3", { exact: true })
    .waitFor({ timeout: 15000 });
  await host.page.getByText(/Placar da série:/).waitFor();
  await host.page.screenshot({ path: "work/md3-game2-countdown.png" });
  // Ainda não é "PLACAR DA SÉRIE" — a série continua (1 de 3 provas jogada).
  const stillGoing = await host.page
    .getByText("PLACAR DA SÉRIE", { exact: true })
    .count();
  assert.equal(stillGoing, 0, "série não pode terminar depois de só 1 prova");
  for (const u of users)
    await u.page
      .getByRole("button", { name: "Pronto para a próxima", exact: true })
      .click();
  // Prova 2: anfitrião vence de novo — decide a série 2 a 0.
  await playAllRounds(guest.page, 8, clickFirstOption);
  await playAllRounds(host.page, 8, solveAndClickCorrect);
  await host.page
    .getByText("PLACAR DA SÉRIE", { exact: true })
    .waitFor({ timeout: 15000 });
  await host.page
    .getByText(/2 de 3 provas/)
    .first()
    .waitFor();
  await host.page
    .getByRole("button", { name: "Criar revanche", exact: true })
    .waitFor();
  await host.page.screenshot({ path: "work/md3-final.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: sala melhor-de-3 mostra prova 1 de 3, continua entre provas com placar da série, e fecha só quando alguém vence 2.",
  );
} finally {
  for (const u of users)
    await call("/v1/me", u.token, null, "DELETE").catch(() => {});
  await browser.close();
  await new Promise((r) => app.server.close(r));
  app.db.close();
}

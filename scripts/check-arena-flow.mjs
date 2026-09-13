import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [];
let token;
try {
  const response = await fetch("http://127.0.0.1:3001/v1/guests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Arena" + Date.now().toString().slice(-6) }),
  });
  const user = await response.json();
  token = user.token;
  assert.ok(token);
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(
    (t) => sessionStorage.setItem("duelou.session.v1", t),
    token,
  );
  await page.goto("http://localhost:8083");
  await page.getByRole("button", { name: "Jogar", exact: true }).waitFor();
  await page.getByText("Seu resumo", { exact: true }).waitFor();
  await page.screenshot({ path: "work/inicio-resumo.png" });
  await page.getByRole("button", { name: "Jogar", exact: true }).click();
  assert.equal(
    await page.getByRole("button", { name: "Treinar", exact: true }).count(),
    0,
  );
  assert.equal(
    await page.getByRole("tab", { name: "Com amigos", exact: true }).count(),
    0,
  );
  for (const name of [
    "Conta rápida",
    "Menor ou maior?",
    "Fora do padrão",
    "Sequência lógica",
    "Cor certa",
    "Tempo certo",
    "Reflexo relâmpago",
    "Mira certeira",
    "Memória turbo",
  ])
    await page.getByRole("button", { name, exact: true }).waitFor();
  // "Mira certeira" ainda não tem capa gerada (ver GameGrid.tsx) — só as
  // outras 8 têm <img>, por isso o total esperado abaixo continua 8.
  await page.waitForFunction(() => [...document.images].filter(i => i.src.includes("games")).every(i => i.complete && i.naturalWidth > 0));
  await page.screenshot({ path: "work/arena-organizada.png" });
  const artwork = await page
    .locator("img")
    .evaluateAll((images) =>
      images
        .filter((i) => i.src.includes("games"))
        .map((i) => ({ loaded: i.complete && i.naturalWidth > 0, src: i.src })),
    );
  assert.equal(artwork.length, 8);
  assert.ok(artwork.every((i) => i.loaded));
  assert.equal(new Set(artwork.map((i) => i.src)).size, 8);
  await page.getByRole("button", { name: "Conta rápida", exact: true }).click();
  await page.getByText("Como você quer jogar?", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Multijogador", exact: true }).click();
  await page.getByRole("button", { name: "Criar sala", exact: true }).click();
  await page
    .getByRole("button", { name: "Só por convite", exact: true })
    .click();
  const created = page.waitForResponse(
    (r) => r.url().endsWith("/v1/rooms") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Criar e entrar", exact: true })
    .click();
  assert.equal((await (await created).json()).public, false);
  await page.getByRole("button", { name: "Sair da sala", exact: true }).click();
  await page.getByRole("button", { name: "Tempo certo", exact: true }).click();
  await page.getByText("Como você quer jogar?", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Jogar sozinho", exact: true }).click();
  await page.getByText("Escolha a dificuldade", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Nível 1", exact: true }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Iniciar relógio", exact: true }).click();
  await page
    .getByRole("button", { name: "Parar relógio", exact: true })
    .click();
  await page.getByText("PARTIDA OFFLINE CONCLUÍDA", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Arena", exact: true }).click();
  await page
    .getByRole("button", { name: "Fora do padrão", exact: true })
    .click();
  await page.getByText("Como você quer jogar?", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Jogar sozinho", exact: true })
    .click();
  await page.getByText("Escolha a dificuldade", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Nível 1", exact: true }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  for (let i = 0; i < 8; i++)
    await page.getByRole("button", { name: /Opção 1:/ }).click();
  await page.getByText("PARTIDA OFFLINE CONCLUÍDA", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: catálogo de nove jogos, navegação sem Treinar, criação privada, partida clássica e offline.",
  );
} finally {
  if (token)
    await fetch("http://127.0.0.1:3001/v1/me", {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token },
    });
  await browser.close();
}

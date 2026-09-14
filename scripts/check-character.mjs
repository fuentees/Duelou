import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createApp } from "../server/server.mjs";
const app = createApp(":memory:");
await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${app.server.address().port}`,
  browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [];
let failSave = true;
try {
  const user = await (
    await fetch(base + "/v1/guests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Estrela" }),
    })
  ).json();
  const page = await browser.newPage({
    viewport: { width: 320, height: 740 },
    reducedMotion: "reduce",
  });
  await page.addInitScript(
    (token) => sessionStorage.setItem("duelou.session.v1", token),
    user.token,
  );
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**:3001/**", async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === "/v1/avatar" && failSave) {
      failSave = false;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Falha simulada" }),
      });
      return;
    }
    await route.fulfill({
      response: await route.fetch({ url: base + u.pathname + u.search }),
    });
  });
  const profile = async () => {
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page
      .getByRole("button", { name: "Meu perfil e conquistas", exact: true })
      .click();
  };
  await page.goto("http://localhost:8083");
  await profile();
  const preview = page.getByLabel("Prévia 3D do seu personagem", { exact: true });
  const frontGeometry = await preview.locator("polygon").first().getAttribute("points");
  await preview.screenshot({ path: "work/personagem-3d-frente.png" });
  for (let turn = 0; turn < 4; turn++)
    await page.getByRole("button", { name: "Girar personagem para a direita", exact: true }).click();
  assert.notEqual(await preview.locator("polygon").first().getAttribute("points"), frontGeometry);
  await preview.screenshot({ path: "work/personagem-3d-costas.png" });
  await page.getByRole("button", { name: "Frente", exact: true }).click();
  assert.equal(await preview.locator("polygon").first().getAttribute("points"), frontGeometry);
  await page
    .getByRole("button", { name: "Personalizar personagem", exact: true })
    .click();
  for (const label of [
    "Personagem: Gato",
    "Cor: Oceano",
    "Acessório: Coroa",
    "Moldura: Dourada",
  ])
    await page.getByRole("radio", { name: label, exact: true }).click();
  await page
    .getByRole("button", { name: "Salvar personagem", exact: true })
    .click();
  await page.getByText(/Não foi possível salvar. Seu rascunho/).waitFor();
  assert.equal(
    await page
      .getByRole("radio", { name: "Personagem: Gato", exact: true })
      .getAttribute("aria-checked"),
    "true",
  );
  await page
    .getByRole("button", { name: "Salvar personagem", exact: true })
    .click();
  await page
    .getByText("Personagem salvo na sua conta.", { exact: true })
    .waitFor();
  const expected = {
    species: "cat",
    color: "ocean",
    accessory: "crown",
    frame: "gold",
  };
  assert.deepEqual(
    JSON.parse(
      app.db
        .prepare("SELECT avatar FROM players WHERE id=?")
        .get(user.profile.id).avatar,
    ),
    expected,
  );
  await page.reload();
  await profile();
  await page
    .getByRole("button", { name: "Personalizar personagem", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("radio", { name: "Personagem: Gato", exact: true })
      .getAttribute("aria-checked"),
    "true",
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page
    .getByText("Seu personagem", { exact: true })
    .scrollIntoViewIfNeeded();
  mkdirSync("work", { recursive: true });
  await page.screenshot({ path: "work/personagem-editor.png", fullPage: true });
  app.db.prepare("INSERT INTO competitive_ratings(player,rating,played) VALUES(?,1000,1)").run(user.profile.id);
  await page.getByRole("button",{name:"Ranking",exact:true}).click();
  await page.getByLabel("Personagem de Estrela",{exact:true}).waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:"work/personagem-ranking.png",fullPage:true});

  // Ticket 36: size={40} (RoomView.tsx, avatar do rival numa sala ranked
  // "playing") é o menor uso real de <Character> no app — cobre isso dentro
  // do fluxo de verdade (uma partida competitiva de verdade sendo
  // encontrada), não isolado.
  const rival = await (
    await fetch(base + "/v1/guests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Rival36" }),
    })
  ).json();
  const rivalPage = await browser.newPage({ viewport: { width: 320, height: 740 } });
  await rivalPage.addInitScript(
    (token) => sessionStorage.setItem("duelou.session.v1", token),
    rival.token,
  );
  rivalPage.on("pageerror", (e) => errors.push(e.message));
  await rivalPage.route("**:3001/**", async (route) => {
    const u = new URL(route.request().url());
    await route.fulfill({
      response: await route.fetch({ url: base + u.pathname + u.search }),
    });
  });
  await rivalPage.goto("http://localhost:8083");
  await page.getByRole("button", { name: "Arena", exact: true }).click();
  await page
    .getByRole("button", { name: "Jogar competitivo", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Treinar enquanto procura", exact: true })
    .click();
  await rivalPage.getByRole("button", { name: "Arena", exact: true }).click();
  await rivalPage
    .getByRole("button", { name: "Jogar competitivo", exact: true })
    .click();
  await page.getByText("Rodada 1 / 18", { exact: true }).waitFor();
  await page.getByLabel(/Progresso de Rival36:/).waitFor();
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
  );
  await page.screenshot({ path: "work/personagem-rival-competitivo.png" });
  await rivalPage.close();

  assert.deepEqual(errors, []);
  console.log(
    "PASS: personagem, seleção acessível em 320px, falha com rascunho preservado, salvamento e recarga.",
  );
} finally {
  await browser.close();
  await new Promise((r) => app.server.close(r));
  app.db.close();
}

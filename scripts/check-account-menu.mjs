import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { createApp } from "../server/server.mjs";

const app = createApp(":memory:");
await new Promise(resolve => app.server.listen(0, "127.0.0.1", resolve));
const base = "http://127.0.0.1:" + app.server.address().port;
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**:3001/**", async route => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: base + url.pathname + url.search });
    await route.fulfill({ response });
  });
  await page.goto("http://localhost:8083");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Meu perfil e conquistas", exact: true }).click();
  await page.getByLabel("Apelido", { exact: true }).fill("ContaMenu");
  await page.getByRole("button", { name: "Criar jogador", exact: true }).click();
  const recovery = await page.getByText(/^([A-F0-9]{4}-){5}[A-F0-9]{4}$/).textContent();
  assert.ok(recovery);
  await page.getByRole("button", { name: "Já guardei o código", exact: true }).click();
  await page.getByRole("button", { name: "Sair deste aparelho", exact: true }).click();
  await page.getByLabel("Código de recuperação", { exact: true }).fill(recovery);
  await page.getByRole("button", { name: "Recuperar conta", exact: true }).click();
  await page.getByRole("button", { name: "Sair deste aparelho", exact: true }).waitFor();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Como jogar", exact: true }).click();
  await page.getByText("Pontos e avaliações", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Início", exact: true }).click();
  await page.getByRole("button", { name: "Jogar", exact: true }).waitFor();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Meu perfil e conquistas", exact: true }).click();
  await page.getByRole("button", { name: "Excluir conta", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar exclusão", exact: true }).click();
  await page.getByLabel("Apelido", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log("PASS: Menu, criação de conta, recuperação, navegação e exclusão em banco isolado.");
} finally {
  await browser.close();
  await new Promise(resolve => app.server.close(resolve));
  app.db.close();
}

import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createApp } from "../server/server.mjs";
import { attachArenaRealtime } from "../server/arena-ws.mjs";

const app = createApp(":memory:");
const realtime = attachArenaRealtime(app.server, app.db, Date.now);
await new Promise(r => app.server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${app.server.address().port}`;
const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [];
mkdirSync("work", { recursive: true });
async function checkLayout(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "horizontal overflow");
}
try {
  const pages = [];
  for (const [index, width] of [320, 390].entries()) {
    const user = await (await fetch(base + "/v1/guests", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `Rush Visual ${index}` }),
    })).json();
    const page = await browser.newPage({ viewport: { width, height: 740 }, reducedMotion: "reduce" });
    page.on("pageerror", e => errors.push(e.message));
    await page.addInitScript(({ token, base }) => {
      sessionStorage.setItem("duelou.session.v1", token);
      const NativeSocket = window.WebSocket;
      window.WebSocket = class extends NativeSocket {
        constructor(url, protocols) {
          super(String(url).replace(/^ws:\/\/[^/]+/, base.replace(/^http/, "ws")), protocols);
        }
      };
    }, { token: user.token, base });
    await page.route("**:3001/**", async route => {
      const url = new URL(route.request().url());
      await route.fulfill({ response: await route.fetch({ url: base + url.pathname + url.search }) });
    });
    await page.goto("http://localhost:8083");
    // Pela barra de baixo: o cartão da tela inicial troca de texto quando a
    // conta já tem duelos ("Duelar agora"), então não serve de âncora fixa.
    await page.getByRole("button", { name: "Duelo", exact: true }).click();
    await page.getByRole("button", { name: "Buscar adversário", exact: true }).waitFor();
    await checkLayout(page);
    if (!index) await page.screenshot({ path: "work/rush-lobby.png", fullPage: true });
    pages.push(page);
  }
  await pages[0].getByRole("button", { name: "Buscar adversário", exact: true }).click();
  await pages[0].getByText("Procurando adversário…", { exact: true }).waitFor();
  await pages[0].getByRole("button", { name: "Cancelar", exact: true }).click();
  await pages[0].getByRole("button", { name: "Buscar adversário", exact: true }).click();
  await pages[1].getByRole("button", { name: "Buscar adversário", exact: true }).click();
  for (const page of pages) {
    await page.getByRole("button", { name: "Desistir", exact: true }).waitFor({ timeout: 15000 });
    await checkLayout(page);
    assert.equal(await page.getByRole("progressbar").count(), 2);
  }
  await pages[0].screenshot({ path: "work/rush-battle.png", fullPage: true });
  await pages[0].getByRole("button", { name: "Desistir", exact: true }).click();
  await pages[0].getByText("DERROTA", { exact: true }).waitFor();
  await pages[1].getByText("VITÓRIA", { exact: true }).waitFor();
  await pages[1].getByText("Vitória por saída do adversário.", { exact: true }).waitFor();
  await pages[1].screenshot({ path: "work/rush-result.png", fullPage: true });
  // "Jogar outra" volta direto pra fila (Ticket de fila por nota), sem passar
  // pelo lobby — quem quiser sair usa "Menu".
  await pages[1].getByRole("button", { name: "Jogar outra", exact: true }).click();
  await pages[1].getByRole("button", { name: "Cancelar", exact: true }).waitFor({ timeout: 10000 });
  assert.deepEqual(errors, []);
  console.log("PASS: lobby 320/390px, cancelar busca, duelo WebSocket isolado, vida e tempo, resultado e retorno ao lobby.");
} finally {
  await browser.close();
  realtime.stop();
  await new Promise(r => app.server.close(r));
  app.db.close();
}

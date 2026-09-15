import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createApp } from "../server/server.mjs";
import { attachArenaRealtime } from "../server/arena-ws.mjs";

const app = createApp(":memory:");
const realtime = attachArenaRealtime(app.server, app.db, Date.now);
await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${app.server.address().port}`;
const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [];
mkdirSync("work", { recursive: true });
async function checkLayout(page) {
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "horizontal overflow",
  );
}
try {
  const pages = [];
  for (const [index, width] of [320, 390].entries()) {
    const user = await (
      await fetch(base + "/v1/guests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `Rush Visual ${index}` }),
      })
    ).json();
    const page = await browser.newPage({
      viewport: { width, height: 740 },
      reducedMotion: "reduce",
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(
      ({ token, base }) => {
        sessionStorage.setItem("duelou.session.v1", token);
        const NativeSocket = window.WebSocket;
        window.WebSocket = class extends NativeSocket {
          constructor(url, protocols) {
            super(
              String(url).replace(/^ws:\/\/[^/]+/, base.replace(/^http/, "ws")),
              protocols,
            );
          window.__rushSocket = this;
          this.addEventListener("message", event => {
            const message = JSON.parse(event.data);
            if (message.type === "challenge") window.__rushChallenge = message.challenge;
            if (message.type === "state") window.__rushState = message.state;
          });
            const send = this.send.bind(this);
            this.send = (data) => {
              window.__lastRushSent = data;
              send(data);
            };
          }
        };
      },
      { token: user.token, base },
    );
    await page.route("**:3001/**", async (route) => {
      const url = new URL(route.request().url());
      await route.fulfill({
        response: await route.fetch({ url: base + url.pathname + url.search }),
      });
    });
    await page.goto("http://localhost:8083");
    await page
      .getByRole("button", { name: "Conhecer Arena Rush", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Buscar adversário", exact: true })
      .waitFor();
    await checkLayout(page);
    if (!index)
      await page.screenshot({ path: "work/rush-lobby.png", fullPage: true });
    pages.push(page);
  }
  await pages[0]
    .getByRole("button", { name: "Buscar adversário", exact: true })
    .click();
  await pages[0].getByText("Procurando adversário…", { exact: true }).waitFor();
  await pages[0].getByRole("button", { name: "Cancelar", exact: true }).click();
  await pages[0]
    .getByRole("button", { name: "Buscar adversário", exact: true })
    .click();
  await pages[1]
    .getByRole("button", { name: "Buscar adversário", exact: true })
    .click();
  for (const page of pages) {
    await page
      .getByRole("button", { name: "Desistir", exact: true })
      .waitFor({ timeout: 15000 });
    await checkLayout(page);
    assert.equal(await page.getByRole("progressbar").count(), 2);
  }
  await pages[0]
    .getByRole("radio", { name: "Estratégia: Investida", exact: true })
    .click();
  assert.equal(
    await pages[0]
      .getByRole("radio", { name: "Estratégia: Investida", exact: true })
      .getAttribute("aria-checked"),
    "true",
  );
  const challenge = await pages[0].evaluate(() => window.__rushChallenge);
  if (challenge.kind === "reflex") {
    await pages[0].getByRole("button", { name: "TOQUE!", exact: true }).click();
  } else {
    let index;
    if (challenge.promptColor) index = challenge.optionColors.indexOf(challenge.promptColor);
    else {
      const match = challenge.prompt.match(/(\d+)\s*([+−–\-×÷])\s*(\d+)/);
      assert.ok(match, challenge.prompt);
      const a = Number(match[1]), b = Number(match[3]);
      const value = match[2] === "+" ? a+b : match[2] === "×" ? a*b : match[2] === "÷" ? a/b : a-b;
      index = challenge.options.indexOf(String(value));
    }
    assert.ok(index >= 0);
    await pages[0].getByRole("button", { name: new RegExp(`^Opção ${index+1}:`) }).click();
  }
  const sent = await pages[0].evaluate(() => JSON.parse(window.__lastRushSent));
  assert.equal(sent.type, "answer");
  assert.equal(sent.tactic, "rush");
  await pages[0].waitForFunction(() => window.__rushState?.troops.some(t => t.tactic === "rush"));
  assert.ok(await pages[0].locator("svg polygon").count() > 20, "3D troops rendered in the battlefield");
  await pages[0].screenshot({ path: "work/rush-battle.png", fullPage: true });
  // Drop one peer and hold its automatic retry briefly to inspect the paused UI.
  await pages[1].evaluate(() => {
    const Socket = window.WebSocket;
    window.WebSocket = class extends Socket {
      constructor(url, protocols) {
        super(
          window.__holdRushRetry
            ? String(url).replace("/v1/arena-realtime", "/invalid-test-socket")
            : url,
          protocols,
        );
      }
    };
    window.__holdRushRetry = true;
    window.__rushSocket.close();
  });
  const paused = pages[0].getByText(
    "Partida pausada. Aguarde a reconexão para responder.",
    { exact: true },
  );
  await paused.waitFor({ timeout: 5000 });
  const choices = pages[0].getByRole("button", {
    name: /^Opção \d:|^TOQUE!|^ESPERE…/,
  });
  assert.ok((await choices.count()) > 0);
  for (const choice of await choices.all())
    assert.equal(await choice.isDisabled(), true);
  await pages[1].evaluate(() => {
    window.__holdRushRetry = false;
  });
  await paused.waitFor({ state: "hidden", timeout: 15000 });
  await pages[0].getByRole("button", { name: "Desistir", exact: true }).click();
  await pages[0].getByText("DERROTA", { exact: true }).waitFor();
  await pages[1].getByText("VITÓRIA", { exact: true }).waitFor();
  await pages[1]
    .getByText("Vitória por saída do adversário.", { exact: true })
    .waitFor();
  await pages[1].screenshot({ path: "work/rush-result.png", fullPage: true });
  await pages[1]
    .getByRole("button", { name: "Voltar para jogar", exact: true })
    .click();
  await pages[1]
    .getByRole("button", { name: "Buscar adversário", exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: lobby 320/390px, cancelar busca, duelo WebSocket isolado, vida e tempo, resultado e retorno ao lobby.",
  );
} finally {
  await browser.close();
  realtime.stop();
  await new Promise((r) => app.server.close(r));
  app.db.close();
}

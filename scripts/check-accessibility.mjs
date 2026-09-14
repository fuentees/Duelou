import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { createApp } from "../server/server.mjs";

const app = createApp(":memory:");
await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${app.server.address().port}`;
const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [],
  report = [];
mkdirSync("work", { recursive: true });
const page = await browser.newPage({
  viewport: { width: 320, height: 740 },
  reducedMotion: "reduce",
});
page.on("pageerror", (e) => errors.push(e.message));
await page.route("**:3001/**", async (route) => {
  const url = new URL(route.request().url());
  await route.fulfill({
    response: await route.fetch({ url: base + url.pathname + url.search }),
  });
});
async function checkLayout(label) {
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    `${label}: document overflow`,
  );
  const violations = await page.evaluate(() => {
    const width = window.innerWidth;
    return [...document.querySelectorAll('[role="button"]')]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return (
          r.width && r.height && e.getAttribute("aria-disabled") !== "true"
        );
      })
      .flatMap((e) => {
        const r = e.getBoundingClientRect(),
          name = e.getAttribute("aria-label") || e.textContent;
        const issues = [];
        if (r.width < 43.5 || r.height < 43.5)
          issues.push({
            name,
            kind: "small_target",
            width: r.width,
            height: r.height,
          });
        if (r.left < -1 || r.right > width + 1)
          issues.push({
            name,
            kind: "horizontal_overflow",
            left: r.left,
            right: r.right,
          });
        return issues;
      });
  });
  report.push({ label, violations });
  assert.deepEqual(violations, [], label);
}
try {
  const user = await (await fetch(base + "/v1/guests", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Acessibilidade" }),
  })).json();
  await page.addInitScript(token => sessionStorage.setItem("duelou.session.v1", token), user.token);
  await page.goto("http://localhost:8083");
  await page.getByRole("button", { name: "Arena", exact: true }).click();
  await page
    .getByRole("button", { name: "Conta rápida", exact: true })
    .waitFor();
  await checkLayout("catalog_320px");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await checkLayout("menu_320px");
  await page.getByRole("button", { name: "Configurações", exact: true }).click();
  await checkLayout("audio_320px");
  await page.getByRole("button", { name: "Arena", exact: true }).click();
  const card = page.getByRole("button", { name: "Conta rápida", exact: true });
  await card.focus();
  assert.equal(
    await card.evaluate((el) => getComputedStyle(el).outlineWidth),
    "3px",
  );
  await page.keyboard.press("Enter");
  await page.getByText("Como você quer jogar?", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Jogar sozinho", exact: true })
    .click();
  await checkLayout("campaign_320px");
  const locked = page.getByRole("button", {
    name: "Nível 2, trancado",
    exact: true,
  });
  assert.equal(await locked.getAttribute("aria-disabled"), "true");
  // Stress text reflow at 200%, independently of browser/device font preferences.
  await page.evaluate(() => {
    for (const e of document.querySelectorAll("div,span")) {
      if (e.children.length || !e.textContent.trim()) continue;
      const style = getComputedStyle(e);
      if (style.fontFamily.includes("Ionicons")) continue;
      e.style.fontSize = `${parseFloat(style.fontSize) * 2}px`;
      e.style.lineHeight = "1.4";
    }
  });
  await checkLayout("campaign_text_200_percent");
  await page.screenshot({
    path: "work/accessibility-large-text.png",
    fullPage: true,
  });
  await page.reload();
  await page.getByRole("button", { name: "Arena", exact: true }).click();
  await page
    .getByRole("button", { name: "Fora do padrão", exact: true })
    .click();
  await page.getByRole("button", { name: "Treino livre", exact: true }).click();
  await page.getByRole("button", { name: "Nível 30", exact: true }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Começar fase", exact: true }).click();
  const choices = page.getByRole("button", { name: /Opção \d+:/ });
  await choices.nth(35).waitFor();
  await checkLayout("pattern_6x6_320px");
  assert.ok(await choices.nth(0).getAttribute("aria-label"));
  await choices
    .nth(0)
    .dispatchEvent("pointerdown", { pointerType: "mouse", button: 0 });
  assert.equal(
    await choices
      .nth(0)
      .evaluate((e) => getComputedStyle(e.firstElementChild).transform),
    "matrix(1, 0, 0, 1, 0, 0)",
  );
  await page.screenshot({
    path: "work/accessibility-pattern.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: 320px, texto 200%, teclado, foco, alvos 44px, estados acessíveis e movimento reduzido.",
  );
} finally {
  writeFileSync(
    "work/accessibility-report.json",
    JSON.stringify(report, null, 2),
  );
  await browser.close();
  await new Promise((r) => app.server.close(r));
  app.db.close();
}

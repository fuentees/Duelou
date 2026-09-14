import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { createApp } from "../server/server.mjs";
import { mkdirSync } from "node:fs";
const app = createApp(":memory:");
await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + app.server.address().port;
const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [];
const resilience = process.argv.includes("--resilience");
mkdirSync("work", { recursive: true });
// Controla quantas respostas de heartbeat seguidas (poll de ArcadeScreen.tsx,
// Ticket 44) devem ser derrubadas a partir de agora — ligado/desligado pelo
// próprio corpo do teste (Ticket 46), não fixo como o "dropped" de /round
// abaixo, porque preciso escolher o momento exato de começar a queda.
const heartbeatDrops = { remaining: 0 };
async function pageFor(user) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(20000);
  let dropped = false;
  if (resilience) {
    const session = await page.context().newCDPSession(page);
    await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  if (user)
    await page.addInitScript(
      (t) => sessionStorage.setItem("duelou.session.v1", t),
      user.token,
    );
  await page.route("**:3001/**", async (route) => {
    const u = new URL(route.request().url());
    if (
      resilience &&
      u.pathname.endsWith("/heartbeat") &&
      user?.profile.name === "Competidor0" &&
      heartbeatDrops.remaining > 0
    ) {
      heartbeatDrops.remaining--;
      await route.abort("failed");
      return;
    }
    const response = await route.fetch({ url: base + u.pathname + u.search });
    if (resilience && u.pathname.endsWith("/round")) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      const body = route.request().postDataJSON();
      if (
        user?.profile.name === "Competidor0" &&
        body?.index === 2 &&
        body?.gameIndex === 0 &&
        !dropped
      ) {
        dropped = true;
        await route.abort("failed");
        return;
      }
    }
    await route.fulfill({ response });
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:8083");
  return page;
}
async function game(page, name) {
  await page.getByRole("button", { name: "Arena", exact: true }).click();
  await page.getByRole("button", { name, exact: true }).click();
}
try {
  const solo = await pageFor();
  await game(solo, "Conta rápida");
  await solo
    .getByRole("button", { name: "Jogar sozinho", exact: true })
    .click();
  await solo.getByRole("button", { name: "Continuar", exact: true }).click();
  await solo.getByRole("button", { name: "Começar fase", exact: true }).click();
  for (let i = 1; i <= 8; i++) {
    await solo.getByText(`RODADA ${i} / 8`, { exact: true }).waitFor();
    const prompt = await solo.locator("text=/^\\d+ [+−] \\d+$/").textContent();
    const [_, a, op, b] = prompt.match(/(\d+) ([+−]) (\d+)/);
    const answer = op === "+" ? +a + +b : +a - +b;
    const options = solo.getByRole("button", { name: /Opção \d+:/ });
    const labels = await options.evaluateAll((es) =>
      es.map((e) => e.getAttribute("aria-label")),
    );
    await options
      .nth(labels.findIndex((l) => Number(l.split(":")[1]) === answer))
      .click();
  }
  await solo.getByText("Próxima fase liberada!", { exact: true }).waitFor();
  await solo.screenshot({
    path: "work/campanha-resultado.png",
    fullPage: true,
  });
  await solo.reload();
  await game(solo, "Conta rápida");
  await solo
    .getByRole("button", { name: "Jogar sozinho", exact: true })
    .click();
  assert.equal(
    await solo
      .getByRole("button", { name: "Nível 2", exact: true })
      .isEnabled(),
    true,
  );
  await solo.screenshot({
    path: "work/campanha-capitulos.png",
    fullPage: true,
  });
  await solo.setViewportSize({ width: 320, height: 740 });
  await game(solo, "Fora do padrão");
  await solo.getByRole("button", { name: "Treino livre", exact: true }).click();
  await solo.getByRole("button", { name: "Nível 30", exact: true }).click();
  await solo.getByRole("button", { name: "Continuar", exact: true }).click();
  await solo.getByRole("button", { name: "Começar fase", exact: true }).click();
  const tiles = solo.getByRole("button", { name: /Opção \d+:/ });
  await tiles.nth(35).waitFor();
  const boxes = await tiles.evaluateAll((es) =>
    es.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }),
  );
  assert.equal(new Set(boxes.map((b) => Math.round(b.y))).size, 6);
  assert.equal(new Set(boxes.map((b) => Math.round(b.x))).size, 6);
  assert.ok(boxes.every((b) => b.w >= 44 && b.h >= 44));
  await solo.screenshot({ path: "work/grade-36.png", fullPage: true });
  await solo.close();
  const users = [];
  for (let i = 0; i < 2; i++) {
    const response = await fetch(base + "/v1/guests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Competidor" + i }),
    });
    const u = await response.json();
    users.push({ ...u, page: await pageFor(u) });
  }
  for (const [i, u] of users.entries()) {
    await u.page.getByRole("button", { name: "Arena", exact: true }).click();
    await u.page
      .getByRole("button", { name: "Jogar competitivo", exact: true })
      .click();
    if (i === 0) {
      await u.page
        .getByRole("button", { name: "Treinar enquanto procura", exact: true })
        .click();
      await u.page.getByText(/Treino durante a busca/).waitFor();
    }
  }
  for (let gameIndex = 0; gameIndex < 2; gameIndex++) {
    if (gameIndex)
      for (const u of users)
        await u.page
          .getByRole("button", { name: "Pronto para a próxima", exact: true })
          .click();
    await users[0].page.getByText("Rodada 1 / 18", { exact: true }).waitFor();
    if (resilience && gameIndex === 0) {
      // O poll de ArcadeScreen.tsx (Ticket 44) já está rodando desde que a
      // sala foi aberta — o heartbeat só é bloqueado a partir de agora, pra
      // escolher o momento exato e não interferir com a resposta da rodada.
      await users[0].page.getByText(/Ao vivo/).waitFor({ timeout: 8000 });
      heartbeatDrops.remaining = 4;
      await users[0].page.getByText(/Reconectando/).waitFor({ timeout: 8000 });
      // A 4ª falha seguida vira "lost" (CONNECTION_LOST_AFTER_FAILURES).
      await users[0].page.getByText(/Conexão perdida/).waitFor({ timeout: 15000 });
      heartbeatDrops.remaining = 0;
      // Sem mais quedas, o próximo poll (backoff já no teto de 8s) recupera
      // sozinho, sem precisar de nenhuma ação do jogador.
      await users[0].page.getByText(/Ao vivo/).waitFor({ timeout: 15000 });
      console.log(
        'PASS: 4 heartbeats seguidos perdidos levam o status de "Ao vivo" a "Reconectando…" e "Conexão perdida"; parar de perder recupera "Ao vivo" sozinho.',
      );
    }
    const row = app.db.prepare("SELECT * FROM rooms WHERE ranked=1").get(),
      config = JSON.parse(row.config);
    assert.equal(row.game_index, gameIndex);
    for (let index = 0; index < config.rounds.length; index++)
      for (let i = 0; i < 2; i++) {
        const p = users[i].page;
        await p
          .getByText(`Rodada ${index + 1} / 18`, { exact: true })
          .waitFor();
        await p.waitForTimeout(150);
        const choice =
          i === 0
            ? config.rounds[index].answer
            : (config.rounds[index].answer + 1) %
              config.rounds[index].options.length;
        const response = p.waitForResponse(
          (r) => r.url().endsWith("/round") && r.request().method() === "POST",
        );
        await p
          .getByRole("button", { name: new RegExp(`^Opção ${choice + 1}:`) })
          .click();
        if (resilience && gameIndex === 0 && index === 2 && i === 0) {
          await p
            .getByRole("button", { name: "Tentar novamente", exact: true })
            .click();
        }
        assert.equal((await response).status(), 200);
        if (gameIndex === 0 && index === 2 && i === 0) {
          await p.reload();
          await p.getByRole("button", { name: "Arena", exact: true }).click();
          await p.getByText("Rodada 4 / 18", { exact: true }).waitFor();
        }
      }
  }
  await users[0].page.getByText("Você venceu!", { exact: true }).waitFor();
  await users[0].page.screenshot({
    path: "work/competitivo-resultado.png",
    fullPage: true,
  });
  const nextQueue = users[0].page.waitForResponse(
    (r) =>
      r.url().endsWith("/v1/rooms/competitive") &&
      r.request().method() === "POST",
  );
  await users[0].page
    .getByRole("button", { name: "Continuar", exact: true })
    .click();
  const queued = await (await nextQueue).json();
  assert.equal(queued.ranked, true);
  assert.equal(queued.state, "waiting");
  await users[0].page
    .getByRole("button", { name: "Treinar enquanto procura", exact: true })
    .waitFor();
  await users[0].page
    .getByRole("button", { name: "Sair da sala", exact: true })
    .click();
  await users[0].page
    .getByRole("button", { name: "Ranking", exact: true })
    .click();
  await users[0].page.getByText(/1024 pontos/).waitFor();
  await users[0].page.screenshot({
    path: "work/competitivo-ranking.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  if (resilience)
    console.log(
      "PASS: CPU 4x mais lenta, 150ms extras por resposta e perda de resposta já aceita sem duplicação de pontos.",
    );
  console.log(
    "PASS: campanha sem conta e persistência, treino 6×6, duas provas competitivas, resultado e ranking por habilidade.",
  );
} finally {
  await browser.close();
  await new Promise((r) => app.server.close(r));
  app.db.close();
}

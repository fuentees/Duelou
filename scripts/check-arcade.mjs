import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const base = "http://127.0.0.1:3001",
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
try {
  mkdirSync("work", { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await context.route("**:3001/**", (r) => r.abort());
  const offline = await context.newPage();
  offline.on("pageerror", (e) => errors.push(e.message));
  await offline.goto("http://localhost:8083");
  await offline.getByRole("tab", { name: "Offline", exact: true }).click();
  await offline
    .getByRole("radio", { name: "Fora do padrão", exact: true })
    .click();
  await offline.screenshot({ path: "work/arcade-home.png", fullPage: true });
  await offline
    .getByRole("button", { name: "Jogar offline", exact: true })
    .click();
  // Todo jogador novo começa no nível 1 (8 rodadas) — não existe mais escolha
  // manual de nível, ele sobe sozinho ao passar de fase.
  for (let i = 0; i < 8; i++)
    await offline.getByRole("button", { name: /Opção 1:/ }).click();
  await offline
    .getByText("PARTIDA OFFLINE CONCLUÍDA", { exact: true })
    .waitFor();
  await offline.screenshot({ path: "work/arcade-offline.png", fullPage: true });
  for (let i = 0; i < 3; i++) {
    const user = await call("/v1/guests", null, {
      name: `Grupo${i}${Date.now().toString().slice(-5)}`,
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
    user.page.on("pageerror", (e) => errors.push(e.message));
    await user.page.goto("http://localhost:8083");
    await user.page.getByText(user.profile.name, { exact: true }).waitFor();
  }
  const host = users[0].page;
  await host.getByRole("tab", { name: "Com amigos", exact: true }).click();
  const created = host.waitForResponse(
    (r) => r.url().endsWith("/v1/rooms") && r.request().method() === "POST",
  );
  await host
    .getByRole("button", { name: "Criar sala privada", exact: true })
    .click();
  const room = await (await created).json();
  for (const user of users.slice(1)) {
    await user.page
      .getByRole("tab", { name: "Com amigos", exact: true })
      .click();
    await user.page
      .getByLabel("Código da sala", { exact: true })
      .fill(room.code);
    await user.page
      .getByRole("button", { name: "Entrar pelo código", exact: true })
      .click();
  }
  await host
    .getByText(users[2].profile.name, { exact: true })
    .waitFor({ timeout: 15000 });
  await host.screenshot({ path: "work/arcade-group.png", fullPage: true });
  await host
    .getByRole("button", { name: "Começar partida", exact: true })
    .click();
  await Promise.all(
    users.map(async (user) => {
      for (let i = 0; i < 8; i++)
        await user.page
          .getByRole("button", { name: /Opção 1:/ })
          .click({ timeout: 15000 });
    }),
  );
  await host
    .getByText("PLACAR FINAL", { exact: true })
    .waitFor({ timeout: 15000 });
  await host
    .getByText(/\d+ · \d+\.\d+s/)
    .first()
    .waitFor();
  await host
    .getByRole("button", { name: "Criar revanche", exact: true })
    .waitFor();
  await host.screenshot({ path: "work/arcade-scoreboard.png", fullPage: true });
  const rematchResponse = host.waitForResponse(
    (r) => r.url().endsWith("/v1/rooms") && r.request().method() === "POST",
  );
  await host
    .getByRole("button", { name: "Criar revanche", exact: true })
    .click();
  const rematch = await (await rematchResponse).json();
  assert.notEqual(rematch.code, room.code);
  await host.getByText(`SALA ${rematch.code}`, { exact: true }).waitFor();
  await host.reload();
  await host
    .getByText(`SALA ${rematch.code}`, { exact: true })
    .waitFor({ timeout: 15000 });
  await host.getByRole("button", { name: "Sair da sala", exact: true }).click();
  await host
    .getByLabel(/Suas estatísticas: 1 partidas, \d+ vitórias/)
    .waitFor();
  await host.getByRole("tab", { name: "Online", exact: true }).click();
  await host.getByLabel(/Ranking Arcade com \d+ jogadores/).waitFor();
  await host.screenshot({ path: "work/arcade-stats.png", fullPage: true });
  await host.getByRole("button", { name: "2 pessoas", exact: true }).click();
  const publicHost = host.waitForResponse(
    (r) => r.url().endsWith("/v1/rooms") && r.request().method() === "POST",
  );
  await host
    .getByRole("button", { name: "Criar sala pública", exact: true })
    .click();
  const searching = await (await publicHost).json();
  assert.equal(searching.state, "waiting");
  const rival = users[1].page;
  await rival
    .getByRole("button", { name: "Voltar às salas", exact: true })
    .click();
  await rival.getByRole("tab", { name: "Online", exact: true }).click();
  const publicRival = rival.waitForResponse(
    (r) =>
      r.url().endsWith(`/v1/rooms/${searching.code}/join`) &&
      r.request().method() === "POST",
  );
  await rival
    .getByRole("button", {
      name: `Entrar na sala ${searching.code}`,
      exact: true,
    })
    .click();
  const matched = await (await publicRival).json();
  assert.equal(matched.code, searching.code);
  assert.equal(matched.state, "countdown");
  await host
    .getByText("Prepare-se. A mesma prova para todos.", { exact: true })
    .waitFor({ timeout: 15000 });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: níveis progressivos, offline, grupo, placar, revanche, reconexão, ranking e pareamento 1×1 automático; sem erros de página.",
  );
} finally {
  for (const u of users)
    await call("/v1/me", u.token, null, "DELETE").catch(() => {});
  await browser.close();
}

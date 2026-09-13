import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const base = "http://127.0.0.1:3001";
const users = [];
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
// Único jeito de chegar em "como jogar" pelo catálogo — nível só se pergunta
// depois, e só pra quem for jogar sozinho ou abrir sala por convite.
const chooseGame = async (page, name) => {
  await page.getByRole("button", { name: "Arena", exact: true }).click();
  await page.getByRole("button", { name, exact: true }).click();
  await page.getByText("Como você quer jogar?", { exact: true }).waitFor();
};
try {
  for (let i = 0; i < 3; i++) {
    const user = await call("/v1/guests", null, {
      name: `Grupo${i}${Date.now().toString().slice(-5)}`,
    });
    users.push(user);
    user.context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await user.context.addInitScript(
      (token) => sessionStorage.setItem("duelou.session.v1", token),
      user.token,
    );
    user.page = await user.context.newPage();
    user.page.on("pageerror", (e) => errors.push(e.message));
    await user.page.goto("http://localhost:8083");
    await user.page.getByRole("button", { name: "Jogar", exact: true }).waitFor();
  }
  const [host, rival, third] = users.map((u) => u.page);
  // Sala privada com 3 pessoas (grupo) — capacidade não precisa ser exata,
  // só cobrir os jogadores que vão entrar.
  await chooseGame(host, "Conta rápida");
  await host.getByRole("button", { name: "Multijogador", exact: true }).click();
  await host.getByRole("button", { name: "Criar sala", exact: true }).click();
  await host.getByRole("button", { name: "Só por convite", exact: true }).click();
  await host.getByRole("button", { name: "4 pessoas", exact: true }).click();
  const created = host.waitForResponse(
    (r) => r.url().endsWith("/v1/rooms") && r.request().method() === "POST",
  );
  await host.getByRole("button", { name: "Criar e entrar", exact: true }).click();
  const room = await (await created).json();
  for (const page of [rival, third]) {
    await chooseGame(page, "Conta rápida");
    await page.getByRole("button", { name: "Multijogador", exact: true }).click();
    await page.getByRole("button", { name: "Entrar em uma sala", exact: true }).click();
    await page.getByLabel("Código da sala", { exact: true }).fill(room.code);
    await page.getByRole("button", { name: "Entrar pelo código", exact: true }).click();
  }
  await host.getByText(users[2].profile.name, { exact: true }).waitFor({ timeout: 15000 });
  await host.getByRole("button", { name: "Começar partida", exact: true }).click();
  await Promise.all(
    [host, rival, third].map(async (page) => {
      for (let i = 0; i < 8; i++)
        await page.getByRole("button", { name: /Opção 1:/ }).click({ timeout: 15000 });
    }),
  );
  await host.getByText("PLACAR FINAL", { exact: true }).waitFor({ timeout: 15000 });
  await host.screenshot({ path: "work/arcade-group.png", fullPage: true });
  // Revanche: o primeiro clique cria a sala e vira idempotente pros outros —
  // um aceita, o outro recusa, e isso não afeta quem já aceitou.
  const rematchResponse = host.waitForResponse(
    (r) => r.url().endsWith(`/v1/rooms/${room.code}/rematch`) && r.request().method() === "POST",
  );
  await host.getByRole("button", { name: "Criar revanche", exact: true }).click();
  const rematch = await (await rematchResponse).json();
  assert.notEqual(rematch.code, room.code);
  await host.getByText(`SALA ${rematch.code}`, { exact: true }).waitFor();
  await rival.getByRole("button", { name: "Aceitar revanche", exact: true }).waitFor({ timeout: 15000 });
  await rival.getByRole("button", { name: "Aceitar revanche", exact: true }).click();
  await rival.getByText(`SALA ${rematch.code}`, { exact: true }).waitFor();
  await rival.getByRole("button", { name: "Sair da sala", exact: true }).click();
  await third.getByRole("button", { name: "Recusar revanche", exact: true }).waitFor({ timeout: 15000 });
  await third.getByRole("button", { name: "Recusar revanche", exact: true }).click();
  await third.getByRole("button", { name: "Aceitar revanche", exact: true }).waitFor({ state: "hidden" });
  // Recarregar a página confirma que a sala da revanche sobrevive à sessão
  // (achada de novo por /v1/rooms/active, não só guardada em estado local) —
  // a seção "Arena" não é lembrada entre recarregamentos, então volta pra lá
  // manualmente antes de esperar a sala reaparecer.
  await host.reload();
  await host.getByRole("button", { name: "Jogar", exact: true }).waitFor();
  await host.getByRole("button", { name: "Arena", exact: true }).click();
  await host.getByText(`SALA ${rematch.code}`, { exact: true }).waitFor({ timeout: 15000 });
  await host.getByRole("button", { name: "Sair da sala", exact: true }).click();
  // Pareamento público automático (1×1): duas pessoas do mesmo jogo, mesmo
  // sem combinar nada, caem na mesma sala.
  await chooseGame(host, "Conta rápida");
  await host.getByRole("button", { name: "Multijogador", exact: true }).click();
  const searching = host.waitForResponse(
    (r) => r.url().endsWith("/v1/rooms/random") && r.request().method() === "POST",
  );
  await host.getByRole("button", { name: "Encontrar partida", exact: true }).click();
  const searchingRoom = await (await searching).json();
  assert.equal(searchingRoom.state, "waiting");
  await chooseGame(rival, "Conta rápida");
  await rival.getByRole("button", { name: "Multijogador", exact: true }).click();
  const matching = rival.waitForResponse(
    (r) => r.url().endsWith("/v1/rooms/random") && r.request().method() === "POST",
  );
  await rival.getByRole("button", { name: "Encontrar partida", exact: true }).click();
  const matched = await (await matching).json();
  assert.equal(matched.code, searchingRoom.code);
  assert.equal(matched.state, "countdown");
  await host
    .getByText("Prepare-se. A mesma prova para todos.", { exact: true })
    .waitFor({ timeout: 15000 });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: sala em grupo (3 pessoas), placar, revanche com aceitar/recusar, reconexão por reload e pareamento público automático 1×1.",
  );
} finally {
  for (const u of users) await call("/v1/me", u.token, null, "DELETE").catch(() => {});
  await browser.close();
}

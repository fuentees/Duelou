import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
});
const errors = [];
const playerName = `Teste${Date.now().toString().slice(-8)}`;
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto("http://localhost:8083");
  await page
    .getByRole("button", { name: "Entrar para jogar online", exact: true })
    .click();
  await page.getByLabel("Apelido", { exact: true }).fill(playerName);
  await page
    .getByRole("button", { name: "Criar jogador", exact: true })
    .click();
  const recoveryText = await page
    .getByText(/^([A-F0-9]{4}-){5}[A-F0-9]{4}$/)
    .textContent();
  await page
    .getByRole("button", { name: "Já guardei o código", exact: true })
    .click();
  await page.getByText(playerName, { exact: true }).waitFor();
  await page
    .getByRole("button", {
      name: "Jogos clássicos, perfil e conquistas",
      exact: true,
    })
    .click();
  await page.getByText("Jogue com amigos", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Treino", exact: true }).click();
  mkdirSync("work", { recursive: true });
  await page.screenshot({ path: "work/inicio.png", fullPage: true });
  await page.getByText("◷ 5,00 cravado", { exact: true }).last().click();
  await page.getByRole("button", { name: "Iniciar", exact: true }).click();
  await page.waitForTimeout(4900);
  await page
    .getByRole("button", { name: "Parar relógio", exact: true })
    .click();
  await page.getByText("RESULTADO SALVO", { exact: true }).waitFor();
  await page.screenshot({ path: "work/resultado.png", fullPage: true });
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByText(/1 partidas/).waitFor();
  await page.reload();
  await page
    .getByRole("button", {
      name: "Jogos clássicos, perfil e conquistas",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Treino", exact: true }).click();
  await page.getByText(/1 partidas/).waitFor();
  await page.getByText("Desafio", { exact: true }).click();
  const memoryResponse = page.waitForResponse(
    (r) => r.url().endsWith("/v1/matches") && r.request().method() === "POST",
  );
  await page.getByText("▦ Memória turbo", { exact: true }).click();
  const memory = (await (await memoryResponse).json()).config;
  await page
    .getByRole("button", { name: "Mostrar sequência", exact: true })
    .click();
  await page.getByText("Sua vez", { exact: true }).waitFor();
  for (const n of memory.sequence)
    await page
      .getByRole("button", { name: "Bloco " + (n + 1), exact: true })
      .click();
  await page.getByText("RESULTADO SALVO", { exact: true }).waitFor();
  await page.getByText("1000", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByText("ϟ Reflexo relâmpago", { exact: true }).click();
  await page.getByText("TOQUE PARA COMEÇAR", { exact: true }).click();
  for (let i = 0; i < 3; i++) {
    await page.getByText("AGORA!", { exact: true }).waitFor();
    await page.waitForTimeout(200);
    await page.getByText("AGORA!", { exact: true }).click();
  }
  await page.getByText("RESULTADO SALVO", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByText(/3 partidas/).waitFor();
  await page.getByRole("button", { name: "Ranking", exact: true }).click();
  await page.getByText(new RegExp(`\\d+\\. ${playerName}`)).waitFor();
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await page
    .getByRole("button", { name: "Entrar para jogar online", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Já tenho uma conta", exact: true })
    .click();
  await page
    .getByLabel("Código de recuperação", { exact: true })
    .fill(recoveryText);
  await page
    .getByRole("button", { name: "Recuperar conta", exact: true })
    .click();
  await page.getByText(playerName, { exact: true }).waitFor();
  await page
    .getByRole("button", {
      name: "Jogos clássicos, perfil e conquistas",
      exact: true,
    })
    .click();
  await page.getByText("Jogue com amigos", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Perfil", exact: true }).click();
  await page.screenshot({ path: "work/perfil.png", fullPage: true });
  await page
    .getByRole("button", { name: "Excluir conta", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmar exclusão", exact: true })
    .click();
  await page.getByLabel("Apelido", { exact: true }).waitFor();
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    "PASS: cadastro, cronômetro, memória, reflexo de 3 rodadas, salvar, recarregar, ranking e excluir; sem erros de página.",
  );
} finally {
  await browser.close();
}

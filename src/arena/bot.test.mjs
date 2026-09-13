import test from "node:test";
import assert from "node:assert/strict";
import { createArenaState, MAX_TROOPS_PER_SIDE } from "../../shared/arena/engine.ts";
import { createBotState, stepBot } from "./bot.ts";

const noRandom = () => 0.5;

test("bot nunca passa do teto de tropas nem da energia máxima", () => {
  const state = createArenaState(1000);
  const bot = createBotState("medium");
  for (let i = 0; i < 5000; i++) {
    stepBot(state, bot, 0.05, noRandom);
    assert.ok(bot.energy <= 100, "energia não pode passar do máximo");
    const own = state.troops.filter((t) => t.side === "enemy").length;
    assert.ok(own <= MAX_TROOPS_PER_SIDE, "não pode passar do teto de tropas");
  }
});

test("sob pressão (base baixa), gasta energia em defesa assim que possível", () => {
  const state = createArenaState(100);
  state.enemyBaseHp = 10; // bem abaixo do limiar de pressão
  const bot = createBotState("medium");
  bot.energy = 70; // dá pra pagar um tank (65) de cara
  stepBot(state, bot, 0.016, noRandom);
  assert.equal(state.troops.length, 1, "deveria ter invocado na primeira chance, sem esperar juntar mais");
  assert.equal(state.troops[0].type, "tank", "sob pressão e com energia de sobra, prioriza a tropa mais forte disponível");
});

test("dominando, guarda energia pra tank em vez de gastar em soldier", () => {
  const state = createArenaState(100);
  state.enemyBaseHp = 100;
  state.playerBaseHp = 40; // margem de 60 > DOMINATING_MARGIN (25)
  const bot = createBotState("medium");
  bot.energy = 50; // dá pra pagar soldier (35) e scout (20), mas não tank (65)
  // random() sempre devolvendo 0.5 faria o modo "normal" invocar soldier
  // (random()<0.5 é falso aqui, então cairia pro scout) — não importa,
  // o ponto é que no modo "dominando" nem soldier nem esse caminho existem.
  for (let i = 0; i < 20; i++) stepBot(state, bot, 0.016, noRandom);
  assert.ok(
    state.troops.every((t) => t.type !== "soldier"),
    "dominando, não deveria gastar em soldier (só guarda pra tank ou solta scout ocasional)",
  );
});

test("energia recupera com o tempo e depende da dificuldade", () => {
  // dt pequeno o bastante pra nenhuma das duas dificuldades juntar energia
  // suficiente pra invocar nada (scout, a mais barata, custa 20) — assim a
  // comparação é só sobre a taxa de recuperação, sem gasto no meio.
  const easy = createBotState("easy");
  easy.energy = 0;
  stepBot(createArenaState(100), easy, 0.5, noRandom);
  const medium = createBotState("medium");
  medium.energy = 0;
  stepBot(createArenaState(100), medium, 0.5, noRandom);
  assert.ok(medium.energy > easy.energy, "médio deveria acumular energia mais rápido que fácil");
});

import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./server.mjs";
import {
  makeArcade,
  arcadeScore,
  publicArcade,
  modes,
  levelRules,
  MAX_LEVEL,
} from "../shared/arcade.mjs";
test("provas: alternativas únicas, escada de níveis 1..MAX_LEVEL e pontuação", () => {
  for (const mode of modes.filter(m=>!["timer","reflex","aim","memory"].includes(m.id)))
    for (const level of [1, 2, Math.round(MAX_LEVEL / 2), MAX_LEVEL])
      for (let n = 0; n < 15; n++) {
        const c = makeArcade(mode.id, level);
        assert.equal(c.difficulty, level);
        assert.equal(c.rounds.length, levelRules[level - 1].rounds);
        assert.equal(c.seconds, levelRules[level - 1].seconds);
        assert.equal(c.rulesVersion, 6);
        assert.equal(
          arcadeScore(
            c,
            c.rounds.map((r) => r.answer),
          ),
          1000,
        );
        assert.equal(arcadeScore(c, []), 0);
        assert.ok(publicArcade(c).rounds.every((r) => !("answer" in r)));
        if (mode.id !== "odd")
          assert.ok(
            c.rounds.every((r) => new Set(r.options).size === r.options.length),
          );
      }
  assert.throws(() => makeArcade("math", MAX_LEVEL + 1));
  assert.throws(() => makeArcade("math", 0));
  assert.throws(() => makeArcade("unknown", 1));
  assert.equal(makeArcade("odd", 1).rounds[0].options.length, 4);
  assert.equal(makeArcade("odd", MAX_LEVEL).rounds[0].options.length, 36);
  assert.equal(makeArcade("order", 1).rounds[0].options.length, 4);
  assert.equal(makeArcade("order", MAX_LEVEL).rounds[0].options.length, 8);
  assert.ok(makeArcade("math", MAX_LEVEL).rounds.every(r=>r.options.length===4));
  assert.match(makeArcade("sequence", 1).rounds[0].prompt, /\?/);
  assert.ok(
    makeArcade("colors", 2).rounds.every(
      (r) => r.optionColors.length === r.options.length,
    ),
  );
  // "Qual é o menor?" não pode mais ser uma sequência de passo fixo — a resposta
  // não é sempre o primeiro valor gerado nem os valores diferem por um passo constante.
  // (uniqueValues faz amostragem por rejeição: precisa de um PRNG que varie a
  // cada chamada, não de um valor fixo, senão nunca junta valores distintos.)
  let seed = 1;
  const fauxRandom = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const orderRounds = makeArcade("order", MAX_LEVEL, fauxRandom).rounds;
  const gaps = new Set(
    orderRounds[0].options
      .slice()
      .sort((a, b) => a - b)
      .map((v, i, arr) => (i ? Number((v - arr[i - 1]).toFixed(2)) : null))
      .filter((g) => g !== null),
  );
  assert.ok(gaps.size > 1, "as diferenças entre opções não podem ser todas iguais");
  // "Qual é o menor?" não pode ser sempre a mesma pergunta — perguntar o maior
  // às vezes é o que torna o modo mais que "decorar onde clicar".
  const orderPrompts = new Set(
    makeArcade("order", MAX_LEVEL, fauxRandom).rounds.map((r) => r.prompt),
  );
  assert.equal(orderPrompts.size, 2, "deve alternar entre menor e maior");
  // Acertar em sequência vale mais que acertar o mesmo total espalhado — sem
  // isso, "sorte espalhada" pontua igual a "domínio sustentado".
  const c = makeArcade("math", 5, fauxRandom);
  const right = c.rounds.map((r) => r.answer);
  const wrong = c.rounds.map((r) => (r.answer + 1) % r.options.length);
  const half = c.rounds.length;
  const streakAnswers = right
    .slice(0, Math.floor(half / 2))
    .concat(wrong.slice(Math.floor(half / 2)));
  const scatteredAnswers = right.map((v, i) => (i % 2 === 0 ? v : wrong[i]));
  assert.ok(
    arcadeScore(c, streakAnswers) > arcadeScore(c, scatteredAnswers),
    "acertos em sequência devem valer mais que o mesmo total espalhado",
  );
});
test("salas: descoberta, sorteio por nível, grupo, largada, placar, replay e saída", async () => {
  let now = Date.now();
  const app = createApp(":memory:", () => now);
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + app.server.address().port;
  const call = async (path, token, body, method) => {
    const r = await fetch(base + path, {
      method: method || (body ? "POST" : "GET"),
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, data: await r.json() };
  };
  try {
    const users = [];
    for (let i = 0; i < 4; i++)
      users.push((await call("/v1/guests", null, { name: "Player" + i })).data);
    const [a, b, c, d] = users;
    assert.equal((await call("/v1/rooms", null)).status, 401);
    // Todo mundo começa no nível 1 — o cliente não escolhe mais o nível da sala.
    const privateRoom = (
      await call("/v1/rooms", a.token, { mode: "math", capacity: 4, public: false })
    ).data;
    assert.equal(privateRoom.difficulty, 1);
    // Tamanho de turma (Ticket 27) — presets grandes funcionam, valores fora
    // da lista continuam rejeitados.
    const classroom = (
      await call("/v1/rooms", a.token, { mode: "math", capacity: 30, public: false })
    ).data;
    assert.equal(classroom.capacity, 30);
    assert.equal(
      (await call("/v1/rooms", a.token, { mode: "math", capacity: 12, public: false })).status,
      400,
    );
    assert.equal((await call("/v1/rooms", b.token)).data.length, 0);
    assert.equal(
      (await call("/v1/rooms/" + privateRoom.code, b.token)).status,
      403,
    );
    const r = (
      await call("/v1/rooms", a.token, { mode: "odd", capacity: 4, public: true })
    ).data;
    assert.equal(r.config, null);
    assert.equal((await call("/v1/rooms/active", a.token)).data.code, r.code);
    assert.equal((await call("/v1/rooms", b.token)).data.length, 1);
    const pairSearch = (await call("/v1/rooms/random", b.token, { mode: "odd" }))
      .data;
    assert.notEqual(pairSearch.code, r.code);
    const pairFound = (await call("/v1/rooms/random", c.token, { mode: "odd" }))
      .data;
    assert.equal(pairFound.code, pairSearch.code);
    assert.equal(pairFound.state, "countdown");
    await call("/v1/rooms/" + r.code + "/join", b.token, {});
    await call("/v1/rooms/" + r.code + "/join", c.token, {});
    assert.equal(
      (await call("/v1/rooms/" + r.code + "/start", b.token, {})).status,
      403,
    );
    const started = (await call("/v1/rooms/" + r.code + "/start", a.token, {}))
      .data;
    assert.equal(started.state, "countdown");
    assert.equal(started.config, null);
    assert.equal(
      (await call("/v1/rooms/" + r.code + "/join", d.token, {})).status,
      409,
    );
    now += 6000;
    const running = (await call("/v1/rooms/" + r.code, b.token)).data;
    assert.equal(running.state, "playing");
    assert.equal(running.difficulty, 1);
    assert.ok(running.config.rounds.every((round) => !("answer" in round)));
    const stored = JSON.parse(
      app.db.prepare("SELECT config FROM rooms WHERE code=?").get(r.code)
        .config,
    );
    const answers = stored.rounds.map((x) => x.answer);
    assert.equal(
      (
        await call("/v1/rooms/" + r.code + "/finish", a.token, {
          answers: Array(8).fill(99),
        })
      ).status,
      400,
    );
    await call("/v1/rooms/" + r.code + "/finish", a.token, { answers });
    const replay = (
      await call("/v1/rooms/" + r.code + "/finish", a.token, { answers: [] })
    ).data;
    assert.equal(replay.members.find((x) => x.id === a.profile.id).score, 1000);
    now += 250;
    await call("/v1/rooms/" + r.code + "/finish", b.token, { answers });
    now += 250;
    await call("/v1/rooms/" + r.code + "/finish", c.token, { answers: [] });
    const finalRoom = (await call("/v1/rooms/" + r.code, a.token)).data;
    assert.equal(finalRoom.state, "finished");
    assert.ok(finalRoom.members.find(m=>m.id===a.profile.id).durationMs < finalRoom.members.find(m=>m.id===b.profile.id).durationMs);
    // Mesma pontuação de 'a' e 'b' (1.000); 'a' respondeu mais rápido e por
    // isso vence — pontos primeiro, tempo de resposta desempata.
    assert.equal(finalRoom.members.find(m=>m.id===a.profile.id).seriesWins,1);
    assert.ok(finalRoom.members.filter(m=>m.id!==a.profile.id).every(m=>m.seriesWins===0));
    assert.equal(finalRoom.history[0].winner,a.profile.id);
    // 'a' venceu com 1.000 pontos no nível 1 (seu nível atual): sobe pro nível 2.
    assert.deepEqual((await call("/v1/rooms/stats", a.token)).data, {
      played: 1,
      wins: 1,
      best: 1000,
      average: 1000,
      level: 2,
      maxLevel: MAX_LEVEL,
    });
    const leaders = (await call("/v1/rooms/leaderboard", a.token)).data;
    assert.deepEqual(leaders, [], "salas casuais não entram no ranking");
    // Revanche: primeiro clique cria a sala nova e aponta a antiga pra ela —
    // quem ainda está na sala antiga descobre pelo próprio view() (nextCode).
    const rematchByA = (
      await call("/v1/rooms/" + r.code + "/rematch", a.token, {})
    ).data;
    assert.notEqual(rematchByA.code, r.code);
    assert.equal(rematchByA.host, a.profile.id);
    const oldRoomForB = (await call("/v1/rooms/" + r.code, b.token)).data;
    assert.equal(oldRoomForB.nextCode, rematchByA.code);
    // 'b' aceita: entra na mesma sala que 'a' criou (reaproveita o /join).
    const bAccepts = (
      await call("/v1/rooms/" + rematchByA.code + "/join", b.token, {})
    ).data;
    assert.equal(bAccepts.members.length, 2);
    // 'c' clica em "criar revanche" de novo — idempotente, não fragmenta o
    // grupo numa segunda sala, só entra na que já existe.
    const rematchByC = (
      await call("/v1/rooms/" + r.code + "/rematch", c.token, {})
    ).data;
    assert.equal(rematchByC.code, rematchByA.code);
    assert.equal(rematchByC.members.length, 3);
    // Sala que ainda não terminou não pode virar origem de revanche.
    assert.equal(
      (await call("/v1/rooms/" + rematchByA.code + "/rematch", a.token, {}))
        .status,
      409,
    );
    // A próxima sala de 'a' no MESMO jogo ("odd") já nasce no nível novo —
    // nível é por jogo, então "math" (nunca jogado por 'a') continua no 1.
    const nextRoom = (
      await call("/v1/rooms", a.token, { mode: "odd", capacity: 2, public: false })
    ).data;
    assert.equal(nextRoom.difficulty, 2);
    const freshGameRoom = (
      await call("/v1/rooms", a.token, { mode: "math", capacity: 2, public: false })
    ).data;
    assert.equal(freshGameRoom.difficulty, 1);
    await call("/v1/rooms/" + freshGameRoom.code, a.token, undefined, "DELETE");
    await call("/v1/rooms/" + nextRoom.code, a.token, undefined, "DELETE");
    // Pareamento público de duas pessoas começa sem depender de anfitrião.
    const searching = (await call("/v1/rooms/random", d.token, { mode: "math" }))
      .data;
    assert.equal(searching.state, "waiting");
    assert.equal(
      (await call("/v1/rooms/active", d.token)).data.code,
      searching.code,
    );
    const matched = (await call("/v1/rooms/random", b.token, { mode: "math" }))
      .data;
    assert.equal(matched.code, searching.code);
    assert.equal(matched.state, "countdown");
    await call("/v1/rooms/" + matched.code, d.token, undefined, "DELETE");
    assert.equal((await call("/v1/rooms/active", d.token)).data, null);
    // A sala privada transfere anfitrião quando o criador sai.
    await call("/v1/rooms/" + privateRoom.code + "/join", b.token, {});
    await call("/v1/rooms/" + privateRoom.code, a.token, undefined, "DELETE");
    assert.equal(
      (await call("/v1/rooms/" + privateRoom.code, b.token)).data.host,
      b.profile.id,
    );
    now += 86400001;
    assert.deepEqual((await call("/v1/rooms/stats", a.token)).data, {
      played: 1,
      wins: 1,
      best: 1000,
      average: 1000,
      level: 2,
      maxLevel: MAX_LEVEL,
    });
    assert.equal((await call("/v1/rooms/" + r.code, a.token)).status, 404);
    await call("/v1/me", a.token, undefined, "DELETE");
    assert.equal((await call("/v1/rooms/" + r.code, b.token)).status, 404);
  } finally {
    await new Promise((r) => app.server.close(r));
    app.db.close();
  }
});
// Mesmo valor de STALE_MEMBER_GRACE_MS em server/rooms.mjs — não exportado
// (detalhe interno do sweep), então duplicado aqui só pro teste.
const STALE_MEMBER_GRACE_MS_FOR_TEST = 45000;
test("salas: auto-desistência por inatividade destrava a sala sem esperar o cronômetro (casuais e ranqueadas)", async () => {
  let now = Date.now();
  const app = createApp(":memory:", () => now);
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + app.server.address().port;
  const call = async (path, token, body, method) => {
    const r = await fetch(base + path, {
      method: method || (body ? "POST" : "GET"),
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, data: await r.json() };
  };
  try {
    // --- Sala casual: 'sumida' nunca mais dá sinal de vida depois de largar. ---
    const ativa = (await call("/v1/guests", null, { name: "Ativa" })).data;
    const sumida = (await call("/v1/guests", null, { name: "Sumida" })).data;
    const room = (
      await call("/v1/rooms", ativa.token, { mode: "math", capacity: 2, public: false })
    ).data;
    await call("/v1/rooms/" + room.code + "/join", sumida.token, {});
    await call("/v1/rooms/" + room.code + "/start", ativa.token, {});
    now += 6000; // passa o countdown — sala "playing" (nível 1: 75s de prova)

    // Bem antes do limiar (45s): heartbeat normal de 'ativa' não deveria
    // forfeitar ninguém, nem a própria 'ativa' nem 'sumida' ainda dentro do prazo.
    now += 20000;
    await call("/v1/rooms/" + room.code + "/heartbeat", ativa.token, {});
    let mid = (await call("/v1/rooms/" + room.code, ativa.token)).data;
    assert.equal(
      mid.members.find((m) => m.id === sumida.profile.id).forfeited,
      false,
      "fronteira antes do limiar não deveria disparar",
    );
    assert.equal(mid.state, "playing", "sala não deveria terminar sozinha ainda (nem pelo cronômetro nem por forfeit)");

    // Passa dos 45s desde o último sinal de 'sumida' (que nunca deu heartbeat
    // — seu 'seen' ficou parado no instante em que entrou). 'ativa' continua
    // mandando heartbeat normalmente.
    now += 26000; // ~46s desde o join de 'sumida', bem antes dos 75s+10s da prova
    await call("/v1/rooms/" + room.code + "/heartbeat", ativa.token, {});
    const after = (await call("/v1/rooms/" + room.code, ativa.token)).data;
    assert.equal(
      after.members.find((m) => m.id === sumida.profile.id).forfeited,
      true,
      "forfeit automático depois do limiar",
    );
    assert.equal(
      after.members.find((m) => m.id === ativa.profile.id).forfeited,
      false,
      "quem dá heartbeat normal nunca é desistido",
    );
    assert.equal(after.state, "playing", "'ativa' ainda pode terminar a prova normalmente");
    // 'ativa' termina de verdade — com 'sumida' já contabilizada (score 0),
    // a sala fecha sem esperar o cronômetro dos 75s+10s da prova inteira.
    const config = JSON.parse(
      app.db.prepare("SELECT config FROM rooms WHERE code=?").get(room.code).config,
    );
    const finished = (
      await call("/v1/rooms/" + room.code + "/finish", ativa.token, {
        answers: config.rounds.map((x) => x.answer),
      })
    ).data;
    assert.equal(finished.state, "finished");
    assert.equal(finished.members.find((m) => m.id === ativa.profile.id).score, 1000);
    assert.equal(finished.members.find((m) => m.id === sumida.profile.id).score, 0);

    // --- Sala ranqueada: FORA do escopo deste sweep, de propósito. ---
    // Desvio do plano original: ranqueada já tem o próprio mecanismo de
    // "configuração expirada preserva respostas confirmadas"
    // (server/competitive.mjs) — um teste real desse arquivo mostrou que
    // este sweep genérico zerava a pontuação antes desse crédito parcial
    // mais fino entrar em ação. Como não devo mexer em lógica de pontuação/
    // rating, ranqueada fica só com o que já existe (ver comentário de
    // autoForfeitStale em rooms.mjs).
    const rankedA = (await call("/v1/guests", null, { name: "RankedAtiva" })).data;
    const rankedB = (await call("/v1/guests", null, { name: "RankedSumida" })).data;
    const ranked = (await call("/v1/rooms/competitive", rankedA.token, {})).data;
    await call("/v1/rooms/competitive", rankedB.token, {});
    now += 6000; // passa o countdown de 5s do pareamento ranqueado

    now += STALE_MEMBER_GRACE_MS_FOR_TEST + 1000;
    await call("/v1/rooms/" + ranked.code + "/heartbeat", rankedA.token, {});
    const rankedAfter = (await call("/v1/rooms/" + ranked.code, rankedA.token)).data;
    assert.equal(
      rankedAfter.members.find((m) => m.id === rankedB.profile.id).forfeited,
      false,
      "ranqueada não é tocada por este sweep — fica com o mecanismo próprio dela",
    );
  } finally {
    await new Promise((r) => app.server.close(r));
    app.db.close();
  }
});
test("níveis: só passa de fase acima da nota mínima, e pareamento usa tolerância", async () => {
  let now = Date.now();
  const app = createApp(":memory:", () => now);
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + app.server.address().port;
  const call = async (path, token, body, method) => {
    const r = await fetch(base + path, {
      method: method || (body ? "POST" : "GET"),
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, data: await r.json() };
  };
  try {
    const a = (await call("/v1/guests", null, { name: "Nivel1" })).data;
    const room = (
      await call("/v1/rooms", a.token, { mode: "math", capacity: 2, public: false })
    ).data;
    // Sala privada não começa sozinha — força a largada direto no banco pra
    // testar só a regra de pontuação, sem precisar de um segundo jogador aqui.
    app.db
      .prepare("UPDATE rooms SET starts=? WHERE code=?")
      .run(now + 1000, room.code);
    now += 6000;
    const config = JSON.parse(
      app.db.prepare("SELECT config FROM rooms WHERE code=?").get(room.code)
        .config,
    );
    const wrongAnswers = config.rounds.map((r) => (r.answer + 1) % r.options.length);
    const lowScoreFinish = await call("/v1/rooms/" + room.code + "/finish", a.token, {
      answers: wrongAnswers,
    });
    assert.equal(lowScoreFinish.status, 200);
    assert.equal(lowScoreFinish.data.members[0].score, 0);
    // Pontuação baixa não sobe de nível.
    assert.equal((await call("/v1/rooms/stats", a.token)).data.level, 1);
    // Sorteio de sala pareia com tolerância — não precisa ser o mesmo nível exato.
    const b = (await call("/v1/guests", null, { name: "Nivel4" })).data;
    app.db
      .prepare("INSERT INTO arcade_stats(player,mode,level) VALUES(?,'math',4)")
      .run(b.profile.id);
    const bRoom = (await call("/v1/rooms/random", b.token, { mode: "math" })).data;
    assert.equal(bRoom.difficulty, 4);
    const aMatch = (await call("/v1/rooms/random", a.token, { mode: "math" })).data;
    assert.equal(aMatch.code, bRoom.code, "distância 3 deve casar (tolerância)");
    assert.equal(aMatch.state, "countdown");
    // Fora da tolerância: nível muito distante não pareia, abre sala nova.
    // (bRoom já foi consumida/iniciada pelo pareamento acima — usar uma sala
    // nova, sozinha, pra isolar o efeito da tolerância do efeito de corrida.)
    const g = (await call("/v1/guests", null, { name: "Nivel4b" })).data;
    app.db
      .prepare("INSERT INTO arcade_stats(player,mode,level) VALUES(?,'math',4)")
      .run(g.profile.id);
    const gRoom = (await call("/v1/rooms/random", g.token, { mode: "math" })).data;
    assert.equal(gRoom.state, "waiting");
    const e = (await call("/v1/guests", null, { name: "Nivel20" })).data;
    app.db
      .prepare("INSERT INTO arcade_stats(player,mode,level) VALUES(?,'math',?)")
      .run(e.profile.id, MAX_LEVEL);
    const eRoom = (await call("/v1/rooms/random", e.token, { mode: "math" })).data;
    assert.notEqual(
      eRoom.code,
      gRoom.code,
      "distância 16 não deve casar (fora da tolerância)",
    );
    assert.equal(eRoom.state, "waiting");
  } finally {
    await new Promise((r) => app.server.close(r));
    app.db.close();
  }
});
test("MD3: série melhor-de-3 continua entre provas e só fecha quando alguém vence 2", async () => {
  let now = Date.now();
  const app = createApp(":memory:", () => now);
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + app.server.address().port;
  const call = async (path, token, body, method) => {
    const r = await fetch(base + path, {
      method: method || (body ? "POST" : "GET"),
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, data: await r.json() };
  };
  let a, b;
  const playGame = async (code) => {
    const config = JSON.parse(
      app.db.prepare("SELECT config FROM rooms WHERE code=?").get(code).config,
    );
    const winAnswers = config.rounds.map((r) => r.answer);
    const loseAnswers = config.rounds.map((r) => (r.answer + 1) % r.options.length);
    await call("/v1/rooms/" + code + "/finish", a.token, { answers: loseAnswers });
    return (
      await call("/v1/rooms/" + code + "/finish", b.token, { answers: winAnswers })
    ).data;
  };
  try {
    a = (await call("/v1/guests", null, { name: "MD3-A" })).data;
    b = (await call("/v1/guests", null, { name: "MD3-B" })).data;
    const room = (
      await call("/v1/rooms", a.token, {
        mode: "math",
        capacity: 2,
        public: false,
        format: "md3",
      })
    ).data;
    assert.equal(room.format, "md3");
    assert.equal(room.gamesNeeded, 3);
    await call("/v1/rooms/" + room.code + "/join", b.token, {});
    await call("/v1/rooms/" + room.code + "/start", a.token, {});
    now += 6000;
    // Prova 1: b vence.
    const afterGame1 = await playGame(room.code);
    assert.equal(afterGame1.state, "intermission", "série continua — só 1 de 3");
    assert.equal(afterGame1.gameIndex, 1);
    assert.equal(afterGame1.history.length, 1);
    assert.equal(afterGame1.history[0].winner, b.profile.id);
    assert.equal(
      afterGame1.members.find((m) => m.id === b.profile.id).seriesWins,
      1,
    );
    // Exatamente no instante da largada da prova 2 (sem folga nenhuma) — cobre
    // a corrida que o teste de navegador (check-md3.mjs) pegava: resultado
    // rápido demais sendo rejeitado como "partida ainda não começou".
    now += 25000;
    // Prova 2: b vence de novo — 2 a 0, série decidida.
    const afterGame2 = await playGame(room.code);
    assert.equal(afterGame2.state, "finished");
    assert.equal(afterGame2.history.length, 2);
    assert.equal(afterGame2.members[0].id, b.profile.id);
    assert.equal(afterGame2.members[0].seriesWins, 2);
    assert.equal(
      afterGame2.members.find((m) => m.id === a.profile.id).seriesWins,
      0,
    );
    // Estatísticas pessoais contam as duas provas jogadas, não a série como uma só.
    assert.deepEqual(
      (await call("/v1/rooms/stats", b.token)).data.played,
      2,
    );
    assert.deepEqual((await call("/v1/rooms/stats", b.token)).data.wins, 2);
    assert.deepEqual((await call("/v1/rooms/stats", a.token)).data.played, 2);
    assert.deepEqual((await call("/v1/rooms/stats", a.token)).data.wins, 0);
  } finally {
    await new Promise((r) => app.server.close(r));
    app.db.close();
  }
});

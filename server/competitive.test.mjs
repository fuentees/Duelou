import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./server.mjs";
import { roomRoutes } from "./rooms.mjs";
import { makeArcade, arcadeScore, publicArcade } from "../shared/arcade.mjs";
import {
  recordProgress,
  starsFor,
  dailyRandom,
  ratingChange,
} from "../shared/progression.mjs";
function harness() {
  let now = 1800000000000;
  const app = createApp(":memory:", () => now);
  for (const uid of ["a", "b", "c"])
    app.db
      .prepare("INSERT INTO players(id,name,token,created) VALUES(?,?,?,?)")
      .run(uid, uid, uid, now);
  const routes = roomRoutes(app.db, () => now);
  return {
    db: app.db,
    call: (path, uid, body, method) =>
      routes(
        path,
        method || (body === undefined ? "GET" : "POST"),
        body?.answer !== undefined && body.ticket === undefined
          ? {
              ...body,
              ticket: JSON.parse(
                app.db
                  .prepare(
                    "SELECT progress FROM room_members WHERE room=? AND player=?",
                  )
                  .get(path.split("/")[3], uid)?.progress || "{}",
              ).ticket,
            }
          : body || {},
        uid,
        new URLSearchParams(),
      ).data,
    advance: (ms) => (now += ms),
    close: () => app.db.close(),
    config: (code) =>
      JSON.parse(
        app.db.prepare("SELECT config FROM rooms WHERE code=?").get(code)
          .config,
      ),
  };
}
test("saída competitiva é definitiva e não duplica a classificação", () => {
  const h = harness();
  try {
    const r = h.call("/v1/rooms/competitive", "a", {});
    h.call("/v1/rooms/competitive", "b", {});
    h.advance(5000);
    h.call(`/v1/rooms/${r.code}`, "b", {}, "DELETE");
    assert.throws(
      () => h.call(`/v1/rooms/${r.code}/heartbeat`, "b", {}),
      /encerrada/,
    );
    assert.throws(
      () => h.call(`/v1/rooms/${r.code}/join`, "b", {}),
      /encerrada/,
    );
    for (let gameIndex = 0; gameIndex < 2; gameIndex++) {
      if (gameIndex) h.advance(25000);
      h.call(`/v1/rooms/${r.code}/round`, "a", { gameIndex });
      const config = h.config(r.code);
      for (let index = 0; index < config.rounds.length; index++) {
        h.advance(150);
        h.call(`/v1/rooms/${r.code}/round`, "a", {
          gameIndex,
          index,
          answer: config.rounds[index].answer,
        });
      }
    }
    assert.equal(h.call(`/v1/rooms/${r.code}`, "a").ratingResult.outcome, 1);
    assert.equal(
      h.db
        .prepare("SELECT played FROM competitive_ratings WHERE player='b'")
        .get().played,
      1,
    );
  } finally {
    h.close();
  }
});
test("grupo MD3 termina 1–1–1 sem vencedor inventado", () => {
  const h = harness();
  try {
    const r = h.call("/v1/rooms", "a", {
      mode: "math",
      capacity: 4,
      public: false,
      format: "md3",
    });
    for (const uid of ["b", "c"]) h.call(`/v1/rooms/${r.code}/join`, uid, {});
    h.call(`/v1/rooms/${r.code}/start`, "a", {});
    for (let gameIndex = 0; gameIndex < 3; gameIndex++) {
      h.advance(gameIndex ? 25000 : 5000);
      const config = h.config(r.code);
      for (const [i, uid] of ["a", "b", "c"].entries())
        h.call(`/v1/rooms/${r.code}/finish`, uid, {
          gameIndex,
          answers: config.rounds.map((q) =>
            i === gameIndex ? q.answer : (q.answer + 1) % q.options.length,
          ),
        });
    }
    const final = h.call(`/v1/rooms/${r.code}`, "a");
    assert.equal(final.state, "finished");
    assert.ok(final.members.every((m) => m.seriesWins === 1));
    assert.equal(h.call("/v1/rooms/leaderboard", "a").length, 0);
  } finally {
    h.close();
  }
});
test("campanha independente, estrelas, treino sem saltos e desafio determinístico", () => {
  let p = { unlocked: 1, best: {} };
  p = recordProgress(p, 1, 649);
  assert.equal(p.unlocked, 1);
  p = recordProgress(p, 1, 650);
  assert.equal(p.unlocked, 2);
  assert.equal(recordProgress(p, 1, 1000).unlocked, 2);
  assert.equal(recordProgress(p, 30, 1000).unlocked, 2);
  assert.equal(recordProgress(p, 1, 1).best[1], 650);
  assert.equal(
    recordProgress({ unlocked: 30, best: {} }, 30, 1000).unlocked,
    30,
  );
  assert.deepEqual(
    [0, 1, 649, 650, 899, 900].map(starsFor),
    [0, 1, 1, 2, 2, 3],
  );
  assert.throws(() => recordProgress(p, 0, 1000));
  assert.deepEqual(
    makeArcade("math", 5, dailyRandom("2026-09-12")),
    makeArcade("math", 5, dailyRandom("2026-09-12")),
  );
  assert.ok(ratingChange(1000, 1400, 1, 10) > ratingChange(1000, 600, 1, 10));
});
test("fila oficial: configuração comum, respostas por etapa, replay e classificação por série", () => {
  const h = harness();
  try {
    const r = h.call("/v1/rooms/competitive", "a", {
      mode: "memory",
      difficulty: 30,
      ranked: true,
    });
    assert.equal(r.ranked, true);
    assert.equal(r.difficulty, 6);
    assert.equal(r.format, "md3");
    assert.equal(h.call("/v1/rooms/competitive", "a", {}).code, r.code);
    assert.equal(h.call("/v1/rooms", "c").length, 0);
    assert.throws(
      () => h.call(`/v1/rooms/${r.code}/join`, "c", {}),
      /fila|competição/,
    );
    assert.equal(h.call("/v1/rooms/competitive", "b", {}).code, r.code);
    for (let gameIndex = 0; gameIndex < 2; gameIndex++) {
      h.advance(gameIndex ? 25100 : 5100);
      const live = h.call(`/v1/rooms/${r.code}`, "a");
      assert.deepEqual(live.config.rounds, []);
      assert.throws(
        () => h.call(`/v1/rooms/${r.code}/finish`, "a", { answers: [] }),
        /rodada/,
      );
      const first = h.call(`/v1/rooms/${r.code}/round`, "a", { gameIndex });
      assert.equal(first.index, 0);
      assert.equal(first.question.answer, undefined);
      assert.equal(first.question.explanation, undefined);
      assert.throws(
        () =>
          h.call(`/v1/rooms/${r.code}/round`, "a", {
            gameIndex,
            index: 0,
            answer: 0,
          }),
        /Espere/,
      );
      h.call(`/v1/rooms/${r.code}/round`, "b", { gameIndex });
      const config = h.config(r.code);
      for (let index = 0; index < config.rounds.length; index++) {
        h.advance(150);
        const answer = config.rounds[index].answer;
        const result = h.call(`/v1/rooms/${r.code}/round`, "a", {
          gameIndex,
          index,
          answer,
        });
        if (!result.done) {
          assert.equal(result.feedback.correct, true);
          assert.equal(
            h.call(`/v1/rooms/${r.code}/round`, "a", {
              gameIndex,
              index,
              answer,
            }).index,
            index + 1,
          );
          assert.throws(
            () =>
              h.call(`/v1/rooms/${r.code}/round`, "a", {
                gameIndex,
                index,
                answer: (answer + 1) % 4,
              }),
            /confirmada/,
          );
        }
        h.call(`/v1/rooms/${r.code}/round`, "b", {
          gameIndex,
          index,
          answer: (answer + 1) % config.rounds[index].options.length,
        });
      }
      if (gameIndex === 0)
        assert.equal(h.call("/v1/rooms/leaderboard", "a").length, 0);
    }
    const final = h.call(`/v1/rooms/${r.code}`, "a");
    assert.equal(final.state, "finished");
    assert.equal(
      h.db
        .prepare(
          "SELECT COUNT(*) n FROM competitive_attempts WHERE reason='completed'",
        )
        .get().n,
      4,
    );
    assert.ok(
      h.db
        .prepare(
          "SELECT elapsed_ms FROM competitive_attempts WHERE player='a' LIMIT 1",
        )
        .get().elapsed_ms > 0,
    );
    assert.equal(final.ratingResult.delta, 24);
    assert.equal(final.ratingResult.rating, 1024);
    assert.deepEqual(
      h.call("/v1/rooms/leaderboard", "a").map((r) => [r.id, r.played, r.wins]),
      [
        ["a", 1, 1],
        ["b", 1, 0],
      ],
    );
    h.call(`/v1/rooms/${r.code}`, "b");
    assert.equal(
      h.db.prepare("SELECT COUNT(*) n FROM competitive_results").get().n,
      2,
    );
    assert.equal(h.call(`/v1/rooms/${r.code}/rematch`, "a", {}).ranked, false);
  } finally {
    h.close();
  }
});
test("empate em pontos é resolvido por quem respondeu mais rápido; salas privadas não podem forjar classificação", () => {
  const h = harness();
  try {
    const r = h.call("/v1/rooms", "a", {
      mode: "math",
      capacity: 2,
      public: false,
      ranked: true,
    });
    assert.equal(r.ranked, false);
    h.call(`/v1/rooms/${r.code}/join`, "b", {});
    h.call(`/v1/rooms/${r.code}/start`, "a", {});
    h.advance(6000);
    const answers = h.config(r.code).rounds.map((r) => r.answer);
    h.call(`/v1/rooms/${r.code}/finish`, "a", { answers });
    h.advance(1000);
    const final = h.call(`/v1/rooms/${r.code}/finish`, "b", { answers });
    // Mesma pontuação (mesmas respostas); "a" respondeu 1s mais rápido e
    // por isso vence a prova — pontos primeiro, tempo de resposta desempata.
    assert.equal(final.members.find((m) => m.id === "a").seriesWins, 1);
    assert.equal(final.members.find((m) => m.id === "b").seriesWins, 0);
    assert.equal(final.history[0].winner, "a");
    assert.deepEqual(h.call("/v1/rooms/leaderboard", "a"), []);
  } finally {
    h.close();
  }
});
test("validação temporal, curva de reflexo e configurações antigas", () => {
  const c = makeArcade("reflex", 1);
  assert.ok(arcadeScore(c, [100, 100, 100]) > arcadeScore(c, [180, 180, 180]));
  assert.equal(arcadeScore(c, [99, 99, 99]), 0);
  assert.equal(arcadeScore({ ...c, rulesVersion: 5 }, [180, 180, 180]), 1000);
  const aim = makeArcade("aim", 30);
  assert.equal(
    arcadeScore(
      aim,
      aim.rounds.map((r) => r.visMs),
    ),
    0,
  );
  for (let i = 0; i < aim.rounds.length; i++)
    for (let j = i + 1; j < aim.rounds.length; j++) {
      const a = aim.rounds[i],
        b = aim.rounds[j];
      if (a.spawnMs + a.visMs > b.spawnMs)
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 24);
    }
  const seq = makeArcade("sequence", 20);
  assert.ok(seq.rounds.every((r) => r.explanation));
  assert.ok(publicArcade(seq).rounds.every((r) => !r.explanation));
});
test("fila respeita faixa de habilidade e abandono de todos não recompensa", () => {
  const h = harness();
  try {
    const r = h.call("/v1/rooms/competitive", "a", {});
    h.db
      .prepare(
        "INSERT INTO competitive_ratings(player,rating) VALUES('c',2000)",
      )
      .run();
    assert.notEqual(h.call("/v1/rooms/competitive", "c", {}).code, r.code);
    h.call("/v1/rooms/competitive", "b", {});
    for (let i = 0; i < 3; i++)
      (h.advance(100000), h.call(`/v1/rooms/${r.code}`, "a"));
    assert.deepEqual(h.call("/v1/rooms/leaderboard", "a"), []);
    assert.equal(h.call(`/v1/rooms/${r.code}`, "a").state, "finished");
  } finally {
    h.close();
  }
});
test("busca amplia durante espera; reconexão mantém resposta e prazo", () => {
  const h = harness();
  try {
    h.db
      .prepare(
        "INSERT INTO competitive_ratings(player,rating) VALUES('b',1300)",
      )
      .run();
    const a = h.call("/v1/rooms/competitive", "a", {}),
      b = h.call("/v1/rooms/competitive", "b", {});
    assert.notEqual(a.code, b.code);
    for (let i = 0; i < 3; i++) {
      h.advance(10000);
      h.call(`/v1/rooms/${a.code}/heartbeat`, "a", {});
      if (i < 2) h.call(`/v1/rooms/${b.code}/heartbeat`, "b", {});
    }
    const active = h.call("/v1/rooms/active", "a");
    assert.equal(active.code, b.code);
    assert.equal(active.state, "countdown");
    h.advance(5000);
    const first = h.call(`/v1/rooms/${b.code}/round`, "a", { gameIndex: 0 });
    h.advance(1000);
    const answer = h.config(b.code).rounds[0].answer;
    h.call(`/v1/rooms/${b.code}/round`, "a", {
      gameIndex: 0,
      index: 0,
      answer,
    });
    h.advance(1000);
    const resume = h.call(`/v1/rooms/${b.code}/round`, "a", { gameIndex: 0 });
    assert.equal(resume.index, 1);
    assert.equal(resume.remainingMs, first.remainingMs - 2000);
    assert.throws(
      () => h.call(`/v1/rooms/${b.code}/round`, "a", { gameIndex: 9 }),
      /terminou/,
    );
  } finally {
    h.close();
  }
});
test("série empatada conta uma vez; configuração expirada preserva respostas confirmadas", () => {
  const h = harness();
  try {
    const r = h.call("/v1/rooms/competitive", "a", {});
    h.call("/v1/rooms/competitive", "b", {});
    for (let gameIndex = 0; gameIndex < 3; gameIndex++) {
      h.advance(gameIndex ? 25000 : 5000);
      for (const uid of ["a", "b"])
        h.call(`/v1/rooms/${r.code}/round`, uid, { gameIndex });
      const config = h.config(r.code);
      for (let index = 0; index < config.rounds.length; index++) {
        h.advance(150);
        for (const uid of ["a", "b"])
          h.call(`/v1/rooms/${r.code}/round`, uid, {
            gameIndex,
            index,
            answer: config.rounds[index].answer,
          });
      }
    }
    assert.equal(h.call(`/v1/rooms/${r.code}`, "a").ratingResult.outcome, 0.5);
    assert.ok(
      h
        .call("/v1/rooms/leaderboard", "a")
        .every((r) => r.rating === 1000 && r.draws === 1 && r.played === 1),
    );
    const next = h.call("/v1/rooms/competitive", "a", {});
    h.call("/v1/rooms/competitive", "b", {});
    h.advance(5000);
    h.call(`/v1/rooms/${next.code}/round`, "a", { gameIndex: 0 });
    h.advance(1000);
    h.call(`/v1/rooms/${next.code}/round`, "a", {
      gameIndex: 0,
      index: 0,
      answer: h.config(next.code).rounds[0].answer,
    });
    h.advance(90000);
    const expired = h.call(`/v1/rooms/${next.code}`, "a");
    assert.ok(expired.history[0].scores.a > 0);
    assert.equal(expired.history[0].scores.b, 0);
    assert.equal(
      h.db
        .prepare(
          "SELECT reason FROM competitive_attempts WHERE room=? AND player='a' AND game_index=0",
        )
        .get(next.code).reason,
      "time_limit",
    );
    assert.equal(
      h.db
        .prepare(
          "SELECT reason FROM competitive_attempts WHERE room=? AND player='b' AND game_index=0",
        )
        .get(next.code).reason,
      "did_not_start",
    );
  } finally {
    h.close();
  }
});

test("tickets rotacionam sem perder replay e progresso do rival", () => {
  const h = harness();
  try {
    const r = h.call("/v1/rooms/competitive", "a", {});
    h.call("/v1/rooms/competitive", "b", {});
    h.advance(5000);
    const path = `/v1/rooms/${r.code}/round`,
      first = h.call(path, "a", { gameIndex: 0 });
    h.advance(150);
    assert.throws(
      () =>
        h.call(path, "a", {
          gameIndex: 0,
          index: 0,
          answer: 0,
          ticket: "invalid",
        }),
      /Atualize/,
    );
    const answer = h.config(r.code).rounds[0].answer;
    const next = h.call(path, "a", {
      gameIndex: 0,
      index: 0,
      answer,
      ticket: first.ticket,
    });
    assert.notEqual(next.ticket, first.ticket);
    h.advance(150);
    assert.throws(
      () =>
        h.call(path, "a", {
          gameIndex: 0,
          index: 1,
          answer: 0,
          ticket: first.ticket,
        }),
      /Atualize/,
    );
    assert.equal(
      h.call(path, "a", {
        gameIndex: 0,
        index: 0,
        answer,
        ticket: first.ticket,
      }).index,
      1,
    );
    assert.equal(
      h.call(`/v1/rooms/${r.code}`, "b").members.find((m) => m.id === "a")
        .answered,
      1,
    );
    assert.equal(h.config(r.code).rounds.length, 18);
    assert.equal(h.config(r.code).seconds, 45);
    assert.deepEqual([...new Set(h.config(r.code).roundLevels)], [6, 11, 16]);
  } finally {
    h.close();
  }
});
test("seis séries contra o mesmo rival limitam pontos sem banir jogador rápido", () => {
  const h = harness();
  try {
    for (let series = 0; series < 6; series++) {
      const room = h.call("/v1/rooms/competitive", "a", {});
      h.call("/v1/rooms/competitive", "b", {});
      for (let gameIndex = 0; gameIndex < 3; gameIndex++) {
        h.advance(gameIndex ? 25000 : 5000);
        const path = `/v1/rooms/${room.code}/round`;
        for (const uid of ["a", "b"]) h.call(path, uid, { gameIndex });
        const config = h.config(room.code);
        for (let index = 0; index < 18; index++) {
          h.advance(150);
          for (const uid of ["a", "b"])
            h.call(path, uid, {
              gameIndex,
              index,
              answer: config.rounds[index].answer,
            });
        }
      }
      const final = h.call(`/v1/rooms/${room.code}`, "a");
      assert.equal(
        final.ratingResult.status,
        series < 5 ? "counted" : "same_rival_limit",
      );
    }
    assert.equal(
      h.db
        .prepare("SELECT played FROM competitive_ratings WHERE player='a'")
        .get().played,
      5,
    );
    assert.ok(
      h.db
        .prepare(
          "SELECT COUNT(*) n FROM integrity_signals WHERE kind='uniform_fast_answers'",
        )
        .get().n > 0,
    );
    assert.equal(
      h.db.prepare("SELECT COUNT(*) n FROM game_history WHERE player='a'").get()
        .n,
      18,
    );
    h.advance(2 * 86400000);
    h.call("/v1/rooms", "a");
    assert.equal(
      h.db.prepare("SELECT COUNT(*) n FROM game_history WHERE player='a'").get()
        .n,
      18,
    );
    h.db.prepare("DELETE FROM players WHERE id='b'").run();
    assert.equal(
      h.db.prepare("SELECT COUNT(*) n FROM game_history WHERE player='a'").get()
        .n,
      18,
    );
  } finally {
    h.close();
  }
});

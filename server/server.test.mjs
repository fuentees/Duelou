import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./server.mjs";
import {
  challenge,
  dailyChallenge,
  score,
  reward,
  progression,
} from "./rules.mjs";
test("regras, dificuldades e níveis", () => {
  assert.deepEqual(dailyChallenge("2026-09-09"), dailyChallenge("2026-09-09"));
  assert.notDeepEqual(
    dailyChallenge("2026-09-09"),
    dailyChallenge("2026-09-10"),
  );
  const reflex = challenge("reflex", 2);
  assert.equal(score(reflex, { reactions: [200, 300, 400] }), 824);
  assert.throws(() => score(reflex, { reactions: [200] }));
  assert.equal(score(reflex, { falseStart: true }), 0);
  for (const difficulty of [1, 2, 3]) {
    const c = challenge("timer", difficulty);
    assert.equal(score(c, { elapsedMs: 5000 }), 1000);
    assert.equal(score(c, { elapsedMs: 30000 }), 0);
    const m = challenge("memory", difficulty);
    assert.equal(m.sequence.length, [4,6,8][difficulty-1]);
    assert.equal(score(m, { answers: m.sequence }), 1000);
  }
  assert.throws(() => score(challenge("reflex", 1), { reactionMs: 20 }));
  assert.deepEqual(progression(100), { level: 2, current: 0, needed: 200 });
  assert.equal(reward(1000, 3, 30).xp, 0);
  assert.equal(reward(0, 3, 0).coins, 0);
});
test("API: sessões, autorização, duelos, replay, ranking e exclusão", async () => {
  let now = Date.parse("2026-09-08T12:00:00Z");
  const app = createApp(":memory:", () => now);
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + app.server.address().port;
  const call = async (path, token, body, method) => {
    const r = await fetch(base + path, {
      method: method || (body === undefined ? "GET" : "POST"),
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, data: await r.json() };
  };
  try {
    assert.equal((await call("/v1/me")).status, 401);
    assert.equal(
      (await call("/v1/guests", null, { name: "<script>" })).status,
      400,
    );
    const a = (await call("/v1/guests", null, { name: "Alice" })).data;
    const b = (await call("/v1/guests", null, { name: "Bruno" })).data;
    const c = (await call("/v1/guests", null, { name: "Carla" })).data;
    assert.match(a.recoveryCode, /^([A-F0-9]{4}-){5}[A-F0-9]{4}$/);
    assert.equal(a.profile.xp, 0);
    assert.equal(a.profile.level, 1);
    const duel = (
      await call("/v1/duels", a.token, { game: "timer", difficulty: 2 })
    ).data;
    assert.equal(
      (await call("/v1/matches", b.token, { code: duel.code })).status,
      403,
    );
    assert.equal(
      (await call("/v1/duels/join", b.token, { code: duel.code })).status,
      200,
    );
    await call("/v1/presence", b.token, {});
    const room = (await call("/v1/duels", a.token)).data[0];
    assert.equal(room.participants.find(p => p.id === b.profile.id).online, true);
    now += 21000;
    assert.equal((await call("/v1/duels", a.token)).data[0].participants.find(p => p.id === b.profile.id).online, false);
    assert.equal(
      (await call("/v1/duels/join", c.token, { code: duel.code })).status,
      409,
    );
    const ma = (await call("/v1/matches", a.token, { code: duel.code })).data;
    const mb = (await call("/v1/matches", b.token, { code: duel.code })).data;
    assert.deepEqual(ma.config, mb.config);
    assert.equal(
      (
        await call("/v1/matches/" + ma.id + "/finish", b.token, {
          elapsedMs: 5000,
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await call("/v1/matches/" + ma.id + "/finish", a.token, {
          elapsedMs: 5000,
        })
      ).status,
      400,
    );
    now += 6000;
    const ra = await call("/v1/matches/" + ma.id + "/finish", a.token, {
      elapsedMs: 5000,
      score: 999999,
      xp: 999999,
    });
    assert.equal(ra.status, 200);
    assert.equal(ra.data.score, 1000);
    assert.equal(ra.data.xp, 25);
    const duplicate = await call("/v1/matches/" + ma.id + "/finish", a.token, {
      elapsedMs: 20000,
    });
    assert.equal(duplicate.data.profile.xp, 25);
    assert.equal(duplicate.data.score, 1000);
    assert.equal(
      (await call("/v1/matches", a.token, { code: duel.code })).status,
      409,
    );
    await call("/v1/matches/" + mb.id + "/finish", b.token, {
      elapsedMs: 5500,
    });
    assert.equal((await call("/v1/duels", a.token)).data[0].results.length, 2);
    assert.equal(
      (await call("/v1/leaderboard", a.token)).data[0].name,
      "Alice",
    );
    assert.equal((await call("/v1/me", a.token)).data.streak, 1);
    assert.equal(
      (await call("/v1/me", a.token)).data.achievements.find(
        (item) => item.key === "perfect",
      ).unlocked,
      true,
    );
    const daily = (await call("/v1/daily", a.token)).data;
    assert.equal(daily.completed, false);
    const dailyMatch = (await call("/v1/matches", a.token, { daily: true }))
      .data;
    now += 30000;
    const dailyInput =
      dailyMatch.config.game === "timer"
        ? { elapsedMs: 5000 }
        : dailyMatch.config.game === "reflex"
          ? { reactions: dailyMatch.config.waits.map(() => 250) }
          : { answers: dailyMatch.config.sequence };
    assert.equal(
      (
        await call(
          "/v1/matches/" + dailyMatch.id + "/finish",
          a.token,
          dailyInput,
        )
      ).status,
      200,
    );
    assert.equal((await call("/v1/daily", a.token)).data.completed, true);
    assert.equal(
      (await call("/v1/matches", a.token, { daily: true })).status,
      409,
    );
    const recovered = (
      await call("/v1/sessions/recover", null, { code: a.recoveryCode })
    ).data;
    assert.equal((await call("/v1/me", a.token)).status, 401);
    assert.equal((await call("/v1/me", recovered.token)).status, 200);
    assert.equal(
      (await call("/v1/session", recovered.token, undefined, "DELETE")).status,
      200,
    );
    assert.equal((await call("/v1/me", recovered.token)).status, 401);
    const activeToken = (
      await call("/v1/sessions/recover", null, { code: a.recoveryCode })
    ).data.token;
    const expired = (
      await call("/v1/matches", activeToken, {
        game: "memory",
        difficulty: 3,
      })
    ).data;
    now += 300001;
    assert.equal(
      (
        await call("/v1/matches/" + expired.id + "/finish", activeToken, {
          answers: expired.config.sequence,
        })
      ).status,
      409,
    );
    assert.equal(
      (await call("/v1/me", activeToken, undefined, "DELETE")).status,
      200,
    );
    assert.equal((await call("/v1/me", activeToken)).status, 401);
    assert.equal((await call("/v1/duels", b.token)).data.length, 0);
  } finally {
    await new Promise((r) => app.server.close(r));
    app.db.close();
  }
});
test("progresso sobrevive à reabertura do banco", async () => {
  const dir = mkdtempSync(join(tmpdir(), "duelou-test-"));
  const path = join(dir, "test.sqlite");
  let app = createApp(path);
  app.db
    .prepare("INSERT INTO players(id,name,token,created) VALUES(?,?,?,?)")
    .run("a", "Persistente", "hash", 1);
  app.db.close();
  app = createApp(path);
  assert.equal(
    app.db.prepare("SELECT name FROM players WHERE id=?").get("a").name,
    "Persistente",
  );
  assert.ok(
    app.db.prepare("SELECT token_expires FROM players WHERE id=?").get("a")
      .token_expires > Date.now(),
  );
  assert.equal(app.db.prepare("PRAGMA user_version").get().user_version, 3);
  app.db.close();
  rmSync(dir, { recursive: true });
});

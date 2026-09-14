import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./server.mjs";
import { roomRoutes } from "./rooms.mjs";

function setup() {
  let now = 1800000000000;
  const app = createApp(":memory:", () => now);
  for (const id of ["a", "b", "c"])
    app.db
      .prepare("INSERT INTO players(id,name,token,created) VALUES(?,?,?,?)")
      .run(id, id, id, now);
  const routes = roomRoutes(app.db, () => now);
  const call = (path, uid, body) =>
    routes(
      path,
      body === undefined ? "GET" : "POST",
      body || {},
      uid,
      new URLSearchParams(),
    ).data;
  const room = call("/v1/rooms", "a", {
    mode: "math",
    format: "md3",
    public: false,
    capacity: 2,
  });
  call(`/v1/rooms/${room.code}/join`, "b", {});
  call(`/v1/rooms/${room.code}/start`, "a", {});
  now += 5000;
  const config = JSON.parse(
    app.db.prepare("SELECT config FROM rooms WHERE code=?").get(room.code)
      .config,
  );
  call(`/v1/rooms/${room.code}/finish`, "a", {
    gameIndex: 0,
    answers: config.rounds.map((q) => q.answer),
  });
  call(`/v1/rooms/${room.code}/finish`, "b", {
    gameIndex: 0,
    answers: config.rounds.map((q) => (q.answer + 1) % q.options.length),
  });
  return { app, call, room, advance: (ms) => (now += ms) };
}
test("MD3 preserva resultado, exige prontidão individual e leitura mínima", () => {
  const h = setup(),
    path = `/v1/rooms/${h.room.code}`;
  try {
    const before = h.call(path, "a");
    assert.equal(before.state, "intermission");
    assert.equal(before.starts - before.serverNow, 25000);
    assert.equal(before.config, null);
    assert.equal(before.history[0].scores.a, 1000);
    assert.throws(
      () => h.call(path + "/ready", "c", { gameIndex: 1 }),
      /Entre na sala/,
    );
    assert.throws(
      () => h.call(path + "/ready", "a", { gameIndex: 0 }),
      /terminou/,
    );
    assert.throws(
      () => h.call(path + "/finish", "a", { gameIndex: 1, answers: [] }),
      /começou/,
    );
    const first = h.call(path + "/ready", "a", { gameIndex: 1 });
    assert.equal(first.starts, before.starts);
    assert.equal(
      h.call(path, "b").members.find((m) => m.id === "a").ready,
      true,
    );
    const both = h.call(path + "/ready", "b", { gameIndex: 1 });
    assert.equal(both.starts - before.serverNow, 10000);
    assert.equal(
      h.call(path + "/ready", "b", { gameIndex: 1 }).starts,
      both.starts,
    );
    h.advance(4999);
    assert.equal(h.call(path, "a").state, "intermission");
    h.advance(1);
    assert.equal(h.call(path, "a").state, "countdown");
    h.advance(5000);
    assert.equal(h.call(path, "b").state, "playing");
    assert.equal(
      h.app.db.prepare("SELECT played FROM arcade_stats WHERE player='a'").get()
        .played,
      1,
    );
  } finally {
    h.app.db.close();
  }
});
test("MD3 não fica bloqueado por rival ausente e novas leituras preservam o prazo", () => {
  const h = setup(),
    path = `/v1/rooms/${h.room.code}`;
  try {
    const before = h.call(path, "a");
    h.call(path + "/ready", "a", { gameIndex: 1 });
    h.advance(15000);
    assert.equal(h.call(path, "a").starts, before.starts);
    h.advance(5000);
    assert.equal(h.call(path, "a").state, "countdown");
    h.advance(5000);
    assert.equal(h.call(path, "a").state, "playing");
    assert.ok(h.call(path, "a").members.every((m) => m.score === null));
  } finally {
    h.app.db.close();
  }
});
test("personagem é validado, isolado por conta e não altera XP ou classificação", async () => {
  const app = createApp(":memory:");
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const call = async (path, token, body) => {
    const r = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, data: await r.json() };
  };
  try {
    const a = (await call("/v1/guests", null, { name: "AvatarA" })).data,
      b = (await call("/v1/guests", null, { name: "AvatarB" })).data;
    const avatar = {
      species: "cat",
      color: "ocean",
      accessory: "crown",
      frame: "gold",
    };
    assert.equal((await call("/v1/avatar", null, avatar)).status, 401);
    assert.equal(
      (await call("/v1/avatar", a.token, { ...avatar, rating: 9999 })).status,
      400,
    );
    assert.equal(
      (await call("/v1/avatar", a.token, { ...avatar, species: "unknown" }))
        .status,
      400,
    );
    const updated = (await call("/v1/avatar", a.token, avatar)).data;
    assert.deepEqual(updated.avatar, avatar);
    assert.equal(updated.xp, 0);
    assert.equal(updated.competitive, null);
    assert.deepEqual((await call("/v1/me", a.token)).data.avatar, avatar);
    assert.notDeepEqual((await call("/v1/me", b.token)).data.avatar, avatar);
    const room = (
      await call("/v1/rooms", a.token, {
        mode: "math",
        public: false,
        capacity: 2,
      })
    ).data;
    const joined = (await call(`/v1/rooms/${room.code}/join`, b.token, {}))
      .data;
    assert.deepEqual(
      joined.members.find((m) => m.id === a.profile.id).avatar,
      avatar,
    );
  } finally {
    await new Promise((r) => app.server.close(r));
    app.db.close();
  }
});

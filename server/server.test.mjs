import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./server.mjs";
import { progression } from "./rules.mjs";
import { MAX_LEVEL, minimumAttemptMs } from "../shared/arcade.mjs";
test("progressão de XP em níveis", () => {
  assert.deepEqual(progression(0), { level: 1, current: 0, needed: 100 });
  assert.deepEqual(progression(100), { level: 2, current: 0, needed: 200 });
});
test("API: sessões, autorização, perfil e conquistas vindos só da Arena, histórico e exclusão", async () => {
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
    assert.match(a.recoveryCode, /^([A-F0-9]{4}-){5}[A-F0-9]{4}$/);
    assert.equal((await call("/v1/campaign/math")).status,401);
    assert.equal((await call("/v1/campaign/math",a.token,{unlocked:2,best:{1:700}})).status,200);
    assert.deepEqual((await call("/v1/campaign/math",a.token,{unlocked:1,best:{1:650,2:900}})).data.best,{1:700,2:900});
    assert.equal((await call("/v1/campaign/math",b.token)).data.unlocked,1);
    assert.equal((await call("/v1/campaign/math",a.token,{unlocked:31,best:{}})).status,400);
    assert.equal((await call("/v1/campaign/math",a.token,{unlocked:2,best:{1:1001}})).status,400);
    assert.equal((await call("/v1/me",a.token)).data.xp,0);
    assert.equal(a.profile.xp, 0);
    assert.equal(a.profile.level, 1);
    assert.equal(
      a.profile.achievements.find((x) => x.key === "first_match").unlocked,
      false,
    );
    // Progresso de conta só nasce jogando na Arena — solo é local e não passa
    // pelo servidor, então uma sala é o único jeito de gerar isso aqui.
    const room = (
      await call("/v1/rooms", a.token, {
        mode: "timer",
        difficulty: 1,
        capacity: 2,
        public: false,
      })
    ).data;
    await call("/v1/rooms/" + room.code + "/join", b.token, {});
    await call("/v1/rooms/" + room.code + "/start", a.token, {});
    now += 5000;
    const config = JSON.parse(
      app.db.prepare("SELECT config FROM rooms WHERE code=?").get(room.code)
        .config,
    );
    const answers = [config.rounds[0].targetMs];
    now += Math.ceil(minimumAttemptMs(config, answers)) + 500;
    await call("/v1/rooms/" + room.code + "/finish", a.token, { answers });
    await call("/v1/rooms/" + room.code + "/finish", b.token, { answers });
    const meAfter = (await call("/v1/me", a.token)).data;
    assert.equal(meAfter.played, 1);
    assert.equal(meAfter.xp, 20); // 1000 pontos (prova perfeita) / 50
    assert.equal(meAfter.streak, 1);
    assert.equal(
      meAfter.achievements.find((x) => x.key === "first_match").unlocked,
      true,
    );
    assert.equal(
      meAfter.achievements.find((x) => x.key === "perfect").unlocked,
      true,
    );
    // "Lendário" (topo da escada de patente, ver src/theme.ts) só destrava no
    // nível máximo — trava a intenção de MAX_LEVEL=30 (ver shared/arcade.mjs).
    assert.equal(
      meAfter.achievements.find((x) => x.key === "arcade_legend").unlocked,
      false,
    );
    app.db
      .prepare(
        "INSERT INTO arcade_stats(player,mode,level) VALUES(?,'math',?) ON CONFLICT(player,mode) DO UPDATE SET level=excluded.level",
      )
      .run(a.profile.id, MAX_LEVEL);
    assert.equal(
      (await call("/v1/me", a.token)).data.achievements.find(
        (x) => x.key === "arcade_legend",
      ).unlocked,
      true,
    );
    const history = (await call("/v1/history", a.token)).data;
    assert.equal(history.length, 1);
    assert.equal(history[0].mode, "timer");
    assert.equal(history[0].score, 1000);
    const recovered = (
      await call("/v1/sessions/recover", null, { code: a.recoveryCode })
    ).data;
    assert.equal((await call("/v1/me", a.token)).status, 401);
    assert.equal((await call("/v1/me", recovered.token)).status, 200);
    assert.equal(
      (await call("/v1/session", recovered.token, undefined, "DELETE"))
        .status,
      200,
    );
    assert.equal((await call("/v1/me", recovered.token)).status, 401);
    const activeToken = (
      await call("/v1/sessions/recover", null, { code: a.recoveryCode })
    ).data.token;
    assert.equal(
      (await call("/v1/me", activeToken, undefined, "DELETE")).status,
      200,
    );
    assert.equal((await call("/v1/me", activeToken)).status, 401);
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

test("historico paginado isola contas e respeita exclusao", async () => {
  const app=createApp(":memory:");
  await new Promise(r=>app.server.listen(0,"127.0.0.1",r));
  const base="http://127.0.0.1:"+app.server.address().port;
  try {
    const create=async name=>(await (await fetch(base+"/v1/guests",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name})})).json());
    const a=await create("HistoryA"),b=await create("HistoryB");
    const get=async(path,token)=>{const r=await fetch(base+path,{headers:{Authorization:"Bearer "+token}});return {status:r.status,data:await r.json()};};
    const insert=app.db.prepare("INSERT INTO game_history VALUES(?,?,?,?,?,?,?,?,?,?,?)");
    for(let i=0;i<35;i++)insert.run(a.profile.id,"archived"+i,0,"math",6,7,1,800,Date.now(),JSON.stringify(["Prova concluida"]),"win");
    const first=(await get("/v1/history",a.token)).data;
    assert.equal(first.length,30);assert.equal(first[0].ranked,true);assert.equal(first[0].details[0],"Prova concluida");
    const second=(await get("/v1/history?before="+first.at(-1).cursor,a.token)).data;
    assert.equal(second.length,5);assert.equal(new Set([...first,...second].map(h=>h.id)).size,35);
    assert.deepEqual((await get("/v1/history",b.token)).data,[]);
    assert.equal((await get("/v1/history?before=invalid",a.token)).status,400);
    await fetch(base+"/v1/me",{method:"DELETE",headers:{Authorization:"Bearer "+a.token}});
    assert.equal(app.db.prepare("SELECT COUNT(*) n FROM game_history").get().n,0);
  } finally {await new Promise(r=>app.server.close(r));app.db.close();}
});

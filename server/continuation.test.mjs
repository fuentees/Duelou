import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./server.mjs";

test("continuar avança o grupo, revanche mantém nível e PvP retorna à fila", async () => {
  let now = Date.now();
  const app = createApp(":memory:", () => now);
  await new Promise(r => app.server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + app.server.address().port;
  const call = async (path, token, body) => {
    const response = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  };
  const completed = async (token, difficulty, publicRoom = false) => {
    const room = (await call("/v1/rooms", token, {mode:"timer",capacity:4,format:"md3",difficulty,public:publicRoom})).data;
    app.db.prepare("UPDATE rooms SET starts=?,counted=1 WHERE code=?").run(now-60000,room.code);
    app.db.prepare("UPDATE room_members SET score=800,finished=? WHERE room=?").run(now,room.code);
    return room;
  };
  try {
    const a = (await call("/v1/guests", null, {name:"ContinueA"})).data;
    const b = (await call("/v1/guests", null, {name:"ContinueB"})).data;
    const waiting=(await call("/v1/rooms",a.token,{mode:"math",capacity:2})).data;
    assert.equal((await call("/v1/rooms/"+waiting.code+"/continue",a.token,{})).status,409);
    const original=(await call("/v1/rooms",a.token,{mode:"timer",capacity:4,format:"md3",difficulty:6,public:false})).data;
    await call("/v1/rooms/"+original.code+"/join",b.token,{});
    app.db.prepare("UPDATE rooms SET starts=?,counted=1 WHERE code=?").run(now-60000,original.code);
    app.db.prepare("UPDATE room_members SET score=800,finished=? WHERE room=?").run(now,original.code);
    assert.equal((await call("/v1/rooms/"+original.code+"/continue",null,{})).status,401);
    const first=await call("/v1/rooms/"+original.code+"/continue",a.token,{});
    assert.equal(first.status,200);assert.equal(first.data.difficulty,7);
    assert.equal(first.data.mode,"timer");assert.equal(first.data.format,"md3");assert.equal(first.data.capacity,4);
    const notice=(await call("/v1/rooms/"+original.code,b.token)).data;
    assert.equal(notice.nextAction,"continue");assert.equal(notice.nextDifficulty,7);
    assert.equal(notice.nextCode,first.data.code);
    const retry=(await call("/v1/rooms/"+original.code+"/continue",a.token,{})).data;
    assert.equal(retry.code,first.data.code);
    const other=(await call("/v1/rooms/"+original.code+"/continue",b.token,{})).data;
    assert.equal(other.code,first.data.code);assert.equal(other.members.length,2);
    assert.equal((await call("/v1/rooms/"+original.code+"/rematch",b.token,{})).status,409);
    const capped=await completed(a.token,30);
    assert.equal((await call("/v1/rooms/"+capped.code+"/continue",a.token,{})).data.difficulty,30);
    const repeat=await completed(a.token,9,true);
    assert.equal((await call("/v1/rooms/"+repeat.code+"/rematch",a.token,{})).data.difficulty,9);
    const ranked=await completed(a.token,10);
    app.db.prepare("UPDATE rooms SET ranked=1 WHERE code=?").run(ranked.code);
    assert.equal((await call("/v1/rooms/"+ranked.code+"/continue",a.token,{})).status,409);
    const queued=await call("/v1/rooms/competitive",a.token,{});
    assert.equal(queued.status,200);assert.equal(queued.data.ranked,true);
    assert.notEqual(queued.data.code,ranked.code);
    assert.equal((await call("/v1/rooms/competitive",a.token,{})).data.code,queued.data.code);
  } finally {
    await new Promise(r=>app.server.close(r));app.db.close();
  }
});

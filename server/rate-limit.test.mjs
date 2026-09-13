import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./server.mjs";
import { rateLimiter } from "./rate-limit.mjs";

test("limites expiram, informam espera e mantêm memória limitada", () => {
  let now = 0;
  const limit = rateLimiter(() => now, 2);
  limit("a", 1);
  assert.throws(
    () => limit("a", 1),
    (e) => e.status === 429 && e.retryAfter === 60,
  );
  limit("b", 1);
  assert.throws(
    () => limit("c", 1),
    (e) => e.status === 429,
  );
  now = 60000;
  limit("c", 1);
  limit("a", 1);
});

test("jogadores no mesmo IP têm cotas separadas; cabeçalhos forjados não ampliam cota", async () => {
  let now = Date.now();
  const app = createApp(":memory:", () => now);
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const create = async (name) =>
    await (
      await fetch(base + "/v1/guests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
    ).json();
  const get = (token, ip = "203.0.113.1") =>
    fetch(base + "/v1/me", {
      headers: { Authorization: `Bearer ${token}`, "X-Forwarded-For": ip },
    });
  try {
    const a = await create("RateA"),
      b = await create("RateB");
    for (let i = 0; i < 240; i++) {
      const res = await get(a.token);
      assert.equal(res.status, 200);
      await res.arrayBuffer();
    }
    const blocked = await get(a.token, "203.0.113.99");
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get("retry-after"), "60");
    await blocked.arrayBuffer();
    assert.equal((await get(b.token)).status, 200);
    assert.equal((await fetch(base + "/health")).status, 200);
    now += 60000;
    assert.equal((await get(a.token)).status, 200);
  } finally {
    await new Promise((r) => app.server.close(r));
    app.db.close();
  }
});

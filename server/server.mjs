import { readAvatar, validAvatar } from "../shared/avatar.mjs";
import { startOperations } from "./operations.mjs";
import { rateLimiter } from "./rate-limit.mjs";
import { persistence } from "./persistence.mjs";
import http from "node:http";
import { roomRoutes } from "./rooms.mjs";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ratingName } from "../shared/progression.mjs";
import { progression } from "./rules.mjs";
import { MAX_LEVEL, modes } from "../shared/arcade.mjs";
const hash = (t) => createHash("sha256").update(t).digest("hex");
const day = (t) => new Date(t).toISOString().slice(0, 10);
const SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000;
export function createApp(
  path = "data/duelou.sqlite",
  clock = () => Date.now(),
  options = {},
) {
  if (path !== ":memory:")
    mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS players(id TEXT PRIMARY KEY,name TEXT NOT NULL,token TEXT UNIQUE NOT NULL,created INTEGER NOT NULL);
 PRAGMA user_version=1;`);
  // Duelo por código e desafio diário eram um sistema de progresso (XP,
  // moedas, histórico, conquistas) inteiramente separado da Arena — nada na
  // navegação atual escreve mais nessas tabelas. Perfil, conquistas e
  // histórico agora vêm só da Arena (arcade_stats/rooms/room_members), uma
  // fonte só; as tabelas antigas somem de vez, mesmo em bancos já existentes.
  db.exec("DROP TABLE IF EXISTS matches; DROP TABLE IF EXISTS duels;");
  const playerColumns = db.prepare("PRAGMA table_info(players)").all();
  if (!playerColumns.some((c) => c.name === "recovery"))
    db.exec("ALTER TABLE players ADD COLUMN recovery TEXT");
  if (!playerColumns.some((c) => c.name === "token_expires"))
    db.exec("ALTER TABLE players ADD COLUMN token_expires INTEGER");
  db.prepare(
    "UPDATE players SET token_expires=? WHERE token_expires IS NULL",
  ).run(clock() + SESSION_TTL_MS);
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS players_recovery ON players(recovery) WHERE recovery IS NOT NULL",
  );
  db.exec("PRAGMA user_version=3");
  const get = (sql, ...v) => db.prepare(sql).get(...v);
  const all = (sql, ...v) => db.prepare(sql).all(...v);
  const run = (sql, ...v) => db.prepare(sql).run(...v);
  const fail = (status, message) => {
    throw Object.assign(Error(message), { status });
  };
  const profile = (id) => {
    const p = get("SELECT id,name,avatar FROM players WHERE id=?", id);
    // Uma fonte só pro progresso da conta: arcade_stats (Arena) já soma
    // partidas/vitórias/melhor pontuação/nível por jogo — XP é derivado do
    // total de pontos já feito em qualquer prova (dividido por 50 pra manter
    // a escala de progression() razoável; não é uma contagem à parte, some
    // com ela se algum dia esse total for zerado).
    const arcade = get(
      "SELECT COALESCE(SUM(played),0) played,COALESCE(SUM(total),0) score,COALESCE(MAX(best),0) best,COALESCE(SUM(wins),0) wins,COALESCE(MAX(level),1) level FROM arcade_stats WHERE player=?",
      id,
    );
    const gamesPlayed = get(
      "SELECT COUNT(*) n FROM arcade_stats WHERE player=? AND played>0",
      id,
    ).n;
    const xp = Math.round(arcade.score / 50);
    const dates = all(
      "SELECT DISTINCT substr(datetime(finished/1000,'unixepoch'),1,10) d FROM game_history WHERE player=? ORDER BY d DESC",
      id,
    ).map((x) => x.d);
    let streak = 0,
      t = clock();
    if (dates[0] !== day(t)) t -= 86400000;
    for (const d of dates) {
      if (d !== day(t)) break;
      streak++;
      t -= 86400000;
    }
    const facts = {
      first_match: arcade.played >= 1,
      ten_matches: arcade.played >= 10,
      perfect: arcade.best >= 1000,
      all_games: gamesPlayed >= modes.length,
      streak_7: streak >= 7,
      arcade_wins: arcade.wins >= 5,
      arcade_ace: arcade.best >= 950,
      arcade_legend: arcade.level >= MAX_LEVEL,
    };
    const definitions = [
      [
        "first_match",
        "Primeiro passo",
        "Conclua sua primeira partida na Arena",
        "⚡",
      ],
      ["ten_matches", "Competidor", "Conclua 10 partidas na Arena", "🥊"],
      ["perfect", "Perfeição", "Faça 1.000 pontos em uma prova", "🎯"],
      [
        "all_games",
        "Versátil",
        `Jogue todos os ${modes.length} jogos da Arena`,
        "🧠",
      ],
      ["streak_7", "Em chamas", "Jogue por sete dias", "🔥"],
      ["arcade_wins", "Campeão de sala", "Vença 5 salas no Arcade", "🏆"],
      ["arcade_ace", "Precisão de elite", "Faça 950+ pontos em uma sala", "🎖️"],
      [
        "arcade_legend",
        "Lendário",
        `Alcance o nível ${MAX_LEVEL} em algum jogo`,
        "👑",
      ],
    ];
    return {
      ...p,
      avatar:readAvatar(p.avatar),
      competitive: (() => {
        const r = get(
          "SELECT rating,played,wins FROM competitive_ratings WHERE player=?",
          id,
        );
        return r
          ? { ...r, rank: ratingName(r.rating), provisional: r.played < 5 }
          : null;
      })(),
      weekly: (() => {
        const start =
          Math.floor((clock() + 3 * 86400000) / (7 * 86400000)) * 7 * 86400000 -
          3 * 86400000;
        const count = (name) =>
          get(
            "SELECT COUNT(*) n FROM product_events WHERE player=? AND name=? AND created>=?",
            id,
            name,
            start,
          ).n;
        const wins = get(
          "SELECT COUNT(*) n FROM competitive_results WHERE player=? AND outcome=1 AND status='counted' AND created>=?",
          id,
          start,
        ).n;
        return [
          {
            name: "Complete três disputas",
            current: Math.min(3, count("series_finished")),
            target: 3,
          },
          {
            name: "Vença uma série competitiva",
            current: Math.min(1, wins),
            target: 1,
          },
          {
            name: "Convide para uma revanche",
            current: Math.min(1, count("rematch_created")),
            target: 1,
          },
        ];
      })(),
      xp,
      coins: Math.floor(xp / 5),
      played: arcade.played,
      streak,
      ...progression(xp),
      achievements: definitions.map(([key, name, description, icon]) => ({
        key,
        name,
        description,
        icon,
        unlocked: facts[key],
      })),
    };
  };
  const limitRequest = rateLimiter(clock);
  const storage = persistence(db, clock);
  const rooms = roomRoutes(db, clock);
  const counters = { requests: 0, errors: 0, limited: 0, slow: 0 };
  const server = http.createServer(async (req, res) => {
    const received = performance.now();
    res.once("finish", () => {
      counters.requests++;
      if (res.statusCode >= 500) counters.errors++;
      if (res.statusCode === 429) counters.limited++;
      if (performance.now() - received > 1000) counters.slow++;
    });
    const origin = req.headers.origin;
    const allowed = (
      process.env.ALLOWED_ORIGINS ||
      "http://localhost:8081,http://localhost:8082,http://localhost:8083,http://localhost:19006"
    ).split(",");
    if (origin && allowed.includes(origin))
      res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const send = (status, data) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    try {
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        return res.end();
      }
      if (origin && !allowed.includes(origin))
        fail(403, "Origem não autorizada");
      const now = clock();
      const url = new URL(req.url, "http://local"),
        route = url.pathname;
      // Use the verified account, never a caller-controlled token/header as identity.
      const token = req.headers.authorization?.replace(/^Bearer /, "");
      const player =
        token &&
        get(
          "SELECT id FROM players WHERE token=? AND token_expires>?",
          hash(token),
          now,
        );
      const isSessionRoute =
        req.method === "POST" &&
        (route === "/v1/guests" || route === "/v1/sessions/recover");
      const isHealth =
        req.method === "GET" && (route === "/health" || route === "/v1/health");
      // Forwarded headers are intentionally ignored. Shared proxy IPs do not
      // restrict signed-in players; anonymous account/recovery attempts remain bounded.
      const ip = req.socket.remoteAddress || "unknown";
      if (isSessionRoute) limitRequest(`session:${route}:${ip}`, 15);
      else if (isHealth) limitRequest(`health:${ip}`, 120);
      else if (player) limitRequest(`player:${player.id}`, 240);
      else limitRequest(`anonymous:${ip}`, 60);
      if (!isSessionRoute && !isHealth && !player)
        fail(401, "Sessão inválida. Entre novamente.");
      let body = {};
      if (req.method === "POST") {
        let raw = "";
        for await (const chunk of req) {
          raw += chunk;
          if (Buffer.byteLength(raw) > 8192)
            fail(413, "Requisição muito grande");
        }
        try {
          body = JSON.parse(raw || "{}");
        } catch {
          fail(400, "JSON inválido");
        }
        if (!body || Array.isArray(body) || typeof body !== "object")
          fail(400, "Corpo inválido");
      }
      if (["/health", "/v1/health"].includes(route) && req.method === "GET") {
        try {
          db.prepare("SELECT 1 FROM players LIMIT 1").get();
        } catch {
          return send(503, { ok: false, version: 1 });
        }
        return send(200, {
          ok: true,
          version: 1,
          backup: options.backupStatus?.() || { state: "disabled" },
        });
      }
      if (route === "/v1/guests" && req.method === "POST") {
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (!/^[\p{L}\p{N} _-]{2,24}$/u.test(name))
          fail(400, "Use um apelido de 2 a 24 letras ou números.");
        const id = randomUUID(),
          token = randomBytes(32).toString("hex"),
          recoveryCode = randomBytes(12)
            .toString("hex")
            .toUpperCase()
            .match(/.{1,4}/g)
            .join("-");
        run(
          "INSERT INTO players(id,name,token,created,recovery,token_expires) VALUES(?,?,?,?,?,?)",
          id,
          name,
          hash(token),
          now,
          hash(recoveryCode.replaceAll("-", "")),
          now + SESSION_TTL_MS,
        );
        return send(201, { token, recoveryCode, profile: profile(id) });
      }
      if (route === "/v1/sessions/recover" && req.method === "POST") {
        const code = String(body.code || "")
          .replace(/[^a-f0-9]/gi, "")
          .toUpperCase();
        if (code.length !== 24) fail(400, "Código de recuperação inválido.");
        const recovered = get(
          "SELECT id FROM players WHERE recovery=?",
          hash(code),
        );
        if (!recovered) fail(404, "Código de recuperação não encontrado.");
        const token = randomBytes(32).toString("hex");
        run(
          "UPDATE players SET token=?,token_expires=? WHERE id=?",
          hash(token),
          now + SESSION_TTL_MS,
          recovered.id,
        );
        return send(200, {
          token,
          profile: profile(recovered.id),
        });
      }
      const uid = player.id;
      const campaignResponse = storage.route(route, req.method, uid, body);
      if (campaignResponse) return send(200, campaignResponse);
      const roomResponse = rooms(
        route,
        req.method,
        body,
        uid,
        url.searchParams,
      );
      if (roomResponse) return send(roomResponse.status, roomResponse.data);
      if (route === "/v1/session" && req.method === "DELETE") {
        run(
          "UPDATE players SET token=?,token_expires=? WHERE id=?",
          hash(randomBytes(32).toString("hex")),
          now,
          uid,
        );
        return send(200, { revoked: true });
      }
      if(route === "/v1/avatar" && req.method === "POST"){
        if(!validAvatar(body))fail(400,"Escolha um personagem válido.");
        run("UPDATE players SET avatar=? WHERE id=?",JSON.stringify(body),uid);
        return send(200,profile(uid));
      }
      if (route === "/v1/me" && req.method === "GET")
        return send(200, profile(uid));
      if (route === "/v1/history" && req.method === "GET") {
        const before = Number(
          url.searchParams.get("before") || Number.MAX_SAFE_INTEGER,
        );
        if (!Number.isSafeInteger(before) || before < 0)
          fail(400, "Página inválida.");
        return send(
          200,
          all(
            "SELECT rowid cursor,room,game_index,mode,difficulty,rules_version rulesVersion,ranked,score,finished,details,outcome FROM game_history WHERE player=? AND rowid<? ORDER BY rowid DESC LIMIT 30",
            uid,
            before,
          ).map((h) => ({
            ...h,
            id: h.room + ":" + h.game_index,
            ranked: !!h.ranked,
            details: JSON.parse(h.details),
          })),
        );
      }
      if (route === "/v1/me" && req.method === "DELETE") {
        run("DELETE FROM players WHERE id=?", uid);
        return send(200, { deleted: true });
      }
      fail(404, "Rota não encontrada.");
    } catch (e) {
      if (e.retryAfter) res.setHeader("Retry-After", String(e.retryAfter));
      if (!res.headersSent)
        send(e.status || 500, {
          error: e.status ? e.message : "Erro interno do servidor.",
        });
      if (!e.status)
        console.error(JSON.stringify({ event: "request_failed", status: 500 }));
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  const telemetry = setInterval(() => {
    if (counters.requests)
      console.log(
        JSON.stringify({ event: "api_window", ...counters, windowSeconds: 60 }),
      );
    Object.keys(counters).forEach((key) => (counters[key] = 0));
  }, 60000);
  telemetry.unref();
  server.once("close", () => clearInterval(telemetry));
  return { server, db };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const dbPath = process.env.DB_PATH || "data/duelou.sqlite";
  let operations;
  const { server, db } = createApp(dbPath, Date.now, {
    backupStatus: () => operations?.status,
  });
  operations = startOperations({ dbPath });
  const shutdown = () =>
    server.close(async () => {
      await operations.stop();
      db.close();
    });
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  server.listen(
    Number(process.env.PORT || 3001),
    process.env.HOST || "127.0.0.1",
    () =>
      console.log("Duelou API pronta na porta " + (process.env.PORT || 3001)),
  );
}

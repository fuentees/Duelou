import http from "node:http";
import { roomRoutes } from './rooms.mjs';
import { DatabaseSync } from "node:sqlite";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  challenge,
  dailyChallenge,
  games,
  score,
  progression,
  reward,
} from "./rules.mjs";
const hash = (t) => createHash("sha256").update(t).digest("hex");
const day = (t) => new Date(t).toISOString().slice(0, 10);
const SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000;
export function createApp(
  path = "data/duelou.sqlite",
  clock = () => Date.now(),
) {
  if (path !== ":memory:")
    mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS players(id TEXT PRIMARY KEY,name TEXT NOT NULL,token TEXT UNIQUE NOT NULL,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS duels(code TEXT PRIMARY KEY,host TEXT NOT NULL REFERENCES players(id),guest TEXT REFERENCES players(id),config TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS matches(id TEXT PRIMARY KEY,player TEXT NOT NULL REFERENCES players(id),duel TEXT REFERENCES duels(code),config TEXT NOT NULL,started INTEGER NOT NULL,finished INTEGER,score INTEGER,xp INTEGER,coins INTEGER,UNIQUE(player,duel));
 CREATE INDEX IF NOT EXISTS matches_player ON matches(player,finished);
 PRAGMA user_version=1;`);
  const playerColumns = db.prepare("PRAGMA table_info(players)").all();
  if (!playerColumns.some((c) => c.name === "recovery"))
    db.exec("ALTER TABLE players ADD COLUMN recovery TEXT");
  if (!playerColumns.some((c) => c.name === "token_expires"))
    db.exec("ALTER TABLE players ADD COLUMN token_expires INTEGER");
  db.prepare(
    "UPDATE players SET token_expires=? WHERE token_expires IS NULL",
  ).run(clock() + SESSION_TTL_MS);
  const matchColumns = db.prepare("PRAGMA table_info(matches)").all();
  if (!matchColumns.some((c) => c.name === "daily"))
    db.exec("ALTER TABLE matches ADD COLUMN daily TEXT");
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS players_recovery ON players(recovery) WHERE recovery IS NOT NULL",
  );
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS matches_daily_player ON matches(player,daily) WHERE daily IS NOT NULL",
  );
  db.exec("PRAGMA user_version=3");
  const get = (sql, ...v) => db.prepare(sql).get(...v);
  const all = (sql, ...v) => db.prepare(sql).all(...v);
  const run = (sql, ...v) => db.prepare(sql).run(...v);
  const fail = (status, message) => {
    throw Object.assign(Error(message), { status });
  };
  const tx = (fn) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const r = fn();
      db.exec("COMMIT");
      return r;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };
  const profile = (id) => {
    const p = get("SELECT id,name FROM players WHERE id=?", id);
    const totals = get(
      "SELECT COALESCE(SUM(xp),0) xp,COALESCE(SUM(coins),0) coins,COUNT(*) played FROM matches WHERE player=? AND finished IS NOT NULL",
      id,
    );
    const dates = all(
      "SELECT DISTINCT substr(datetime(finished/1000,'unixepoch'),1,10) d FROM matches WHERE player=? AND finished IS NOT NULL ORDER BY d DESC",
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
      first_match: totals.played >= 1,
      ten_matches: totals.played >= 10,
      perfect: !!get(
        "SELECT 1 ok FROM matches WHERE player=? AND score=1000 LIMIT 1",
        id,
      ),
      first_duel: !!get(
        "SELECT 1 ok FROM matches WHERE player=? AND duel IS NOT NULL AND finished IS NOT NULL LIMIT 1",
        id,
      ),
      all_games:
        get(
          "SELECT COUNT(DISTINCT json_extract(config,'$.game')) n FROM matches WHERE player=? AND finished IS NOT NULL",
          id,
        ).n === 3,
      streak_7: streak >= 7,
      arcade_wins:
        (get("SELECT wins FROM arcade_stats WHERE player=?", id)?.wins || 0) >=
        5,
      arcade_ace:
        (get("SELECT best FROM arcade_stats WHERE player=?", id)?.best || 0) >=
        950,
    };
    const definitions = [
      ["first_match", "Primeiro passo", "Conclua sua primeira partida", "⚡"],
      ["ten_matches", "Competidor", "Conclua 10 partidas", "🥊"],
      ["perfect", "Perfeição", "Faça 1.000 pontos", "🎯"],
      ["first_duel", "Rivalidade", "Conclua um duelo", "🤺"],
      ["all_games", "Versátil", "Conclua os três jogos", "🧠"],
      ["streak_7", "Em chamas", "Jogue por sete dias", "🔥"],
      ["arcade_wins", "Campeão de sala", "Vença 5 salas no Arcade", "🏆"],
      ["arcade_ace", "Mira certeira", "Faça 950+ pontos em uma sala", "🎖️"],
    ];
    return {
      ...p,
      ...totals,
      streak,
      ...progression(totals.xp),
      achievements: definitions.map(([key, name, description, icon]) => ({
        key,
        name,
        description,
        icon,
        unlocked: facts[key],
      })),
    };
  };
  const result = (m) => ({
    id: m.id,
    score: m.score,
    xp: m.xp,
    coins: m.coins,
    profile: profile(m.player),
  });
  const limits = new Map();
  const rooms = roomRoutes(db, clock);
  const presence = new Map();
  const server = http.createServer(async (req, res) => {
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
      const now = clock(),
        ip = req.socket.remoteAddress;
      if (limits.size > 10000)
        for (const [k, v] of limits) if (v.until < now) limits.delete(k);
      const limit = limits.get(ip) || { count: 0, until: now + 60000 };
      if (limit.until < now) {
        limit.count = 0;
        limit.until = now + 60000;
      }
      limit.count++;
      limits.set(ip, limit);
      if (limit.count > 180)
        fail(429, "Muitas solicitações. Aguarde um minuto.");
      const url = new URL(req.url, "http://local"),
        route = url.pathname;
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
      if (["/health", "/v1/health"].includes(route) && req.method === "GET")
        return send(200, { ok: true, version: 1 });
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
      const token = req.headers.authorization?.replace(/^Bearer /, "");
      const player =
        token &&
        get(
          "SELECT id FROM players WHERE token=? AND token_expires>?",
          hash(token),
          now,
        );
      if (!player) fail(401, "Sessão inválida. Entre novamente.");
      const uid = player.id;
      const roomResponse = rooms(route, req.method, body, uid);
      if (roomResponse) return send(roomResponse.status, roomResponse.data);
      if (route === "/v1/presence" && req.method === "POST") {
        presence.set(uid, now);
        for (const [id, seen] of presence) if (now - seen > 20000) presence.delete(id);
        return send(200, { connected: true });
      }
      if (route === "/v1/session" && req.method === "DELETE") {
        run(
          "UPDATE players SET token=?,token_expires=? WHERE id=?",
          hash(randomBytes(32).toString("hex")),
          now,
          uid,
        );
        return send(200, { revoked: true });
      }
      if (route === "/v1/me" && req.method === "GET")
        return send(200, profile(uid));
      if (route === "/v1/games" && req.method === "GET")
        return send(200, { games, difficulties: [1, 2, 3], rulesVersion: 2 });
      if (route === "/v1/daily" && req.method === "GET") {
        const key = day(now);
        const played = get(
          "SELECT score FROM matches WHERE player=? AND daily=? AND finished IS NOT NULL",
          uid,
          key,
        );
        return send(200, {
          key,
          config: dailyChallenge(key),
          completed: !!played,
          score: played?.score ?? null,
          resetsAt: Date.parse(key + "T00:00:00Z") + 86400000,
        });
      }
      if (route === "/v1/leaderboard" && req.method === "GET") {
        const since = now - 7 * 86400000;
        return send(
          200,
          all(
            "SELECT p.id,p.name,SUM(m.score) points FROM players p JOIN (SELECT player,MAX(score) score FROM matches WHERE finished>=? GROUP BY player,json_extract(config,'$.game'),json_extract(config,'$.difficulty')) m ON m.player=p.id GROUP BY p.id ORDER BY points DESC,p.created ASC LIMIT 50",
            since,
          ),
        );
      }
      if (route === "/v1/history" && req.method === "GET")
        return send(
          200,
          all(
            "SELECT id,config,score,xp,finished FROM matches WHERE player=? AND finished IS NOT NULL ORDER BY finished DESC LIMIT 30",
            uid,
          ).map((m) => ({ ...m, config: JSON.parse(m.config) })),
        );
      if (route === "/v1/duels" && req.method === "POST") {
        let config;
        try {
          config = challenge(body.game, body.difficulty);
        } catch (e) {
          fail(400, e.message);
        }
        if (
          get(
            "SELECT COUNT(*) n FROM duels WHERE host=? AND expires>?",
            uid,
            now,
          ).n >= 20
        )
          fail(409, "Limite de 20 duelos ativos.");
        const code = randomBytes(5).toString("hex").toUpperCase();
        run(
          "INSERT INTO duels VALUES(?,?,NULL,?,?)",
          code,
          uid,
          JSON.stringify(config),
          now + 86400000,
        );
        return send(201, { code, expires: now + 86400000, config });
      }
      if (route === "/v1/duels" && req.method === "GET") {
        return send(
          200,
          all(
            "SELECT * FROM duels WHERE host=? OR guest=? ORDER BY expires DESC LIMIT 30",
            uid,
            uid,
          ).map((d) => ({
            ...d,
            config: JSON.parse(d.config),
            participants: [d.host, d.guest].filter(Boolean).map((id) => ({
              id,
              name: get("SELECT name FROM players WHERE id=?", id)?.name,
              online: now - (presence.get(id) || 0) < 20000,
            })),
            results: all(
              "SELECT player,score FROM matches WHERE duel=? AND finished IS NOT NULL",
              d.code,
            ),
          })),
        );
      }
      if (route === "/v1/duels/join" && req.method === "POST") {
        const code = String(body.code || "")
          .trim()
          .toUpperCase();
        return send(
          200,
          tx(() => {
            const d = get("SELECT * FROM duels WHERE code=?", code);
            if (!d || d.expires < now)
              fail(404, "Duelo não encontrado ou expirado.");
            if (d.host !== uid && d.guest && d.guest !== uid)
              fail(409, "Este duelo já tem dois jogadores.");
            if (d.host !== uid && !d.guest)
              run("UPDATE duels SET guest=? WHERE code=?", uid, code);
            return { code, config: JSON.parse(d.config) };
          }),
        );
      }
      if (route === "/v1/matches" && req.method === "POST") {
        let config,
          duel = null,
          daily = null;
        if (body.code) {
          const d = get(
            "SELECT * FROM duels WHERE code=?",
            String(body.code).toUpperCase(),
          );
          if (!d || d.expires < now || ![d.host, d.guest].includes(uid))
            fail(403, "Entre em um duelo válido primeiro.");
          duel = d.code;
          config = JSON.parse(d.config);
          const existing = get(
            "SELECT * FROM matches WHERE player=? AND duel=?",
            uid,
            duel,
          );
          if (existing) {
            if (now - existing.started > 300000)
              fail(409, "A tentativa deste duelo expirou. Crie uma revanche.");
            if (existing.finished !== null)
              fail(409, "Sua tentativa neste duelo já foi concluída.");
            return send(200, {
              id: existing.id,
              config,
              expires: existing.started + 300000,
            });
          }
        } else if (body.daily === true) {
          daily = day(now);
          config = dailyChallenge(daily);
          const existing = get(
            "SELECT * FROM matches WHERE player=? AND daily=?",
            uid,
            daily,
          );
          if (existing) {
            if (existing.finished !== null)
              fail(409, "Você já concluiu o desafio de hoje.");
            if (now - existing.started > 300000)
              fail(409, "A tentativa diária expirou. Volte amanhã.");
            return send(200, {
              id: existing.id,
              config,
              expires: existing.started + 300000,
            });
          }
        } else {
          try {
            config = challenge(body.game, body.difficulty);
          } catch (e) {
            fail(400, e.message);
          }
        }
        if (
          get(
            "SELECT COUNT(*) n FROM matches WHERE player=? AND started>?",
            uid,
            now - 60000,
          ).n >= 15
        )
          fail(429, "Aguarde antes de iniciar outra partida.");
        const id = randomUUID();
        run(
          "INSERT INTO matches(id,player,duel,config,started,daily) VALUES(?,?,?,?,?,?)",
          id,
          uid,
          duel,
          JSON.stringify(config),
          now,
          daily,
        );
        return send(201, { id, config, expires: now + 300000 });
      }
      const match = route.match(/^\/v1\/matches\/([a-f0-9-]+)\/finish$/);
      if (match && req.method === "POST")
        return send(
          200,
          tx(() => {
            const m = get(
              "SELECT * FROM matches WHERE id=? AND player=?",
              match[1],
              uid,
            );
            if (!m) fail(404, "Partida não encontrada.");
            if (m.finished !== null) return result(m);
            if (now - m.started > 300000)
              fail(409, "Partida expirou. Inicie outra.");
            const c = JSON.parse(m.config);
            let points;
            try {
              points = score(c, body);
            } catch (e) {
              fail(400, e.message);
            }
            const minimum =
              c.game === "timer"
                ? body.elapsedMs
                : c.game === "reflex"
                  ? body.falseStart
                    ? 0
                    : (c.waits || [c.waitMs]).reduce((a, b) => a + b, 0) +
                      (body.reactions || [body.reactionMs]).reduce(
                        (a, b) => a + b,
                        0,
                      )
                  : c.sequence.length * (c.flashMs + 250);
            if (now - m.started + 100 < minimum)
              fail(400, "Duração incompatível com a partida.");
            const plays = get(
              "SELECT COUNT(*) n FROM matches WHERE player=? AND finished>=?",
              uid,
              Date.parse(day(now)),
            ).n;
            const r = reward(points, c.difficulty, plays);
            run(
              "UPDATE matches SET finished=?,score=?,xp=?,coins=? WHERE id=?",
              now,
              points,
              r.xp,
              r.coins,
              m.id,
            );
            return result(get("SELECT * FROM matches WHERE id=?", m.id));
          }),
        );
      if (route === "/v1/me" && req.method === "DELETE") {
        tx(() => {
          run(
            "DELETE FROM matches WHERE player=? OR duel IN (SELECT code FROM duels WHERE host=?)",
            uid,
            uid,
          );
          run("DELETE FROM duels WHERE host=?", uid);
          run("UPDATE duels SET guest=NULL WHERE guest=?", uid);
          run("DELETE FROM players WHERE id=?", uid);
        });
        return send(200, { deleted: true });
      }
      fail(404, "Rota não encontrada.");
    } catch (e) {
      if (!res.headersSent)
        send(e.status || 500, {
          error: e.status ? e.message : "Erro interno do servidor.",
        });
      if (!e.status) console.error(e);
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return { server, db };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { server } = createApp(process.env.DB_PATH || "data/duelou.sqlite");
  server.listen(
    Number(process.env.PORT || 3001),
    process.env.HOST || "127.0.0.1",
    () =>
      console.log("Duelou API pronta na porta " + (process.env.PORT || 3001)),
  );
}

import { randomBytes } from "node:crypto";
import {
  makeArcade,
  arcadeScore,
  publicArcade,
  modes,
  MAX_LEVEL,
  CLEAR_SCORE,
} from "../shared/arcade.mjs";
// Pareia com salas cujo nível esteja a até essa distância do nível do jogador —
// nível numerado (1..20+) não pode exigir combinação exata ou o pareamento trava.
const LEVEL_TOLERANCE = 3;

export function roomRoutes(db, clock) {
  db.exec(`CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, host TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE, mode TEXT NOT NULL, public INTEGER NOT NULL, capacity INTEGER NOT NULL, created INTEGER NOT NULL, starts INTEGER, config TEXT NOT NULL, counted INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS room_members (room TEXT REFERENCES rooms(code) ON DELETE CASCADE, player TEXT REFERENCES players(id) ON DELETE CASCADE, joined INTEGER NOT NULL, seen INTEGER NOT NULL, answers TEXT, score INTEGER, finished INTEGER, PRIMARY KEY(room,player));
  CREATE TABLE IF NOT EXISTS arcade_stats (player TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE, played INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0, best INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0);
  CREATE INDEX IF NOT EXISTS room_members_player ON room_members(player);`);
  const addColumn = (table, column, ddl) => {
    if (
      !db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .some((c) => c.name === column)
    )
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  };
  addColumn("rooms", "counted", "counted INTEGER NOT NULL DEFAULT 0");
  addColumn("room_members", "finished", "finished INTEGER");
  addColumn("arcade_stats", "level", "level INTEGER NOT NULL DEFAULT 1");
  // Série melhor-de-N (MD1/MD3): a sala guarda o formato, em qual prova está e
  // o histórico das provas já concluídas; cada jogador guarda quantas provas
  // já venceu na série atual.
  addColumn("rooms", "format", "format TEXT NOT NULL DEFAULT 'md1'");
  addColumn("rooms", "game_index", "game_index INTEGER NOT NULL DEFAULT 0");
  addColumn("rooms", "history", "history TEXT NOT NULL DEFAULT '[]'");
  addColumn(
    "room_members",
    "series_wins",
    "series_wins INTEGER NOT NULL DEFAULT 0",
  );
  const gamesFor = (format) => (format === "md3" ? 3 : 1);
  const winsFor = (format) => (format === "md3" ? 2 : 1);
  const one = (sql, ...v) => db.prepare(sql).get(...v),
    all = (sql, ...v) => db.prepare(sql).all(...v),
    run = (sql, ...v) => db.prepare(sql).run(...v);
  const fail = (status, message) => {
    throw Object.assign(Error(message), { status });
  };
  const currentLevel = (uid) =>
    one("SELECT level FROM arcade_stats WHERE player=?", uid)?.level || 1;
  const configOf = (room) => JSON.parse(room.config);
  const endOf = (room) => room.starts + (configOf(room).seconds || 60) * 1000;
  const state = (room) =>
    !room.starts
      ? "waiting"
      : clock() < room.starts
        ? "countdown"
        : clock() > endOf(room) + 10000 ||
            !one(
              "SELECT 1 FROM room_members WHERE room=? AND score IS NULL",
              room.code,
            )
          ? "finished"
          : "playing";
  const finalize = (room) => {
    if (room.counted || !room.starts) return;
    const allDone = !one(
      "SELECT 1 FROM room_members WHERE room=? AND score IS NULL",
      room.code,
    );
    if (!allDone && clock() <= endOf(room) + 10000) return;
    const history = JSON.parse(room.history || "[]");
    // Idempotência: se esta prova (game_index) já tem uma entrada no histórico,
    // ela já foi processada — evita contar duas vezes numa nova varredura/view.
    if (history.length > room.game_index) return;
    run(
      "UPDATE room_members SET score=COALESCE(score,0),finished=COALESCE(finished,?) WHERE room=?",
      endOf(room),
      room.code,
    );
    const results = all(
      "SELECT player,score,finished,joined,series_wins FROM room_members WHERE room=? ORDER BY score DESC,finished ASC,joined ASC",
      room.code,
    );
    const roomLevel = configOf(room).difficulty || 1;
    // Empate em pontos é desempatado por tempo de conclusão na própria consulta
    // (ORDER BY acima) — o primeiro da lista já é o vencedor desta prova.
    const winner = results[0]?.player ?? null;
    // Estatísticas pessoais (partidas, vitórias, melhor, média) contam por
    // prova individual — mesma escala de 0 a 1.000, seja MD1 ou dentro de um MD3.
    results.forEach((result, index) => {
      const before = currentLevel(result.player);
      const advance =
        roomLevel === before && result.score >= CLEAR_SCORE && before < MAX_LEVEL;
      run(
        "INSERT INTO arcade_stats(player,played,wins,best,total,level) VALUES(?,1,?,?,?,?) ON CONFLICT(player) DO UPDATE SET played=played+1,wins=wins+excluded.wins,best=MAX(best,excluded.best),total=total+excluded.total,level=excluded.level",
        result.player,
        index === 0 ? 1 : 0,
        result.score,
        result.score,
        advance ? before + 1 : before,
      );
    });
    if (winner)
      run(
        "UPDATE room_members SET series_wins=series_wins+1 WHERE room=? AND player=?",
        room.code,
        winner,
      );
    history.push({
      scores: Object.fromEntries(results.map((r) => [r.player, r.score])),
      durations: Object.fromEntries(
        results.map((r) => [
          r.player,
          Math.max(0, (r.finished ?? endOf(room)) - room.starts),
        ]),
      ),
      winner,
    });
    const format = room.format || "md1";
    const winsRows = all(
      "SELECT series_wins FROM room_members WHERE room=?",
      room.code,
    );
    const seriesOver =
      format !== "md3" ||
      history.length >= gamesFor(format) ||
      winsRows.some((r) => r.series_wins >= winsFor(format));
    if (seriesOver) {
      run(
        "UPDATE rooms SET counted=1,history=? WHERE code=?",
        JSON.stringify(history),
        room.code,
      );
      room.counted = 1;
      room.history = JSON.stringify(history);
      return;
    }
    const nextConfig = makeArcade(room.mode, roomLevel);
    const nextStarts = clock() + 5000;
    run(
      "UPDATE rooms SET config=?,game_index=game_index+1,starts=?,history=? WHERE code=?",
      JSON.stringify(nextConfig),
      nextStarts,
      JSON.stringify(history),
      room.code,
    );
    run(
      "UPDATE room_members SET score=NULL,answers=NULL,finished=NULL WHERE room=?",
      room.code,
    );
    room.config = JSON.stringify(nextConfig);
    room.starts = nextStarts;
    room.game_index = room.game_index + 1;
    room.history = JSON.stringify(history);
  };
  const view = (room, uid) => {
    finalize(room);
    const config = configOf(room);
    const format = room.format || "md1";
    const members = all(
      "SELECT m.player id,p.name,m.seen,m.score,m.finished,m.joined,m.series_wins FROM room_members m JOIN players p ON p.id=m.player WHERE room=?",
      room.code,
    )
      .map((m) => ({
        id: m.id,
        name: m.name,
        score: m.score,
        seriesWins: m.series_wins,
        online: clock() - m.seen < 16000,
        durationMs:
          m.finished && room.starts
            ? Math.max(0, m.finished - room.starts)
            : null,
      }))
      .sort(
        (a, b) =>
          (b.seriesWins ?? 0) - (a.seriesWins ?? 0) ||
          (b.score ?? -1) - (a.score ?? -1) ||
          (a.durationMs ?? Infinity) - (b.durationMs ?? Infinity),
      );
    return {
      code: room.code,
      host: room.host,
      mode: room.mode,
      difficulty: config.difficulty || 1,
      format,
      gameIndex: room.game_index || 0,
      gamesNeeded: gamesFor(format),
      history: JSON.parse(room.history || "[]"),
      public: !!room.public,
      capacity: room.capacity,
      starts: room.starts,
      ends: room.starts ? endOf(room) : null,
      serverNow: clock(),
      state: state(room),
      config:
        room.starts && clock() >= room.starts ? publicArcade(config) : null,
      members,
    };
  };
  const load = (code, uid) => {
    const room = one(
      "SELECT * FROM rooms WHERE code=? AND created>?",
      code,
      clock() - 86400000,
    );
    if (!room) fail(404, "Sala não encontrada ou encerrada.");
    if (
      uid &&
      !one("SELECT 1 FROM room_members WHERE room=? AND player=?", code, uid)
    )
      fail(403, "Entre na sala primeiro.");
    return room;
  };
  const join = (room, uid) => {
    if (
      one(
        "SELECT 1 FROM room_members WHERE room=? AND player=?",
        room.code,
        uid,
      )
    )
      return view(room, uid);
    if (room.starts) fail(409, "Esta partida já começou.");
    if (
      one("SELECT COUNT(*) n FROM room_members WHERE room=?", room.code).n >=
      room.capacity
    )
      fail(409, "Sala cheia.");
    run(
      "INSERT INTO room_members(room,player,joined,seen) VALUES(?,?,?,?)",
      room.code,
      uid,
      clock(),
      clock(),
    );
    if (
      room.public &&
      room.capacity === 2 &&
      one(
        "SELECT COUNT(*) n FROM room_members WHERE room=? AND seen>?",
        room.code,
        clock() - 16000,
      ).n === 2
    ) {
      run("UPDATE rooms SET starts=? WHERE code=?", clock() + 5000, room.code);
      room = load(room.code);
    }
    return view(room, uid);
  };
  const create = (uid, body) => {
    // O nível da sala vem sempre do nível atual do criador no servidor — nunca
    // do cliente. Evita escolher/pular nível manualmente e mantém a progressão real.
    const config = makeArcade(body.mode, currentLevel(uid));
    if (![2, 4, 6].includes(body.capacity))
      fail(400, "Escolha 2, 4 ou 6 jogadores.");
    const format = body.format === "md3" ? "md3" : "md1";
    if (
      one(
        "SELECT COUNT(*) n FROM rooms WHERE host=? AND created>?",
        uid,
        clock() - 86400000,
      ).n >= 20
    )
      fail(409, "Limite de salas atingido.");
    const code = randomBytes(4).toString("hex").toUpperCase();
    run(
      "INSERT INTO rooms(code,host,mode,public,capacity,created,starts,config,format) VALUES(?,?,?,?,?,?,NULL,?,?)",
      code,
      uid,
      body.mode,
      body.public === true ? 1 : 0,
      body.capacity,
      clock(),
      JSON.stringify(config),
      format,
    );
    return join(load(code), uid);
  };
  return (route, method, body, uid) => {
    if (!route.startsWith("/v1/rooms")) return null;
    try {
      all(
        "SELECT * FROM rooms WHERE starts IS NOT NULL AND counted=0 AND (starts + COALESCE(json_extract(config,'$.seconds'),60) * 1000 + 10000 < ? OR NOT EXISTS(SELECT 1 FROM room_members WHERE room=rooms.code AND score IS NULL))",
        clock(),
      ).forEach(finalize);
      run("DELETE FROM rooms WHERE created<?", clock() - 86400000);
      if (route === "/v1/rooms/active" && method === "GET") {
        const active = one(
          "SELECT r.* FROM rooms r JOIN room_members m ON m.room=r.code WHERE m.player=? AND m.seen>0 AND r.created>? AND r.counted=0 ORDER BY (r.starts IS NOT NULL) DESC,r.created DESC,r.rowid DESC LIMIT 1",
          uid,
          clock() - 86400000,
        );
        return { status: 200, data: active ? view(active, uid) : null };
      }
      if (route === "/v1/rooms/stats" && method === "GET") {
        const stats = one(
          "SELECT played,wins,best,total,level FROM arcade_stats WHERE player=?",
          uid,
        );
        return {
          status: 200,
          data: {
            played: stats?.played || 0,
            wins: stats?.wins || 0,
            best: stats?.best || 0,
            average: stats?.played ? Math.round(stats.total / stats.played) : 0,
            level: stats?.level || 1,
            maxLevel: MAX_LEVEL,
          },
        };
      }
      if (route === "/v1/rooms/leaderboard" && method === "GET")
        return {
          status: 200,
          data: all(
            "SELECT p.id,p.name,s.played,s.wins,s.best,ROUND(1.0*s.total/s.played) average FROM arcade_stats s JOIN players p ON p.id=s.player WHERE s.played>0 ORDER BY s.wins DESC,s.best DESC,average DESC,p.created ASC LIMIT 20",
          ),
        };
      if (route === "/v1/rooms" && method === "GET")
        return {
          status: 200,
          data: all(
            "SELECT r.* FROM rooms r WHERE r.public=1 AND r.starts IS NULL AND r.created>? AND EXISTS(SELECT 1 FROM room_members m WHERE m.room=r.code AND m.seen>?) AND (SELECT COUNT(*) FROM room_members m WHERE m.room=r.code)<r.capacity ORDER BY r.created DESC LIMIT 30",
            clock() - 86400000,
            clock() - 16000,
          ).map((r) => ({
            code: r.code,
            mode: r.mode,
            difficulty: JSON.parse(r.config).difficulty || 1,
            format: r.format || "md1",
            capacity: r.capacity,
            count: one(
              "SELECT COUNT(*) n FROM room_members WHERE room=?",
              r.code,
            ).n,
          })),
        };
      if (route === "/v1/rooms" && method === "POST")
        return { status: 201, data: create(uid, body) };
      if (route === "/v1/rooms/random" && method === "POST") {
        if (!modes.some((m) => m.id === body.mode)) fail(400, "Modo inválido");
        const myLevel = currentLevel(uid);
        const format = body.format === "md3" ? "md3" : "md1";
        const candidates = all(
          "SELECT r.* FROM rooms r WHERE r.public=1 AND r.capacity=2 AND r.mode=? AND r.format=? AND r.starts IS NULL AND r.created>? AND EXISTS(SELECT 1 FROM room_members m WHERE m.room=r.code AND m.seen>?) AND (SELECT COUNT(*) FROM room_members WHERE room=r.code)<r.capacity ORDER BY r.created LIMIT 50",
          body.mode,
          format,
          clock() - 86400000,
          clock() - 16000,
        );
        // Pareia pelo nível mais próximo do seu, não idêntico — com 20+ níveis,
        // exigir combinação exata deixaria pouca gente pra parear.
        const best = candidates
          .map((r) => ({
            room: r,
            distance: Math.abs((configOf(r).difficulty || 1) - myLevel),
          }))
          .filter((x) => x.distance <= LEVEL_TOLERANCE)
          .sort((a, b) => a.distance - b.distance || a.room.created - b.room.created)[0];
        return {
          status: 200,
          data: best
            ? join(best.room, uid)
            : create(uid, { mode: body.mode, capacity: 2, public: true, format }),
        };
      }
      const match = route.match(
        /^\/v1\/rooms\/([A-F0-9]{8})(?:\/(join|start|finish|heartbeat))?$/,
      );
      if (!match) fail(404, "Rota de sala não encontrada.");
      const [, code, action] = match;
      if (action === "join" && method === "POST")
        return { status: 200, data: join(load(code), uid) };
      const room = load(code, uid);
      if (!action && method === "GET")
        return { status: 200, data: view(room, uid) };
      if (!action && method === "DELETE") {
        if (room.host === uid && !room.starts) {
          const next = one(
            "SELECT player FROM room_members WHERE room=? AND player<>? ORDER BY joined LIMIT 1",
            code,
            uid,
          );
          if (next)
            run("UPDATE rooms SET host=? WHERE code=?", next.player, code);
          else {
            run("DELETE FROM rooms WHERE code=?", code);
            return { status: 200, data: { left: true } };
          }
        }
        if (!room.starts)
          run("DELETE FROM room_members WHERE room=? AND player=?", code, uid);
        else
          run(
            "UPDATE room_members SET seen=0 WHERE room=? AND player=?",
            code,
            uid,
          );
        return { status: 200, data: { left: true } };
      }
      if (method !== "POST") fail(405, "Método inválido.");
      if (action === "heartbeat")
        run(
          "UPDATE room_members SET seen=? WHERE room=? AND player=?",
          clock(),
          code,
          uid,
        );
      else if (action === "start") {
        if (room.host !== uid) fail(403, "Somente o anfitrião inicia.");
        if (!room.starts) {
          if (
            one(
              "SELECT COUNT(*) n FROM room_members WHERE room=? AND seen>?",
              code,
              clock() - 16000,
            ).n < 2
          )
            fail(409, "Espere pelo menos dois jogadores conectados.");
          run("UPDATE rooms SET starts=? WHERE code=?", clock() + 5000, code);
        }
      } else if (action === "finish") {
        const member = one(
          "SELECT score,answers,finished FROM room_members WHERE room=? AND player=?",
          code,
          uid,
        );
        if (member.score === null) {
          if (!room.starts || clock() < room.starts + 1000)
            fail(409, "A partida ainda não começou.");
          if (clock() > endOf(room) + 10000)
            fail(409, "Prazo de envio encerrado.");
          const points = arcadeScore(JSON.parse(room.config), body.answers);
          run(
            "UPDATE room_members SET score=?,answers=?,finished=? WHERE room=? AND player=?",
            points,
            JSON.stringify(body.answers),
            clock(),
            code,
            uid,
          );
          finalize(load(code, uid));
        }
      } else fail(404, "Ação inválida.");
      return { status: 200, data: view(load(code, uid), uid) };
    } catch (e) {
      if (e.status) throw e;
      if (
        e.message === "Nível inválido" ||
        e.message === "Modo inválido" ||
        e.message === "Respostas inválidas"
      )
        fail(400, e.message);
      throw e;
    }
  };
}

import { readAvatar } from "../shared/avatar.mjs";
import { persistence } from "./persistence.mjs";
import { makeCompetitive, competitiveBase } from "../shared/competition.mjs";
import { competitiveRules } from "./competitive.mjs";
import { randomBytes } from "node:crypto";
import {
  makeArcade,
  arcadeScore,
  publicArcade,
  modes,
  MAX_LEVEL,
  CLEAR_SCORE,
  ROOM_CAPACITIES,
  resultDetails,
  minimumAttemptMs,
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
  // Nível era um só por conta pra todos os jogos — subir em "Conta rápida"
  // jogava alguém que nunca tocou em "Memória turbo" direto num nível difícil
  // lá também, e o pareamento automático comparava nível de um jogo com o de
  // outro. Migra pra uma linha por (jogador, jogo) — cada prova evolui
  // sozinha. Dado antigo não tinha jogo associado, então não dá pra
  // preservar; reseta (app ainda não publicado, sem base de usuários real).
  if (
    !db
      .prepare("PRAGMA table_info(arcade_stats)")
      .all()
      .some((c) => c.name === "mode")
  ) {
    db.exec(`DROP TABLE arcade_stats;
    CREATE TABLE arcade_stats (player TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE, mode TEXT NOT NULL, played INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0, best INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0, level INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(player,mode));`);
  }
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
  // Aponta pra sala da revanche depois que alguém cria uma — os outros membros
  // descobrem isso pelo próprio polling da sala encerrada (view() abaixo) e
  // decidem entrar ou não, em vez de ficarem perdidos numa sala que já acabou.
  addColumn("rooms", "next_code", "next_code TEXT");
  addColumn("rooms", "next_action", "next_action TEXT");
  addColumn("rooms", "ranked", "ranked INTEGER NOT NULL DEFAULT 0");
  addColumn("room_members", "progress", "progress TEXT");
  addColumn("room_members", "forfeited", "forfeited INTEGER NOT NULL DEFAULT 0");
  addColumn("rooms", "break_started", "break_started INTEGER");
  addColumn("rooms", "break_until", "break_until INTEGER");
  addColumn("room_members", "ready", "ready INTEGER NOT NULL DEFAULT 0");
  addColumn("players", "avatar", "avatar TEXT");
  const competitive = competitiveRules(db, clock);
  const storage = persistence(db,clock);
  storage.backfill();
  const gamesFor = (format) => (format === "md3" ? 3 : 1);
  const winsFor = (format) => (format === "md3" ? 2 : 1);
  const one = (sql, ...v) => db.prepare(sql).get(...v),
    all = (sql, ...v) => db.prepare(sql).all(...v),
    run = (sql, ...v) => db.prepare(sql).run(...v);
  const fail = (status, message) => {
    throw Object.assign(Error(message), { status });
  };
  const currentLevel = (uid, mode) =>
    one("SELECT level FROM arcade_stats WHERE player=? AND mode=?", uid, mode)
      ?.level || 1;
  const configOf = (room) => JSON.parse(room.config);
  const endOf = (room) => room.starts + (configOf(room).seconds || 60) * 1000;
  const state = (room) =>
    room.counted ? "finished" : room.break_until && clock() < room.break_until ? "intermission" : !room.starts
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
    if (room.counted || !room.starts || clock() < room.starts) return;
    const allDone = !one(
      "SELECT 1 FROM room_members WHERE room=? AND score IS NULL",
      room.code,
    );
    if (!allDone && clock() <= endOf(room) + 10000) return;
    const history = JSON.parse(room.history || "[]");
    // Idempotência: se esta prova (game_index) já tem uma entrada no histórico,
    // ela já foi processada — evita contar duas vezes numa nova varredura/view.
    if (history.length > room.game_index) return;
    if (room.ranked) {
      for (const m of all(
        "SELECT player,progress FROM room_members WHERE room=? AND score IS NULL AND progress IS NOT NULL",
        room.code,
      )) {
        const answers = JSON.parse(m.progress).answers;
        run(
          "UPDATE room_members SET score=?,answers=?,finished=? WHERE room=? AND player=?",
          arcadeScore(configOf(room), answers),
          JSON.stringify(answers),
          endOf(room),
          room.code,
          m.player,
        );
      }
    }
    run(
      "UPDATE room_members SET score=COALESCE(score,0),finished=COALESCE(finished,?) WHERE room=?",
      endOf(room),
      room.code,
    );
    const results = all(
      "SELECT player,score,finished,joined,series_wins,answers,progress,forfeited FROM room_members WHERE room=? ORDER BY score DESC,finished ASC,joined ASC",
      room.code,
    );
    const roomLevel = configOf(room).difficulty || 1;
    storage.archive(room,configOf(room),results);
    if(room.ranked)for(const result of results)competitive.observe(room,result,configOf(room));
    // A ordenação estabiliza a apresentação; somente uma nota estritamente
    // maior pode vencer. Tempo de transporte não quebra empates.
    const winner =
      results[0]?.score > 0 &&
      (results.length === 1 || results[0].score > results[1].score)
        ? results[0].player
        : null;
    // Estatísticas pessoais (partidas, vitórias, melhor, média) contam por
    // prova individual — mesma escala de 0 a 1.000, seja MD1 ou dentro de um MD3.
    results.forEach((result) => {
      const before = currentLevel(result.player, room.mode);
      const advance =
        roomLevel >= before &&
        result.score >= CLEAR_SCORE &&
        before < MAX_LEVEL;
      run(
        "INSERT INTO arcade_stats(player,mode,played,wins,best,total,level) VALUES(?,?,1,?,?,?,?) ON CONFLICT(player,mode) DO UPDATE SET played=played+1,wins=wins+excluded.wins,best=MAX(best,excluded.best),total=total+excluded.total,level=excluded.level",
        result.player,
        room.mode,
        result.player === winner ? 1 : 0,
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
      competitive.settle(room, history);
      for (const result of results)
        if (history.some((h) => h.scores[result.player] > 0))
          competitive.event(result.player, "series_finished");
      run(
        "UPDATE rooms SET counted=1,history=? WHERE code=?",
        JSON.stringify(history),
        room.code,
      );
      room.counted = 1;
      room.history = JSON.stringify(history);
      return;
    }
    const nextConfig = configOf(room).competitiveVersion ? makeCompetitive(room.mode,roomLevel) : makeArcade(room.mode, roomLevel);
    const breakStarted=clock(), breakUntil=breakStarted+20000;
    const nextStarts = breakUntil + 5000;
    run(
      "UPDATE rooms SET config=?,game_index=game_index+1,starts=?,history=?,break_started=?,break_until=? WHERE code=?",
      JSON.stringify(nextConfig),
      nextStarts,
      JSON.stringify(history),
      breakStarted,breakUntil,
      room.code,
    );
    run(
      "UPDATE room_members SET score=NULL,answers=NULL,finished=NULL,progress=NULL,ready=0 WHERE room=?",
      room.code,
    );
    if (room.ranked)
      run(
        "UPDATE room_members SET score=0,answers='[]',finished=? WHERE room=? AND forfeited=1",
        nextStarts,
        room.code,
      );
    room.break_started=breakStarted;room.break_until=breakUntil;
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
      "SELECT m.player id,p.name,p.avatar,m.ready,m.forfeited,m.seen,m.score,m.finished,m.joined,m.series_wins,m.answers,m.progress FROM room_members m JOIN players p ON p.id=m.player WHERE room=?",
      room.code,
    )
      .map((m) => ({
        id: m.id,
        name: m.name,
        avatar:readAvatar(m.avatar),
        ready:!!m.ready,forfeited:!!m.forfeited,
        rank:room.ranked ? competitive.rating(m.id).rating : null,
        score: m.score,
        details:
          m.score !== null && (m.id === uid || state(room) === "finished")
            ? resultDetails(config, JSON.parse(m.answers || "[]"))
            : [],
        answered: m.progress ? JSON.parse(m.progress).answers.length : (m.score!==null?config.rounds.length:0),
        total:config.rounds.length,
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
          (b.score ?? -1) - (a.score ?? -1),
      );
    return {
      code: room.code,
      host: room.host,
      mode: room.mode,
      difficulty: config.difficulty || 1,
      format,
      gameIndex: room.game_index || 0,
      gamesNeeded: gamesFor(format),
      history: JSON.parse(room.history || "[]").map((h,index)=>({...h,details:JSON.parse(one("SELECT details FROM game_history WHERE player=? AND room=? AND game_index=?",uid,room.code,index)?.details || "[]")})),
      ratingNotice:room.ranked && members.length===2 && competitive.pairCount(members[0].id,members[1].id,room.code)>=5?"Limite diário com este rival: esta série não altera a classificação.":null,
      public: !!room.public,
      ranked: !!room.ranked,
      ratingResult:
        one(
          "SELECT delta,rating,outcome,status FROM competitive_results WHERE room=? AND player=?",
          room.code,
          uid,
        ) || null,
      capacity: room.capacity,
      starts: room.starts,
      breakStarted:room.break_started,
      breakUntil:room.break_until,
      ends: room.starts ? endOf(room) : null,
      serverNow: clock(),
      state: state(room),
      config:
        room.starts && clock() >= room.starts
          ? room.ranked
            ? { ...config, rounds: [] }
            : publicArcade(config)
          : null,
      members,
      nextCode: room.next_code || null,
      nextAction: room.next_code ? room.next_action || "rematch" : null,
      nextDifficulty: room.next_code ? Math.min(MAX_LEVEL, config.difficulty + (room.next_action === "continue" ? 1 : 0)) : null,
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
  const join = (room, uid, fromQueue = false) => {
    if(room.ranked && one("SELECT 1 FROM room_members WHERE room=? AND player=? AND forfeited=1",room.code,uid))fail(409,"Sua participação nesta série foi encerrada.");
    if (
      one(
        "SELECT 1 FROM room_members WHERE room=? AND player=?",
        room.code,
        uid,
      )
    )
      return view(room, uid);
    if (room.ranked && !fromQueue)
      fail(403, "Entre na competição pelo botão Jogar competitivo.");
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
      if(room.ranked) {
        const ratings=all("SELECT player FROM room_members WHERE room=?",room.code).map(m=>competitive.rating(m.player).rating);
        const config=makeCompetitive(room.mode,competitiveBase(ratings.reduce((a,b)=>a+b,0)/ratings.length));
        run("UPDATE rooms SET config=? WHERE code=?",JSON.stringify(config),room.code);
      }
      run("UPDATE rooms SET starts=? WHERE code=?", clock() + 5000, room.code);
      room = load(room.code);
    }
    return view(room, uid);
  };
  const create = (uid, body, ranked = false) => {
    const config = ranked ? makeCompetitive(body.mode,competitiveBase(competitive.rating(uid).rating)) : makeArcade(
      body.mode,
      body.difficulty ?? currentLevel(uid, body.mode),
    );
    if (!ROOM_CAPACITIES.includes(body.capacity))
      fail(400, "Escolha um tamanho de sala válido.");
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
    if (ranked) run("UPDATE rooms SET ranked=1 WHERE code=?", code);
    return join(load(code), uid, ranked);
  };
  const findCompetitive = (uid, existing) => {
    const candidates = all(
      "SELECT r.* FROM rooms r WHERE ranked=1 AND starts IS NULL AND created>? AND host<>? AND EXISTS(SELECT 1 FROM room_members m WHERE m.room=r.code AND m.seen>?) ORDER BY created LIMIT 100",
      clock() - 86400000,
      uid,
      clock() - 16000,
    );
    const myRating = competitive.rating(uid).rating;
    const candidate = candidates
      .map((r) => ({
        room: r,
        distance: Math.abs(competitive.rating(r.host).rating - myRating),
      }))
      .filter(
        (x) =>
          x.distance <=
          Math.min(
            400,
            150 +
              Math.floor(
                (clock() -
                  Math.min(x.room.created, existing?.created || clock())) /
                  10000,
              ) *
                50,
          ),
      )
      .sort(
        (a, b) => a.distance - b.distance || a.room.created - b.room.created,
      )[0];
    if (candidate) {
      const result = join(candidate.room, uid, true);
      if (existing)
        run("DELETE FROM rooms WHERE code=? AND starts IS NULL", existing.code);
      return result;
    }
    return null;
  };
  return (route, method, body, uid, query) => {
    if (!route.startsWith("/v1/rooms")) return null;
    db.exec("SAVEPOINT room_request");
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
        // Sem `mode`, agrega os 8 jogos (visão geral, ex. tela Início); com
        // `mode`, é o nível/estatística daquele jogo específico — cada prova
        // evolui sozinha, não faz sentido misturar as duas visões.
        const gameMode = query?.get("mode");
        const stats = gameMode
          ? one(
              "SELECT played,wins,best,total,level FROM arcade_stats WHERE player=? AND mode=?",
              uid,
              gameMode,
            )
          : one(
              "SELECT SUM(played) played,SUM(wins) wins,MAX(best) best,SUM(total) total,MAX(level) level FROM arcade_stats WHERE player=?",
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
        return { status: 200, data: competitive.leaders() };
      if (route === "/v1/rooms/competitive" && method === "POST") {
        const existing = one(
          "SELECT r.* FROM rooms r JOIN room_members m ON m.room=r.code WHERE r.ranked=1 AND r.counted=0 AND m.player=? AND m.seen>0 ORDER BY r.created DESC LIMIT 1",
          uid,
        );
        if (existing) return { status: 200, data: view(existing, uid) };
        const match = findCompetitive(uid, null);
        competitive.event(uid, "queue_entered");
        const rotation = ["math", "order", "sequence"];
        return {
          status: 200,
          data:
            match ||
            create(
              uid,
              {
                mode: rotation[
                  Math.floor(clock() / 86400000) % rotation.length
                ],
                difficulty: 10,
                capacity: 2,
                public: true,
                format: "md3",
              },
              true,
            ),
        };
      }
      if (route === "/v1/rooms" && method === "GET")
        return {
          status: 200,
          data: all(
            "SELECT r.* FROM rooms r WHERE r.public=1 AND r.ranked=0 AND r.starts IS NULL AND r.created>? AND EXISTS(SELECT 1 FROM room_members m WHERE m.room=r.code AND m.seen>?) AND (SELECT COUNT(*) FROM room_members m WHERE m.room=r.code)<r.capacity ORDER BY r.created DESC LIMIT 30",
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
        const myLevel = body.difficulty ?? currentLevel(uid, body.mode);
        if (!Number.isInteger(myLevel) || myLevel < 1 || myLevel > MAX_LEVEL)
          fail(400, "Nível inválido");
        const format = body.format === "md3" ? "md3" : "md1";
        const candidates = all(
          "SELECT r.* FROM rooms r WHERE r.public=1 AND r.ranked=0 AND r.capacity=2 AND r.mode=? AND r.format=? AND r.starts IS NULL AND r.created>? AND EXISTS(SELECT 1 FROM room_members m WHERE m.room=r.code AND m.seen>?) AND (SELECT COUNT(*) FROM room_members WHERE room=r.code)<r.capacity ORDER BY r.created LIMIT 50",
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
          .filter(
            (x) =>
              x.distance <=
              (body.difficulty === undefined ? LEVEL_TOLERANCE : 0),
          )
          .sort(
            (a, b) =>
              a.distance - b.distance || a.room.created - b.room.created,
          )[0];
        return {
          status: 200,
          data: best
            ? join(best.room, uid)
            : create(uid, {
                mode: body.mode,
                capacity: 2,
                public: true,
                format,
                difficulty: myLevel,
              }),
        };
      }
      const match = route.match(
        /^\/v1\/rooms\/([A-F0-9]{8})(?:\/(join|start|finish|heartbeat|rematch|continue|round|ready))?$/,
      );
      if (!match) fail(404, "Rota de sala não encontrada.");
      const [, code, action] = match;
      if (action === "join" && method === "POST")
        return { status: 200, data: join(load(code), uid) };
      const room = load(code, uid);
      if (!action && method === "GET")
        return { status: 200, data: view(room, uid) };
      if(action === "ready" && method === "POST"){
        if(body.gameIndex!==room.game_index)fail(409,"Este intervalo já terminou. Atualize a sala.");
        const member=one("SELECT ready,forfeited FROM room_members WHERE room=? AND player=?",code,uid);
        if(member.forfeited)fail(409,"Sua participação nesta série foi encerrada.");
        if(state(room)!=="intermission"){
          if(member.ready && state(room)==="countdown")return {status:200,data:view(room,uid)};
          fail(409,"Não há intervalo ativo nesta prova.");
        }
        run("UPDATE room_members SET ready=1,seen=? WHERE room=? AND player=?",clock(),code,uid);
        if(!one("SELECT 1 FROM room_members WHERE room=? AND forfeited=0 AND ready=0",code)){
          room.break_until=Math.max(room.break_started+5000,clock());room.starts=room.break_until+5000;
          run("UPDATE rooms SET break_until=?,starts=? WHERE code=?",room.break_until,room.starts,code);
        }
        return {status:200,data:view(room,uid)};
      }
      if (action === "round" && method === "POST") {
        const result = competitive.round(room, uid, body);
        if (result.done) finalize(load(code, uid));
        return { status: 200, data: result };
      }
      if ((action === "rematch" || action === "continue") && method === "POST") {
        if (action === "continue" && room.ranked) fail(409, "Continue pela fila competitiva.");
        if (state(room) !== "finished")
          fail(409, "A partida ainda não terminou.");
        // Idempotente: o primeiro clique cria a sala e aponta pra ela
        // (next_code); quem clicar depois — ou aceitar o convite — só entra
        // na mesma sala, em vez de fragmentar o grupo em várias revanches.
        let nextCode = room.next_code;
        if (nextCode && (room.next_action || "rematch") !== action) fail(409, "Já existe um convite para a próxima partida. Aceite o convite da sala.");
        if (!nextCode) {
          competitive.event(uid, "rematch_created");
          nextCode = create(uid, {
            mode: room.mode,
            difficulty: Math.min(MAX_LEVEL, configOf(room).difficulty + (action === "continue" ? 1 : 0)),
            format: room.format || "md1",
            capacity: room.capacity,
            public: room.ranked ? false : !!room.public,
          }).code;
          run("UPDATE rooms SET next_code=?,next_action=? WHERE code=?", nextCode, action, code);
        }
        return { status: 200, data: join(load(nextCode), uid) };
      }
      if (!action && method === "DELETE") {
        if (room.ranked && room.starts && !room.counted) {
          run(
            "UPDATE room_members SET score=0,answers='[]',finished=?,seen=0,forfeited=1 WHERE room=? AND player=?",
            clock(),
            code,
            uid,
          );
          finalize(load(code, uid));
          return { status: 200, data: { left: true } };
        }
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
      if(action==="heartbeat" && room.ranked && one("SELECT 1 FROM room_members WHERE room=? AND player=? AND forfeited=1",code,uid))fail(409,"Sua participação nesta série foi encerrada.");
      if (action === "heartbeat" && room.ranked && !room.starts) {
        const match = findCompetitive(uid, room);
        if (match) return { status: 200, data: match };
      }
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
        if (room.ranked)
          fail(400, "Responda uma rodada por vez na competição.");
        if (body.gameIndex !== undefined && body.gameIndex !== room.game_index)
          fail(409, "Esta prova já terminou. Atualize a sala.");
        const member = one(
          "SELECT score,answers,finished FROM room_members WHERE room=? AND player=?",
          code,
          uid,
        );
        if (member.score === null) {
          // Sem margem extra depois da largada: o `config` só é revelado ao
          // cliente quando `clock() >= room.starts` (view() abaixo), então não
          // dá pra calcular respostas antes disso — um buffer adicional só
          // rejeitava resultado legítimo de quem jogou rápido (prova curta,
          // jogador ágil), sem barrar nenhuma trapaça extra.
          if (!room.starts || clock() < room.starts)
            fail(409, "A partida ainda não começou.");
          if (clock() > endOf(room) + 10000)
            fail(409, "Prazo de envio encerrado.");
          const config = JSON.parse(room.config);
          const points = arcadeScore(config, body.answers);
          if (
            minimumAttemptMs(config, body.answers) >
            clock() - room.starts + 250
          )
            fail(400, "Tempo de tentativa inválido.");
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
      db.exec("ROLLBACK TO room_request");
      if (e.status) throw e;
      if (
        e.message === "Nível inválido" ||
        e.message === "Modo inválido" ||
        e.message === "Respostas inválidas"
      )
        fail(400, e.message);
      throw e;
    } finally {
      db.exec("RELEASE room_request");
    }
  };
}

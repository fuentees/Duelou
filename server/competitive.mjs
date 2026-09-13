import { readAvatar } from "../shared/avatar.mjs";
import { randomBytes } from "node:crypto";
import { arcadeScore, publicArcade } from "../shared/arcade.mjs";
import { ratingChange, ratingName } from "../shared/progression.mjs";

export function competitiveRules(db, clock) {
  db.exec(`CREATE TABLE IF NOT EXISTS competitive_ratings(player TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,rating INTEGER NOT NULL DEFAULT 1000,played INTEGER NOT NULL DEFAULT 0,wins INTEGER NOT NULL DEFAULT 0,draws INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS competitive_results(room TEXT NOT NULL,player TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,delta INTEGER NOT NULL,rating INTEGER NOT NULL,outcome REAL NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(room,player));
    CREATE TABLE IF NOT EXISTS product_events(player TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,name TEXT NOT NULL,created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS product_events_created ON product_events(created);`);
  db.exec(`CREATE TABLE IF NOT EXISTS integrity_signals(player TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,room TEXT NOT NULL,kind TEXT NOT NULL,evidence TEXT NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(player,room,kind));
    CREATE INDEX IF NOT EXISTS competitive_results_player_date ON competitive_results(player,created);`);
  if (
    !db
      .prepare("PRAGMA table_info(competitive_results)")
      .all()
      .some((c) => c.name === "status")
  )
    db.exec(
      "ALTER TABLE competitive_results ADD COLUMN status TEXT NOT NULL DEFAULT 'counted'",
    );
  const pairCount = (a, b, exclude = "") =>
    db
      .prepare(
        "SELECT COUNT(*) n FROM competitive_results a JOIN competitive_results b ON a.room=b.room WHERE a.player=? AND b.player=? AND a.room<>? AND a.created>=?",
      )
      .get(a, b, exclude, Math.floor(clock() / 86400000) * 86400000).n;
  const signal = (uid, room, kind, evidence) => {
    db.prepare("INSERT OR IGNORE INTO integrity_signals VALUES(?,?,?,?,?)").run(
      uid,
      room,
      kind,
      JSON.stringify(evidence),
      clock(),
    );
    db.prepare("DELETE FROM integrity_signals WHERE created<?").run(
      clock() - 90 * 86400000,
    );
  };
  const observe = (room, member, config) => {
    const progress = JSON.parse(member.progress || "{}");
    const timings = progress.timings || [];
    if (timings.length < 12) return;
    const mean = timings.reduce((a, b) => a + b, 0) / timings.length;
    const deviation = Math.sqrt(
      timings.reduce((a, b) => a + (b - mean) ** 2, 0) / timings.length,
    );
    const accuracy =
      (progress.answers || []).filter((v, i) => v === config.rounds[i].answer)
        .length / timings.length;
    // Sinal de revisão, nunca banimento ou perda automática de pontos.
    if (mean < 350 && deviation / mean < 0.04 && accuracy >= 0.95)
      signal(member.player, room.code, "uniform_fast_answers", {
        samples: timings.length,
        meanMs: Math.round(mean),
        variation: deviation / mean,
        accuracy,
      });
  };
  const fail = (status, message) => {
    throw Object.assign(Error(message), { status });
  };
  const rating = (uid) =>
    db.prepare("SELECT * FROM competitive_ratings WHERE player=?").get(uid) || {
      rating: 1000,
      played: 0,
      wins: 0,
      draws: 0,
    };
  const event = (uid, name) => {
    db.prepare("INSERT INTO product_events VALUES(?,?,?)").run(
      uid,
      name,
      clock(),
    );
    db.prepare("DELETE FROM product_events WHERE created<?").run(
      clock() - 90 * 86400000,
    );
  };
  const settle = (room, history) => {
    if (
      !room.ranked ||
      db
        .prepare("SELECT 1 FROM competitive_results WHERE room=?")
        .get(room.code)
    )
      return;
    const members = db
      .prepare(
        "SELECT player,series_wins FROM room_members WHERE room=? ORDER BY player",
      )
      .all(room.code);
    if (
      members.length !== 2 ||
      !history.some((h) => Object.values(h.scores).some((s) => s > 0))
    )
      return;
    const [a, b] = members,
      ar = rating(a.player),
      br = rating(b.player);
    const repeated = pairCount(a.player, b.player, room.code);
    const status = repeated >= 5 ? "same_rival_limit" : "counted";
    if (repeated >= 5)
      for (const m of members)
        signal(m.player, room.code, "repeated_pair", {
          seriesToday: repeated + 1,
        });
    const outcome =
      a.series_wins === b.series_wins
        ? 0.5
        : a.series_wins > b.series_wins
          ? 1
          : 0;
    for (const [member, mine, other, result] of [
      [a, ar, br, outcome],
      [b, br, ar, 1 - outcome],
    ]) {
      const delta =
        status !== "counted"
          ? 0
          : ratingChange(mine.rating, other.rating, result, mine.played);
      if (status === "counted")
        db.prepare(
          "INSERT INTO competitive_ratings(player,rating,played,wins,draws) VALUES(?,?,1,?,?) ON CONFLICT(player) DO UPDATE SET rating=excluded.rating,played=played+1,wins=wins+excluded.wins,draws=draws+excluded.draws",
        ).run(
          member.player,
          mine.rating + delta,
          result === 1 ? 1 : 0,
          result === 0.5 ? 1 : 0,
        );
      db.prepare(
        "INSERT INTO competitive_results(room,player,delta,rating,outcome,created,status) VALUES(?,?,?,?,?,?,?)",
      ).run(
        room.code,
        member.player,
        delta,
        mine.rating + delta,
        result,
        clock(),
        status,
      );
      event(
        member.player,
        status === "counted" ? "ranked_finished" : "unrated_finished",
      );
    }
  };
  const round = (room, uid, body) => {
    if (!room.ranked) fail(400, "Esta sala usa o resultado casual.");
    if (body.gameIndex !== room.game_index)
      fail(409, "Esta prova já terminou. Atualize a sala.");
    if (!room.starts || clock() < room.starts)
      fail(409, "A prova ainda não começou.");
    const config = JSON.parse(room.config);
    const member = db
      .prepare("SELECT * FROM room_members WHERE room=? AND player=?")
      .get(room.code, uid);
    if (member.forfeited)
      fail(409, "Sua participação nesta série foi encerrada.");
    if (member.score !== null) return { done: true, score: member.score };
    let progress = member.progress ? JSON.parse(member.progress) : null;
    if (!progress) {
      if (clock() > room.starts + 10000)
        fail(409, "Você não entrou a tempo nesta prova.");
      progress = {
        opened: clock(),
        issued: clock(),
        answers: [],
        feedback: null,
        timings: [],
        ticket: randomBytes(16).toString("hex"),
      };
      event(uid, "ranked_started");
    }
    const expired = clock() >= progress.opened + config.seconds * 1000;
    if (body.answer !== undefined && !expired) {
      const index = body.index;
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index > progress.answers.length
      )
        fail(409, "Atualize a rodada antes de responder.");
      const question = config.rounds[index];
      if (
        !question ||
        !Number.isInteger(body.answer) ||
        body.answer < 0 ||
        body.answer >= question.options.length
      )
        fail(400, "Resposta inválida.");
      if (index < progress.answers.length) {
        if (progress.answers[index] !== body.answer)
          fail(409, "Esta resposta já foi confirmada.");
      } else {
        if (config.competitiveVersion && body.ticket !== progress.ticket)
          fail(409, "Atualize a questão antes de responder.");
        if (clock() - progress.issued < 120)
          fail(400, "Espere a questão aparecer antes de responder.");
        (progress.timings ||= []).push(clock() - progress.issued);
        progress.ticket = randomBytes(16).toString("hex");
        progress.answers.push(body.answer);
        const correct = question.answer === body.answer;
        let combo = 0;
        for (
          let i = progress.answers.length - 1;
          i >= 0 && progress.answers[i] === config.rounds[i].answer;
          i--
        )
          combo++;
        progress.feedback = {
          correct,
          combo,
          message: correct
            ? "Acertou!"
            : "Resposta: " + question.options[question.answer],
          explanation: question.explanation || "",
        };
        progress.issued = clock();
      }
    }
    if (body.abandon === true) progress.stopReason = "gave_up";
    db.prepare(
      "UPDATE room_members SET progress=? WHERE room=? AND player=?",
    ).run(JSON.stringify(progress), room.code, uid);
    if (
      expired ||
      body.abandon === true ||
      progress.answers.length === config.rounds.length
    ) {
      const score = arcadeScore(config, progress.answers);
      db.prepare(
        "UPDATE room_members SET answers=?,score=?,finished=? WHERE room=? AND player=?",
      ).run(JSON.stringify(progress.answers), score, clock(), room.code, uid);
      return { done: true, score, feedback: progress.feedback };
    }
    return {
      done: false,
      index: progress.answers.length,
      total: config.rounds.length,
      ticket: progress.ticket,
      block: config.competitiveVersion
        ? Math.floor(progress.answers.length / 6) + 1
        : 1,
      question: publicArcade(config).rounds[progress.answers.length],
      remainingMs: Math.max(
        0,
        progress.opened + config.seconds * 1000 - clock(),
      ),
      feedback: progress.feedback,
    };
  };
  const leaders = () =>
    db
      .prepare(
        "SELECT p.id,p.name,p.avatar,r.rating,r.played,r.wins,r.draws FROM competitive_ratings r JOIN players p ON p.id=r.player WHERE r.played>0 ORDER BY r.rating DESC,p.id LIMIT 20",
      )
      .all()
      .map((r) => ({
        ...r,
        avatar:readAvatar(r.avatar),
        rank: ratingName(r.rating),
        provisional: r.played < 5,
      }));
  return { rating, settle, round, leaders, event, observe, pairCount };
}

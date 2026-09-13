import { modes, resultDetails } from "../shared/arcade.mjs";
import { mergeCampaign } from "../shared/progression.mjs";

export function persistence(db, clock) {
  db.exec(`CREATE TABLE IF NOT EXISTS campaign_progress (
    player TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    mode TEXT NOT NULL,unlocked INTEGER NOT NULL,best TEXT NOT NULL,updated INTEGER NOT NULL,
    PRIMARY KEY(player,mode));
    CREATE TABLE IF NOT EXISTS game_history (
    player TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    room TEXT NOT NULL,game_index INTEGER NOT NULL,mode TEXT NOT NULL,difficulty INTEGER NOT NULL,
    rules_version INTEGER NOT NULL,ranked INTEGER NOT NULL,score INTEGER NOT NULL,
    finished INTEGER NOT NULL,details TEXT NOT NULL,outcome TEXT NOT NULL,
    PRIMARY KEY(player,room,game_index));
    CREATE INDEX IF NOT EXISTS game_history_player_date ON game_history(player,finished DESC);`);
  db.exec(`CREATE TABLE IF NOT EXISTS competitive_attempts (
    player TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,room TEXT NOT NULL,game_index INTEGER NOT NULL,
    queued_ms INTEGER,elapsed_ms INTEGER,answered INTEGER NOT NULL,reason TEXT NOT NULL,created INTEGER NOT NULL,
    PRIMARY KEY(player,room,game_index));
    CREATE INDEX IF NOT EXISTS competitive_attempts_created ON competitive_attempts(created);`);
  const fail = (message) => {
    throw Object.assign(Error(message), { status: 400 });
  };
  const campaign = (uid, mode) => {
    const row = db
      .prepare(
        "SELECT unlocked,best,updated FROM campaign_progress WHERE player=? AND mode=?",
      )
      .get(uid, mode);
    return row
      ? { ...row, best: JSON.parse(row.best) }
      : { unlocked: 1, best: {}, updated: null };
  };
  const route = (path, method, uid, body) => {
    const match = path.match(/^\/v1\/campaign\/([a-z]+)$/);
    if (!match) return null;
    const mode = match[1];
    if (!modes.some((m) => m.id === mode)) fail("Jogo inválido.");
    if (method === "GET") return campaign(uid, mode);
    if (method !== "POST")
      throw Object.assign(Error("Método inválido."), { status: 405 });
    if (
      !Number.isInteger(body.unlocked) ||
      body.unlocked < 1 ||
      body.unlocked > 30 ||
      !body.best ||
      typeof body.best !== "object" ||
      Array.isArray(body.best) ||
      Object.keys(body.best).length > 30
    )
      fail("Progresso inválido.");
    for (const [level, score] of Object.entries(body.best))
      if (
        !/^(?:[1-9]|[12][0-9]|30)$/.test(level) ||
        !Number.isInteger(score) ||
        score < 0 ||
        score > 1000
      )
        fail("Resultado de fase inválido.");
    // Dados solo importados são mantidos separados de XP, moedas e rating.
    const merged = mergeCampaign(campaign(uid, mode), body);
    db.prepare(
      "INSERT INTO campaign_progress VALUES(?,?,?,?,?) ON CONFLICT(player,mode) DO UPDATE SET unlocked=excluded.unlocked,best=excluded.best,updated=excluded.updated",
    ).run(uid, mode, merged.unlocked, JSON.stringify(merged.best), clock());
    return { ...merged, updated: clock() };
  };
  const archive = (
    room,
    config,
    results,
    index = room.game_index,
    legacy = false,
  ) => {
    const high = Math.max(0, ...results.map((r) => r.score || 0));
    const leaders = results.filter((r) => r.score === high);
    for (const r of results) {
      if (room.ranked && !legacy && "progress" in r) {
        const progress = JSON.parse(r.progress || "{}");
        const answered = progress.answers?.length || 0;
        const reason = r.forfeited
          ? "left_series"
          : progress.stopReason ||
            (answered === config.rounds.length
              ? "completed"
              : progress.opened
                ? "time_limit"
                : "did_not_start");
        db.prepare(
          "INSERT OR IGNORE INTO competitive_attempts VALUES(?,?,?,?,?,?,?,?)",
        ).run(
          r.player,
          room.code,
          index,
          index === 0 ? Math.max(0, room.starts - (r.joined || room.created) - 5000) : null,
          progress.opened
            ? Math.max(
                0,
                Math.min(
                  config.seconds * 1000,
                  (r.finished || clock()) - progress.opened,
                ),
              )
            : null,
          answered,
          reason,
          clock(),
        );
        db.prepare("DELETE FROM competitive_attempts WHERE created<?").run(
          clock() - 90 * 86400000,
        );
      }
      const outcome =
        high === 0
          ? "void"
          : leaders.length > 1
            ? r.score === high
              ? "draw"
              : "loss"
            : r.score === high
              ? "win"
              : "loss";
      const details = legacy
        ? [
            "Resultado recuperado de uma sala anterior. Detalhes da prova indisponíveis.",
          ]
        : resultDetails(config, JSON.parse(r.answers || "[]"));
      db.prepare(
        "INSERT OR IGNORE INTO game_history VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      ).run(
        r.player,
        room.code,
        index,
        room.mode,
        config.difficulty,
        config.rulesVersion,
        room.ranked ? 1 : 0,
        r.score || 0,
        r.finished || clock(),
        JSON.stringify(details),
        outcome,
      );
    }
  };
  const backfill = () => {
    for (const room of db
      .prepare("SELECT * FROM rooms WHERE starts IS NOT NULL")
      .all()) {
      const config = JSON.parse(room.config),
        history = JSON.parse(room.history || "[]");
      const members = db
        .prepare(
          "SELECT player,score,finished,answers FROM room_members WHERE room=?",
        )
        .all(room.code);
      history.forEach((h, index) =>
        archive(
          room,
          config,
          members
            .filter((m) => h.scores[m.player] !== undefined)
            .map((m) => ({ ...m, score: h.scores[m.player] })),
          index,
          index !== room.game_index,
        ),
      );
      if (room.counted && !history.length) archive(room, config, members);
    }
  };
  return { route, archive, backfill };
}

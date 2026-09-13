import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
const db = new DatabaseSync(resolve(process.argv[2] || "data/duelou.sqlite"), {
  readOnly: true,
});
try {
  const since = Date.now() - 7 * 86400000;
  const rows = db
    .prepare(
      "SELECT name,COUNT(*) events,COUNT(DISTINCT player) players FROM product_events WHERE created>=? GROUP BY name ORDER BY name",
    )
    .all(since);
  const ratings = db
    .prepare(
      "SELECT COUNT(*) players,ROUND(AVG(played),1) average_series FROM competitive_ratings WHERE played>0",
    )
    .get();
  const returning = db
    .prepare(
      `WITH first_seen AS (SELECT player,MIN(created) first FROM product_events GROUP BY player)
 SELECT COUNT(*) eligible,
 SUM(EXISTS(SELECT 1 FROM product_events e WHERE e.player=f.player AND e.created>=f.first+86400000 AND e.created<f.first+2*86400000)) returned_next_day
 FROM first_seen f WHERE f.first<?`,
    )
    .get(Date.now() - 2 * 86400000);
  console.log(
    JSON.stringify(
      {
        window: "últimos 7 dias",
        events: rows,
        competitive: ratings,
        returning,
        completion: db
          .prepare(
            `SELECT h.mode,h.difficulty,h.rules_version,a.reason,COUNT(*) attempts,
          ROUND(AVG(a.queued_ms)) average_queue_ms,ROUND(AVG(a.elapsed_ms)) average_elapsed_ms,
          ROUND(AVG(a.answered),1) average_answered FROM competitive_attempts a JOIN game_history h
          ON h.player=a.player AND h.room=a.room AND h.game_index=a.game_index WHERE a.created>=?
          GROUP BY h.mode,h.difficulty,h.rules_version,a.reason`,
          )
          .all(since),
        calibration: db
          .prepare(
            `SELECT mode,difficulty,rules_version,COUNT(*) attempts,ROUND(AVG(score),1) average_score,
          ROUND(100.0*SUM(score=1000)/COUNT(*),1) perfect_percent,
          ROUND(100.0*SUM(outcome='draw')/COUNT(*),1) draw_percent,
          ROUND(100.0*SUM(outcome='void')/COUNT(*),1) void_percent
          FROM game_history WHERE ranked=1 AND finished>=? GROUP BY mode,difficulty,rules_version`,
          )
          .all(since),
        note: "Retorno contado a partir do primeiro evento registrado, não da instalação. Não inclui sessões offline. Motivos são estados observados pelo servidor, não explicações do jogador; tempos incluem comunicação com o servidor.",
      },
      null,
      2,
    ),
  );
} finally {
  db.close();
}

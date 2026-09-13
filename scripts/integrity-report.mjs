import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
const db = new DatabaseSync(resolve(process.argv[2] || "data/duelou.sqlite"), {
  readOnly: true,
});
try {
  console.log(
    JSON.stringify(
      {
        note: "Sinais para revisao humana; nao demonstram fraude nem aplicam sancoes.",
        signals: db
          .prepare(
            "SELECT player,room,kind,evidence,created FROM integrity_signals WHERE created>=? ORDER BY created DESC LIMIT 200",
          )
          .all(Date.now() - 90 * 86400000)
          .map((r) => ({ ...r, evidence: JSON.parse(r.evidence) })),
      },
      null,
      2,
    ),
  );
} finally {
  db.close();
}

// Histórico mínimo das partidas de PvP da Arena Rush — tabela própria,
// isolada, sem nenhuma coluna ou relação com rooms/room_members/
// competitive_ratings. Só um INSERT por partida terminada (natural ou por
// desistência); nada por tick, o motor (arena-match.mjs) é tudo em memória.

export function createArenaPersistence(db, clock = Date.now) {
  db.exec(`CREATE TABLE IF NOT EXISTS arena_matches (
    id TEXT PRIMARY KEY,
    player_a TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    player_b TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    winner TEXT,
    duration_seconds INTEGER NOT NULL,
    final_player_hp INTEGER NOT NULL,
    final_enemy_hp INTEGER NOT NULL,
    reason TEXT NOT NULL,
    created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS arena_matches_created ON arena_matches(created DESC);`);

  /**
   * Grava o resultado final de uma partida. `winner` é o id de playerA ou
   * playerB (nunca "player"/"enemy" — esses rótulos só existem dentro do
   * motor, não fazem sentido fora dele), ou null em caso de empate.
   * Idempotente: chamar de novo com o mesmo matchId não duplica a linha.
   */
  function recordMatch({
    matchId,
    playerA,
    playerB,
    winner,
    durationSeconds,
    finalPlayerHp,
    finalEnemyHp,
    reason,
  }) {
    db.prepare(
      "INSERT OR IGNORE INTO arena_matches VALUES(?,?,?,?,?,?,?,?,?)",
    ).run(
      matchId,
      playerA,
      playerB,
      winner ?? null,
      durationSeconds,
      finalPlayerHp,
      finalEnemyHp,
      reason,
      clock(),
    );
  }

  function getMatch(matchId) {
    return db.prepare("SELECT * FROM arena_matches WHERE id=?").get(matchId) ?? null;
  }

  return { recordMatch, getMatch };
}

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
    try {
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
    } catch (e) {
      // Uma conta pode ser excluída (DELETE /v1/me) enquanto ainda participa
      // de uma partida ativa — o disconnect que isso causa tenta gravar o
      // histórico normalmente, mas o id do jogador já não existe mais em
      // players, e o FOREIGN KEY falha. É uma situação legítima (não um bug
      // de estado), então só registra e segue: histórico é "nice to have",
      // não vale derrubar o servidor inteiro — e as partidas de todo mundo
      // junto — por uma linha que não pôde ser salva.
      console.warn(
        JSON.stringify({ event: "arena_match_record_failed", matchId, error: e.message }),
      );
    }
  }

  function getMatch(matchId) {
    return db.prepare("SELECT * FROM arena_matches WHERE id=?").get(matchId) ?? null;
  }

  return { recordMatch, getMatch };
}

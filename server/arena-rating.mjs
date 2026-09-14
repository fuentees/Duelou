// Classificação da Arena Rush — tabela própria, isolada, sem nenhuma coluna,
// relação ou importação de competitive_ratings/server/competitive.mjs/
// shared/competition.mjs. A patente competitiva do Duelou continua vindo
// exclusivamente da fila oficial e não é afetada por nada daqui: são dois
// modos diferentes, com regras diferentes, e misturá-los seria mentir sobre
// o que cada número mede.
//
// Por que existe: até aqui o PvP gravava a partida em arena_matches e mais
// nada — não havia vitória, derrota, sequência nem posição. Jogar dez
// partidas ou nenhuma dava exatamente o mesmo perfil, e um 1×1 sem placar
// que dure mais que a tela de resultado não é competitivo, é passatempo.

const START_RATING = 1000;
// K alto nas primeiras partidas (a nota encontra o lugar dela rápido) e
// menor depois, pra não sacudir a classificação de quem já tem histórico.
const PLACEMENT_MATCHES = 10;
const K_PLACEMENT = 40;
const K_NORMAL = 24;

function expectedScore(mine, theirs) {
  return 1 / (1 + 10 ** ((theirs - mine) / 400));
}

export function createArenaRating(db, clock = Date.now) {
  db.exec(`CREATE TABLE IF NOT EXISTS arena_ratings (
    player TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL,
    matches INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    draws INTEGER NOT NULL DEFAULT 0,
    streak INTEGER NOT NULL DEFAULT 0,
    best_streak INTEGER NOT NULL DEFAULT 0,
    best_combo INTEGER NOT NULL DEFAULT 0,
    updated INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS arena_ratings_rank ON arena_ratings(rating DESC);`);

  function row(uid) {
    return (
      db.prepare("SELECT * FROM arena_ratings WHERE player=?").get(uid) ?? {
        player: uid,
        rating: START_RATING,
        matches: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        streak: 0,
        best_streak: 0,
        best_combo: 0,
        updated: 0,
      }
    );
  }

  /** Ficha pública de um jogador: nota, cartel e sequência atual. */
  function statsFor(uid) {
    const r = row(uid);
    return {
      rating: r.rating,
      matches: r.matches,
      wins: r.wins,
      losses: r.losses,
      draws: r.draws,
      streak: r.streak,
      bestStreak: r.best_streak,
      bestCombo: r.best_combo,
      // Provisório enquanto não houver partidas suficientes: mostrar posição
      // de quem jogou uma vez só seria ruído, não classificação.
      placement: r.matches < PLACEMENT_MATCHES,
      placementRemaining: Math.max(0, PLACEMENT_MATCHES - r.matches),
    };
  }

  function save(r) {
    db.prepare(
      `INSERT INTO arena_ratings
         (player,rating,matches,wins,losses,draws,streak,best_streak,best_combo,updated)
       VALUES(?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(player) DO UPDATE SET
         rating=excluded.rating, matches=excluded.matches, wins=excluded.wins,
         losses=excluded.losses, draws=excluded.draws, streak=excluded.streak,
         best_streak=excluded.best_streak, best_combo=excluded.best_combo,
         updated=excluded.updated`,
    ).run(
      r.player,
      r.rating,
      r.matches,
      r.wins,
      r.losses,
      r.draws,
      r.streak,
      r.best_streak,
      r.best_combo,
      clock(),
    );
  }

  /**
   * Aplica o resultado de uma partida entre dois jogadores. `winner` é o id
   * de um deles ou null (empate). `combos` é opcional: `{ [uid]: maiorCombo }`
   * daquela partida, só pra guardar o recorde pessoal.
   *
   * Devolve `{ [uid]: { before, after, delta } }` pros dois lados, pra tela
   * de resultado poder mostrar quanto mudou.
   */
  function applyResult({ playerA, playerB, winner, combos = {} }) {
    if (!playerA || !playerB || playerA === playerB) return null;
    const rows = { [playerA]: row(playerA), [playerB]: row(playerB) };
    const before = { [playerA]: rows[playerA].rating, [playerB]: rows[playerB].rating };
    const scoreOf = (uid) => (winner === null ? 0.5 : winner === uid ? 1 : 0);

    for (const uid of [playerA, playerB]) {
      const other = uid === playerA ? playerB : playerA;
      const r = rows[uid];
      const k = r.matches < PLACEMENT_MATCHES ? K_PLACEMENT : K_NORMAL;
      const score = scoreOf(uid);
      r.rating = Math.max(
        0,
        Math.round(r.rating + k * (score - expectedScore(before[uid], before[other]))),
      );
      r.matches++;
      if (score === 1) {
        r.wins++;
        r.streak = Math.max(1, r.streak + 1);
      } else if (score === 0) {
        r.losses++;
        r.streak = Math.min(-1, r.streak - 1);
      } else {
        r.draws++;
        r.streak = 0;
      }
      r.best_streak = Math.max(r.best_streak, r.streak);
      r.best_combo = Math.max(r.best_combo, Math.round(combos[uid] ?? 0));
      save(r);
    }

    return Object.fromEntries(
      [playerA, playerB].map((uid) => [
        uid,
        { before: before[uid], after: rows[uid].rating, delta: rows[uid].rating - before[uid] },
      ]),
    );
  }

  /** Melhores da Arena. Quem ainda está em colocação não aparece. */
  function leaderboard(limit = 20) {
    return db
      .prepare(
        `SELECT p.id, p.name, r.rating, r.wins, r.losses, r.draws, r.best_streak bestStreak
           FROM arena_ratings r JOIN players p ON p.id = r.player
          WHERE r.matches >= ?
          ORDER BY r.rating DESC, r.wins DESC, p.name ASC
          LIMIT ?`,
      )
      .all(PLACEMENT_MATCHES, Math.min(100, Math.max(1, limit)));
  }

  /**
   * Últimas partidas de um jogador, já na perspectiva dele (venceu/perdeu/
   * empatou, contra quem, quanto ficou o placar das bases).
   */
  function historyFor(uid, limit = 20) {
    return db
      .prepare(
        `SELECT m.id, m.created, m.winner, m.reason, m.friendly, m.duration_seconds durationSeconds,
                m.player_a playerA, m.final_player_hp finalPlayerHp, m.final_enemy_hp finalEnemyHp,
                pa.name nameA, pb.name nameB, m.player_b playerB
           FROM arena_matches m
           LEFT JOIN players pa ON pa.id = m.player_a
           LEFT JOIN players pb ON pb.id = m.player_b
          WHERE m.player_a = ? OR m.player_b = ?
          ORDER BY m.created DESC LIMIT ?`,
      )
      .all(uid, uid, Math.min(50, Math.max(1, limit)))
      .map((m) => {
        const iAmA = m.playerA === uid;
        return {
          id: m.id,
          created: m.created,
          opponent: (iAmA ? m.nameB : m.nameA) ?? "Jogador removido",
          outcome: m.winner === null ? "draw" : m.winner === uid ? "win" : "loss",
          reason: m.reason,
          friendly: !!m.friendly,
          durationSeconds: m.durationSeconds,
          myBaseHp: iAmA ? m.finalPlayerHp : m.finalEnemyHp,
          theirBaseHp: iAmA ? m.finalEnemyHp : m.finalPlayerHp,
        };
      });
  }

  return { statsFor, applyResult, leaderboard, historyFor, START_RATING, PLACEMENT_MATCHES };
}

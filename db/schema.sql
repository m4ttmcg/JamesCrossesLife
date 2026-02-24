CREATE TABLE IF NOT EXISTS leaderboard_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_name TEXT NOT NULL,
  score INTEGER NOT NULL,
  difficulty TEXT NOT NULL,
  time_ms INTEGER NOT NULL,
  is_win INTEGER NOT NULL DEFAULT 0,
  run_date TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_rank
ON leaderboard_scores (score DESC, time_ms ASC, created_at ASC);


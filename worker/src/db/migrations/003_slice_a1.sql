-- Slice A.1: report and block. Idempotent; apply with
--   node scripts/migrate.mjs --local     (or --remote)

CREATE TABLE IF NOT EXISTS blocks (
  user_id    TEXT NOT NULL,
  blocked_id TEXT NOT NULL,
  created    INTEGER NOT NULL,
  PRIMARY KEY (user_id, blocked_id)
);
CREATE INDEX IF NOT EXISTS blocks_blocked ON blocks(blocked_id);

CREATE TABLE IF NOT EXISTS reports (
  id          TEXT PRIMARY KEY,
  group_id    TEXT NOT NULL,
  reporter_id TEXT NOT NULL,
  reported_id TEXT NOT NULL,
  reason      TEXT NOT NULL,
  created     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS reports_created ON reports(created);

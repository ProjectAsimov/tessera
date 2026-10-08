-- Slice A: multi-event tasks, freeze/repair entries, wallet, shoutouts.
-- Do not run directly on a database that already has these columns: use
--   node scripts/migrate.mjs --local     (or --remote)
-- which skips ALTER statements whose column already exists.

ALTER TABLE tasks ADD COLUMN target INTEGER NOT NULL DEFAULT 1;
ALTER TABLE entries ADD COLUMN n INTEGER NOT NULL DEFAULT 1;
ALTER TABLE entries ADD COLUMN kind INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN gems INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN freezes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN milestones TEXT NOT NULL DEFAULT '[]';
ALTER TABLE users ADD COLUMN wallet_updated INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS shoutouts (
  group_id TEXT NOT NULL,
  from_id  TEXT NOT NULL,
  to_id    TEXT NOT NULL,
  day      TEXT NOT NULL,            -- YYYY-MM-DD, the sender's local date
  PRIMARY KEY (group_id, from_id, to_id, day)
);
CREATE INDEX IF NOT EXISTS shoutouts_to ON shoutouts(group_id, to_id, day);

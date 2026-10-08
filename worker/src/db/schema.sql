-- TaskTracker D1 schema. Apply with:
--   npx wrangler d1 execute tasktracker --local  --file src/db/schema.sql
--   npx wrangler d1 execute tasktracker --remote --file src/db/schema.sql

CREATE TABLE IF NOT EXISTS users (
  id      TEXT PRIMARY KEY,          -- Google sub
  name    TEXT NOT NULL DEFAULT '',
  email   TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL,          -- ms since epoch
  gems           INTEGER NOT NULL DEFAULT 0,   -- wallet (Slice A), merged by wallet_updated
  freezes        INTEGER NOT NULL DEFAULT 0,
  milestones     TEXT NOT NULL DEFAULT '[]',   -- JSON array of "<taskId>:<n>" keys
  wallet_updated INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tasks (
  id       TEXT PRIMARY KEY,         -- client UUID
  owner_id TEXT NOT NULL REFERENCES users(id),
  name     TEXT NOT NULL,
  color    TEXT NOT NULL,
  icon     TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  group_id TEXT,
  created  INTEGER NOT NULL,
  updated  INTEGER NOT NULL,         -- drives merge (newest wins)
  deleted  INTEGER NOT NULL DEFAULT 0, -- soft delete; still syncs so removals reach other devices
  target   INTEGER NOT NULL DEFAULT 1   -- events per day (Slice A)
);
CREATE INDEX IF NOT EXISTS tasks_owner ON tasks(owner_id);

CREATE TABLE IF NOT EXISTS entries (
  task_id TEXT NOT NULL REFERENCES tasks(id),
  day     TEXT NOT NULL,             -- YYYY-MM-DD
  on_     INTEGER NOT NULL,          -- 0/1; 0 is a tombstone ("on" is a SQL keyword)
  t       INTEGER NOT NULL,          -- ms; drives merge (newest wins)
  n       INTEGER NOT NULL DEFAULT 1, -- events logged that day (Slice A)
  kind    INTEGER NOT NULL DEFAULT 0, -- 0 normal, 1 freeze, 2 repair
  PRIMARY KEY (task_id, day)
);

-- Phase 2 (no routes yet; created now so no migration is needed later).
CREATE TABLE IF NOT EXISTS groups (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  host_id      TEXT NOT NULL REFERENCES users(id),
  invite_code  TEXT NOT NULL UNIQUE,
  member_limit INTEGER NOT NULL DEFAULT 50,
  created      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  group_id TEXT NOT NULL REFERENCES groups(id),
  user_id  TEXT NOT NULL REFERENCES users(id),
  task_id  TEXT NOT NULL REFERENCES tasks(id),
  joined   INTEGER NOT NULL,
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS memberships_user ON memberships(user_id);

-- Slice A: shoutouts (one per from/to/day within a group).
CREATE TABLE IF NOT EXISTS shoutouts (
  group_id TEXT NOT NULL,
  from_id  TEXT NOT NULL,
  to_id    TEXT NOT NULL,
  day      TEXT NOT NULL,            -- YYYY-MM-DD, the sender's local date
  PRIMARY KEY (group_id, from_id, to_id, day)
);
CREATE INDEX IF NOT EXISTS shoutouts_to ON shoutouts(group_id, to_id, day);

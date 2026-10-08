-- Slice C: Web Push subscriptions. Idempotent; apply with
--   node scripts/migrate.mjs --local     (or --remote)

CREATE TABLE IF NOT EXISTS push_subs (
  endpoint          TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL,
  p256dh            TEXT NOT NULL,
  auth              TEXT NOT NULL,
  tz                TEXT NOT NULL,                 -- IANA zone, e.g. America/Chicago
  reminder_hour     INTEGER,                       -- 0-23 local hour, NULL = no daily reminder
  weekly            INTEGER NOT NULL DEFAULT 1,
  last_reminder_day TEXT,                          -- local YYYY-MM-DD of the last reminder
  last_weekly_day   TEXT,                          -- local YYYY-MM-DD of the last weekly recap
  created           INTEGER NOT NULL,
  failures          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS push_subs_user ON push_subs(user_id);

CREATE TABLE IF NOT EXISTS member_reply_snapshots (
  line_key TEXT PRIMARY KEY,
  membership_status TEXT NOT NULL,
  membership_level TEXT NOT NULL,
  membership_label TEXT NOT NULL,
  membership_lifecycle TEXT NOT NULL,
  membership_expire_at TEXT NOT NULL,
  membership_verified_at TEXT,
  points_status TEXT NOT NULL,
  points_balance INTEGER,
  points_verified_at TEXT,
  points_valid_until TEXT,
  source_authority TEXT NOT NULL,
  refreshed_at TEXT NOT NULL,
  refresh_generation INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS member_reply_refresh_queue (
  line_key TEXT PRIMARY KEY,
  line_user_id TEXT NOT NULL,
  generation INTEGER NOT NULL DEFAULT 1,
  reason TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS member_reply_refresh_due
  ON member_reply_refresh_queue (next_attempt_at);

CREATE TABLE IF NOT EXISTS member_reply_daily_rebuilds (
  bangkok_date TEXT PRIMARY KEY,
  queued_at TEXT NOT NULL,
  line_count INTEGER NOT NULL
);

ALTER TABLE mmd_blackcard_companion_preferences ADD COLUMN member_record_id TEXT;
ALTER TABLE mmd_blackcard_companion_preferences ADD COLUMN review_revision_hash TEXT;
ALTER TABLE mmd_blackcard_companion_preferences ADD COLUMN review_mirrored_revision_hash TEXT;
ALTER TABLE mmd_blackcard_companion_preferences ADD COLUMN retention_redacted_at TEXT;
ALTER TABLE mmd_blackcard_companion_preferences ADD COLUMN retention_mirrored_at TEXT;
ALTER TABLE mmd_blackcard_companion_preferences ADD COLUMN last_maintenance_at TEXT;
ALTER TABLE mmd_blackcard_companion_preferences ADD COLUMN maintenance_error TEXT;

CREATE TABLE mmd_blackcard_companion_lifecycle_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL REFERENCES mmd_blackcard_companion_preferences(request_id),
  event_type TEXT NOT NULL CHECK (event_type IN ('review_reconciled', 'retention_redacted', 'retention_mirrored', 'hold_placed', 'hold_released')),
  revision_hash TEXT NOT NULL,
  actor_hash TEXT,
  from_status TEXT,
  to_status TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(request_id, event_type, revision_hash)
);

CREATE TABLE mmd_blackcard_companion_retention_holds (
  request_id TEXT PRIMARY KEY NOT NULL REFERENCES mmd_blackcard_companion_preferences(request_id),
  hold_id TEXT NOT NULL UNIQUE,
  hold_until TEXT NOT NULL,
  actor_hash TEXT NOT NULL,
  reason_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  released_at TEXT
);
CREATE INDEX idx_blackcard_preference_maintenance ON mmd_blackcard_companion_preferences(last_maintenance_at, retention_expires_at);

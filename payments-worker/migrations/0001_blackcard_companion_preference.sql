CREATE TABLE IF NOT EXISTS mmd_blackcard_companion_preferences (
  request_id TEXT NOT NULL PRIMARY KEY,
  member_id TEXT NOT NULL,
  line_user_id_hash TEXT NOT NULL DEFAULT '',
  correlation_hash TEXT NOT NULL,
  source_session_id_hash TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  payload_hash TEXT NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('first_companion_preference', 'companion_change_request')),
  companion_preference TEXT NOT NULL CHECK (companion_preference IN ('hito', 'hima', 'hiro', 'hiei')),
  experience_preferences_json TEXT NOT NULL DEFAULT '[]',
  note TEXT NOT NULL DEFAULT '',
  change_reason TEXT NOT NULL DEFAULT '',
  current_companion_snapshot TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending_review', 'in_review', 'recorded', 'needs_follow_up', 'declined', 'cancelled')),
  audit_event_id TEXT NOT NULL UNIQUE,
  reviewed_by TEXT,
  review_note TEXT,
  reviewed_at TEXT,
  retention_expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_blackcard_preference_member_updated
  ON mmd_blackcard_companion_preferences (member_id, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_blackcard_preference_single_initial
  ON mmd_blackcard_companion_preferences (member_id)
  WHERE request_type = 'first_companion_preference';

CREATE TABLE IF NOT EXISTS mmd_blackcard_companion_audit_outbox (
  event_id TEXT NOT NULL PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL CHECK (event_type = 'blackcard.companion_preference.requested'),
  member_id_hash TEXT NOT NULL,
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  delivery_status TEXT NOT NULL CHECK (delivery_status IN ('pending', 'delivered', 'retry_required', 'dead_letter')),
  delivered_at TEXT,
  sync_lock_token TEXT,
  sync_lock_until TEXT,
  FOREIGN KEY (request_id) REFERENCES mmd_blackcard_companion_preferences (request_id)
);

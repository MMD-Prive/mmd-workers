-- HYPE Preview Intake v1
-- Campaign: preview_pride_jun2026
-- Source of truth: Cloudflare D1
-- Points are NOT credited when code is issued. Credit only after signup + payment verification.

CREATE TABLE IF NOT EXISTS hype_campaigns (
  campaign_id TEXT PRIMARY KEY,
  campaign_name TEXT NOT NULL,
  campaign_layer TEXT NOT NULL DEFAULT 'HYPE Preview Intake',
  promo_kind TEXT NOT NULL DEFAULT 'new_member_points_bonus',

  preview_channel_handle TEXT,
  preview_channel_id TEXT,
  bot_handle TEXT,

  issue_starts_at TEXT,
  issue_ends_at TEXT,
  signup_deadline TEXT,
  booking_advance_days_from_signup INTEGER NOT NULL DEFAULT 90,

  max_bonus_points INTEGER NOT NULL DEFAULT 350,

  standard_points INTEGER NOT NULL DEFAULT 150,
  premium_points INTEGER NOT NULL DEFAULT 250,
  blackcard_points INTEGER NOT NULL DEFAULT 350,

  new_member_only INTEGER NOT NULL DEFAULT 1,
  one_time_use INTEGER NOT NULL DEFAULT 1,
  verification_required_before_credit INTEGER NOT NULL DEFAULT 1,

  public_offer_headline_th TEXT,
  public_small_print_th TEXT,

  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'paused', 'ended', 'archived')),

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS hype_preview_codes (
  id TEXT PRIMARY KEY,

  campaign_id TEXT NOT NULL,
  promo_kind TEXT NOT NULL DEFAULT 'new_member_points_bonus',

  -- Never store the raw code as plain text.
  -- code_hash = HMAC-SHA256(campaign_id + ":" + code)
  -- code_enc = AES-GCM encrypted 6-digit code so HYPE can re-send the same code to the same Telegram user.
  code_hash TEXT NOT NULL,
  code_enc TEXT,
  code_last2 TEXT,

  telegram_user_id TEXT NOT NULL,
  telegram_username TEXT,
  telegram_first_name TEXT,
  telegram_last_name TEXT,
  telegram_language_code TEXT,

  source TEXT NOT NULL DEFAULT 'telegram_preview',
  source_payload TEXT,
  preview_channel_verified INTEGER NOT NULL DEFAULT 0,
  preview_channel_verified_at TEXT,

  status TEXT NOT NULL DEFAULT 'issued'
    CHECK (status IN (
      'issued',
      'pending_signup',
      'pending_payment',
      'pending_verification',
      'credited',
      'rejected_existing_member',
      'rejected_blackcard_not_approved',
      'already_redeemed',
      'expired',
      'revoked'
    )),

  eligible_packages TEXT NOT NULL DEFAULT 'standard,premium,blackcard',
  selected_package TEXT
    CHECK (selected_package IS NULL OR selected_package IN ('standard', 'premium', 'blackcard')),

  max_bonus_points INTEGER NOT NULL DEFAULT 350,
  pending_bonus_points INTEGER,
  credited_points INTEGER,

  new_member_only INTEGER NOT NULL DEFAULT 1,
  one_time_use INTEGER NOT NULL DEFAULT 1,

  memberstack_id TEXT,
  client_record_id TEXT,
  client_name TEXT,
  client_email_hash TEXT,
  client_phone_hash TEXT,

  signup_started_at TEXT,
  payment_ref TEXT,
  payment_verified_at TEXT,
  redeemed_at TEXT,
  credited_at TEXT,

  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  rejection_reason TEXT,
  admin_note TEXT,

  FOREIGN KEY (campaign_id) REFERENCES hype_campaigns(campaign_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hype_preview_codes_campaign_code
ON hype_preview_codes (campaign_id, code_hash);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hype_preview_codes_campaign_telegram
ON hype_preview_codes (campaign_id, telegram_user_id);

CREATE INDEX IF NOT EXISTS idx_hype_preview_codes_status
ON hype_preview_codes (campaign_id, status);

CREATE INDEX IF NOT EXISTS idx_hype_preview_codes_memberstack
ON hype_preview_codes (campaign_id, memberstack_id);

CREATE TABLE IF NOT EXISTS hype_preview_code_events (
  id TEXT PRIMARY KEY,
  code_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,

  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'code_issued',
      'code_reissued_to_same_user',
      'preview_channel_verified',
      'signup_started',
      'package_selected',
      'payment_pending',
      'payment_verified',
      'new_member_verified',
      'blackcard_approved',
      'points_pending',
      'points_credited',
      'rejected_existing_member',
      'rejected_blackcard_not_approved',
      'code_expired',
      'code_revoked',
      'validation_failed',
      'admin_note'
    )),

  old_status TEXT,
  new_status TEXT,

  package TEXT,
  points INTEGER,

  actor_type TEXT NOT NULL DEFAULT 'system'
    CHECK (actor_type IN ('hype', 'system', 'admin', 'payment_worker', 'member_worker')),

  actor_id TEXT,
  metadata_json TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (code_id) REFERENCES hype_preview_codes(id),
  FOREIGN KEY (campaign_id) REFERENCES hype_campaigns(campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_hype_preview_code_events_code_id
ON hype_preview_code_events (code_id);

CREATE INDEX IF NOT EXISTS idx_hype_preview_code_events_campaign
ON hype_preview_code_events (campaign_id, event_type);

INSERT OR REPLACE INTO hype_campaigns (
  campaign_id,
  campaign_name,
  campaign_layer,
  promo_kind,
  preview_channel_handle,
  preview_channel_id,
  bot_handle,
  issue_starts_at,
  issue_ends_at,
  signup_deadline,
  booking_advance_days_from_signup,
  max_bonus_points,
  standard_points,
  premium_points,
  blackcard_points,
  public_offer_headline_th,
  public_small_print_th,
  status,
  updated_at
) VALUES (
  'preview_pride_jun2026',
  'Pride Month Telegram Preview New Member Points',
  'HYPE Preview Intake',
  'new_member_points_bonus',
  '@MMDPriveTH',
  '-1002393788585',
  '@mmdprivebot',
  '2026-06-01T00:00:00+07:00',
  '2026-06-30T23:59:59+07:00',
  '2026-06-30T23:59:59+07:00',
  90,
  350,
  150,
  250,
  350,
  'รับรหัส 6 หลักผ่าน Telegram Preview เพื่อใช้รับ POINTS พิเศษ สูงสุดถึง 350 POINTS',
  'สำหรับสมาชิกใหม่เท่านั้น • ใช้ได้ 1 สิทธิ์ต่อบัญชี • Black Card สำหรับผู้ที่ผ่านการพิจารณาเท่านั้น • POINTS จะได้รับหลังการสมัครและการชำระเงินผ่านการตรวจสอบเรียบร้อย',
  'active',
  datetime('now')
);

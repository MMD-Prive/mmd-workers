// HYPE Preview Intake v1
// Campaign: preview_pride_jun2026
// Purpose: issue 6-digit personal codes from Telegram Preview and track new-member points bonus.
// Important: this module issues and tracks points eligibility. It does NOT credit points at code issue time.

import { HttpError } from "./http.js";

const ENC = new TextEncoder();
const DEC = new TextDecoder();

const DEFAULT_CAMPAIGN = "preview_pride_jun2026";
const DEFAULT_PROMO_KIND = "new_member_points_bonus";

const ALLOWED_PACKAGES = new Set(["standard", "premium", "blackcard"]);

function nowISO() {
  return new Date().toISOString();
}

function toInt(v, fallback = 0) {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : fallback;
}

function str(v) {
  return String(v ?? "").trim();
}

function normalizeCampaign(v, env) {
  return str(v || env.HYPE_PREVIEW_CAMPAIGN || DEFAULT_CAMPAIGN);
}

function normalizePackage(v) {
  const s = str(v).toLowerCase().replace(/[-\s]/g, "_");
  const map = {
    standard: "standard",
    std: "standard",
    premium: "premium",
    prem: "premium",
    black: "blackcard",
    black_card: "blackcard",
    blackcard: "blackcard",
  };
  return map[s] || "";
}

function getPointsRules(env) {
  return {
    standard: toInt(env.HYPE_PREVIEW_STANDARD_POINTS, 150),
    premium: toInt(env.HYPE_PREVIEW_PREMIUM_POINTS, 250),
    blackcard: toInt(env.HYPE_PREVIEW_BLACKCARD_POINTS, 350),
    max: toInt(env.HYPE_PREVIEW_MAX_POINTS, 350),
  };
}

function pointsForPackage(pkg, env) {
  const rules = getPointsRules(env);
  if (!ALLOWED_PACKAGES.has(pkg)) return 0;
  return Math.min(rules[pkg], rules.max);
}

function addDaysISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function getCodeExpiresAt(env) {
  const explicit = str(env.HYPE_PREVIEW_CODE_EXPIRES_AT || env.HYPE_PREVIEW_SIGNUP_DEADLINE);
  if (explicit) return explicit;
  return addDaysISO(toInt(env.HYPE_PREVIEW_CODE_TTL_DAYS, 30));
}

function assertDb(env) {
  if (!env.HYPE_DB) {
    throw new HttpError(500, { ok: false, error: "missing_hype_db_binding" });
  }
}

function assertSecrets(env) {
  if (!env.HYPE_CODE_HMAC_SECRET) {
    throw new HttpError(500, { ok: false, error: "missing_hype_code_hmac_secret" });
  }
  if (!env.HYPE_CODE_ENCRYPTION_SECRET) {
    throw new HttpError(500, { ok: false, error: "missing_hype_code_encryption_secret" });
  }
}

function hex(buf) {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function b64url(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromB64url(s) {
  const padded = String(s).replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(String(s).length / 4) * 4, "=");
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    ENC.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, ENC.encode(message));
  return hex(sig);
}

async function codeHash(campaignId, code, env) {
  assertSecrets(env);
  return hmacHex(env.HYPE_CODE_HMAC_SECRET, `${campaignId}:${String(code).trim()}`);
}

async function aesKey(secret) {
  const digest = await crypto.subtle.digest("SHA-256", ENC.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptCode(code, env) {
  assertSecrets(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await aesKey(env.HYPE_CODE_ENCRYPTION_SECRET);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, ENC.encode(code));
  return `${b64url(iv)}.${b64url(new Uint8Array(ciphertext))}`;
}

async function decryptCode(codeEnc, env) {
  if (!codeEnc) return "";
  try {
    const [ivRaw, ctRaw] = String(codeEnc).split(".");
    if (!ivRaw || !ctRaw) return "";
    const iv = fromB64url(ivRaw);
    const ciphertext = fromB64url(ctRaw);
    const key = await aesKey(env.HYPE_CODE_ENCRYPTION_SECRET);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return DEC.decode(plain);
  } catch {
    return "";
  }
}

function generateSixDigitCode() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(bytes[0] % 1000000).padStart(6, "0");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function telegramApi(method, payload, env) {
  if (!env.TELEGRAM_BOT_TOKEN) {
    return { ok: false, skipped: true, reason: "missing_telegram_bot_token" };
  }

  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    return { ok: false, status: res.status, error: data };
  }
  return { ok: true, result: data.result };
}

async function sendMessage(chatId, text, env, replyMarkup = null) {
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return telegramApi("sendMessage", payload, env);
}

async function verifyPreviewChannelMembership(telegramUserId, env) {
  if (!env.TELEGRAM_PREVIEW_CHANNEL_ID) {
    return { ok: false, skipped: true, reason: "missing_preview_channel_id" };
  }

  const tg = await telegramApi("getChatMember", {
    chat_id: env.TELEGRAM_PREVIEW_CHANNEL_ID,
    user_id: telegramUserId,
  }, env);

  if (!tg.ok) return { ok: false, detail: tg };
  const status = String(tg.result?.status || "");
  return {
    ok: !["left", "kicked"].includes(status),
    status,
    raw: tg.result,
  };
}

function extractStartPayload(text) {
  const t = str(text);
  const m = t.match(/^\/start(?:@\w+)?(?:\s+(.+))?$/i);
  return m ? str(m[1]) : "";
}

function hypeWelcomeText() {
  return [
    "เข้าสู่ระบบเรียบร้อยครับ 🟡",
    "",
    "ผมจะออกโค้ดส่วนตัว 6 หลักให้ทันที",
    "โค้ดนี้สำหรับสมาชิกใหม่ ใช้รับพอยท์พิเศษตามแพ็กเกจที่สมัคร",
    "",
    "Standard ได้ 150 Points",
    "Premium ได้ 250 Points",
    "",
    "Black Card เปิดรับโดยการพิจารณาเป็นรายบุคคลเท่านั้น ไม่ใช่แพ็กเกจที่เลือกสมัครได้ทั่วไปนะครับ",
    "พอยท์จะได้รับหลังการสมัครและการชำระเงินผ่านการตรวจสอบเรียบร้อยนะครับ",
  ].join("\n");
}

function codeIssuedText(code) {
  return [
    "รหัสของคุณคือ 🔐",
    "",
    `<code>${escapeHtml(code)}</code>`,
    "",
    "ใช้สำหรับสมัครสมาชิกใหม่ 1 ครั้ง",
    "",
    "Standard ได้ 150 Points",
    "Premium ได้ 250 Points",
    "Black Card — เปิดรับโดยการพิจารณาเท่านั้น ไม่ใช่แพ็กเกจซื้อทั่วไปครับ",
    "",
    "พอยท์จะได้รับหลังระบบตรวจสอบเรียบร้อยนะครับ",
  ].join("\n");
}

function joinPreviewText() {
  return [
    "ผมยังไม่พบสิทธิ์ Preview ของคุณครับ",
    "",
    "กดเข้าห้อง Preview ก่อน แล้วกลับมากดตรวจสอบอีกครั้งนะครับ",
  ].join("\n");
}

function alreadyIssuedText(code) {
  const codeLine = code ? `<code>${escapeHtml(code)}</code>` : "รหัสเดิมของคุณยังถูกบันทึกอยู่ครับ";
  return [
    "คุณมีรหัสส่วนตัวอยู่แล้วครับ",
    "",
    codeLine,
    "",
    "ใช้สำหรับสมัครสมาชิกใหม่ 1 ครั้ง",
    "พอยท์จะได้รับหลังการสมัครและการชำระเงินผ่านการตรวจสอบเรียบร้อย",
  ].join("\n");
}

function signupUrl(code, campaignId, env) {
  const base = str(env.HYPE_PREVIEW_SIGNUP_URL || "https://mmdbkk.com/trust/inme");
  const url = new URL(base);
  url.searchParams.set("promo", code);
  url.searchParams.set("src", "telegram_preview");
  url.searchParams.set("campaign", campaignId);
  return url.toString();
}

function inlineButtons(code, campaignId, env) {
  return {
    inline_keyboard: [
      [{ text: "สมัครสมาชิกใหม่", url: signupUrl(code, campaignId, env) }],
      [{ text: "ดูแพ็กเกจ", url: str(env.HYPE_PREVIEW_PACKAGES_URL || "https://mmdbkk.com/member/membership") }],
      [{ text: "กลับไป Preview Channel", url: str(env.HYPE_PREVIEW_CHANNEL_URL || "https://t.me/MMDPriveTH") }],
    ],
  };
}

function joinPreviewButtons(env) {
  const campaign = str(env.HYPE_PREVIEW_CAMPAIGN || DEFAULT_CAMPAIGN);
  return {
    inline_keyboard: [
      [{ text: "เข้าห้อง Preview", url: str(env.HYPE_PREVIEW_CHANNEL_URL || "https://t.me/MMDPriveTH") }],
      [{ text: "ตรวจสอบอีกครั้ง", url: `https://t.me/mmdprivebot?start=${encodeURIComponent(campaign)}` }],
    ],
  };
}

async function findExistingForTelegram(env, campaignId, telegramUserId) {
  return env.HYPE_DB.prepare(
    `SELECT * FROM hype_preview_codes
     WHERE campaign_id = ? AND telegram_user_id = ?
     LIMIT 1`,
  ).bind(campaignId, String(telegramUserId)).first();
}

async function findByPromo(env, campaignId, promo) {
  const hash = await codeHash(campaignId, promo, env);
  return env.HYPE_DB.prepare(
    `SELECT * FROM hype_preview_codes
     WHERE campaign_id = ? AND code_hash = ?
     LIMIT 1`,
  ).bind(campaignId, hash).first();
}

async function logEvent(env, event) {
  const id = crypto.randomUUID();
  await env.HYPE_DB.prepare(
    `INSERT INTO hype_preview_code_events (
      id, code_id, campaign_id, event_type, old_status, new_status,
      package, points, actor_type, actor_id, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    event.code_id,
    event.campaign_id,
    event.event_type,
    event.old_status || null,
    event.new_status || null,
    event.package || null,
    event.points ?? null,
    event.actor_type || "system",
    event.actor_id || null,
    event.metadata_json ? JSON.stringify(event.metadata_json) : null,
    nowISO(),
  ).run();
}

async function issueCodeForTelegramUser({ update, payload, env }) {
  assertDb(env);
  assertSecrets(env);

  const campaignId = normalizeCampaign(payload, env);
  const message = update.message || {};
  const from = message.from || {};
  const chatId = message.chat?.id;
  const telegramUserId = String(from.id || "");

  if (!telegramUserId || !chatId) {
    return { handled: false, reason: "missing_telegram_identity" };
  }

  const requireMembership = str(env.HYPE_REQUIRE_PREVIEW_MEMBERSHIP) === "1";
  let verified = { ok: false, skipped: true };
  if (env.TELEGRAM_PREVIEW_CHANNEL_ID) {
    verified = await verifyPreviewChannelMembership(telegramUserId, env);
  }

  if (requireMembership && !verified.ok) {
    await sendMessage(chatId, joinPreviewText(), env, joinPreviewButtons(env));
    return { handled: true, action: "preview_membership_required", verified };
  }

  const existing = await findExistingForTelegram(env, campaignId, telegramUserId);
  if (existing) {
    const existingCode = await decryptCode(existing.code_enc, env);
    await sendMessage(chatId, alreadyIssuedText(existingCode), env, existingCode ? inlineButtons(existingCode, campaignId, env) : joinPreviewButtons(env));
    await logEvent(env, {
      code_id: existing.id,
      campaign_id: campaignId,
      event_type: "code_reissued_to_same_user",
      old_status: existing.status,
      new_status: existing.status,
      actor_type: "hype",
      actor_id: telegramUserId,
      metadata_json: { payload, verified },
    });
    return { handled: true, action: "code_reissued_to_same_user", code_id: existing.id };
  }

  let code = "";
  let hash = "";
  for (let i = 0; i < 8; i += 1) {
    code = generateSixDigitCode();
    hash = await codeHash(campaignId, code, env);
    const collision = await env.HYPE_DB.prepare(
      `SELECT id FROM hype_preview_codes WHERE campaign_id = ? AND code_hash = ? LIMIT 1`,
    ).bind(campaignId, hash).first();
    if (!collision) break;
  }

  if (!code || !hash) {
    throw new HttpError(500, { ok: false, error: "code_generation_failed" });
  }

  const id = crypto.randomUUID();
  const codeEnc = await encryptCode(code, env);
  const expiresAt = getCodeExpiresAt(env);
  const verifiedAt = verified.ok ? nowISO() : null;

  await env.HYPE_DB.prepare(
    `INSERT INTO hype_preview_codes (
      id, campaign_id, promo_kind, code_hash, code_enc, code_last2,
      telegram_user_id, telegram_username, telegram_first_name, telegram_last_name, telegram_language_code,
      source, source_payload, preview_channel_verified, preview_channel_verified_at,
      status, eligible_packages, max_bonus_points,
      new_member_only, one_time_use, issued_at, expires_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    campaignId,
    DEFAULT_PROMO_KIND,
    hash,
    codeEnc,
    code.slice(-2),
    telegramUserId,
    from.username || null,
    from.first_name || null,
    from.last_name || null,
    from.language_code || null,
    "telegram_preview",
    payload || null,
    verified.ok ? 1 : 0,
    verifiedAt,
    "issued",
    "standard,premium,blackcard",
    getPointsRules(env).max,
    1,
    1,
    nowISO(),
    expiresAt,
    nowISO(),
  ).run();

  await logEvent(env, {
    code_id: id,
    campaign_id: campaignId,
    event_type: "code_issued",
    new_status: "issued",
    actor_type: "hype",
    actor_id: telegramUserId,
    metadata_json: { payload, verified, username: from.username || null },
  });

  await sendMessage(chatId, hypeWelcomeText(), env);
  await sendMessage(chatId, codeIssuedText(code), env, inlineButtons(code, campaignId, env));

  return {
    handled: true,
    action: "code_issued",
    code_id: id,
    campaign_id: campaignId,
    telegram_user_id: telegramUserId,
    preview_channel_verified: Boolean(verified.ok),
  };
}

export async function handleTelegramWebhook(update, env) {
  const text = update?.message?.text || "";
  const payload = extractStartPayload(text);
  const expectedCampaign = normalizeCampaign(env.HYPE_PREVIEW_CAMPAIGN || DEFAULT_CAMPAIGN, env);

  // Accept "preview" as a generic alias for the current active campaign (used by channel CTA button).
  const isHypeStart = payload && (
    normalizeCampaign(payload, env) === expectedCampaign ||
    payload === "preview"
  );

  if (!isHypeStart) {
    return { handled: false, reason: "no_hype_preview_start_payload" };
  }

  return issueCodeForTelegramUser({ update, payload: expectedCampaign, env });
}

function validationMessage(pkg, points) {
  if (pkg === "blackcard") {
    return "Black Card อยู่ระหว่างการพิจารณาอนุมัติ พอยท์จะได้รับหลังผ่านการตรวจสอบครบถ้วนเท่านั้น";
  }
  const label = pkg === "premium" ? "Premium" : "Standard";
  return `${label} ได้ ${points} Points หลังการสมัครและการชำระเงินผ่านการตรวจสอบเรียบร้อย`;
}

function isExpired(row) {
  const t = Date.parse(row.expires_at || "");
  return Number.isFinite(t) && t < Date.now();
}

function publicRow(row) {
  return {
    code_id: row.id,
    campaign: row.campaign_id,
    promo_kind: row.promo_kind,
    status: row.status,
    selected_package: row.selected_package,
    pending_bonus_points: row.pending_bonus_points,
    credited_points: row.credited_points,
    max_bonus_points: row.max_bonus_points,
    expires_at: row.expires_at,
  };
}

async function validatePreviewCode(body, env) {
  assertDb(env);
  assertSecrets(env);

  const campaignId = normalizeCampaign(body.campaign, env);
  const promo = str(body.promo || body.code);
  const selectedPackage = normalizePackage(body.selected_package || body.package || body.tier);

  if (!promo) return { status: 400, body: { ok: false, valid: false, error: "missing_promo" } };

  const row = await findByPromo(env, campaignId, promo);
  if (!row) return { status: 200, body: { ok: true, valid: false, reason: "not_found" } };

  if (isExpired(row)) {
    await env.HYPE_DB.prepare(
      `UPDATE hype_preview_codes SET status = 'expired', updated_at = ? WHERE id = ? AND status NOT IN ('credited', 'revoked')`,
    ).bind(nowISO(), row.id).run();

    await logEvent(env, {
      code_id: row.id,
      campaign_id: campaignId,
      event_type: "code_expired",
      old_status: row.status,
      new_status: "expired",
      actor_type: "system",
    });

    return { status: 200, body: { ok: true, valid: false, reason: "expired" } };
  }

  if (["revoked", "expired", "credited", "already_redeemed"].includes(row.status)) {
    return { status: 200, body: { ok: true, valid: false, reason: row.status, ...publicRow(row) } };
  }

  let pendingPoints = null;
  let requiresBlackCardApproval = false;

  if (selectedPackage) {
    if (!ALLOWED_PACKAGES.has(selectedPackage)) {
      return { status: 200, body: { ok: true, valid: false, reason: "package_not_eligible" } };
    }

    pendingPoints = pointsForPackage(selectedPackage, env);
    requiresBlackCardApproval = selectedPackage === "blackcard";
  }

  return {
    status: 200,
    body: {
      ok: true,
      valid: true,
      promo_kind: DEFAULT_PROMO_KIND,
      campaign: campaignId,
      new_member_only: true,
      one_time_use: true,
      selected_package: selectedPackage || null,
      pending_bonus_points: pendingPoints,
      max_bonus_points: getPointsRules(env).max,
      requires_blackcard_approval: requiresBlackCardApproval,
      message: selectedPackage ? validationMessage(selectedPackage, pendingPoints) : "โค้ดนี้ใช้สำหรับสมาชิกใหม่ รับพอยท์พิเศษตามแพ็กเกจ หลังระบบตรวจสอบเรียบร้อย",
      ...publicRow(row),
    },
  };
}

async function redeemPreviewCode(body, env) {
  assertDb(env);
  assertSecrets(env);

  const campaignId = normalizeCampaign(body.campaign, env);
  const promo = str(body.promo || body.code);
  const selectedPackage = normalizePackage(body.selected_package || body.package || body.tier);
  const actorId = str(body.actor_id || body.memberstack_id || body.client_record_id || "");

  if (!promo) return { status: 400, body: { ok: false, error: "missing_promo" } };
  if (!selectedPackage || !ALLOWED_PACKAGES.has(selectedPackage)) {
    return { status: 400, body: { ok: false, error: "invalid_selected_package" } };
  }

  const row = await findByPromo(env, campaignId, promo);
  if (!row) return { status: 200, body: { ok: true, redeemed: false, reason: "not_found" } };
  if (isExpired(row)) return { status: 200, body: { ok: true, redeemed: false, reason: "expired", ...publicRow(row) } };
  if (["credited", "revoked", "already_redeemed"].includes(row.status)) {
    return { status: 200, body: { ok: true, redeemed: false, reason: row.status, ...publicRow(row) } };
  }

  if (body.new_member_verified === false) {
    await env.HYPE_DB.prepare(
      `UPDATE hype_preview_codes
       SET status = 'rejected_existing_member', rejection_reason = 'new_member_only',
           memberstack_id = COALESCE(?, memberstack_id),
           client_record_id = COALESCE(?, client_record_id),
           updated_at = ?
       WHERE id = ?`,
    ).bind(body.memberstack_id || null, body.client_record_id || null, nowISO(), row.id).run();

    await logEvent(env, {
      code_id: row.id,
      campaign_id: campaignId,
      event_type: "rejected_existing_member",
      old_status: row.status,
      new_status: "rejected_existing_member",
      package: selectedPackage,
      actor_type: "member_worker",
      actor_id: actorId,
    });

    return { status: 200, body: { ok: true, redeemed: false, reason: "new_member_only" } };
  }

  const points = pointsForPackage(selectedPackage, env);
  const requiresApproval = selectedPackage === "blackcard" && body.blackcard_approved !== true;
  const nextStatus = requiresApproval ? "pending_verification" : (body.payment_ref ? "pending_verification" : "pending_payment");
  const now = nowISO();

  await env.HYPE_DB.prepare(
    `UPDATE hype_preview_codes
     SET status = ?,
         selected_package = ?,
         pending_bonus_points = ?,
         memberstack_id = COALESCE(?, memberstack_id),
         client_record_id = COALESCE(?, client_record_id),
         client_name = COALESCE(?, client_name),
         payment_ref = COALESCE(?, payment_ref),
         signup_started_at = COALESCE(signup_started_at, ?),
         redeemed_at = COALESCE(redeemed_at, ?),
         updated_at = ?
     WHERE id = ?`,
  ).bind(
    nextStatus,
    selectedPackage,
    points,
    body.memberstack_id || null,
    body.client_record_id || null,
    body.client_name || null,
    body.payment_ref || null,
    now,
    now,
    now,
    row.id,
  ).run();

  await logEvent(env, {
    code_id: row.id,
    campaign_id: campaignId,
    event_type: "package_selected",
    old_status: row.status,
    new_status: nextStatus,
    package: selectedPackage,
    points,
    actor_type: "member_worker",
    actor_id: actorId,
    metadata_json: { requires_blackcard_approval: requiresApproval },
  });

  return {
    status: 200,
    body: {
      ok: true,
      redeemed: true,
      status: nextStatus,
      selected_package: selectedPackage,
      pending_bonus_points: points,
      max_bonus_points: getPointsRules(env).max,
      requires_blackcard_approval: requiresApproval,
      message: validationMessage(selectedPackage, points),
    },
  };
}

async function creditPreviewCode(body, env) {
  assertDb(env);
  assertSecrets(env);

  const campaignId = normalizeCampaign(body.campaign, env);
  const promo = str(body.promo || body.code);
  const actorId = str(body.actor_id || body.memberstack_id || body.client_record_id || "");

  if (!promo) return { status: 400, body: { ok: false, error: "missing_promo" } };
  if (body.payment_verified !== true) {
    return { status: 400, body: { ok: false, credited: false, error: "payment_verified_required" } };
  }
  if (body.new_member_verified !== true) {
    return { status: 400, body: { ok: false, credited: false, error: "new_member_verified_required" } };
  }

  const row = await findByPromo(env, campaignId, promo);
  if (!row) return { status: 200, body: { ok: true, credited: false, reason: "not_found" } };
  if (row.status === "credited") {
    return { status: 200, body: { ok: true, credited: false, reason: "already_credited", ...publicRow(row) } };
  }
  if (["revoked", "expired", "rejected_existing_member"].includes(row.status)) {
    return { status: 200, body: { ok: true, credited: false, reason: row.status, ...publicRow(row) } };
  }

  const selectedPackage = normalizePackage(body.selected_package || row.selected_package);
  if (!selectedPackage || !ALLOWED_PACKAGES.has(selectedPackage)) {
    return { status: 400, body: { ok: false, credited: false, error: "selected_package_required" } };
  }

  if (selectedPackage === "blackcard" && body.blackcard_approved !== true) {
    await env.HYPE_DB.prepare(
      `UPDATE hype_preview_codes
       SET status = 'rejected_blackcard_not_approved',
           rejection_reason = 'blackcard_approval_required',
           updated_at = ?
       WHERE id = ?`,
    ).bind(nowISO(), row.id).run();

    await logEvent(env, {
      code_id: row.id,
      campaign_id: campaignId,
      event_type: "rejected_blackcard_not_approved",
      old_status: row.status,
      new_status: "rejected_blackcard_not_approved",
      package: selectedPackage,
      actor_type: "system",
      actor_id: actorId,
    });

    return { status: 200, body: { ok: true, credited: false, reason: "blackcard_approval_required" } };
  }

  const points = row.pending_bonus_points || pointsForPackage(selectedPackage, env);
  const now = nowISO();

  await env.HYPE_DB.prepare(
    `UPDATE hype_preview_codes
     SET status = 'credited',
         selected_package = ?,
         pending_bonus_points = ?,
         credited_points = ?,
         memberstack_id = COALESCE(?, memberstack_id),
         client_record_id = COALESCE(?, client_record_id),
         payment_ref = COALESCE(?, payment_ref),
         payment_verified_at = COALESCE(payment_verified_at, ?),
         credited_at = ?,
         updated_at = ?
     WHERE id = ?`,
  ).bind(
    selectedPackage,
    points,
    points,
    body.memberstack_id || null,
    body.client_record_id || null,
    body.payment_ref || null,
    now,
    now,
    now,
    row.id,
  ).run();

  await logEvent(env, {
    code_id: row.id,
    campaign_id: campaignId,
    event_type: "points_credited",
    old_status: row.status,
    new_status: "credited",
    package: selectedPackage,
    points,
    actor_type: "payment_worker",
    actor_id: actorId,
    metadata_json: {
      payment_ref: body.payment_ref || null,
      memberstack_id: body.memberstack_id || null,
      client_record_id: body.client_record_id || null,
    },
  });

  return {
    status: 200,
    body: {
      ok: true,
      credited: true,
      status: "credited",
      selected_package: selectedPackage,
      credited_points: points,
      max_bonus_points: getPointsRules(env).max,
    },
  };
}

export async function handleHypePreviewApi(path, body, env) {
  if (path === "/api/hype/preview/validate") return validatePreviewCode(body || {}, env);
  if (path === "/api/hype/preview/redeem") return redeemPreviewCode(body || {}, env);
  if (path === "/api/hype/preview/credit") return creditPreviewCode(body || {}, env);
  return { status: 404, body: { ok: false, error: "not_found" } };
}

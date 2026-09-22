import {
  buildSigilAvailabilitySnapshot,
  safeAvailabilityReceipt,
  SIGIL_AVAILABILITY_KV_PREFIX,
} from "../../shared/sigil-availability-snapshot-v1.mjs";
import { safeModelKey } from "../../shared/kenji-recommendation-contract-v1.mjs";

export const SIGIL_AVAILABILITY_INTERNAL_PATH = "/v1/internal/sigil/availability-snapshot";
export const SIGIL_AVAILABILITY_ADOPTION_REMIND_PATH = "/v1/internal/sigil/availability-adoption/remind";
const SIGIL_AVAILABILITY_ADOPTION_REMINDER_PREFIX = "availability-adoption:v1:reminder:";
const SIGIL_AVAILABILITY_ADOPTION_REMINDER_TTL_SECONDS = 24 * 60 * 60;
const MODELS_TABLE_ID = "tblI4B0bI446vp9GX";
const MODEL_BLOCKED_STATES = new Set(["inactive", "blocked", "suspended", "paused", "archived", "retired"]);
const LINE_USER_ID_RE = /^U[0-9a-f]{32}$/i;
const ALLOWED_INTERNAL_CALLERS = new Set(["model-console-worker", "model-app-worker", "calendar-owner"]);

function text(value) {
  return String(value == null ? "" : value).trim();
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function internalCaller(request, env = {}) {
  if (text(request.headers.get("x-mmd-internal-call")).toLowerCase() !== "true") return "";
  const caller = text(request.headers.get("x-mmd-service-binding")).toLowerCase();
  if (!ALLOWED_INTERNAL_CALLERS.has(caller)) return "";
  const expected = text(env.INTERNAL_TOKEN);
  if (!expected) return "";
  const supplied = text(request.headers.get("authorization"));
  if (supplied !== `Bearer ${expected}`) return "";
  return caller;
}

export function isSigilAvailabilityInternalRequest(path = "", method = "") {
  const normalizedMethod = String(method || "").toUpperCase();
  if (path === SIGIL_AVAILABILITY_INTERNAL_PATH) return ["GET", "POST"].includes(normalizedMethod);
  if (path === SIGIL_AVAILABILITY_ADOPTION_REMIND_PATH) return normalizedMethod === "POST";
  return false;
}

export async function readSigilAvailabilitySnapshot(env = {}, modelKeyInput = "", nowMs = Date.now()) {
  const binding = env.SIGIL_AVAILABILITY_SNAPSHOTS;
  if (!binding || typeof binding.get !== "function") {
    return { ok: false, status: 503, error: "availability_snapshot_storage_unavailable" };
  }

  const modelKey = safeModelKey(modelKeyInput);
  if (!modelKey) return { ok: false, status: 400, error: "model_key_invalid" };

  let snapshot;
  try {
    snapshot = await binding.get(`${SIGIL_AVAILABILITY_KV_PREFIX}${modelKey}`, "json");
  } catch {
    return { ok: false, status: 503, error: "availability_snapshot_read_failed" };
  }

  if (!snapshot || typeof snapshot !== "object") {
    return {
      ok: true,
      status: 200,
      model_key: modelKey,
      snapshot_state: "missing",
      fresh: false,
      stale: false,
      age_seconds: null,
      ttl_remaining_seconds: null,
      receipt: null,
    };
  }

  const receipt = safeAvailabilityReceipt(snapshot);
  const updatedMs = Date.parse(text(receipt.updated_at));
  const expiresMs = Date.parse(text(receipt.expires_at));
  const fresh = Number.isFinite(expiresMs) && expiresMs > nowMs;
  const stale = Number.isFinite(expiresMs) && expiresMs <= nowMs;
  const ageSeconds = Number.isFinite(updatedMs) ? Math.max(0, Math.floor((nowMs - updatedMs) / 1000)) : null;
  const ttlRemainingSeconds = fresh ? Math.max(0, Math.ceil((expiresMs - nowMs) / 1000)) : 0;

  return {
    ok: true,
    status: 200,
    model_key: modelKey,
    snapshot_state: fresh ? "fresh" : stale ? "stale" : "invalid_expiry",
    fresh,
    stale,
    age_seconds: ageSeconds,
    ttl_remaining_seconds: ttlRemainingSeconds,
    receipt,
  };
}

export async function writeSigilAvailabilitySnapshot(env = {}, input = {}, options = {}) {
  const binding = env.SIGIL_AVAILABILITY_SNAPSHOTS;
  if (!binding || typeof binding.put !== "function") {
    return { ok: false, status: 503, error: "availability_snapshot_storage_unavailable" };
  }

  const built = buildSigilAvailabilitySnapshot(input, options);
  if (!built.ok) return built;

  try {
    await binding.put(
      built.key,
      JSON.stringify(built.snapshot),
      { expirationTtl: built.ttl_seconds },
    );
  } catch {
    return { ok: false, status: 503, error: "availability_snapshot_write_failed" };
  }

  return {
    ok: true,
    status: 200,
    storage: "sigil_availability_snapshot_v1",
    receipt: safeAvailabilityReceipt(built.snapshot),
  };
}

function token(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9ก-๙]+/g, "_").replace(/^_+|_+$/g, "");
}

function airtableConfig(env = {}) {
  return {
    base: text(env.AIRTABLE_BASE_ID) || "appsV1ILPRfIjkaYg",
    token: text(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN),
    table: text(env.AIRTABLE_TABLE_MODELS_ID) || MODELS_TABLE_ID,
  };
}

function formulaText(value) {
  return `"${text(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function findAdoptionModel(env = {}, modelKeyInput = "") {
  const modelKey = safeModelKey(modelKeyInput);
  if (!modelKey) return { ok: false, status: 400, error: "model_key_invalid" };

  const config = airtableConfig(env);
  if (!config.token) return { ok: false, status: 503, error: "model_directory_unavailable" };

  const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(config.base)}/${encodeURIComponent(config.table)}`);
  url.searchParams.set("pageSize", "2");
  url.searchParams.set("filterByFormula", `{unique_key}=${formulaText(modelKey)}`);
  for (const field of ["unique_key", "working_name", "line_user_id", "status"]) url.searchParams.append("fields[]", field);

  const response = await fetch(url, {
    headers: { authorization: `Bearer ${config.token}`, accept: "application/json" },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || !Array.isArray(payload.records)) {
    return { ok: false, status: 503, error: "model_directory_unavailable" };
  }
  if (payload.records.length !== 1) {
    return {
      ok: false,
      status: payload.records.length > 1 ? 409 : 404,
      error: payload.records.length > 1 ? "model_identity_ambiguous" : "model_identity_not_found",
    };
  }

  const record = payload.records[0];
  const fields = record?.fields || {};
  const status = token(fields.status);
  if (MODEL_BLOCKED_STATES.has(status)) {
    return { ok: false, status: 409, error: "model_not_eligible_for_availability_reminder" };
  }

  const lineUserId = text(fields.line_user_id);
  if (!LINE_USER_ID_RE.test(lineUserId)) {
    return {
      ok: false,
      status: 409,
      error: "model_line_identity_required",
      model_key: modelKey,
      display_name: text(fields.working_name).slice(0, 80) || modelKey,
    };
  }

  return {
    ok: true,
    status: 200,
    model_key: modelKey,
    display_name: text(fields.working_name).slice(0, 80) || modelKey,
    line_user_id: lineUserId,
  };
}

async function adoptionReminderReceipt(env = {}, modelKey = "") {
  const binding = env.SIGIL_AVAILABILITY_SNAPSHOTS;
  if (!binding || typeof binding.get !== "function") {
    return { ok: false, status: 503, error: "availability_snapshot_storage_unavailable" };
  }
  const key = `${SIGIL_AVAILABILITY_ADOPTION_REMINDER_PREFIX}${modelKey}`;
  try {
    const receipt = await binding.get(key, "json");
    return { ok: true, key, receipt: receipt && typeof receipt === "object" ? receipt : null };
  } catch {
    return { ok: false, status: 503, error: "availability_reminder_read_failed" };
  }
}

async function writeAdoptionReminderReceipt(env = {}, modelKey = "", receipt = {}) {
  const binding = env.SIGIL_AVAILABILITY_SNAPSHOTS;
  if (!binding || typeof binding.put !== "function") {
    return { ok: false, status: 503, error: "availability_snapshot_storage_unavailable" };
  }
  try {
    await binding.put(
      `${SIGIL_AVAILABILITY_ADOPTION_REMINDER_PREFIX}${modelKey}`,
      JSON.stringify(receipt),
      { expirationTtl: SIGIL_AVAILABILITY_ADOPTION_REMINDER_TTL_SECONDS },
    );
    return { ok: true };
  } catch {
    return { ok: false, status: 503, error: "availability_reminder_write_failed" };
  }
}

function adoptionReminderCopy(displayName = "") {
  const name = text(displayName).slice(0, 80);
  const lines = [
    "MMD MODEL · อัปเดตสถานะวันนี้",
    name ? `${name} กรุณาอัปเดตสถานะที่สะดวกตอนนี้` : "กรุณาอัปเดตสถานะที่สะดวกตอนนี้",
    "",
    "เปิด MMD MODEL > Availability แล้วเลือกสถานะปัจจุบัน เพื่อให้คิวที่ MMD เห็นตรงกับคุณ",
    "ถ้ายังไม่สะดวก ไม่ต้องเลือก “ว่าง” — ระบบจะรอการยืนยันจากคุณ",
    "",
    "https://www.mmdbkk.com/sigil/model/dashboard/availability",
  ];
  return lines.join("\n");
}

async function pushAvailabilityReminderLine(env = {}, model = {}) {
  const accessToken = text(env.MODEL_LINE_CHANNEL_ACCESS_TOKEN || env.LINE_CHANNEL_ACCESS_TOKEN);
  if (!accessToken) return { ok: false, status: 503, error: "model_line_channel_not_configured" };

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      to: model.line_user_id,
      messages: [{ type: "text", text: adoptionReminderCopy(model.display_name) }],
    }),
  });

  if (!response.ok) return { ok: false, status: 502, error: `line_push_http_${response.status}` };
  return { ok: true, status: 200 };
}

async function handleAvailabilityAdoptionReminder(request, env = {}, caller = "") {
  if (!["model-console-worker", "calendar-owner"].includes(caller)) {
    return json({ ok: false, error: "internal_auth_required" }, 401);
  }

  const contentType = text(request.headers.get("content-type")).toLowerCase();
  if (!contentType.includes("application/json")) {
    return json({ ok: false, error: "content_type_json_required" }, 415);
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const modelKey = safeModelKey(body.model_key);
  if (!modelKey) return json({ ok: false, error: "model_key_invalid" }, 400);

  const availability = await readSigilAvailabilitySnapshot(env, modelKey);
  if (!availability.ok) return json({ ok: false, error: availability.error }, availability.status || 503);
  if (availability.fresh) {
    return json({
      ok: false,
      error: "availability_already_fresh",
      model_key: modelKey,
      safe_availability_state: availability.receipt?.safe_availability_state || "unknown",
      expires_at: availability.receipt?.expires_at || null,
    }, 409);
  }

  const prior = await adoptionReminderReceipt(env, modelKey);
  if (!prior.ok) return json({ ok: false, error: prior.error }, prior.status || 503);
  if (prior.receipt) {
    return json({
      ok: false,
      error: "availability_reminder_cooldown",
      model_key: modelKey,
      last_sent_at: text(prior.receipt.sent_at) || null,
      retry_after_seconds: SIGIL_AVAILABILITY_ADOPTION_REMINDER_TTL_SECONDS,
    }, 429);
  }

  const model = await findAdoptionModel(env, modelKey);
  if (!model.ok) {
    return json({
      ok: false,
      error: model.error,
      ...(model.model_key ? { model_key: model.model_key } : {}),
      ...(model.display_name ? { display_name: model.display_name } : {}),
    }, model.status || 400);
  }

  const sent = await pushAvailabilityReminderLine(env, model);
  if (!sent.ok) return json({ ok: false, error: sent.error }, sent.status || 502);

  const sentAt = new Date().toISOString();
  const stored = await writeAdoptionReminderReceipt(env, modelKey, {
    schema: "mmd.availability_adoption_reminder.v1",
    model_key: modelKey,
    channel: "line",
    sent_at: sentAt,
  });
  if (!stored.ok) {
    return json({
      ok: false,
      error: stored.error,
      delivery_state: "sent_but_receipt_failed",
      model_key: modelKey,
    }, stored.status || 503);
  }

  return json({
    ok: true,
    schema: "mmd.availability_adoption_reminder.v1",
    model_key: modelKey,
    display_name: model.display_name,
    channel: "line",
    sent_at: sentAt,
    cooldown_seconds: SIGIL_AVAILABILITY_ADOPTION_REMINDER_TTL_SECONDS,
  });
}

export async function handleSigilAvailabilityInternalRequest(request, env = {}) {
  const caller = internalCaller(request, env);
  if (!caller) return json({ ok: false, error: "internal_auth_required" }, 401);

  const pathname = new URL(request.url).pathname;
  if (pathname === SIGIL_AVAILABILITY_ADOPTION_REMIND_PATH) {
    return handleAvailabilityAdoptionReminder(request, env, caller);
  }

  if (request.method.toUpperCase() === "GET") {
    if (caller !== "model-console-worker") return json({ ok: false, error: "internal_auth_required" }, 401);
    const modelKey = new URL(request.url).searchParams.get("model_key") || "";
    const result = await readSigilAvailabilitySnapshot(env, modelKey);
    return json(
      result.ok
        ? {
            ok: true,
            model_key: result.model_key,
            snapshot_state: result.snapshot_state,
            fresh: result.fresh,
            stale: result.stale,
            age_seconds: result.age_seconds,
            ttl_remaining_seconds: result.ttl_remaining_seconds,
            snapshot: result.receipt,
          }
        : { ok: false, error: result.error },
      result.status || (result.ok ? 200 : 400),
    );
  }

  const contentType = text(request.headers.get("content-type")).toLowerCase();
  if (!contentType.includes("application/json")) {
    return json({ ok: false, error: "content_type_json_required" }, 415);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  if (!["model-console-worker", "model-app-worker"].includes(caller)) {
    return json({ ok: false, error: "internal_auth_required" }, 401);
  }
  const source = caller === "model-console-worker" ? "model_console" : "model_app";
  const confidence = source === "model_console" ? "operator_confirmed" : "model_confirmed";
  const result = await writeSigilAvailabilitySnapshot(env, body, {
    model_key: body.model_key,
    source,
    confidence,
  });
  return json(
    result.ok
      ? { ok: true, source, ...result.receipt }
      : { ok: false, error: result.error },
    result.status || (result.ok ? 200 : 400),
  );
}

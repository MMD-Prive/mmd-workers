const AUTHORITY = "sigil_availability_snapshot_v1";
const INTERNAL_PATH = "/v1/internal/sigil/availability-snapshot";
const TIMEOUT_MS = 700;
const SAFE_STATES = new Set(["available_now", "available_today", "available_soon", "limited", "unavailable", "unknown"]);
const SAFE_CONFIDENCE = new Set(["model_confirmed", "operator_confirmed"]);

function text(value, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function lower(value) {
  return text(value).toLowerCase();
}

function activeModelFromContinuity(continuity = {}, nowMs = Date.now()) {
  const matrix = continuity?.matrix || {};
  if (text(continuity.decision) === "stale_refresh" || text(matrix.matrix_status) === "stale") return null;
  const expiresAt = Date.parse(text(matrix.state_expires_at, 100));
  if (Number.isFinite(expiresAt) && expiresAt <= nowMs) return null;
  const raw = matrix?.payload_json?.active_model_v1;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const modelCode = text(raw.model_code, 80);
  const workingName = text(raw.working_name, 120);
  if (!modelCode || !workingName) return null;
  return { model_code: modelCode, working_name: workingName };
}

function boundedSnapshot(payload = {}, model = {}, nowMs = Date.now()) {
  if (payload?.ok !== true || payload?.fresh !== true || text(payload?.snapshot_state) !== "fresh") return null;
  if (lower(payload.model_key) !== lower(model.model_code)) return null;
  const snapshot = payload?.snapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  if (lower(snapshot.model_key) !== lower(model.model_code)) return null;

  const state = lower(snapshot.safe_availability_state);
  const confidence = lower(snapshot.confidence);
  const updatedAt = Date.parse(text(snapshot.updated_at, 100));
  const expiresAt = Date.parse(text(snapshot.expires_at, 100));
  if (!SAFE_STATES.has(state) || !SAFE_CONFIDENCE.has(confidence)) return null;
  if (!Number.isFinite(updatedAt) || !Number.isFinite(expiresAt)) return null;
  if (updatedAt > nowMs + 60_000 || expiresAt <= nowMs) return null;

  return {
    state,
    confidence,
    updated_at: new Date(updatedAt).toISOString(),
    expires_at: new Date(expiresAt).toISOString(),
  };
}

export async function resolveKenjiLineAvailability({ env = {}, continuity = {}, now_ms = Date.now() } = {}) {
  const model = activeModelFromContinuity(continuity, now_ms);
  if (!model) return { ok: false, status: "model_context_missing", authority: AUTHORITY };

  if (!env.ADMIN_WORKER?.fetch || !text(env.INTERNAL_TOKEN, 1000)) {
    return { ok: false, status: "unavailable", authority: AUTHORITY, model };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("kenji_availability_timeout"), TIMEOUT_MS);
  try {
    const url = new URL("https://admin-worker.local" + INTERNAL_PATH);
    url.searchParams.set("model_key", model.model_code);
    const response = await env.ADMIN_WORKER.fetch(new Request(url.toString(), {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-mmd-internal-call": "true",
        "x-mmd-service-binding": "member-dashboard-chat-worker",
        authorization: `Bearer ${text(env.INTERNAL_TOKEN, 1000)}`,
      },
      signal: controller.signal,
    }));
    if (!response.ok) return { ok: false, status: "unavailable", authority: AUTHORITY, model };
    const payload = await response.json().catch(() => null);
    const snapshot = boundedSnapshot(payload || {}, model, now_ms);
    if (!snapshot) {
      return {
        ok: false,
        status: payload?.stale === true || text(payload?.snapshot_state) === "stale" ? "stale" : "unavailable",
        authority: AUTHORITY,
        model,
      };
    }
    return {
      ok: true,
      status: "verified",
      authority: AUTHORITY,
      model,
      snapshot,
    };
  } catch {
    return { ok: false, status: "unavailable", authority: AUTHORITY, model };
  } finally {
    clearTimeout(timer);
  }
}

function availabilityStateText(state = "", model = {}) {
  const name = text(model.working_name, 120);
  const code = text(model.model_code, 80);
  const who = name && code ? `${name} (${code})` : name || code || "Model คนนี้";
  if (state === "available_now") return `สถานะล่าสุดของ ${who} คือว่างตอนนี้ครับ`;
  if (state === "available_today") return `สถานะล่าสุดของ ${who} คือว่างวันนี้ครับ`;
  if (state === "available_soon") return `สถานะล่าสุดของ ${who} คือมีช่วงว่างเร็ว ๆ นี้ครับ`;
  if (state === "limited") return `สถานะล่าสุดของ ${who} คือมีเวลาว่างจำกัดครับ`;
  if (state === "unavailable") return `สถานะล่าสุดของ ${who} คือยังไม่ว่างครับ`;
  return "";
}

export function buildKenjiAvailabilityDecision(intent = "", live = {}) {
  if (text(intent).toLowerCase() !== "availability_request") return null;
  const state = lower(live?.snapshot?.state);
  const verified = live?.ok === true && live?.status === "verified" && live?.authority === AUTHORITY;
  const stateText = verified ? availabilityStateText(state, live.model || {}) : "";

  if (stateText) {
    return {
      text: `${stateText} สถานะนี้เป็นข้อมูล live ล่าสุดของ Model แต่ยังไม่ใช่การยืนยัน booking slot วัน-เวลาเฉพาะครับ ถ้าส่งวัน เวลา และพื้นที่มา เปอร์จะเช็ก calendar/job conflict ก่อนคอนเฟิร์มให้ครับ`,
      reply_source: "availability_live_truth",
      guard_blocked: false,
      guard_reason: "",
      handoff_required: true,
      handoff_reason: "availability_request:slot_confirmation_required",
      truth_authority: AUTHORITY,
      truth_status: "verified",
      live_truth_used: true,
      live_truth_verified: true,
    };
  }

  if (live?.model?.model_code) {
    return {
      text: "ผมมี Model ที่กำลังคุยต่ออยู่ครับ แต่สถานะคิว live ล่าสุดยังอ่านไม่สำเร็จ เลยยังไม่ยืนยันว่าเขาว่างครับ ส่งวัน เวลา และพื้นที่ไว้ได้ เดี๋ยวเปอร์เช็กจากตารางปัจจุบันให้ครับ",
      reply_source: "availability_live_truth_unavailable",
      guard_blocked: false,
      guard_reason: "availability_live_truth_unavailable",
      handoff_required: true,
      handoff_reason: "availability_request:live_truth_unavailable",
      truth_authority: AUTHORITY,
      truth_status: text(live?.status) || "unavailable",
      live_truth_used: false,
      live_truth_verified: false,
    };
  }

  return null;
}

export const KENJI_AVAILABILITY_AUTHORITY = AUTHORITY;

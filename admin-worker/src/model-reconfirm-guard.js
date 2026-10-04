// MODEL_RECONFIRM guard v2 — pure decision logic. No network, no storage, no writes.
// Hardens the existing D-1 reconfirm flow (docs/architecture/MODEL_PREJOB_RECONFIRM_V1.md); it is NOT a second sender.
// Flag: MODEL_RECONFIRM_GUARD_V2 (default off). When off, model-reconfirm-runtime.js keeps its legacy behavior.

const ACTIVE_STATES = new Set(["confirmed", "accepted"]);
const ICT_OFFSET_MS = 7 * 60 * 60 * 1000;

export const GUARD_ACTIONS = Object.freeze({
  SEND: "send",
  SKIP: "skip",
  OWNER_ACTION: "owner_action",
  REVIEW_REQUIRED: "review_required",
});

export const FOLLOWUP_OWNER_ACTION = "owner_action_sent";
export const FOLLOWUP_REVIEW_REQUIRED = "review_required";
export const MAX_SEND_ATTEMPTS = 3;

function clean(value) { return String(value ?? "").trim(); }
function word(value) { return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }

export function isGuardV2Enabled(env = {}) {
  return word(env?.MODEL_RECONFIRM_GUARD_V2 || "false") === "true";
}

export function ictDateOf(ms) {
  return new Date(Number(ms) + ICT_OFFSET_MS).toISOString().slice(0, 10);
}

export function nextIctDate(ms) {
  return ictDateOf(Number(ms) + 24 * 60 * 60 * 1000);
}

// Same reading the legacy scheduler uses: the leading YYYY-MM-DD of the canonical job date field.
export function normalizeJobDate(value) {
  const match = clean(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  const [, y, m, d] = match;
  const probe = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (probe.getUTCFullYear() !== Number(y) || probe.getUTCMonth() !== Number(m) - 1 || probe.getUTCDate() !== Number(d)) return "";
  return `${y}-${m}-${d}`;
}

// Assigned Model link classification. More than one linked record is ambiguous: never pick the first.
export function classifyModelRef(value) {
  const list = Array.isArray(value) ? value : (value === undefined || value === null || value === "" ? [] : [value]);
  const ids = [...new Set(list
    .map((item) => clean(typeof item === "object" && item ? item.id : item))
    .filter(Boolean))];
  if (ids.length === 0) return { status: "none", id: "" };
  if (ids.length > 1) return { status: "multiple", id: "" };
  if (!/^rec[A-Za-z0-9]{14,24}$/.test(ids[0])) return { status: "invalid", id: "" };
  return { status: "one", id: ids[0] };
}

// Owner-only destination. Never falls back to TELEGRAM_CHAT_ID, the booking chat, or any customer/member/model room.
export function resolveOwnerDestination(env = {}) {
  const primary = clean(env.MODEL_RECONFIRM_OWNER_CHAT_ID);
  if (primary) {
    return { chat_id: primary, thread_id: clean(env.MODEL_RECONFIRM_OWNER_THREAD_ID) || "", source: "MODEL_RECONFIRM_OWNER_CHAT_ID" };
  }
  const shared = clean(env.HYPE_JOB_DAILY_CHAT_ID);
  if (shared) {
    return { chat_id: shared, thread_id: clean(env.HYPE_JOB_DAILY_THREAD_ID) || "", source: "HYPE_JOB_DAILY_CHAT_ID" };
  }
  return null;
}

export function maskId(value) {
  const text = clean(value);
  return text ? `…${text.slice(-4)}` : "";
}

// One decision per session. `model` is the canonical Models record read for this job (or null when not readable).
// `lineTransportReady` says whether the sender has a LINE token; `null` means unknown (preview from a worker that lacks it).
export function decideReconfirmAction({ lifecycleState, jobDate, now, reconfirm = null, modelRef, model = null, lineTransportReady = true, followupStatus = "" } = {}) {
  const state = word(lifecycleState);
  if (!ACTIVE_STATES.has(state)) return { action: GUARD_ACTIONS.SKIP, reason: "not_active_job" };

  const date = normalizeJobDate(jobDate);
  if (!date) return { action: GUARD_ACTIONS.REVIEW_REQUIRED, reason: "job_date_invalid" };
  const target = nextIctDate(now);
  if (date < target) return { action: GUARD_ACTIONS.SKIP, reason: "job_date_not_upcoming" };
  if (date > target) return { action: GUARD_ACTIONS.SKIP, reason: "job_date_not_next_day" };

  if (clean(reconfirm?.acknowledged_at)) return { action: GUARD_ACTIONS.SKIP, reason: "already_acknowledged" };
  const followup = word(followupStatus);
  if (followup === word(FOLLOWUP_OWNER_ACTION) || followup === word(FOLLOWUP_REVIEW_REQUIRED)) {
    return { action: GUARD_ACTIONS.SKIP, reason: "owner_already_notified" };
  }

  const ref = classifyModelRef(modelRef);
  if (ref.status === "none") return { action: GUARD_ACTIONS.REVIEW_REQUIRED, reason: "assigned_model_missing" };
  if (ref.status === "multiple") return { action: GUARD_ACTIONS.REVIEW_REQUIRED, reason: "assigned_model_ambiguous" };
  if (ref.status === "invalid") return { action: GUARD_ACTIONS.REVIEW_REQUIRED, reason: "assigned_model_invalid" };
  if (!model || typeof model !== "object") return { action: GUARD_ACTIONS.REVIEW_REQUIRED, reason: "assigned_model_unreadable" };

  const lineUserId = clean(model.line_user_id);
  if (!/^U[0-9a-f]{32}$/i.test(lineUserId)) return { action: GUARD_ACTIONS.OWNER_ACTION, reason: "model_not_connected" };
  if (lineTransportReady === false) return { action: GUARD_ACTIONS.OWNER_ACTION, reason: "model_channel_unavailable" };
  return { action: GUARD_ACTIONS.SEND, reason: "connected", model_record_id: ref.id, line_transport_verified: lineTransportReady === true };
}

// Send-failure counter kept in the existing reconfirm_followup_status field as `send_failed_N`.
export function parseSendFailures(followupStatus) {
  const match = word(followupStatus).match(/^send_failed_(\d+)$/);
  return match ? Number(match[1]) : 0;
}
export function sendFailureStatus(count) { return `send_failed_${count}`; }

const REASON_TEXT = Object.freeze({
  model_not_connected: ["ยังไม่มีการเชื่อมต่อ LINE ของโมเดล", "ติดต่อโมเดลทางช่องทางอื่นเพื่อให้รับทราบงาน หรือเชื่อมต่อ MY MODEL"],
  model_channel_unavailable: ["ช่องทางส่งข้อความโมเดลใช้งานไม่ได้", "ตรวจการตั้งค่าช่องทาง LINE ของโมเดล แล้วแจ้งโมเดลด้วยตนเอง"],
  assigned_model_missing: ["งานนี้ยังไม่ระบุโมเดล", "เปิดงานและกำหนดโมเดลให้ชัดเจน"],
  assigned_model_ambiguous: ["งานนี้ผูกกับโมเดลมากกว่าหนึ่งคน ระบบไม่เดา", "ตรวจงานและเลือกโมเดลที่ถูกต้องเพียงคนเดียว"],
  assigned_model_invalid: ["ข้อมูลโมเดลในงานไม่ถูกต้อง", "ตรวจข้อมูลโมเดลของงานนี้"],
  assigned_model_unreadable: ["อ่านข้อมูลโมเดลของงานนี้ไม่ได้", "ตรวจโมเดลของงานนี้ในระบบ"],
  job_date_invalid: ["วันที่งานอ่านไม่ได้", "ตรวจวันที่งานของ Session นี้"],
  send_failed_repeatedly: ["ส่งข้อความหาโมเดลไม่สำเร็จติดต่อกัน", "ติดต่อโมเดลด้วยตนเองแล้วตรวจช่องทางส่ง"],
});

function esc(value) {
  return clean(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Owner message. Contains job date, model name and session id only. No customer, payment or pricing data.
// Exactly one `Next:` line.
export function buildOwnerFallbackText({ kind, reason, sessionId, jobDate, modelName }) {
  const [what, next] = REASON_TEXT[reason] || ["ต้องตรวจสอบการแจ้งเตือนโมเดล", "ตรวจงานนี้ในระบบ"];
  const title = kind === GUARD_ACTIONS.REVIEW_REQUIRED ? "MODEL RECONFIRM · ต้องตรวจสอบ" : "MODEL RECONFIRM · ต้องติดตามโมเดล";
  return [
    `<b>${esc(title)}</b>`,
    `งานวันที่: <b>${esc(jobDate) || "-"}</b>`,
    modelName ? `โมเดล: <b>${esc(modelName)}</b>` : "",
    `Session: <code>${esc(sessionId) || "-"}</code>`,
    `เหตุผล: ${esc(what)} (${esc(reason)})`,
    "ระบบไม่ได้ส่งข้อความหาโมเดล งานไม่ถูกยกเลิก และไม่ได้แจ้งลูกค้า",
    `Next: ${esc(next)}`,
  ].filter(Boolean).join("\n");
}

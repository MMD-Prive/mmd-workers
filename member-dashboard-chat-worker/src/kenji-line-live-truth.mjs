const MEMBER_TRUTH_URL = "https://member-pages-worker.internal/__internal/kenji/member-truth";
const AUTHORITY = "my_mmd_entitlement_resolver_v1";
const TIMEOUT_MS = 1600;
const LIVE_TRUTH_INTENTS = new Set(["membership_status", "points_status"]);

function text(value) {
  return value == null ? "" : String(value).trim();
}

function lineUserIdOf(event = {}) {
  const value = event?.source?.type === "user" ? text(event?.source?.userId) : "";
  return /^U[0-9a-f]{32}$/i.test(value) ? value : "";
}

function safeLifecycle(value) {
  const lifecycle = text(value).toLowerCase();
  return ["active", "expiring_soon", "grace", "expired", "inactive", "pending", "revoked", "blocked"].includes(lifecycle)
    ? lifecycle
    : "unknown";
}

function safeLevel(value) {
  const level = text(value).toLowerCase();
  return ["black_card", "svip", "vip", "private_premium", "private_standard", "red_card", "public_member", "guest_pass", "none"].includes(level)
    ? level
    : "none";
}

function safeEnvelope(value) {
  const envelope = text(value).toLowerCase();
  return ["none", "standard", "premium", "vip", "svip", "black_card"].includes(envelope) ? envelope : "none";
}

function boundedTruth(payload = {}) {
  if (payload?.ok !== true || payload?.authority !== AUTHORITY || payload?.identity_status !== "resolved") return null;
  const membership = payload?.membership && typeof payload.membership === "object" ? payload.membership : {};
  const points = payload?.points && typeof payload.points === "object" ? payload.points : {};
  const activePoints = Number(points.active_points);
  return {
    ok: true,
    authority: AUTHORITY,
    identity_status: "resolved",
    display_name: text(payload.display_name).slice(0, 120),
    membership: {
      level: safeLevel(membership.level),
      label: text(membership.label).slice(0, 40),
      lifecycle: safeLifecycle(membership.lifecycle),
      expire_at: /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(text(membership.expire_at)) ? text(membership.expire_at) : "",
      public_service_access: membership.public_service_access === true,
      private_visibility_envelope: safeEnvelope(membership.private_visibility_envelope),
      member_blocked: membership.member_blocked === true,
    },
    points: {
      status: text(points.status) === "verified" && Number.isFinite(activePoints) && activePoints >= 0 ? "verified" : "unavailable",
      active_points: text(points.status) === "verified" && Number.isFinite(activePoints) && activePoints >= 0 ? Math.floor(activePoints) : null,
    },
  };
}

export function kenjiLiveTruthRequired(intent = "") {
  return LIVE_TRUTH_INTENTS.has(text(intent).toLowerCase());
}

export async function resolveKenjiLineLiveTruth({ env = {}, event = {}, intent = "" } = {}) {
  const effectiveIntent = text(intent).toLowerCase();
  if (!kenjiLiveTruthRequired(effectiveIntent)) {
    return { ok: false, status: "not_required", authority: AUTHORITY };
  }
  const lineUserId = lineUserIdOf(event);
  if (!lineUserId || !env.MEMBER_PAGES_WORKER?.fetch) {
    return { ok: false, status: "unavailable", authority: AUTHORITY };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("kenji_live_truth_timeout"), TIMEOUT_MS);
  try {
    const response = await env.MEMBER_PAGES_WORKER.fetch(new Request(MEMBER_TRUTH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mmd-internal-call": "true",
        "x-mmd-service-binding": "member-dashboard-chat-worker",
      },
      body: JSON.stringify({ line_user_id: lineUserId }),
      signal: controller.signal,
    }));
    if (!response.ok) return { ok: false, status: "unavailable", authority: AUTHORITY };
    const payload = await response.json().catch(() => null);
    const truth = boundedTruth(payload || {});
    return truth || { ok: false, status: "unavailable", authority: AUTHORITY };
  } catch {
    return { ok: false, status: "unavailable", authority: AUTHORITY };
  } finally {
    clearTimeout(timer);
  }
}

function formatThaiDate(value = "") {
  const raw = text(value).slice(0, 10);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const month = months[Number(match[2]) - 1];
  if (!month) return "";
  return `${Number(match[3])} ${month} ${Number(match[1]) + 543}`;
}

function membershipStatusText(membership = {}) {
  const label = text(membership.label) || "สมาชิก MMD";
  const lifecycle = safeLifecycle(membership.lifecycle);
  const expiry = formatThaiDate(membership.expire_at);
  if (lifecycle === "active") return `ตอนนี้สถานะที่ยืนยันได้คือ ${label} และยัง Active อยู่ครับ${expiry ? ` หมดอายุ ${expiry}` : ""}`;
  if (lifecycle === "expiring_soon") return `ตอนนี้สถานะที่ยืนยันได้คือ ${label} และยัง Active อยู่ครับ${expiry ? ` หมดอายุ ${expiry}` : ""}`;
  if (lifecycle === "grace") return `ตอนนี้สถานะที่ยืนยันได้คือ ${label} และอยู่ในช่วง Grace ครับ${expiry ? ` โดยรอบสิทธิ์เดิมสิ้นสุด ${expiry}` : ""}`;
  if (lifecycle === "expired") return `ตอนนี้สถานะ ${label} หมดอายุแล้วครับ${expiry ? ` ตั้งแต่ ${expiry}` : ""}`;
  if (lifecycle === "blocked" || membership.member_blocked === true) return "ตอนนี้บัญชีสมาชิกมีสถานะระงับการใช้งานครับ";
  if (lifecycle === "revoked") return "ตอนนี้สิทธิ์สมาชิกเดิมถูกยกเลิกแล้วครับ";
  return "ตอนนี้ยังไม่พบสิทธิ์สมาชิกที่ Active อยู่ครับ";
}

function knownIdentity(continuity = {}) {
  return Boolean(text(continuity.client_record_id || continuity?.matrix?.client_record_id));
}

export function buildKenjiLiveTruthDecision(intent = "", liveTruth = {}, continuity = {}) {
  const value = text(intent).toLowerCase();
  if (!kenjiLiveTruthRequired(value)) return null;

  if (liveTruth?.ok === true && liveTruth.authority === AUTHORITY) {
    if (value === "membership_status") {
      return {
        text: membershipStatusText(liveTruth.membership || {}),
        reply_source: "live_truth",
        guard_blocked: false,
        guard_reason: "",
        handoff_required: false,
        handoff_reason: "",
        truth_authority: AUTHORITY,
        truth_status: "verified",
        live_truth_used: true,
        live_truth_verified: true,
      };
    }
    if (value === "points_status" && liveTruth?.points?.status === "verified") {
      const points = Number(liveTruth.points.active_points) || 0;
      return {
        text: `ตอนนี้มี ${points.toLocaleString("th-TH")} Points ครับ`,
        reply_source: "live_truth",
        guard_blocked: false,
        guard_reason: "",
        handoff_required: false,
        handoff_reason: "",
        truth_authority: AUTHORITY,
        truth_status: "verified",
        live_truth_used: true,
        live_truth_verified: true,
      };
    }
  }

  if (knownIdentity(continuity)) {
    const message = value === "points_status"
      ? "ผมเจอบัญชีที่ผูกไว้แล้วครับ แต่ยอด Points ล่าสุดยังอ่านจากข้อมูลทางการไม่สำเร็จ เลยยังไม่บอกตัวเลขให้ผิดครับ"
      : "ผมเจอบัญชีที่ผูกไว้แล้วครับ แต่สถานะล่าสุดยังอ่านจากตัวตรวจสิทธิ์ไม่สำเร็จ เลยยังไม่ยืนยันระดับหรือวันหมดอายุให้ผิดครับ";
    return {
      text: message,
      reply_source: "live_truth_unavailable",
      guard_blocked: false,
      guard_reason: "live_truth_unavailable_known_identity",
      handoff_required: true,
      handoff_reason: `${value}:live_truth_unavailable`,
      truth_authority: AUTHORITY,
      truth_status: "unavailable",
      live_truth_used: false,
      live_truth_verified: false,
    };
  }

  return null;
}

export const KENJI_LIVE_TRUTH_AUTHORITY = AUTHORITY;

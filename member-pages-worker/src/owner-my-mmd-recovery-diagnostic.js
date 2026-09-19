import { readMemberHistoryRecoveryStatus } from "./member-history-recovery.js";

export const OWNER_MY_MMD_RECOVERY_RPC_PATH = "/__internal/admin/my-mmd/recovery-diagnostic";

const SERVICE_HOST = "member-pages-worker.internal";
const ALLOWED_CALLER = "admin-worker";
const MEMBER_PROFILE_PATH = "/__internal/member-profile/read";
const MEMBER_PROFILE_PURPOSE = "liff_member_profile_read";
const MEMBER_RESOLVER_SECRET_HEADER = "x-mmd-member-resolver-secret";
const RESOLVER_SCHEMA = "my_mmd_entitlement_resolver_v1";
const PROFILE_TIMEOUT_MS = 2500;

const CAPABILITY_PRIORITY = Object.freeze([
  "black_card",
  "svip",
  "vip",
  "private_premium",
  "private_standard",
  "red_card",
  "elite",
  "public_member",
  "guest_pass",
]);

const LABELS = Object.freeze({
  black_card: "Black Card",
  svip: "SVIP",
  vip: "VIP",
  private_premium: "Premium",
  private_standard: "Standard",
  red_card: "Red Card",
  elite: "Elite",
  public_member: "Public Member",
  guest_pass: "Guest Pass",
});

export function isOwnerMyMmdRecoveryDiagnosticRpc(request) {
  if (!(request instanceof Request)) return false;
  try {
    return request.method === "POST" && new URL(request.url).pathname === OWNER_MY_MMD_RECOVERY_RPC_PATH;
  } catch {
    return false;
  }
}

export async function handleOwnerMyMmdRecoveryDiagnosticRpc(request, env = {}) {
  if (!authorized(request)) return json({ ok: false, error: "not_found" }, 404);

  const body = await request.json().catch(() => null);
  if (!plain(body) || Object.keys(body).some((key) => key !== "line_user_id")) {
    return json({ ok: false, error: "invalid_request" }, 400);
  }

  const lineUserId = canonicalLineId(body.line_user_id);
  if (!lineUserId) return json({ ok: false, error: "invalid_request" }, 400);

  const [profileResult, recovery, acceptance, activeThroughAnchor] = await Promise.all([
    readCanonicalProfile(env, lineUserId),
    readMemberHistoryRecoveryStatus(env, lineUserId),
    readAcceptanceEvidence(env, lineUserId),
    readProtectedActiveThroughAnchor(env, lineUserId),
  ]);

  if (profileResult.status === "ambiguous") {
    return json({ ok: false, state: "review_required", error: "member_identity_ambiguous" }, 409);
  }
  if (profileResult.status !== "resolved") {
    return json({ ok: false, state: "unavailable", error: "member_profile_unavailable" }, 503);
  }

  const membership = projectMembership(profileResult.snapshot);
  const canonicalActiveThrough = firstDate(
    profileResult.profile?.membership_expires_at,
    profileResult.profile?.customer_360?.member?.membership_expires_at,
    membership?.expire_at,
  );
  const activeThrough = canonicalActiveThrough || firstDate(activeThroughAnchor?.active_through);
  const points = projectDiagnosticPoints(recovery, profileResult.profile);
  const recoveryState = token(recovery?.state) || "checking";

  return json({
    ok: true,
    authority: "mmd.owner_my_mmd_recovery_diagnostic.v1",
    membership: {
      level: membership?.level || null,
      label: membership?.label || null,
      lifecycle: membership?.lifecycle || null,
      active_through: activeThrough || null,
      source: RESOLVER_SCHEMA,
    },
    recovery: {
      state: recoveryState,
      terminal: ["reconciled", "review_required"].includes(recoveryState),
      review_required: recoveryState === "review_required",
      reason: safeText(recovery?.reason, 100) || null,
      pending_review_count: nonNegativeInt(recovery?.pending_review_count),
      source_note_count: nonNegativeInt(recovery?.source_note_count),
      candidate_count: nonNegativeInt(recovery?.candidate_count),
      materialized_count: nonNegativeInt(recovery?.materialized_count),
      updated_at: safeTimestamp(recovery?.updated_at),
    },
    points,
    acceptance: {
      status: acceptance ? "recorded" : "missing",
      evidence_id: safeEvidenceId(acceptance?.evidence_id),
      result: safeText(acceptance?.result, 80) || null,
      tier: safeText(acceptance?.tier, 40) || null,
      tier_source: safeText(acceptance?.tier_source, 100) || null,
      recorded_at: safeTimestamp(acceptance?.recorded_at),
    },
    guardrails: {
      read_only: true,
      owner_only_upstream: true,
      raw_line_user_id_exposed: false,
      session_token_required: false,
      session_token_exposed: false,
      canonical_truth_only: true,
    },
  });
}

async function readCanonicalProfile(env, lineUserId) {
  const binding = env.MEMBER_STATUS_RESOLVER;
  const secret = text(env.MEMBER_STATUS_RESOLVER_SECRET);
  if (!binding?.fetch || secret.length < 32) return { status: "unavailable" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("owner_my_mmd_profile_timeout"), PROFILE_TIMEOUT_MS);
  try {
    const response = await binding.fetch(new Request(`https://mmd-auth-worker.internal${MEMBER_PROFILE_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [MEMBER_RESOLVER_SECRET_HEADER]: secret,
      },
      body: JSON.stringify({ line_user_id: lineUserId, purpose: MEMBER_PROFILE_PURPOSE }),
      signal: controller.signal,
    }));
    const payload = await response.json().catch(() => null);
    if (response.status === 409 || payload?.error?.code === "MEMBER_MATCH_AMBIGUOUS") {
      return { status: "ambiguous" };
    }
    const data = plain(payload?.data) ? payload.data : null;
    const profile = plain(data?.profile) ? data.profile : null;
    const snapshot = plain(data?.entitlement_snapshot)
      ? data.entitlement_snapshot
      : (plain(profile?.entitlement_snapshot) ? profile.entitlement_snapshot : null);
    if (!response.ok || payload?.ok !== true || data?.member_exists !== true || !profile || !snapshot) {
      return { status: "unavailable" };
    }
    return { status: "resolved", profile, snapshot };
  } catch {
    return { status: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

function projectMembership(snapshot = {}) {
  if (!plain(snapshot)) return null;
  if (snapshot.schema_version !== RESOLVER_SCHEMA || snapshot.source_status !== "verified" || snapshot.fail_closed !== true) {
    return null;
  }

  const state = plain(snapshot.capability_state) ? snapshot.capability_state : {};
  const access = plain(snapshot.access) ? snapshot.access : {};
  const active = uniqueTokens([
    ...(Array.isArray(state.active) ? state.active : []),
    ...(Array.isArray(access.protected_capabilities_active) ? access.protected_capabilities_active : []),
  ]);
  const grace = uniqueTokens([
    ...(Array.isArray(state.grace) ? state.grace : []),
    ...(Array.isArray(access.protected_capabilities_grace) ? access.protected_capabilities_grace : []),
  ]);
  const inactive = uniqueTokens(state.inactive);
  const recognized = uniqueTokens(state.recognized);

  let bucket = "active";
  let level = highest(active);
  if (!level) {
    bucket = "grace";
    level = highest(grace);
  }
  if (!level) {
    bucket = "inactive";
    level = highest(inactive) || highest(recognized);
  }

  if (!level) return {
    level: "none",
    label: "Member",
    lifecycle: snapshot.member_blocked === true ? "blocked" : "inactive",
    expire_at: null,
  };

  const entitlements = Array.isArray(snapshot.entitlements) ? snapshot.entitlements : [];
  const matching = entitlements.filter((item) => token(item?.capability) === level);
  const lifecycle = snapshot.member_blocked === true
    ? "blocked"
    : uniqueLifecycle(matching) || (bucket === "grace" ? "grace" : bucket === "active" ? "active" : "inactive");
  const expiries = [...new Set(
    matching
      .filter((item) => !lifecycle || token(item?.lifecycle) === lifecycle)
      .map((item) => firstDate(item?.expire_at))
      .filter(Boolean),
  )];

  return {
    level,
    label: LABELS[level] || level,
    lifecycle,
    expire_at: expiries.length === 1 ? expiries[0] : null,
  };
}

function projectDiagnosticPoints(recovery, profile) {
  const state = token(recovery?.state);
  if (["checking", "in_progress"].includes(state)) {
    return { status: "pending", value: null, source: "history_recovery" };
  }

  const recovered = nullableNonNegativeInt(recovery?.current_points_total);
  if (recovered !== null) {
    return {
      status: ["reconciled", "review_required"].includes(state) ? "verified" : "available",
      value: recovered,
      source: "history_recovery",
    };
  }

  const points = plain(profile?.customer_360?.points) ? profile.customer_360.points : null;
  const profileValue = token(points?.status) === "verified" ? nullableNonNegativeInt(points?.active_points) : null;
  if (profileValue !== null) {
    return { status: "verified", value: profileValue, source: "canonical_profile" };
  }
  return { status: "unavailable", value: null, source: null };
}

async function readAcceptanceEvidence(env, lineUserId) {
  const store = env.LIFF_IDENTITY_KV;
  const secret = text(env.LIFF_SESSION_SECRET);
  if (!store?.get || secret.length < 32) return null;
  try {
    const fingerprint = (await hmacHex(secret, `my-mmd-acceptance:${lineUserId}`)).slice(0, 24);
    const value = await store.get(`ops:my-mmd:acceptance:${fingerprint}`, "json");
    return plain(value) ? value : null;
  } catch {
    return null;
  }
}

async function readProtectedActiveThroughAnchor(env, lineUserId) {
  const store = env.LIFF_IDENTITY_KV;
  const secret = text(env.LIFF_SESSION_SECRET);
  if (!store?.get || secret.length < 32) return null;
  try {
    const fingerprint = (await hmacHex(secret, `protected-active-through:${lineUserId}`)).slice(0, 32);
    const value = await store.get(`my-mmd:protected-active-through:v1:${fingerprint}`, "json");
    return plain(value) ? value : null;
  } catch {
    return null;
  }
}

function authorized(request) {
  if (!(request instanceof Request)) return false;
  let url;
  try { url = new URL(request.url); } catch { return false; }
  return (
    request.method === "POST"
    && url.pathname === OWNER_MY_MMD_RECOVERY_RPC_PATH
    && url.hostname === SERVICE_HOST
    && token(request.headers.get("x-mmd-internal-call")) === "true"
    && text(request.headers.get("x-mmd-service-binding")) === ALLOWED_CALLER
  );
}

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(secret || "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(value || "")));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function highest(values = []) {
  const set = new Set(values);
  return CAPABILITY_PRIORITY.find((value) => set.has(value)) || "";
}

function uniqueLifecycle(rows = []) {
  const order = ["active", "expiring_soon", "grace", "expired", "inactive", "pending", "revoked", "blocked"];
  for (const lifecycle of order) {
    if (rows.some((item) => token(item?.lifecycle) === lifecycle)) return lifecycle;
  }
  return "";
}

function uniqueTokens(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(token).filter(Boolean))];
}

function canonicalLineId(value) {
  const id = text(value);
  return /^U[0-9a-f]{32}$/i.test(id) ? id : "";
}

function firstDate(...values) {
  for (const value of values) {
    const raw = text(value);
    if (!raw) continue;
    const direct = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`;
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  }
  return "";
}

function safeEvidenceId(value) {
  const id = text(value);
  return /^mmdacc_[a-f0-9]{24}$/i.test(id) ? id : null;
}

function safeTimestamp(value) {
  const raw = text(value);
  const parsed = Date.parse(raw);
  return raw && Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function nullableNonNegativeInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function nonNegativeInt(value) {
  return nullableNonNegativeInt(value) ?? 0;
}

function safeText(value, max = 120) {
  return text(value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").slice(0, max);
}

function plain(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function token(value) {
  return text(value).toLowerCase().normalize("NFKC")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function text(value) {
  return value == null ? "" : String(value).trim();
}

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-mmd-owner-my-mmd-diagnostic": "v1",
    },
  });
}

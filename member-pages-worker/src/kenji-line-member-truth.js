const PATH = "/__internal/kenji/member-truth";
const SERVICE_HOST = "member-pages-worker.internal";
const ALLOWED_CALLER = "member-dashboard-chat-worker";
const MEMBER_PROFILE_PATH = "/__internal/member-profile/read";
const MEMBER_PROFILE_PURPOSE = "liff_member_profile_read";
const MEMBER_RESOLVER_SECRET_HEADER = "x-mmd-member-resolver-secret";
const RESOLVER_SCHEMA = "my_mmd_entitlement_resolver_v1";
const TIMEOUT_MS = 2500;

const CAPABILITY_PRIORITY = Object.freeze([
  "black_card",
  "svip",
  "vip",
  "private_premium",
  "private_standard",
  "red_card",
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
  public_member: "Public Member",
  guest_pass: "Guest Pass",
});

const LIFECYCLE_PRIORITY = Object.freeze([
  "active",
  "expiring_soon",
  "grace",
  "expired",
  "inactive",
  "pending",
  "revoked",
  "blocked",
]);

function text(value) {
  return value == null ? "" : String(value).trim();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function canonicalLineId(value) {
  const id = text(value);
  return /^U[0-9a-f]{32}$/i.test(id) ? id : "";
}

function safeDisplayName(value) {
  return text(value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").slice(0, 120);
}

function safeTokens(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => text(item).toLowerCase()).filter(Boolean).slice(0, 40);
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-mmd-truth-authority": RESOLVER_SCHEMA,
    },
  });
}

function authorized(request) {
  if (!(request instanceof Request)) return false;
  let url;
  try { url = new URL(request.url); } catch { return false; }
  return (
    request.method === "POST" &&
    url.pathname === PATH &&
    url.hostname === SERVICE_HOST &&
    text(request.headers.get("x-mmd-internal-call")).toLowerCase() === "true" &&
    text(request.headers.get("x-mmd-service-binding")) === ALLOWED_CALLER
  );
}

export function isKenjiLineMemberTruthRequest(request) {
  if (!(request instanceof Request)) return false;
  try {
    return request.method === "POST" && new URL(request.url).pathname === PATH;
  } catch {
    return false;
  }
}

async function readCanonicalMemberProfile(env, lineUserId) {
  const resolver = env.MEMBER_STATUS_RESOLVER;
  const secret = text(env.MEMBER_STATUS_RESOLVER_SECRET);
  if (!resolver?.fetch || secret.length < 32) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("kenji_member_truth_timeout"), TIMEOUT_MS);
  try {
    const response = await resolver.fetch(new Request(`https://mmd-auth-worker.internal${MEMBER_PROFILE_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [MEMBER_RESOLVER_SECRET_HEADER]: secret,
      },
      body: JSON.stringify({ line_user_id: lineUserId, purpose: MEMBER_PROFILE_PURPOSE }),
      signal: controller.signal,
    }));
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null);
    const data = isPlainObject(payload?.data) ? payload.data : null;
    if (payload?.ok !== true || data?.member_exists !== true) return null;
    const profile = isPlainObject(data.profile) ? data.profile : null;
    const snapshot = isPlainObject(data.entitlement_snapshot)
      ? data.entitlement_snapshot
      : (isPlainObject(profile?.entitlement_snapshot) ? profile.entitlement_snapshot : null);
    if (!profile || !snapshot) return null;
    return { profile, snapshot };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function highest(values = []) {
  const set = new Set(values);
  return CAPABILITY_PRIORITY.find((capability) => set.has(capability)) || "";
}

function matchingEntitlements(snapshot, capability) {
  const rows = Array.isArray(snapshot?.entitlements) ? snapshot.entitlements : [];
  return rows.filter((item) => text(item?.capability).toLowerCase() === capability);
}

function lifecycleFor(snapshot, capability, bucket) {
  if (snapshot?.member_blocked === true) return "blocked";
  const rows = matchingEntitlements(snapshot, capability);
  for (const lifecycle of LIFECYCLE_PRIORITY) {
    if (rows.some((item) => text(item?.lifecycle).toLowerCase() === lifecycle)) return lifecycle;
  }
  if (bucket === "active") return "active";
  if (bucket === "grace") return "grace";
  return "inactive";
}

function uniqueExpiry(snapshot, capability, lifecycle) {
  const values = [...new Set(
    matchingEntitlements(snapshot, capability)
      .filter((item) => !lifecycle || text(item?.lifecycle).toLowerCase() === lifecycle)
      .map((item) => text(item?.expire_at))
      .filter(Boolean),
  )];
  return values.length === 1 ? values[0] : "";
}

function projectMembership(snapshot = {}) {
  if (!isPlainObject(snapshot)) return null;
  if (snapshot.schema_version !== RESOLVER_SCHEMA || snapshot.source_status !== "verified" || snapshot.fail_closed !== true) return null;

  const state = isPlainObject(snapshot.capability_state) ? snapshot.capability_state : {};
  const active = safeTokens(state.active);
  const grace = safeTokens(state.grace);
  const inactive = safeTokens(state.inactive);
  const recognized = safeTokens(state.recognized);

  let bucket = "active";
  let capability = highest(active);
  if (!capability) {
    bucket = "grace";
    capability = highest(grace);
  }
  if (!capability) {
    bucket = "inactive";
    capability = highest(inactive) || highest(recognized);
  }

  const access = isPlainObject(snapshot.access) ? snapshot.access : {};
  const lifecycle = capability ? lifecycleFor(snapshot, capability, bucket) : (snapshot.member_blocked === true ? "blocked" : "inactive");
  return {
    level: capability || "none",
    label: LABELS[capability] || "Member",
    lifecycle,
    expire_at: capability ? uniqueExpiry(snapshot, capability, lifecycle) : "",
    public_service_access: snapshot.member_blocked === true ? false : access.public_service_access === true,
    private_visibility_envelope: snapshot.member_blocked === true ? "none" : text(access.private_visibility_envelope || "none").toLowerCase(),
    member_blocked: snapshot.member_blocked === true,
  };
}

function projectPoints(profile = {}) {
  const points = isPlainObject(profile?.customer_360?.points) ? profile.customer_360.points : null;
  if (points?.status !== "verified") return { status: "unavailable", active_points: null };
  const value = Number(points.active_points);
  return Number.isFinite(value) && value >= 0
    ? { status: "verified", active_points: Math.floor(value) }
    : { status: "unavailable", active_points: null };
}

export function projectKenjiLineMemberTruth(resolved = {}) {
  const profile = isPlainObject(resolved.profile) ? resolved.profile : {};
  const snapshot = isPlainObject(resolved.snapshot) ? resolved.snapshot : null;
  const membership = projectMembership(snapshot);
  if (!membership) return null;
  return {
    ok: true,
    authority: RESOLVER_SCHEMA,
    identity_status: "resolved",
    display_name: safeDisplayName(profile.display_name),
    membership,
    points: projectPoints(profile),
  };
}

export async function handleKenjiLineMemberTruth(request, env = {}) {
  if (!authorized(request)) return json({ ok: false, error: "not_found" }, 404);
  const body = await request.json().catch(() => null);
  if (!isPlainObject(body) || Object.keys(body).some((key) => key !== "line_user_id")) {
    return json({ ok: false, error: "invalid_request" }, 400);
  }
  const lineUserId = canonicalLineId(body.line_user_id);
  if (!lineUserId) return json({ ok: false, error: "invalid_request" }, 400);

  const resolved = await readCanonicalMemberProfile(env, lineUserId);
  const projection = projectKenjiLineMemberTruth(resolved || {});
  if (!projection) {
    return json({ ok: false, status: "unavailable", authority: RESOLVER_SCHEMA }, 503);
  }
  return json(projection);
}

export const KENJI_LINE_MEMBER_TRUTH_PATH = PATH;

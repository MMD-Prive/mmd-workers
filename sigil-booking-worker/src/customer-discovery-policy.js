// Server-only discovery policy. Never project this field or a deny reason to clients.
export const DISCOVERY_POLICY_FIELD = "customer_discovery_policy_json";
const MEMBER_REF = /^[a-f0-9]{64}$/;
const SESSION_COOKIE = "__Host-mmd_liff_session";
const DISCOVERY_COOKIE = "__Secure-mmd_discovery_session";

export function customerDiscoveryAllowed(fields = {}, viewerRef = "") {
  const raw = fields[DISCOVERY_POLICY_FIELD];
  if (raw === undefined || raw === null || raw === "") return true;
  let policy;
  try { policy = typeof raw === "string" && raw.length <= 40000 ? JSON.parse(raw) : null; } catch { return false; }
  if (!policy || policy.schema_version !== "model_customer_discovery_v1"
    || typeof policy.require_verified_customer !== "boolean"
    || !Array.isArray(policy.blocked_member_refs) || policy.blocked_member_refs.length > 500
    || policy.blocked_member_refs.some(ref => typeof ref !== "string" || !MEMBER_REF.test(ref))) return false;
  // A restricted Model cannot be rediscovered simply by signing out.
  if ((policy.require_verified_customer || policy.blocked_member_refs.length) && !MEMBER_REF.test(viewerRef)) return false;
  return !policy.blocked_member_refs.includes(viewerRef);
}

export async function resolveDiscoveryViewer(request, env = {}) {
  // Browser-provided member IDs, headers, booking refs, emails and query strings
  // are never identity proof. The existing member service validates the session.
  const cookies = String(request.headers.get("cookie") || "").split(";")
    .map(part => part.trim()).filter(part => part.startsWith(SESSION_COOKIE + "=") || part.startsWith(DISCOVERY_COOKIE + "="));
  const secret = String(env.AUTH_SERVICE_SIGIL_BOOKING_TO_MEMBER_PAGES || "");
  if (cookies.length < 1 || cookies.length > 2 || cookies[0].length > 4096 || !env.MEMBER_PAGES_WORKER?.fetch || secret.length < 32) return "";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await env.MEMBER_PAGES_WORKER.fetch(new Request("https://member-pages.internal/__internal/booking/discovery-viewer", {
      headers: { cookie: cookies.join("; "), accept: "application/json", "x-mmd-booking-service-secret": secret }, signal: controller.signal,
    }));
    if (!response.ok) return "";
    const payload = await response.json();
    if (payload.ok !== true) return "";
    return MEMBER_REF.test(payload.memberRef || "") ? payload.memberRef : "";
  } catch { return ""; }
  finally { clearTimeout(timeout); }
}

// Unlike search's anonymous fallback, booking needs a precise login/outage result.
export async function resolveBookingViewer(request, env = {}) {
  const cookies = String(request.headers.get("cookie") || "").split(";").map(v => v.trim())
    .filter(v => v.startsWith(SESSION_COOKIE + "=") || v.startsWith(DISCOVERY_COOKIE + "="));
  if (!cookies.length) return { ok: false, error: "login_required", status: 401 };
  const unavailable = { ok: false, error: "membership_status_unavailable", status: 503 };
  if (cookies.length > 2 || cookies.some(v => v.length > 4096) || new Set(cookies.map(v => v.split("=")[0])).size !== cookies.length) return { ok: false, error: "login_required", status: 401 };
  const secret = String(env.AUTH_SERVICE_SIGIL_BOOKING_TO_MEMBER_PAGES || "");
  if (!env.MEMBER_PAGES_WORKER?.fetch || secret.length < 32) return unavailable;
  const controller = new AbortController(); let timer;
  try {
    return await Promise.race([(async () => {
      const response = await env.MEMBER_PAGES_WORKER.fetch(new Request("https://member-pages.internal/__internal/booking/discovery-viewer?context=booking", {
        headers: {cookie:cookies.join("; "), "x-mmd-booking-service-secret":secret}, signal:controller.signal,
      }));
      if (response.status === 401) return { ok:false, error:"login_required", status:401 };
      if (response.status === 403) return {ok:false,error:"public_membership_required",status:403};
      if (!response.ok) return unavailable;
      const data = await response.json();
      if (data.ok !== true || !MEMBER_REF.test(data.memberRef || "") || typeof data.memberId !== "string" || !data.memberId.trim() || data.memberId.length > 160) return unavailable;
      const name = data.perRename?.source === "linked_per_rename_index_v1" && typeof data.perRename.per_rename === "string" ? data.perRename.per_rename.trim().slice(0,160) : "";
      return {ok:true, memberRef:data.memberRef, memberId:data.memberId, perRename:name && !/U[0-9a-f]{32}/i.test(name) ? {per_rename:name, source:"linked_per_rename_index_v1"} : null};
    })(), new Promise(resolve => { timer=setTimeout(() => { controller.abort(); resolve(unavailable); },5000); })]);
  } catch { return unavailable; }
  finally { clearTimeout(timer); controller.abort(); }
}

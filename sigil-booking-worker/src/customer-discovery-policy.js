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

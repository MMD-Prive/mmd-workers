import { resolveBookingPerRename } from "./booking-customer-identity.js";
import { verifyBookingMemberBinding } from "./booking-member-binding.js";
import { readMemberAppSession } from "./member-app-api-runtime.js";

export const DISCOVERY_VIEWER_PATH = "/__internal/booking/discovery-viewer";

// Read-only: do not rotate the member cookie while authorizing search or media.
export async function handleDiscoveryViewer(request, env = {}, readSession = readMemberAppSession) {
  const headers = { "content-type": "application/json", "cache-control": "private, no-store" };
  const respond = (body, status) => Response.json(body, { status, headers });
  if (request.method !== "GET") return respond({ ok: false }, 405);
  const expected = String(env.AUTH_SERVICE_SIGIL_BOOKING_TO_MEMBER_PAGES || "");
  const supplied = String(request.headers.get("x-mmd-booking-service-secret") || "");
  let difference = expected.length ^ supplied.length;
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ (supplied.charCodeAt(i) || 0);
  if (expected.length < 32 || difference !== 0) return respond({ ok: false }, 401);
  try {
    const context = new URL(request.url).searchParams.get("context");
    const requireCurrentBinding = context === "booking" || context === "identity";
    let sourceRequest = request;
    const alias = cookieValue(request, "__Secure-mmd_discovery_session");
    if (alias) {
      if (!/^[a-f0-9]{64}$/.test(alias)) return respond({ ok: false }, 401);
      if (!env.LIFF_IDENTITY_KV?.get) return respond({ok:false},503);
      const record = await env.LIFF_IDENTITY_KV.get("booking-discovery:" + alias, "json");
      if (!record || record.expires_at <= Date.now() || !/^[a-f0-9]{64}$/.test(record.session_token || "")) return respond({ ok: false }, 401);
      sourceRequest = new Request(request.url, { headers: { cookie: "__Host-mmd_liff_session=" + record.session_token } });
    }
    const session = await readSession(sourceRequest, env, {throwOnUnavailable:requireCurrentBinding});
    const status = String(session?.memberProfile?.membership_status || session?.memberProfile?.status || "").toLowerCase();
    if (context === "booking" && session?.lineUserId && (session.memberExists !== true || !session.memberId)) return respond({ok:false,error:"public_membership_required"},403);
    if (!session?.lineUserId || session.memberExists !== true || !session.memberId || session.readGraceOnly === true
      || ["blocked", "suspended", "revoked", "pending_review"].includes(status)) return respond({ ok: false }, 401);
    let memberId = session.memberId;
    if (requireCurrentBinding) {
      const binding = await verifyBookingMemberBinding(env, session.lineUserId, session.memberId);
      if (!binding.ok) return respond({ ok: false, error: binding.error }, binding.status);
      memberId = binding.memberId;
    }
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("mmd-discovery-member-v1:" + memberId));
    const memberRef = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
    if (context === "booking") {
      // Additional identity stays behind this route's service-secret check.
      const perRename = await resolveBookingPerRename(env, session.lineUserId).catch(() => null);
      return respond({ ok: true, identity_binding_verified: true, memberRef, memberId, perRename }, 200);
    }
    if (context === "identity") return respond({ ok: true, identity_binding_verified: true, memberRef }, 200);
    return respond({ ok: true, memberRef }, 200);
  } catch { return respond({ ok: false }, 503); }
}


function cookieValue(request, name) {
  const parts = String(request.headers.get("cookie") || "").split(";").map(part => part.trim())
    .filter(part => part.startsWith(name + "="));
  return parts.length === 1 ? parts[0].slice(name.length + 1) : "";
}

// Only a verified login response from the member's own host may issue this
// scoped alias. The primary __Host session is never broadened or sent to SIGIL.
export async function attachDiscoverySession(request, env, response, readSession = readMemberAppSession) {
  const url = new URL(request.url);
  if (!["https://mmdbkk.com", "https://www.mmdbkk.com"].includes(url.origin)
    || !response.ok || !env.LIFF_IDENTITY_KV?.put
    || !/^\/(?:member\/api\/liff\/|api\/member\/app\/)/.test(url.pathname)) return response;
  const cookies = response.headers.get("set-cookie") || "";
  const match = /(?:^|,\s*)__Host-mmd_liff_session=([a-f0-9]{64})(?:;|$)/.exec(cookies);
  if (!match) return response;
  try {
    const source = new Request(request.url, { headers: { cookie: "__Host-mmd_liff_session=" + match[1] } });
    const session = await readSession(source, env);
    // The alias proves a verified login, not paid membership. A nonmember needs
    // this alias to receive the booking-specific signup response instead of a login loop.
    if (!session?.lineUserId || session.readGraceOnly === true) return response;
    const status = String(session.memberProfile?.membership_status || session.memberProfile?.status || "").toLowerCase();
    if (["blocked", "suspended", "revoked", "pending_review"].includes(status)) return response;
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const alias = [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
    await env.LIFF_IDENTITY_KV.put("booking-discovery:" + alias,
      JSON.stringify({ session_token: match[1], expires_at: Date.now() + 1800000 }), { expirationTtl: 1800 });
    const headers = new Headers(response.headers);
    headers.append("set-cookie", "__Secure-mmd_discovery_session=" + alias + "; Domain=mmdbkk.com; Path=/sigil/api/; Max-Age=1800; HttpOnly; Secure; SameSite=Strict");
    headers.set("cache-control", "private, no-store");
    return new Response(response.body, { status: response.status, headers });
  } catch { return response; } // Normal member login remains available.
}

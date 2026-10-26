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
    let sourceRequest = request;
    const alias = cookieValue(request, "__Secure-mmd_discovery_session");
    if (alias) {
      if (!/^[a-f0-9]{64}$/.test(alias) || !env.LIFF_IDENTITY_KV?.get) return respond({ ok: false }, 401);
      const record = await env.LIFF_IDENTITY_KV.get("booking-discovery:" + alias, "json");
      if (!record || record.expires_at <= Date.now() || !/^[a-f0-9]{64}$/.test(record.session_token || "")) return respond({ ok: false }, 401);
      sourceRequest = new Request(request.url, { headers: { cookie: "__Host-mmd_liff_session=" + record.session_token } });
    }
    const session = await readSession(sourceRequest, env);
    const status = String(session?.memberProfile?.membership_status || session?.memberProfile?.status || "").toLowerCase();
    if (!session?.lineUserId || session.memberExists !== true || !session.memberId || session.readGraceOnly === true
      || ["blocked", "suspended", "revoked", "pending_review"].includes(status)) return respond({ ok: false }, 401);
    const secret = String(env.LIFF_SESSION_SECRET || "");
    if (secret.length < 32) return respond({ ok: false }, 503);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("member-binding:" + session.memberId));
    const memberRef = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
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
    if (!session?.lineUserId || !session.memberId || session.memberExists !== true || session.readGraceOnly === true) return response;
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

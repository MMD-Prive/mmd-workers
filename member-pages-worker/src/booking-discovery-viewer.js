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
    const session = await readSession(request, env);
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

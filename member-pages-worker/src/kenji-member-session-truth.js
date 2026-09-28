import { readMemberAppSession } from "./member-app-api-runtime.js";
import { handleKenjiLineMemberTruth } from "./kenji-line-member-truth.js";

const PATH = "/__internal/kenji/member-session-truth";
const SERVICE_HOST = "member-pages-worker.internal";
const ALLOWED_CALLER = "member-dashboard-chat-worker";

function text(value) {
  return value == null ? "" : String(value).trim();
}

function authorized(request) {
  if (!(request instanceof Request)) return false;
  let url;
  try { url = new URL(request.url); } catch { return false; }
  return request.method === "POST"
    && url.pathname === PATH
    && url.hostname === SERVICE_HOST
    && text(request.headers.get("x-mmd-internal-call")).toLowerCase() === "true"
    && text(request.headers.get("x-mmd-service-binding")) === ALLOWED_CALLER;
}

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: { "cache-control": "no-store", "x-mmd-kenji-session-truth": "v1" },
  });
}

export function isKenjiMemberSessionTruthRequest(request) {
  if (!(request instanceof Request)) return false;
  try {
    return request.method === "POST" && new URL(request.url).pathname === PATH;
  } catch {
    return false;
  }
}

export async function handleKenjiMemberSessionTruth(request, env = {}) {
  if (!authorized(request)) return json({ ok: false, error: "not_found" }, 404);

  const session = await readMemberAppSession(request, env);
  if (!session?.lineUserId) return json({ ok: false, error: "member_session_required" }, 401);

  const truthRequest = new Request("https://member-pages-worker.internal/__internal/kenji/member-truth", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mmd-internal-call": "true",
      "x-mmd-service-binding": ALLOWED_CALLER,
    },
    body: JSON.stringify({ line_user_id: session.lineUserId }),
  });
  return handleKenjiLineMemberTruth(truthRequest, env);
}

export const KENJI_MEMBER_SESSION_TRUTH_PATH = PATH;

import { readCredentialBoundAdminActor } from "./credential-bound-admin-session.js";

// Owner-only trigger for member-pages-worker's resolver diagnostic RPC.
// POST /internal/admin with a credential-bound admin session, same-origin,
// no query and no body. Every rejection is an indistinguishable empty 404 so
// the trigger is not discoverable; GET/HEAD keep the existing admin behavior.
export const MEMBER_RESOLVER_DIAGNOSTIC_TRIGGER_PATH = "/internal/admin";

const HEALTHY_ZERO_MATCH = "healthy_zero_match";
const GENERIC_FAILURE = "generic_failure";

export function isMemberResolverDiagnosticTriggerRequest(request) {
  if (String(request.method || "").toUpperCase() !== "POST") return false;
  return new URL(request.url).pathname === MEMBER_RESOLVER_DIAGNOSTIC_TRIGGER_PATH;
}

export async function handleMemberResolverDiagnosticTrigger(request, env = {}) {
  const url = new URL(request.url);
  if (url.search) return notFound();
  if (String(request.headers.get("origin") || "").trim() !== url.origin) return notFound();

  let actor = null;
  try {
    actor = await readCredentialBoundAdminActor(request, env);
  } catch {
    actor = null;
  }
  if (!actor) return notFound();

  let body = "";
  try {
    body = await request.text();
  } catch {
    return notFound();
  }
  if (body !== "") return notFound();

  const service = env.MEMBER_PAGES_RESOLVER_DIAGNOSTIC;
  if (typeof service?.runMemberResolverDiagnostic !== "function") return text(GENERIC_FAILURE, 503);

  let result;
  try {
    result = await service.runMemberResolverDiagnostic();
  } catch {
    result = GENERIC_FAILURE;
  }
  return result === HEALTHY_ZERO_MATCH ? text(HEALTHY_ZERO_MATCH, 200) : text(GENERIC_FAILURE, 503);
}

function notFound() {
  return new Response(null, { status: 404, headers: { "cache-control": "no-store, private" } });
}

function text(value, status) {
  return new Response(value, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store, private",
      "x-content-type-options": "nosniff",
    },
  });
}

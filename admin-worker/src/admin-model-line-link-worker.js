import delegatedWorker from "./admin-login-hero-worker-pre-model-line-link.js";
import { readCredentialBoundAdminActor } from "./credential-bound-admin-session.js";
import {
  MODEL_LINE_LINK_BIND_MODE,
  bindVerifiedModelLineClaim,
  isModelLineLinkCandidatesRequest,
  isModelLineLinkClaimsRequest,
  isModelLineLinkPage,
  listModelLineCandidates,
} from "./model-line-link-review.js";
import {
  listPendingModelLineClaimsWithAvatar,
  renderModelLineLinkPageWithAvatar,
} from "./model-line-avatar-review.js";

export * from "./admin-login-hero-worker-pre-model-line-link.js";

export const CANONICAL_MODEL_LINE_LINK_PATH = "/internal/admin/model-link";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const canonicalPage = isCanonicalModelLineLinkPage(request);
    const legacyPage = isModelLineLinkPage(request);

    if (canonicalPage || legacyPage) {
      const auth = await requireOwner(request, env);
      if (auth.response) {
        if (auth.response.status === 401) return redirectToAdminLogin(request);
        return auth.response;
      }

      // The query-string Kenji view remains compatibility-only. Once an
      // authenticated request reaches it, move to the exact queryless route so
      // browser navigation can never fall through to Webflow's 404 surface.
      if (legacyPage) return redirectToCanonicalModelLineLink(request);

      const response = renderModelLineLinkPageWithAvatar();
      if (request.method.toUpperCase() !== "HEAD") return response;
      return new Response(null, { status: response.status, headers: response.headers });
    }

    if (isModelLineLinkClaimsRequest(request)) {
      const auth = await requireOwner(request, env);
      if (auth.response) return auth.response;
      const result = await listPendingModelLineClaimsWithAvatar(env);
      return result.ok ? json(result, 200) : json({ ok: false, error: result.error }, result.status || 503);
    }

    if (isModelLineLinkCandidatesRequest(request)) {
      const auth = await requireOwner(request, env);
      if (auth.response) return auth.response;
      const result = await listModelLineCandidates(env, url);
      return result.ok ? json(result, 200) : json({ ok: false, error: result.error }, result.status || 503);
    }

    if (path === "/v1/admin/model/activation/issue" && request.method.toUpperCase() === "POST") {
      const body = await request.clone().json().catch(() => null);
      if (body?.mode === MODEL_LINE_LINK_BIND_MODE) {
        const auth = await requireOwner(request, env);
        if (auth.response) return auth.response;
        return bindVerifiedModelLineClaim(request, env, auth.actor);
      }
    }

    return delegatedWorker.fetch(request, env, ctx);
  },
};

export function isCanonicalModelLineLinkPage(request) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  return (method === "GET" || method === "HEAD")
    && normalizePath(url.pathname) === CANONICAL_MODEL_LINE_LINK_PATH;
}

async function requireOwner(request, env) {
  const url = new URL(request.url);
  if (url.hostname !== "mmdbkk.com" && url.hostname !== "www.mmdbkk.com") {
    return { actor: null, response: json({ ok: false, error: "admin_host_not_allowed" }, 403) };
  }
  const actor = await readCredentialBoundAdminActor(request, env);
  if (!actor) return { actor: null, response: json({ ok: false, error: "unauthorized" }, 401) };
  if (String(actor.role || "").toLowerCase() === "mms_partner") {
    return { actor: null, response: json({ ok: false, error: "mms_partner_scope_forbidden" }, 403) };
  }
  return { actor, response: null };
}

export function modelLineLinkLoginLocation(request) {
  const url = new URL(request.url);
  // Use the canonical queryless owner surface as the post-login destination.
  // This avoids the previous Kenji hash bridge and keeps browser history,
  // login restore, and route smoke tests aligned on one URL.
  return `${url.origin}/internal/admin/login?next=${encodeURIComponent(CANONICAL_MODEL_LINE_LINK_PATH)}`;
}

export function modelLineLinkCanonicalLocation(request) {
  const url = new URL(request.url);
  return `${url.origin}${CANONICAL_MODEL_LINE_LINK_PATH}`;
}

function redirectToAdminLogin(request) {
  return new Response(null, {
    status: 303,
    headers: {
      location: modelLineLinkLoginLocation(request),
      "cache-control": "no-store, private",
    },
  });
}

function redirectToCanonicalModelLineLink(request) {
  return new Response(null, {
    status: 303,
    headers: {
      location: modelLineLinkCanonicalLocation(request),
      "cache-control": "no-store, private",
    },
  });
}

function normalizePath(pathname) {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private",
    },
  });
}

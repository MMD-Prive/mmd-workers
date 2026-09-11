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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);

    if (isModelLineLinkPage(request)) {
      const auth = await requireOwner(request, env);
      if (auth.response) {
        if (auth.response.status === 401) return redirectToAdminLogin(request);
        return auth.response;
      }
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
  const next = `${normalizePath(url.pathname)}${url.search}`;
  return `${url.origin}/internal/admin/login?next=${encodeURIComponent(next)}`;
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

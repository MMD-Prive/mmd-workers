import { renderOwnerMyMmdRecoveryPage as renderPage } from "./owner-my-mmd-recovery-page.js";
import { resolveLiveCanonicalClient } from "./kenji-lv5-live-context.js";
import { handleCreateSessionClientLineageRequest } from "./create-session-client-lineage-runtime.js";
import { resolveOwnerRecoveryIdentity } from "./owner-recovery-identity.js";

export const OWNER_MY_MMD_RECOVERY_PAGE_PATH = "/internal/admin/my-mmd/recovery";
export const OWNER_MY_MMD_RECOVERY_API_PATH = "/v1/admin/my-mmd/recovery-diagnostic";

const MEMBER_PAGES_RPC_PATH = "/__internal/admin/my-mmd/recovery-diagnostic";

export function isOwnerMyMmdRecoveryDiagnosticRequest(path, method) {
  const m = String(method || "").toUpperCase();
  return (
    (path === OWNER_MY_MMD_RECOVERY_PAGE_PATH && (m === "GET" || m === "HEAD"))
    || (path === OWNER_MY_MMD_RECOVERY_API_PATH && (m === "GET" || m === "POST"))
  );
}

export async function handleOwnerMyMmdRecoveryDiagnostic(request, env = {}, actor = null) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method.toUpperCase();

  if (!isOwnerActor(actor)) {
    return path === OWNER_MY_MMD_RECOVERY_PAGE_PATH
      ? html(renderForbidden(), 403)
      : json({ ok: false, error: "owner_required" }, 403);
  }

  if (path === OWNER_MY_MMD_RECOVERY_PAGE_PATH) {
    if (method === "HEAD") return html("", 200);
    return html(renderPage(url.searchParams.get("q") || ""), 200);
  }

  const refresh = method === "POST";
  let body = null;
  if (refresh) {
    if (request.headers.get("origin") !== url.origin || !["https://mmdbkk.com", "https://www.mmdbkk.com"].includes(url.origin)) {
      return json({ ok: false, error: "origin_not_allowed" }, 403);
    }
    body = await request.json().catch(() => null);
    if (!body || body.confirm_reviewed !== true || !recordId(body.client_id) || Object.keys(body).some(key => !["client_id", "confirm_reviewed"].includes(key))) {
      return json({ ok: false, error: "review_confirmation_required" }, 400);
    }
  }
  const query = clean(url.searchParams.get("q"), 120);
  const mergeRequestId = clean(url.searchParams.get("request_id"), 80).toUpperCase();
  const inbox = url.searchParams.get("inbox") === "1";
  const clientId = recordId(refresh ? body.client_id : url.searchParams.get("client_id"));
  if (mergeRequestId) {
    if (!/^IMR-[A-Z0-9]{6,40}$/.test(mergeRequestId)) return json({ ok: false, error: "invalid_request_id" }, 400);
    const binding = env.MEMBER_PAGES_MEMBER_WALLET;
    if (!binding?.fetch) return json({ ok: false, state: "unavailable", error: "member_pages_binding_missing" }, 503);
    const response = await binding.fetch(new Request(`https://member-pages-worker.internal${MEMBER_PAGES_RPC_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-mmd-internal-call": "true", "x-mmd-service-binding": "admin-worker" },
      body: JSON.stringify({ merge_request_id: mergeRequestId }),
    }));
    const payload = await response.json().catch(() => null);
    return json({
      ok: response.ok && payload?.ok === true,
      authority: "mmd.owner_my_mmd_recovery_diagnostic.v1",
      customer: { display_name: "สมาชิก MMD (คำขอ recovery)", canonical_client_id: null, source: "identity_recovery_request" },
      identity_recovery_request: payload?.identity_recovery_request || { found: false, state: "unavailable" },
      guardrails: { owner_session_required: true, browser_raw_line_user_id_exposed: false, customer_session_required: false, read_only: true },
      ...(payload?.error ? { error: payload.error } : {}),
    }, response.ok ? 200 : (response.status || 503));
  }
  if (inbox) {
    const binding = env.MEMBER_PAGES_MEMBER_WALLET;
    if (!binding?.fetch) return json({ ok: false, state: "unavailable", error: "member_pages_binding_missing" }, 503);
    const response = await binding.fetch(new Request(`https://member-pages-worker.internal${MEMBER_PAGES_RPC_PATH}`, { method: "POST", headers: { "content-type": "application/json", "x-mmd-internal-call": "true", "x-mmd-service-binding": "admin-worker" }, body: JSON.stringify({ recovery_inbox: true }) }));
    const payload = await response.json().catch(() => null);
    return json({ ok: response.ok && payload?.ok === true, recovery_inbox: payload?.recovery_inbox || { state: "unavailable", items: [] }, guardrails: { owner_session_required: true, browser_raw_line_user_id_exposed: false, customer_session_required: false, read_only: true } }, response.ok ? 200 : (response.status || 503));
  }
  if (!query && !clientId) return json({ ok: false, error: "query_required" }, 400);

  const identity = await resolveOwnerRecoveryIdentity(env, clientId
    ? { canonical_client_id: clientId }
    : { client_query: query }, { resolve: resolveLiveCanonicalClient, lookup: handleCreateSessionClientLineageRequest });

  if (!identity || identity.status !== "resolved" || !recordId(identity?.client?.canonical_client_id)) {
    return json({
      ok: false,
      state: identity?.status === "unavailable" ? "unavailable" : "unresolved",
      error: identity?.reason || "canonical_client_unresolved",
      choices: Array.isArray(identity?.choices)
        ? identity.choices.slice(0, 12).map((item) => ({
            client_id: recordId(item.client_id) || null,
            display_name: clean(item.display_name, 120) || null,
            matched_on: clean(item.matched_on, 80) || null,
            matched_value: clean(item.matched_value, 120) || null,
          }))
        : [],
    }, identity?.status === "unavailable" ? 503 : identity?.choices?.length || identity?.reason?.includes("multiple") || identity?.reason?.includes("ambiguous") ? 409 : 404);
  }

  const lineUserId = lineId(identity.client.line_user_id);
  if (!lineUserId) {
    return json({
      ok: false,
      state: "unavailable",
      error: "canonical_client_line_identity_missing",
      customer: safeCustomer(identity.client),
    }, 409);
  }

  const binding = env.MEMBER_PAGES_MEMBER_WALLET;
  if (!binding?.fetch) {
    return json({ ok: false, state: "unavailable", error: "member_pages_binding_missing" }, 503);
  }

  let response;
  let payload;
  try {
    response = await binding.fetch(new Request(`https://member-pages-worker.internal${MEMBER_PAGES_RPC_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mmd-internal-call": "true",
        "x-mmd-service-binding": "admin-worker",
      },
      body: JSON.stringify({ line_user_id: lineUserId, ...(refresh ? { refresh_reviewed: true } : {}) }),
    }));
    payload = await response.json().catch(() => null);
  } catch {
    return json({ ok: false, state: "unavailable", error: "member_pages_diagnostic_unavailable" }, 503);
  }

  if (!response.ok || payload?.ok !== true) {
    return json({
      ok: false,
      state: payload?.state || "unavailable",
      error: payload?.error || "member_pages_diagnostic_failed",
      customer: safeCustomer(identity.client),
    }, response.status || 503);
  }

  return json({
    ok: true,
    authority: "mmd.owner_my_mmd_recovery_diagnostic.v1",
    customer: safeCustomer(identity.client),
    membership: payload.membership || null,
    recovery: payload.recovery || null,
    identity_recovery_request: payload.identity_recovery_request || { found: false, state: "unavailable" },
    points: payload.points || null,
    acceptance: payload.acceptance || null,
    guardrails: {
      ...(payload.guardrails || {}),
      owner_session_required: true,
      browser_raw_line_user_id_exposed: false,
      customer_session_required: false,
      read_only: !refresh,
    },
  });
}

export function isOwnerActor(actor) {
  const role = clean(actor?.role, 40).toLowerCase();
  if (role === "owner") return true;
  return (
    clean(actor?.id, 80).toLowerCase() === "per"
    && role === "admin"
    && clean(actor?.auth_method, 40).toLowerCase() === "credential"
  );
}

function safeCustomer(client = {}) {
  return {
    display_name: clean(client.display_name || client.per_rename, 120) || "สมาชิก MMD",
    canonical_client_id: recordId(client.canonical_client_id) || null,
    source: clean(client.source, 80) || "canonical_client",
  };
}


function renderForbidden() {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Owner required</title></head><body style="background:#08090b;color:#fff;font-family:system-ui;padding:40px"><h1>Owner session required</h1><p>หน้านี้เปิดได้เฉพาะ Owner credential-bound session เท่านั้น</p></body></html>`;
}

function recordId(value) {
  const id = clean(value, 80);
  return /^rec[A-Za-z0-9]{6,32}$/.test(id) ? id : "";
}

function lineId(value) {
  const id = clean(value, 80);
  return /^U[0-9a-f]{32}$/i.test(id) ? id : "";
}

function clean(value, max = 500) {
  return String(value == null ? "" : value).trim().replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").slice(0, max);
}


function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate",
      "x-robots-tag": "noindex, nofollow, noarchive",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "x-mmd-owner-surface": "my-mmd-recovery-diagnostic-v1",
    },
  });
}

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-mmd-owner-surface": "my-mmd-recovery-diagnostic-v1",
    },
  });
}



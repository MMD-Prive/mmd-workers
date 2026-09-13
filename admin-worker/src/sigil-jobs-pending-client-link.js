import { readCredentialBoundAdminActor } from "./credential-bound-admin-session.js";
import { canonicalizeSigilJobBody } from "./sigil-jobs-membership-action.js";

export const SIGIL_JOB_CREATE_PATH = "/v1/admin/job/create";
export const PENDING_CLIENT_LINK_MODE = "pending_client_link";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function normalizePath(pathname) {
  const path = clean(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function token(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function isPrivateIntent(body = {}) {
  const details = body.job_details || {};
  const work = body.work || {};
  return [
    body.visibility,
    body.job_visibility,
    body.booking_visibility,
    details.world,
    work.job_visibility,
  ].some((value) => token(value) === "private");
}

// SIGIL Jobs only needs a canonical Client selection to leave the operational
// hold lane. LINE/email/member hints remain useful lookup evidence, but they do
// not need to block Job creation and never grant private entitlement themselves.
export function hasCanonicalClientLink(body = {}) {
  const lineage = body.client_lineage || {};
  return [body.client_record_id, body.client_id, lineage.client_id].some((value) => clean(value));
}

export function shouldCreatePendingClientLink(body = {}) {
  return token(body.operational_create_mode) === PENDING_CLIENT_LINK_MODE &&
    !hasCanonicalClientLink(body);
}

export function buildPendingClientLinkBody(body = {}) {
  const requestedWorld = isPrivateIntent(body) ? "private" : "public";
  const heldWorld = requestedWorld === "private" ? "pending_private" : "public";
  const marker = "[PENDING CLIENT LINK] Confirmation, dispatch and entitlement release are held until canonical Client link.";
  const note = clean(body.note || body.notes);
  const details = body.job_details || {};
  return {
    ...body,
    visibility: heldWorld,
    job_visibility: heldWorld,
    booking_visibility: heldWorld,
    work: { ...(body.work || {}), job_visibility: heldWorld },
    job_details: {
      ...details,
      world: heldWorld,
      requested_world: requestedWorld,
      operational_status: PENDING_CLIENT_LINK_MODE,
      confirmation_hold: true,
      dispatch_hold: true,
    },
    client_lineage: {
      ...(body.client_lineage || {}),
      identity_status: "pending_reconcile",
      manual_public_only: false,
    },
    note: [note, marker].filter(Boolean).join("\n"),
  };
}

// The pending-client-link lane is an alternate create path, so it must pass
// through the exact same membership/payment canonicalizer before it reaches
// coreWorker. This preserves combined-payment arithmetic while keeping all
// confirmation, dispatch and entitlement release holds intact.
export function canonicalizePendingClientLinkBody(body = {}) {
  const canonical = canonicalizeSigilJobBody(body);
  return {
    ...canonical,
    forwarded_body: buildPendingClientLinkBody(canonical.body),
  };
}

function safeRaw(raw = {}) {
  if (!raw || typeof raw !== "object") return undefined;
  return {
    ok: raw.ok,
    session_id: raw.session_id || raw.sessionId || null,
    payment_ref: raw.payment_ref || raw.paymentRef || null,
    job_id: raw.job_id || raw.jobId || raw.data?.job_id || null,
    held: true,
  };
}

export function holdPendingClientLinkResponse(data = {}) {
  const held = { ...data };
  delete held.customer_t;
  delete held.model_t;
  delete held.customer_token;
  delete held.model_token;
  delete held.customer_confirmation_url;
  delete held.model_confirmation_url;
  held.raw = safeRaw(data.raw);
  held.ok = data.ok !== false;
  held.operational_status = PENDING_CLIENT_LINK_MODE;
  held.private_intent = "private";
  held.confirmations_held = true;
  held.dispatch_held = true;
  held.entitlement_release_held = true;
  held.customer_confirmation_url = null;
  held.model_confirmation_url = null;
  return held;
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private",
      ...headers,
    },
  });
}

export async function tryHandleSigilPendingClientLink(request, env, ctx, downstream) {
  const url = new URL(request.url);
  if (request.method.toUpperCase() !== "POST" || normalizePath(url.pathname) !== SIGIL_JOB_CREATE_PATH) return null;

  const body = await request.clone().json().catch(() => ({}));
  if (!shouldCreatePendingClientLink(body)) return null;

  if (!["mmdbkk.com", "www.mmdbkk.com"].includes(url.hostname)) {
    return json({ ok: false, error: "pending_client_link_host_not_allowed" }, 403);
  }
  const origin = clean(request.headers.get("Origin"));
  if (origin && origin !== url.origin) {
    return json({ ok: false, error: "pending_client_link_origin_not_allowed" }, 403);
  }

  const actor = await readCredentialBoundAdminActor(request, env);
  const role = token(actor?.role);
  if (!actor || (role !== "admin" && role !== "owner")) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  let canonical;
  try {
    canonical = canonicalizePendingClientLinkBody(body);
  } catch (error) {
    return json({
      ok: false,
      error: clean(error?.message || error || "invalid_membership_action"),
    }, 400);
  }

  const forwardedBody = canonical.forwarded_body;
  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  headers.set("x-mmd-sigil-operational-mode", PENDING_CLIENT_LINK_MODE);
  const forwarded = new Request(request.url, {
    method: "POST",
    headers,
    body: JSON.stringify(forwardedBody),
  });
  const response = await downstream.fetch(forwarded, env, ctx);
  if (!response.ok) return response;

  const data = await response.clone().json().catch(() => null);
  if (!data || typeof data !== "object") return response;
  const held = holdPendingClientLinkResponse(data);
  held.private_intent = forwardedBody.job_details.requested_world === "private" ? "private" : null;
  held.membership_action = canonical.membership_action;
  held.pricing_breakdown = canonical.pricing_breakdown;

  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("content-length");
  responseHeaders.set("cache-control", "no-store, private");
  responseHeaders.set("x-mmd-sigil-operational-status", PENDING_CLIENT_LINK_MODE);
  responseHeaders.set("x-mmd-membership-action", canonical.membership_action.version);
  return new Response(JSON.stringify(held), {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

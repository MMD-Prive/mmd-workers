import { readCredentialBoundAdminActor } from "./credential-bound-admin-session.js";
import { canonicalizeSigilJobBody } from "./sigil-jobs-membership-action.js";
import { reconcileHeldSigilJob, SIGIL_JOB_RECONCILE_PATH } from "./sigil-jobs-held-release.js";

export const SIGIL_JOB_CREATE_PATH = "/v1/admin/job/create";
export const PENDING_CLIENT_LINK_MODE = "pending_client_link";
export const PENDING_MODEL_LINK_MODE = "pending_model_link";
export const PENDING_IDENTITY_LINK_MODE = "pending_identity_link";
const HOLD_WIRE_MODE = PENDING_CLIENT_LINK_MODE;
const PENDING_MODES = new Set([PENDING_CLIENT_LINK_MODE, PENDING_MODEL_LINK_MODE, PENDING_IDENTITY_LINK_MODE]);

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
  return [body.visibility, body.job_visibility, body.booking_visibility, details.world, details.requested_world, work.job_visibility]
    .some((value) => token(value) === "private");
}

// A name snapshot is enough to record the operational Job, but only a real
// Airtable record ID leaves the identity hold lane. Names never auto-link.
export function hasCanonicalClientLink(body = {}) {
  const lineage = body.client_lineage || {};
  return [body.client_record_id, body.client_id, lineage.client_id].some((value) => clean(value));
}

export function hasCanonicalModelLink(body = {}) {
  const model = body.model || {};
  return [body.model_record_id, body.model_id, model.model_id].some((value) => clean(value));
}

export function pendingIdentityStatus(body = {}) {
  const hasClient = hasCanonicalClientLink(body);
  const hasModel = hasCanonicalModelLink(body);
  if (!hasClient && !hasModel) return PENDING_IDENTITY_LINK_MODE;
  if (!hasClient) return PENDING_CLIENT_LINK_MODE;
  if (!hasModel) return PENDING_MODEL_LINK_MODE;
  return "linked";
}

// Backward-compatible helper retained for existing tests/callers.
export function shouldCreatePendingClientLink(body = {}) {
  return token(body.operational_create_mode) === PENDING_CLIENT_LINK_MODE && !hasCanonicalClientLink(body);
}

export function shouldCreatePendingIdentityHold(body = {}) {
  return PENDING_MODES.has(token(body.operational_create_mode)) && pendingIdentityStatus(body) !== "linked";
}

export function buildPendingIdentityBody(body = {}, exposedStatus = pendingIdentityStatus(body)) {
  const requestedWorld = isPrivateIntent(body) ? "private" : "public";
  const heldWorld = requestedWorld === "private" ? "pending_private" : "public";
  const details = body.job_details || {};
  const missingClient = !hasCanonicalClientLink(body);
  const missingModel = !hasCanonicalModelLink(body);
  const meta = {
    status: exposedStatus,
    requested_world: requestedWorld,
    pending_client: missingClient,
    pending_model: missingModel,
    folder: clean(details.folder || body.model_folder) || null,
    lane: clean(details.lane || body.selected_orientation) || null,
    private_work: clean(details.private_work) || null,
    payment_type: clean(body.payment_type || body.payment_stage) || null,
    payment_method: clean(details.payment_method || body.payment_method) || null,
  };
  const marker = `[MMD_PENDING_IDENTITY_V1] ${JSON.stringify(meta)}`;
  const human = `[PENDING IDENTITY] ${missingClient ? "Client" : ""}${missingClient && missingModel ? " + " : ""}${missingModel ? "Model" : ""} canonical link pending. Confirmation, dispatch and entitlement release are held.`;
  const note = clean(body.note || body.notes);

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
      // Core/payments already treat pending_client_link as the canonical wire
      // hold. Exposed status below distinguishes which identity is missing.
      operational_status: HOLD_WIRE_MODE,
      pending_identity_status: exposedStatus,
      confirmation_hold: true,
      dispatch_hold: true,
    },
    client_lineage: missingClient
      ? { ...(body.client_lineage || {}), identity_status: "pending_reconcile", manual_public_only: false }
      : { ...(body.client_lineage || {}) },
    model: missingModel
      ? { ...(body.model || {}), identity_status: "pending_reconcile" }
      : { ...(body.model || {}) },
    note: [note, marker, human].filter(Boolean).join("\n"),
  };
}

// Backward-compatible name; old client-only callers still get the same wire hold.
export function buildPendingClientLinkBody(body = {}) {
  return buildPendingIdentityBody(body, pendingIdentityStatus(body));
}

export function canonicalizePendingClientLinkBody(body = {}) {
  const exposedStatus = pendingIdentityStatus(body);
  const canonical = canonicalizeSigilJobBody(body);
  return {
    ...canonical,
    pending_identity_status: exposedStatus,
    forwarded_body: buildPendingIdentityBody(canonical.body, exposedStatus),
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

export function holdPendingIdentityResponse(data = {}, exposedStatus = PENDING_CLIENT_LINK_MODE) {
  const held = { ...data };
  delete held.customer_t;
  delete held.model_t;
  delete held.customer_token;
  delete held.model_token;
  delete held.customer_confirmation_url;
  delete held.model_confirmation_url;
  held.raw = safeRaw(data.raw);
  held.ok = data.ok !== false;
  held.operational_status = exposedStatus;
  held.confirmations_held = true;
  held.dispatch_held = true;
  held.entitlement_release_held = true;
  held.customer_confirmation_url = null;
  held.model_confirmation_url = null;
  return held;
}

export function holdPendingClientLinkResponse(data = {}) {
  return holdPendingIdentityResponse(data, PENDING_CLIENT_LINK_MODE);
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

function routeKind(request) {
  const url = new URL(request.url);
  if (request.method.toUpperCase() !== "POST") return null;
  const path = normalizePath(url.pathname);
  if (path === SIGIL_JOB_RECONCILE_PATH) return "reconcile";
  if (path === SIGIL_JOB_CREATE_PATH) return "create";
  return null;
}

function hostAndOriginAllowed(request) {
  const url = new URL(request.url);
  if (!["mmdbkk.com", "www.mmdbkk.com"].includes(url.hostname)) return "host_not_allowed";
  const origin = clean(request.headers.get("Origin"));
  if (origin && origin !== url.origin) return "origin_not_allowed";
  return null;
}

export async function tryHandleSigilPendingClientLink(request, env, ctx, downstream) {
  const kind = routeKind(request);
  if (!kind) return null;

  const body = await request.clone().json().catch(() => ({}));
  if (kind === "create" && !shouldCreatePendingIdentityHold(body)) return null;

  const routeError = hostAndOriginAllowed(request);
  if (routeError) return json({ ok: false, error: `sigil_jobs_${routeError}` }, 403);

  const actor = await readCredentialBoundAdminActor(request, env);
  const role = token(actor?.role);
  if (!actor || (role !== "admin" && role !== "owner")) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  if (kind === "reconcile") {
    return reconcileHeldSigilJob(request, env, ctx, downstream);
  }

  let canonical;
  try {
    canonical = canonicalizePendingClientLinkBody(body);
  } catch (error) {
    return json({ ok: false, error: clean(error?.message || error || "invalid_membership_action") }, 400);
  }

  const forwardedBody = canonical.forwarded_body;
  const exposedStatus = canonical.pending_identity_status;
  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  headers.set("x-mmd-sigil-operational-mode", exposedStatus);
  const forwarded = new Request(request.url, { method: "POST", headers, body: JSON.stringify(forwardedBody) });
  const response = await downstream.fetch(forwarded, env, ctx);
  if (!response.ok) return response;

  const data = await response.clone().json().catch(() => null);
  if (!data || typeof data !== "object") return response;
  const held = holdPendingIdentityResponse(data, exposedStatus);
  held.private_intent = forwardedBody.job_details.requested_world === "private" ? "private" : null;
  held.pending_client = !hasCanonicalClientLink(body);
  held.pending_model = !hasCanonicalModelLink(body);
  held.membership_action = canonical.membership_action;
  held.pricing_breakdown = canonical.pricing_breakdown;

  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("content-length");
  responseHeaders.set("cache-control", "no-store, private");
  responseHeaders.set("x-mmd-sigil-operational-status", exposedStatus);
  responseHeaders.set("x-mmd-membership-action", canonical.membership_action.version);
  return new Response(JSON.stringify(held), {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

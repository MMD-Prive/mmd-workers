import bookingWorker from "./index.js";
import { resolveMemberEntitlements } from "../../auth-worker/src/member-entitlement-resolver.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
const CLIENT_RESOLVE_PATH = "/sigil/api/client/resolve";
const BOOKING_INTAKE_PATH = "/sigil/api/booking/intake";
const BOOKING_CONFIRM_PATH = "/__internal/booking/confirm";
const MODEL_SEARCH_PATH = "/sigil/api/models/search";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const method = request.method.toUpperCase();

    if (method === "POST" && path === BOOKING_CONFIRM_PATH) {
      return handleTrustedBookingConfirm(request, env);
    }

    if ((method === "GET" || method === "POST") && path === MODEL_SEARCH_PATH) {
      const scope = await requestedScope(request, url);
      if (scope === "private") {
        const allowed = await canonicalStoredPrivateAccess(env, request, url).catch(() => false);
        if (!allowed) return json({ ok: true, matched: false, blocked: true, reason: "private_requires_entitlement_snapshot", access_scope: "public_only", member_status: "unknown", items: [] }, 200);
      }
      return bookingWorker.fetch(request, env, ctx);
    }

    if (method === "POST" && path === CLIENT_RESOLVE_PATH) {
      const body = await request.clone().json().catch(() => ({}));
      const response = await bookingWorker.fetch(request, env, ctx);
      if (!response.ok) return response;
      const payload = await response.clone().json().catch(() => null);
      if (!payload?.ok) return response;
      const canonical = await resolveCanonicalAccess(env, body).catch(() => failClosedAccess());
      await persistCanonicalAccess(env, payload, canonical).catch(() => null);
      const headers = new Headers(response.headers);
      headers.set("content-type", "application/json; charset=utf-8");
      headers.set("cache-control", "no-store");
      return new Response(JSON.stringify({ ...payload, ...canonical.response, entitlement_snapshot: canonical.snapshot }), { status: response.status, headers });
    }

    if (method === "POST" && path === BOOKING_INTAKE_PATH) {
      return handleCanonicalBookingIntake(request, env, ctx);
    }

    return bookingWorker.fetch(request, env, ctx);
  },
};

async function handleCanonicalBookingIntake(request, env, ctx) {
  const body = await request.clone().json().catch(() => ({}));
  const bookingRef = clean(body.booking_ref || body.request_id);
  const sessionId = clean(body.session_id);
  const stored = await readBookingRequest(env, { bookingRef, sessionId }).catch(() => null);
  const parsed = parseJson(stored?.fields?.resolver_payload_json);
  const snapshot = parsed?.entitlement_snapshot;

  const safeBody = { ...body };
  if (snapshot?.schema_version === "my_mmd_entitlement_resolver_v1") {
    const access = accessFromSnapshot(snapshot);
    safeBody.resolver_payload_json = parsed;
    safeBody.member_status = access.member_status;
    safeBody.access_scope = access.access_scope;
    safeBody.private_allowed = access.can_search_private_models;
  } else {
    safeBody.resolver_payload_json = { kind: "booking_intake", entitlement_snapshot: resolveMemberEntitlements([]), fail_closed: true, saved_at: new Date().toISOString() };
    safeBody.member_status = "unknown";
    safeBody.access_scope = "public_only";
    safeBody.private_allowed = false;
  }

  const safeRequest = new Request(request, {
    body: JSON.stringify(safeBody),
    headers: withJsonContentType(request.headers),
  });
  return bookingWorker.fetch(safeRequest, env, ctx);
}

async function handleTrustedBookingConfirm(request, env) {
  requireAirtable(env);
  if (!validInternalToken(request, env)) return json({ ok: false, error: "unauthorized" }, 401);

  const body = await request.json().catch(() => ({}));
  const bookingRef = clean(body.booking_ref || body.request_id);
  const sessionId = clean(body.session_id);
  if (!bookingRef && !sessionId) return json({ ok: false, error: "booking_reference_required" }, 400);

  const row = await readBookingRequest(env, { bookingRef, sessionId });
  if (!row?.id) return json({ ok: false, error: "booking_not_found" }, 404);
  const fields = row.fields || {};

  const canonical = await resolveCanonicalAccess(env, {
    client_contact: fields.client_contact || fields["Contact Value"],
    line_or_member_id: fields.line_or_member_id,
  }).catch(() => failClosedAccess());
  const bookingAccess = bookingAccessFromSnapshot(canonical.snapshot, clean(fields.lane || fields.model_scope || body.lane || "public"));
  const payment = await verifyBookingPayment(env, {
    paymentRef: clean(body.payment_ref || fields.payment_ref),
    sessionId: clean(sessionId || fields.session_id),
    bookingRef: clean(bookingRef || fields.booking_ref),
  }).catch(() => ({ verified: false, reason: "payment_lookup_failed" }));

  const entitlementValid = bookingAccess.allowed === true;
  const paymentVerified = payment.verified === true;
  if (!entitlementValid || !paymentVerified) {
    return json({
      ok: false,
      error: !entitlementValid ? "entitlement_not_valid_for_booking" : "payment_not_verified",
      entitlement_valid: entitlementValid,
      payment_verified: paymentVerified,
      payment_reason: payment.reason || null,
    }, 409);
  }

  const confirmedAt = new Date().toISOString();
  const locked = {
    schema_version: "booking_entitlement_snapshot_v1",
    confirmed_at: confirmedAt,
    booking_ref: clean(bookingRef || fields.booking_ref),
    session_id: clean(sessionId || fields.session_id),
    booking_access: bookingAccess,
    payment_verification: { verified: true, payment_ref: payment.payment_ref || null, status: payment.status || null },
    entitlement_snapshot: canonical.snapshot,
  };

  await airtablePatch(env, env.AIRTABLE_TABLE_BOOKING_REQUESTS_ID || "SIGIL Booking Requests", row.id, {
    "Request Status": "Confirmed",
    confirmed_at: confirmedAt,
    entitlement_snapshot_at_confirm: JSON.stringify(locked),
    entitlement_valid_at_confirm: true,
    payment_verified_at_confirm: true,
    honor_after_expiry: true,
  });

  return json({
    ok: true,
    booking_ref: locked.booking_ref,
    session_id: locked.session_id,
    confirmed_at: confirmedAt,
    honor_after_expiry: true,
    booking_access: bookingAccess,
  });
}

async function resolveCanonicalAccess(env, body) {
  requireAirtable(env);
  const email = clean(body.client_contact || body.email).toLowerCase();
  const line = clean(body.line_or_member_id || body.line_id || body.member_id);
  const filters = [];
  if (email.includes("@")) filters.push(`LOWER({member_email})=${formulaText(email)}`);
  if (line) filters.push(`{line_user_id}=${formulaText(line)}`, `{memberstack_id}=${formulaText(line)}`);
  if (!filters.length) return failClosedAccess();
  const table = env.AIRTABLE_TABLE_ENTITLEMENTS_ID || env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS_ID || "MMD — Member Entitlements";
  const rows = await airtableList(env, table, filters.length === 1 ? filters[0] : `OR(${filters.join(",")})`, 100);
  const snapshot = resolveMemberEntitlements(rows.map((row) => ({ ...row, fields: { ...(row.fields || {}), member_status: row.fields?.member_lifecycle_status || row.fields?.member_status } })));
  return { snapshot, response: accessFromSnapshot(snapshot) };
}

function accessFromSnapshot(snapshot) {
  const access = snapshot?.access || {};
  const active = Array.isArray(snapshot?.capability_state?.active) ? snapshot.capability_state.active : [];
  const grace = Array.isArray(snapshot?.capability_state?.grace) ? snapshot.capability_state.grace : [];
  const privateAllowed = !snapshot?.member_blocked && String(access.private_visibility_envelope || "none") !== "none";
  const memberStatus = snapshot?.member_blocked ? "blocked" : active.length ? "active" : grace.length ? "grace" : "expired";
  return {
    member_status: memberStatus,
    membership_tier: String(access.private_visibility_envelope || ""),
    access_scope: privateAllowed ? "public_private" : "public_only",
    can_search_public_models: Boolean(access.public_service_access || access.guest_pass_access || privateAllowed),
    can_search_private_models: privateAllowed,
    next_required_action: privateAllowed ? "continue_booking" : "signup_or_continue_public",
  };
}

function bookingAccessFromSnapshot(snapshot, laneRaw) {
  const lane = clean(laneRaw).toLowerCase().replace(/-/g, "_");
  const access = snapshot?.access || {};
  if (!snapshot || snapshot.schema_version !== "my_mmd_entitlement_resolver_v1" || snapshot.member_blocked) {
    return { lane, allowed: false, public_booking: false, private_booking: false, red_card_request: false, reason: "fail_closed" };
  }
  const privateBooking = String(access.private_visibility_envelope || "none") !== "none";
  const redCard = access.red_card_request_lane === true;
  const guest = access.guest_pass_access === true;
  const publicBooking = access.public_service_access === true || guest || privateBooking;
  if (["red_card", "redcard", "exclusive_request"].includes(lane)) {
    return { lane: "red_card", allowed: redCard, public_booking: publicBooking, private_booking: false, red_card_request: redCard, reason: redCard ? "red_card_or_black_card_active" : "red_card_required" };
  }
  if (lane === "private") {
    return { lane, allowed: privateBooking, public_booking: publicBooking, private_booking: privateBooking, red_card_request: redCard, reason: privateBooking ? "private_entitlement_active" : "private_entitlement_required" };
  }
  return { lane: "public", allowed: publicBooking, public_booking: publicBooking, private_booking: false, red_card_request: redCard, guest_pass_access: guest, reason: publicBooking ? "public_or_guest_or_private_active" : "public_access_required" };
}

function failClosedAccess() {
  const snapshot = resolveMemberEntitlements([]);
  return { snapshot, response: { member_status: "unknown", membership_tier: "", access_scope: "public_only", can_search_public_models: false, can_search_private_models: false, next_required_action: "signup_or_continue_public" } };
}

async function persistCanonicalAccess(env, payload, canonical) {
  const bookingRef = clean(payload.booking_ref);
  if (!bookingRef) return;
  const table = env.AIRTABLE_TABLE_BOOKING_REQUESTS_ID || "SIGIL Booking Requests";
  const rows = await airtableList(env, table, `{booking_ref}=${formulaText(bookingRef)}`, 1);
  const row = rows[0];
  if (!row?.id) return;
  const response = canonical.response;
  await airtablePatch(env, table, row.id, {
    member_status: response.member_status,
    access_scope: response.access_scope,
    "Private Allowed": response.can_search_private_models,
    resolver_payload_json: JSON.stringify({ kind: "client_resolve", schema_version: canonical.snapshot.schema_version, entitlement_snapshot: canonical.snapshot, saved_at: new Date().toISOString() }),
  });
}

async function canonicalStoredPrivateAccess(env, request, url) {
  requireAirtable(env);
  let body = {};
  if (request.method.toUpperCase() === "POST") body = await request.clone().json().catch(() => ({}));
  const bookingRef = clean(url.searchParams.get("booking_ref") || body.booking_ref || body.request_id);
  const sessionId = clean(url.searchParams.get("session_id") || body.session_id);
  const row = await readBookingRequest(env, { bookingRef, sessionId });
  const fields = row?.fields || {};
  if (fields.honor_after_expiry === true && fields.entitlement_valid_at_confirm === true && fields.payment_verified_at_confirm === true) {
    const locked = parseJson(fields.entitlement_snapshot_at_confirm);
    if (locked?.booking_access?.private_booking === true && locked?.entitlement_snapshot?.member_blocked !== true) return true;
  }
  const parsed = parseJson(fields.resolver_payload_json);
  const snapshot = parsed?.entitlement_snapshot;
  if (!snapshot || snapshot.schema_version !== "my_mmd_entitlement_resolver_v1") return false;
  return !snapshot.member_blocked && String(snapshot.access?.private_visibility_envelope || "none") !== "none";
}

async function verifyBookingPayment(env, { paymentRef, sessionId, bookingRef }) {
  const table = env.AIRTABLE_TABLE_PAYMENTS_ID || env.AIRTABLE_TABLE_PAYMENTS || "Payments";
  const candidates = [];
  if (paymentRef) candidates.push(`{payment_ref}=${formulaText(paymentRef)}`, `{Payment Reference}=${formulaText(paymentRef)}`);
  if (sessionId) candidates.push(`{session_id}=${formulaText(sessionId)}`, `{Session ID}=${formulaText(sessionId)}`);
  if (bookingRef) candidates.push(`{booking_ref}=${formulaText(bookingRef)}`, `{Booking Reference}=${formulaText(bookingRef)}`);
  for (const formula of candidates) {
    try {
      const rows = await airtableList(env, table, formula, 10);
      for (const row of rows) {
        const f = row.fields || {};
        const status = clean(f.status || f.payment_status || f["Payment Status"] || f["Verification Status"]).toLowerCase();
        const amount = Number(f.amount_thb ?? f.amount ?? f["Amount THB"] ?? 0);
        if (["verified", "paid", "confirmed", "approved", "success", "completed"].includes(status) && amount >= 0) {
          return { verified: true, payment_ref: clean(f.payment_ref || f["Payment Reference"] || paymentRef), status };
        }
      }
    } catch {}
  }
  return { verified: false, reason: "verified_payment_not_found" };
}

async function readBookingRequest(env, { bookingRef, sessionId }) {
  if (!bookingRef && !sessionId) return null;
  const table = env.AIRTABLE_TABLE_BOOKING_REQUESTS_ID || "SIGIL Booking Requests";
  const checks = [];
  if (bookingRef) checks.push(`{booking_ref}=${formulaText(bookingRef)}`, `{Request ID}=${formulaText(bookingRef)}`);
  if (sessionId) checks.push(`{session_id}=${formulaText(sessionId)}`);
  for (const formula of checks) {
    try {
      const rows = await airtableList(env, table, formula, 1);
      if (rows[0]) return rows[0];
    } catch {}
  }
  return null;
}

async function requestedScope(request, url) {
  if (clean(url.searchParams.get("scope")).toLowerCase() === "private") return "private";
  if (request.method.toUpperCase() !== "POST") return "public";
  const body = await request.clone().json().catch(() => ({}));
  return clean(body.scope || body.model_scope).toLowerCase() === "private" ? "private" : "public";
}

async function airtableList(env, table, formula, maxRecords) {
  const qs = new URLSearchParams({ maxRecords: String(maxRecords), pageSize: String(Math.min(maxRecords, 100)) });
  if (formula) qs.set("filterByFormula", formula);
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}?${qs.toString()}`, { headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` } });
  if (!response.ok) throw new Error(`airtable_${response.status}`);
  const data = await response.json();
  return Array.isArray(data.records) ? data.records : [];
}

async function airtablePatch(env, table, recordId, fields) {
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!response.ok) throw new Error(`airtable_${response.status}`);
}

function validInternalToken(request, env) {
  const expected = clean(env.INTERNAL_TOKEN || env.CONFIRM_KEY);
  if (!expected) return false;
  const actual = clean(request.headers.get("x-mmd-internal-token") || request.headers.get("x-confirm-key") || request.headers.get("authorization")).replace(/^Bearer\s+/i, "");
  return actual === expected;
}
function withJsonContentType(headers) {
  const next = new Headers(headers);
  next.set("content-type", "application/json");
  return next;
}
function parseJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try { return JSON.parse(String(value)); } catch { return null; }
}
function requireAirtable(env) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) throw new Error("airtable_config_missing");
}
function formulaText(value) {
  return `"${clean(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
function normalizePath(pathname = "") {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}
function clean(value) { return String(value ?? "").trim(); }
function json(payload, status = 200) { return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }); }

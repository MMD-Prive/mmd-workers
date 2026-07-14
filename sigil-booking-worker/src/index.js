// sigil-booking-worker/src/index.js
// MMD Booking / SIGIL public booking resolver
// Webflow calls this worker. Browser never touches Airtable, R2, Gmail, or Drive directly.

const AIRTABLE_API = "https://api.airtable.com/v0";
const LOCK = "sigil-booking-worker-v24-airtable-resolver-telegram-notify";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = normalizePath(url.pathname);
    const method = req.method.toUpperCase();
    const cors = corsHeaders(req, env);

    if (method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (!isAllowedOrigin(req, env)) return withCors(json({ ok: false, error: "origin_not_allowed" }, 403), cors);

    try {
      if (method === "GET" && (path === "/ping" || path === "/health")) {
        return withCors(json({ ok: true, worker: "sigil-booking-worker", lock: LOCK, ts: Date.now() }), cors);
      }

      if (method === "POST" && path === "/sigil/api/client/resolve") {
        return withCors(json(await handleClientResolve(req, env)), cors);
      }

      if ((method === "GET" || method === "POST") && path === "/sigil/api/models/search") {
        return withCors(json(await handleModelSearch(req, env, url)), cors);
      }

      if (method === "POST" && path === "/sigil/api/booking/intake") {
        return withCors(json(await handleBookingIntake(req, env)), cors);
      }

      return withCors(json({ ok: false, error: "not_found", path }, 404), cors);
    } catch (error) {
      return withCors(json({ ok: false, error: String(error?.message || error || "worker_error") }, 500), cors);
    }
  }
};

async function handleClientResolve(req, env) {
  const body = await safeJson(req);
  requireAirtable(env);

  const bookingRef = str(body.booking_ref || body.request_id || makeRef("book"));
  const sessionId = str(body.session_id || makeRef("mmd_session"));
  const clientNickname = str(body.client_nickname || body.client_name || body.name);
  const clientContact = str(body.client_contact || body.email || body.phone || body.contact);
  const lineOrMemberId = str(body.line_or_member_id || body.line_note || body.member_id || body.line_id);

  const access = await resolveMemberAccess(env, { clientNickname, clientContact, lineOrMemberId });

  await upsertBookingRequest(env, bookingRef, {
    "Request ID": bookingRef,
    "Request Status": "draft",
    "Created At": new Date().toISOString(),
    "Source": "sigil_booking",
    "Source Path": str(body.source_path || body.page_path || "/sigil/booking"),
    "Contact Name": clientNickname,
    "Contact Method": inferContactMethod(clientContact, lineOrMemberId),
    "Contact Value": clientContact || lineOrMemberId,
    session_id: sessionId,
    booking_ref: bookingRef,
    client_nickname: clientNickname,
    client_contact: clientContact,
    line_or_member_id: lineOrMemberId,
    member_status: access.member_status,
    access_scope: access.access_scope,
    "Private Allowed": access.can_search_private_models,
    "Raw Safety Note": "Booking access check only. Private data is not exposed to browser unless active member is resolved by worker.",
    resolver_payload_json: safeStringify({ kind: "client_resolve", access, saved_at: new Date().toISOString() })
  });

  return {
    ok: true,
    booking_ref: bookingRef,
    session_id: sessionId,
    client_lookup_status: access.client_lookup_status,
    member_status: access.member_status,
    membership_tier: access.membership_tier,
    access_scope: access.access_scope,
    can_search_public_models: true,
    can_search_private_models: access.can_search_private_models
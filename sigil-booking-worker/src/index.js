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
    "Request Status": normalizeRequestStatus("draft"),
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
    can_search_private_models: access.can_search_private_models,
    next_required_action: access.next_required_action
  };
}

async function handleModelSearch(req, env, url) {
  requireAirtable(env);
  const body = req.method.toUpperCase() === "POST" ? await safeJson(req) : {};
  const q = str(url.searchParams.get("q") || body.q || body.model_search_query || body.model_id_or_name);
  const scope = token(url.searchParams.get("scope") || body.scope || body.model_scope || "public") === "private" ? "private" : "public";
  const bookingRef = str(url.searchParams.get("booking_ref") || body.booking_ref || body.request_id);
  const sessionId = str(url.searchParams.get("session_id") || body.session_id);

  if (!q) return { ok: true, matched: false, reason: "missing_query", items: [] };

  const storedAccess = await lookupStoredBookingAccess(env, { bookingRef, sessionId });
  const privateAllowed = storedAccess.access_scope === "public_private" && storedAccess.member_status === "active";
  if (scope === "private" && !privateAllowed) {
    return { ok: true, matched: false, blocked: true, reason: "private_requires_active_member", access_scope: storedAccess.access_scope || "public_only", member_status: storedAccess.member_status || "unknown" };
  }

  const records = await searchModels(env, q, 24);
  const allowed = records.map((record) => sanitizeModelForBooking(record, { scope, privateAllowed, env })).filter(Boolean);
  const first = allowed[0] || null;
  return { ok: true, matched: Boolean(first), source: first?.source || "manual_review", model: first, items: allowed.slice(0, 8), access_scope: privateAllowed ? "public_private" : "public_only", member_status: storedAccess.member_status || "unknown" };
}

async function handleBookingIntake(req, env) {
  const body = await safeJson(req);
  requireAirtable(env);

  const bookingRef = str(body.booking_ref || body.request_id || makeRef("book"));
  const sessionId = str(body.session_id || makeRef("mmd_session"));
  const modelQuery = str(body.model_search_query || body.model_id_or_name || body.preference_text);
  const resolverPayload = body.resolver_payload_json && typeof body.resolver_payload_json === "object" ? body.resolver_payload_json : { saved_at: new Date().toISOString() };

  const fields = compact({
    "Request ID": bookingRef,
    "Request Status": normalizeRequestStatus(body.request_status),
    "Created At": new Date().toISOString(),
    "Source": str(body.source || "sigil_booking"),
    "Source Path": str(body.source_path || "/sigil/booking"),
    "Selected Model ID": str(body.selected_model_id || body.resolved_model_key),
    "Selected Model Name": str(body.selected_model_name),
    "Preference Text": str(body.preference_text || modelQuery || body.client_notes),
    "Preferred Date": str(body.preferred_date || body.date),
    "Preferred Time": str(body.preferred_time || body.time),
    "Contact Name": str(body.client_nickname || body.client_name),
    "Contact Method": inferContactMethod(str(body.client_contact), str(body.line_or_member_id)),
    "Contact Value": str(body.client_contact || body.line_or_member_id),
    "Access Hash": body.t ? shortHash(body.t) : "",
    "Private Allowed": bool(body.private_allowed),
    "Client Notes": str(body.client_notes || body.details),
    "Admin Notes": "Created from /sigil/booking compact flow. Official review/payment verification still required.",
    "Raw Safety Note": "Draft only. Do not confirm booking, model availability, private access, or payment from this record alone.",
    session_id: sessionId,
    booking_ref: bookingRef,
    client_nickname: str(body.client_nickname || body.client_name),
    client_contact: str(body.client_contact),
    line_or_member_id: str(body.line_or_member_id),
    member_status: normalizeMemberStatus(body.member_status),
    access_scope: normalizeAccessScope(body.access_scope),
    lane: token(body.lane) === "private" ? "private" : "public",
    job_class: normalizeJobClass(body.job_class),
    model_scope: token(body.model_scope) === "private" ? "private" : "public",
    model_search_query: modelQuery,
    resolved_model_key: str(body.resolved_model_key),
    model_asset_source: normalizeModelAssetSource(body.model_asset_source),
    resolved_image_url: str(body.resolved_image_url),
    r2_key_snapshot: str(body.r2_key_snapshot),
    drive_folder_id_snapshot: str(body.drive_folder_id_snapshot),
    resolver_payload_json: safeStringify(resolverPayload)
  });

  const rec = await upsertBookingRequest(env, bookingRef, fields);
  const nextUrl = buildNextUrl(env, body, { bookingRef, sessionId });
  const telegram = await notifyBookingDraft(env, { body, fields, rec, bookingRef, sessionId, nextUrl });

  return { ok: true, record_id: rec?.id || null, booking_ref: bookingRef, session_id: sessionId, next_url: nextUrl, telegram_notify: telegram };
}

async function resolveMemberAccess(env, input) {
  const member = await findMember(env, input);
  if (!member) return accessOut("not_found", "", "public_only", false, "signup_or_continue_public", "not_found");

  const f = member.fields || {};
  const email = str(f.email || f["Contact Email"] || input.clientContact).toLowerCase();
  const ledger = email ? await findActiveMemberPackage(env, email) : null;
  const statusToken = token(f["Membership Status"] || f.status || f["Verification Status"]);
  const expiry = Date.parse(str(f["Expire At"] || f["Membership Expiry"] || f["Membership End Date"] || f["Expiry Date"] || f.expire_at));
  const expiryOk = expiry && expiry >= Date.now();

  if (ledger.active || (statusToken === "active" && expiryOk)) return accessOut("active", ledger.tier || tierFromText(f["Membership Tier"] || f["Package / Tier"]), "public_private", true, "continue_booking", "matched");
  if (statusToken === "expired" || statusToken === "inactive" || (expiry && !expiryOk)) return accessOut("expired", tierFromText(f["Membership Tier"]), "public_only", false, "renew_for_private", "matched");
  return accessOut("pending", tierFromText(f["Membership Tier"]), "public_only", false, "signup_or_continue_public", "matched");
}

function accessOut(memberStatus, tier, accessScope, canPrivate, nextRequiredAction, lookupStatus) {
  return { client_lookup_status: lookupStatus, member_status: memberStatus, membership_tier: tier || "", access_scope: accessScope, can_search_private_models: Boolean(canPrivate), next_required_action: nextRequiredAction };
}

async function findMember(env, { clientNickname, clientContact, lineOrMemberId }) {
  const table = env.AIRTABLE_TABLE_MEMBERS_ID || env.AIRTABLE_TABLE_MEMBERS || "Members";
  const candidates = [];
  const contact = str(clientContact);
  const line = str(lineOrMemberId);
  const name = str(clientNickname);
  if (contact && contact.includes("@")) candidates.push(`LOWER({Contact Email})=${formulaText(contact.toLowerCase())}`, `LOWER({email})=${formulaText(contact.toLowerCase())}`);
  if (contact && !contact.includes("@")) candidates.push(`{Phone Number}=${formulaText(contact)}`, `{phone}=${formulaText(contact)}`);
  if (line) candidates.push(`LOWER({line_id})=${formulaText(line.toLowerCase())}`, `LOWER({member_id})=${formulaText(line.toLowerCase())}`, `LOWER({username})=${formulaText(line.toLowerCase())}`);
  if (name) candidates.push(`LOWER({mmd_client_name})=${formulaText(name.toLowerCase())}`, `LOWER({Full Name})=${formulaText(name.toLowerCase())}`);
  return firstWorkingFormula(env, table, candidates);
}

async function findActiveMemberPackage(env, email) {
  const table = env.AIRTABLE_TABLE_MEMBER_PACKAGES_ID || env.AIRTABLE_TABLE_MEMBER_PACKAGES || "member_packages";
  const rows = await airtableListByFormula(env, table, `LOWER({member_email})=${formulaText(email.toLowerCase())}`, 25);
  let best = null;
  for (const row of rows) {
    const f = row.fields || {};
    if (token(f.status) !== "active") continue;
    const end = Date.parse(str(f.end_date || f.end_at || f.expire_at || f.expires_at));
    if (!end || end < Date.now()) continue;
    const tier = tierFromText(f.package_code || f.tier);
    const rank = { standard: 1, premium: 2, vip: 3, blackcard: 4, black_card: 4 }[tier] || 0;
    if (!best || rank > best.rank || end > best.end) best = { active: true, tier, rank, end };
  }
  return best || { active: false, tier: "" };
}

async function lookupStoredBookingAccess(env, { bookingRef, sessionId }) {
  const table = env.AIRTABLE_TABLE_BOOKING_REQUESTS_ID || env.AIRTABLE_TABLE_BOOKING_REQUESTS || "SIGIL Booking Requests";
  const checks = [];
  if (bookingRef) checks.push(`{booking_ref}=${formulaText(bookingRef)}`, `{Request ID}=${formulaText(bookingRef)}`);
  if (sessionId) checks.push(`{session_id}=${formulaText(sessionId)}`);
  const rec = await firstWorkingFormula(env, table, checks);
  const f = rec?.fields || {};
  return { member_status: normalizeMemberStatus(f.member_status), access_scope: normalizeAccessScope(f.access_scope) };
}

async function searchModels(env, q, limit) {
  const table = env.AIRTABLE_TABLE_MODELS_ID || env.AIRTABLE_TABLE_MODELS || "Models";
  const needle = q.toLowerCase();
  const formula = `OR(FIND(${formulaText(needle)},LOWER({working_name})),FIND(${formulaText(needle)},LOWER({nickname})),FIND(${formulaText(needle)},LOWER({unique_key})),FIND(${formulaText(needle)},LOWER({folder_name})),FIND(${formulaText(needle)},LOWER({r2_prefix})),FIND(${formulaText(needle)},LOWER({primary_image_key})))`;
  let rows = await airtableListByFormula(env, table, formula, limit);
  if (!rows.length) {
    rows = await airtableListByFormula(env, table, "", limit);
    rows = rows.filter((row) => JSON.stringify(row.fields || {}).toLowerCase().includes(needle)).slice(0, limit);
  }
  return rows;
}

function sanitizeModelForBooking(record, { scope, privateAllowed, env }) {
  const f = record.fields || {};
  const status = token(f.status || f.availability_status);
  if (["inactive", "blocked", "archived", "hidden", "retired"].includes(status)) return null;

  const canPublic = bool(f.can_work_public) || bool(f["Public Search Enabled"]) || token(f.sales_layer).includes("public") || token(f.visibility) === "public";
  const canPrivate = bool(f.can_work_private) || token(f.sales_layer).includes("private") || token(f.private_tier) || token(f.private_work_format);
  if (scope === "private") {
    if (!privateAllowed || !canPrivate) return null;
  } else if (!canPublic || (canPrivate && !canPublic)) return null;

  const publicImage = str(f["Public Image URL"] || f.public_image_url || f.card_image_url || f.hero_image_url);
  const primaryKey = str(f.primary_image_key || f.r2_key || f.r2_prefix);
  const imageUrl = publicImage || publicUrlFromKey(env, primaryKey);
  const source = publicImage ? "airtable_attachment" : primaryKey ? "r2_prefix" : str(f.drive_folder_id || f.drive_folder_url) ? "drive_folder" : "manual_review";

  return compact({
    model_id: record.id,
    model_record_id: str(f.model_record_id || record.id),
    model_key: str(f.unique_key || f.canonical_slug || f.model_key),
    unique_key: str(f.unique_key),
    display_name: str(f.working_name || f.nickname || f.display_name_compact || "Model"),
    working_name: str(f.working_name),
    nickname: str(f.nickname),
    source,
    asset_source: source,
    public_image_url: imageUrl,
    cover_url: imageUrl,
    r2_key: primaryKey,
    primary_image_key: primaryKey,
    r2_prefix: str(f.r2_prefix),
    drive_folder_id: str(f.drive_folder_id),
    preview_approved: bool(f["Preview Image Approved"]),
    scope
  });
}

async function upsertBookingRequest(env, bookingRef, fields) {
  const table = env.AIRTABLE_TABLE_BOOKING_REQUESTS_ID || env.AIRTABLE_TABLE_BOOKING_REQUESTS || "SIGIL Booking Requests";
  const existing = await firstWorkingFormula(env, table, [`{booking_ref}=${formulaText(bookingRef)}`, `{Request ID}=${formulaText(bookingRef)}`]);
  if (existing?.id) return airtablePatch(env, table, existing.id, fields);
  return airtableCreate(env, table, fields);
}

function buildNextUrl(env, body, ids) {
  if (str(body.next_url)) return str(body.next_url);
  const base = str(env.WEB_BASE_URL || "https://mmdbkk.com").replace(/\/+$/, "");
  const u = new URL(str(env.PAY_URL || "/sigil/pay"), base);
  u.searchParams.set("booking_ref", ids.bookingRef);
  u.searchParams.set("session_id", ids.sessionId);
  u.searchParams.set("purpose", "booking_payment");
  u.searchParams.set("payment_type", "deposit");
  return u.toString();
}

async function notifyBookingDraft(env, { body, fields, rec, bookingRef, sessionId, nextUrl }) {
  if (token(env.TELEGRAM_NOTIFY_ENABLED || "true") === "false") return { ok: false, skipped: true, reason: "disabled" };
  const endpoint = str(env.TELEGRAM_INTERNAL_SEND_URL || env.TELEGRAM_NOTIFY_URL);
  const chatId = str(env.TELEGRAM_BOOKING_CHAT_ID || env.TELEGRAM_INTERNAL_CHAT_ID || env.TELEGRAM_ADMIN_CHAT_ID);
  if (!endpoint || !chatId) return { ok: false, skipped: true, reason: "missing_telegram_config" };

  const threadId = str(env.TG_THREAD_BOOKING_DRAFT || env.TELEGRAM_BOOKING_THREAD_ID || env.TELEGRAM_THREAD_ID);
  const adminUrl = buildAdminBookingUrl(env, bookingRef, rec?.id || "");
  const text = buildBookingTelegramText({ body, fields, bookingRef, sessionId, recordId: rec?.id || "", nextUrl, adminUrl });
  const payload = compact({
    chat_id: chatId,
    message_thread_id: threadId,
    thread_id: threadId,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    text,
    source: "sigil_booking_worker",
    intent: "booking_draft_notify",
    booking_ref: bookingRef,
    session_id: sessionId,
    airtable_record_id: rec?.id || ""
  });
  try {
    const headers = { "Content-Type": "application/json" };
    if (env.AUTH_SERVICE_BOOKING_TO_TELEGRAM) headers["X-Internal-Token"] = env.AUTH_SERVICE_BOOKING_TO_TELEGRAM;
    if (env.INTERNAL_TOKEN) headers.Authorization = `Bearer ${env.INTERNAL_TOKEN}`;
    if (env.CONFIRM_KEY) headers["X-Confirm-Key"] = env.CONFIRM_KEY;
    const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(payload) });
    const responseText = await response.text();
    return { ok: response.ok, status: response.status, skipped: false, response: responseText.slice(0, 240) };
  } catch (error) {
    return { ok: false, skipped: false, error: String(error?.message || error) };
  }
}

function buildBookingTelegramText({ body, fields, bookingRef, sessionId, recordId, nextUrl, adminUrl }) {
  const route = `${str(fields.lane || "public").toUpperCase()} / ${str(fields.job_class || "travel").toUpperCase()}`;
  const access = `${str(fields.member_status || "unknown")} · ${str(fields.access_scope || "public_only")}`;
  const model = str(fields.resolved_model_key || fields["Selected Model Name"] || fields.model_search_query || "manual review");
  const date = [fields["Preferred Date"], fields["Preferred Time"], body.duration].map(str).filter(Boolean).join(" · ") || "not set";
  const place = [body.city, body.google_address].map(str).filter(Boolean).join(" · ") || "not set";
  return [
    "🕯️ <b>MMD Booking Draft</b>",
    `Ref: <code>${escHtml(bookingRef)}</code>`,
    `Session: <code>${escHtml(sessionId)}</code>`,
    recordId ? `Airtable: <code>${escHtml(recordId)}</code>` : "",
    "",
    `Client: <b>${escHtml(fields.client_nickname || fields["Contact Name"] || "ไม่ระบุ")}</b>`,
    `Contact: ${escHtml(fields.client_contact || fields.line_or_member_id || fields["Contact Value"] || "ไม่ระบุ")}`,
    `Status: ${escHtml(access)}`,
    `Route: <b>${escHtml(route)}</b>`,
    `Model: ${escHtml(model)}`,
    `When: ${escHtml(date)}`,
    `Place: ${escHtml(place)}`,
    "",
    "Note: draft only. ยังไม่ยืนยันงาน / model / payment",
    adminUrl ? `Admin: ${escHtml(adminUrl)}` : "",
    nextUrl ? `Next: ${escHtml(nextUrl)}` : ""
  ].filter(Boolean).join("\n");
}

function buildAdminBookingUrl(env, bookingRef, recordId) {
  const raw = str(env.INTERNAL_ADMIN_BOOKING_URL || env.INTERNAL_ADMIN_URL || "");
  if (!raw) return "";
  const u = new URL(raw, str(env.WEB_BASE_URL || "https://mmdbkk.com"));
  if (bookingRef) u.searchParams.set("booking_ref", bookingRef);
  if (recordId) u.searchParams.set("record_id", recordId);
  return u.toString();
}

async function firstWorkingFormula(env, table, formulas) {
  for (const formula of formulas.filter(Boolean)) {
    const rows = await airtableListByFormula(env, table, formula, 1);
    if (rows[0]) return rows[0];
  }
  return null;
}

async function airtableListByFormula(env, table, formula, limit = 50) {
  const params = new URLSearchParams();
  params.set("pageSize", String(Math.max(1, Math.min(100, limit))));
  if (formula) params.set("filterByFormula", formula);
  const res = await airtableFetch(env, `/${encodeURIComponent(table)}?${params.toString()}`);
  if (!res.ok) return [];
  return (res.data.records || []).map((rec) => ({ id: rec.id, fields: rec.fields || {}, createdTime: rec.createdTime }));
}

async function airtableCreate(env, table, fields) {
  let cleanFields = compact(fields);
  let res = await airtableFetch(env, `/${encodeURIComponent(table)}`, { method: "POST", body: JSON.stringify({ fields: cleanFields }) });
  if (!res.ok && isRequestStatusSelectFailure(res, cleanFields)) {
    cleanFields = withoutRequestStatus(cleanFields);
    res = await airtableFetch(env, `/${encodeURIComponent(table)}`, { method: "POST", body: JSON.stringify({ fields: cleanFields }) });
  }
  if (!res.ok) throw new Error(`airtable_create_failed:${res.status}:${res.text || ""}`);
  return res.data;
}

async function airtablePatch(env, table, recordId, fields) {
  let cleanFields = compact(fields);
  let res = await airtableFetch(env, `/${encodeURIComponent(table)}/${recordId}`, { method: "PATCH", body: JSON.stringify({ fields: cleanFields }) });
  if (!res.ok && isRequestStatusSelectFailure(res, cleanFields)) {
    cleanFields = withoutRequestStatus(cleanFields);
    res = await airtableFetch(env, `/${encodeURIComponent(table)}/${recordId}`, { method: "PATCH", body: JSON.stringify({ fields: cleanFields }) });
  }
  if (!res.ok) throw new Error(`airtable_patch_failed:${res.status}:${res.text || ""}`);
  return res.data;
}

async function airtableFetch(env, path, init = {}) {
  const response = await fetch(`${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}${path}`, {
    method: init.method || "GET",
    headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}`, "Content-Type": "application/json" },
    body: init.body
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text }; }
  return { ok: response.ok, status: response.status, data, text };
}

function requireAirtable(env) { if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) throw new Error("missing_airtable_env"); }
function corsHeaders(req, env) {
  const origin = req.headers.get("Origin") || "";
  const allowed = str(env.ALLOWED_ORIGINS).split(",").map((x) => x.trim()).filter(Boolean);
  const h = new Headers();
  if (origin && (!allowed.length || allowed.includes(origin))) h.set("Access-Control-Allow-Origin", origin);
  h.set("Vary", "Origin");
  h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Confirm-Key");
  h.set("Access-Control-Max-Age", "86400");
  h.set("Content-Type", "application/json");
  return h;
}
function isAllowedOrigin(req, env) { const origin = req.headers.get("Origin") || ""; if (!origin) return true; const allowed = str(env.ALLOWED_ORIGINS).split(",").map((x) => x.trim()).filter(Boolean); return !allowed.length || allowed.includes(origin); }
function withCors(res, cors) { const headers = new Headers(res.headers); cors.forEach((v, k) => headers.set(k, v)); return new Response(res.body, { status: res.status, headers }); }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }
async function safeJson(req) { try { return await req.json(); } catch (_) { return {}; } }
function normalizePath(path = "") { const p = String(path || "/").replace(/\/{2,}/g, "/"); return p.length > 1 ? p.replace(/\/$/, "") : p; }
function str(v) { return v == null ? "" : String(v).trim(); }
function bool(v) { return v === true || ["1", "true", "yes", "y", "active", "approved"].includes(token(v)); }
function token(v) { return str(v).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
function formulaText(v) { return `"${String(v == null ? "" : v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`; }
function compact(obj) { return Object.fromEntries(Object.entries(obj || {}).filter(([, v]) => v !== undefined && v !== null && v !== "")); }
function safeStringify(v) { try { return JSON.stringify(v || {}); } catch (_) { return "{}"; } }
function shortHash(v) { let h = 0; for (const ch of str(v)) h = Math.imul(31, h) + ch.charCodeAt(0) | 0; return `h_${(h >>> 0).toString(16)}`; }
function makeRef(prefix) { const d = new Date(); const s = d.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14); return `${prefix}_${s}_${Math.random().toString(16).slice(2, 6)}`; }
function inferContactMethod(contact, line) { if (contact.includes("@")) return "email"; if (contact) return "phone"; if (line) return "line_or_member_id"; return "unknown"; }
function tierFromText(v) { const t = token(v); if (t.includes("black") || t.includes("svip")) return "black_card"; if (t.includes("vip")) return "vip"; if (t.includes("premium")) return "premium"; if (t.includes("standard") || t.includes("lite")) return "standard"; return ""; }
function normalizeMemberStatus(v) { const t = token(v); if (["active", "existing", "existing_active", "member_active", "active_member"].includes(t)) return "active"; if (["expired", "inactive", "cancelled", "canceled", "lapsed"].includes(t)) return t === "cancelled" || t === "canceled" ? "inactive" : t; if (["new", "guest", "not_found", "pending", "review_required"].includes(t)) return t; return "unknown"; }
function normalizeAccessScope(v) { const t = token(v); if (["public_private", "private_review", "blocked"].includes(t)) return t; return "public_only"; }
function normalizeRequestStatus(v) { const t = token(unwrapJsonString(v)); return ["draft", "pending", "review_required", "confirmed", "cancelled", "canceled"].includes(t) ? t : "draft"; }
function normalizeJobClass(v) { const t = token(v); return ["travel", "extreme", "vip", "pn", "private_review"].includes(t) ? t : "travel"; }
function normalizeModelAssetSource(v) { const t = token(v); return ["r2_catalog", "r2_prefix", "airtable_attachment", "drive_folder", "gmail_folder_reference", "manual_review"].includes(t) ? t : "manual_review"; }
function unwrapJsonString(v) { const s = str(v); if (s.length < 2 || s[0] !== '"' || s[s.length - 1] !== '"') return s; try { const parsed = JSON.parse(s); return typeof parsed === "string" ? parsed : s; } catch (_) { return s.replace(/^"+|"+$/g, ""); } }
function isRequestStatusSelectFailure(res, fields) { return Object.hasOwn(fields || {}, "Request Status") && res.status === 422 && /(INVALID_MULTIPLE_CHOICE_OPTIONS|INVALID_VALUE_FOR_COLUMN|Request Status|draft)/i.test(str(res.text)); }
function withoutRequestStatus(fields) { const next = { ...fields }; delete next["Request Status"]; return next; }
function publicUrlFromKey(env, key) { const base = str(env.MODEL_PUBLIC_ASSET_BASE_URL).replace(/\/+$/, ""); const k = str(key).replace(/^\/+/, ""); return base && k ? `${base}/${encodeURI(k)}` : ""; }
function escHtml(v) { return str(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

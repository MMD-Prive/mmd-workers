const API = "https://api.airtable.com/v0";
const PREFIX = "/studio/api/care-back";
const CLIENTS = "tblVv58TCbwh5j1fS";
const INBOX = "tblFHmfpB2TTrzO2e";
const STATUS = new Set(["ยังไม่ติดต่อ", "ส่งข้อความแล้ว", "ตอบกลับ", "รอ Boss อนุมัติ", "กลับมาแล้ว", "พักการติดต่อ"]);

export const isCareBackPath = (path = "") => path === PREFIX || path.startsWith(PREFIX + "/");

export async function handleCareBackRequest(request, env, path, method) {
  try {
    assertEnv(env);
    if (method === "GET" && path === PREFIX + "/overview") return json(await overview(env));
    if (method === "GET" && path === PREFIX + "/customers") return json(await listCustomers(request, env));
    if (method === "GET" && customerPath(path)) return json(await getCustomer(env, last(path)));
    if (method === "POST" && path === PREFIX + "/customers") return json(await queueCustomer(request, env, "care_back_customer_create"), 202);
    if (method === "PATCH" && customerPath(path)) return json(await queueCustomer(request, env, "care_back_customer_update", last(path)), 202);
    if (method === "POST" && approvalPath(path)) {
      if (!confirmed(request, env)) return json({ ok: false, error: "confirm_key_required" }, 403);
      return json(await queueApproval(request, env, path.split("/").at(-2)), 202);
    }
    if (method === "GET" && path === PREFIX + "/campaign") return json(campaign(env));
    if (method === "PUT" && path === PREFIX + "/campaign") {
      if (!confirmed(request, env)) return json({ ok: false, error: "confirm_key_required" }, 403);
      return json(await queueCampaign(request, env), 202);
    }
    return json({ ok: false, error: "not_found" }, 404);
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, Number(error?.status) || 500);
  }
}

async function overview(env) {
  const rows = (await fetchClients(env)).map(normalizeClient);
  const funnel = {};
  rows.forEach((row) => { funnel[row.care_status] = (funnel[row.care_status] || 0) + 1; });
  return { ok: true, source: "airtable", generated_at: new Date().toISOString(), metrics: {
    customers: rows.length,
    contact_due: rows.filter((x) => x.care_status === "ยังไม่ติดต่อ" || x.follow_up_due).length,
    replied: funnel["ตอบกลับ"] || 0,
    returned: funnel["กลับมาแล้ว"] || 0,
    pending_approval: funnel["รอ Boss อนุมัติ"] || 0,
  }, funnel };
}

async function listCustomers(request, env) {
  const url = new URL(request.url);
  const q = clean(url.searchParams.get("q")).toLowerCase();
  const status = clean(url.searchParams.get("status"));
  const limit = clamp(url.searchParams.get("limit"), 1, 100, 50);
  const offset = clamp(url.searchParams.get("offset"), 0, 10000, 0);
  let rows = (await fetchClients(env)).map(normalizeClient);
  if (q) rows = rows.filter((x) => [x.name, x.phone, x.email, x.tags].join(" ").toLowerCase().includes(q));
  if (status) rows = rows.filter((x) => x.care_status === status);
  return { ok: true, source: "airtable", total: rows.length, offset, limit, customers: rows.slice(offset, offset + limit) };
}

async function getCustomer(env, id) {
  const response = await airtable(env, clientsTable(env) + "/" + encodeURIComponent(id));
  if (!response.ok) throw err(response.status === 404 ? 404 : 502, response.status === 404 ? "customer_not_found" : "airtable_read_failed");
  return { ok: true, source: "airtable", customer: normalizeClient(await response.json()) };
}

async function queueCustomer(request, env, intent, recordId = "") {
  const body = await readJson(request);
  if (body.line_user_id) throw err(400, "line_user_id_not_allowed");
  if (intent.endsWith("create") && !clean(body.name || body.client_name)) throw err(400, "client_name_required");
  if (body.care_status && !STATUS.has(clean(body.care_status))) throw err(400, "invalid_care_status");
  return queue(env, { intent, client_name: clean(body.name || body.client_name), client_record_id: recordId,
    requested_by: "Chang", approval_state: body.requires_boss_approval === false ? "operator_queue" : "pending_boss_review", payload: safePayload(body) });
}

async function queueApproval(request, env, approvalId) {
  const body = await readJson(request);
  const decision = clean(body.decision);
  if (!["approved", "rejected", "needs_changes"].includes(decision)) throw err(400, "invalid_decision");
  return queue(env, { intent: "care_back_boss_decision", client_name: clean(body.client_name), client_record_id: clean(body.client_record_id),
    requested_by: "Boss Per", approval_state: decision, payload: { approval_id: approvalId, decision, note: clean(body.note) } });
}

async function queueCampaign(request, env) {
  const body = await readJson(request);
  const visibility = clean(body.visibility || "private");
  if (!["private", "paused", "public_review"].includes(visibility)) throw err(400, "invalid_visibility");
  if (visibility === "public_review" && body.private_pilot_complete !== true) throw err(409, "private_pilot_required");
  return queue(env, { intent: "care_back_campaign_update", requested_by: "Boss Per", approval_state: "approved",
    payload: { visibility, private_pilot_complete: body.private_pilot_complete === true, note: clean(body.note) } });
}

function campaign(env) {
  return { ok: true, campaign: { name: "6 CARE · CARE BACK", visibility: "private", write_mode: "queued",
    sequence: ["Chang เตรียมข้อมูล", "Boss Per อนุมัติเรื่องสำคัญ", "ทดลอง Private", "ประเมินก่อน Public"], source_table: clientsTable(env) } };
}

async function queue(env, item) {
  const queueId = "care_" + crypto.randomUUID();
  const fields = { inbox_id: queueId, source: "mmd_care_back", intent: item.intent, member_name: item.client_name || "",
    admin_note: ["CARE BACK: " + item.intent, item.client_name && "Client: " + item.client_name, "By: " + item.requested_by, "Approval: " + item.approval_state].filter(Boolean).join("\n"),
    payload_json: JSON.stringify({ version: "care-back-v1", ...item.payload, client_record_id: item.client_record_id || "", requested_by: item.requested_by, approval_state: item.approval_state }),
    status: item.approval_state === "approved" ? "approved" : "new", error_message: "" };
  const response = await airtable(env, inboxTable(env), { method: "POST", body: JSON.stringify({ fields, typecast: false }) });
  if (!response.ok) throw err(502, "airtable_queue_write_failed");
  const record = await response.json();
  return { ok: true, mode: "queued", queue_id: queueId, record_id: record.id || null, intent: item.intent, approval_state: item.approval_state };
}

async function fetchClients(env) {
  const rows = [];
  let offset = "";
  do {
    const params = new URLSearchParams({ pageSize: "100" });
    if (offset) params.set("offset", offset);
    const response = await airtable(env, clientsTable(env) + "?" + params);
    if (!response.ok) throw err(502, "airtable_clients_read_failed");
    const data = await response.json();
    rows.push(...(data.records || []));
    offset = data.offset || "";
  } while (offset && rows.length < 500);
  return rows;
}

function normalizeClient(record) {
  const f = record.fields || {};
  const rawStatus = pick(f, ["Care Back Status", "care_back_status", "care_status", "Status", "status"]);
  return { id: record.id, name: pick(f, ["Client Name", "client_name", "Name", "name", "display_name"]) || "ไม่ระบุชื่อ",
    phone: maskPhone(pick(f, ["Phone", "phone", "Mobile", "mobile", "member_phone"])),
    email: maskEmail(pick(f, ["Email", "email", "member_email"])), care_status: STATUS.has(rawStatus) ? rawStatus : "ยังไม่ติดต่อ",
    owner: pick(f, ["Care Owner", "care_owner", "Owner", "owner"]) || "Chang",
    last_contact_at: pick(f, ["Last Contacted", "last_contacted", "last_contact_at", "updated_at"]) || null,
    follow_up_due: Boolean(pick(f, ["Care Follow Up Due", "follow_up_due"])), tags: pick(f, ["Tags", "tags", "legacy_tags"]) };
}

const customerPath = (path) => /^\/studio\/api\/care-back\/customers\/rec[\w]+$/.test(path);
const approvalPath = (path) => /^\/studio\/api\/care-back\/approvals\/[\w-]+\/decision$/.test(path);
const last = (path) => path.split("/").pop();
const clientsTable = (env) => env.AIRTABLE_TABLE_CLIENTS_ID || env.AIRTABLE_TABLE_CLIENTS || CLIENTS;
const inboxTable = (env) => env.AIRTABLE_TABLE_CONSOLE_INBOX_ID || INBOX;
const confirmed = (request, env) => Boolean(env.CONFIRM_KEY) && clean(request.headers.get("X-Confirm-Key")) === clean(env.CONFIRM_KEY);
function assertEnv(env) { if (!env.AIRTABLE_BASE_ID || !env.AIRTABLE_API_KEY) throw err(500, "missing_airtable_env"); }
function airtable(env, path, init = {}) { return fetch(API + "/" + env.AIRTABLE_BASE_ID + "/" + path, { ...init, headers: { authorization: "Bearer " + env.AIRTABLE_API_KEY, "content-type": "application/json", ...(init.headers || {}) } }); }
async function readJson(request) { try { const x = await request.json(); return x && typeof x === "object" && !Array.isArray(x) ? x : {}; } catch { throw err(400, "invalid_json"); } }
function safePayload(body) { const copy = { ...body }; delete copy.t; delete copy.token; delete copy.line_user_id; return copy; }
function pick(fields, names) { for (const name of names) if (fields[name] !== undefined && fields[name] !== null && fields[name] !== "") return Array.isArray(fields[name]) ? fields[name].map((x) => x?.name || x).join(", ") : String(fields[name]); return ""; }
function maskPhone(value) { const x = clean(value); return x.length > 4 ? "••• " + x.slice(-4) : x; }
function maskEmail(value) { const x = clean(value); if (!x.includes("@")) return x; const [a, b] = x.split("@"); return a.slice(0, 2) + "•••@" + b; }
function clean(value) { return String(value ?? "").trim(); }
function clamp(value, min, max, fallback) { const n = Number.parseInt(value, 10); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback; }
function err(status, message) { const error = new Error(message); error.status = status; return error; }
function json(payload, status = 200) { return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }); }

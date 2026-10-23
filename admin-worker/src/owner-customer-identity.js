import { readCredentialBoundAdminActor } from "./credential-bound-admin-session.js";

const API = "https://api.airtable.com/v0";
const CLIENTS = "tblVv58TCbwh5j1fS";
const INDEX = "tblwn6I9VWie5d7Ui";
export const OWNER_CUSTOMER_PAGE = "/internal/admin/customers";
export const OWNER_CUSTOMER_IDENTITY_API = "/v1/admin/customers/identity";

export function isOwnerCustomerIdentityRequest(path, method) {
  path = normPath(path);
  return (path === OWNER_CUSTOMER_PAGE && method === "GET")
    || (path === OWNER_CUSTOMER_IDENTITY_API && ["GET", "POST"].includes(method));
}

export async function handleOwnerCustomerIdentityRequest(request, env = {}) {
  const actor = await readCredentialBoundAdminActor(request, env);
  const page = normPath(new URL(request.url).pathname) === OWNER_CUSTOMER_PAGE;
  if (!actor) return page
    ? Response.redirect(new URL("/internal/admin/login?next=" + encodeURIComponent(OWNER_CUSTOMER_PAGE), request.url), 302)
    : reply({ ok: false, error: "unauthorized" }, 401);
  if (page) return new Response(renderPage(), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store, private" } });

  if (request.method === "GET") {
    const uid = lineUid(new URL(request.url).searchParams.get("line_identity"));
    if (!uid) return reply({ ok: false, error: "valid_line_uid_or_chat_url_required" }, 400);
    return reply({ ok: true, ...(await findIdentity(env, uid)) });
  }
  if (clean(request.headers.get("Origin")) !== new URL(request.url).origin) {
    return reply({ ok: false, error: "origin_not_allowed" }, 403);
  }
  const body = await request.json().catch(() => null);
  if (!body) return reply({ ok: false, error: "json_body_required" }, 400);
  try {
    return reply({ ok: true, ...(await upsertOwnerCustomerIdentity(env, body, { actor })) });
  } catch (error) {
    return reply({ ok: false, error: clean(error.code || error.message) }, Number(error.status) || 500);
  }
}

export async function upsertOwnerCustomerIdentity(env, raw = {}, context = {}) {
  requireStorage(env);
  const input = normalizeOwnerIdentityInput(raw);
  const clientsTable = clean(env.AIRTABLE_TABLE_CLIENTS_ID) || CLIENTS;
  const indexTable = clean(env.AIRTABLE_TABLE_PRE_SESSION_CLIENT_INDEX_ID) || INDEX;
  const [uidClients, aliases] = await Promise.all([
    list(env, clientsTable, ["Client Name", "line_user_id", "line_display_name"], exact("line_user_id", input.line_user_id)),
    list(env, indexTable, ["preferred_name", "line_user_id", "line_display_name", "linked_client", "last_synced_at"], exact("line_user_id", input.line_user_id)),
  ]);
  const linked = uniq([...uidClients.map(r => r.id), ...aliases.flatMap(r => links(r.fields?.linked_client))]);
  if (linked.length > 1) throw issue("line_uid_linked_to_multiple_clients", 409);

  let client = null;
  if (input.client_id) {
    client = await get(env, clientsTable, input.client_id);
    if (!client) throw issue("client_not_found", 404);
    const existingUid = lineUid(client.fields?.line_user_id);
    if (existingUid && existingUid !== input.line_user_id) throw issue("client_line_uid_conflict", 409);
    if (linked.length && linked[0] !== client.id) throw issue("line_uid_linked_to_another_client", 409);
  } else if (linked.length === 1) {
    client = uidClients.find(r => r.id === linked[0]) || await get(env, clientsTable, linked[0]);
  }

  let created = false;
  if (!client) {
    if (!input.create_if_missing) throw issue("existing_client_required_or_enable_create", 404);
    if (!input.canonical_name) throw issue("canonical_name_required_for_new_client", 400);
    client = await write(env, clientsTable, "", "POST", {
      "Client Name": input.canonical_name,
      mmd_client_name: input.canonical_name,
      nickname: input.canonical_name,
      line_user_id: input.line_user_id,
      line_display_name: input.line_display_name,
      source: "mmd_line_ofc_owner_intake",
      primary_channel: "line_ofc",
    });
    created = true;
  } else {
    const patch = {};
    if (!lineUid(client.fields?.line_user_id)) patch.line_user_id = input.line_user_id;
    if (input.line_display_name && clean(client.fields?.line_display_name) !== input.line_display_name) patch.line_display_name = input.line_display_name;
    if (Object.keys(patch).length) client = await write(env, clientsTable, client.id, "PATCH", patch);
  }

  const same = aliases.find(row => nameKey(row.fields?.preferred_name) === nameKey(input.per_rename)
    && links(row.fields?.linked_client).includes(client.id));
  const now = new Date().toISOString();
  let alias;
  if (same) {
    alias = await write(env, indexTable, same.id, "PATCH", {
      line_display_name: input.line_display_name || clean(same.fields?.line_display_name),
      resolution_status: "linked", session_lookup_status: "canonical_ready", last_synced_at: now,
    });
  } else {
    const suffix = (await sha(input.line_user_id + "|" + nameKey(input.per_rename))).slice(0, 16);
    alias = await write(env, indexTable, "", "POST", {
      identity_key: "line_ofc_per_rename:" + input.line_user_id.toLowerCase() + ":" + suffix,
      source_type: "line_ofc_staging", source_record_id: "owner:" + client.id,
      preferred_name: input.per_rename, line_user_id: input.line_user_id,
      line_display_name: input.line_display_name, linked_client: [client.id],
      resolution_status: "linked", session_lookup_status: "canonical_ready",
      confidence: "owner_confirmed", candidate_only: false, current_rights_source: "none",
      source_snapshot_json: JSON.stringify({
        schema: "mmd_owner_customer_identity_v1",
        actor: clean(context.actor?.id || "per"), purpose: input.purpose, recorded_at: now,
      }),
      last_synced_at: now,
      notes: "Owner-confirmed MMD LINE identity. Historical aliases are retained.",
    });
  }
  return {
    client_id: client.id, client_created: created, alias_id: alias.id,
    per_rename: input.per_rename, line_user_id: input.line_user_id,
    historical_aliases_retained: true, searchable_in_create_job: true,
  };
}

export function normalizeOwnerIdentityInput(raw = {}) {
  const uid = lineUid(raw.line_identity || raw.line_user_id || raw.chat_url);
  if (!uid) throw issue("valid_line_uid_or_chat_url_required", 400);
  const rename = clean(raw.per_rename).slice(0, 120);
  if (!rename) throw issue("per_rename_required", 400);
  return {
    client_id: /^rec[a-zA-Z0-9]{14,}$/.test(clean(raw.client_id)) ? clean(raw.client_id) : "",
    create_if_missing: raw.create_if_missing === true,
    canonical_name: clean(raw.canonical_name).slice(0, 120),
    per_rename: rename, line_user_id: uid,
    line_display_name: clean(raw.line_display_name).slice(0, 120),
    purpose: clean(raw.purpose || "profile_update").slice(0, 60),
  };
}

async function findIdentity(env, uid) {
  requireStorage(env);
  const clientsTable = clean(env.AIRTABLE_TABLE_CLIENTS_ID) || CLIENTS;
  const indexTable = clean(env.AIRTABLE_TABLE_PRE_SESSION_CLIENT_INDEX_ID) || INDEX;
  const [clients, aliases] = await Promise.all([
    list(env, clientsTable, ["Client Name", "line_user_id"], exact("line_user_id", uid)),
    list(env, indexTable, ["preferred_name", "linked_client", "last_synced_at"], exact("line_user_id", uid)),
  ]);
  const linked = uniq(aliases.flatMap(row => links(row.fields?.linked_client)));
  return {
    line_user_id: uid,
    client: clients.length === 1 ? { id: clients[0].id, name: clean(clients[0].fields?.["Client Name"]) } : null,
    aliases: aliases.map(row => ({ id: row.id, per_rename: clean(row.fields?.preferred_name), synced_at: clean(row.fields?.last_synced_at) })),
    conflict: clients.length > 1 || linked.length > 1,
  };
}

async function list(env, table, fields, formula) {
  const q = new URLSearchParams({ pageSize: "100", filterByFormula: formula });
  fields.forEach(field => q.append("fields[]", field));
  const data = await air(env, table + "?" + q, { method: "GET" });
  return Array.isArray(data.records) ? data.records : [];
}
async function get(env, table, id) {
  const response = await airRaw(env, table + "/" + encodeURIComponent(id), { method: "GET" });
  if (response.status === 404) return null;
  if (!response.ok) throw issue("airtable_read_failed", 502);
  return response.json();
}
async function write(env, table, id, method, fields) {
  return air(env, table + (id ? "/" + encodeURIComponent(id) : ""), {
    method, body: JSON.stringify({ fields: compact(fields) }),
  });
}
async function air(env, path, init) {
  const response = await airRaw(env, path, init);
  if (!response.ok) throw issue("airtable_" + response.status, 502);
  return response.json();
}
function airRaw(env, path, init = {}) {
  return fetch(API + "/" + encodeURIComponent(env.AIRTABLE_BASE_ID) + "/" + path, {
    ...init,
    headers: { Authorization: "Bearer " + env.AIRTABLE_API_KEY, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
  });
}

function renderPage() {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>อัปเดตลูกค้า MMD</title><style>
*{box-sizing:border-box}body{margin:0;background:#fff;color:#292b2e;font-family:Inter,"Noto Sans Thai",system-ui,sans-serif}.w{max-width:680px;margin:auto;padding:20px 16px 60px}.box{border:1px solid #ddd;border-radius:18px;padding:18px;margin-bottom:14px}h1{font-size:24px;margin:0 0 6px}p{color:#666;line-height:1.5}label{display:block;font-weight:750;margin:14px 0 6px}input,select{width:100%;border:1px solid #bbb;border-radius:12px;padding:13px;font:inherit}button{margin-top:14px;border:0;border-radius:12px;padding:13px 16px;background:#f5a66b;color:#30261f;font:inherit;font-weight:800}.check{display:flex;gap:8px;align-items:center}.check input{width:auto}.hide{display:none}.msg{margin-top:12px;padding:11px;border-radius:10px;background:#fff1e7}.ok{background:#edf8ef;color:#215d2b}
</style></head><body><main class="w"><section class="box"><h1>อัปเดตลูกค้า MMD</h1><p>เก็บ LINE UID ครั้งเดียว อัปเดตชื่อ Per Rename บนลูกค้ารายเดิม และเก็บชื่อเก่าไว้ค้นย้อนหลัง</p></section><form id="f" class="box">
<label>Client ID เดิม (เว้นว่างได้ ถ้า UID ผูกไว้แล้ว)</label><input id="client" placeholder="rec…">
<label>LINE UID หรือ URL แชต LINE OA</label><input id="uid" required placeholder="U… หรือ URL ที่มี U…"><button type="button" id="check">ตรวจข้อมูลเดิม</button><div id="old"></div>
<label>ชื่อ Per Rename ปัจจุบัน</label><input id="rename" required placeholder="เช่น ตั้ว 18 กย 69"><label>ชื่อ LINE เดิม</label><input id="display" placeholder="เช่น GT">
<label class="check"><input type="checkbox" id="create"> ลูกค้าใหม่ — สร้าง Client ครั้งแรก</label><div id="new" class="hide"><label>ชื่อลูกค้าหลัก</label><input id="canonical"></div>
<label>ใช้ครั้งนี้สำหรับ</label><select id="purpose"><option value="profile_update">อัปเดตชื่อ</option><option value="renewal">ต่ออายุสมาชิก</option><option value="new_customer">ลูกค้าใหม่</option></select>
<button type="submit">บันทึกให้ค้นหาใน Create Job</button><div id="msg"></div></form></main><script>
const $=id=>document.getElementById(id),api="/v1/admin/customers/identity";
$("create").onchange=()=>$("new").classList.toggle("hide",!$("create").checked);
$("check").onclick=async()=>{try{say("old","กำลังตรวจ…");const r=await fetch(api+"?line_identity="+encodeURIComponent($("uid").value),{credentials:"include"}),d=await r.json();if(!r.ok)throw Error(d.error);if(d.client)$("client").value=d.client.id;say("old",(d.client?"พบลูกค้าเดิม: "+d.client.name:"ยังไม่ผูกกับ Client")+(d.aliases.length?" · ชื่อเดิม "+d.aliases.map(x=>x.per_rename).join(", "):""),d.conflict?"msg":"msg ok")}catch(e){say("old",e.message,"msg")}};
$("f").onsubmit=async e=>{e.preventDefault();try{say("msg","กำลังบันทึก…","msg");const body={client_id:$("client").value,line_identity:$("uid").value,per_rename:$("rename").value,line_display_name:$("display").value,create_if_missing:$("create").checked,canonical_name:$("canonical").value,purpose:$("purpose").value};const r=await fetch(api,{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify(body)}),d=await r.json();if(!r.ok)throw Error(d.error);$("client").value=d.client_id;say("msg","บันทึกแล้ว ค้นหาชื่อนี้ใน Create Job ได้ และชื่อเก่ายังอยู่","msg ok")}catch(e){say("msg",e.message,"msg")}};
function say(id,t,c=""){ $(id).innerHTML='<div class="'+c+'">'+esc(t)+'</div>' }function esc(v){return String(v||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
</script></body></html>`;
}

function exact(field, value) { return "{" + field + "}='" + clean(value).replace(/'/g, "\\'") + "'"; }
function lineUid(value) { const m = clean(value).match(/U[0-9a-f]{32}/i); return m ? m[0].toUpperCase() : ""; }
function nameKey(value) { return clean(value).normalize("NFKC").toLowerCase().replace(/[่้๊๋]/g, "").replace(/\s+/g, " "); }
function links(value) { return Array.isArray(value) ? value.map(v => clean(v?.id || v)).filter(Boolean) : clean(value) ? [clean(value)] : []; }
function uniq(values) { return [...new Set((values || []).map(clean).filter(Boolean))]; }
function compact(obj) { return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== "" && value !== null && value !== undefined)); }
function normPath(value) { const p = clean(value || "/").replace(/\/{2,}/g, "/"); return p.length > 1 ? p.replace(/\/+$/, "") : p; }
function requireStorage(env) { if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) throw issue("customer_identity_storage_not_ready", 503); }
function issue(code, status) { const error = new Error(code); error.code = code; error.status = status; return error; }
function reply(body, status = 200) { return Response.json(body, { status, headers: { "cache-control": "no-store, private" } }); }
async function sha(value) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(b)].map(v => v.toString(16).padStart(2, "0")).join(""); }
function clean(value) { return String(value ?? "").trim(); }

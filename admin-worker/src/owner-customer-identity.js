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
    list(env, clientsTable, ["Client Name", "line_user_id", "Profile Photo"], exact("line_user_id", uid)),
    list(env, indexTable, ["preferred_name", "linked_client", "last_synced_at"], exact("line_user_id", uid)),
  ]);
  const linked = uniq(aliases.flatMap(row => links(row.fields?.linked_client)));
  return {
    line_user_id: uid,
    client: clients.length === 1 ? {
      id: clients[0].id,
      name: clean(clients[0].fields?.["Client Name"]),
      photos: ownerCustomerPhotos(clients[0].fields?.["Profile Photo"]),
    } : null,
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

export function ownerCustomerPhotos(value) {
  const seen = new Set();
  const photos = [];
  for (const item of Array.isArray(value) ? value : []) {
    const url = clean(item?.thumbnails?.large?.url || item?.url, 4000);
    if (!/^https:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    photos.push({ url, name: clean(item?.filename, 180) || `รูปที่ ${photos.length + 1}` });
    if (photos.length === 5) break;
  }
  return photos;
}

function renderPage() {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>อัปเดตลูกค้า MMD</title><style>
*{box-sizing:border-box}body{margin:0;background:#fff;color:#292b2e;font-family:Inter,"Noto Sans Thai",system-ui,sans-serif}.w{max-width:720px;margin:auto;padding:16px 14px 40px}.head{margin:0 0 12px}h1{font-size:22px;margin:0 0 3px}h2{font-size:17px;margin:0 0 12px}.sub,.hint{color:#666;font-size:14px;line-height:1.45;margin:0}.box{border:1px solid #ddd;border-radius:16px;padding:15px;margin-bottom:12px}.row{display:flex;gap:8px}label{display:block;font-weight:750;margin:12px 0 5px}input,select{width:100%;min-width:0;border:1px solid #bbb;border-radius:11px;padding:11px;font:inherit;background:white}button{border:0;border-radius:11px;padding:11px 14px;background:#f5a66b;color:#30261f;font:inherit;font-weight:800;cursor:pointer;white-space:nowrap}.row button{margin:0}.submit{width:100%;margin-top:14px}.hide,[hidden]{display:none!important}.msg{margin-top:10px;padding:10px 12px;border:1px solid #e7d5c8;border-radius:10px;background:#fff7f1;line-height:1.4}.ok{background:#f0f8f1;border-color:#d4e6d5;color:#215d2b}.warn{background:#fff6e8}.history{font-size:13px;color:#5c5e60;margin:8px 0 0}.photos{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;margin-top:12px}.photo{display:block;aspect-ratio:1;border:1px solid #ddd;border-radius:10px;overflow:hidden;background:#f5f5f5}.photo img{width:100%;height:100%;object-fit:cover;display:block}.empty{font-size:13px;color:#777;padding:9px 0}.advanced{margin-top:12px;border-top:1px solid #eee;padding-top:10px}.advanced summary{font-size:13px;color:#555;cursor:pointer}.checkline{display:flex;gap:9px;align-items:center;margin:12px 0 0;font-weight:650}.checkline input{width:18px;height:18px;margin:0;flex:none}.grid{display:grid;grid-template-columns:1fr 1fr;gap:0 10px}.full{grid-column:1/-1}@media(max-width:480px){.w{padding:12px 11px 32px}.box{padding:13px}.row{align-items:stretch}.row input{padding:10px}.row button{padding:10px 12px}.grid{grid-template-columns:1fr}.full{grid-column:auto}.photos{gap:5px}}
</style></head><body><main class="w"><header class="head"><h1>อัปเดตลูกค้า MMD</h1><p class="sub">ค้นหาด้วย LINE UID แล้วอัปเดตชื่อใหม่ ชื่อเดิมยังใช้ค้นได้</p></header>
<form id="f"><section class="box"><h2>1 · ค้นหาลูกค้า</h2><label for="uid">LINE UID หรือ URL แชต LINE OA</label><div class="row"><input id="uid" required placeholder="U… หรือวาง URL แชต"><button type="button" id="check">ค้นหา</button></div><p class="hint">ต้องใช้ UID จาก LINE OA เพื่อยืนยันว่าเป็นคนเดียวกัน</p><div id="old" aria-live="polite"></div><details class="advanced"><summary>มี Client ID อยู่แล้ว? (ไม่บังคับ)</summary><label for="client">Client ID</label><input id="client" placeholder="rec…"></details></section>
<section id="details" class="box" hidden><h2>2 · อัปเดตชื่อ</h2><div id="identity"></div><div class="grid"><div class="full"><label for="rename">Per Rename ปัจจุบัน</label><input id="rename" required placeholder="เช่น ตั้ว 18 กย 69"></div><div><label for="display">ชื่อใน LINE (ถ้ามี)</label><input id="display" placeholder="เช่น GT"></div><div><label for="purpose">อัปเดตเพื่อ</label><select id="purpose"><option value="profile_update">อัปเดตชื่อ</option><option value="renewal">ต่ออายุสมาชิก</option><option value="new_customer">ลูกค้าใหม่</option></select></div></div><label class="checkline"><input type="checkbox" id="create"> ลูกค้าใหม่ — สร้าง Client ครั้งแรก</label><div id="new" class="hide"><label for="canonical">ชื่อลูกค้าหลัก</label><input id="canonical" placeholder="ชื่อที่ใช้เป็นข้อมูลหลัก"></div><button class="submit" type="submit">บันทึกและใช้ค้นหาใน Create Job</button><div id="msg" aria-live="polite"></div></section></form></main><script>
const $=id=>document.getElementById(id),api="/v1/admin/customers/identity";let loadedUid="";
$("uid").addEventListener("input",()=>{if($("uid").value.trim()!==loadedUid){$("details").hidden=true;$("old").replaceChildren();loadedUid=""}});
$("create").onchange=()=>{$("new").classList.toggle("hide",!$("create").checked);$("canonical").required=$("create").checked};
$("check").onclick=async()=>{const raw=$("uid").value.trim();if(!raw){message("old","ใส่ LINE UID หรือ URL แชตก่อนค่ะ");return}$("check").disabled=true;$("check").textContent="กำลังค้น…";try{const r=await fetch(api+"?line_identity="+encodeURIComponent(raw),{credentials:"include"}),d=await r.json();if(!r.ok)throw Error(friendly(d.error));if(d.conflict)throw Error("UID นี้เชื่อมกับลูกค้ามากกว่าหนึ่งรายการ กรุณาตรวจข้อมูลก่อน");loadedUid=raw;$("details").hidden=false;$("msg").replaceChildren();$("create").checked=!d.client;$("new").classList.toggle("hide",!!d.client);$("canonical").required=!d.client;$("client").value=d.client?.id||"";$("identity").replaceChildren();const title=document.createElement("div");title.className="msg "+(d.client?"ok":"warn");title.textContent=d.client?"พบลูกค้าเดิม: "+(d.client.name||"ไม่ระบุชื่อ"):"ยังไม่พบ Client นี้ — เลือกสร้างลูกค้าใหม่ด้านล่างได้";$("identity").append(title);if(d.aliases?.length){const prev=document.createElement("p");prev.className="history";prev.textContent="ชื่อเดิมที่เก็บไว้: "+d.aliases.map(x=>x.per_rename).filter(Boolean).join(" · ");$("identity").append(prev)}renderPhotos(d.client?.photos||[])}catch(e){message("old",friendly(e.message))}finally{$("check").disabled=false;$("check").textContent="ค้นหา"}};
$("f").onsubmit=async e=>{e.preventDefault();if(!loadedUid||loadedUid!==$("uid").value.trim()){message("old","กดค้นหาลูกค้าก่อนบันทึกค่ะ");return}const button=$("f").querySelector("[type=submit]");button.disabled=true;button.textContent="กำลังบันทึก…";try{const body={client_id:$("client").value,line_identity:$("uid").value,per_rename:$("rename").value,line_display_name:$("display").value,create_if_missing:$("create").checked,canonical_name:$("canonical").value,purpose:$("purpose").value};const r=await fetch(api,{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify(body)}),d=await r.json();if(!r.ok)throw Error(friendly(d.error));$("client").value=d.client_id;message("msg","บันทึกแล้ว ค้นหาชื่อนี้ใน Create Job ได้ และชื่อเก่ายังอยู่","ok")}catch(e){message("msg",friendly(e.message))}finally{button.disabled=false;button.textContent="บันทึกและใช้ค้นหาใน Create Job"}};
function renderPhotos(photos){const old=$("identity").querySelector(".photos,.empty");if(old)old.remove();const valid=(Array.isArray(photos)?photos:[]).filter(p=>/^https:\/\//i.test(p?.url||"")).slice(0,5);if(!valid.length){const empty=document.createElement("p");empty.className="empty";empty.textContent="ยังไม่มีรูปที่เคยบันทึกไว้";$("identity").append(empty);return}const grid=document.createElement("div");grid.className="photos";for(const p of valid){const a=document.createElement("a");a.className="photo";a.href=p.url;a.target="_blank";a.rel="noopener";a.setAttribute("aria-label",p.name||"เปิดรูปลูกค้า");const img=document.createElement("img");img.src=p.url;img.alt=p.name||"รูปลูกค้า";img.loading="lazy";a.append(img);grid.append(a)}$("identity").append(grid)}
function message(id,text,kind=""){const el=document.createElement("div");el.className="msg "+kind;el.textContent=text;$(id).replaceChildren(el)}function friendly(e){const map={valid_line_uid_or_chat_url_required:"ใส่ LINE UID หรือ URL แชต LINE OA ที่มี UID ค่ะ",line_uid_linked_to_multiple_clients:"UID นี้ผูกกับลูกค้าหลายรายการ กรุณาตรวจสอบก่อน",existing_client_required_or_enable_create:"ไม่พบลูกค้าเดิม ให้เลือกสร้างลูกค้าใหม่ก่อนบันทึก",canonical_name_required_for_new_client:"กรอกชื่อลูกค้าหลักก่อนค่ะ",per_rename_required:"กรอกชื่อ Per Rename ก่อนค่ะ",unauthorized:"หมดเวลาใช้งาน กรุณาเข้าสู่ระบบใหม่"};return map[e]||e||"ทำรายการไม่สำเร็จ ลองอีกครั้งค่ะ"}
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

const AIRTABLE_API = "https://api.airtable.com/v0";
export const TELEGRAM_BIND_INTERNAL_PATH = "/__internal/telegram-identity-bind";
const BINDS_TABLE_DEFAULT = "tblnoEmhS3EpdtV6E";
const CLIENTS_TABLE_DEFAULT = "tblVv58TCbwh5j1fS";
const MODELS_TABLE_DEFAULT = "tblI4B0bI446vp9GX";
const MEMBER_ENTITLEMENTS_TABLE_DEFAULT = "tblNImdF9PKAxhXGi";
const BOT_USERNAME_DEFAULT = "mmdprivebot";
const BIND_TTL_MS = 15 * 60 * 1000;
const ALLOWED_INTERNAL_CALLERS = new Set(["member-pages-worker", "telegram-worker"]);

export async function handleTelegramBindAuthorityRpc(request, env = {}) {
  let url;
  try { url = new URL(request.url); } catch { return json({ ok:false, error:"invalid_request" }, 400); }
  if (url.pathname !== TELEGRAM_BIND_INTERNAL_PATH) return json({ ok:false, error:"not_found" }, 404);
  if (url.hostname !== "admin-worker.internal") return json({ ok:false, error:"internal_only" }, 403);
  if (request.method !== "POST") return json({ ok:false, error:"method_not_allowed" }, 405);
  const caller = clean(request.headers.get("x-mmd-service-binding"), 80);
  if (!ALLOWED_INTERNAL_CALLERS.has(caller)) return json({ ok:false, error:"internal_caller_invalid" }, 403);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ ok:false, error:"invalid_json" }, 400);

  if (body.operation === "issue_client" && caller === "member-pages-worker") {
    return json(await issueClientTelegramBind(env, { line_user_id: body.line_user_id }), 200);
  }
  if (body.operation === "consume" && caller === "telegram-worker") {
    const result = await consumeTelegramBind(env, {
      start_arg: body.start_arg,
      telegram_user_id: body.telegram_user_id,
      telegram_username: body.telegram_username,
    });
    return json(result, result.ok ? 200 : result.status || 400);
  }
  return json({ ok:false, error:"operation_not_allowed" }, 403);
}

export async function issueClientTelegramBind(env, { line_user_id } = {}) {
  const lineUserId = clean(line_user_id, 80);
  if (!/^U[0-9a-f]{32}$/i.test(lineUserId)) return { ok:false, status:400, error:"line_identity_invalid" };
  const records = await airtableList(env, clientsTable(env), `{line_user_id}="${escapeFormula(lineUserId)}"`, 2);
  if (!records.ok) return { ok:false, status:503, error:"client_lookup_unavailable" };
  if (records.records.length !== 1) {
    return { ok:false, status:records.records.length > 1 ? 409 : 404, error:records.records.length > 1 ? "client_identity_conflict" : "client_not_found" };
  }
  return issueForRecord(env, "client", records.records[0]);
}

export async function issueModelTelegramBind(env, { model_record_id } = {}) {
  const recordId = clean(model_record_id, 40);
  if (!/^rec[A-Za-z0-9]{14,24}$/.test(recordId)) return { ok:false, status:400, error:"model_record_id_invalid" };
  const model = await airtableGet(env, modelsTable(env), recordId);
  if (!model.ok) return { ok:false, status:model.status === 404 ? 404 : 503, error:model.status === 404 ? "model_not_found" : "model_lookup_unavailable" };
  return issueForRecord(env, "model", model.record);
}

async function issueForRecord(env, role, record) {
  const fields = record?.fields || {};
  const status = normalizeStatus(fields.telegram_verification_status);
  const existingId = clean(fields.telegram_user_id, 40);
  if (status === "verified" && /^\d{5,20}$/.test(existingId)) {
    return {
      ok:true,
      state:"connected",
      telegram_connected:true,
      telegram_username: safeUsername(fields.telegram_username),
      connect_url:null,
      expires_at:null,
    };
  }
  if (status === "conflict") return { ok:false, status:409, error:"telegram_binding_conflict" };

  const raw = randomToken(24);
  const startArg = `bind_${raw}`;
  const tokenHash = await sha256Hex(startArg);
  const now = new Date();
  const expires = new Date(now.getTime() + BIND_TTL_MS);
  const bindId = `tgb_${crypto.randomUUID().replace(/-/g, "")}`;
  const created = await airtableCreate(env, bindsTable(env), {
    bind_id: bindId,
    token_hash: tokenHash,
    role,
    ...(role === "client" ? { Client: [record.id] } : { Model: [record.id] }),
    status: "pending",
    created_at: now.toISOString(),
    expires_at: expires.toISOString(),
  });
  if (!created.ok) return { ok:false, status:503, error:"telegram_bind_issue_failed" };

  const bot = clean(env.TELEGRAM_BOT_USERNAME || BOT_USERNAME_DEFAULT, 80).replace(/^@/, "");
  return {
    ok:true,
    state:"connect_required",
    telegram_connected:false,
    connect_url:`https://t.me/${encodeURIComponent(bot)}?start=${encodeURIComponent(startArg)}`,
    expires_at:expires.toISOString(),
  };
}

export async function consumeTelegramBind(env, { start_arg, telegram_user_id, telegram_username } = {}) {
  const startArg = clean(start_arg, 100);
  const telegramUserId = clean(telegram_user_id, 40);
  const username = safeUsername(telegram_username);
  if (!/^bind_[A-Za-z0-9_-]{20,60}$/.test(startArg)) return { ok:false, status:400, error:"telegram_bind_token_invalid" };
  if (!/^\d{5,20}$/.test(telegramUserId)) return { ok:false, status:400, error:"telegram_identity_invalid" };

  const tokenHash = await sha256Hex(startArg);
  const found = await airtableList(env, bindsTable(env), `{token_hash}="${escapeFormula(tokenHash)}"`, 2);
  if (!found.ok) return { ok:false, status:503, error:"telegram_bind_lookup_unavailable" };
  if (found.records.length !== 1) return { ok:false, status:found.records.length > 1 ? 409 : 404, error:found.records.length > 1 ? "telegram_bind_registry_conflict" : "telegram_bind_not_found" };

  const bind = found.records[0];
  const bf = bind.fields || {};
  const bindStatus = normalizeStatus(bf.status);
  if (bindStatus === "consumed") {
    return clean(bf.telegram_user_id,40) === telegramUserId
      ? { ok:true, state:"already_connected", telegram_connected:true, role:normalizeRole(bf.role) }
      : { ok:false, status:409, error:"telegram_bind_already_consumed" };
  }
  if (bindStatus !== "pending") return { ok:false, status:409, error:`telegram_bind_${bindStatus || "unavailable"}` };

  const expiresAt = Date.parse(clean(bf.expires_at,80));
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    await airtableUpdate(env, bindsTable(env), bind.id, { status:"expired" }).catch(() => null);
    return { ok:false, status:410, error:"telegram_bind_expired" };
  }

  const role = normalizeRole(bf.role);
  const linked = role === "client" ? linkedIds(bf.Client) : linkedIds(bf.Model);
  if (!role || linked.length !== 1) {
    await airtableUpdate(env, bindsTable(env), bind.id, { status:"conflict" }).catch(() => null);
    return { ok:false, status:409, error:"telegram_bind_subject_invalid" };
  }

  const table = role === "client" ? clientsTable(env) : modelsTable(env);
  const subject = await airtableGet(env, table, linked[0]);
  if (!subject.ok) return { ok:false, status:503, error:"telegram_bind_subject_unavailable" };
  const sf = subject.record.fields || {};
  const priorStatus = normalizeStatus(sf.telegram_verification_status);
  const priorId = clean(sf.telegram_user_id,40);

  if (priorStatus === "verified" && /^\d{5,20}$/.test(priorId) && priorId !== telegramUserId) {
    await airtableUpdate(env, bindsTable(env), bind.id, {
      status:"conflict",
      telegram_user_id:telegramUserId,
      telegram_username:username || "",
    }).catch(() => null);
    return { ok:false, status:409, error:"telegram_identity_already_bound" };
  }

  const nowIso = new Date().toISOString();
  const updated = await airtableUpdate(env, table, subject.record.id, {
    telegram_user_id:telegramUserId,
    telegram_username:username || "",
    telegram_verified_at:nowIso,
    telegram_verification_status:"verified",
  }, true);
  if (!updated.ok) return { ok:false, status:503, error:"telegram_identity_write_failed" };

  if (role === "client") {
    await syncMemberEntitlementsTelegram(env, sf.line_user_id, telegramUserId, username);
  }

  const consumed = await airtableUpdate(env, bindsTable(env), bind.id, {
    status:"consumed",
    consumed_at:nowIso,
    telegram_user_id:telegramUserId,
    telegram_username:username || "",
  }, true);
  if (!consumed.ok) return { ok:false, status:503, error:"telegram_bind_finalize_failed" };

  return { ok:true, state:"connected", telegram_connected:true, role, telegram_username:username || null };
}

async function syncMemberEntitlementsTelegram(env, lineUserIdValue, telegramUserId, username) {
  const lineUserId = clean(lineUserIdValue,80);
  if (!/^U[0-9a-f]{32}$/i.test(lineUserId)) return { ok:false, skipped:true };
  const list = await airtableList(env, entitlementsTable(env), `{line_user_id}="${escapeFormula(lineUserId)}"`, 100);
  if (!list.ok || !list.records.length) return { ok:false, skipped:true };
  for (const record of list.records) {
    await airtableUpdate(env, entitlementsTable(env), record.id, {
      telegram_user_id:telegramUserId,
      telegram_username:username || "",
    }, true).catch(() => null);
  }
  return { ok:true, updated:list.records.length };
}

export function telegramConnectedFromFields(fields = {}) {
  return normalizeStatus(fields.telegram_verification_status) === "verified"
    && /^\d{5,20}$/.test(clean(fields.telegram_user_id,40));
}

async function airtableList(env, table, formula, maxRecords=100) {
  const config = airtableConfig(env);
  if (!config.ok) return { ok:false, status:503, records:[] };
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(config.base)}/${encodeURIComponent(table)}`);
  url.searchParams.set("maxRecords", String(Math.min(100,maxRecords)));
  if (formula) url.searchParams.set("filterByFormula", formula);
  const response = await fetch(url, { headers:{ authorization:`Bearer ${config.key}`, accept:"application/json" } });
  const data = await response.json().catch(() => ({}));
  return response.ok ? { ok:true,status:200,records:Array.isArray(data.records)?data.records:[] } : { ok:false,status:response.status,records:[] };
}
async function airtableGet(env, table, recordId) {
  const config = airtableConfig(env);
  if (!config.ok) return { ok:false,status:503 };
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(config.base)}/${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`, { headers:{ authorization:`Bearer ${config.key}`, accept:"application/json" } });
  const data = await response.json().catch(() => ({}));
  return response.ok ? { ok:true,status:200,record:data } : { ok:false,status:response.status };
}
async function airtableCreate(env, table, fields) {
  const config=airtableConfig(env); if(!config.ok) return {ok:false,status:503};
  const response=await fetch(`${AIRTABLE_API}/${encodeURIComponent(config.base)}/${encodeURIComponent(table)}`,{method:"POST",headers:{authorization:`Bearer ${config.key}`,"content-type":"application/json"},body:JSON.stringify({records:[{fields}],typecast:true})});
  const data=await response.json().catch(()=>({}));
  return response.ok ? {ok:true,status:201,record:data.records?.[0]||null} : {ok:false,status:response.status,error:data};
}
async function airtableUpdate(env, table, recordId, fields, typecast=false) {
  const config=airtableConfig(env); if(!config.ok) return {ok:false,status:503};
  const response=await fetch(`${AIRTABLE_API}/${encodeURIComponent(config.base)}/${encodeURIComponent(table)}`,{method:"PATCH",headers:{authorization:`Bearer ${config.key}`,"content-type":"application/json"},body:JSON.stringify({records:[{id:recordId,fields}],typecast})});
  const data=await response.json().catch(()=>({}));
  return response.ok ? {ok:true,status:200,record:data.records?.[0]||null} : {ok:false,status:response.status,error:data};
}
function airtableConfig(env){const key=clean(env.AIRTABLE_API_KEY,2000);const base=clean(env.AIRTABLE_BASE_ID,100);return {ok:Boolean(key&&base),key,base};}
function bindsTable(env){return clean(env.AIRTABLE_TABLE_TELEGRAM_IDENTITY_BINDS||BINDS_TABLE_DEFAULT,180);}
function clientsTable(env){return clean(env.AIRTABLE_TABLE_CLIENTS||CLIENTS_TABLE_DEFAULT,180);}
function modelsTable(env){return clean(env.AIRTABLE_TABLE_MODELS||MODELS_TABLE_DEFAULT,180);}
function entitlementsTable(env){return clean(env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS||MEMBER_ENTITLEMENTS_TABLE_DEFAULT,180);}
function normalizeStatus(v){return clean(Array.isArray(v)?v[0]:v,80).toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");}
function normalizeRole(v){const x=normalizeStatus(v);return x==="client"||x==="model"?x:"";}
function linkedIds(v){return (Array.isArray(v)?v:[]).map(x=>clean(typeof x==="string"?x:x?.id,40)).filter(x=>/^rec[A-Za-z0-9]{14,24}$/.test(x));}
function safeUsername(v){const x=clean(v,80).replace(/^@/,"");return /^[A-Za-z0-9_]{3,64}$/.test(x)?x:"";}
function escapeFormula(v){return String(v||"").replace(/\\/g,"\\\\").replace(/"/g,'\\"');}
function randomToken(bytes=24){const b=new Uint8Array(bytes);crypto.getRandomValues(b);let s="";for(const x of b)s+=String.fromCharCode(x);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
async function sha256Hex(v){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(v||"")));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("");}
function clean(v,max=5000){return String(v==null?"":v).trim().slice(0,max);}
function json(payload,status=200){return Response.json(payload,{status,headers:{"cache-control":"no-store"}});}

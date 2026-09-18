const AIRTABLE_API = "https://api.airtable.com/v0";
const CLAIMS_TABLE_DEFAULT = "tbluoZ5JiRcoUP6WT";
const MODELS_TABLE_DEFAULT = "Models";

export const MODEL_LINE_LINK_VIEW = "model-link";
export const MODEL_LINE_LINK_CLAIMS_MODE = "line-link-claims";
export const MODEL_LINE_LINK_CANDIDATES_MODE = "line-link-candidates";
export const MODEL_LINE_LINK_BIND_MODE = "bind_verified_claim";

export function isModelLineLinkPage(request) {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  const method = request.method.toUpperCase();
  return (method === "GET" || method === "HEAD")
    && path === "/internal/admin/kenji"
    && url.searchParams.get("view") === MODEL_LINE_LINK_VIEW;
}

export function isModelLineLinkClaimsRequest(request) {
  const url = new URL(request.url);
  return request.method.toUpperCase() === "GET"
    && normalizePath(url.pathname) === "/v1/admin/models/activation-candidates"
    && url.searchParams.get("mode") === MODEL_LINE_LINK_CLAIMS_MODE;
}

export function isModelLineLinkCandidatesRequest(request) {
  const url = new URL(request.url);
  return request.method.toUpperCase() === "GET"
    && normalizePath(url.pathname) === "/v1/admin/models/activation-candidates"
    && url.searchParams.get("mode") === MODEL_LINE_LINK_CANDIDATES_MODE;
}

export function isModelLineLinkBindPayload(body) {
  return body && typeof body === "object" && body.mode === MODEL_LINE_LINK_BIND_MODE;
}

export async function listPendingModelLineClaims(env) {
  const table = claimsTable(env);
  const result = await airtableList(env, table, `OR({claim_status}="verified_unlinked",{claim_status}="conflict")`, 100);
  if (!result.ok) return { ok: false, error: "identity_claim_queue_unavailable", status: result.status || 503 };

  const items = result.records
    .map((record) => safeClaimSummary(record))
    .filter((item) => item.claim_id)
    .sort((a, b) => String(b.verified_at || "").localeCompare(String(a.verified_at || "")));

  return { ok: true, count: items.length, items };
}

export async function listModelLineCandidates(env, url) {
  const q = clean(url.searchParams.get("q")).slice(0, 120);
  if (!q) return { ok: true, count: 0, items: [] };

  const table = modelsTable(env);
  const escaped = escapeFormula(q);
  const formula = `OR(FIND(LOWER("${escaped}"),LOWER({working_name})),FIND(LOWER("${escaped}"),LOWER({nickname})),FIND(LOWER("${escaped}"),LOWER({folder_name})),FIND(LOWER("${escaped}"),LOWER({unique_key})))`;
  const result = await airtableList(env, table, formula, 30);
  if (!result.ok) return { ok: false, error: "model_candidate_lookup_unavailable", status: result.status || 503 };

  const items = result.records
    .map((record) => safeModelCandidate(record, env))
    .filter((item) => item.active && item.working_name)
    .slice(0, 20)
    .map(({ active, ...item }) => item);
  return { ok: true, count: items.length, items };
}

export async function bindVerifiedModelLineClaim(request, env, actor) {
  const body = await request.json().catch(() => null);
  if (!isModelLineLinkBindPayload(body)) return json({ ok: false, error: "unsupported_mode" }, 400);
  if (body.confirm !== true) return json({ ok: false, error: "explicit_confirmation_required" }, 400);

  const allowedKeys = new Set(["mode", "claim_id", "model_record_id", "confirm"]);
  for (const key of Object.keys(body)) {
    if (!allowedKeys.has(key)) return json({ ok: false, error: "unsupported_fields" }, 400);
  }

  const claimId = clean(body.claim_id).slice(0, 120);
  const modelRecordId = clean(body.model_record_id).slice(0, 40);
  if (!/^model_line_[a-f0-9]{24}$/i.test(claimId)) return json({ ok: false, error: "claim_id_invalid" }, 400);
  if (!/^rec[A-Za-z0-9]{14}$/.test(modelRecordId)) return json({ ok: false, error: "model_record_id_invalid" }, 400);

  const claims = await airtableList(env, claimsTable(env), `{claim_id}="${escapeFormula(claimId)}"`, 3);
  if (!claims.ok) return json({ ok: false, error: "identity_claim_lookup_unavailable" }, claims.status || 503);
  if (claims.records.length !== 1) return json({ ok: false, error: claims.records.length ? "identity_claim_conflict" : "identity_claim_not_found" }, claims.records.length ? 409 : 404);

  const claim = claims.records[0];
  const claimFields = claim.fields || {};
  const claimStatus = clean(claimFields.claim_status);
  const lineUserId = clean(claimFields.line_user_id);
  const priorLinkedModel = linkedRecordId(claimFields["Linked Model"]);

  if (!isCanonicalLineUserId(lineUserId)) return json({ ok: false, error: "identity_claim_invalid" }, 409);
  if (claimStatus === "conflict") return json({ ok: false, error: "identity_claim_conflict_requires_review" }, 409);
  if (claimStatus === "linked") {
    if (priorLinkedModel === modelRecordId) return json({ ok: true, idempotent: true, claim_id: claimId, model_record_id: modelRecordId }, 200);
    return json({ ok: false, error: "identity_claim_already_linked" }, 409);
  }
  if (claimStatus !== "verified_unlinked") return json({ ok: false, error: "identity_claim_not_linkable" }, 409);

  const model = await airtableGetRecord(env, modelsTable(env), modelRecordId);
  if (!model.ok) return json({ ok: false, error: model.status === 404 ? "model_not_found" : "model_lookup_unavailable" }, model.status || 503);
  const candidate = safeModelCandidate(model.record, env);
  if (!candidate.active) return json({ ok: false, error: "model_not_active" }, 409);
  if (!candidate.drive_folder_id && !candidate.drive_folder_url) return json({ ok: false, error: "model_drive_folder_required" }, 409);

  const collision = await findModelsByLineUserId(env, lineUserId);
  if (!collision.ok) return json({ ok: false, error: "model_line_collision_lookup_unavailable" }, collision.status || 503);
  if (collision.records.length > 1) return json({ ok: false, error: "line_identity_collision" }, 409);
  if (collision.records.length === 1 && collision.records[0].id !== modelRecordId) {
    return json({ ok: false, error: "line_identity_already_linked" }, 409);
  }

  const binding = await bindLineUserIdAtomic(env, {
    modelRecordId,
    lineUserId,
    claimId,
  });
  if (!binding.ok) return json({ ok: false, error: binding.error || "model_line_binding_failed" }, binding.status || 409);

  const nowIso = new Date().toISOString();
  const actorId = clean(actor?.id || actor?.email || "owner").slice(0, 80);
  const note = `Owner-reviewed MMD MODEL LINE link approved by ${actorId}; canonical Model record and its Drive folder were re-read before binding.`;
  const updated = await airtableUpdateRecord(env, claimsTable(env), claim.id, {
    claim_status: "linked",
    "Linked Model": [modelRecordId],
    linked_at: nowIso,
    safe_note: note,
  }, true);
  if (!updated.ok) return json({ ok: false, error: "identity_claim_finalize_failed" }, updated.status || 503);

  return json({
    ok: true,
    idempotent: Boolean(binding.idempotent),
    claim_id: claimId,
    model: {
      model_record_id: modelRecordId,
      working_name: candidate.working_name,
      model_lookup_key: candidate.model_lookup_key,
      drive_folder_id: candidate.drive_folder_id,
      drive_folder_url: candidate.drive_folder_url,
      folder_name: candidate.folder_name,
    },
    next: "Model can retry the same LINE account and enter MMD MODEL.",
  }, 200);
}

export function renderModelLineLinkPage() {
  const body = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>MMD MODEL · LINE Link Review</title>
<style>
:root{color-scheme:dark;--bg:#090908;--panel:#12110f;--line:#393329;--gold:#d8bd83;--text:#f5f0e4;--muted:#aaa296;--ok:#72c68f;--danger:#e07f75}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 15% 0,#2c2315 0,transparent 34%),var(--bg);color:var(--text);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Noto Sans Thai",sans-serif}.wrap{width:min(1120px,100%);margin:auto;padding:24px}.top{display:flex;gap:16px;align-items:flex-start;justify-content:space-between;margin-bottom:24px}.eyebrow{font-size:11px;letter-spacing:.18em;color:var(--gold);font-weight:700}.top h1{font-size:clamp(25px,4vw,42px);line-height:1.08;margin:7px 0}.top p{color:var(--muted);max-width:720px;margin:0}.back{color:var(--text);text-decoration:none;border:1px solid var(--line);padding:10px 13px;border-radius:12px;white-space:nowrap}.stats{display:flex;gap:10px;margin:16px 0 22px}.pill{border:1px solid var(--line);background:#14120f;border-radius:999px;padding:8px 12px;color:var(--muted)}.pill b{color:var(--text)}.queue{display:grid;gap:14px}.card{border:1px solid var(--line);background:linear-gradient(180deg,#15130f,#0f0e0c);border-radius:18px;padding:18px}.row{display:flex;gap:12px;justify-content:space-between;align-items:flex-start}.name{font-size:20px;font-weight:700}.meta{font-size:12px;color:var(--muted);margin-top:4px}.status{font-size:11px;letter-spacing:.08em;border:1px solid var(--line);border-radius:999px;padding:6px 9px;color:var(--gold)}.search{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:16px}input,button{font:inherit}input{min-width:0;background:#0b0a09;border:1px solid var(--line);border-radius:12px;color:var(--text);padding:12px 13px}button{border:0;border-radius:12px;background:var(--gold);color:#1b160e;font-weight:800;padding:12px 16px;cursor:pointer}button.secondary{background:#242019;color:var(--text);border:1px solid var(--line)}button:disabled{opacity:.45;cursor:not-allowed}.results{display:grid;gap:9px;margin-top:10px}.candidate{border:1px solid var(--line);border-radius:14px;padding:13px;background:#0b0a09;display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center}.candidate strong{display:block}.folder{font-size:12px;color:var(--muted);word-break:break-all;margin-top:4px}.empty,.notice{border:1px dashed var(--line);border-radius:18px;padding:28px;color:var(--muted);text-align:center}.notice{margin-bottom:14px}.notice.ok{border-style:solid;color:var(--ok)}.notice.err{border-style:solid;color:var(--danger)}@media(max-width:700px){.wrap{padding:18px 14px}.top{display:block}.back{display:inline-block;margin-top:16px}.search{grid-template-columns:1fr}.candidate{grid-template-columns:1fr}.candidate button{width:100%}}
</style></head><body><main class="wrap"><div class="top"><div><div class="eyebrow">MMD MODEL · OWNER REVIEW</div><h1>LINE Link Queue</h1><p>เมื่อ Model ยืนยัน LINE ครั้งแรก ระบบจะเก็บ identity evidence ไว้ที่ Airtable โดยยังไม่เปิดสิทธิ์ เปอร์เป็นคนเลือก Model record ที่ถูกต้องและตรวจ Drive folder ก่อนกด LINK.</p></div><a class="back" href="/internal/admin/kenji">← Kenji Admin</a></div><div id="notice"></div><div class="stats"><div class="pill">Waiting <b id="count">—</b></div><div class="pill">Fail closed · ไม่เดาจากชื่อ LINE</div></div><section id="queue" class="queue"><div class="empty">กำลังโหลด Pending Model Link…</div></section></main>
<script>
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api=async(url,opt={})=>{const r=await fetch(url,{credentials:'include',headers:{'accept':'application/json','content-type':'application/json',...(opt.headers||{})},...opt});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||('HTTP '+r.status));return d};
function notice(msg,type=''){document.getElementById('notice').innerHTML=msg?'<div class="notice '+type+'">'+esc(msg)+'</div>':''}
async function load(){try{const d=await api('/v1/admin/models/activation-candidates?mode=line-link-claims');document.getElementById('count').textContent=d.count||0;render(d.items||[])}catch(e){notice('โหลดคิวไม่ได้: '+e.message,'err')}}
function render(items){const root=document.getElementById('queue');if(!items.length){root.innerHTML='<div class="empty">ยังไม่มี Model ที่รอเชื่อม LINE</div>';return}root.innerHTML=items.map(x=>'<article class="card" data-claim="'+esc(x.claim_id)+'"><div class="row"><div><div class="name">'+esc(x.line_display_name||'LINE identity')+'</div><div class="meta">Verified '+esc(x.verified_at||'—')+' · '+esc(x.environment||'published')+' · Ref '+esc(x.line_ref||'—')+'</div></div><span class="status">'+esc(x.claim_status)+'</span></div><div class="search"><input value="'+esc(x.line_display_name||'')+'" placeholder="ค้นชื่อ / code ของ Model"><button class="secondary" onclick="searchModel(this)">ค้น Model</button></div><div class="results"></div></article>').join('')}
async function searchModel(btn){const card=btn.closest('.card'),input=card.querySelector('input'),out=card.querySelector('.results'),q=input.value.trim();if(!q)return;btn.disabled=true;out.innerHTML='<div class="meta">กำลังค้น…</div>';try{const d=await api('/v1/admin/models/activation-candidates?mode=line-link-candidates&q='+encodeURIComponent(q));if(!d.items?.length){out.innerHTML='<div class="meta">ไม่พบ Active Model ที่ตรงการค้นหา</div>';return}out.innerHTML=d.items.map(m=>'<div class="candidate"><div><strong>'+esc(m.working_name)+'</strong><div class="meta">'+esc(m.model_lookup_key||'—')+' · '+esc(m.status||'active')+'</div><div class="folder">Drive: '+esc(m.folder_name||m.drive_folder_id||m.drive_folder_url||'ยังไม่มี Drive folder')+'</div></div><button '+(!(m.drive_folder_id||m.drive_folder_url)?'disabled':'')+' onclick="bindModel(this,\''+esc(m.model_record_id)+'\')">LINK</button></div>').join('')}catch(e){out.innerHTML='<div class="meta">ค้นไม่ได้: '+esc(e.message)+'</div>'}finally{btn.disabled=false}}
async function bindModel(btn,modelId){const card=btn.closest('.card'),claimId=card.dataset.claim;if(!confirm('ยืนยันผูก LINE นี้กับ Model record และ Drive folder ที่เลือก?'))return;btn.disabled=true;try{const d=await api('/v1/admin/model/activation/issue',{method:'POST',body:JSON.stringify({mode:'bind_verified_claim',claim_id:claimId,model_record_id:modelId,confirm:true})});notice('เชื่อม '+(d.model?.working_name||'Model')+' สำเร็จแล้ว — ให้ Model เข้า MMD MODEL ด้วย LINE เดิมได้เลย','ok');await load()}catch(e){notice('เชื่อมไม่สำเร็จ: '+e.message,'err');btn.disabled=false}}
load();
</script></body></html>`;
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, private",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

function safeClaimSummary(record) {
  const fields = record?.fields || {};
  const hash = clean(fields.line_user_id_hash);
  return {
    claim_id: clean(fields.claim_id),
    line_display_name: clean(fields.line_display_name),
    claim_status: clean(fields.claim_status),
    environment: clean(fields.line_environment) || "published",
    verified_at: clean(fields.verified_at),
    linked_at: clean(fields.linked_at),
    line_ref: hash ? hash.slice(0, 8) : "",
  };
}

function safeModelCandidate(record, env) {
  const fields = record?.fields || {};
  const status = firstText(fields, [env.AT_MODELS__STATUS, "status", "Status", "model_status", "Model Status"]);
  const active = /^active$/i.test(status);
  return {
    model_record_id: record?.id || "",
    working_name: firstText(fields, ["working_name", "display_name", "Display Name", "nickname", "Nickname", "name", "Name"]),
    model_lookup_key: firstText(fields, ["model_lookup_key", "model_code", "Model Code", "unique_key"]),
    status,
    active,
    folder_name: firstText(fields, ["folder_name"]),
    drive_folder_id: firstText(fields, ["drive_folder_id"]),
    drive_folder_url: firstText(fields, ["drive_folder_url"]),
  };
}

async function findModelsByLineUserId(env, lineUserId) {
  const fields = [...new Set([clean(env.AT_MODELS__LINE_USER_ID), "line_user_id", "LINE User ID"].filter(Boolean))];
  const records = new Map();
  for (const field of fields) {
    const result = await airtableList(env, modelsTable(env), `{${field}}="${escapeFormula(lineUserId)}"`, 3);
    if (result.schemaError) continue;
    if (!result.ok) return { ok: false, status: result.status || 503, records: [] };
    for (const record of result.records) records.set(record.id, record);
  }
  return { ok: true, records: [...records.values()] };
}

async function bindLineUserIdAtomic(env, { modelRecordId, lineUserId, claimId }) {
  const namespace = env.MODEL_ACTIVATION_COORDINATOR;
  if (!namespace || typeof namespace.idFromName !== "function" || typeof namespace.get !== "function") {
    return { ok: false, status: 503, error: "activation_coordinator_not_ready" };
  }
  const id = namespace.idFromName(modelRecordId);
  const stub = namespace.get(id);
  const response = await stub.fetch("https://model-activation.internal/bind", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model_record_id: modelRecordId,
      line_user_id: lineUserId,
      jti: `owner_claim_${claimId}`,
      exp: Math.floor(Date.now() / 1000) + 10 * 60,
    }),
  });
  const data = await response.json().catch(() => ({}));
  return { ...data, ok: response.ok && data.ok !== false, status: response.status };
}

async function airtableList(env, table, formula, pageSize = 20) {
  const apiKey = clean(env.AIRTABLE_API_KEY);
  const baseId = clean(env.AIRTABLE_BASE_ID);
  if (!apiKey || !baseId || !table) return { ok: false, status: 503, records: [] };
  const params = new URLSearchParams({ pageSize: String(pageSize) });
  if (formula) params.set("filterByFormula", formula);
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}?${params}`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = JSON.stringify(data || {});
    return { ok: false, status: response.status, schemaError: response.status === 422 || /unknown field|invalid.*field/i.test(detail), records: [] };
  }
  return { ok: true, status: 200, records: Array.isArray(data.records) ? data.records : [] };
}

async function airtableGetRecord(env, table, recordId) {
  const apiKey = clean(env.AIRTABLE_API_KEY);
  const baseId = clean(env.AIRTABLE_BASE_ID);
  if (!apiKey || !baseId || !table) return { ok: false, status: 503 };
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const data = await response.json().catch(() => ({}));
  return response.ok ? { ok: true, status: 200, record: data } : { ok: false, status: response.status };
}

async function airtableUpdateRecord(env, table, recordId, fields, typecast = false) {
  const apiKey = clean(env.AIRTABLE_API_KEY);
  const baseId = clean(env.AIRTABLE_BASE_ID);
  if (!apiKey || !baseId || !table || !recordId) return { ok: false, status: 503 };
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ records: [{ id: recordId, fields }], typecast }),
  });
  const data = await response.json().catch(() => ({}));
  return response.ok ? { ok: true, status: 200, record: data.records?.[0] || null } : { ok: false, status: response.status, error: data };
}

function claimsTable(env) { return clean(env.AIRTABLE_TABLE_MODEL_LINE_IDENTITY_CLAIMS || CLAIMS_TABLE_DEFAULT); }
function modelsTable(env) { return clean(env.AIRTABLE_TABLE_MODELS || MODELS_TABLE_DEFAULT); }
function isCanonicalLineUserId(value) { return /^U[0-9a-f]{32}$/i.test(clean(value)); }
function linkedRecordId(value) {
  if (!Array.isArray(value) || !value.length) return "";
  const first = value[0];
  return clean(first && typeof first === "object" ? first.id : first);
}
function firstText(fields, names) {
  for (const name of names) {
    if (!name) continue;
    const value = fields?.[name];
    if (Array.isArray(value) && value.length) {
      const first = value[0];
      const text = first && typeof first === "object" ? clean(first.name || first.id || first.value) : clean(first);
      if (text) return text;
    } else if (value !== undefined && value !== null && clean(value)) return clean(value);
  }
  return "";
}
function clean(value) { return String(value ?? "").trim(); }
function escapeFormula(value) { return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"'); }
function normalizePath(pathname) {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store, private" } });
}

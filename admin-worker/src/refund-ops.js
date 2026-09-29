const AIRTABLE_API = "https://api.airtable.com/v0";
export const REFUND_OPS_PAGE_PATH = "/internal/admin/refunds";
export const REFUND_OPS_API_PREFIX = "/v1/admin/refunds";
export const REFUND_OPS_INTERNAL_INTAKE = "/v1/internal/refund-ops/intake";

const clean = (value, max = 2000) => String(value ?? "").trim().slice(0, max);
const html = (value) => clean(value, 5000).replace(/[&<>"']/g, (ch) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[ch]));

function tableId(env = {}) {
  return clean(env.AIRTABLE_TABLE_CONSOLE_INBOX_ID || "tblFHmfpB2TTrzO2e", 120);
}

function airtableEnv(env = {}) {
  return {
    baseId: clean(env.AIRTABLE_BASE_ID, 120),
    token: clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 300),
    table: tableId(env),
  };
}

async function airtable(env, suffix = "", init = {}) {
  const cfg = airtableEnv(env);
  if (!cfg.baseId || !cfg.token || !cfg.table) throw new Error("airtable_env_missing");
  const response = await fetch(`${AIRTABLE_API}/${cfg.baseId}/${encodeURIComponent(cfg.table)}${suffix}`, {
    ...init,
    headers: {
      authorization: `Bearer ${cfg.token}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`airtable_${response.status}`);
  return payload;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type":"application/json; charset=utf-8", "cache-control":"no-store, private" },
  });
}

function parsePayload(record = {}) {
  const raw = clean(record?.fields?.payload_json, 20000);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function publicItem(record = {}) {
  const f = record.fields || {};
  const p = parsePayload(record);
  return {
    record_id: clean(record.id, 120),
    inbox_id: clean(f.inbox_id, 160),
    status: clean(f.status || "new", 80),
    created_at: clean(f.created_at, 80),
    customer_name: clean(f.member_name || p.customer_name || "", 160),
    purpose: clean(p.purpose || "unknown", 40),
    bank_name: clean(p.bank_name || "", 120),
    account_name: clean(p.account_name_masked || "", 160),
    account_number_masked: clean(p.account_number_masked || "", 80),
    linked_session_id: clean(p.session_id || "", 120),
    linked_job_id: clean(p.job_id || "", 120),
    receipt_uploaded: Boolean(p.receipt_r2_key),
    receipt_uploaded_at: clean(p.receipt_uploaded_at || "", 80),
  };
}

async function listItems(env) {
  const params = new URLSearchParams();
  params.set("maxRecords", "100");
  params.set("filterByFormula", "OR({intent}='refund_bank_detail',{intent}='bank_detail_ops')");
  params.set("sort[0][field]", "created_at");
  params.set("sort[0][direction]", "desc");
  const payload = await airtable(env, `?${params.toString()}`);
  return (Array.isArray(payload.records) ? payload.records : []).map(publicItem);
}

async function findByInboxId(env, inboxId) {
  const escaped = clean(inboxId, 160).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const params = new URLSearchParams({ maxRecords:"2", filterByFormula:`{inbox_id}='${escaped}'` });
  const payload = await airtable(env, `?${params.toString()}`);
  const rows = Array.isArray(payload.records) ? payload.records : [];
  return rows.length === 1 ? rows[0] : null;
}

function privateBucket(env = {}) {
  const bucket = env.LINE_SLIP_EVIDENCE;
  return bucket && typeof bucket.get === "function" && typeof bucket.put === "function" ? bucket : null;
}

async function loadPrivateDetail(env, record) {
  const payload = parsePayload(record);
  const key = clean(payload.private_detail_key, 500);
  const bucket = privateBucket(env);
  if (!key || !bucket) return null;
  const object = await bucket.get(key);
  if (!object) return null;
  try {
    const detail = JSON.parse(await object.text());
    return {
      bank_name: clean(detail.bank_name, 120),
      account_name: clean(detail.account_name, 200),
      account_number: clean(detail.account_number, 120),
      purpose: clean(detail.purpose || payload.purpose || "unknown", 40),
    };
  } catch {
    return null;
  }
}

function internalAuthorized(request) {
  return clean(request.headers.get("x-mmd-internal-call"), 20).toLowerCase() === "true" &&
    clean(request.headers.get("x-mmd-service-binding"), 80) === "member-dashboard-chat-worker";
}

export async function handleRefundOpsInternalIntake(request, env = {}) {
  if (!internalAuthorized(request)) return json({ ok:false, error:"not_found" }, 404);
  const body = await request.json().catch(() => ({}));
  const inboxId = clean(body.inbox_id, 160);
  if (!inboxId || !/^refund_[A-Za-z0-9_.:-]{4,150}$/.test(inboxId)) return json({ ok:false, error:"invalid_inbox_id" }, 400);

  const existing = await findByInboxId(env, inboxId).catch(() => null);
  if (existing?.id) return json({ ok:true, deduped:true, record_id:existing.id });

  const payload = {
    schema: "mmd_refund_bank_detail_v1",
    purpose: clean(body.purpose || "unknown", 40),
    bank_name: clean(body.bank_name, 120),
    account_name_masked: clean(body.account_name_masked, 160),
    account_number_masked: clean(body.account_number_masked, 80),
    private_detail_key: clean(body.private_detail_key, 500),
    source_image_key: clean(body.source_image_key, 500),
    session_id: clean(body.session_id, 120) || null,
    job_id: clean(body.job_id, 120) || null,
    customer_name: clean(body.customer_name, 160) || null,
    money_truth_mutated: false,
    payment_proof_created: false,
  };

  const fields = {
    inbox_id: inboxId,
    source: "line_ofc",
    intent: payload.purpose === "refund" ? "refund_bank_detail" : "bank_detail_ops",
    member_name: payload.customer_name || "",
    line_user_id: clean(body.line_user_id, 120),
    admin_note: payload.purpose === "refund"
      ? `Refund account received · ${payload.bank_name || "bank"} · ${payload.account_number_masked || "masked"}`
      : `Bank detail received · ${payload.bank_name || "bank"} · ${payload.account_number_masked || "masked"}`,
    payload_json: JSON.stringify(payload),
    status: "new",
    error_message: "",
  };
  const created = await airtable(env, "", { method:"POST", body:JSON.stringify({ fields }) });
  return json({ ok:true, deduped:false, record_id:created.id || null });
}

async function patchRecord(env, record, fields) {
  return airtable(env, `/${encodeURIComponent(record.id)}`, { method:"PATCH", body:JSON.stringify({ fields }) });
}

async function handleReceiptUpload(request, env) {
  const form = await request.formData().catch(() => null);
  if (!form) return json({ ok:false, error:"invalid_form" }, 400);
  const inboxId = clean(form.get("inbox_id"), 160);
  const file = form.get("file");
  if (!inboxId || !(file instanceof File)) return json({ ok:false, error:"inbox_and_file_required" }, 400);
  if (!["image/jpeg","image/png","image/webp"].includes(file.type)) return json({ ok:false, error:"unsupported_file_type" }, 415);
  if (file.size < 1 || file.size > 10 * 1024 * 1024) return json({ ok:false, error:"file_size_invalid" }, 413);

  const record = await findByInboxId(env, inboxId);
  if (!record) return json({ ok:false, error:"refund_task_not_found" }, 404);
  const bucket = privateBucket(env);
  if (!bucket) return json({ ok:false, error:"private_bucket_missing" }, 503);

  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const now = new Date();
  const key = `owner-refund-receipts/${now.getUTCFullYear()}/${String(now.getUTCMonth()+1).padStart(2,"0")}/${encodeURIComponent(inboxId)}/receipt.${extension}`;
  await bucket.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType:file.type },
    customMetadata: { schema:"mmd_refund_receipt_v1", inbox_id:inboxId, source:"owner_upload" },
  });

  const payload = parsePayload(record);
  payload.receipt_r2_key = key;
  payload.receipt_uploaded_at = now.toISOString();
  payload.receipt_mime_type = file.type;
  payload.refund_completed_by = "owner";
  payload.money_truth_mutated = false;
  await patchRecord(env, record, {
    status:"completed",
    payload_json:JSON.stringify(payload),
    admin_note:`${clean(record.fields?.admin_note, 1200)} · Refund receipt uploaded ${now.toISOString()}`.slice(0,1800),
  });
  return json({ ok:true, inbox_id:inboxId, status:"completed", uploaded_at:now.toISOString() });
}

function pageHtml() {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Refund Ops · MMD</title><style>
  :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0b0a09;color:#f4efe6;font:15px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:920px;margin:auto;padding:24px 16px 80px}.top{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:20px}.top h1{margin:0;font-size:26px}.sub{color:#a99e8e}.grid{display:grid;gap:12px}.card{border:1px solid #2f2a23;background:#151310;border-radius:18px;padding:16px}.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.tag{font-size:12px;border:1px solid #514737;border-radius:999px;padding:4px 8px;color:#dec89b}.bank{font-size:20px;font-weight:800;margin:10px 0}.muted{color:#a99e8e}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}button,.btn{appearance:none;border:1px solid #6f6048;background:#211d17;color:#f7e7c3;border-radius:12px;padding:10px 12px;font-weight:700;cursor:pointer;text-decoration:none}.primary{background:#d5b36b;color:#15110b;border-color:#d5b36b}.done{opacity:.55}.empty{padding:36px;text-align:center;color:#968b7c}.detail{margin-top:10px;padding:12px;background:#0f0e0c;border-radius:12px;display:none}.detail.open{display:block}.num{font:700 19px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace}.status{font-size:12px;margin-left:auto}.upload input{display:none}@media(max-width:600px){.top{align-items:flex-start}.card{border-radius:16px}.status{width:100%;margin-left:0}.actions button,.actions .btn{flex:1 1 46%}}
  </style></head><body><main class="wrap"><div class="top"><div><div class="sub">OWNER OPS</div><h1>Refund Accounts</h1><div class="sub">รูปบัญชีจาก LINE → Copy → โอน → อัปโหลดสลิปกลับ</div></div><a class="btn" href="/internal/admin/control-room">Control Room</a></div><div id="list" class="grid"><div class="empty">กำลังโหลด…</div></div></main><script>
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function api(path,opts={}){const r=await fetch('/v1/admin/refunds'+path,{credentials:'include',cache:'no-store',...opts});const p=await r.json().catch(()=>({}));if(!r.ok||p.ok===false)throw new Error(p.error||r.status);return p}
  async function copy(v){await navigator.clipboard.writeText(v)}
  async function detail(id,btn){const box=document.querySelector('[data-detail="'+CSS.escape(id)+'"]');if(box.dataset.loaded==='1'){box.classList.toggle('open');return}btn.disabled=true;try{const p=await api('/detail?inbox_id='+encodeURIComponent(id));box.innerHTML='<div class="muted">'+esc(p.detail.bank_name||'')+'</div><div>'+esc(p.detail.account_name||'')+'</div><div class="num">'+esc(p.detail.account_number||'')+'</div><div class="actions"><button data-copy-name>Copy ชื่อ</button><button class="primary" data-copy-number>Copy เลขบัญชี</button></div>';box.querySelector('[data-copy-name]').onclick=()=>copy(p.detail.account_name||'');box.querySelector('[data-copy-number]').onclick=()=>copy(p.detail.account_number||'');box.dataset.loaded='1';box.classList.add('open')}finally{btn.disabled=false}}
  async function upload(id,file,card){if(!file)return;const fd=new FormData();fd.append('inbox_id',id);fd.append('file',file);card.querySelector('[data-up-status]').textContent='กำลังอัปโหลด…';try{await api('/receipt',{method:'POST',body:fd});card.classList.add('done');card.querySelector('[data-up-status]').textContent='อัปโหลดสลิปแล้ว ✓'}catch(e){card.querySelector('[data-up-status]').textContent='อัปโหลดไม่สำเร็จ · '+e.message}}
  async function load(){const p=await api('/list');const root=document.getElementById('list');root.innerHTML=p.items.length?p.items.map(x=>`<article class="card ${x.receipt_uploaded?'done':''}" data-card="${esc(x.inbox_id)}"><div class="row"><span class="tag">${esc((x.purpose||'UNKNOWN').toUpperCase())}</span><strong>${esc(x.customer_name||'LINE customer')}</strong><span class="status muted">${x.receipt_uploaded?'DONE':'NEEDS YOU'}</span></div><div class="bank">${esc(x.bank_name||'Bank detail')} · ${esc(x.account_number_masked||'••••')}</div><div class="muted">${esc(x.linked_job_id?('Job '+x.linked_job_id):x.linked_session_id?('Session '+x.linked_session_id):'จาก LINE OA')}</div><div class="actions"><button data-open>เปิดเลขบัญชี</button><label class="btn primary upload">อัปโหลดสลิปคืน<input data-file type="file" accept="image/jpeg,image/png,image/webp"></label></div><div class="muted" data-up-status>${x.receipt_uploaded?'อัปโหลดสลิปแล้ว ✓':'หลังโอน อัปโหลดสลิปตรงนี้'}</div><div class="detail" data-detail="${esc(x.inbox_id)}"></div></article>`).join(''):'<div class="empty">ยังไม่มี Refund Account ที่ต้องทำ</div>';root.querySelectorAll('[data-card]').forEach(card=>{const id=card.dataset.card;card.querySelector('[data-open]').onclick=e=>detail(id,e.currentTarget);card.querySelector('[data-file]').onchange=e=>upload(id,e.target.files?.[0],card)})}
  load().catch(e=>document.getElementById('list').innerHTML='<div class="empty">โหลดไม่สำเร็จ · '+esc(e.message)+'</div>');
  </script></body></html>`;
}

export async function handleRefundOpsRequest(request, env = {}, { isAuthed } = {}) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method.toUpperCase();

  if (path === REFUND_OPS_INTERNAL_INTAKE && method === "POST") return handleRefundOpsInternalIntake(request, env);

  const authed = typeof isAuthed === "function" ? await isAuthed(request, env) : false;
  if (!authed) {
    if (path === REFUND_OPS_PAGE_PATH) {
      return new Response(null, { status:303, headers:{ location:`/internal/admin/login?next=${encodeURIComponent(REFUND_OPS_PAGE_PATH)}`, "cache-control":"no-store" } });
    }
    return json({ ok:false, error:"unauthorized" }, 401);
  }

  if (path === REFUND_OPS_PAGE_PATH && (method === "GET" || method === "HEAD")) {
    return new Response(method === "HEAD" ? null : pageHtml(), { status:200, headers:{ "content-type":"text/html; charset=utf-8", "cache-control":"no-store, private", "x-mmd-route-owner":"admin-worker" } });
  }
  if (path === `${REFUND_OPS_API_PREFIX}/list` && method === "GET") return json({ ok:true, items:await listItems(env) });
  if (path === `${REFUND_OPS_API_PREFIX}/detail` && method === "GET") {
    const record = await findByInboxId(env, url.searchParams.get("inbox_id"));
    if (!record) return json({ ok:false, error:"refund_task_not_found" }, 404);
    const detail = await loadPrivateDetail(env, record);
    if (!detail) return json({ ok:false, error:"private_detail_missing" }, 404);
    return json({ ok:true, detail });
  }
  if (path === `${REFUND_OPS_API_PREFIX}/receipt` && method === "POST") return handleReceiptUpload(request, env);
  return null;
}

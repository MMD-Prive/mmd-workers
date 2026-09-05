import {
  renderCreateJobPage,
  renderCreateSessionPage,
  type InternalPageEnv,
} from "./internal-pages";
import { renderOwnerControlRoomPage } from "./control-room-owner-ui";

export interface InternalRoutesEnv extends InternalPageEnv {
  ADMIN_WORKER?: Fetcher;
  ADMIN_WORKER_BASE_URL?: string;
  ASSETS?: Fetcher;
}

const AIRTABLE_API = "https://api.airtable.com/v0";
const AIRTABLE_BASE_DEFAULT = "appsV1ILPRfIjkaYg";
const CLIENTS_TABLE_DEFAULT = "tblVv58TCbwh5j1fS";
const LINE_STAGING_TABLE_DEFAULT = "tblOs8yyLK09SKrCt";
const CONSOLE_INBOX_TABLE_DEFAULT = "tblFHmfpB2TTrzO2e";

function redirect(to: string, status = 302): Response {
  return new Response(null, {
    status,
    headers: {
      location: to,
      "cache-control": "no-store",
    },
  });
}

function withQuery(path: string, url: URL): string {
  return `${path}${url.search || ""}`;
}

function publicAdminAuthBaseUrl(request: Request): string {
  const { hostname } = new URL(request.url);
  if (hostname === "mmdbkk.com") return "https://mmdbkk.com";
  if (hostname === "www.mmdbkk.com") return "https://www.mmdbkk.com";
  return "";
}

function adminLoginRedirect(url: URL): Response {
  return redirect(`/internal/admin/login?next=${encodeURIComponent(`${url.pathname}${url.search}`)}`, 302);
}

async function withSameOriginAdminBase(response: Response): Promise<Response> {
  const html = await response.text();
  const rewritten = html.replace('adminBase:""', 'adminBase:location.origin');
  return new Response(rewritten, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

async function withCreateJobAmountInput(response: Response): Promise<Response> {
  const html = await response.text();
  const amountField = `<label class="mmdop__field"><span>Amount THB</span><input class="mmdop__input" id="amount_thb" name="amount_thb" type="number" min="1" step="1" required /></label>`;
  const withInput = html.replace(
    `<label class="mmdop__field"><span>Job Date</span>`,
    `${amountField}<label class="mmdop__field"><span>Job Date</span>`
  );
  const withAmountRead = withInput.replace(
    `const payload={session_id:$("job-session-id")?.value||"",`,
    `const amount=Number($("amount_thb")?.value||"");const payload={session_id:$("job-session-id")?.value||"",amount_thb:amount,`
  );
  const rewritten = withAmountRead.replace(
    `if(!payload.session_id){setStatus("กรุณาใส่ Session ID ก่อน",true);return}`,
    `if(!payload.session_id){setStatus("กรุณาใส่ Session ID ก่อน",true);return}if(!Number.isFinite(payload.amount_thb)||payload.amount_thb<=0){setStatus("กรุณาใส่ Amount THB มากกว่า 0",true);return}`
  );
  return new Response(rewritten, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function renderCustomerDataPage(): Response {
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>MMD · Customer Data</title><style>
:root{color-scheme:dark;--bg:#080706;--panel:#17130f;--line:rgba(255,218,150,.28);--text:#fff8ec;--muted:#f8ead7;--gold:#ffe6a3;--gold2:#f2ca74;--danger:#ffd2c7}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 50% -10%,rgba(255,214,132,.09),transparent 34%),var(--bg);color:var(--text);font-family:"Noto Sans Thai","Noto Sans",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:16px;line-height:1.6;-webkit-font-smoothing:antialiased}.wrap{width:min(100% - 28px,920px);margin:0 auto;padding:18px 0 30px}.top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}.back{color:var(--gold);text-decoration:none;font-weight:900;font-size:14px}.tag{border:1px solid var(--line);border-radius:999px;padding:6px 10px;color:#1b1308;background:linear-gradient(135deg,#fff1bd,#e7bb61);font-size:11px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}.head,.card,.queue{border:1px solid var(--line);background:linear-gradient(180deg,rgba(255,255,255,.095),rgba(255,255,255,.045));box-shadow:0 16px 42px rgba(0,0,0,.22)}.head{border-radius:20px;padding:16px}.head h1{margin:0 0 6px;color:#fffaf0;font-size:30px;line-height:1.08;letter-spacing:-.02em;font-weight:950}.head p{max-width:700px;margin:0;color:var(--muted);font-size:15px;line-height:1.65;font-weight:720}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.btn{min-height:38px;display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:0 14px;text-decoration:none;font-weight:900;border:1px solid rgba(255,230,163,.34);color:#fff9ee;background:rgba(255,255,255,.095);font-size:13px;cursor:pointer;white-space:nowrap}.btn:hover{background:rgba(255,255,255,.14)}.btn.main{background:linear-gradient(135deg,#fff3c2,#e9be67);color:#171008;border:0;box-shadow:0 10px 24px rgba(232,190,103,.18)}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:10px}.card{border-radius:16px;padding:14px}.card small{display:block;color:#f6cf7a;font-size:11px;font-weight:950;letter-spacing:.06em;text-transform:uppercase;margin-bottom:5px}.card h2{margin:0 0 5px;color:#fff0b7;font-size:18px;line-height:1.22;font-weight:950}.card p{margin:0;color:var(--muted);line-height:1.6;font-weight:690;font-size:14px}.toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-top:11px}.queue{margin-top:10px;border-radius:18px;padding:14px}.queueTop{display:flex;justify-content:space-between;gap:8px;align-items:center}.queue h2{margin:0;color:#fff1b6;font-size:18px;font-weight:950}.status{margin-top:10px;color:#fff2db;font-size:13px;font-weight:850}.queueTop .status{margin-top:0;color:#fff2db}.row{margin-top:10px;border:1px solid rgba(255,230,163,.24);border-radius:15px;padding:13px;background:rgba(0,0,0,.28)}.row b{display:block;color:#fffaf0;font-size:15px;line-height:1.35;font-weight:950}.row p{margin:6px 0 0;color:#f8ead7;line-height:1.55;font-size:13px;font-weight:680}.pill{display:inline-flex;margin:0 6px 7px 0;border:1px solid rgba(255,230,163,.34);border-radius:999px;padding:4px 9px;color:#181008;background:rgba(255,231,166,.9);font-size:11px;font-weight:950}.pill.soft{color:#fff0cf;background:rgba(255,255,255,.08)}.mini{min-height:32px;font-size:12px;padding:0 11px}.note{margin-top:10px;border:1px solid rgba(255,204,187,.28);border-radius:16px;padding:12px 13px;background:rgba(255,204,187,.075);color:#ffece6;line-height:1.6;font-weight:720;font-size:13px}.note b{color:#ffd3c8}code{color:#ffe39a}@media(max-width:760px){.wrap{width:min(100% - 20px,920px);padding-top:12px}.top{align-items:flex-start;flex-direction:column}.grid{grid-template-columns:1fr}.head,.card,.queue{padding:14px}.head h1{font-size:28px}.btn{width:auto;min-height:40px}.queueTop{align-items:flex-start;flex-direction:column}}
</style></head><body><main class="wrap"><div class="top"><a class="back" href="/internal/admin/control-room">← Control Room</a><span class="tag">Customer Data</span></div><section class="head"><h1>Customer Data</h1><p>จัดข้อมูลลูกค้าจาก LINE ให้พร้อมจับคู่กับลูกค้าเดิม ก่อนส่งต่อให้ Create Session, Kenji, Payments หรือ Access ใช้งานต่อ</p><div class="actions"><button class="btn main" id="runBackfill">นำเข้าจาก Console Inbox</button><button class="btn" id="reloadQueue">โหลดคิวใหม่</button><a class="btn" href="/internal/admin/jobs/create-session">Create Session</a></div><div class="status" id="status">พร้อมโหลดคิว</div></section><section class="grid"><article class="card"><small>01 Import</small><h2>นำเข้าจาก LINE</h2><p>ดึงโน้ต ชื่อที่เปลี่ยน เบอร์ อีเมล และหลักฐานเบื้องต้นจาก Console Inbox</p></article><article class="card"><small>02 Match</small><h2>จับคู่ลูกค้า</h2><p>เทียบกับลูกค้าเดิมก่อนสร้าง session เพื่อลดการจำผิดหรือสร้างคนซ้ำ</p></article><article class="card"><small>03 Context</small><h2>บริบทส่วนตัว</h2><p>เก็บข้อควรระวัง วิธีคุย และข้อมูลที่ Kenji ต้องใช้แบบมีขอบเขต</p></article><article class="card"><small>04 Review</small><h2>ประวัติที่ต้องตรวจ</h2><p>บริการ การชำระเงิน และ points ต้องแยก review ก่อนนำไปใช้จริง</p></article></section><section class="queue"><div class="queueTop"><h2>คิวที่ต้องดู</h2><span class="status" id="queueCount">—</span></div><div class="toolbar"><button class="btn mini" data-filter="review_required">ต้องดู</button><button class="btn mini" data-filter="matched">จับคู่แล้ว</button><button class="btn mini" data-filter="no_match">ยังไม่เจอคนเดิม</button><button class="btn mini" data-filter="ignored">ข้ามไว้ก่อน</button></div><div id="queueRows"></div></section><aside class="note"><b>ขอบเขต:</b> หน้านี้ไม่ใช่หน้าปรับสิทธิ์ ไม่ใช่หน้าตรวจยอดเงินจริง ไม่ใช่หน้าสร้างแต้ม และไม่ใช่หน้าส่งข้อความหาลูกค้า</aside></main><script>
(function(){var statusEl=document.getElementById('status');var rowsEl=document.getElementById('queueRows');var countEl=document.getElementById('queueCount');var current='review_required';var labels={review_required:'ต้องดู',matched:'จับคู่แล้ว',no_match:'ยังไม่เจอคนเดิม',ignored:'ข้ามไว้ก่อน',exact_candidate:'เจอจากข้อมูลตรงกัน',multiple_candidates:'มีหลายคนที่อาจตรงกัน',owner_linked_client:'จับคู่โดย Owner',owner_ignored:'ข้ามโดย Owner'};function setStatus(t){statusEl.textContent=t}function idem(){return 'customer-data-'+Date.now()+'-'+Math.random().toString(36).slice(2)}async function api(path,opts){var res=await fetch(path,Object.assign({credentials:'include',headers:{'accept':'application/json','content-type':'application/json','Idempotency-Key':idem()}},opts||{}));var data=await res.json().catch(function(){return {ok:false,error:'bad_json'}});if(!res.ok||data.ok===false)throw new Error(data.error||('http_'+res.status));return data}function esc(v){return String(v||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}function pretty(v){return labels[v]||String(v||'').replace(/_/g,' ')}async function load(filter){current=filter||current;setStatus('กำลังโหลดคิว: '+pretty(current));rowsEl.innerHTML='';try{var data=await api('/v1/admin/customer-data/queue?status='+encodeURIComponent(current),{method:'GET',headers:{'accept':'application/json'}});countEl.textContent=(data.count||0)+' รายการ';if(!data.records||!data.records.length){rowsEl.innerHTML='<div class="row"><b>ยังไม่มีรายการ</b><p>ลองกดนำเข้าจาก Console Inbox หรือเปลี่ยนตัวกรองด้านบน</p></div>';setStatus('โหลดคิวเสร็จ');return}rowsEl.innerHTML=data.records.map(function(r){return '<div class="row"><span class="pill">'+esc(pretty(r.status))+'</span><span class="pill soft">'+esc(pretty(r.match_type||''))+'</span><b>'+esc(r.display_name||r.line_user_id||r.import_id||'ไม่พบชื่อ')+'</b><p>'+esc(r.summary||'ยังไม่มี note preview')+'</p><div class="toolbar"><button class="btn mini" data-action="review" data-id="'+esc(r.record_id)+'">ส่งเข้า Review</button><button class="btn mini" data-action="ignore" data-id="'+esc(r.record_id)+'">ข้ามไว้ก่อน</button><button class="btn mini" data-action="link" data-id="'+esc(r.record_id)+'">Link Client</button></div></div>'}).join('');setStatus('โหลดคิวเสร็จ')}catch(e){setStatus('โหลดไม่สำเร็จ: '+e.message)}}async function run(){setStatus('กำลังนำเข้าจาก Console Inbox ...');try{var data=await api('/v1/admin/customer-data/backfill/start',{method:'POST',body:JSON.stringify({source:'console_inbox',batch_size:10})});setStatus('นำเข้าแล้ว '+(data.processed||0)+' รายการ · job '+data.job_id);load('review_required')}catch(e){setStatus('นำเข้าไม่สำเร็จ: '+e.message)}}async function act(id,action){var body={action:action,reason:'Customer Data Console V1'};if(action==='link'){var client=prompt('ใส่ Airtable Client record id (rec...)');if(!client)return;body.action='link_to_client';body.client_id=client}if(action==='review')body.action='mark_review_required';if(action==='ignore')body.action='ignore';setStatus('กำลังบันทึก ...');try{await api('/v1/admin/customer-data/queue/'+encodeURIComponent(id)+'/action',{method:'POST',body:JSON.stringify(body)});setStatus('บันทึกแล้ว');load(current)}catch(e){setStatus('บันทึกไม่สำเร็จ: '+e.message)}}document.getElementById('runBackfill').onclick=run;document.getElementById('reloadQueue').onclick=function(){load(current)};document.querySelectorAll('[data-filter]').forEach(function(b){b.onclick=function(){load(b.getAttribute('data-filter'))}});rowsEl.addEventListener('click',function(e){var b=e.target.closest('button[data-action]');if(b)act(b.getAttribute('data-id'),b.getAttribute('data-action'))});load(current)})();
</script></body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate",
      "x-robots-tag": "noindex, nofollow, noarchive",
      "x-mmd-customer-data-ui": "readable-v2",
      "x-mmd-customer-data-authority": "identity-context-staging-only",
    },
  });
}

async function serveAsset(request: Request, env: InternalRoutesEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/a/")) return null;

  if (env.ASSETS) {
    const res = await env.ASSETS.fetch(request);
    if (res.status !== 404) {
      const headers = new Headers(res.headers);
      headers.set("cache-control", "public, max-age=300");
      if (url.pathname.endsWith(".js")) headers.set("content-type", "application/javascript; charset=utf-8");
      if (url.pathname.endsWith(".css")) headers.set("content-type", "text/css; charset=utf-8");
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    }
  }

  return new Response("Asset not found", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function requireAdminGate(request: Request, env: InternalRoutesEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.searchParams.has("mock")) return null;

  const adminBase = publicAdminAuthBaseUrl(request);
  if (!adminBase || !env.ADMIN_WORKER) return adminLoginRedirect(url);

  try {
    const publicHost = new URL(adminBase).hostname;
    const verifyReq = new Request(`${adminBase}/v1/admin/auth/me`, {
      method: "GET",
      headers: {
        accept: "application/json",
        cookie: request.headers.get("cookie") || "",
        "user-agent": request.headers.get("user-agent") || "",
        "x-mmd-auth-bridge": "immigrate-internal-admin-gate",
        "x-mmd-public-host": publicHost,
      },
    });
    const verifyRes = await env.ADMIN_WORKER.fetch(verifyReq);

    if (verifyRes.ok) return null;
  } catch {
    // Use admin login fallback below.
  }

  return adminLoginRedirect(url);
}

function str(value: unknown): string {
  return String(value ?? "").trim();
}

function envText(env: InternalRoutesEnv, key: string, fallback = ""): string {
  return str((env as unknown as Record<string, unknown>)[key]) || fallback;
}

function airtableConfig(env: InternalRoutesEnv) {
  const token = envText(env, "AIRTABLE_API_KEY") || envText(env, "AIRTABLE_TOKEN");
  const base = envText(env, "AIRTABLE_BASE_ID", AIRTABLE_BASE_DEFAULT);
  if (!token || !base) throw new Error("airtable_not_configured");
  return { token, base };
}

function tableIds(env: InternalRoutesEnv) {
  return {
    clients: envText(env, "AIRTABLE_TABLE_CLIENTS_ID") || envText(env, "AIRTABLE_TABLE_CLIENTS", CLIENTS_TABLE_DEFAULT),
    staging: envText(env, "AIRTABLE_LINE_OFC_IMPORT_TABLE_ID", LINE_STAGING_TABLE_DEFAULT),
    inbox: envText(env, "AIRTABLE_CONSOLE_INBOX_TABLE_ID", CONSOLE_INBOX_TABLE_DEFAULT),
  };
}

function airtableHeaders(env: InternalRoutesEnv) {
  return { Authorization: `Bearer ${airtableConfig(env).token}`, "Content-Type": "application/json" };
}

function escapeFormula(value: string) { return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"'); }
function safeToken(value: string) { return str(value).replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || crypto.randomUUID(); }
function clampNumber(value: unknown, min: number, max: number, fallback: number) { const n = Number(value); return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : fallback; }

async function readBodyJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

async function airtableList(env: InternalRoutesEnv, table: string, query: Record<string, string> = {}) {
  const cfg = airtableConfig(env);
  const params = new URLSearchParams(query);
  const response = await fetch(`${AIRTABLE_API}/${cfg.base}/${table}?${params.toString()}`, { headers: airtableHeaders(env) });
  if (!response.ok) throw new Error("airtable_" + response.status);
  const data = await response.json() as { records?: unknown[]; offset?: string };
  return { records: Array.isArray(data.records) ? data.records as Array<Record<string, unknown>> : [], offset: str(data.offset) };
}

async function airtableFindOne(env: InternalRoutesEnv, table: string, formula: string) {
  const data = await airtableList(env, table, { maxRecords: "1", pageSize: "1", filterByFormula: formula });
  return data.records[0] || null;
}

async function airtableWrite(env: InternalRoutesEnv, table: string, fields: Record<string, unknown>, recordId = "") {
  const cfg = airtableConfig(env);
  const method = recordId ? "PATCH" : "POST";
  const suffix = recordId ? `/${recordId}` : "";
  const response = await fetch(`${AIRTABLE_API}/${cfg.base}/${table}${suffix}`, {
    method,
    headers: airtableHeaders(env),
    body: JSON.stringify({ fields, typecast: true }),
  });
  if (!response.ok) throw new Error("airtable_" + response.status);
  return await response.json() as Record<string, unknown>;
}

function pick(fields: Record<string, unknown>, names: string[]) {
  const lower = new Map(Object.keys(fields || {}).map((key) => [key.toLowerCase(), key]));
  for (const name of names) {
    const key = lower.get(name.toLowerCase());
    if (key) return str(fields[key]);
  }
  return "";
}

function recordFields(record: Record<string, unknown>) { return (record.fields && typeof record.fields === "object" ? record.fields : {}) as Record<string, unknown>; }

async function findClientCandidates(env: InternalRoutesEnv, input: Record<string, string>) {
  const { clients } = tableIds(env);
  const found = new Map<string, Record<string, unknown>>();
  const keys: Array<[string, string]> = [
    ["line_user_id", input.line_user_id],
    ["Phone Number", input.phone],
    ["email", input.email],
    ["Contact Email", input.email],
  ];
  for (const [field, value] of keys) {
    if (!value) continue;
    try {
      const rows = await airtableList(env, clients, { maxRecords: "5", pageSize: "5", filterByFormula: `{${field}}=\"${escapeFormula(value)}\"` });
      for (const row of rows.records) found.set(str(row.id), row);
    } catch {
      // Preserve the backfill even if one optional matching field is not present.
    }
  }
  return [...found.values()];
}

function summarizeRecord(record: Record<string, unknown>) {
  const fields = recordFields(record);
  const client = Array.isArray(fields["Canonical Client"]) ? (fields["Canonical Client"] as unknown[])[0] : "";
  return {
    record_id: str(record.id),
    import_id: pick(fields, ["Import ID", "import_id"]),
    status: pick(fields, ["Import Status", "review_status"]) || "review_required",
    line_user_id: pick(fields, ["LINE User ID", "line_user_id"]),
    display_name: pick(fields, ["Display Name", "Current LINE Rename", "line_display_name", "normalized_name"]),
    email: pick(fields, ["Email", "email_candidate"]),
    phone: pick(fields, ["Phone", "phone_candidate"]),
    match_type: pick(fields, ["Match Type", "match_type"]),
    canonical_client_id: str(client),
    summary: pick(fields, ["Review Note", "Raw LINE Notes", "raw_note"]).slice(0, 220),
  };
}

async function customerDataBackfillStart(request: Request, env: InternalRoutesEnv) {
  const idem = str(request.headers.get("Idempotency-Key"));
  if (!idem) return Response.json({ ok: false, error: "idempotency_key_required" }, { status: 400 });
  const body = await readBodyJson(request);
  if ((str(body.source) || "console_inbox") !== "console_inbox") return Response.json({ ok: false, error: "unsupported_source" }, { status: 400 });
  const jobId = `cd_${safeToken(idem).slice(0, 48)}`;
  const batchSize = clampNumber(body.batch_size, 1, 25, 10);
  const cursor = str(body.cursor);
  const { inbox } = tableIds(env);
  const rows = await airtableList(env, inbox, { pageSize: String(batchSize), ...(cursor ? { offset: cursor } : {}) });
  const summary = { processed: 0, matched: 0, review_required: 0, no_match: 0, failed: 0 };
  const results: Array<Record<string, unknown>> = [];
  for (const row of rows.records) {
    try {
      const fields = recordFields(row);
      const raw = pick(fields, ["raw_note", "note", "notes", "message", "text", "description", "admin_note", "payload_json"]) || JSON.stringify(fields).slice(0, 6000);
      const input = {
        line_user_id: pick(fields, ["line_user_id", "LINE User ID", "userId", "user_id"]),
        display_name: pick(fields, ["display_name", "Display Name", "line_display_name", "name"]),
        email: pick(fields, ["email", "Contact Email", "primary_email", "member_email"]).toLowerCase(),
        phone: pick(fields, ["phone", "Phone Number", "phone_number", "tel", "member_phone"]),
      };
      const candidates = await findClientCandidates(env, input);
      const status = candidates.length === 1 ? "matched" : candidates.length > 1 ? "review_required" : "no_match";
      const importId = `customer_data_${jobId}_${str(row.id)}`;
      const existing = await airtableFindOne(env, tableIds(env).staging, `{Import ID}=\"${escapeFormula(importId)}\"`).catch(() => null);
      const write = await airtableWrite(env, tableIds(env).staging, {
        "Import ID": importId,
        "Import Status": status,
        "LINE User ID": input.line_user_id,
        "Display Name": input.display_name,
        "Email": input.email,
        "Phone": input.phone,
        "Raw LINE Notes": raw,
        "Current LINE Rename": input.display_name,
        "Source Hash": str(row.id),
        "Imported At": new Date().toISOString(),
        "Match Type": candidates.length === 1 ? "exact_candidate" : candidates.length > 1 ? "multiple_candidates" : "no_match",
        "Canonical Client": candidates.length === 1 ? [str(candidates[0].id)] : undefined,
        "Review Note": "Customer Data V1 evidence only. No membership, payment, points, entitlement, Telegram, or customer-message mutation.",
      }, str(existing?.id));
      summary.processed += 1;
      (summary as Record<string, number>)[status] += 1;
      results.push({ import_id: importId, status, record_id: str(write.id) });
    } catch {
      summary.failed += 1;
    }
  }
  return Response.json({ ok: true, job_id: jobId, cursor: rows.offset || null, ...summary, records: results }, { headers: { "cache-control": "no-store" } });
}

async function customerDataBackfillStatus(_request: Request, env: InternalRoutesEnv, jobId: string) {
  const data = await airtableList(env, tableIds(env).staging, { pageSize: "100", maxRecords: "100", filterByFormula: `FIND(\"${escapeFormula(jobId)}\",{Import ID}&\"\")>0` });
  const counts: Record<string, number> = { matched: 0, review_required: 0, no_match: 0, ignored: 0 };
  for (const record of data.records) {
    const status = summarizeRecord(record).status;
    counts[status] = (counts[status] || 0) + 1;
  }
  return Response.json({ ok: true, job_id: jobId, count: data.records.length, counts }, { headers: { "cache-control": "no-store" } });
}

async function customerDataQueue(request: Request, env: InternalRoutesEnv) {
  const url = new URL(request.url);
  const status = str(url.searchParams.get("status")) || "review_required";
  const formula = `{Import Status}=\"${escapeFormula(status)}\"`;
  const data = await airtableList(env, tableIds(env).staging, { pageSize: "50", maxRecords: "50", filterByFormula: formula });
  return Response.json({ ok: true, status, count: data.records.length, records: data.records.map(summarizeRecord) }, { headers: { "cache-control": "no-store" } });
}

async function customerDataAction(request: Request, env: InternalRoutesEnv, recordId: string) {
  const idem = str(request.headers.get("Idempotency-Key"));
  if (!idem) return Response.json({ ok: false, error: "idempotency_key_required" }, { status: 400 });
  const body = await readBodyJson(request);
  const action = str(body.action);
  const reason = str(body.reason) || "Customer Data Console V1";
  const fields: Record<string, unknown> = { "Review Note": `${reason} · action=${action}` };
  if (action === "link_to_client") {
    const clientId = str(body.client_id);
    if (!/^rec[\w]+$/.test(clientId)) return Response.json({ ok: false, error: "invalid_client_id" }, { status: 400 });
    fields["Canonical Client"] = [clientId];
    fields["Import Status"] = "matched";
    fields["Match Type"] = "owner_linked_client";
  } else if (action === "create_candidate_only") {
    fields["Import Status"] = "review_required";
    fields["Match Type"] = "candidate_only";
  } else if (action === "mark_review_required") {
    fields["Import Status"] = "review_required";
  } else if (action === "ignore") {
    fields["Import Status"] = "ignored";
    fields["Match Type"] = "owner_ignored";
  } else {
    return Response.json({ ok: false, error: "invalid_action" }, { status: 400 });
  }
  const record = await airtableWrite(env, tableIds(env).staging, fields, recordId);
  return Response.json({ ok: true, action, record: summarizeRecord(record) }, { headers: { "cache-control": "no-store" } });
}

async function handleCustomerDataApi(request: Request, env: InternalRoutesEnv): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (!path.startsWith("/v1/admin/customer-data")) return null;
  const gate = await requireAdminGate(request, env);
  if (gate) return gate;
  try {
    if (path === "/v1/admin/customer-data/backfill/start" && request.method === "POST") return await customerDataBackfillStart(request, env);
    if (path === "/v1/admin/customer-data/backfill/continue" && request.method === "POST") return await customerDataBackfillStart(request, env);
    const statusMatch = path.match(/^\/v1\/admin\/customer-data\/backfill\/([^/]+)$/);
    if (statusMatch && request.method === "GET") return await customerDataBackfillStatus(request, env, decodeURIComponent(statusMatch[1]));
    if (path === "/v1/admin/customer-data/queue" && request.method === "GET") return await customerDataQueue(request, env);
    const actionMatch = path.match(/^\/v1\/admin\/customer-data\/queue\/([^/]+)\/action$/);
    if (actionMatch && request.method === "POST") return await customerDataAction(request, env, decodeURIComponent(actionMatch[1]));
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  } catch (error) {
    const code = str((error as Error)?.message) || "customer_data_unavailable";
    const status = code === "airtable_not_configured" ? 503 : code.startsWith("airtable_") ? 502 : 500;
    return Response.json({ ok: false, error: code }, { status, headers: { "cache-control": "no-store" } });
  }
}

function addMinutes(time: string, minutes: number): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(str(time));
  if (!match) return "";
  const start = Number(match[1]) * 60 + Number(match[2]);
  const next = (start + minutes) % (24 * 60);
  return `${String(Math.floor(next / 60)).padStart(2, "0")}:${String(next % 60).padStart(2, "0")}`;
}

function normalizeAdminJobPayload(body: Record<string, unknown>): Record<string, unknown> {
  const work = (body.work && typeof body.work === "object" ? body.work : {}) as Record<string, unknown>;
  const model = (body.model && typeof body.model === "object" ? body.model : {}) as Record<string, unknown>;
  const jobDetails = (body.job_details && typeof body.job_details === "object" ? body.job_details : {}) as Record<string, unknown>;
  const payment = (body.payment && typeof body.payment === "object" ? body.payment : {}) as Record<string, unknown>;
  const notes = (body.notes && typeof body.notes === "object" ? body.notes : {}) as Record<string, unknown>;
  const clientLineage = (body.client_lineage && typeof body.client_lineage === "object" ? body.client_lineage : {}) as Record<string, unknown>;

  const sessionId = str(body.session_id);
  const startTime = str(body.start_time || jobDetails.start_time) || "00:00";
  const endTime = str(body.end_time || jobDetails.end_time) || addMinutes(startTime, 90);
  const amountValue = body.amount_thb ?? payment.amount_thb;
  if (!str(amountValue)) throw new Error("invalid_amount_thb");
  const amount = Number(amountValue);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("invalid_amount_thb");

  return {
    ...body,
    client_name: str(body.client_name || clientLineage.client_name) || sessionId,
    model_name: str(body.model_name || model.model_name || body.model_lookup_key) || "model_pending",
    job_type: str(body.job_type || work.job_lane || work.work_type || body.job_visibility) || "public_work",
    job_date: str(body.job_date || jobDetails.job_date) || "pending_date",
    start_time: startTime,
    end_time: endTime,
    location_name: str(body.location_name || jobDetails.location_name) || "pending_location",
    google_map_url: str(body.google_map_url || jobDetails.google_map_url),
    amount_thb: amount,
    payment_type: str(body.payment_type || payment.payment_type) || "full",
    payment_method: str(body.payment_method || payment.payment_method) || "promptpay",
    note: str(body.note || notes.operation_note || notes.handling_note || body.notes),
  };
}

async function proxyAdminApi(request: Request, env: InternalRoutesEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/v1/admin/")) return null;

  const customerDataRes = await handleCustomerDataApi(request, env);
  if (customerDataRes) return customerDataRes;

  const adminBase = publicAdminAuthBaseUrl(request);
  if (!adminBase || !env.ADMIN_WORKER) {
    return Response.json({ ok: false, error: "admin_worker_binding_required" }, { status: 502 });
  }
  const adminApiAliases: Record<string, string> = {
    "/v1/admin/create-job": "/v1/admin/job/create",
    "/v1/admin/create-session": "/v1/admin/job/create",
    "/v1/admin/jobs/create-session": "/v1/admin/job/create",
  };
  const targetPath = adminApiAliases[url.pathname] || url.pathname;
  const shouldNormalizeAdminJob = Boolean(adminApiAliases[url.pathname]) && request.method === "POST";
  const isClientLineageLookup = targetPath === "/v1/admin/clients/lineage-lookup" && request.method === "POST";
  const isCustomerLinePush = targetPath === "/v1/admin/line/push" && request.method === "POST";
  const publicHost = new URL(adminBase).hostname;
  const target = new URL(`${adminBase}${targetPath}`);
  target.search = url.search;

  const headers = new Headers();
  headers.set("accept", request.headers.get("accept") || "application/json");
  headers.set("cookie", request.headers.get("cookie") || "");
  headers.set("user-agent", request.headers.get("user-agent") || "");
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  headers.set("x-mmd-auth-bridge", "immigrate-internal-admin-api");
  headers.set("x-mmd-public-host", publicHost);
  if (isCustomerLinePush) headers.set("x-mmd-customer-snapshot-reviewed", "true");

  if (isCustomerLinePush) {
    const pushBody = await readBodyJson(request.clone());
    if (pushBody.customer_snapshot_reviewed !== true) {
      return Response.json({
        ok: false,
        error: "customer_snapshot_review_required",
        message: "Review and explicitly confirm the customer snapshot before sending LINE.",
      }, { status: 409, headers: { "cache-control": "no-store" } });
    }
    if (!str(pushBody.session_id)) {
      return Response.json({ ok: false, error: "session_id_required" }, { status: 400, headers: { "cache-control": "no-store" } });
    }
  }

  let manualLookupQuery = "";
  if (isClientLineageLookup) {
    try {
      const lookupBody = (await request.clone().json()) as Record<string, unknown>;
      manualLookupQuery = str(lookupBody.query).slice(0, 160);
    } catch {
      manualLookupQuery = "";
    }
  }

  let body: BodyInit | null | undefined = request.method === "GET" || request.method === "HEAD" ? undefined : request.body;
  if (shouldNormalizeAdminJob && contentType?.toLowerCase().includes("application/json")) {
    const rawBody = await request.text();
    try {
      const parsed = rawBody ? JSON.parse(rawBody) : {};
      body = JSON.stringify(normalizeAdminJobPayload(parsed && typeof parsed === "object" ? parsed : {}));
    } catch {
      return Response.json({ ok: false, error: "invalid_amount_thb", message: "amount_thb is required and must be a number greater than 0" }, { status: 400 });
    }
  }

  const init: RequestInit & { duplex?: "half" } = { method: request.method, headers, body, redirect: "manual" };
  if (init.body) init.duplex = "half";

  const res = await env.ADMIN_WORKER.fetch(new Request(target.toString(), init));
  const outHeaders = new Headers(res.headers);
  outHeaders.set("cache-control", "no-store");

  if (isClientLineageLookup && manualLookupQuery && res.ok) {
    try {
      const data = (await res.clone().json()) as Record<string, unknown>;
      const records = Array.isArray(data.records) ? data.records : [];
      if (data.ok !== false && records.length === 0) {
        const warnings = Array.isArray(data.lineage_warnings) ? data.lineage_warnings : [];
        data.records = [{
          client_id: "",
          member_id: "",
          member_email: "",
          remembered_name: manualLookupQuery,
          canonical_name: "",
          client_name: manualLookupQuery,
          aliases: [manualLookupQuery],
          matched_on: "manual_name_pending_reconcile",
          matched_value: manualLookupQuery,
          lookup_chain: ["owner_manual_name", "identity_pending_reconcile"],
          username: "",
          phone: "",
          package_code: "",
          tier: "",
          membership_status: "guest_public_only",
          purchased_history: "Public only · identity pending reconciliation",
          line_record_id: "",
          line_user_id: "",
          line_display_name: "",
          legacy_tags: ["manual_name", "identity_pending_reconcile", "public_only"],
          customer_telegram_username: "",
          customer_telegram_status: "missing",
          confidence: 1,
          lineage_source: "owner_manual_name_pending_reconcile",
          entitlement_snapshot_source: "none",
          identity_status: "pending_reconcile",
          manual_public_only: true,
        }];
        data.count = 1;
        data.manual_fallback = true;
        data.lineage_warnings = [...warnings, "manual_public_only_pending_reconcile"];
        outHeaders.set("content-type", "application/json; charset=utf-8");
        return new Response(JSON.stringify(data), { status: 200, headers: outHeaders });
      }
    } catch {
      // Preserve the canonical admin-worker response if it is not JSON.
    }
  }

  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: outHeaders });
}

export async function handleInternalRoutes(request: Request, env: InternalRoutesEnv): Promise<Response | null> {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  const assetRes = await serveAsset(request, env);
  if (assetRes) return assetRes;

  const apiRes = await proxyAdminApi(request, env);
  if (apiRes) return apiRes;

  if (pathname === "/internal/admin/create-session") {
    return redirect(withQuery("/internal/admin/jobs/create-session", url), 308);
  }

  if (pathname === "/internal/admin/control-room") {
    const gate = await requireAdminGate(request, env);
    if (gate) return gate;
    return renderOwnerControlRoomPage();
  }

  if (pathname === "/internal/admin/customer-data") {
    const gate = await requireAdminGate(request, env);
    if (gate) return gate;
    return renderCustomerDataPage();
  }

  if (pathname === "/internal/admin/jobs/create-session") {
    const gate = await requireAdminGate(request, env);
    if (gate) return gate;
    return withSameOriginAdminBase(renderCreateSessionPage(env));
  }

  if (pathname === "/internal/jobs/create-job") {
    const gate = await requireAdminGate(request, env);
    if (gate) return gate;
    return withCreateJobAmountInput(renderCreateJobPage());
  }

  return null;
}

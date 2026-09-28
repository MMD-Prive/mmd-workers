import { resolveLiveCanonicalClient } from "./kenji-lv5-live-context.js";

export const OWNER_MY_MMD_RECOVERY_PAGE_PATH = "/internal/admin/my-mmd/recovery";
export const OWNER_MY_MMD_RECOVERY_API_PATH = "/v1/admin/my-mmd/recovery-diagnostic";

const MEMBER_PAGES_RPC_PATH = "/__internal/admin/my-mmd/recovery-diagnostic";

export function isOwnerMyMmdRecoveryDiagnosticRequest(path, method) {
  const m = String(method || "").toUpperCase();
  return (
    (path === OWNER_MY_MMD_RECOVERY_PAGE_PATH && (m === "GET" || m === "HEAD"))
    || (path === OWNER_MY_MMD_RECOVERY_API_PATH && m === "GET")
  );
}

export async function handleOwnerMyMmdRecoveryDiagnostic(request, env = {}, actor = null) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method.toUpperCase();

  if (!isOwnerActor(actor)) {
    return path === OWNER_MY_MMD_RECOVERY_PAGE_PATH
      ? html(renderForbidden(), 403)
      : json({ ok: false, error: "owner_required" }, 403);
  }

  if (path === OWNER_MY_MMD_RECOVERY_PAGE_PATH) {
    if (method === "HEAD") return html("", 200);
    return html(renderPage(url.searchParams.get("q") || ""), 200);
  }

  const query = clean(url.searchParams.get("q"), 120);
  const clientId = recordId(url.searchParams.get("client_id"));
  if (!query && !clientId) return json({ ok: false, error: "query_required" }, 400);

  const identity = await resolveLiveCanonicalClient(env, clientId
    ? { canonical_client_id: clientId }
    : { client_query: query }).catch(() => null);

  if (!identity || identity.status !== "resolved" || !recordId(identity?.client?.canonical_client_id)) {
    return json({
      ok: false,
      state: "unresolved",
      error: identity?.reason || "canonical_client_unresolved",
      choices: Array.isArray(identity?.choices)
        ? identity.choices.slice(0, 12).map((item) => ({
            client_id: recordId(item.client_id) || null,
            display_name: clean(item.display_name, 120) || null,
          }))
        : [],
    }, identity?.reason?.includes("multiple") || identity?.reason?.includes("ambiguous") ? 409 : 404);
  }

  const lineUserId = lineId(identity.client.line_user_id);
  if (!lineUserId) {
    return json({
      ok: false,
      state: "unavailable",
      error: "canonical_client_line_identity_missing",
      customer: safeCustomer(identity.client),
    }, 409);
  }

  const binding = env.MEMBER_PAGES_MEMBER_WALLET;
  if (!binding?.fetch) {
    return json({ ok: false, state: "unavailable", error: "member_pages_binding_missing" }, 503);
  }

  let response;
  let payload;
  try {
    response = await binding.fetch(new Request(`https://member-pages-worker.internal${MEMBER_PAGES_RPC_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mmd-internal-call": "true",
        "x-mmd-service-binding": "admin-worker",
      },
      body: JSON.stringify({ line_user_id: lineUserId }),
    }));
    payload = await response.json().catch(() => null);
  } catch {
    return json({ ok: false, state: "unavailable", error: "member_pages_diagnostic_unavailable" }, 503);
  }

  if (!response.ok || payload?.ok !== true) {
    return json({
      ok: false,
      state: payload?.state || "unavailable",
      error: payload?.error || "member_pages_diagnostic_failed",
      customer: safeCustomer(identity.client),
    }, response.status || 503);
  }

  return json({
    ok: true,
    authority: "mmd.owner_my_mmd_recovery_diagnostic.v1",
    customer: safeCustomer(identity.client),
    membership: payload.membership || null,
    recovery: payload.recovery || null,
    points: payload.points || null,
    acceptance: payload.acceptance || null,
    guardrails: {
      ...(payload.guardrails || {}),
      owner_session_required: true,
      browser_raw_line_user_id_exposed: false,
      customer_session_required: false,
      read_only: true,
    },
  });
}

export function isOwnerActor(actor) {
  const role = clean(actor?.role, 40).toLowerCase();
  if (role === "owner") return true;
  return (
    clean(actor?.id, 80).toLowerCase() === "per"
    && role === "admin"
    && clean(actor?.auth_method, 40).toLowerCase() === "credential"
  );
}

function safeCustomer(client = {}) {
  return {
    display_name: clean(client.display_name || client.per_rename, 120) || "สมาชิก MMD",
    canonical_client_id: recordId(client.canonical_client_id) || null,
    source: clean(client.source, 80) || "canonical_client",
  };
}

function renderPage(initialQuery) {
  const q = escapeHtml(clean(initialQuery, 120));
  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>MY MMD Recovery Diagnostic · Owner</title>
<style>
:root{color-scheme:dark;--bg:#08090b;--panel:#111318;--line:#292d35;--text:#f4f4f2;--muted:#999faa;--gold:#d7b15f;--ok:#69d28b;--warn:#e8bd68;--bad:#ef7b83}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top,#15131a 0,#08090b 38%);color:var(--text);font:15px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{max-width:980px;margin:0 auto;padding:32px 18px 72px}.eyebrow{color:var(--gold);font-size:12px;font-weight:800;letter-spacing:.18em;text-transform:uppercase}
h1{font-size:clamp(28px,5vw,48px);line-height:1.04;margin:8px 0 10px}p{color:var(--muted)}
.search{display:grid;grid-template-columns:1fr auto;gap:10px;margin:24px 0}.search input{width:100%;padding:15px 16px;border:1px solid var(--line);border-radius:14px;background:#0c0e12;color:#fff;font-size:16px}.search button{border:0;border-radius:14px;padding:0 22px;background:linear-gradient(135deg,#b88939,#eed47f);font-weight:800;color:#111;cursor:pointer}
.note{padding:12px 14px;border:1px solid #323740;border-radius:12px;background:#0d0f13;color:#aeb4bd}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:18px}.card{border:1px solid var(--line);border-radius:18px;background:linear-gradient(180deg,#13151a,#0d0f13);padding:18px}.card span{display:block;color:var(--muted);font-size:12px;letter-spacing:.08em;text-transform:uppercase}.card strong{display:block;font-size:25px;margin-top:5px;overflow-wrap:anywhere}.wide{grid-column:1/-1}.ok{color:var(--ok)}.warn{color:var(--warn)}.bad{color:var(--bad)}.meta{margin-top:8px;color:var(--muted);font-size:13px}.empty{padding:28px;border:1px dashed var(--line);border-radius:18px;color:var(--muted);text-align:center}.choices button{display:block;width:100%;text-align:left;margin:8px 0;padding:12px;border:1px solid var(--line);border-radius:12px;background:#101218;color:#fff;cursor:pointer}
@media(max-width:640px){.grid{grid-template-columns:1fr}.wide{grid-column:auto}.search{grid-template-columns:1fr}.search button{padding:14px}}
</style>
</head>
<body>
<main>
<div class="eyebrow">SIGIL · OWNER ONLY</div>
<h1>MY MMD Recovery Diagnostic</h1>
<p>ตรวจสถานะสมาชิกจาก canonical truth โดยไม่ใช้ LINE session ของลูกค้า และไม่แสดง LINE User ID ดิบใน browser</p>
<form class="search" data-form>
<input name="q" value="${q}" placeholder="เช่น เชน, คุณโจ, Per-name หรือชื่อที่ใช้ใน Canonical Client" autocomplete="off">
<button type="submit">ตรวจสถานะ</button>
</form>
<div class="note">Read-only · Owner session required · Customer session not required · No raw LINE identity in UI</div>
<section data-result class="empty">ใส่ชื่อลูกค้าแล้วกด “ตรวจสถานะ”</section>
</main>
<script>
(function(){
  'use strict';
  var form=document.querySelector('[data-form]');
  var result=document.querySelector('[data-result]');
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function fmtDate(v){if(!v)return '—';var d=new Date(v);if(isNaN(d))return esc(v);return new Intl.DateTimeFormat('th-TH',{year:'numeric',month:'short',day:'numeric',hour:v.indexOf('T')>-1?'2-digit':undefined,minute:v.indexOf('T')>-1?'2-digit':undefined}).format(d)}
  function stateClass(v){return v==='reconciled'?'ok':v==='review_required'?'warn':(v==='blocked'?'bad':'warn')}
  function render(b){
    if(!b||b.ok!==true){
      var choices=Array.isArray(b&&b.choices)?b.choices:[];
      result.className='empty';
      result.innerHTML='<strong>ยัง resolve ไม่สำเร็จ</strong><div class="meta">'+esc((b&&b.error)||'unavailable')+'</div>'
        +(choices.length?'<div class="choices">'+choices.map(function(x){return '<button type="button" data-client="'+esc(x.client_id||'')+'">'+esc(x.display_name||x.client_id||'เลือก')+'</button>'}).join('')+'</div>':'');
      result.querySelectorAll('[data-client]').forEach(function(btn){btn.addEventListener('click',function(){load('',btn.getAttribute('data-client'))})});
      return;
    }
    var c=b.customer||{},m=b.membership||{},r=b.recovery||{},p=b.points||{},a=b.acceptance||{};
    result.className='grid';
    result.innerHTML=''
      +'<article class="card wide"><span>ลูกค้า</span><strong>'+esc(c.display_name||'—')+'</strong><div class="meta">'+esc(c.canonical_client_id||'')+'</div></article>'
      +'<article class="card"><span>Membership</span><strong>'+esc(m.label||m.level||'—')+'</strong><div class="meta">lifecycle: '+esc(m.lifecycle||'—')+'</div></article>'
      +'<article class="card"><span>Active-through</span><strong>'+fmtDate(m.active_through)+'</strong><div class="meta">source: '+esc(m.source||'—')+'</div></article>'
      +'<article class="card"><span>Recovery</span><strong class="'+stateClass(r.state)+'">'+esc(r.state||'—')+'</strong><div class="meta">terminal: '+esc(r.terminal===true?'yes':'no')+' · review '+esc(r.pending_review_count||0)+'</div></article>'
      +'<article class="card"><span>Points</span><strong>'+esc(p.value==null?'—':p.value)+'</strong><div class="meta">'+esc(p.status||'—')+' · '+esc(p.source||'—')+'</div></article>'
      +'<article class="card wide"><span>Acceptance evidence</span><strong>'+esc(a.evidence_id||'—')+'</strong><div class="meta">'+esc(a.status||'—')+' · '+fmtDate(a.recorded_at)+'</div></article>'
      +'<article class="card wide"><span>Recovery detail</span><div class="meta">reason: '+esc(r.reason||'—')+' · notes '+esc(r.source_note_count||0)+' · candidates '+esc(r.candidate_count||0)+' · materialized '+esc(r.materialized_count||0)+' · updated '+fmtDate(r.updated_at)+'</div></article>';
  }
  async function load(q,clientId){
    result.className='empty';result.textContent='กำลังอ่าน canonical truth…';
    var u=new URL('/v1/admin/my-mmd/recovery-diagnostic',location.origin);
    if(clientId)u.searchParams.set('client_id',clientId);else u.searchParams.set('q',q);
    try{
      var r=await fetch(u,{credentials:'include',headers:{accept:'application/json'},cache:'no-store'});
      if(r.status===401){location.href='/internal/admin/login?next='+encodeURIComponent(location.pathname+location.search);return}
      var b=await r.json().catch(function(){return {ok:false,error:'invalid_response'}});
      render(b);
    }catch(e){render({ok:false,error:'network_unavailable'})}
  }
  form.addEventListener('submit',function(e){e.preventDefault();var q=(new FormData(form).get('q')||'').trim();if(q)load(q,'')});
  var initial=(new URL(location.href)).searchParams.get('q');if(initial)load(initial,'');
})();
</script>
</body>
</html>`;
}

function renderForbidden() {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Owner required</title></head><body style="background:#08090b;color:#fff;font-family:system-ui;padding:40px"><h1>Owner session required</h1><p>หน้านี้เปิดได้เฉพาะ Owner credential-bound session เท่านั้น</p></body></html>`;
}

function recordId(value) {
  const id = clean(value, 80);
  return /^rec[A-Za-z0-9]{6,32}$/.test(id) ? id : "";
}

function lineId(value) {
  const id = clean(value, 80);
  return /^U[0-9a-f]{32}$/i.test(id) ? id : "";
}

function clean(value, max = 500) {
  return String(value == null ? "" : value).trim().replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").slice(0, max);
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate",
      "x-robots-tag": "noindex, nofollow, noarchive",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "x-mmd-owner-surface": "my-mmd-recovery-diagnostic-v1",
    },
  });
}

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-mmd-owner-surface": "my-mmd-recovery-diagnostic-v1",
    },
  });
}

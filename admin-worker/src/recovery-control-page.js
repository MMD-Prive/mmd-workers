export function renderRecoveryControlPage(input = {}) {
  const initialCaseRef = escapeHtml(input.case_ref || "");
  const taxonomy = escapeHtml(input.taxonomy_version || "");
  const slaVersion = escapeHtml(input.sla_version || "");
  const assignmentVersion = escapeHtml(input.assignment_version || "");
  const initialDomain = escapeHtml(input.domain || "all");
  const initialState = escapeHtml(input.state || "open");
  const initialAssignment = escapeHtml(input.assignment || "all");
  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>MMD Recovery Control</title>
<style>
:root{color-scheme:dark;--bg:#070809;--panel:#101216;--soft:#171a20;--line:#2a2d34;--text:#f4f2ed;--muted:#9da3ad;--gold:#d1ac60;--good:#183321;--warn:#302413;--bad:#31191d}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 78% 0,#17130d 0,#08090b 34%,#070809 70%);color:var(--text);font:15px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
button,input,select{font:inherit}main{max-width:1120px;margin:auto;padding:24px 16px 72px}.top{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.eyebrow{color:var(--gold);font-size:11px;font-weight:850;letter-spacing:.18em}.top h1{font-size:clamp(30px,5vw,52px);line-height:1;margin:7px 0}.top p{margin:0;color:var(--muted);max-width:720px}.pill{border:1px solid #4d4130;border-radius:999px;padding:8px 11px;color:#e9cc8c;background:#14110d;white-space:nowrap;font-size:12px}
.search{display:grid;grid-template-columns:1fr auto;gap:10px;margin:20px 0}.search input,.select{width:100%;border:1px solid var(--line);background:#0d0f12;color:#fff;border-radius:13px;padding:13px 14px;outline:none}.btn{border:1px solid var(--line);background:var(--soft);color:#fff;border-radius:13px;padding:12px 15px;font-weight:760;cursor:pointer}.btn.primary{border-color:#a9823c;background:linear-gradient(135deg,#b98b39,#e6c975);color:#111}.btn.good{border-color:#3f7951;background:var(--good)}.btn.warn{border-color:#765c31;background:var(--warn)}.btn.bad{border-color:#7d4146;background:var(--bad)}.btn:disabled{opacity:.38;cursor:not-allowed}
.queuebar{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;margin:0 0 14px}.filters{display:flex;gap:8px;flex-wrap:wrap}.filters .select{width:auto;min-width:160px}.metrics{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.metric{border:1px solid var(--line);border-radius:12px;background:#0d0f12;padding:8px 10px;min-width:92px}.metric span{display:block;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.08em}.metric strong{font-size:17px}.grid{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.4fr);gap:14px}.panel{border:1px solid var(--line);background:linear-gradient(180deg,#121419,#0d0f12);border-radius:18px;padding:16px;min-width:0}.panel h2{font-size:15px;margin:0 0 12px}.list{display:grid;gap:8px}.case-row{width:100%;text-align:left;border:1px solid var(--line);background:#0c0e11;color:#fff;border-radius:13px;padding:12px;cursor:pointer}.case-row strong,.case-row span{display:block}.case-row span{color:var(--muted);font-size:12px;margin-top:3px}.case-row.active{border-color:#9c783b;background:#16130f}.queue-meta{display:flex!important;gap:6px!important;flex-wrap:wrap}.badge{display:inline-flex!important;width:auto!important;border:1px solid #30343c;border-radius:999px;padding:2px 7px;margin-top:5px!important;color:#c4cad3!important}.badge.overdue{border-color:#7d4146;color:#f3a2a7!important}.badge.watch{border-color:#765c31;color:#efca83!important}.badge.fresh{border-color:#365b43;color:#9be2ae!important}.ref{font:700 12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:#e6ca91;overflow-wrap:anywhere}.empty{padding:26px;border:1px dashed #30343c;border-radius:14px;color:var(--muted);text-align:center}.headline{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.status{display:inline-flex;border-radius:999px;border:1px solid var(--line);padding:5px 9px;font-size:12px}.facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:14px 0}.fact{background:#0b0d10;border:1px solid #22262c;border-radius:13px;padding:11px}.fact span{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em}.fact strong{display:block;margin-top:4px;overflow-wrap:anywhere}.rule{margin:14px 0;padding:11px 12px;border:1px solid #423721;border-radius:12px;background:#15120d;color:#d7c297}.controls{display:grid;gap:10px}.actions{display:flex;flex-wrap:wrap;gap:8px}.outcome{display:grid;grid-template-columns:1fr auto;gap:8px}.flash{margin:10px 0;padding:10px;border-radius:10px;background:#16191e;color:#b6bdc8}.flash.ok{color:#9be2ae}.flash.bad{color:#f3a2a7}
@media(max-width:760px){main{padding-top:18px}.top{display:block}.pill{display:inline-block;margin-top:12px}.queuebar{grid-template-columns:1fr}.filters{display:grid;grid-template-columns:1fr 1fr}.filters .select{width:100%;min-width:0}.metrics{justify-content:flex-start}.metric{flex:1}.grid{grid-template-columns:1fr}.facts{grid-template-columns:1fr}.search,.outcome{grid-template-columns:1fr}.search .btn{width:100%}.actions .btn{flex:1 1 calc(50% - 8px)}}
</style>
</head>
<body>
<main>
<header class="top">
<div><div class="eyebrow">MMD PRIVÉ · OWNER / OPERATOR</div><h1>Recovery Control</h1><p>Case เดียวกันสำหรับ MMD Shop, Booking และ MMS — ควบคุม workflow state/outcome โดยไม่เขียนทับ business truth ของระบบต้นทาง</p></div>
<div class="pill">Taxonomy ${taxonomy}<br>SLA ${slaVersion}<br>Assignment ${assignmentVersion}</div>
</header>
<form class="search" data-search>
<input name="case_ref" value="${initialCaseRef}" placeholder="HYPE-PER-YYYYMMDDHHMMSS-xxxxxxxx" autocomplete="off" spellcheck="false">
<button class="btn primary" type="submit">เปิด Case</button>
</form>
<section class="queuebar">
<div class="filters">
<select class="select" data-domain><option value="all">ทุก Domain</option><option value="mmd_shop">MMD Shop</option><option value="booking">Booking</option><option value="mms">MMS</option><option value="unclassified">Unclassified</option></select>
<select class="select" data-state><option value="open">Open ทั้งหมด</option><option value="prepared">Prepared</option><option value="sent">Sent</option><option value="acknowledged">Acknowledged</option><option value="reviewing">Reviewing</option><option value="resolved">Resolved / รอแจ้งลูกค้า</option><option value="customer_notified">Customer notified</option><option value="all">ทุก State</option></select>
<select class="select" data-assignment><option value="all">ทุก Assignment</option><option value="unassigned">ยังไม่มีคนรับ</option><option value="assigned">มีคนรับแล้ว</option></select>
</div>
<div class="metrics" data-metrics></div>
</section>
<div class="grid">
<section class="panel"><h2>Recent Recovery Cases</h2><div data-list class="empty">กำลังโหลด…</div></section>
<section class="panel"><div data-detail class="empty">เลือก Case ทางซ้าย หรือใส่ Case Ref ด้านบน</div></section>
</div>
</main>
<script>
(function(){
"use strict";
var API="/v1/admin/recovery/cases";
var list=document.querySelector("[data-list]");
var detail=document.querySelector("[data-detail]");
var form=document.querySelector("[data-search]");
var domain=document.querySelector("[data-domain]");
var state=document.querySelector("[data-state]");
var assignment=document.querySelector("[data-assignment]");
var metrics=document.querySelector("[data-metrics]");
var selected="";
domain.value="${initialDomain}";
state.value="${initialState}";
assignment.value="${initialAssignment}";
function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function fmt(v){if(!v)return "—";var d=new Date(v);return isNaN(d)?esc(v):new Intl.DateTimeFormat("th-TH",{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(d)}
function age(v){var n=Number(v);if(!Number.isFinite(n))return "—";if(n<60)return n+" นาที";if(n<1440)return Math.floor(n/60)+"ชม. "+(n%60)+"น.";return Math.floor(n/1440)+"วัน "+Math.floor((n%1440)/60)+"ชม."}
function renderMetrics(q){q=q||{};metrics.innerHTML='<div class="metric"><span>Open</span><strong>'+esc(q.open_count||0)+'</strong></div><div class="metric"><span>Attention</span><strong>'+esc(q.attention_count||0)+'</strong></div><div class="metric"><span>Unassigned</span><strong>'+esc(q.unassigned_count||0)+'</strong></div><div class="metric"><span>Overdue</span><strong>'+esc(q.overdue_count||0)+'</strong></div>'}
function correlation(c,d){c=c||{};if(!c.correlated)return "ยังไม่ bind canonical reference";if(d==="mmd_shop")return "Order "+esc(c.order_id||"—")+" · payment "+esc(c.payment_status||"unknown")+" · fulfillment "+esc(c.fulfillment_state||"unknown");if(d==="booking")return "Booking "+esc(c.booking_ref||"—")+" · Session "+esc(c.session_id||"—")+" · Job "+esc(c.job_id||"—")+" · "+esc(c.job_state||c.session_state||"unknown");if(d==="mms")return "MMS "+esc(c.prebooking_id||"—")+" · "+esc(c.prebooking_status||"unknown")+" · "+esc(c.service_date||"—")+" "+esc(c.service_time||"");return "—"}
function opts(rows,current){return (rows||[]).map(function(x){return '<option value="'+esc(x.code)+'"'+(x.code===current?' selected':'')+'>'+esc(x.label)+" · "+esc(x.code)+"</option>"}).join("")}
function renderList(rows){if(!rows||!rows.length){list.className="empty";list.textContent="ไม่พบ Recovery Case ตาม filter นี้";return}list.className="list";list.innerHTML=rows.map(function(x){var s=x.sla||{},a=x.age||{},m=x.assignment||{};var owner=m.status==="assigned"?(m.assignee_label||"Assigned"):"Unassigned";return '<button class="case-row '+(x.case_ref===selected?"active":"")+'" data-ref="'+esc(x.case_ref)+'"><strong>'+esc(x.customer&&x.customer.display_name||"Canonical Client")+"</strong><span>"+esc(x.domain)+" · "+esc(x.state)+" · "+esc(x.outcome_label||x.outcome_code)+'</span><span class="queue-meta"><span class="badge '+esc(s.status||"")+'">SLA '+esc(s.status||"unknown")+'</span><span class="badge">Age '+age(a.minutes)+'</span><span class="badge">'+esc(owner)+'</span></span><span class="ref">'+esc(x.case_ref)+"</span></button>"}).join("");list.querySelectorAll("[data-ref]").forEach(function(b){b.onclick=function(){openCase(b.getAttribute("data-ref"))}})}
function renderCase(x){selected=x.case_ref;var ctl=x.controls||{},non=ctl.nonterminal_outcomes||[],term=ctl.terminal_outcomes||[],m=x.assignment||{};var assignee=m.status==="assigned"?(m.assignee_label||"Assigned"):"ยังไม่มีคนรับ";detail.className="";detail.innerHTML=
'<div class="headline"><div><div class="eyebrow">'+esc(x.domain)+"</div><h2>"+esc(x.customer&&x.customer.display_name||"Canonical Client")+'</h2><div class="ref">'+esc(x.case_ref)+'</div></div><span class="status">'+esc(x.state)+"</span></div>"+
'<div class="facts"><div class="fact"><span>Outcome</span><strong>'+esc(x.outcome_label||x.outcome_code||"—")+'</strong></div><div class="fact"><span>Updated</span><strong>'+fmt(x.updated_at)+'</strong></div><div class="fact"><span>Case age</span><strong>'+age(x.age&&x.age.minutes)+'</strong></div><div class="fact"><span>Operational SLA</span><strong>'+esc(x.sla&&x.sla.status||"unknown")+" · update "+age(x.sla&&x.sla.since_update_minutes)+'</strong></div><div class="fact"><span>Assigned to</span><strong>'+esc(assignee)+(m.assignee_lane?" · "+esc(m.assignee_lane):"")+'</strong></div><div class="fact"><span>Claimed</span><strong>'+(m.claimed_at?fmt(m.claimed_at):"—")+'</strong></div><div class="fact"><span>Canonical correlation</span><strong>'+correlation(x.correlation,x.domain)+'</strong></div><div class="fact"><span>Next attention</span><strong>'+esc(x.next_attention||"inspect_case")+"</strong></div></div>"+
'<div class="rule">Assignment เป็น coordination metadata เท่านั้น ไม่เพิ่มสิทธิ์อนุมัติ และไม่ reset SLA. ก่อนทำ protected action ต้อง refresh Payment / Job / Fulfillment / MMS truth จาก authority ต้นทางเสมอ</div><div data-flash></div>'+
'<div class="controls"><div class="actions"><button class="btn primary" data-action="claim" '+(!ctl.can_claim?"disabled":"")+'>Claim Case</button><button class="btn" data-action="release" '+(!ctl.can_release?"disabled":"")+'>Release</button><button class="btn warn" data-action="takeover" '+(!ctl.can_takeover?"disabled":"")+'>Owner Takeover</button></div><div class="actions"><button class="btn" data-action="acknowledge" '+(!ctl.can_acknowledge?"disabled":"")+'>Acknowledge</button><button class="btn warn" data-action="review" '+(!ctl.can_review?"disabled":"")+'>Start Review</button><button class="btn good" data-action="customer_notified" '+(!ctl.can_mark_customer_notified?"disabled":"")+'>Customer Notified</button></div>'+
'<div class="outcome"><select class="select" data-nonterminal><option value="">เลือกสถานะระหว่างดำเนินการ</option>'+opts(non,x.outcome_terminal?"":x.outcome_code)+'</select><button class="btn" data-action="set_outcome" '+(!ctl.can_set_outcome?"disabled":"")+'>บันทึก Outcome</button></div>'+
'<div class="outcome"><select class="select" data-terminal><option value="">เลือกผลลัพธ์ก่อน Resolve</option>'+opts(term,x.outcome_terminal?x.outcome_code:"")+'</select><button class="btn bad" data-action="resolve" '+(!ctl.can_resolve?"disabled":"")+">Resolve Case</button></div></div>";
detail.querySelectorAll("[data-action]").forEach(function(b){b.onclick=function(){act(b.getAttribute("data-action"))}})}
async function getJson(u,opt){var r=await fetch(u,Object.assign({credentials:"include",headers:{accept:"application/json"},cache:"no-store"},opt||{}));if(r.status===401){location.href="/internal/admin/login?next="+encodeURIComponent(location.pathname+location.search);return null}var b=await r.json().catch(function(){return {ok:false,error:"invalid_response"}});if(!r.ok)throw b;return b}
async function refreshList(){try{var u=new URL(API,location.origin);u.searchParams.set("limit","12");u.searchParams.set("domain",domain.value||"all");u.searchParams.set("state",state.value||"open");u.searchParams.set("assignment",assignment.value||"all");var b=await getJson(u.toString());if(b){renderMetrics(b.queue);renderList(b.cases||[])}}catch(e){list.className="empty";list.textContent="โหลดรายการไม่สำเร็จ: "+(e.error||"unavailable")}}
async function openCase(ref){if(!ref)return;try{var b=await getJson(API+"?case_ref="+encodeURIComponent(ref));if(!b)return;renderCase(b.case);history.replaceState(null,"","?case_ref="+encodeURIComponent(ref));refreshList()}catch(e){detail.className="empty";detail.textContent="เปิด Case ไม่สำเร็จ: "+(e.error||"not_found")}}
async function act(action){var flash=detail.querySelector("[data-flash]"),outcome="";if(action==="set_outcome")outcome=(detail.querySelector("[data-nonterminal]").value||"");if(action==="resolve")outcome=(detail.querySelector("[data-terminal]").value||"");if((action==="set_outcome"||action==="resolve")&&!outcome){flash.className="flash bad";flash.textContent="กรุณาเลือก outcome ก่อน";return}flash.className="flash";flash.textContent="กำลังบันทึก…";try{var body={case_ref:selected,action:action};if(outcome)body.outcome_code=outcome;var b=await getJson(API,{method:"POST",headers:{"content-type":"application/json",accept:"application/json"},body:JSON.stringify(body)});if(!b)return;renderCase(b.case);refreshList()}catch(e){flash.className="flash bad";flash.textContent="ไม่สำเร็จ: "+(e.error||"transition_rejected")}}
form.addEventListener("submit",function(e){e.preventDefault();var ref=(new FormData(form).get("case_ref")||"").trim();if(ref)openCase(ref)});
domain.addEventListener("change",function(){refreshList()});
state.addEventListener("change",function(){refreshList()});
assignment.addEventListener("change",function(){refreshList()});
refreshList();var initial="${initialCaseRef}";if(initial)openCase(initial);
})();
</script>
</body>
</html>`;
}

export function renderRecoveryControlForbidden() {
  return '<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Recovery operator required</title></head><body style="background:#070809;color:#fff;font-family:system-ui;padding:40px"><h1>Recovery operator required</h1><p>หน้านี้ต้องใช้ credential-bound Owner / Admin session</p></body></html>';
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, function(char) {
    return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char];
  });
}

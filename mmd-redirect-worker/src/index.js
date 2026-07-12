/**
 * MMD Permanent Redirect Guard
 * Front gate for public routes, membership pages, and worker route ownership.
 */

export const CANONICAL_HOST = "mmdbkk.com";
export const CANONICAL_PROTOCOL = "https:";
export const MEMBER_DASHBOARD_UPSTREAM = "https://immigrate-worker.malemodel-bkk.workers.dev";
export const MEMBER_PAGES_UPSTREAM = "https://member-pages-worker.malemodel-bkk.workers.dev";
export const ADMIN_WORKER_UPSTREAM = "https://admin-worker.malemodel-bkk.workers.dev";
export const SIGIL_WORKER_UPSTREAM = "https://sigil.mmdbkk.com";
export const FRONT_GATE = "mmd-redirect-worker";
export const FRONT_VERSION = "20260710-member-apply-webflow-pass-through";
export const PUBLIC_BLACKCARD_PAGE = "public-blackcard";
export const SIGIL_APPLY_ROUTE_OWNER = "sigil-worker";

export const REDIRECT_HOSTS = new Set(["www.mmdbkk.com", "mmdbkk.com", "mmdprive.com", "www.mmdprive.com", "malemodel-bkk.workers.dev"]);
export const NEVER_TOUCH_HOSTS = new Set(["sigil.mmdbkk.com"]);
export const LINE_WEBHOOK_PATHS = new Set(["/webhooks/line", "/webhooks/line/", "/webhook/line", "/webhook/line/"]);
export const PUBLIC_BLACKCARD_PATHS = new Set(["/blackcard", "/blackcard/", "/blackcard/black-card", "/blackcard/black-card/"]);
export const WEBFLOW_MEMBER_PAGE_PATHS = new Set(["/member/promotion", "/member/promotion/", "/member/apply", "/member/apply/"]);
export const MEMBER_PAGE_PATHS = new Set(["/member/membership", "/member/membership/", "/member/profile", "/member/profile/", "/pay/membership", "/pay/membership/", "/pay/pending-verification", "/pay/pending-verification/", "/sigil/pay/renewal", "/sigil/pay/renewal/"]);
export const MEMBER_API_PATHS = new Set(["/member/api/liff/identify", "/member/api/liff/identify/"]);
export const NEVER_TOUCH_PREFIXES = ["/api/", "/webhook/", "/webhooks/", "/payments/", "/payment/", "/payment-webhook/", "/admin/", "/sigil/", "/cdn-cgi/", "/assets/", "/static/", "/uploads/"];
export const NEVER_REDIRECT_EXACT_PATHS = new Set(["/member/promotion", "/member/promotion/", "/member/apply", "/member/apply/", "/member/dashboard", "/member/dashboard/", "/member/membership", "/member/membership/", "/member/profile", "/member/profile/", "/member/payments", "/member/payments/", "/pay/membership", "/pay/membership/", "/pay/pending-verification", "/pay/pending-verification/", "/sigil/pay/membership", "/sigil/pay/membership/", "/sigil/pay/renewal", "/sigil/pay/renewal/", "/hall", "/hall/", "/model/console", "/model/console/", "/blackcard", "/blackcard/", "/blackcard/black-card", "/blackcard/black-card/"]);
export const EXACT_PATH_REDIRECTS = { "/trust/inme": "/sigil/start", "/inme": "/sigil/start", "/login": "/sigil/start", "/member": "/member/dashboard", "/member/membership/benefits": "/member/membership", "/members": "/sigil/start", "/membership": "/member/membership", "/membership/benefits": "/member/membership", "/renew": "/sigil/membership", "/renewal": "/sigil/membership", "/trust": "/sigil/start" };
export const FOLDER_REDIRECTS = [{ from: "/old-academy/", to: "/academy/" }, { from: "/old-trust/", to: "/trust/" }];

export function isSafePageRequest(request) {
  const method = request.method.toUpperCase();
  return method === "GET" || method === "HEAD";
}

export function normalizePath(pathname) {
  let path = pathname || "/";
  path = path.replace(/\/{2,}/g, "/");
  if (path.length > 1) path = path.replace(/\/+$/g, "");
  return path || "/";
}

export function shouldNeverTouch(url) {
  if (NEVER_TOUCH_HOSTS.has(url.hostname)) return true;
  const pathname = url.pathname.toLowerCase();
  if (NEVER_REDIRECT_EXACT_PATHS.has(pathname)) return true;
  return NEVER_TOUCH_PREFIXES.some((prefix) => pathname === prefix.slice(0, -1) || pathname.startsWith(prefix));
}

export function findMappedPath(pathname) {
  const normalized = normalizePath(pathname);
  const key = normalized.toLowerCase();
  if (EXACT_PATH_REDIRECTS[key]) return EXACT_PATH_REDIRECTS[key];
  for (const rule of FOLDER_REDIRECTS) {
    if (key.startsWith(rule.from.toLowerCase())) return `${rule.to}${normalized.slice(rule.from.length)}`.replace(/\/{2,}/g, "/");
  }
  return normalized;
}

function withFrontGateHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("x-mmd-front-gate", FRONT_GATE);
  headers.set("x-mmd-front-version", FRONT_VERSION);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function withRouteOwnerHeaders(response, { owner, page, origin }) {
  const frontGateResponse = withFrontGateHeaders(response);
  frontGateResponse.headers.set("x-mmd-route-owner", owner);
  frontGateResponse.headers.set("x-mmd-page", page);
  frontGateResponse.headers.set("x-mmd-origin", origin);
  return frontGateResponse;
}

function appendQuery(base, query, extra = {}) {
  const params = new URLSearchParams(query || "");
  Object.entries(extra).forEach(([k, v]) => { if (v != null && String(v).trim()) params.set(k, String(v)); });
  const rendered = params.toString();
  return rendered ? `${base}?${rendered}` : base;
}

async function fetchPassThrough(request) {
  return withFrontGateHeaders(await fetch(new Request(request, { redirect: "follow" })));
}

function isLineWebhookPath(url) { return LINE_WEBHOOK_PATHS.has(url.pathname.toLowerCase()); }
function isBlackcardPublicPath(url) { return PUBLIC_BLACKCARD_PATHS.has(url.pathname.toLowerCase()); }
function isWebflowMemberPagePath(url) { return WEBFLOW_MEMBER_PAGE_PATHS.has(url.pathname.toLowerCase()); }
function isSigilApplyPath(url) { const p = url.pathname.toLowerCase(); return p === "/sigil/apply" || p === "/sigil/apply/"; }
function isSigilPrivateModelApplyApiPath(url) { const p = url.pathname.toLowerCase(); return p === "/sigil/api/private-model/apply" || p === "/sigil/api/private-model/apply/"; }
function isSigilMembershipPath(url) { const p = url.pathname.toLowerCase(); return p === "/sigil/membership" || p === "/sigil/membership/"; }
function isMemberApplyPath(url, pathname = url.pathname) { const p = normalizePath(pathname).toLowerCase(); return p === "/member/apply"; }
function isMemberDashboardPath(url) { const p = url.pathname.toLowerCase(); return p === "/member/dashboard" || p === "/member/dashboard/"; }
function isMemberPagePath(url) { return MEMBER_PAGE_PATHS.has(url.pathname.toLowerCase()); }
function isMemberApiPath(url) { return MEMBER_API_PATHS.has(url.pathname.toLowerCase()); }
function isMemberPaymentsPath(url) { const p = url.pathname.toLowerCase(); return p === "/member/payments" || p === "/member/payments/"; }
function isHallPath(url) { const p = url.pathname.toLowerCase(); return p === "/hall" || p === "/hall/"; }
function isModelConsolePath(url) { const p = url.pathname.toLowerCase(); return p === "/model/console" || p === "/model/console/"; }
function isMemberPath(url) { const p = url.pathname.toLowerCase(); return p === "/member" || p === "/member/" || p.startsWith("/member/"); }
function isKnownLegacyMemberRedirect(url) { return Boolean(EXACT_PATH_REDIRECTS[normalizePath(url.pathname).toLowerCase()]); }

async function fetchLineWebhook(request, env = {}, url) {
  const upstream = String(env?.LINE_WEBHOOK_UPSTREAM_URL || "").trim();
  if (!upstream) return fetchPassThrough(request);
  const target = new URL(upstream);
  target.search = url.search;
  return withFrontGateHeaders(await fetch(new Request(target.toString(), request)));
}

async function fetchMemberFrontend(request, env, url) {
  if (env?.IMMIGRATE_WORKER?.fetch) return withFrontGateHeaders(await env.IMMIGRATE_WORKER.fetch(request));
  const target = new URL(MEMBER_DASHBOARD_UPSTREAM);
  target.pathname = url.pathname;
  target.search = url.search;
  return withFrontGateHeaders(await fetch(new Request(target.toString(), request)));
}

async function fetchMemberPage(request, env, url) {
  if (env?.MEMBER_PAGES_WORKER?.fetch) return withFrontGateHeaders(await env.MEMBER_PAGES_WORKER.fetch(request));
  const target = new URL(MEMBER_PAGES_UPSTREAM);
  target.pathname = url.pathname;
  target.search = url.search;
  return withFrontGateHeaders(await fetch(new Request(target.toString(), request)));
}

async function fetchAdminMemberPage(request, env, url) {
  if (env?.ADMIN_WORKER?.fetch) return withFrontGateHeaders(await env.ADMIN_WORKER.fetch(request));
  const target = new URL(ADMIN_WORKER_UPSTREAM);
  target.pathname = url.pathname;
  target.search = url.search;
  return withFrontGateHeaders(await fetch(new Request(target.toString(), request)));
}

async function fetchSigilWorkerRoute(request, env, url, page) {
  if (env?.SIGIL_WORKER?.fetch) return withRouteOwnerHeaders(await env.SIGIL_WORKER.fetch(request), { owner: SIGIL_APPLY_ROUTE_OWNER, page, origin: "service-binding:sigil-worker" });
  const target = new URL(SIGIL_WORKER_UPSTREAM);
  target.pathname = url.pathname;
  target.search = url.search;
  return withRouteOwnerHeaders(await fetch(new Request(target.toString(), request)), { owner: SIGIL_APPLY_ROUTE_OWNER, page, origin: SIGIL_WORKER_UPSTREAM });
}

function renderRouteRecoveryShell(request, page, title, heading, copy, links = []) {
  const query = new URL(request.url).search || "";
  const renderedLinks = links.map((link, i) => `<a${i === 0 ? " class=\"primary\"" : ""} href="${link.href}${query}">${link.label}</a>`).join("");
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title}</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;padding:22px;background:radial-gradient(circle at top left,#241907 0,#090705 36%,#050403 100%);color:#fff7e8;font-family:Inter,"Segoe UI","Noto Sans Thai",Arial,sans-serif}main{width:min(780px,100%);margin:0 auto;padding:28px 0 40px}.brand{margin:0 0 14px;color:#ffd784;font-size:13px;font-weight:900;text-transform:uppercase}h1{margin:0 0 16px;font-size:clamp(38px,12vw,76px);line-height:1}p{margin:0 0 16px;color:#fff1d5;font-size:17px;line-height:1.65}a{min-height:46px;display:inline-flex;align-items:center;justify-content:center;margin:8px 8px 0 0;padding:0 16px;border:1px solid #d8ad5a;border-radius:999px;color:#fff7e8;background:#17110a;text-decoration:none;font-weight:850}a.primary{color:#130d05;background:#ffd784;border-color:#ffd784}</style></head><body><main data-mmd-page-shell="${page}"><p class="brand">MMD Privé</p><h1>${heading}</h1><p>${copy}</p><p>${renderedLinks}</p></main></body></html>`;
  return new Response(request.method.toUpperCase() === "HEAD" ? null : html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store, no-cache, must-revalidate, max-age=0", "x-mmd-worker": FRONT_GATE, "x-mmd-front-gate": FRONT_GATE, "x-mmd-front-version": FRONT_VERSION, "x-mmd-page": page, "x-mmd-temporary-route": "true" } });
}

function renderPublicBlackcardPage(request) {
  const url = new URL(request.url);
  const query = url.search || "";
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>MMD Privé | Black Card</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#050404;color:#fff6df;font-family:Inter,"Segoe UI","Noto Sans Thai",Arial,sans-serif}.hero{min-height:100vh;display:grid;place-items:end start;padding:28px;background:linear-gradient(90deg,rgba(5,4,4,.86),rgba(5,4,4,.24)),url(https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a2e89da3f9feeabc206fa8c_SIGIL_Wall.webp) center/cover}.panel{width:min(760px,100%);padding:clamp(24px,5vw,54px);border:1px solid rgba(216,177,95,.25);border-radius:32px;background:rgba(8,7,6,.72);backdrop-filter:blur(18px);box-shadow:0 28px 90px rgba(0,0,0,.36)}.mark{width:54px;height:54px;object-fit:contain;margin-bottom:28px;filter:drop-shadow(0 10px 24px rgba(216,177,95,.22))}.kicker{color:#f4dd95;font-size:12px;font-weight:900;letter-spacing:.18em;text-transform:uppercase}h1{margin:10px 0 16px;font-size:clamp(46px,11vw,92px);line-height:.94;letter-spacing:-.05em}p{margin:0 0 14px;color:rgba(255,246,223,.78);font-size:17px;line-height:1.75}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}a{min-height:48px;display:inline-flex;align-items:center;justify-content:center;padding:0 18px;border-radius:999px;text-decoration:none;font-weight:850}.primary{color:#150f07;background:linear-gradient(135deg,#f7e6a8,#bd8730)}.ghost{color:#fff6df;border:1px solid rgba(216,177,95,.28);background:rgba(255,255,255,.06)}</style></head><body><main class="hero"><section class="panel"><img class="mark" src="https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a3f71e229504b27874227cd_MMD%20Logo%20Only.webp" alt="MMD"><p class="kicker">BLACK CARD PRIVILEGES</p><h1>สิทธิ์ที่ดีที่สุด<br>ของสมาชิก MMD</h1><p>Black Card คือระดับการดูแลที่เปิดให้สมาชิกเข้าถึงตัวเลือกมากกว่า เร็วกว่า และละเอียดกว่าการเป็นสมาชิกปกติ</p><p>สถานะจริงยังอ้างอิงจาก owner review, ledger และ official verification เท่านั้น หน้านี้ไม่มีการเปิดสิทธิ์อัตโนมัติ</p><div class="actions"><a class="primary" href="/member/membership${query}">ดูแพ็กเกจสมาชิก</a><a class="ghost" href="/member/dashboard${query}">Member Dashboard</a></div></section></main></body></html>`;
  return new Response(request.method.toUpperCase() === "HEAD" ? null : html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store, no-cache, must-revalidate, max-age=0", "x-mmd-worker": FRONT_GATE, "x-mmd-front-gate": FRONT_GATE, "x-mmd-front-version": FRONT_VERSION, "x-mmd-page": PUBLIC_BLACKCARD_PAGE, "x-mmd-route-owner": FRONT_GATE, "x-mmd-origin": "front-gate:public-blackcard-safe" } });
}

function renderKenjiMemberApplicationGate(request) {
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>Kenji Member Application Gate</title><style>:root{color-scheme:dark;--bg:#080706;--panel:#15110d;--ink:#fff8ea;--muted:#cdbf9f;--line:#3d3124;--gold:#e8c36b;--red:#ff8f8f;--green:#9be49f}*{box-sizing:border-box}body{margin:0;background:linear-gradient(160deg,#080706,#19120b 54%,#080706);color:var(--ink);font-family:Inter,"Segoe UI","Noto Sans Thai",Arial,sans-serif}main{min-height:100vh;padding:22px 16px 34px}.wrap{width:min(860px,100%);margin:0 auto}.brand{margin:0 0 10px;color:var(--gold);font-size:12px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}h1{margin:0 0 10px;font-size:clamp(34px,10vw,64px);line-height:1}.lead{margin:0 0 20px;color:var(--muted);font-size:16px;line-height:1.65}.steps{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin:0 0 16px}.step{height:8px;border-radius:999px;background:#342719}.step.on{background:var(--gold)}form{border:1px solid var(--line);border-radius:18px;background:rgba(21,17,13,.92);box-shadow:0 24px 80px rgba(0,0,0,.32);overflow:hidden}.pane{display:none;padding:18px}.pane.on{display:block}h2{margin:0 0 14px;font-size:22px}.grid{display:grid;gap:12px}.two{grid-template-columns:1fr}@media(min-width:720px){.two{grid-template-columns:1fr 1fr}.pane{padding:24px}}label{display:grid;gap:7px;color:var(--muted);font-size:13px;font-weight:800}input,select,textarea{width:100%;min-height:48px;border:1px solid var(--line);border-radius:12px;background:#0c0a08;color:var(--ink);padding:12px 13px;font:inherit}textarea{min-height:104px;resize:vertical}.choices{display:grid;grid-template-columns:1fr;gap:10px}@media(min-width:520px){.choices{grid-template-columns:repeat(3,1fr)}}.choice{position:relative}.choice input{position:absolute;opacity:0}.choice span{min-height:48px;display:flex;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:12px;background:#0c0a08;color:var(--ink);font-weight:900}.choice input:checked+span{border-color:var(--gold);background:#2c2112;color:#ffe6a6}.actions{display:flex;gap:10px;justify-content:space-between;border-top:1px solid var(--line);padding:14px 18px;background:#100d0a}button,a.btn{min-height:46px;border:0;border-radius:12px;padding:0 16px;font-weight:900;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}button{color:#130e06;background:var(--gold)}button.secondary,a.btn{border:1px solid var(--line);background:#0c0a08;color:var(--ink)}button[disabled]{opacity:.54}.note,.error,.success{margin:12px 0 0;padding:12px;border-radius:12px;line-height:1.5}.note{background:#0c0a08;color:var(--muted)}.error{display:none;background:#2a1010;color:#ffd4d4}.success{display:none;background:#102417;color:#d8ffe1}.review{display:grid;gap:8px}.review div{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid var(--line);padding:8px 0}.review strong{color:var(--muted);font-size:13px}.ref{font-size:22px;color:var(--green);font-weight:950}</style></head><body><main id="kenji-member-application-gate" data-api-base="https://sigil.mmdbkk.com" data-submit-path="/v1/member/applications" data-dashboard-url="/member/dashboard" data-membership-url="/member/membership" data-help-url="https://t.me/mmdapply"><div class="wrap"><p class="brand">MMD Privé</p><h1>Kenji Member Application Gate</h1><p class="lead">Apply for MMD membership with Kenji. Your draft is kept on this device until you submit.</p><div class="steps" aria-label="Application progress"><span class="step on"></span><span class="step"></span><span class="step"></span><span class="step"></span><span class="step"></span></div><form novalidate><section class="pane on" data-step="1"><h2>1. Identity</h2><div class="grid two"><label>Display name<input name="name" autocomplete="name" required></label><label>Age confirmation<select name="age" required><option value="">Choose</option><option value="over_20">I confirm I am 20+</option></select></label></div><p class="note">Use the same name Kenji should recognize during member review.</p></section><section class="pane" data-step="2"><h2>2. Contact channel</h2><div class="choices"><label class="choice"><input type="radio" name="channel" value="line" required><span>LINE</span></label><label class="choice"><input type="radio" name="channel" value="telegram" required><span>Telegram</span></label><label class="choice"><input type="radio" name="channel" value="email" required><span>Email</span></label></div><div class="grid"><label>Contact handle<input name="contact" autocomplete="email" required></label></div></section><section class="pane" data-step="3"><h2>3. Membership intent</h2><div class="grid"><label>What are you looking for?<textarea name="intent" minlength="20" required></textarea></label><label>Preferred timing<input name="timing" placeholder="Example: this week, next month" required></label></div></section><section class="pane" data-step="4"><h2>4. Private notes</h2><div class="grid"><label>Anything Kenji should know before review?<textarea name="notes" required></textarea></label><label>Referral, code, or promo<input name="referral"></label></div></section><section class="pane" data-step="5"><h2>5. Review and submit</h2><div class="review" aria-live="polite"></div><p class="error"></p><p class="success"></p></section><div class="actions"><button type="button" class="secondary" data-back disabled>Back</button><a class="btn" href="https://t.me/mmdapply">Help</a><button type="button" data-next>Next</button></div></form></div></main><script>(()=>{const root=document.querySelector("#kenji-member-application-gate");const form=root.querySelector("form");const panes=[...root.querySelectorAll(".pane")];const bars=[...root.querySelectorAll(".step")];const back=root.querySelector("[data-back]");const next=root.querySelector("[data-next]");const review=root.querySelector(".review");const error=root.querySelector(".error");const success=root.querySelector(".success");const storeKey="mmd.kenji.member.apply.v1";const params=new URLSearchParams(location.search);let step=0;function data(){return Object.fromEntries(new FormData(form).entries())}function save(){localStorage.setItem(storeKey,JSON.stringify(data()))}function load(){try{const saved=JSON.parse(localStorage.getItem(storeKey)||"{}");for(const [k,v]of Object.entries(saved)){const el=form.elements[k];if(!el)continue;if(el instanceof RadioNodeList){const picked=[...el].find(i=>i.value===v);if(picked)picked.checked=true}else el.value=v}for(const key of["t","code","promo"]){const v=params.get(key);if(v&&form.elements.referral&&!form.elements.referral.value)form.elements.referral.value=v}}catch(e){}}function show(){panes.forEach((p,i)=>p.classList.toggle("on",i===step));bars.forEach((b,i)=>b.classList.toggle("on",i<=step));back.disabled=step===0;next.textContent=step===panes.length-1?"Submit":"Next";error.style.display="none";success.style.display="none";if(step===4)renderReview()}function valid(){const fields=[...panes[step].querySelectorAll("input,select,textarea")];for(const field of fields){if(!field.checkValidity()){field.reportValidity();return false}}return true}function renderReview(){const d=data();review.innerHTML=[["Name",d.name],["Channel",d.channel],["Contact",d.contact],["Intent",d.intent],["Timing",d.timing],["Notes",d.notes],["Referral",d.referral||"None"]].map(([k,v])=>"<div><strong>"+k+"</strong><span>"+String(v||"").replace(/[<>]/g,"")+"</span></div>").join("")}async function submit(){error.style.display="none";success.style.display="none";next.disabled=true;next.textContent="Submitting";const endpoint=root.dataset.apiBase+root.dataset.submitPath;const payload={...data(),source:"member_apply",tracking:{t:params.get("t")||"",code:params.get("code")||"",promo:params.get("promo")||""}};try{const res=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});if(!res.ok)throw new Error("Application service is not ready yet.");let body={};try{body=await res.json()}catch(e){}const ref=body.reference||body.id||("KJ-"+Date.now().toString(36).toUpperCase());localStorage.removeItem(storeKey);success.innerHTML='Application received.<br><span class="ref">'+ref+"</span>";success.style.display="block"}catch(e){error.textContent=e.message||"Please try again or contact Kenji.";error.style.display="block"}finally{next.disabled=false;next.textContent="Submit"}}form.addEventListener("input",save);back.addEventListener("click",()=>{step=Math.max(0,step-1);show()});next.addEventListener("click",()=>{if(!valid())return;save();if(step<panes.length-1){step+=1;show();return}submit()});load();show()})();</script></body></html>`;
  return new Response(request.method.toUpperCase() === "HEAD" ? null : html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store, no-cache, must-revalidate, max-age=0", "x-mmd-worker": FRONT_GATE, "x-mmd-front-gate": FRONT_GATE, "x-mmd-front-version": FRONT_VERSION, "x-mmd-page": "kenji-member-application-gate", "x-mmd-route-owner": FRONT_GATE, "x-mmd-origin": "front-gate:kenji-member-application-gate", "x-mmd-apply-owner-fix": "phase-apply-guard-v2" } });
}

function renderHallRecovery(request) { return renderRouteRecoveryShell(request, "hall", "MMD Privé | Hall", "MMD Hall", "พื้นที่กลางสำหรับเข้าสู่ระบบสมาชิก ตรวจสถานะ และไปต่อยังเส้นทางที่เกี่ยวข้องของ MMD Privé", [{ label: "Enter Member Area", href: "/member/dashboard" }, { label: "Member Payments", href: "/member/payments" }]); }
function renderModelConsoleRecovery(request) { return renderRouteRecoveryShell(request, "model-console", "MMD Privé | Model Console", "Model Console", "พื้นที่สำหรับผู้ให้บริการตรวจสถานะงานและไปต่อยังขั้นตอนที่เกี่ยวข้องของ MMD Privé", [{ label: "Continue", href: "/v1/model/session/dashboard" }, { label: "Member Area", href: "/member/dashboard" }]); }
function renderMemberStaticRecovery(request) { return renderRouteRecoveryShell(request, "member-static", "MMD Privé | Member", "Member Page", "หน้านี้อยู่ในพื้นที่สมาชิกของ MMD Privé และพร้อมเชื่อมต่อกับเนื้อหาหลักในขั้นต่อไป", [{ label: "Enter Member Area", href: "/member/dashboard" }, { label: "Membership", href: "/member/membership" }]); }

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    const normalizedPathname = normalizePath(url.pathname);
    if (isMemberApplyPath(url, normalizedPathname)) return renderKenjiMemberApplicationGate(request);
    if (isLineWebhookPath(url)) return fetchLineWebhook(request, env, url);
    if (isSigilPrivateModelApplyApiPath(url)) return fetchSigilWorkerRoute(request, env, url, "sigil-private-model-apply-api");
    if (isMemberApiPath(url)) return fetchMemberPage(request, env, url);
    if (!isSafePageRequest(request)) return withFrontGateHeaders(await fetch(request));
    if (isBlackcardPublicPath(url)) return renderPublicBlackcardPage(request);
    if (isSigilApplyPath(url)) return fetchSigilWorkerRoute(request, env, url, "sigil-private-model-setup");
    if (isSigilMembershipPath(url)) return fetchMemberPage(request, env, url);
    if (isMemberDashboardPath(url)) return fetchMemberFrontend(request, env, url);
    if (isWebflowMemberPagePath(url)) return fetchPassThrough(request);
    if (isMemberPagePath(url)) return fetchMemberPage(request, env, url);
    if (isMemberPaymentsPath(url)) return fetchAdminMemberPage(request, env, url);
    if (isHallPath(url)) return renderHallRecovery(request);
    if (isModelConsolePath(url)) return renderModelConsoleRecovery(request);
    if (isMemberPath(url) && !isMemberApplyPath(url, normalizedPathname) && !isKnownLegacyMemberRedirect(url)) return renderMemberStaticRecovery(request);
    if (shouldNeverTouch(url)) return fetchPassThrough(request);
    if (!REDIRECT_HOSTS.has(url.hostname)) return fetchPassThrough(request);

    const mappedPath = findMappedPath(url.pathname);
    const target = new URL(url.toString());
    target.protocol = CANONICAL_PROTOCOL;
    target.hostname = CANONICAL_HOST;
    target.pathname = mappedPath;
    const needsRedirect = url.protocol !== CANONICAL_PROTOCOL || url.hostname !== CANONICAL_HOST || url.pathname !== mappedPath;
    if (!needsRedirect || target.toString() === url.toString()) return fetchPassThrough(request);
    return withFrontGateHeaders(Response.redirect(target.toString(), 301));
  },
};

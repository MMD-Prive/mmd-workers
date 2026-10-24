import canonicalWorker from "./control-room-dashboard-ingress-wrapper";
import { decorateInternalSilverTheme } from "./internal-silver-theme";
import { CUSTOMER_360_LIVE_CLIENT } from "./customer-360-live-client";
import { CUSTOMER_IDENTITY_ALIGNMENT_CLIENT } from "./customer-identity-alignment-client";
import { CUSTOMER_IDENTITY_EVIDENCE_PROTOCOL_CLIENT } from "./customer-identity-evidence-protocol-client";
import { augmentClientIntelligenceWithIdentityAlignment } from "./customer-identity-alignment";
import type { Env } from "./types";

const CUSTOMER_PAGE = "/internal/admin/customer-data";
const MEMBERSHIP_ACCESS_PAGE = "/internal/admin/membership-access";
const CUSTOMER_QUEUE = "/v1/admin/customer-data/queue";
const CLIENT_INTELLIGENCE = "/v1/admin/clients/intelligence";
const CREATE_JOB_PAGE = "/internal/admin/jobs/create-job";
const CANONICAL_PUBLIC_ORIGIN = "https://mmdbkk.com";
const DEFAULT_LOVABLE_ORIGIN = "https://mmd-os.lovable.app";
const WORKERS_DEV_SUFFIX = ".workers.dev";
const SAFE_MEMBERSHIP_CONTEXT_KEYS = ["plan", "package", "tier", "code", "promo", "src", "campaign", "from"];

type LovableEnv = Env & { INTERNAL_LOVABLE_ORIGIN?: string };

export function resolveRequestedClientId(searchParams: URLSearchParams): string {
  const clientIds = searchParams.getAll("client_id");
  return clientIds.length === 1 ? String(clientIds[0] || "").trim() : "";
}

function normalizePath(value: string): string {
  const path = String(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function workersDevCanonicalHandoff(url: URL, path: string): Response | null {
  if (!url.hostname.endsWith(WORKERS_DEV_SUFFIX)) return null;

  const directPublicPaths = new Set([
    "/member/dashboard",
    "/sigil/member/membership",
    "/member/payments",
  ]);
  if (directPublicPaths.has(path)) {
    const target = new URL(path, CANONICAL_PUBLIC_ORIGIN);
    target.search = url.search;
    target.hash = url.hash;
    return Response.redirect(target.toString(), 308);
  }

  if (path === "/sigil/pay/renew") {
    const target = new URL("/sigil/pay/renewal", CANONICAL_PUBLIC_ORIGIN);
    target.search = url.search;
    target.hash = url.hash;
    return Response.redirect(target.toString(), 308);
  }

  const token = String(url.searchParams.get("t") || "").trim();
  if (path === "/sigil/pay/membership" || path === "/pay/membership") {
    if (token) {
      const target = new URL("/sigil/pay", CANONICAL_PUBLIC_ORIGIN);
      target.searchParams.set("t", token);
      return Response.redirect(target.toString(), 308);
    }
    const target = new URL("/sigil/member/membership", CANONICAL_PUBLIC_ORIGIN);
    for (const key of SAFE_MEMBERSHIP_CONTEXT_KEYS) {
      const value = url.searchParams.get(key);
      if (value) target.searchParams.set(key, value);
    }
    target.hash = url.hash;
    return Response.redirect(target.toString(), 308);
  }

  if (path === "/sigil/pay/payment") {
    if (token) {
      const target = new URL("/sigil/pay", CANONICAL_PUBLIC_ORIGIN);
      target.searchParams.set("t", token);
      return Response.redirect(target.toString(), 308);
    }
    return Response.redirect(`${CANONICAL_PUBLIC_ORIGIN}/member/payments`, 308);
  }

  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const method = request.method.toUpperCase();
    const publicHandoff = method === "GET" || method === "HEAD"
      ? workersDevCanonicalHandoff(url, path)
      : null;
    if (publicHandoff) return publicHandoff;

    const response = await decorateInternalSilverTheme(request, await canonicalWorker.fetch(request, env));
    if ((method === "GET" || method === "HEAD") && path === CREATE_JOB_PAGE) {
      // Incident hotfix 2026-09-28: restore the canonical Worker-rendered Create Job
      // surface. The Lovable presentation cutover introduced production usability
      // regressions shortly after 18:00 Asia/Bangkok. Keep the admin gate and
      // canonical create flow intact by returning the canonical Worker response.
      return response;
    }
    if (method === "GET" && path === CUSTOMER_PAGE) {
      if (!url.searchParams.has("client_id")) return decorateCustomerDirectoryQuery(renderCustomerDirectory(response));
      const isLovable = response.headers.get("x-mmd-presentation-source") === "lovable";
      // The Lovable directory owns its list UI. Legacy exact-client decorators
      // require a different HTML contract; explicit client scopes still fail closed.
      const scope = isLovable && !url.searchParams.has("client_id")
        ? null
        : resolveRequestedClientId(url.searchParams);
      return decorateCustomer360Page(response, scope);
    }
    if (method === "GET" && path === MEMBERSHIP_ACCESS_PAGE) {
      return decorateMembershipAccessPage(response);
    }
    if (method === "GET" && path === CUSTOMER_QUEUE) {
      return redactCustomerQueueResponse(response);
    }
    if (method === "GET" && path === CLIENT_INTELLIGENCE) {
      const clientId = resolveRequestedClientId(url.searchParams) || "";
      const augmented = await augmentClientIntelligenceWithIdentityAlignment(
        response,
        env,
        clientId,
      );
      return enforceExactCanonicalClientScope(augmented, clientId);
    }
    return response;
  },
};

export async function serveLovableCreateJobPage(request: Request, gateResponse: Response, env: LovableEnv): Promise<Response> {
  // Preserve the canonical Worker gate. If the admin session is missing, expired,
  // or forbidden, return that response exactly and do not fetch Lovable.
  if (!gateResponse.ok || !(gateResponse.headers.get("content-type") || "").includes("text/html")) return gateResponse;

  const origin = String(env.INTERNAL_LOVABLE_ORIGIN || DEFAULT_LOVABLE_ORIGIN).replace(/\/+$/, "");
  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, origin);

  try {
    const upstream = await fetch(target.toString(), {
      method: request.method.toUpperCase() === "HEAD" ? "HEAD" : "GET",
      headers: { accept: request.headers.get("accept") || "text/html" },
      redirect: "follow",
    });
    if (!upstream.ok) return gateResponse;

    const type = String(upstream.headers.get("content-type") || "").toLowerCase();
    if (!type.includes("text/html")) return gateResponse;

    const headers = new Headers(upstream.headers);
    headers.delete("set-cookie");
    headers.delete("content-length");
    headers.delete("content-security-policy");
    headers.delete("content-security-policy-report-only");
    headers.delete("cross-origin-embedder-policy");
    headers.delete("cross-origin-opener-policy");
    headers.delete("cross-origin-resource-policy");
    headers.set("cache-control", "no-store, no-cache, must-revalidate");
    headers.set("content-security-policy", buildCreateJobContentSecurityPolicy(origin));
    headers.set("x-robots-tag", "noindex, nofollow, noarchive");
    headers.set("x-mmd-presentation-source", "lovable");
    headers.set("x-mmd-presentation-version", "internal-lovable-v1");
    headers.set("x-mmd-page", "create-job");
    headers.set("x-mmd-create-job-worker-guide", "separate-job-board-v1");

    if (request.method.toUpperCase() === "HEAD") return new Response(null, { status: 200, headers });

    const html = decorateCreateJobGuidance(rewriteLovableAssetUrls(await upstream.text(), origin));
    return new Response(html, { status: 200, headers });
  } catch {
    return gateResponse;
  }
}

function buildCreateJobContentSecurityPolicy(origin: string): string {
  // Lovable is rendered inside mmdbkk.com but its JS/CSS chunks still live on the
  // Lovable origin. Do not forward Lovable's own CSP, because a strict self-only
  // policy makes the page look loaded while click handlers never hydrate.
  const connect = ["'self'", CANONICAL_PUBLIC_ORIGIN, "https://www.mmdbkk.com", origin].join(" ");
  const assets = ["'self'", origin, "https:", "data:", "blob:"].join(" ");
  return [
    `default-src 'self' ${origin}`,
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${origin}`,
    `style-src 'self' 'unsafe-inline' ${origin}`,
    `connect-src ${connect}`,
    `img-src ${assets}`,
    `font-src ${assets}`,
    `media-src ${assets}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
  ].join("; ");
}

function rewriteLovableAssetUrls(html: string, origin: string): string {
  return html
    .replace(/(["'])\/assets\//g, `$1${origin}/assets/`)
    .replace(/url\((["']?)\/assets\//g, `url($1${origin}/assets/`);
}

export function applyCreateJobClientAutoSearch(html: string): string {
  if (html.includes('data-mmd-create-job-client-search="v2"')) return html;
  const bridge = `<style data-mmd-create-job-client-search-style="v2">
/* On Create Job, the header search is the Client search. Keep the React input mounted
   for state ownership, but remove the duplicate visible field from Step 01. */
section[aria-labelledby="step-client-heading"] > div:has(> input[aria-label="Search client"]){position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;white-space:nowrap!important}
section[aria-labelledby="step-client-heading"] > div:has(> input[aria-label="Search client"]) + p{display:none!important}
</style>
<script data-mmd-create-job-client-search="v2">
(()=>{if(window.__mmdCreateJobHeaderSearchV2)return;window.__mmdCreateJobHeaderSearchV2=true;
const headerSelector='input[aria-label^="ค้นหาลูกค้า —"]';
const clientSelector='input[aria-label="Search client"]';
let timer=0,last="";
const setReactValue=(input,value)=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(setter)setter.call(input,value);else input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}))};
const submitClient=(value)=>{const q=String(value||'').trim(),client=document.querySelector(clientSelector);if(!client||!q||q===last)return;last=q;setReactValue(client,q);client.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,cancelable:true}))};
document.addEventListener('input',(event)=>{const input=event.target instanceof HTMLInputElement&&event.target.matches(headerSelector)?event.target:null;if(!input||event.isComposing)return;clearTimeout(timer);const value=input.value.trim();if(!value){last='';const client=document.querySelector(clientSelector);if(client)setReactValue(client,'');return}timer=setTimeout(()=>submitClient(input.value),320)},true);
document.addEventListener('keydown',(event)=>{const input=event.target instanceof HTMLInputElement&&event.target.matches(headerSelector)?event.target:null;if(!input||event.key!=='Enter')return;event.preventDefault();event.stopPropagation();clearTimeout(timer);last='';submitClient(input.value)},true);
document.addEventListener('submit',(event)=>{const form=event.target instanceof HTMLFormElement?event.target:null;const input=form?.querySelector(headerSelector);if(!input)return;event.preventDefault();event.stopPropagation();clearTimeout(timer);last='';submitClient(input.value)},true);
})();
</script>`;
  return html.includes("</body>") ? html.replace("</body>", `${bridge}</body>`) : `${html}${bridge}`;
}

export function applyCreateJobStaticCopy(html: string): string {
  const rewritten = html
    .replace(/\bBLOCKED\b/g, "กำลังเตรียม")
    .replace(/Creation blocked/g, "ขั้นตอนถัดไป")
    .replace(/No client selected\./g, "เริ่มจากค้นหาลูกค้าก่อน")
    .replace(/Canonical client not selected/g, "ค้นหาและเลือก canonical client")
    .replace(/Work type not selected/g, "เลือก Public หรือ Private")
    .replace(/Canonical model not selected/g, "เลือกโมเดล")
    .replace(/Date and start time required/g, "ใส่วันและเวลา")
    .replace(/Duration required/g, "ใส่ระยะเวลา")
    .replace(/Location required/g, "ใส่สถานที่")
    .replace(/Amount THB required/g, "ใส่ยอด THB");
  const style = `<style data-mmd-create-job-static-copy="v1">
/* Copy-only hotfix. No injected JS and no DOM mutation, so Lovable hydration stays intact. */
body::after{content:"เริ่มจากค้นหาลูกค้าก่อน — ไม่ต้องรู้ Client ID หรือ Session ID";position:fixed;z-index:2147483647;left:calc(50% - 260px);bottom:18px;max-width:520px;padding:10px 14px;border:1px solid rgba(216,180,94,.38);border-radius:999px;background:rgba(16,12,8,.92);color:#d8c29a;font:500 13px/1.45 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 14px 40px rgba(0,0,0,.28);pointer-events:none}
@media(max-width:720px){body::after{left:12px;right:12px;bottom:12px;max-width:none;border-radius:16px;text-align:center}}
</style>`;
  if (rewritten.includes("data-mmd-create-job-static-copy=\"v1\"")) return rewritten;
  return rewritten.includes("</head>") ? rewritten.replace("</head>", `${style}</head>`) : `${style}${rewritten}`;
}

export function applyCreateJobBoardPublishPanel(html: string): string {
  // Job Board is intentionally a separate owner surface at /internal/admin/jobs/job-board.
  // Keep this export as a no-op for compatibility with older tests/imports so a
  // future Lovable cutover cannot silently re-inject Job Board into Create Job.
  return html;
}

export function decorateCreateJobGuidance(html: string): string {
  return applyCreateJobClientAutoSearch(applyCreateJobStaticCopy(html));
}

export async function decorateCustomer360Page(response: Response, requestedClientId: string | null = null): Promise<Response> {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) return response;
  if (requestedClientId === null && response.headers.get("x-mmd-presentation-source") === "lovable") {
    return response;
  }
  let html = await response.text();
  if (requestedClientId !== null) {
    const defaultBoot = "load('review_required');summary()})();";
    const scopedBoot = "var requestedParams=new URLSearchParams(location.search),requestedIds=requestedParams.getAll('client_id'),requestedClientId=requestedIds.length===1?String(requestedIds[0]||'').trim():'',validClientScope=/^rec[A-Za-z0-9]{6,32}$/.test(requestedClientId);var queuePanel=q('.work aside'),summaryPanel=q('.summary'),guide=q('.memory-guide'),decision=q('.decision');if(queuePanel)queuePanel.hidden=true;if(summaryPanel)summaryPanel.hidden=true;if(guide)guide.hidden=true;if(decision)decision.hidden=true;if(q('[data-backfill]'))q('[data-backfill]').disabled=true;if(q('[data-refresh]'))q('[data-refresh]').disabled=true;q('[data-state]').textContent=validClientScope?'CANONICAL CLIENT':'CLIENT SCOPE LOCKED';if(!validClientScope){q('[data-empty]').hidden=false;q('[data-empty]').textContent='client_id ไม่ถูกต้องหรือไม่ชัดเจน · หยุดแบบ fail-closed และไม่เปิดคิวลูกค้ารายอื่น'}else{q('[data-list]').innerHTML='<div class=\"empty\">เปิดเฉพาะ Canonical Client ที่เลือก · กำลังตรวจ source scope</div>'}})();";
    if (!html.includes(defaultBoot)) return new Response("customer_scope_contract_unavailable", { status: 503, headers: { "cache-control": "no-store" } });
    html = html.replace(defaultBoot, scopedBoot).replace("</head>", "<style>[hidden]{display:none!important}</style></head>");
  }
  const liveScript = `<script data-mmd-customer-360-live-client="v1">${CUSTOMER_360_LIVE_CLIENT}</script>`;
  const alignmentScript = `<script data-mmd-customer-identity-alignment-client="v1">${CUSTOMER_IDENTITY_ALIGNMENT_CLIENT}</script>`;
  const protocolScript = `<script data-mmd-customer-identity-evidence-protocol-client="v1">${CUSTOMER_IDENTITY_EVIDENCE_PROTOCOL_CLIENT}</script>`;
  const scripts = `${liveScript}${alignmentScript}${protocolScript}`;
  const body = html.includes("</body>") ? html.replace("</body>", `${scripts}</body>`) : `${html}${scripts}`;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("cache-control", "no-store, private");
  headers.set("x-mmd-customer-360", "live-v1");
  headers.set("x-mmd-customer-intelligence", "read-only-v1");
  headers.set("x-mmd-customer-identity-alignment", "read-only-v1");
  headers.set("x-mmd-verified-identity-readiness", "read-only-v1");
  headers.set("x-mmd-identity-evidence-recovery", "read-only-v1");
  headers.set("x-mmd-identity-evidence-owner-review", "read-only-v1");
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

export async function decorateMembershipAccessPage(response: Response): Promise<Response> {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) return response;
  let html = await response.text();
  if (!html.includes('data-mmd-membership-client-handoff="v1"')) {
    const script = `<script data-mmd-membership-client-handoff="v1">(()=>{'use strict';const ids=new URL(location.href).searchParams.getAll('client_id'),id=ids.length===1?String(ids[0]||'').trim():'';if(!/^rec[A-Za-z0-9]{6,32}$/.test(id))return;const form=document.querySelector('[data-form]'),input=form&&form.querySelector('[data-query]'),list=document.querySelector('[data-list]');if(!form||!input||!list)return;const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(setter)setter.call(input,id);else input.value=id;input.dispatchEvent(new Event('input',{bubbles:true}));let done=false;const select=()=>{if(done)return;const row=Array.from(list.querySelectorAll('[data-id]')).find(node=>String(node.getAttribute('data-id')||'').trim()===id);if(row){done=true;observer.disconnect();row.click()}};const observer=new MutationObserver(select);observer.observe(list,{childList:true,subtree:true});form.requestSubmit?form.requestSubmit():form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));select();setTimeout(()=>observer.disconnect(),8000)})();</script>`;
    html = html.includes("</body>") ? html.replace("</body>", `${script}</body>`) : `${html}${script}`;
  }
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("cache-control", "no-store, private");
  headers.set("x-mmd-membership-client-handoff", "canonical-client-v1");
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}

export async function decorateCustomerDirectoryQuery(response: Response): Promise<Response> {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) return response;
  let html = await response.text();
  if (!html.includes('data-mmd-customer-directory-query="v1"')) {
    const script = `<script data-mmd-customer-directory-query="v1">(()=>{const values=new URL(location.href).searchParams.getAll('q'),value=values.length===1?String(values[0]||'').trim():'';if(!value)return;const form=document.getElementById('search'),input=document.getElementById('query');if(!form||!input)return;input.value=value;form.requestSubmit?form.requestSubmit():form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))})();</script>`;
    html = html.includes("</body>") ? html.replace("</body>", `${script}</body>`) : html.replace("</html>", `${script}</html>`);
  }
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}

export async function enforceExactCanonicalClientScope(response: Response, requestedClientId: string): Promise<Response> {
  if (!/^rec[A-Za-z0-9]{6,32}$/.test(requestedClientId)) {
    return Response.json({ ok: false, error: "invalid_client_scope" }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) return response;
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  const identity = payload?.identity && typeof payload.identity === "object"
    ? payload.identity as Record<string, unknown>
    : null;
  if (!payload || String(payload.client_id || "").trim() !== requestedClientId || String(identity?.status || "").trim() !== "canonical") {
    return Response.json({ ok: false, error: "client_scope_unresolved" }, { status: 409, headers: { "cache-control": "no-store" } });
  }
  return new Response(JSON.stringify(payload), { status: response.status, statusText: response.statusText, headers: response.headers });
}

export async function redactCustomerQueueResponse(response: Response): Promise<Response> {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) return response;
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!payload || payload.ok === false) return response;
  const cleanRecord = (value: unknown) => {
    if (!value || typeof value !== "object") return value;
    const record = { ...(value as Record<string, unknown>) };
    delete record.summary;
    delete record.raw_note;
    delete record.raw_notes;
    delete record.raw_line_notes;
    return record;
  };
  if (Array.isArray(payload.records)) payload.records = payload.records.map(cleanRecord);
  if (Array.isArray(payload.items)) payload.items = payload.items.map(cleanRecord);
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("cache-control", "no-store, private");
  headers.set("x-mmd-customer-queue-redaction", "raw-summary-removed-v1");
  return new Response(JSON.stringify(payload), { status: response.status, statusText: response.statusText, headers });
}

export { augmentClientIntelligenceWithIdentityAlignment } from "./customer-identity-alignment";

// Only replace a successfully authenticated Customer 360 HTML response.
// Explicit, invalid and repeated client scopes retain the exact-client guard.
export function renderCustomerDirectory(response: Response): Response {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html") || !response.headers.has("x-mmd-customer-data-ui")) return response;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("cache-control", "no-store, private");
  headers.set("x-mmd-customer-directory", "canonical-search-v1");
  return new Response("<!doctype html><html lang=\"th\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Customer 360 · SĪGIL</title><style>\n*{box-sizing:border-box}body{margin:0;background:#fff;color:#252a2e;font:16px/1.6 system-ui,sans-serif}main{max-width:860px;margin:auto;padding:24px 16px}a{color:#833c13}h1{margin:14px 0 4px}p{color:#555e65}form{display:flex;gap:8px}input,button{font:inherit;border:1px solid #c8cdd1;border-radius:10px;min-height:46px;padding:10px 14px}input{min-width:0;flex:1}button{background:#ffe0bf;color:#65300e;cursor:pointer}button:disabled{opacity:.65}#results{display:grid;gap:10px}#results a{display:block;border:1px solid #d8dde1;border-radius:12px;padding:14px;text-decoration:none;color:#252a2e}#results a:hover{background:#fff4e8}small{display:block;color:#5c6369}progress{width:100%;accent-color:#c66b26}footer{margin-top:24px;font-size:14px}</style><main><a href=\"/internal/admin/dashboard\">← หน้าหลัก</a><h1>Customer 360</h1><p>ค้นชื่อที่เปอร์ตั้ง ชื่อ LINE อีเมล หรือเบอร์ แล้วเลือกลูกค้าที่ต้องการ</p><form id=\"search\"><input id=\"query\" type=\"search\" aria-label=\"ค้นหาลูกค้า\" placeholder=\"ค้นหาลูกค้า\" maxlength=\"160\" required><button>ค้นหา</button></form><p id=\"status\" role=\"status\">พิมพ์ชื่อเพื่อเริ่มค้นหา</p><progress hidden aria-label=\"กำลังค้นหา\"></progress><section id=\"results\" aria-label=\"ผลการค้นหาลูกค้า\"></section><footer>เลือกลูกค้าก่อนเปิดประวัติหรือสร้างงาน</footer></main><script>\nconst form=document.getElementById('search'),input=document.getElementById('query'),status=document.getElementById('status'),results=document.getElementById('results'),progress=document.querySelector('progress');let sequence=0;\ninput.addEventListener('input',()=>{sequence++;results.replaceChildren();status.textContent='กดค้นหาเพื่อดูผลของชื่อนี้';progress.hidden=true;form.querySelector('button').disabled=false});\nform.addEventListener('submit',async e=>{e.preventDefault();const query=input.value.trim();if(!query)return;const seq=++sequence;results.replaceChildren();status.textContent='กำลังค้นหา…';progress.hidden=false;form.querySelector('button').disabled=true;\ntry{const r=await fetch('/v1/admin/clients/lineage-lookup',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({query,canonical_only:true})});const d=await r.json();if(seq!==sequence)return;if(!r.ok||d.ok===false)throw new Error(r.status===401||r.status===403?'เซสชันหมดอายุ กรุณาเข้าระบบใหม่':'ค้นหาไม่สำเร็จ กรุณาลองอีกครั้ง');const rows=(Array.isArray(d.items)?d.items:Array.isArray(d.records)?d.records:[]).filter(x=>/^rec[A-Za-z0-9]{6,32}$/.test(x.client_id||'')&&!x.manual_public_only);status.textContent=rows.length?'พบ '+rows.length+' รายการ · เลือกลูกค้าเพื่อเปิดรายละเอียด':'ยังไม่พบ ลองชื่อที่เปอร์ตั้งหรือชื่อ LINE';for(const x of rows){const a=document.createElement('a');a.href='/internal/admin/customer-data?client_id='+encodeURIComponent(x.client_id);const name=document.createElement('strong');name.textContent=x.client_name||x.canonical_name||x.remembered_name||x.line_display_name||'ลูกค้า';a.append(name);if(x.line_display_name){const detail=document.createElement('small');detail.textContent=x.line_display_name;a.append(detail)}results.append(a)}}catch(error){if(seq===sequence)status.textContent=error.message||'ค้นหาไม่สำเร็จ'}finally{if(seq===sequence){progress.hidden=true;form.querySelector('button').disabled=false}}});\n</script></html>", {status: response.status, headers});
}

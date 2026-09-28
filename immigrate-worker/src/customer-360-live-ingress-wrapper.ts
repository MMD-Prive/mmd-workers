import canonicalWorker from "./control-room-dashboard-ingress-wrapper";
import { CUSTOMER_360_LIVE_CLIENT } from "./customer-360-live-client";
import { CUSTOMER_IDENTITY_ALIGNMENT_CLIENT } from "./customer-identity-alignment-client";
import { CUSTOMER_IDENTITY_EVIDENCE_PROTOCOL_CLIENT } from "./customer-identity-evidence-protocol-client";
import { augmentClientIntelligenceWithIdentityAlignment } from "./customer-identity-alignment";
import type { Env } from "./types";

const CUSTOMER_PAGE = "/internal/admin/customer-data";
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

    const response = await canonicalWorker.fetch(request, env);
    if ((method === "GET" || method === "HEAD") && path === CREATE_JOB_PAGE) {
      return serveLovableCreateJobPage(request, response, env as LovableEnv);
    }
    if (method === "GET" && path === CUSTOMER_PAGE) {
      return decorateCustomer360Page(response, resolveRequestedClientId(url.searchParams));
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
    headers.set("x-mmd-create-job-worker-guide", "job-board-panel-v1");

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
  if (html.includes("data-mmd-job-board-panel=\"v1\"")) return html;
  const panel = `<section data-mmd-job-board-panel="v1" aria-label="Create Job Board Broadcast">
  <button type="button" data-mmd-board-toggle>กระดานข่าว</button>
  <form data-mmd-board-form hidden>
    <div class="mmdjb__head">
      <strong>Create กระดานข่าว</strong>
      <button type="button" data-mmd-board-close aria-label="Close">×</button>
    </div>
    <p>โพสต์รับสมัครลงกลุ่มบรอดงานก่อน ยังไม่ต้องเลือกโมเดล</p>
    <input name="title" maxlength="160" placeholder="หัวข้อ เช่น งานกินข้าว · สุขุมวิท · งานลับ" />
    <div class="mmdjb__row">
      <select name="world"><option value="private">Private</option><option value="public">Public</option></select>
      <input name="compensation" maxlength="120" placeholder="12,000 ถึงตัว" />
    </div>
    <div class="mmdjb__row">
      <input name="date" maxlength="80" placeholder="วัน พฤ 1 ต.ค. 69" />
      <input name="time" maxlength="80" placeholder="20:00" />
    </div>
    <div class="mmdjb__row">
      <input name="duration" maxlength="80" placeholder="3 ชม." />
      <input name="area" maxlength="120" placeholder="สุขุมวิท" />
    </div>
    <textarea name="board_text" maxlength="1000" required placeholder="วางข้อความบรอดงานที่นี่"></textarea>
    <button type="submit" data-mmd-board-submit>Publish + Copy Link</button>
    <output data-mmd-board-status>ยังไม่ได้ publish</output>
  </form>
</section>
<style data-mmd-job-board-panel-style="v1">
[data-mmd-job-board-panel]{position:fixed;z-index:2147483646;right:18px;bottom:78px;width:min(360px,calc(100vw - 24px));font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#f4ead6;pointer-events:none}
[data-mmd-board-toggle]{pointer-events:auto;width:100%;border:1px solid rgba(216,180,94,.52);border-radius:999px;background:linear-gradient(135deg,#d9b75e,#8c6b33);color:#130f09;font-weight:800;padding:12px 16px;box-shadow:0 18px 44px rgba(0,0,0,.34);cursor:pointer}
[data-mmd-board-form]{pointer-events:auto;margin-top:10px;border:1px solid rgba(216,180,94,.34);border-radius:22px;background:rgba(20,14,9,.97);box-shadow:0 24px 80px rgba(0,0,0,.46);padding:16px;display:flex;flex-direction:column;gap:10px}
[data-mmd-board-form][hidden]{display:none}
.mmdjb__head{display:flex;align-items:center;justify-content:space-between;gap:12px}.mmdjb__head strong{letter-spacing:.08em;color:#d9b75e}.mmdjb__head button{border:0;background:transparent;color:#d9b75e;font-size:24px;cursor:pointer}
[data-mmd-board-form] p{margin:0;color:#b7aa94;font-size:13px;line-height:1.45}[data-mmd-board-form] input,[data-mmd-board-form] select,[data-mmd-board-form] textarea{width:100%;box-sizing:border-box;border:1px solid rgba(216,180,94,.22);border-radius:14px;background:#080604;color:#f4ead6;padding:10px 12px;font:500 13px/1.45 inherit;outline:none}[data-mmd-board-form] textarea{min-height:150px;resize:vertical}.mmdjb__row{display:grid;grid-template-columns:1fr 1fr;gap:8px}[data-mmd-board-submit]{border:0;border-radius:16px;background:#d9b75e;color:#130f09;font-weight:900;padding:12px 14px;cursor:pointer}[data-mmd-board-status]{min-height:18px;color:#d8c29a;font-size:12px;line-height:1.45;word-break:break-word}
@media(max-width:720px){[data-mmd-job-board-panel]{left:12px;right:12px;bottom:70px;width:auto}.mmdjb__row{grid-template-columns:1fr}}
</style>
<script data-mmd-job-board-panel-script="v1">
(()=>{const root=document.querySelector('[data-mmd-job-board-panel]');if(!root||root.dataset.ready==='1')return;root.dataset.ready='1';const form=root.querySelector('[data-mmd-board-form]'),toggle=root.querySelector('[data-mmd-board-toggle]'),close=root.querySelector('[data-mmd-board-close]'),status=root.querySelector('[data-mmd-board-status]'),submit=root.querySelector('[data-mmd-board-submit]'),text=form?.elements?.board_text;const setStatus=(msg)=>{if(status)status.textContent=msg};toggle?.addEventListener('click',()=>{form.hidden=!form.hidden;if(!form.hidden)setTimeout(()=>text?.focus(),30)});close?.addEventListener('click',()=>{form.hidden=true});form?.addEventListener('submit',async(event)=>{event.preventDefault();const data=new FormData(form);const boardText=String(data.get('board_text')||'').trim();if(!boardText){setStatus('กรุณาวางข้อความกระดานข่าวก่อน');return}submit.disabled=true;setStatus('กำลัง publish กระดานข่าว...');const world=String(data.get('world')||'private');const payload={world,title:String(data.get('title')||'').trim()||'กระดานข่าวงาน',category:'owner_broadcast',board_text:boardText,customer_gender:'unspecified',budget_disclosure_approved:world==='private',media_count:8,compensation:String(data.get('compensation')||'').trim()||undefined,date:String(data.get('date')||'').trim()||undefined,time:String(data.get('time')||'').trim()||undefined,duration:String(data.get('duration')||'').trim()||undefined,area:String(data.get('area')||'').trim()||undefined};try{const res=await fetch('/v1/admin/job-board/publish',{method:'POST',credentials:'include',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify(payload)});const out=await res.json().catch(()=>null);if(!res.ok||!out?.broadcast_url)throw new Error(out?.error||'publish_failed');await navigator.clipboard?.writeText(out.broadcast_url).catch(()=>{});setStatus('Copy link แล้ว: '+out.broadcast_url)}catch(error){setStatus('ยังออกลิงก์ไม่ได้: '+(error?.message||error))}finally{submit.disabled=false}})})();
</script>`;
  return html.includes("</body>") ? html.replace("</body>", `${panel}</body>`) : `${html}${panel}`;
}

export function decorateCreateJobGuidance(html: string): string {
  return applyCreateJobClientAutoSearch(
    applyCreateJobBoardPublishPanel(applyCreateJobStaticCopy(html)),
  );
}

export async function decorateCustomer360Page(response: Response, requestedClientId: string | null = null): Promise<Response> {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) return response;
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
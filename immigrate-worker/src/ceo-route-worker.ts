const CEO_ROOT = "/internal/ceo";
const WEBFLOW_ORIGIN = "https://mmdprive.webflow.io";
const AI_OPS_CLIENT = "/v1/admin/ai-ops/client.js?v=2";

export function isCeoRoutePath(path: string): boolean {
  return path === CEO_ROOT || path.startsWith(`${CEO_ROOT}/`);
}

export function ceoRouteMethodNotAllowed(): Response {
  return Response.json(
    { ok: false, error: "ceo_route_method_not_allowed" },
    {
      status: 405,
      headers: {
        allow: "GET, HEAD",
        "cache-control": "no-store",
        "x-mmd-ceo-route-owner": "immigrate-worker",
      },
    },
  );
}

export function markCeoGateResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store");
  headers.set("x-mmd-ceo-route-owner", "immigrate-worker");
  headers.set("x-mmd-ceo-auth", "required");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function serveCeoRoute(request: Request): Promise<Response> {
  const incoming = new URL(request.url);
  const originUrl = new URL(`${incoming.pathname}${incoming.search}`, WEBFLOW_ORIGIN);
  const headers = new Headers({
    accept: request.headers.get("accept") || "text/html,application/xhtml+xml",
    "accept-language": request.headers.get("accept-language") || "th,en;q=0.8",
    "user-agent": request.headers.get("user-agent") || "MMD-CEO-Route-Worker/1.0",
  });

  const origin = await fetch(originUrl.toString(), {
    method: request.method === "HEAD" ? "HEAD" : "GET",
    headers,
    redirect: "manual",
  });

  if (origin.status >= 300 && origin.status < 400) {
    return rewriteOriginRedirect(request, origin);
  }

  const responseHeaders = new Headers(origin.headers);
  responseHeaders.delete("content-length");
  responseHeaders.set("cache-control", "no-store");
  responseHeaders.set("x-mmd-ceo-route-owner", "immigrate-worker");
  responseHeaders.set("x-mmd-ceo-origin", "webflow-proxy");
  responseHeaders.set("x-mmd-ceo-data-source", "/v1/admin/dashboard");
  responseHeaders.set("x-mmd-ai-ops-layer", "v2");

  if (request.method === "HEAD") {
    return new Response(null, {
      status: origin.status,
      statusText: origin.statusText,
      headers: responseHeaders,
    });
  }

  const contentType = origin.headers.get("content-type") || "";
  if (!origin.ok || !contentType.includes("text/html")) {
    return new Response(origin.body, {
      status: origin.status,
      statusText: origin.statusText,
      headers: responseHeaders,
    });
  }

  let html = await origin.text();
  if (incoming.pathname === CEO_ROOT) {
    html = injectBeforeBodyEnd(html, CEO_DASHBOARD_BRIDGE);
  }
  if (!html.includes(AI_OPS_CLIENT)) {
    html = injectBeforeBodyEnd(
      html,
      `<script src="${AI_OPS_CLIENT}" defer data-mmd-ai-ops-script="v2"></script>`,
    );
  }

  return new Response(html, {
    status: origin.status,
    statusText: origin.statusText,
    headers: responseHeaders,
  });
}

function rewriteOriginRedirect(request: Request, origin: Response): Response {
  const headers = new Headers(origin.headers);
  const raw = headers.get("location");
  if (raw) {
    const target = new URL(raw, WEBFLOW_ORIGIN);
    if (target.origin === WEBFLOW_ORIGIN && isCeoRoutePath(target.pathname)) {
      const publicUrl = new URL(request.url);
      publicUrl.pathname = target.pathname;
      publicUrl.search = target.search;
      publicUrl.hash = target.hash;
      headers.set("location", publicUrl.toString());
    }
  }
  headers.set("cache-control", "no-store");
  headers.set("x-mmd-ceo-route-owner", "immigrate-worker");
  return new Response(null, {
    status: origin.status,
    statusText: origin.statusText,
    headers,
  });
}

function injectBeforeBodyEnd(html: string, fragment: string): string {
  return html.includes("</body>") ? html.replace("</body>", `${fragment}</body>`) : `${html}${fragment}`;
}

const CEO_DASHBOARD_BRIDGE = String.raw`<script data-mmd-ceo-worker-bridge="v1">(()=>{'use strict';const root=document.getElementById('ceo28');if(!root)return;if(document.documentElement.dataset.mmdCeoWorkerBridge==='v1')return;document.documentElement.dataset.mmdCeoWorkerBridge='v1';const q=(s)=>root.querySelector(s),qa=(s)=>Array.from(root.querySelectorAll(s)),num=(v)=>Number.isFinite(Number(v))?Number(v):null,set=(s,v)=>qa(s).forEach(el=>el.textContent=v),fmt=(v)=>{const n=num(v);return n===null?'—':n.toLocaleString('th-TH')};function state(label,warn=false){const el=q('[data-api-state]');if(!el)return;el.textContent=label;el.classList.toggle('is-live',!warn);el.classList.toggle('is-warn',warn)}function renderList(sel,items,empty){const box=q(sel);if(!box)return;box.innerHTML='';const list=Array.isArray(items)?items:[];if(!list.length){const d=document.createElement('div');d.textContent=empty;box.appendChild(d);return}list.slice(0,5).forEach(x=>{const a=document.createElement('article'),b=document.createElement('strong'),p=document.createElement('p'),l=document.createElement('a');b.textContent=String(x.title||x.tag||'Review');p.textContent=String(x.text||x.detail||'');l.href=String(x.href||'/internal/admin/control-room');l.textContent='ไปทำต่อ ↗';a.append(b,p,l);box.appendChild(a)})}async function load(){state('CONNECTING');try{const r=await fetch('/v1/admin/dashboard',{credentials:'include',headers:{accept:'application/json'},cache:'no-store'}),t=await r.text();let d;try{d=t?JSON.parse(t):{}}catch{throw Error('dashboard returned non-JSON')}if(r.status===401||r.status===403){state('SESSION REQUIRED',true);return}if(!r.ok||d.ok===false)throw Error(d.error||('HTTP '+r.status));const c=d.counts||{};set('[data-count="slips"]',fmt(c.payments));set('[data-kpi="booking"]',fmt(c.jobs));set('[data-kpi="payment"]',fmt(c.payments));const u=q('[data-updated]');if(u)u.textContent=d.generated_at?'Updated '+new Date(d.generated_at).toLocaleString('th-TH'):'admin-worker connected';const ds=q('[data-daily-state]');if(ds)ds.textContent='LIVE · ADMIN-WORKER';const cs=q('[data-calendar-state]');if(cs)cs.textContent='WORKER CONNECTED';renderList('[data-daily-list]',d.todos,d.focus?.title||'ยังไม่มีรายการด่วนจาก admin-worker');renderList('[data-alert-list]',d.boss,d.focus?.text||'ไม่มี exception ที่ยืนยันจาก worker ตอนนี้');state('LIVE WORKER')}catch(e){state('WORKER UNAVAILABLE',true)}}const refresh=q('[data-refresh]');if(refresh)refresh.addEventListener('click',load);load()})();</script>`;

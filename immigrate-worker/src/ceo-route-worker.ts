const CEO_ROOT = "/internal/ceo";
const WEBFLOW_ORIGIN = "https://mmdprive.webflow.io";
const AI_OPS_CLIENT = "/v1/admin/ai-ops/client.js?v=3";

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
  headers.set("x-mmd-ceo-human-operator", "per");
  headers.set("x-mmd-ceo-mode", "single-owner-v1");
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
  responseHeaders.set("x-mmd-ceo-human-operator", "per");
  responseHeaders.set("x-mmd-ceo-mode", "single-owner-v1");
  responseHeaders.set("x-mmd-ai-ops-layer", "v3");

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
    html = injectBeforeBodyEnd(html, `${CEO_SINGLE_OWNER_LAYER}${CEO_DASHBOARD_BRIDGE}`);
  }
  if (!html.includes(AI_OPS_CLIENT)) {
    html = injectBeforeBodyEnd(
      html,
      `<script src="${AI_OPS_CLIENT}" defer data-mmd-ai-ops-script="v3"></script>`,
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
  headers.set("x-mmd-ceo-human-operator", "per");
  headers.set("x-mmd-ceo-mode", "single-owner-v1");
  return new Response(null, {
    status: origin.status,
    statusText: origin.statusText,
    headers,
  });
}

function injectBeforeBodyEnd(html: string, fragment: string): string {
  return html.includes("</body>") ? html.replace("</body>", `${fragment}</body>`) : `${html}${fragment}`;
}

const CEO_SINGLE_OWNER_LAYER = String.raw`<style data-mmd-ceo-single-owner-style="v1">#ceo28 [data-per-ceo-owner]{margin:10px 0 14px;padding:10px 12px;border:1px solid rgba(220,186,111,.22);border-radius:12px;background:rgba(220,186,111,.055);display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-family:-apple-system,BlinkMacSystemFont,"Noto Sans Thai",sans-serif}#ceo28 [data-per-ceo-owner] b{color:#d8b96f;font-size:9px;letter-spacing:.08em}#ceo28 [data-per-ceo-owner] span{color:#9b9286;font-size:9px;line-height:1.45}</style><script data-mmd-ceo-single-owner="v1">(()=>{'use strict';const root=document.getElementById('ceo28');if(!root)return;if(document.documentElement.dataset.mmdCeoSingleOwner==='v1')return;document.documentElement.dataset.mmdCeoSingleOwner='v1';const exact=(from,to)=>{const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];while(w.nextNode())nodes.push(w.currentNode);nodes.forEach(n=>{if(String(n.nodeValue||'').trim()===from)n.nodeValue=String(n.nodeValue||'').replace(from,to)})};if(!root.querySelector('[data-per-ceo-owner]')){const note=document.createElement('div');note.setAttribute('data-per-ceo-owner','v1');note.innerHTML='<b>PER · OWNER MODE</b><span>AI ช่วยอ่าน / สรุป / เช็กให้ · เปอร์เป็นคนตัดสินใจและยืนยันสุดท้าย · ไม่ต้องส่ง Review ให้ admin คนอื่น</span>';root.prepend(note)}[['Decision Pages','เรื่องที่ต้องตัดสินใจ'],['Decision pages','เรื่องที่ต้องตัดสินใจ'],['Operations Pages','หน้าทำงาน'],['Operations pages','หน้าทำงาน'],['SHARED AI OPS','AI ช่วยเปอร์'],['Shared AI Ops','AI ช่วยเปอร์'],['Review Payments','ตรวจ Payments'],['Review Models','ตรวจ Models'],['Review Membership Access','เช็ก Membership Access']].forEach(x=>exact(x[0],x[1]));Array.from(root.querySelectorAll('a[href="/internal/ceo/dashboard"]')).forEach(a=>a.href='/internal/ceo')})();</script>`;

const CEO_DASHBOARD_BRIDGE = String.raw`<script data-mmd-ceo-worker-bridge="v2">(()=>{'use strict';const root=document.getElementById('ceo28');if(!root)return;if(document.documentElement.dataset.mmdCeoWorkerBridge==='v2')return;document.documentElement.dataset.mmdCeoWorkerBridge='v2';const q=(s)=>root.querySelector(s),qa=(s)=>Array.from(root.querySelectorAll(s)),num=(v)=>Number.isFinite(Number(v))?Number(v):null,set=(s,v)=>qa(s).forEach(el=>el.textContent=v),fmt=(v)=>{const n=num(v);return n===null?'—':n.toLocaleString('th-TH')};function state(label,warn=false){const el=q('[data-api-state]');if(!el)return;el.textContent=label;el.classList.toggle('is-live',!warn);el.classList.toggle('is-warn',warn)}function renderList(sel,items,empty){const box=q(sel);if(!box)return;box.innerHTML='';const list=Array.isArray(items)?items:[];if(!list.length){const d=document.createElement('div');d.textContent=empty;box.appendChild(d);return}list.slice(0,5).forEach(x=>{const a=document.createElement('article'),b=document.createElement('strong'),p=document.createElement('p'),l=document.createElement('a');b.textContent=String(x.title||x.tag||'ต้องดู');p.textContent=String(x.text||x.detail||'');l.href=String(x.href||'/internal/admin/control-room');l.textContent='ทำต่อ ↗';a.append(b,p,l);box.appendChild(a)})}async function load(){state('กำลังเชื่อม…');try{const r=await fetch('/v1/admin/dashboard',{credentials:'include',headers:{accept:'application/json'},cache:'no-store'}),t=await r.text();let d;try{d=t?JSON.parse(t):{}}catch{throw Error('dashboard returned non-JSON')}if(r.status===401||r.status===403){state('ต้องเข้าสู่ระบบ',true);return}if(!r.ok||d.ok===false)throw Error(d.error||('HTTP '+r.status));const c=d.counts||{};set('[data-count="slips"]',fmt(c.payments));set('[data-kpi="booking"]',fmt(c.jobs));set('[data-kpi="payment"]',fmt(c.payments));const u=q('[data-updated]');if(u)u.textContent=d.generated_at?'อัปเดต '+new Date(d.generated_at).toLocaleString('th-TH'):'ข้อมูลพร้อม';const ds=q('[data-daily-state]');if(ds)ds.textContent='LIVE · VERIFIED';const cs=q('[data-calendar-state]');if(cs)cs.textContent='READY';renderList('[data-daily-list]',d.todos,d.focus?.title||'ยังไม่มีรายการด่วน');renderList('[data-alert-list]',d.boss,d.focus?.text||'ยังไม่มี exception ที่ยืนยันจากระบบ');state('LIVE')}catch(e){state('ข้อมูลยังไม่พร้อม',true)}}const refresh=q('[data-refresh]');if(refresh)refresh.addEventListener('click',load);load()})();</script>`;

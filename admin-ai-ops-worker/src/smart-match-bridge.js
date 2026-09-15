import aiOpsGate, { FollowUpAutopilot } from "./gate.js";
import {
  SMART_MATCH_PATH,
  buildCanonicalModelSearchRoute,
  normalizeSmartMatchInput,
  rankSmartMatches,
} from "./smart-matching.js";

export { FollowUpAutopilot };

const CLIENT_PATH = "/v1/admin/ai-ops/client.js";
const CONTEXT_PATH = "/v1/admin/ai-ops/context";
const COMMAND_CENTER_PATH = "/v1/admin/ai-ops/command-center";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const method = request.method.toUpperCase();

    if (path === SMART_MATCH_PATH) {
      if (method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
      const auth = await verifyAdminStrict(request);
      if (!auth.ok) return json({ ok: false, error: "unauthorized" }, 401);
      const body = await request.json().catch(() => null);
      if (!body) return json({ ok: false, error: "invalid_json" }, 400);
      const input = normalizeSmartMatchInput(body);
      if (!input.ok) {
        return json({
          ok: false,
          error: "matching_context_incomplete",
          missing: input.errors,
          message: "เลือก Client / Public-Private / folder / lane ที่จำเป็นก่อนจัดอันดับ Model",
        }, 400);
      }

      const route = buildCanonicalModelSearchRoute(input);
      const source = await readAdminJson(request, route);
      if (!source.ok || !source.data) {
        return json({
          ok: false,
          error: "canonical_model_search_blocked",
          source: "/v1/admin/models/search",
          source_status: source.status,
          source_error: source.data?.error || source.data?.message || "unavailable",
          message: "Smart Matching ไม่สร้าง candidate เองเมื่อ canonical model search ไม่อนุญาตหรืออ่านไม่ได้",
        }, source.status >= 400 && source.status < 500 ? source.status : 424);
      }

      const result = rankSmartMatches(source.data, input);
      result.source_status = source.status;
      result.generated_at = new Date().toISOString();
      return json(result);
    }

    const base = await aiOpsGate.fetch(request, env, ctx);

    if (method === "GET" && path === CLIENT_PATH && base.ok) {
      const source = await base.text();
      const headers = new Headers(base.headers);
      headers.delete("content-length");
      headers.set("x-mmd-smart-matching", "p1");
      return new Response(`${source}\n${SMART_MATCH_CLIENT_LAYER}`, {
        status: base.status,
        statusText: base.statusText,
        headers,
      });
    }

    if (method === "GET" && (path === CONTEXT_PATH || path === COMMAND_CENTER_PATH) && base.ok) {
      return decorateSmartMatchingStatus(base);
    }

    return base;
  },
};

async function decorateSmartMatchingStatus(response) {
  const type = response.headers.get("content-type") || "";
  if (!type.includes("application/json")) return response;
  const payload = await response.json().catch(() => null);
  if (!payload || payload.ok === false) return response;
  if (payload.command_center) {
    payload.command_center.phases = (Array.isArray(payload.command_center.phases) ? payload.command_center.phases : []).map((phase) => (
      phase?.key === "smart_matching" ? { ...phase, status: "live_p1" } : phase
    ));
  }
  payload.smart_matching = {
    status: "live_p1",
    endpoint: SMART_MATCH_PATH,
    mode: "preview_only",
    source: "/v1/admin/models/search",
    authority: "backend_eligibility_authority",
    assignment_authority: "Per",
    note: "จัดอันดับเฉพาะ candidate ที่ canonical model search อนุญาตแล้ว; ไม่ auto-assign และไม่ใช้ Drive folder เป็น truth",
  };
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("cache-control", "no-store");
  headers.set("x-mmd-smart-matching", "p1-live");
  return new Response(JSON.stringify(payload), { status: response.status, statusText: response.statusText, headers });
}

async function verifyAdminStrict(request) {
  try {
    const url = new URL(request.url);
    url.pathname = "/v1/admin/auth/me";
    url.search = "";
    const headers = new Headers({ accept: "application/json" });
    for (const key of ["cookie", "origin", "user-agent"]) {
      const value = request.headers.get(key);
      if (value) headers.set(key, value);
    }
    const response = await fetch(url.toString(), { method: "GET", headers, redirect: "manual" });
    if (!response.ok) return { ok: false };
    const body = await response.json().catch(() => null);
    return { ok: Boolean(body && body.ok === true && body.authenticated === true), actor: body || null };
  } catch {
    return { ok: false };
  }
}

async function readAdminJson(request, route) {
  const base = new URL(request.url);
  const target = new URL(route, `${base.protocol}//${base.host}`);
  const headers = new Headers({ accept: "application/json" });
  for (const key of ["cookie", "origin", "user-agent"]) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  try {
    const response = await fetch(target.toString(), { method: "GET", headers, redirect: "manual" });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    return { ok: response.ok && data !== null, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

function normalizePath(value = "") {
  const path = String(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

const SMART_MATCH_CLIENT_LAYER = String.raw`;(()=>{'use strict';const path=location.pathname.replace(/\/+$/,'')||'/';if(path!=='/internal/admin/jobs/create-job')return;if(document.querySelector('[data-mmd-smart-match-runtime]'))return;const runtime=document.createElement('div');runtime.dataset.mmdSmartMatchRuntime='p1';document.body.appendChild(runtime);const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const first=(selectors)=>{for(const s of selectors){const e=document.querySelector(s);if(!e)continue;const v=(e.value||e.dataset?.value||e.dataset?.clientId||e.dataset?.selectedClientId||e.dataset?.memberId||e.dataset?.opWorkType||e.dataset?.opFolder||e.dataset?.orientation||e.dataset?.lane||'').trim();if(v)return v}return''};const checked=(names)=>{for(const n of names){const e=document.querySelector('input[name="'+n+'"]:checked');if(e)return String(e.value||'').trim()}return''};const selectedData=(selectors,keys)=>{for(const s of selectors){const e=document.querySelector(s);if(!e)continue;for(const k of keys){const v=e.dataset&&e.dataset[k];if(v)return String(v).trim()}if(e.value)return String(e.value).trim()}return''};function infer(){const u=new URL(location.href).searchParams;const work=selectedData(['[data-op-work-type].is-selected','[data-work-type].is-selected','[data-job-world].is-selected','[aria-pressed="true"][data-work-type]'],['opWorkType','workType','jobWorld'])||checked(['work_type','booking_visibility','world']);const folder=selectedData(['[data-op-folder].is-selected','[data-model-folder].is-selected','[data-folder].is-selected','[aria-pressed="true"][data-folder]'],['opFolder','modelFolder','folder'])||checked(['model_folder','folder','selected_access_folder']);const lane=selectedData(['[data-orientation].is-selected','[data-customer-lane].is-selected','[data-private-orientation].is-selected','[aria-pressed="true"][data-orientation]'],['orientation','customerLane','privateOrientation','lane'])||checked(['private_orientation','orientation','customer_lane']);return{client_id:first(['[data-client-id]','[data-selected-client-id]','[data-op-client-id]'])||u.get('client_id')||'',member_id:first(['[data-member-id]','[data-selected-member-id]'])||u.get('member_id')||'',work_type:work,folder,lane}}function make(){const block=document.createElement('section');block.setAttribute('data-mmd-smart-match','p1');block.innerHTML='<style>[data-mmd-smart-match]{margin:0 0 12px;padding:11px;border:1px solid #3b3020;border-radius:12px;background:#0c0b09}[data-mmd-smart-match] .sm-h{display:flex;justify-content:space-between;align-items:center;gap:8px}[data-mmd-smart-match] .sm-h b{color:#d9b86c;font-size:9px;letter-spacing:.08em}[data-mmd-smart-match] .sm-h small{color:#81796e;font-size:8px}[data-mmd-smart-match] .sm-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:9px}[data-mmd-smart-match] select{width:100%;border:1px solid #30291f;border-radius:8px;background:#090806;color:#eee7da;padding:8px;font-size:9px}[data-mmd-smart-match] .sm-flags{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0;color:#9b9387;font-size:8px}[data-mmd-smart-match] .sm-run{width:100%;border:1px solid #5b4825;border-radius:9px;background:#1a150b;color:#dfc27d;padding:9px;font-weight:800;font-size:9px;cursor:pointer}[data-mmd-smart-match] .sm-out{display:grid;gap:6px;margin-top:8px}[data-mmd-smart-match] .sm-item{padding:9px;border:1px solid #292319;border-radius:9px;background:#11100e}[data-mmd-smart-match] .sm-item strong{font-size:10px}[data-mmd-smart-match] .sm-item small{display:block;margin-top:3px;color:#8b8377;font-size:8px;line-height:1.4}[data-mmd-smart-match] .sm-item button{margin-top:7px;border:1px solid #493a21;border-radius:7px;background:#151108;color:#cfb470;padding:6px 8px;font-size:7px;font-weight:800;cursor:pointer}[data-mmd-smart-match] .sm-w{color:#e0ad66!important}@media(max-width:520px){[data-mmd-smart-match] .sm-grid{grid-template-columns:1fr}}</style><div class="sm-h"><b>SMART MATCH</b><small>AI จัดอันดับ · เปอร์เลือกเอง</small></div><div class="sm-grid"><select data-sm-work><option value="">Public / Private</option><option value="public">Public</option><option value="private">Private</option></select><select data-sm-folder><option value="">Folder</option><option value="travel">Travel</option><option value="extreme">Extreme</option><option value="standard">Standard</option><option value="premium">Premium</option><option value="vip">VIP</option><option value="exclusive">Exclusive</option></select><select data-sm-lane><option value="">Lane / Gender</option><option value="straight">Straight</option><option value="gay">Gay</option><option value="both">Both</option></select><div></div></div><div class="sm-flags"><label><input type="checkbox" data-sm-flag="mk"> MK</label><label><input type="checkbox" data-sm-flag="burn"> Burn</label><label><input type="checkbox" data-sm-flag="live"> Live</label><label><input type="checkbox" data-sm-flag="kiss"> Kiss</label></div><button class="sm-run" type="button">จัดอันดับ Model ที่เหมาะตอนนี้</button><div class="sm-out"><div class="sm-item"><small>เลือก Client และ Job scope ในหน้า Create Job ก่อน ระบบจะพยายามดึงค่ามาให้เอง</small></div></div>';return block}function prefill(block){const x=infer(),w=block.querySelector('[data-sm-work]'),f=block.querySelector('[data-sm-folder]'),l=block.querySelector('[data-sm-lane]');if(x.work_type&&[...w.options].some(o=>o.value===x.work_type))w.value=x.work_type;if(x.folder&&[...f.options].some(o=>o.value===x.folder))f.value=x.folder;if(x.lane&&[...l.options].some(o=>o.value===x.lane))l.value=x.lane}function handoff(model){const input=document.querySelector('[data-op-model-lookup-key],input[data-model-search],input[name="model_query"],input[name="model_search"]');if(!input)return false;input.value=model.model_lookup_key||model.model_name||'';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));const go=document.querySelector('[data-op-refresh-models],[data-model-search-button]');if(go)go.click();return true}async function run(block){const out=block.querySelector('.sm-out'),inf=infer(),payload={client_id:inf.client_id,member_id:inf.member_id,work_type:block.querySelector('[data-sm-work]').value,folder:block.querySelector('[data-sm-folder]').value,orientation:block.querySelector('[data-sm-lane]').value};block.querySelectorAll('[data-sm-flag]').forEach(e=>payload[e.dataset.smFlag]=e.checked);out.innerHTML='<div class="sm-item"><small>กำลังถาม canonical Model Search…</small></div>';try{const r=await fetch('/v1/admin/ai-ops/smart-match/preview',{method:'POST',credentials:'include',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}),t=await r.text();let d;try{d=JSON.parse(t)}catch{throw Error('endpoint returned non-JSON')}if(!r.ok||d.ok===false)throw Error((d.message||d.error||('HTTP '+r.status))+(d.missing?.length?' · '+d.missing.join(', '):''));const warn=(d.warnings||[]).map(w=>'<div class="sm-item"><small class="sm-w">'+esc(w.text||w.code)+'</small></div>').join('');const matches=(d.matches||[]).slice(0,5).map(m=>'<div class="sm-item" data-sm-model="'+esc(m.model_id||'')+'"><strong>#'+esc(m.rank)+' · '+esc(m.model_name)+' · '+esc(m.score)+'</strong><small>'+esc((m.reasons||[]).slice(0,3).map(x=>x.text).join(' · '))+'</small>'+(m.missing_evidence?.length?'<small class="sm-w">ยังขาด: '+esc(m.missing_evidence.join(', '))+'</small>':'')+'<button type="button" data-sm-handoff="'+esc(m.model_lookup_key||m.model_name||'')+'">แสดงคนนี้ใน Model list</button></div>').join('')||'<div class="sm-item"><small>ไม่มี candidate ที่ canonical backend อนุญาตสำหรับ scope นี้</small></div>';out.innerHTML=warn+matches;out.querySelectorAll('[data-sm-handoff]').forEach(btn=>btn.onclick=()=>{const key=btn.getAttribute('data-sm-handoff');handoff({model_lookup_key:key,model_name:key});btn.textContent='ส่งไป Model list แล้ว'});}catch(e){out.innerHTML='<div class="sm-item"><small class="sm-w">'+esc(e.message||e)+'</small></div>'}}function ensure(){const body=document.querySelector('.mmd-aiops-b');if(!body||body.querySelector('[data-mmd-smart-match]'))return;const block=make();body.insertAdjacentElement('afterbegin',block);prefill(block);block.querySelector('.sm-run').onclick=()=>run(block)}ensure();const mo=new MutationObserver(()=>queueMicrotask(ensure));mo.observe(document.body,{childList:true,subtree:true});})();`;

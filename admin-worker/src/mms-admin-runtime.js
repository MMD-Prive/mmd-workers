import { isAuthed } from "./index.js";

const PAGE_PATH = "/internal/admin/mms";
const API_PREFIX = "/v1/admin/mms";
const INTERNAL_BASE = "https://mms.internal";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function isMmsAdminRequest(pathname = "") {
  const path = normalizePath(pathname);
  return path === PAGE_PATH || path === API_PREFIX || path.startsWith(`${API_PREFIX}/`);
}

export async function handleMmsAdminRequest(request, env = {}) {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  const method = request.method.toUpperCase();

  if (!(await isAuthed(request, env))) {
    if (path === PAGE_PATH && (method === "GET" || method === "HEAD")) {
      return Response.redirect(`${url.origin}/internal/admin/login?next=${encodeURIComponent(PAGE_PATH)}`, 303);
    }
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  if (path === PAGE_PATH) {
    if (method !== "GET" && method !== "HEAD") return methodNotAllowed(["GET", "HEAD"]);
    const response = html(renderPage(), 200);
    return method === "HEAD" ? new Response(null, { status: response.status, headers: response.headers }) : response;
  }

  if (!env.MMS_WORKER || typeof env.MMS_WORKER.fetch !== "function") {
    return json({ ok: false, error: "mms_service_unavailable" }, 503);
  }

  if (path === `${API_PREFIX}/catalog` && method === "GET") {
    return proxyJson(request, env, "/mms/api/catalog", { origin: true });
  }
  if (path === `${API_PREFIX}/snapshot` && method === "GET") {
    return proxyJson(request, env, "/internal/mms/admin/snapshot");
  }
  if (path === `${API_PREFIX}/applications` && method === "POST") {
    return proxyJson(request, env, "/mms/api/applications", { origin: true });
  }
  if (path === `${API_PREFIX}/uploads/presign` && method === "POST") {
    return proxyJson(request, env, "/mms/api/uploads/presign", { origin: true });
  }

  const upload = path.match(/^\/v1\/admin\/mms\/uploads\/(mmsapp_[a-f0-9]{24})\/([A-Za-z0-9_-]{32,})$/);
  if (upload && method === "PUT") {
    return proxyUpload(request, env, `/mms/api/uploads/${upload[1]}/${upload[2]}`);
  }

  const application = path.match(/^\/v1\/admin\/mms\/applications\/(mmsapp_[a-f0-9]{24})$/);
  if (application && method === "PATCH") {
    return proxyJson(request, env, `/internal/mms/admin/applications/${application[1]}`);
  }

  const therapist = path.match(/^\/v1\/admin\/mms\/therapists\/([A-Za-z0-9_-]{4,80})$/);
  if (therapist && method === "PATCH") {
    return proxyJson(request, env, `/internal/mms/admin/therapists/${therapist[1]}`);
  }

  const prebooking = path.match(/^\/v1\/admin\/mms\/prebookings\/(mmspre_[a-f0-9]{24})$/);
  if (prebooking && method === "PATCH") {
    return proxyJson(request, env, `/internal/mms/admin/prebookings/${prebooking[1]}`);
  }

  if (path === `${API_PREFIX}/file` && method === "GET") {
    const key = url.searchParams.get("key") || "";
    const internal = new Request(`${INTERNAL_BASE}/internal/mms/admin/file?key=${encodeURIComponent(key)}`, { method: "GET" });
    return env.MMS_WORKER.fetch(internal);
  }

  return json({ ok: false, error: "not_found" }, 404);
}

async function proxyJson(request, env, targetPath, { origin = false } = {}) {
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  if (origin) headers.set("origin", "https://mmdbkk.com");
  const init = { method: request.method, headers };
  if (!/^(GET|HEAD)$/i.test(request.method)) init.body = await request.text();
  const response = await env.MMS_WORKER.fetch(new Request(`${INTERNAL_BASE}${targetPath}`, init));
  return relay(response);
}

async function proxyUpload(request, env, targetPath) {
  const contentType = String(request.headers.get("content-type") || "application/octet-stream").split(";")[0].trim();
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) return json({ ok: false, error: "empty_upload" }, 400);
  if (bytes.byteLength > MAX_UPLOAD_BYTES) return json({ ok: false, error: "upload_too_large" }, 413);
  const headers = new Headers({
    origin: "https://mmdbkk.com",
    "content-type": contentType,
    "content-length": String(bytes.byteLength),
  });
  const response = await env.MMS_WORKER.fetch(new Request(`${INTERNAL_BASE}${targetPath}`, {
    method: "PUT",
    headers,
    body: bytes,
  }));
  return relay(response);
}

async function relay(response) {
  const headers = new Headers();
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  const type = response.headers.get("content-type");
  if (type) headers.set("content-type", type);
  return new Response(response.body, { status: response.status, headers });
}

function renderPage() {
  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><title>MMS · Therapist Operations</title>
<style>
:root{--ink:#14211b;--muted:#66756c;--paper:#f5f5ef;--card:#fff;--sage:#61766a;--sage2:#dce6df;--line:#d9ded9;--danger:#a33c35;--shadow:0 14px 40px rgba(23,40,31,.08)}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:"Noto Sans Thai","LINE Seed Sans TH",system-ui,-apple-system,sans-serif}.shell{max-width:1220px;margin:auto;padding:24px}.top{display:flex;justify-content:space-between;gap:18px;align-items:flex-end;padding:24px 0}.eyebrow{font-size:12px;letter-spacing:.13em;color:var(--sage);font-weight:700}.top h1{font-size:clamp(30px,5vw,58px);line-height:.98;margin:8px 0}.top p{margin:0;color:var(--muted);max-width:680px}.status{font-size:13px;background:var(--sage2);border-radius:999px;padding:10px 14px;white-space:nowrap}.tabs{position:sticky;top:0;z-index:4;display:flex;gap:8px;overflow:auto;padding:10px 0;background:linear-gradient(var(--paper) 75%,transparent)}button,.btn,select,input,textarea{font:inherit}.tab,.btn{border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:999px;padding:10px 16px;cursor:pointer}.tab.active,.btn.primary{background:var(--ink);color:#fff;border-color:var(--ink)}.btn.approve{background:var(--sage);color:#fff;border-color:var(--sage)}.btn.danger{color:var(--danger)}.panel{display:none}.panel.active{display:block}.hero-card,.card,.form-card{background:var(--card);border:1px solid var(--line);border-radius:22px;box-shadow:var(--shadow)}.hero-card{padding:20px;margin:10px 0 18px}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.stat{padding:16px;border-radius:16px;background:#f0f3ef}.stat b{display:block;font-size:28px}.grid{display:grid;grid-template-columns:repeat(12,1fr);gap:12px}.field{grid-column:span 6;display:flex;flex-direction:column;gap:7px}.field.full{grid-column:1/-1}.field.third{grid-column:span 4}.field label,.label{font-size:13px;color:var(--muted)}input,select,textarea{width:100%;border:1px solid var(--line);border-radius:13px;padding:12px;background:#fff;color:var(--ink)}textarea{min-height:96px;resize:vertical}.form-card{padding:20px}.checks{display:flex;flex-wrap:wrap;gap:8px}.checks label{display:flex;align-items:center;gap:7px;border:1px solid var(--line);padding:9px 11px;border-radius:12px;background:#fff}.checks input{width:auto}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}.list{display:grid;gap:12px}.card{padding:16px;display:grid;grid-template-columns:86px 1fr auto;gap:15px;align-items:start}.thumb{width:86px;height:104px;border-radius:14px;background:#e5e9e5;object-fit:cover}.meta h3{margin:0 0 4px;font-size:19px}.meta p{margin:4px 0;color:var(--muted);font-size:13px}.tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.tag{font-size:11px;background:#edf1ed;padding:5px 8px;border-radius:999px}.side{display:grid;gap:8px;min-width:180px}.side select{padding:8px}.empty{padding:36px;text-align:center;color:var(--muted);border:1px dashed var(--line);border-radius:18px}.notice{margin:10px 0;padding:12px 14px;border-radius:12px;background:#edf4ef;color:#355443;font-size:13px}.notice.error{background:#f8e9e7;color:#7b2f2a}.muted{color:var(--muted);font-size:12px}.hidden{display:none!important}@media(max-width:760px){.shell{padding:14px}.top{align-items:flex-start;flex-direction:column}.stats{grid-template-columns:1fr}.grid{display:block}.field{margin-bottom:12px}.card{grid-template-columns:68px 1fr}.thumb{width:68px;height:84px}.side{grid-column:1/-1;display:flex;flex-wrap:wrap}.side select{flex:1;min-width:150px}.tabs{margin:0 -14px;padding:10px 14px}.hero-card,.form-card,.card{border-radius:18px}.top h1{font-size:40px}}
</style></head>
<body><main class="shell">
<header class="top"><div><div class="eyebrow">MMS · INTERNAL OPERATIONS</div><h1>Therapist<br>Operations</h1><p>ทีมกรอกข้อมูล อัปโหลดไฟล์ ตรวจใบสมัคร เปิด Therapist และดู Pre-booking ได้จากหน้านี้ โดยข้อมูลจริงยังอยู่ใน Airtable และไฟล์ส่วนตัวอยู่ใน R2</p></div><div id="runtime" class="status">กำลังเชื่อมข้อมูล…</div></header>
<nav class="tabs"><button class="tab active" data-tab="intake">รับข้อมูล</button><button class="tab" data-tab="applications">ใบสมัคร <span id="appCount">0</span></button><button class="tab" data-tab="therapists">Therapists <span id="therCount">0</span></button><button class="tab" data-tab="prebookings">Pre-booking <span id="preCount">0</span></button></nav>
<section class="panel active" id="intake"><div class="hero-card"><div class="stats"><div class="stat"><span>ใบสมัคร</span><b id="sApps">0</b></div><div class="stat"><span>Therapists</span><b id="sTher">0</b></div><div class="stat"><span>Pre-booking</span><b id="sPre">0</b></div></div></div>
<form id="intakeForm" class="form-card"><div class="grid">
<div class="field full"><label>ชื่อ–นามสกุล *</label><input name="applicant_name" required></div><div class="field"><label>ชื่อเล่น</label><input name="nickname"></div><div class="field"><label>โทรศัพท์</label><input name="phone" type="tel"></div><div class="field"><label>LINE ID</label><input name="line_id"></div><div class="field"><label>เพศผู้สมัคร</label><select name="gender_identity"><option value="male">ชาย</option><option value="prefer_not_to_say">ไม่ประสงค์ระบุ</option></select></div><div class="field"><label>รับลูกค้า</label><select name="customer_gender_scope"><option value="male">ผู้ชาย</option><option value="female">ผู้หญิง</option><option value="both">ได้ทั้งคู่</option></select></div><div class="field"><label>โซนหลัก *</label><select name="base_zone" id="baseZone" required></select></div><div class="field"><label>ประสบการณ์</label><div style="display:flex;gap:8px"><input name="experience_years" type="number" min="0" max="60" value="0" placeholder="ปี"><input name="experience_months" type="number" min="0" max="11" value="0" placeholder="เดือน"></div></div>
<div class="field full"><span class="label">Skills *</span><div class="checks" id="skills"></div></div><div class="field full"><span class="label">โซนที่ไปได้ *</span><div class="checks" id="zones"></div></div><div class="field full"><label>จุดแข็ง / ประสบการณ์</label><textarea name="strengths"></textarea></div><div class="field"><label>เคยทำร้าน/สปา</label><select name="worked_at_spa_before"><option value="false">ไม่เคย</option><option value="true">เคย</option></select></div><div class="field"><label>ชื่อร้าน/สปา</label><input name="spa_name"></div><div class="field"><label>เคยรับงานเอง</label><select name="worked_independently_before"><option value="false">ไม่เคย</option><option value="true">เคย</option></select></div><div class="field"><label>Social / ช่องทางอ้างอิง</label><input name="independent_social"></div><div class="field"><label>รูปโปรไฟล์</label><input name="profile_photo" type="file" accept="image/jpeg,image/png,image/webp"></div><div class="field"><label>Certificate</label><input name="certificates" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf"></div></div><div id="intakeNotice"></div><div class="actions"><button class="btn primary" type="submit">บันทึกและอัปโหลดอัตโนมัติ</button><button class="btn" type="reset">ล้างฟอร์ม</button></div></form></section>
<section class="panel" id="applications"><div id="applicationsList" class="list"></div></section>
<section class="panel" id="therapists"><div id="therapistsList" class="list"></div></section>
<section class="panel" id="prebookings"><div id="prebookingsList" class="list"></div></section>
</main><script>
const API='/v1/admin/mms';let catalog={skills:[],zones:[]},state={applications:[],therapists:[],prebookings:[]};
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
$$('.tab').forEach(b=>b.onclick=()=>{$$('.tab').forEach(x=>x.classList.toggle('active',x===b));$$('.panel').forEach(x=>x.classList.toggle('active',x.id===b.dataset.tab));});
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
async function call(path,opts={}){const r=await fetch(API+path,{credentials:'same-origin',...opts});const type=r.headers.get('content-type')||'';const body=type.includes('json')?await r.json():await r.text();if(!r.ok)throw new Error(body?.error?.message||body?.error||('HTTP '+r.status));return body}
function note(el,msg,error=false){el.innerHTML='<div class="notice '+(error?'error':'')+'">'+esc(msg)+'</div>'}
async function boot(){try{const [c,s]=await Promise.all([call('/catalog'),call('/snapshot')]);catalog=c.data||c;state=s;renderCatalog();renderAll();$('#runtime').textContent='เชื่อม Airtable + Private R2 แล้ว';}catch(e){$('#runtime').textContent='เชื่อมข้อมูลไม่สำเร็จ';note($('#intakeNotice'),e.message,true)}}
function renderCatalog(){const bz=$('#baseZone');bz.innerHTML='<option value="">เลือกโซน</option>'+catalog.zones.map(z=>'<option value="'+esc(z.code)+'">'+esc(z.label)+'</option>').join('');$('#skills').innerHTML=catalog.skills.map(s=>'<label><input type="checkbox" name="skills" value="'+esc(s.code)+'"> '+esc(s.label)+' · '+esc(s.th||'')+'</label>').join('');$('#zones').innerHTML=catalog.zones.map(z=>'<label><input type="checkbox" name="coverage_zones" value="'+esc(z.code)+'"> '+esc(z.label)+'</label>').join('')}
function renderAll(){const c=state.counts||{};$('#sApps').textContent=$('#appCount').textContent=c.applications??state.applications.length;$('#sTher').textContent=$('#therCount').textContent=c.therapists??state.therapists.length;$('#sPre').textContent=$('#preCount').textContent=c.prebookings??state.prebookings.length;renderApplications();renderTherapists();renderPrebookings()}
function fileUrl(key){return key?API+'/file?key='+encodeURIComponent(key):''}
function renderApplications(){const el=$('#applicationsList');if(!state.applications.length){el.innerHTML='<div class="empty">ยังไม่มีใบสมัคร</div>';return}el.innerHTML=state.applications.map(a=>`<article class="card"><div>${a.profile_photo_r2_key?`<img class="thumb" src="${fileUrl(a.profile_photo_r2_key)}" alt="">`:'<div class="thumb"></div>'}</div><div class="meta"><h3>${esc(a.nickname||a.applicant_name||'ผู้สมัคร')}</h3><p>${esc(a.applicant_name)} · ${esc(a.phone||a.line_id||'')}</p><p>${esc(a.customer_gender_scope)} · ${esc(a.base_zone)} · ประสบการณ์ ${esc(a.experience_years)} ปี ${esc(a.experience_months)} เดือน</p><div class="tags">${(a.skills||[]).map(x=>'<span class="tag">'+esc(x)+'</span>').join('')}</div><p>${esc(a.strengths||'')}</p>${a.certificate_r2_keys?.length?`<p>Certificate: ${a.certificate_r2_keys.length} ไฟล์</p>`:''}</div><div class="side"><select data-app-status="${esc(a.application_id)}">${['Submitted','Under Review','Approved','Rejected','Withdrawn'].map(x=>`<option ${x===a.status?'selected':''}>${x}</option>`).join('')}</select><button class="btn" data-app-save="${esc(a.application_id)}">บันทึกสถานะ</button><button class="btn approve" data-app-approve="${esc(a.application_id)}">Approve → Therapist</button></div></article>`).join('');$$('[data-app-save]').forEach(b=>b.onclick=()=>saveApplication(b.dataset.appSave,false));$$('[data-app-approve]').forEach(b=>b.onclick=()=>saveApplication(b.dataset.appApprove,true))}
async function saveApplication(id,approve){const sel=$(`[data-app-status="${CSS.escape(id)}"]`);try{await call('/applications/'+id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:approve?'Approved':sel.value,approve_to_therapist:approve})});await refresh()}catch(e){alert(e.message)}}
function renderTherapists(){const el=$('#therapistsList');if(!state.therapists.length){el.innerHTML='<div class="empty">ยังไม่มี Therapist ที่เปิดใช้งาน — Approve จากแท็บใบสมัครได้เลย</div>';return}el.innerHTML=state.therapists.map(t=>`<article class="card"><div>${t.profile_photo_r2_key?`<img class="thumb" src="${fileUrl(t.profile_photo_r2_key)}" alt="">`:'<div class="thumb"></div>'}</div><div class="meta"><h3>${esc(t.display_name||t.therapist_id)}</h3><p>${esc(t.therapist_id)} · ${esc(t.customer_gender_scope)} · ${esc(t.base_zone)}</p><div class="tags">${(t.verified_skills||[]).map(x=>'<span class="tag">'+esc(x)+'</span>').join('')}</div><p>Matching: ${t.matching_enabled?'เปิด':'ปิด'} · Manual review: ${t.manual_review_only?'ใช่':'ไม่'}</p></div><div class="side"><select data-ther-av="${esc(t.therapist_id)}">${['Available','Limited','Unavailable','Paused'].map(x=>`<option ${x===t.availability_status?'selected':''}>${x}</option>`).join('')}</select><select data-ther-status="${esc(t.therapist_id)}">${['Review','Active','Inactive','Rejected'].map(x=>`<option ${x===t.status?'selected':''}>${x}</option>`).join('')}</select><label class="muted"><input style="width:auto" type="checkbox" data-ther-match="${esc(t.therapist_id)}" ${t.matching_enabled?'checked':''}> Matching enabled</label><button class="btn" data-ther-save="${esc(t.therapist_id)}">บันทึก</button></div></article>`).join('');$$('[data-ther-save]').forEach(b=>b.onclick=()=>saveTherapist(b.dataset.therSave))}
async function saveTherapist(id){try{await call('/therapists/'+id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({availability_status:$(`[data-ther-av="${CSS.escape(id)}"]`).value,status:$(`[data-ther-status="${CSS.escape(id)}"]`).value,matching_enabled:$(`[data-ther-match="${CSS.escape(id)}"]`).checked})});await refresh()}catch(e){alert(e.message)}}
function renderPrebookings(){const el=$('#prebookingsList');if(!state.prebookings.length){el.innerHTML='<div class="empty">ยังไม่มี Pre-booking</div>';return}el.innerHTML=state.prebookings.map(p=>`<article class="card"><div><div class="thumb" style="display:grid;place-items:center;height:86px">${esc((p.service_date||'--').slice(5))}</div></div><div class="meta"><h3>${esc(p.service_date)} · ${esc(p.service_time)}</h3><p>${esc(p.zone)} · ${esc(p.recipient_gender)} · ${esc(p.duration_minutes)} นาที</p><div class="tags">${(p.selected_skills||[]).map(x=>'<span class="tag">'+esc(x)+'</span>').join('')}</div><p>Matched: ${esc((p.matched_therapist_ids||[]).join(', ')||'ยังไม่มี')}</p></div><div class="side"><select data-pre-status="${esc(p.prebooking_id)}">${['Submitted','Matching','Options Ready','Pending Coordination','Confirmed','Expired','Cancelled'].map(x=>`<option ${x===p.status?'selected':''}>${x}</option>`).join('')}</select><button class="btn" data-pre-save="${esc(p.prebooking_id)}">บันทึกสถานะ</button></div></article>`).join('');$$('[data-pre-save]').forEach(b=>b.onclick=()=>savePrebooking(b.dataset.preSave))}
async function savePrebooking(id){try{await call('/prebookings/'+id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:$(`[data-pre-status="${CSS.escape(id)}"]`).value})});await refresh()}catch(e){alert(e.message)}}
async function refresh(){state=await call('/snapshot');renderAll()}
async function uploadOne(applicationId,token,kind,file){const grant=await call('/uploads/presign',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({application_ref:applicationId,application_token:token,kind,filename:file.name,content_type:file.type,size:file.size})});const target=new URL(grant.upload.url);const suffix=target.pathname.match(/\/mms\/api\/uploads\/(.+)$/)?.[1];if(!suffix)throw new Error('Upload URL ไม่ถูกต้อง');const r=await fetch(API+'/uploads/'+suffix,{method:'PUT',headers:{'content-type':file.type},body:file,credentials:'same-origin'});if(!r.ok){const b=await r.json().catch(()=>({}));throw new Error(b?.error?.message||'อัปโหลดไม่สำเร็จ')}}
$('#intakeForm').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,n=$('#intakeNotice');const fd=new FormData(f);const skills=fd.getAll('skills'),zones=fd.getAll('coverage_zones');if(!skills.length||!zones.length){note(n,'กรุณาเลือก Skill และโซนที่ไปได้อย่างน้อย 1 รายการ',true);return}const data={idempotency_key:'admin-'+crypto.randomUUID(),applicant_name:fd.get('applicant_name'),nickname:fd.get('nickname'),phone:fd.get('phone'),line_id:fd.get('line_id'),gender_identity:fd.get('gender_identity'),customer_gender_scope:fd.get('customer_gender_scope'),skills,experience_years:Number(fd.get('experience_years')||0),experience_months:Number(fd.get('experience_months')||0),strengths:fd.get('strengths'),worked_at_spa_before:fd.get('worked_at_spa_before')==='true',spa_name:fd.get('spa_name'),worked_independently_before:fd.get('worked_independently_before')==='true',independent_social:fd.get('independent_social'),base_zone:fd.get('base_zone'),coverage_zones:zones,general_consent:true,consent_notice_version:'mms-admin-intake-v1',language:'th'};try{note(n,'กำลังบันทึกข้อมูล…');const created=await call('/applications',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});if(!created.application_token)throw new Error('ไม่พบ upload token จากระบบ');const photo=fd.get('profile_photo');if(photo&&photo.size)await uploadOne(created.application_id,created.application_token,'profile_photo',photo);for(const cert of fd.getAll('certificates'))if(cert&&cert.size)await uploadOne(created.application_id,created.application_token,'certificate',cert);note(n,'บันทึกข้อมูลและอัปโหลดเรียบร้อย');f.reset();await refresh()}catch(err){note(n,err.message,true)}});
boot();
</script></body></html>`;
}

function normalizePath(pathname = "") {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } }); }
function html(value, status = 200) { return new Response(value, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "content-security-policy": "default-src 'self'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", "x-frame-options": "DENY" } }); }
function methodNotAllowed(allow) { return new Response(null, { status: 405, headers: { allow: allow.join(", ") } }); }

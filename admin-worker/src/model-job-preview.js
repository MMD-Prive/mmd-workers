import { readCredentialBoundAdminActor } from './credential-bound-admin-session.js';

export const MODEL_JOB_PREVIEW_PATH = '/internal/admin/jobs/model-preview';
export const MODEL_PREVIEW_FIELDS = Object.freeze({
  session_id: 'fldLTq2kZbyRv22IA', session_status: 'fldmwuvOaiCFdzzRa',
  client_name: 'fldMvnQ0BzDfHUYjT', model_name: 'flddVz6eoWRHrzIQr',
  job_type: 'fldjK3U9bghnj7xUe', job_date: 'fldpnqoIsUMfN7y3c',
  start_time: 'fldBeG0FkWwa8kgnp', end_time: 'fldiDSz0wW9Ct9I3P',
  location_name: 'fldIiRpaxoafjTkFt', google_map_url: 'fldoUDQ8sH93idPx0',
  model_payout_thb: 'fldlTO5aNfqUmlNWm', model_acknowledged_at: 'fldFgkHXivIAThfDz',
});
const headers = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'private, no-store, max-age=0',
  'x-robots-tag': 'noindex, nofollow',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};
const text = value => typeof value === 'string' || typeof value === 'number' ? String(value).slice(0,500) : '';
const NOTE_FIELDS = ['fldEcDkF7CH9VixWM', 'fldwl9Gs5tYlXG5ls'];
const escape = value => text(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function isModelJobPreviewRequest(path) { return path === MODEL_JOB_PREVIEW_PATH; }

export function projectModelJobPreview(fields) {
  const result = Object.fromEntries(Object.entries(MODEL_PREVIEW_FIELDS).map(([key,id]) => [key,text(fields[id])]));
  // Only the explicitly model-facing VIP detail is projected; never render raw notes.
  const note = String(fields[NOTE_FIELDS[0]] || fields[NOTE_FIELDS[1]] || '');
  result.vip_detail = text(parseMarkedJson(note, 'SIGIL VIP Detail v1')?.vip_detail).slice(0,240);
  const raw = fields[MODEL_PREVIEW_FIELDS.model_payout_thb];
  result.model_payout_thb = (typeof raw === 'number' || typeof raw === 'string' && raw.trim()) && Number.isFinite(Number(raw)) ? Number(raw) : null;
  try { const url = new URL(result.google_map_url); result.google_map_url = url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; }
  catch { result.google_map_url = ''; }
  return result;
}

export function renderModelJobPreview(job) {
  const row = (label,value) => `<div class="row"><dt>${escape(label)}</dt><dd>${escape(value || '—')}</dd></div>`;
  const payout = job.model_payout_thb === null ? '—' : `${new Intl.NumberFormat('th-TH').format(job.model_payout_thb)} บาท`;
  return `<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Model job preview</title><style>body{margin:0;background:#f4f3ef;color:#242424;font:16px system-ui,sans-serif}main{max-width:640px;margin:40px auto;padding:28px;background:white;border-radius:18px;box-shadow:0 6px 30px #0001}h1{font-size:26px;margin:18px 0 6px}.badge{color:#73591d;background:#f5ecd2;border-radius:20px;padding:7px 12px;font-size:13px}p{color:#686868;line-height:1.6}.row{padding:16px 0;border-bottom:1px solid #eee;display:grid;grid-template-columns:140px 1fr;gap:16px}dt{color:#777}dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}a{color:#705b2b}footer{font-size:12px;color:#777;margin-top:24px;overflow-wrap:anywhere}@media(max-width:680px){main{margin:16px;padding:22px}.row{grid-template-columns:110px 1fr}}</style><main><span class="badge">Admin Preview · อ่านอย่างเดียว</span><h1>รายละเอียดงานสำหรับโมเดล</h1><p>ดูข้อมูลก่อนส่งให้โมเดล การเปิดหน้านี้ไม่ยืนยันหรือเปลี่ยนสถานะงาน</p><dl>${row('โมเดล',job.model_name)}${row('ลูกค้า',job.client_name)}${row('ประเภทงาน',job.job_type)}${row('วันที่',job.job_date)}${row('เวลา',[job.start_time,job.end_time].filter(Boolean).join(' – '))}${row('สถานที่',job.location_name)}${job.vip_detail ? row('รายละเอียด VIP',job.vip_detail) : ''}${row('ค่าตัวโมเดล',payout)}${row('สถานะงาน',job.session_status)}${row('โมเดลยืนยัน',job.model_acknowledged_at || 'ยังไม่ได้ยืนยัน')}</dl>${job.google_map_url ? `<p><a href="${escape(job.google_map_url)}" target="_blank" rel="noopener noreferrer">เปิดแผนที่</a></p>` : ''}<footer>Session: ${escape(job.session_id)}</footer></main></html>`;
}

export async function handleModelJobPreview(request,env,fetcher = fetch) {
  const respond = (status,message) => new Response(request.method === 'HEAD' ? null : message,{status,headers});
  const actor = await readCredentialBoundAdminActor(request,env);
  if (!actor) return respond(401,'กรุณาเข้าสู่ระบบแอดมิน');
  if (!['admin','owner'].includes(actor.role)) return respond(403,'ไม่มีสิทธิ์ดู Preview');
  if (!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed',{status:405,headers:{...headers,allow:'GET, HEAD'}});
  const sid = new URL(request.url).searchParams.get('session_id') || '';
  if (!/^sess_[A-Za-z0-9._-]{8,180}$/.test(sid)) return respond(400,'Session ไม่ถูกต้อง');
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) return respond(503,'ยังไม่พร้อมโหลดรายละเอียดงาน');
  const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(env.AIRTABLE_TABLE_SESSIONS || 'tblC98mKWbzmPuNzX')}`);
  url.searchParams.set('maxRecords','2');
  url.searchParams.set('returnFieldsByFieldId','true');
  url.searchParams.set('filterByFormula',`{session_id}='${sid}'`);
  for (const id of Object.values(MODEL_PREVIEW_FIELDS)) url.searchParams.append('fields[]',id);
  for (const id of NOTE_FIELDS) url.searchParams.append('fields[]',id);
  try {
    const response = await fetcher(url,{method:'GET',headers:{Authorization:`Bearer ${env.AIRTABLE_API_KEY}`},signal:AbortSignal.timeout(10000)});
    if (!response.ok) return respond(503,'โหลดรายละเอียดงานไม่สำเร็จ กรุณาลองใหม่');
    const payload = await response.json();
    if (!Array.isArray(payload.records)) return respond(503,'โหลดรายละเอียดงานไม่สำเร็จ');
    if (!payload.records.length) return respond(404,'ไม่พบงานนี้');
    if (payload.records.length !== 1) return respond(409,'พบ Session ซ้ำ กรุณาให้แอดมินตรวจสอบ');
    const job = projectModelJobPreview(payload.records[0].fields || {});
    if (job.session_id !== sid) return respond(409,'ข้อมูล Session ไม่ตรงกัน');
    return respond(200,renderModelJobPreview(job));
  } catch { return respond(503,'โหลดรายละเอียดงานไม่สำเร็จ กรุณาลองใหม่'); }
}

function parseMarkedJson(note, label) {
  const source = String(note || "");
  const marker = `[${String(label)}]`;
  let searchEnd = source.length;

  while (searchEnd > 0) {
    const markerIndex = source.lastIndexOf(marker, searchEnd - 1);
    if (markerIndex < 0) return null;

    let start = markerIndex + marker.length;
    while (start < source.length && /\s/.test(source[start])) start += 1;
    if (source[start] !== "{") {
      searchEnd = markerIndex;
      continue;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;
    let parsed = null;
    for (let i = start; i < source.length; i += 1) {
      const char = source[i];
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === "\\") {
          escaped = true;
          continue;
        }
        if (char === '"') inString = false;
        continue;
      }
      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === "{") {
        depth += 1;
        continue;
      }
      if (char === "}") {
        depth -= 1;
        if (depth !== 0) continue;
        try {
          const candidate = JSON.parse(source.slice(start, i + 1));
          if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) parsed = candidate;
        } catch {}
        break;
      }
    }
    if (parsed) return parsed;
    searchEnd = markerIndex;
  }
  return null;
}

const get = id => document.getElementById(id);
const jobTime = new Intl.DateTimeFormat('th-TH', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok',
});
const apiRoot = new URL('./staging/', document.currentScript.src);
let row;
let sequence = 0;
let writing = false;
let initialized = false;

function clearJob() {
  row = undefined;
  get('job').hidden = get('owner').hidden = true;
  get('replace').disabled = true;
  for (const field of ['sid', 'model', 'generation', 'state', 'starts-at', 'duration']) get(field).textContent = '';
  get('title').textContent = 'งานที่ได้รับมอบหมาย';
}

async function call(path, body) {
  const token = window.liff.getIDToken();
  if (!token) return { ok: false, status: 401 };
  const headers = { Authorization: 'Bearer ' + token };
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(new URL(path, apiRoot), { method: body ? 'POST' : 'GET', headers,
    body: body ? JSON.stringify(body) : undefined, cache: 'no-store', redirect: 'error' });
  return { ok: response.ok, status: response.status, data: await response.json() };
}

function failed(status) {
  return status === 403 ? 'บัญชีนี้ไม่มีสิทธิ์ดูงานนี้' : status === 401 ? 'กรุณาเข้าสู่ระบบ LINE อีกครั้ง' :
    'ยังยืนยันข้อมูลไม่ได้ กรุณาตรวจงานอีกครั้ง';
}

async function refresh(message) {
  const current = ++sequence;
  clearJob();
  get('status').textContent = 'กำลังตรวจสิทธิ์';
  try {
    const result = await call('job');
    if (current !== sequence) return;
    if (!result.ok) {
      get('status').textContent = failed(result.status);
      return;
    }
    row = result.data;
    const partner = ['owner','partner'].includes(row.participant_role);
    get('title').textContent = partner ? 'MY PARTNER · งานโมเดล' :
      row.participant_role === 'customer' ? 'MY MMD · งานของฉัน' : 'MY MODEL · Dashboard';
    get('sid').textContent = row.session_id;
    get('model').textContent = row.model;
    get('generation').textContent = row.generation;
    const startsAt = Date.parse(row.schedule?.starts_at);
    const duration = row.schedule?.duration_minutes;
    get('starts-at').textContent = Number.isFinite(startsAt) ? jobTime.format(startsAt) : '—';
    get('duration').textContent = Number.isSafeInteger(duration) && duration > 0 ? duration + ' นาที' : '—';
    get('state').textContent = ({ awaiting_customer:'รอลูกค้ารับทราบ', awaiting_model:'รอโมเดลรับทราบ',
      acknowledged:'รับทราบแล้ว' })[row.job_update?.state] ?? ({confirmed:'ยืนยันแล้ว',offered:'เสนองานแล้ว'})[row.state] ?? row.state;
    get('owner').hidden = row.participant_role !== 'owner';
    get('job').hidden = false;
    get('status').textContent = message || '';
  } catch { if (current === sequence) get('status').textContent = failed(503); }
}

async function act(action) {
  if (writing || row?.participant_role !== 'owner') return;
  writing = true;
  get('review').disabled = get('replace').disabled = true;
  const current = sequence;
  const input = { action, session_id:row.session_id, generation:row.generation,
    revision:row.revision, next_model:row.test_alternative };
  if (action === 'replace') input.operation_id = crypto.randomUUID();
  try {
    const result = await call('action', input);
    if (current !== sequence) return;
    if (action === 'review' && result.ok) {
      get('status').textContent = 'ตรวจข้อตกลงแล้ว โมเดลที่จะรับงานคือ ' + input.next_model;
      get('replace').disabled = false;
    } else {
      await refresh(result.ok ? 'เปลี่ยนโมเดลและอ่านงานกลับแล้ว' : 'กรุณาตรวจผลของงานก่อนดำเนินการต่อ');
    }
  } catch { if (current === sequence) await refresh('กรุณาตรวจผลของงานก่อนดำเนินการต่อ'); }
  finally { writing = false; get('review').disabled = false; }
}
get('review').onclick = () => act('review');
get('replace').onclick = () => act('replace');
get('refresh').onclick = () => refresh();
get('login').onclick = () => window.liff.login();
window.addEventListener('pageshow', event => { if (event.persisted && initialized) refresh(); });
document.addEventListener('visibilitychange', () => {
  if (!initialized) return;
  if (document.hidden) { ++sequence; clearJob(); }
  else refresh();
});
(async () => {
  try {
    await window.liff.init({ liffId:document.documentElement.dataset.liff });
    if (!window.liff.isLoggedIn()) {
      get('login').hidden = false;
      get('status').textContent = 'เข้าสู่ระบบเพื่อตรวจงานทดสอบ';
      return;
    }
    initialized = true;
    get('refresh').hidden = false;
    await refresh();
  } catch { clearJob(); get('status').textContent = 'เปิดหน้าทดสอบผ่าน LINE Developing อีกครั้ง'; }
})();

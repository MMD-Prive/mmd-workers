import test from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { readMmsAiOps } from './src/mms-ai-ops-read.js';
import { handleMmsAdminRequest } from './src/mms-admin-runtime.js';
import { wireMmsAiOpsUi } from './src/mms-ai-ops-ui.js';

const snapshot = { ok: true, complete: true, applications: [
  { application_id: 'a1', status: 'Submitted', phone: 'PRIVATE_PHONE' },
  { application_id: 'a1', status: 'Submitted' },
  { application_id: 'a2', status: 'Approved' },
], prebookings: [
  { prebooking_id: 'p1', status: 'Pending Coordination', notes: 'PRIVATE_NOTES' },
  { prebooking_id: 'p2', status: 'Matching' },
  { prebooking_id: 'p3', status: 'Cancelled' },
] };
const workspace = { ok: true, complete: true, therapists: [
  { therapist_id: 't1', status: 'Active', can_open: true, availability_status: 'Available', matching_enabled: true },
  { therapist_id: 't2', status: 'Active', can_open: false, availability_status: 'Available', matching_enabled: true },
  { therapist_id: 't3', status: 'Suspended', can_open: false },
  { therapist_id: 't4', status: 'Active', can_open: true, availability_status: 'Offline', matching_enabled: true },
  { therapist_id: 't5', status: 'Active', can_open: true, availability_status: 'Available', matching_enabled: false },
], jobs: [{ job_id: 'j1', is_test: false }, { job_id: 'j2', is_test: true }, { job_id: 'j3' }] };
const health = { ok: true, worker: 'mms-worker', bindings: { telegram: true, line: { persona: 'HENNA', configured: true, auto_reply_enabled: false, channel_id: 'PRIVATE_CHANNEL' } } };
const options = {
  readControls: async () => ({ line_oa_auto_reply: { version: 2, enabled: false }, model_keyword_auto_reply: { version: 3, enabled: true }, all_kenji_mutations: { version: 3, enabled: true } }),
  readRouter: async (_, opts) => { assert.equal(opts.probe, false); return { available: true, lanes: [{ key: 'mms_ops', status: 'configured', destination_configured: true, service_auth_configured: true, topic: 'PRIVATE_DESTINATION' }, { key: 'other_tenant', status: 'configured' }] }; },
};
function envFor(data = {}, calls = []) {
  return { ADMIN_BEARER: 'synthetic-mms-ops', MMS_WORKER: { fetch: async request => {
    assert.equal(request.method, 'GET');
    const path = new URL(request.url).pathname;
    calls.push(path);
    const routes = { '/internal/mms/admin/snapshot': snapshot, '/internal/mms/admin/workspace': workspace, '/health': health, ...data };
    return Response.json(routes[path] || { ok: false });
  } } };
}
const request = (method = 'GET', auth = true, path = '/v1/admin/mms/ai-ops') => new Request('https://www.mmdbkk.com' + path, { method, headers: auth ? { authorization: 'Bearer synthetic-mms-ops' } : {} });

test('MMS AI summary reads canonical sources, deduplicates and keeps readiness conditions', async () => {
  const calls = [];
  const data = await readMmsAiOps(envFor({}, calls), options);
  assert.deepEqual(calls.sort(), ['/health', '/internal/mms/admin/snapshot', '/internal/mms/admin/workspace']);
  assert.deepEqual(data.queue, { applications: 1, prebookings: 1, needs_coordination: 1, therapist_access: 1, available_therapists: 1, production_jobs: 1 });
  assert.equal(data.actions[0].key, 'needs_coordination');
  assert.equal(data.henna.auto_reply_enabled, false);
  assert.equal(data.henna.delivery_verified, false);
  assert.equal(data.kenji.model_reply_kill_switch_active, true);
  assert.equal(data.kenji.mutations_kill_switch_active, true);
  assert.equal(data.kenji.line_reply_kill_switch_active, false);
  assert.equal(data.kenji.line_auto_reply_enabled, null);
  assert.doesNotMatch(JSON.stringify(data), /PRIVATE_|other_tenant|"t1"|"p1"/);
});

test('canonical version zero is an observed default, distinct from an unavailable control', async () => {
  const data = await readMmsAiOps(envFor(), { ...options, readControls: async () => ({
    line_oa_auto_reply: { version: 7, enabled: false }, model_keyword_auto_reply: { version: 3, enabled: true }, all_kenji_mutations: { version: 0, enabled: false },
  }) });
  assert.equal(data.sources.kenji_controls.available, true);
  assert.equal(data.kenji.mutations_kill_switch_active, false);
  assert.deepEqual(data.kenji.runtime_controls.all_kenji_mutations, { available: true, enabled: false, version: 0, origin: 'default' });
  assert.equal(data.kenji.line_reply_kill_switch_active, false);
  assert.equal(data.kenji.line_auto_reply_enabled, null);
});

test('invalid control shape cannot be presented as a clear kill switch', async () => {
  for (const value of [{ enabled: true, version: 0 }, { enabled: false, version: -1 }, { enabled: 'false', version: 3 }, { enabled: false }, null]) {
    const data = await readMmsAiOps(envFor(), { ...options, readControls: async () => ({ all_kenji_mutations: value }) });
    assert.equal(data.sources.kenji_controls.available, false);
    assert.equal(data.kenji.mutations_kill_switch_active, null);
    assert.equal(data.kenji.runtime_controls.all_kenji_mutations.origin, 'unknown');
  }
});

test('partial or malformed queues cannot become an empty complete queue', async () => {
  const partial = await readMmsAiOps(envFor({ '/internal/mms/admin/snapshot': { ...snapshot, complete: false } }), options);
  assert.equal(partial.sources.snapshot.complete, false);
  assert.equal(partial.actions.find(x => x.key === 'applications').partial, true);
  const malformed = await readMmsAiOps(envFor({ '/internal/mms/admin/snapshot': { ok: true, complete: true }, '/internal/mms/admin/workspace': { ok: false } }), options);
  assert.equal(malformed.queue.applications, null);
  assert.equal(malformed.queue.available_therapists, null);
  assert.equal(malformed.sources.snapshot.complete, false);
  assert.deepEqual(malformed.actions, []);
});

test('missing controls, lanes and HENNA booleans are unknown, never enabled or ready', async () => {
  const data = await readMmsAiOps(envFor({ '/health': { ok: true, worker: 'mms-worker', bindings: { line: { persona: 'HENNA' } } } }), {
    readControls: async () => ({ line_oa_auto_reply: { version: 0, enabled: false } }), readRouter: async () => ({ available: false }),
  });
  assert.equal(data.sources.kenji_controls.available, false);
  assert.equal(data.kenji.line_auto_reply_enabled, null);
  assert.equal(data.henna.configured, null);
  assert.equal(data.henna.handoff_binding_configured, null);
  assert.ok(data.henna.lanes.every(lane => lane.status === 'unknown'));
});

test('source timeouts settle to unknown without blocking the other sources', async () => {
  const data = await readMmsAiOps(envFor(), { ...options, timeoutMs: 10, readControls: () => new Promise(() => {}), readRouter: async () => { throw Error('private failure'); } });
  assert.equal(data.sources.snapshot.available, true);
  assert.equal(data.sources.kenji_controls.available, false);
  assert.equal(data.sources.telegram.available, false);
  assert.doesNotMatch(JSON.stringify(data), /private failure/);
});

test('new API rejects unauthenticated reads and every mutation before any service call', async () => {
  const calls = [], env = envFor({}, calls);
  assert.equal((await handleMmsAdminRequest(request('GET', false), env)).status, 401);
  for (const method of ['POST', 'PATCH', 'PUT', 'DELETE', 'HEAD']) {
    const response = await handleMmsAdminRequest(request(method), env);
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET');
  }
  assert.deepEqual(calls, []);
});

test('authenticated API uses binding and is never cached; absent other services stay unknown', async () => {
  const response = await handleMmsAdminRequest(request(), envFor());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const data = await response.json();
  assert.equal(data.queue.applications, 1);
  assert.equal(data.kenji.line_auto_reply_enabled, null);
  assert.equal(data.sources.telegram.available, false);
});

test('production route emits one connected panel with syntax-valid scripts and canonical handoffs', async () => {
  const response = await handleMmsAdminRequest(request('GET', true, '/internal/admin/mms'), envFor());
  const page = await response.text();
  assert.match(response.headers.get('content-security-policy'), /font-src 'self' https:\/\/cdn\.prod\.website-files\.com;/);
  assert.equal((page.match(/data-mms-ai-ops-v1 aria-labelledby/g) || []).length, 1);
  assert.equal(wireMmsAiOpsUi(page), page);
  assert.match(page, /fetch\('\/v1\/admin\/mms\/ai-ops'/);
  assert.match(page, /href="\/internal\/ceo\/kenji-control"/);
  assert.match(page, /href="\/internal\/admin\/telegram-brief"/);
  for (const script of page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new Script(script[1]));
});

const runtimeFlags = { schema:'mmd.kenji_runtime_flags.v1', line_auto_reply_enabled:false, model_reply_enabled:false, shadow_enabled:false };
function flagEnv(payload=runtimeFlags, responseStatus=200) {
  return {...envFor(), INTERNAL_TOKEN:'synthetic-internal', MEMBER_DASHBOARD_CHAT_WORKER:{fetch:async request=>{
    assert.equal(request.url,'https://member-dashboard-chat-worker.local/health');
    assert.equal(request.method,'GET');
    assert.equal(request.headers.get('authorization'),'Bearer synthetic-internal');
    assert.equal(request.headers.get('x-mmd-service-binding'),'admin-worker');
    assert.equal(request.headers.get('cookie'),null);
    return Response.json({ok:true,worker:'member-dashboard-chat-worker',kenji_runtime:payload},{status:responseStatus});
  }}};
}
test('real activation flags are read separately from kill switches over the existing service binding',async()=>{
 const result=await readMmsAiOps(flagEnv(),options);
 assert.equal(result.sources.kenji_runtime.available,true);
 assert.equal(result.kenji.line_auto_reply_enabled,false);
 assert.equal(result.kenji.model_reply_enabled,false);
 assert.equal(result.kenji.shadow_enabled,false);
 assert.equal(result.kenji.model_reply_kill_switch_active,true);
 assert.doesNotMatch(JSON.stringify(result),/synthetic-internal|authorization/);
});
test('a failed or malformed runtime read never becomes OFF or hides readable controls',async()=>{
 for(const env of [flagEnv(null),flagEnv({...runtimeFlags,shadow_enabled:'false'}),flagEnv(runtimeFlags,403),envFor()]){
  const result=await readMmsAiOps(env,options);
  assert.equal(result.sources.kenji_runtime.available,false);
  assert.equal(result.kenji.line_auto_reply_enabled,null);
  assert.equal(result.kenji.model_reply_enabled,null);
  assert.equal(result.kenji.shadow_enabled,null);
  assert.equal(result.sources.kenji_controls.available,true);
 }
});

test('MMS UI renders all six Kenji states and keeps a canonical v0 visible',async()=>{
 const data=await readMmsAiOps(flagEnv(),{...options,readControls:async()=>({line_oa_auto_reply:{enabled:false,version:7},model_keyword_auto_reply:{enabled:true,version:3},all_kenji_mutations:{enabled:false,version:0}})});
 class Element{
  constructor(){this.children=[];this.value='';this.hidden=false;this.listeners={};}
  set textContent(value){this.value=value;this.children=[];}
  get textContent(){return this.value+this.children.map(x=>x.textContent).join(' ');}
  replaceChildren(...children){this.children=children;this.value='';}
  append(...children){this.children.push(...children);}
  addEventListener(name,callback){this.listeners[name]=callback;}
 }
 const ids=new Map();const element=id=>{if(!ids.has(id))ids.set(id,new Element());return ids.get(id);};
 const html=wireMmsAiOpsUi('<head></head><body><section class="panel active" id="overview" aria-labelledby="overviewTitle"></section></body>');
 const code=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)][0][1];
 const context={document:{querySelector:()=>new Element(),getElementById:element,createElement:()=>new Element()},window:{addEventListener(){}},location:{hash:''},AbortController,setTimeout,clearTimeout,Date,fetch:async()=>Response.json(data)};
 new Script(code).runInNewContext(context);
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(element('mmsKenjiRuntime').textContent,/ตอบ LINE ปิด.*ใช้ Model ตอบ ปิด.*Shadow ปิด/);
 assert.match(element('mmsKenjiControls').textContent,/หยุดตอบ LINE ไม่ทำงาน Kenji Control · v7/);
 assert.match(element('mmsKenjiControls').textContent,/หยุดตอบ Model ทำงาน Kenji Control · v3/);
 assert.match(element('mmsKenjiControls').textContent,/หยุดการแก้ข้อมูล ไม่ทำงาน Kenji Control · ค่าเริ่มต้น v0/);
 assert.doesNotMatch(element('mmsKenjiControls').textContent,/ยังตรวจไม่ได้|อ่านค่าไม่สำเร็จ/);
 assert.equal(element('mmsOpsContent').hidden,false);
});

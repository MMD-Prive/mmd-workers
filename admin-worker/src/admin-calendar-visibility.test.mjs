import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { Script } from 'node:vm';
import entry from './admin-login-hero-worker.js';
import { createCredentialBoundAdminSession } from './credential-bound-admin-session.js';
import { readCalendarOwnerActor, calendarDate, inspectCalendarConnection, calendarPageResponse } from './admin-calendar-visibility.js';

const env = {ADMIN_LOGIN_CREDENTIAL:'test-only-owner-credential',ADMIN_SESSION_SECRET:'test-only-signing-key',AIRTABLE_API_KEY:'test-only-airtable'};
const origin='https://www.mmdbkk.com';
async function request(path,role='owner',method='GET') {
  const token=await createCredentialBoundAdminSession(new Request(origin+'/internal/admin/login/session'),{id:'test-owner',role},env);
  return new Request(origin+path,{method,headers:{Cookie:'mmd_admin_gate_v1='+token}});
}
const dataResponse=body=>Response.json(body);
function upstream(input,init={}) {
  const url=new URL(input instanceof Request ? input.url : String(input));
  assert.equal(init.method||'GET','GET','diagnostic and calendar read must never mutate');
  if(url.hostname==='api.cal.com') return dataResponse({status:'success',data:{id:7057823,description:'private upstream content must not be projected',owner:{email:'private@example.test'}}});
  if(url.hostname==='cal-sync-worker.malemodel-bkk.workers.dev') return dataResponse({ok:true,service:'cal-sync-worker',mode:'shadow',webhook_secret_configured:true,mapping_ledger_configured:true});
  if(url.hostname==='api.airtable.com') return dataResponse({records:[]});
  if(url.hostname==='mmdprive.webflow.io') return new Response('<!doctype html><html><body><main class="mcal"></main><script>window.__MMD_CALENDAR_WEBFLOW_V2__=true;fetch("/v1/admin/calendar")</script></body></html>',{headers:{'content-type':'text/html; charset=utf-8'}});
  throw new Error('unexpected host');
}
async function withFetch(fn,callback){const old=globalThis.fetch;globalThis.fetch=fn;try{return await callback();}finally{globalThis.fetch=old;}}

for(const role of ['owner','admin','super_admin','superadmin']) test('signed '+role+' can access Calendar',async()=>{
  const actor=await readCalendarOwnerActor(await request('/internal/admin/calendar',role),env);
  assert.equal(actor.role,role);
});
for(const role of ['guest','mms_partner','reviewer','viewer']) test('signed '+role+' cannot access Calendar',async()=>{
  assert.equal(await readCalendarOwnerActor(await request('/internal/admin/calendar',role),env),null);
});
test('unsigned actor headers and malformed cookies cannot create owner access',async()=>{
  const r=new Request(origin+'/v1/admin/calendar',{headers:{'x-mmd-admin-role':'owner',Cookie:'mmd_admin_gate_v1=not.a.signature'}});
  assert.equal(await readCalendarOwnerActor(r,env),null);
});
test('credential rotation revokes earlier Calendar sessions',async()=>{
  assert.equal(await readCalendarOwnerActor(await request('/v1/admin/calendar'),{...env,ADMIN_LOGIN_CREDENTIAL:'rotated'}),null);
});
test('expired signed session is rejected',async()=>{
  const real=Date.now;let r;
  try{Date.now=()=>real()-9*3600000;r=await request('/v1/admin/calendar');}finally{Date.now=real;}
  assert.equal(await readCalendarOwnerActor(r,env),null);
});
test('only real ISO calendar dates are accepted',()=>{
  assert.equal(calendarDate('2026-09-17'),'2026-09-17');
  for(const value of ['2026-02-30','2026-13-01','2026-00-00','2026-9-17',"2026-09-17');alert(1)//",''])assert.equal(calendarDate(value),'');
});
test('missing outbound key is distinct from working inbound webhook',async()=>{
  const calls=[];
  const result=await inspectCalendarConnection({},async(url,init)=>{calls.push(url);return upstream(url,init);});
  assert.equal(result.outbound.status,'missing_cal_api_key');assert.equal(result.outbound.api_verified,false);
  assert.equal(result.inbound.reachable,true);assert.equal(calls.length,1);assert.equal(result.mutations_attempted,false);
});
test('read verification requires exact event type and drops upstream private fields',async()=>{
  const result=await inspectCalendarConnection({CAL_API_KEY:'test-cal'},upstream);
  assert.equal(result.outbound.api_verified,true);assert.equal(result.outbound.booking_creation_verified,false);
  assert.doesNotMatch(JSON.stringify(result),/test-cal|private@example|description|owner/);
});
test('rejected Cal credential is not connected',async()=>{
  const result=await inspectCalendarConnection({CAL_API_KEY:'test-cal'},async(url,init)=>url.includes('api.cal.com')?new Response('{}',{status:401}):upstream(url,init));
  assert.equal(result.outbound.status,'credential_rejected');assert.equal(result.outbound.api_verified,false);
});
test('wrong event type and unavailable webhook remain unverified',async()=>{
  const result=await inspectCalendarConnection({CAL_API_KEY:'test-cal'},async(url)=>url.includes('api.cal.com')?dataResponse({status:'success',data:{id:123}}):new Response('{}',{status:503}));
  assert.equal(result.outbound.api_verified,false);assert.equal(result.inbound.reachable,false);assert.equal(result.inbound.mapping_ledger_configured,false);
});
for(const path of ['/internal/admin/calendar','/internal/admin/calendar/','/v1/admin/calendar?date=2026-09-17','/v1/admin/calendar/?date=2026-09-17','/v1/admin/calendar/reconcile','/v1/admin/calendar/model-photo?model_id=recModel000000001','/v1/admin/calendar/therapist-photo?therapist_id=mmst_test_1234','/v1/admin/calendar/availability-reminder','/v1/admin/calendar/availability-activation'])test('production entrypoint rejects unauthenticated '+path,async()=>{
  await withFetch(()=>{throw Error('unauthenticated network read');},async()=>{
    const r=await entry.fetch(new Request(origin+path),env,{});
    assert.equal(r.status,path.startsWith('/internal')?302:401);
  });
});
test('real production entrypoint renders authenticated Webflow Calendar presentation on both slash forms',async()=>{
  await withFetch(upstream,async()=>{
    for(const path of ['/internal/admin/calendar?date=2026-09-17','/internal/admin/calendar/?date=2026-09-17']){
      const r=await entry.fetch(await request(path),env,{});const html=await r.text();
      assert.equal(r.status,200);
      assert.equal(r.headers.get('x-mmd-calendar-surface'),'admin-worker-webflow-v2');
      assert.equal(r.headers.get('x-mmd-calendar-presentation'),'webflow');
      assert.match(html,/calendar-connection-state/);
      assert.match(html,/__MMD_CALENDAR_WEBFLOW_V2__/);
      assert.match(html,/calendar-owner-ui-v3-20260922/);
      assert.match(html,/data-mmd-calendar-legacy-banner/);
      assert.match(html,/\/v1\/admin\/calendar/);
      assert.doesNotMatch(html,/test-only-owner-credential|test-only-signing-key|test-only-airtable/);
    }
  });
});
test('signed owner can stream therapist profile photo without exposing the private R2 key',async()=>{
  const calls=[];
  const mms={
    async fetch(req){
      const url=new URL(req.url);calls.push(url.pathname+url.search);
      assert.equal(url.hostname,'mms.internal');
      if(url.pathname==='/internal/mms/admin/snapshot'){
        return Response.json({ok:true,therapists:[{
          therapist_id:'mmst_test_1234',
          display_name:'Boss',
          public_photo_url:'',
          profile_photo_r2_key:'mms/applications/mmsapp_0123456789abcdef01234567/profile_photo/boss.png',
        }]});
      }
      if(url.pathname==='/internal/mms/admin/file'){
        assert.match(url.searchParams.get('key')||'',/^mms\/applications\/mmsapp_/);
        return new Response(new Uint8Array([137,80,78,71]),{status:200,headers:{'content-type':'image/png'}});
      }
      return new Response('not found',{status:404});
    }
  };
  const scoped={...env,MMS_WORKER:mms};
  const response=await entry.fetch(await request('/v1/admin/calendar/therapist-photo?therapist_id=mmst_test_1234'),scoped,{});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('content-type'),'image/png');
  assert.equal(response.headers.get('x-mmd-calendar-therapist-photo'),'mms-private-r2');
  assert.doesNotMatch(response.url||'',/profile_photo|mmsapp_/);
  assert.deepEqual(calls.map(x=>x.split('?')[0]),['/internal/mms/admin/snapshot','/internal/mms/admin/file']);
});

test('signed owner can remind one non-fresh LINE-linked Model without exposing identity',async()=>{
  const writes=[];
  const values=new Map();
  const store={
    async get(key,type){
      if(!values.has(key))return null;
      const value=values.get(key);
      return type==='json'?JSON.parse(value):value;
    },
    async put(key,value,options){writes.push({key,value,options});values.set(key,value);}
  };
  const calls=[];
  const scoped={
    ...env,
    INTERNAL_TOKEN:'internal-secret',
    LINE_CHANNEL_ACCESS_TOKEN:'line-secret',
    SIGIL_AVAILABILITY_SNAPSHOTS:store,
  };
  const old=globalThis.fetch;
  globalThis.fetch=async(input,init={})=>{
    const url=new URL(input instanceof Request?input.url:String(input));
    calls.push({url:url.toString(),init});
    if(url.hostname==='api.airtable.com')return Response.json({records:[{id:'recModel1234567890',fields:{
      unique_key:'mdl_pri_str_master',
      working_name:'Master',
      line_user_id:'U0123456789abcdef0123456789abcdef',
      status:'active',
    }}]});
    if(url.hostname==='api.line.me')return Response.json({}, {status:200});
    throw new Error('unexpected adoption host '+url.hostname);
  };
  try{
    const base=await request('/v1/admin/calendar/availability-reminder','owner','POST');
    const req=new Request(base.url,{method:'POST',headers:{...Object.fromEntries(base.headers.entries()),'content-type':'application/json'},body:JSON.stringify({model_key:'mdl_pri_str_master'})});
    const response=await entry.fetch(req,scoped,{});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('x-mmd-calendar-availability-adoption'),'v1');
    const body=await response.json();
    assert.equal(body.ok,true);
    assert.equal(body.model_key,'mdl_pri_str_master');
    assert.equal(body.channel,'line');
    assert.doesNotMatch(JSON.stringify(body),/U0123456789abcdef|line-secret|internal-secret/);
    assert.equal(calls.filter(x=>new URL(x.url).hostname==='api.line.me').length,1);
    assert.equal(writes.some(x=>x.key==='availability-adoption:v1:reminder:mdl_pri_str_master'),true);
    assert.equal(writes.some(x=>x.key==='availability-adoption:v1:recovery:mdl_pri_str_master'),true);
  }finally{globalThis.fetch=old}
});

test('signed owner API reads MMD calendar without requiring auth/me actor projection',async()=>{
  await withFetch(upstream,async()=>{
    const r=await entry.fetch(await request('/v1/admin/calendar?date=2026-09-17'),env,{});
    assert.equal(r.status,200);const body=await r.json();assert.equal(body.schema,'mmd.admin.calendar.v1');assert.deepEqual(body.items,[]);
  });
});
test('signed owner can preview and run Cal reconcile only through private service binding',async()=>{
  const calls=[];
  const bridge={
    async fetch(request){
      calls.push({url:request.url,method:request.method});
      const url=new URL(request.url);
      assert.equal(url.hostname,'cal-sync.internal');
      assert.equal(url.pathname,'/internal/holds/reconcile');
      if(request.method==='GET')return Response.json({ok:true,mode:'preview',count:1,candidates:[{session_id:'SES-1'}]});
      if(request.method==='POST')return Response.json({ok:true,mode:'write',candidates:1,summary:{created:1,existing:0,in_progress:0,skipped:0,deferred:0}});
      return new Response(null,{status:405});
    },
  };
  const scoped={...env,CAL_SYNC_WORKER:bridge};
  const getResponse=await entry.fetch(await request('/v1/admin/calendar/reconcile?horizon_days=60&limit=10'),scoped,{});
  assert.equal(getResponse.status,200);
  assert.equal(getResponse.headers.get('x-mmd-calendar-write-authority'),'cal-sync-worker');
  assert.equal((await getResponse.json()).mode,'preview');
  const postResponse=await entry.fetch(await request('/v1/admin/calendar/reconcile?horizon_days=60&limit=10','owner','POST'),scoped,{});
  assert.equal(postResponse.status,200);
  const postBody=await postResponse.json();
  assert.equal(postBody.mode,'write');
  assert.equal(postBody.summary.created,1);
  assert.deepEqual(calls.map(x=>x.method),['GET','POST']);
});

test('signed owner can target one Session for Cal hold ensure',async()=>{
  const calls=[];
  const bridge={
    async fetch(request){
      const body=await request.json();
      calls.push({url:request.url,method:request.method,body});
      const url=new URL(request.url);
      assert.equal(url.hostname,'cal-sync.internal');
      assert.equal(url.pathname,'/internal/holds/ensure');
      assert.equal(body.session_id,'SES-TARGET-1');
      return Response.json({ok:true,state:'created',booking_uid:'cal-target-1'});
    },
  };
  const scoped={...env,CAL_SYNC_WORKER:bridge};
  const req=await request('/v1/admin/calendar/reconcile','owner','POST');
  const targeted=new Request(req.url,{
    method:'POST',
    headers:{...Object.fromEntries(req.headers.entries()),'content-type':'application/json'},
    body:JSON.stringify({session_id:'SES-TARGET-1'}),
  });
  const response=await entry.fetch(targeted,scoped,{});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-mmd-calendar-write-authority'),'cal-sync-worker');
  const body=await response.json();
  assert.equal(body.state,'created');
  assert.equal(body.booking_uid,'cal-target-1');
  assert.equal(calls.length,1);
});

test('invalid date and unsupported writes do not reach data sources',async()=>{
  await withFetch(()=>{throw Error('must not fetch');},async()=>{
    assert.equal((await entry.fetch(await request('/v1/admin/calendar?date=2026-02-30'),env,{})).status,400);
    assert.equal((await entry.fetch(await request('/v1/admin/calendar','owner','POST'),env,{})).status,405);
  });
});
test('rendered Webflow scripts are syntactically valid and connection check is explicitly read-only',async()=>{
  await withFetch(upstream,async()=>{
    const req=await request('/internal/admin/calendar?date=2026-09-17');
    const page=await calendarPageResponse(req,env,'2026-09-17');const html=await page.text();
    const scripts=[...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
    for(const [,attributes,source]of scripts)if(!attributes.includes('application/json'))new Script(source);
    const connection=JSON.parse(html.match(/id="calendar-connection-state">([\s\S]*?)<\/script>/)[1]);
    assert.equal(connection.mutations_attempted,false);
    assert.equal(page.headers.get('x-robots-tag'),'noindex, nofollow');
    assert.equal(page.headers.get('x-mmd-route-owner'),'admin-worker');
    if(process.env.CALENDAR_RENDER_PATH)writeFileSync(process.env.CALENDAR_RENDER_PATH,html);
  });
});

test('GitHub Webflow Calendar runtime compiles and reads only the protected same-origin API',()=>{
  const html=readFileSync(new URL('../../webflow/internal/admin/calendar/footer.html',import.meta.url),'utf8');
  assert.match(html,/__MMD_CALENDAR_WEBFLOW_V2__/);
  assert.match(html,/fetch\('\/v1\/admin\/calendar\?date='/);
  assert.match(html,/credentials:'include'/);
  assert.match(html,/\.webflow\\\.io/);
  assert.match(html,/calendar-owner-ui-v3-20260922/);
  assert.match(html,/calendar-owner-ui-v5-20260922/);
  assert.match(html,/\/v1\/admin\/calendar\/model-photo\?model_id=/);
  assert.match(html,/\/v1\/admin\/calendar\/therapist-photo\?therapist_id=/);
  assert.match(html,/วันนี้มีอะไรบ้าง/);
  assert.match(html,/ดูงาน รอมัดจำ คิวชน และเวลาว่างในจอเดียว/);
  assert.match(html,/ดูคิว งานที่ยืนยันแล้ว งานรอมัดจำ/);
  assert.match(html,/cleanInlineArtifacts/);
  assert.match(html,/\['วันนี้','รอมัดจำ','ยืนยันแล้ว','นายแบบ','เช็กราคา'\]/);
  assert.match(html,/งานยาว \/ ข้ามคืน/);
  assert.match(html,/นายแบบ & Therapist/);
  assert.match(html,/function availabilityView\(x\)/);
  assert.match(html,/ว่างตอนนี้/);
  assert.match(html,/ว่างวันนี้/);
  assert.match(html,/รอยืนยันใหม่/);
  assert.match(html,/Model App/);
  assert.match(html,/Model Console/);
  assert.match(html,/SIGIL ready/);
  assert.match(html,/\/v1\/admin\/calendar\/availability-reminder/);
  assert.match(html,/\/v1\/admin\/calendar\/availability-activation/);
  assert.match(html,/เตือน LINE/);
  assert.match(html,/สร้าง LINE link/);
  assert.match(html,/ผูก Model Key/);
  assert.match(html,/data-cal-remind/);
  assert.match(html,/data-cal-activate/);
  assert.match(html,/recoveryLabel/);
  assert.match(html,/reminder_follow_up_due/);
  assert.match(html,/follow-up/);
  assert.doesNotMatch(html,/\/available\|active\|ready\/\.test/);
  assert.match(html,/##INLINE\\d\+##/);
  const scripts=[...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
  for(const [,attributes,source]of scripts)if(!attributes.includes('application/json'))new Script(source);
  assert.doesNotMatch(html,/CAL_API_KEY|AIRTABLE_API_KEY|ADMIN_BEARER|ADMIN_SESSION_SECRET/);
});
test('calendar route manifest claims only four narrow production paths',()=>{
  const config=JSON.parse(readFileSync(new URL('../calendar-routes.json',import.meta.url)));
  assert.equal(config.worker,'admin-worker');
  assert.deepEqual(config.patterns,['mmdbkk.com/internal/admin/calendar*','www.mmdbkk.com/internal/admin/calendar*','mmdbkk.com/v1/admin/calendar*','www.mmdbkk.com/v1/admin/calendar*']);
});

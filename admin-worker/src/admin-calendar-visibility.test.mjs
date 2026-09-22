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
for(const path of ['/internal/admin/calendar','/internal/admin/calendar/','/v1/admin/calendar?date=2026-09-17','/v1/admin/calendar/?date=2026-09-17','/v1/admin/calendar/reconcile'])test('production entrypoint rejects unauthenticated '+path,async()=>{
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
  assert.match(html,/ดูคิว งานที่ยืนยันแล้ว งานรอมัดจำ/);
  assert.match(html,/cleanInlineArtifacts/);
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

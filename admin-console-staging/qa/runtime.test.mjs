import test from 'node:test';
const externalFetch = globalThis.fetch;
test.before(() => { globalThis.fetch = () => { throw new Error('External network forbidden'); }; });
test.after(() => { globalThis.fetch = externalFetch; });
import assert from 'node:assert/strict';
import { CreateJobFixtureRun } from '../.build/qa-bundle.mjs';
function body(percent, travel) {
  return {
    job_date: '2026-11-20', start_time: '19:00', end_time: '21:00',
    location_name: 'Fixture location', amount_thb: 8500 + travel,
    original_amount_thb: 10500 + travel, service_amount_thb: 8500,
    travel_fee_thb: travel, pricing_adjustment: 'discount', discount_kind: 'discount',
    payment_type: 'deposit', deposit_percent: percent,
    client_id: 'recCLIENT00000001', client_record_id: 'recCLIENT00000001',
    client_name: 'Fixture Client', model_name: 'Mira',
    model: { model_id: 'recMODEL000000001', model_name: 'Mira',
      model_lookup_key: 'private/standard/Mira', visibility: 'private', folder: 'standard' },
    client_lineage: { client_id: 'recCLIENT00000001', client_name: 'Fixture Client' },
    line_identity: { line_user_id: 'U11111111111111111111111111111111' },
    job_visibility: 'private', job_type: 'pn',
    work: { job_visibility: 'private', job_lane: 'private', work_type: 'pn',
      job_type: 'pn', model_folder: 'standard', selected_model_folder: 'standard', service_options: [] },
    job_details: { job_date: '2026-11-20', start_time: '19:00', end_time: '21:00',
      duration_minutes: 120, location_name: 'Fixture location', brief: 'Fixture brief' },
    notes: { operation_note: 'Fixture note' },
    payment: { amount_thb: 8500 + travel, service_amount_thb: 8500,
      payment_type: 'deposit', travel_fee_thb: travel },
    private_access: { selected_private_folder: 'standard', selected_orientation: 'gay',
      service_options: [], service_rates: {}, settlement_mode: 'platform' },
    service_pricing: { version: 1, currency: 'THB', settlement_mode: 'platform',
      client_base_amount_thb: 10500, model_base_payout_thb: null, addons: [],
      client_total_amount_thb: 8500, model_total_payout_thb: null,
      client_gross_amount_thb: 10500,
      discount: { mode: 'customer_request', type: 'amount', value: 2000,
        amount_thb: 2000, mmd_share_thb: 2000, model_share_thb: 0,
        kind: 'discount', reason: 'Fixture discount' } },
  };
}

function harness() {
 const data = new Map();
 const state = { storage: { get: async k => structuredClone(data.get(k)), put: async (k,v) => data.set(k,structuredClone(v)) } };
 const run = new CreateJobFixtureRun(state);
 const send = (path, value) => run.fetch(new Request('https://fixture.test'+path, value === undefined ? {} : {method:'POST',body:JSON.stringify(value),headers:{'Content-Type':'application/json'}}));
 return {send};
}
for (const percent of [20,25,30,35,40]) {
 test('fixture intent '+percent,async()=>{
  const {send}=harness();
  const source=await (await send('/v1/admin/models/sources')).json();
  const input=body(percent,1000);
  input.model_source_choice='partner';
  input.partner_attribution={partner_record_id:'recPARTNER0000001',source_revision:source.items[0].source_revision};
  const response=await send('/v1/admin/job/create',input);
  assert.equal(response.status,200,await response.clone().text());
  const evidence=await (await send('/qa/create-job/evidence')).json();
  assert.deepEqual(evidence.intents,[{amount_thb:Math.ceil(10500*percent/100/500)*500}]);
 });
}
for (const mode of ['changed','unavailable']) {
 test('fixture '+mode+' stops writes',async()=>{
  const {send}=harness();
  const source=await (await send('/v1/admin/models/sources')).json();
  await send('/qa/create-job/mode',{mode});
  const input=body(30,1000);
  input.model_source_choice='partner';
  input.partner_attribution={partner_record_id:'recPARTNER0000001',source_revision:source.items[0].source_revision};
  assert.equal((await send('/v1/admin/job/create',input)).status,mode==='changed'?409:503);
  assert.deepEqual((await (await send('/qa/create-job/evidence')).json()).intents,[]);
 });
}

import gateway from '../.build/qa-bundle.mjs';
test('Owner login and fixture-run boundary', async () => {
 const origin='https://mmd-admin-console-3143-staging.malemodel-bkk.workers.dev';
 const env={ADMIN_LOGIN_CREDENTIAL:'qa-owner',ADMIN_SESSION_SECRET:'qa-session'};
 const send=(path,opts)=>gateway.fetch(new Request(origin+path,opts),env,{});
 assert.equal((await send('/qa/create-job/evidence')).status,403);
 const login=await send('/internal/admin/login/session',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded','X-MMD-Login-Fetch':'1'},body:new URLSearchParams({action:'owner_login',credential:'qa-owner',next:'/internal/admin/console?view=create-job'})});
 assert.equal(login.status,200,await login.clone().text());
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const page=await send('/internal/admin/console?view=create-job',{headers:{Cookie:cookie}});
 assert.equal(page.status,200);
 assert.match(page.headers.get('set-cookie'),/mmd_fixture_run=/);
 assert.equal((await send('/qa/create-job/evidence',{headers:{Cookie:cookie}})).status,409);
 const runCookie=page.headers.get('set-cookie').split(';')[0];
 assert.equal((await send('/qa/create-job/mode',{method:'POST',headers:{Cookie:cookie+'; '+runCookie},body:'{"mode":"changed"}'})).status,403);
});
test('fixture runs are isolated',async()=>{
 const a=harness(), b=harness();
 await a.send('/qa/create-job/mode',{mode:'unavailable'});
 assert.equal((await (await b.send('/qa/create-job/evidence')).json()).mode,'valid');
});
test('authenticated gateway reaches intent and survives fixture-object restart',async()=>{
 const origin='https://mmd-admin-console-3143-staging.malemodel-bkk.workers.dev';
 const store=new Map();
 const state={storage:{get:async k=>structuredClone(store.get(k)),put:async(k,v)=>store.set(k,structuredClone(v))}};
 let object=new CreateJobFixtureRun(state);
 const env={ADMIN_LOGIN_CREDENTIAL:'qa-owner',ADMIN_SESSION_SECRET:'qa-session',CREATE_JOB_FIXTURE_RUNS:{idFromName:v=>v,get:()=>({fetch:r=>object.fetch(r)})}};
 const login=await gateway.fetch(new Request(origin+'/internal/admin/login/session',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded','X-MMD-Login-Fetch':'1'},body:new URLSearchParams({action:'owner_login',credential:'qa-owner',next:'/internal/admin/console'})}),env,{});
 const cookie=login.headers.get('set-cookie').split(';')[0]+'; mmd_fixture_run=11111111-1111-1111-1111-111111111111';
 const send=(path,value)=>gateway.fetch(new Request(origin+path,{headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},...(value?{method:'POST',body:JSON.stringify(value)}:{})}),env,{});
 const sources=await (await send('/v1/admin/models/sources')).json();
 const input=body(30,1000);
 input.model_source_choice='partner';
 input.partner_attribution={partner_record_id:'recPARTNER0000001',source_revision:sources.items[0].source_revision};
 const created=await send('/v1/admin/job/create',input);
 assert.equal(created.status,200,await created.clone().text());
 assert.equal((await created.json()).fixture,true);
 object=new CreateJobFixtureRun(state);
 const evidence=await (await send('/qa/create-job/evidence')).json();
 assert.deepEqual(evidence.intents,[{amount_thb:3500}]);
 assert.equal(evidence.issuances,1);
});

test('Owner Captain adapter frames the editor and persists exactly one amendment across a lost response', async () => {
 const origin='https://mmd-admin-console-3143-staging.malemodel-bkk.workers.dev';
 const store=new Map();
 const state={storage:{get:async k=>structuredClone(store.get(k)),put:async(k,v)=>store.set(k,structuredClone(v)),delete:async k=>store.delete(k)}};
 let object=new CreateJobFixtureRun(state);
 const env={ADMIN_LOGIN_CREDENTIAL:'qa-owner',ADMIN_SESSION_SECRET:'qa-session',CREATE_JOB_FIXTURE_RUNS:{idFromName:v=>v,get:()=>({fetch:r=>object.fetch(r)})}};
 const request=(path,options={})=>gateway.fetch(new Request(origin+path,options),env,{});
 assert.equal((await request('/qa/captain/evidence')).status,403);
 const login=await request('/internal/admin/login/session',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded','X-MMD-Login-Fetch':'1'},body:new URLSearchParams({action:'owner_login',credential:'qa-owner',next:'/internal/admin/console'})});
 const owner=login.headers.get('set-cookie').split(';')[0];
 const consolePath='/internal/admin/console?view=edit-job&session_id=sess_fixture_captain_zero';
 const page=await request(consolePath,{headers:{Cookie:owner}});
 assert.equal(page.status,200);
 const cookie=owner+'; '+page.headers.get('set-cookie').split(';')[0];
 const session='sess_fixture_captain_zero';
 const api='/v1/admin/jobs/edit';
 const send=(path,body)=>request(path,{headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
 const framed=await request('/internal/admin/jobs/edit?session_id='+session,{headers:{Cookie:cookie,Referer:origin+consolePath,'Sec-Fetch-Dest':'iframe','Sec-Fetch-Mode':'navigate','Sec-Fetch-Site':'same-origin'}});
 assert.equal(framed.status,200);
 assert.match(framed.headers.get('content-security-policy'),/frame-ancestors 'self'/);
 assert.match(await framed.text(),/captainAmend/);
 assert.equal((await send(api+'?session_id=sess_other')).status,403);
 const previewPath=api+'?session_id='+session+'&amendment=captain-zero';
 const preview=await (await send(previewPath)).json();
 const p=preview.proposal;
 assert.deepEqual([p.customer_total,p.partner_cost,p.received,p.remaining],[33000,23000,7500,25500]);
 assert.deepEqual((await (await send(previewPath)).json()).proposal,p);
 const evidence=async()=>await (await send('/qa/captain/evidence')).json();
 assert.deepEqual((await evidence()).writes,[]);
 const amendment={session_id:session,revision:preview.revision,request_id:'fixture-captain-test-001',amendment:p.amendment,model_id:p.model_id,evidence_revision:p.evidence_revision,reason:'Fixture approval'};
 await send('/qa/captain/mode',{mode:'changed'});
 assert.equal((await send(api,amendment)).status,409);
 await send('/qa/captain/mode',{mode:'unavailable'});
 assert.equal((await send(previewPath)).status,503);
 await send('/qa/captain/mode',{mode:'existing-link'});
 assert.equal((await send(previewPath)).status,409);
 assert.deepEqual((await evidence()).writes,[]);
 await send('/qa/captain/mode',{mode:'lose-reply'});
 assert.equal((await send(api,amendment)).status,503);
 object=new CreateJobFixtureRun(state);
 const retry=await send(api,amendment);
 assert.equal(retry.status,200,await retry.clone().text());
 assert.equal((await retry.json()).idempotent,true);
 const result=await evidence();
 assert.deepEqual(result.writes,['job','session']);
 assert.equal(result.jobs_model,'EMs20 - Zero');
 assert.equal(result.sessions_model,'EMs20 - Zero');
 assert.deepEqual([result.received,result.remaining,result.receipt_count,result.audit_count,result.payment_issue_attempts],[7500,25500,1,1,0]);
});

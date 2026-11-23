import {createPublicRateCatalog} from '../../sigil-booking-worker/src/public-rate-catalog.js';
import {createRequire} from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import {handleMemberBooking,digest} from '../src/member-booking-flow.js';
import {MemberBookingCoordinator} from '../src/member-booking-coordinator.js';
import {handleMemberBookingService,protectMemberBookingReference} from '../../sigil-booking-worker/src/member-booking-service.js';
const secret='fixture-only-booking-service-secret-123456789';
const model='recEligible0000001';
const sessions={a:{lineUserId:'line_a',memberId:'member_a',memberExists:true,memberProfile:{membership_status:'active'}},b:{lineUserId:'line_b',memberId:'member_b',memberExists:true,memberProfile:{membership_status:'active'}}};
const approvedRate={status:'approved',model_id:model,public_format:'dining',duration_minutes:90,model_fee_thb:4500};
const mockCatalog={lookup:async()=>({...approvedRate})};
const input=()=>({scope:'public',public_format:'dining',duration_minutes:90,budget_thb:5000,request_id:'12345678-1234-1234-1234-123456789abc',model_id:model,date:'2099-01-01',time:'18:30',area:'Bangkok',note:'fixture only'});
const request=(account,action='requests',body)=>new Request('https://mmdbkk.com/member/api/liff/booking/'+action,{method:body?'POST':'GET',headers:{origin:'https://mmdbkk.com',cookie:'__Host-mmd_liff_session='+account,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
async function fixture(run){
 const rows=[],actors=new Map(),writes=[],calls=[];let uncertain=false,available=true,searchOk=true;
 const native=globalThis.fetch;
 globalThis.fetch=async(url,init={})=>{assert.equal(init.method||'GET','GET','test must not call a real write');assert.equal(new URL(url).hostname,'api.airtable.com');return Response.json({records:rows});};
 const env={MMD_PUBLIC_RATE_CATALOG:mockCatalog,AUTH_SERVICE_SIGIL_BOOKING_TO_MEMBER_PAGES:secret,AIRTABLE_API_KEY:'fixture',AIRTABLE_BASE_ID:'fixture'};
 env.MEMBER_PAGES_WORKER={fetch:async r=>{const s=sessions[r.headers.get('cookie')?.split('=').at(-1)];return s?Response.json({ok:true,identity_binding_verified:true,memberRef:await digest('mmd-discovery-member-v1:'+s.memberId)}):Response.json({ok:false},{status:401});}};
 const delegate=async (r,context)=>{
  calls.push(new URL(r.url).pathname);
  if(new URL(r.url).pathname.endsWith('/search'))return Response.json({ok:searchOk,discovery_scope:'public',visibility_enforced:searchOk,items:available?[{model_id:model,scope:'public',display_name:'Fixture',primary_media_id:''}]:[]});
  const body=await r.json();body.resolver_payload_json={...body.resolver_payload_json,my_mmd_owner:context?.ownerMetadata};writes.push(body);rows.push({id:'recFixture',fields:{booking_ref:body.booking_ref,resolver_payload_json:JSON.stringify(body.resolver_payload_json),'Preferred Date':body.preferred_date,'Preferred Time':body.preferred_time}});
  if(uncertain)throw Error('lost response after write');return Response.json({ok:true,booking_ref:body.booking_ref});
 };
 env.SIGIL_BOOKING_WORKER={fetch:r=>handleMemberBookingService(r,env,delegate)};
 const namespace={idFromName:x=>x,get:id=>{
  if(!actors.has(id)){const data=new Map();let lane=Promise.resolve();const state={storage:{get:k=>data.get(k),put:(k,v)=>data.set(k,v)},blockConcurrencyWhile(fn){const result=lane.then(fn);lane=result.catch(()=>{});return result;}};actors.set(id,new MemberBookingCoordinator(state,env));}return actors.get(id);
 }};
 env.MEMBER_BOOKING_COORDINATOR=namespace;
 const deps={readSession:async r=>sessions[r.headers.get('cookie')?.split('=').at(-1)]||null,resolveClient:async(e,line)=>({id:'client_'+line})};
 try{await run({env,deps,writes,rows,calls,setUncertain:v=>uncertain=v,setAvailable:v=>available=v,setSearch:v=>searchOk=v});}finally{globalThis.fetch=native;}
}
test('authenticated search → intake → own readback; concurrent replay writes once and never confirms a job',async()=>fixture(async({env,deps,writes})=>{
 const search=await handleMemberBooking(request('a','search?q=Fi'),env,deps);assert.equal(search.status,200);assert.equal((await search.json()).items[0].model_id,model);
 const results=await Promise.all([handleMemberBooking(request('a','requests',input()),env,deps),handleMemberBooking(request('a','requests',input()),env,deps)]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,201]);assert.equal(writes.length,1);
 const body=await results[0].json();assert.equal(body.status,'request_pending_admin_review');assert.equal(body.job_id,undefined);assert.equal(body.session_id,undefined);
 const own=await (await handleMemberBooking(request('a'),env,deps)).json();assert.equal(own.items.length,1);assert.equal(own.items[0].request_ref,body.request_ref);
 const other=await (await handleMemberBooking(request('b'),env,deps)).json();assert.equal(other.items.length,0);
 const changed={...input(),time:'19:00'};assert.equal((await handleMemberBooking(request('a','requests',changed),env,deps)).status,409);assert.equal(writes.length,1);
}));
test('timeout after persistence is discoverable but never automatically retried or notified again',async()=>fixture(async({env,deps,writes,setUncertain})=>{
 setUncertain(true);assert.equal((await handleMemberBooking(request('a','requests',input()),env,deps)).status,409);
 assert.equal((await handleMemberBooking(request('a','requests',input()),env,deps)).status,409);assert.equal(writes.length,1);
 assert.equal((await (await handleMemberBooking(request('a'),env,deps)).json()).items.length,1);
}));
test('missing coordination, anonymous, revoked, identity injection, origin and stale selection fail closed',async()=>fixture(async({env,deps,writes,setAvailable})=>{
 assert.equal((await handleMemberBooking(request('unknown'),env,deps)).status,401);
 const blocked={...deps,readSession:async()=>({...sessions.a,memberProfile:{membership_status:'revoked'}})};
 assert.equal((await handleMemberBooking(request('a'),env,blocked)).status,403);
 assert.equal((await handleMemberBooking(request('a','requests',{...input(),member_id:'member_b'}),env,deps)).status,400);
 const cross=new Request(request('a','requests',input()),{headers:{origin:'https://evil.test',cookie:'a'}});assert.equal((await handleMemberBooking(cross,env,deps)).status,403);
 const ns=env.MEMBER_BOOKING_COORDINATOR;delete env.MEMBER_BOOKING_COORDINATOR;assert.equal((await handleMemberBooking(request('a','requests',input()),env,deps)).status,503);env.MEMBER_BOOKING_COORDINATOR=ns;
 setAvailable(false);const rejected=await handleMemberBooking(request('a','requests',input()),env,deps);assert.equal(rejected.status,422);assert.equal((await rejected.json()).outcome,'not_started');assert.equal(writes.length,0);
}));
test('unsigned ownership injection and existing member request overwrite are denied',async()=>fixture(async({env,deps,rows})=>{
 await handleMemberBooking(request('a','requests',input()),env,deps);
 const ref=rows[0].fields.booking_ref;
 const overwrite=new Request('https://sigil.mmdbkk.com/sigil/api/booking/intake',{method:'POST',body:JSON.stringify({booking_ref:ref})});assert.equal((await protectMemberBookingReference(overwrite,env)).status,403);
 rows.push({fields:{booking_ref:'mmdreq_'+'b'.repeat(64),resolver_payload_json:JSON.stringify({my_mmd_owner:{owner:await digest('my-mmd-booking-owner-v1:client_line_a:member_a'),signature:'forged',state:'submitted'}})}});
 const list=await (await handleMemberBooking(request('a'),env,deps)).json();assert.equal(list.items.length,1);
 const noSecret=new Request('https://sigil-booking.internal/__internal/member-booking',{method:'POST',body:'{}'});assert.equal((await handleMemberBookingService(noSecret,env,()=>{throw Error('must not call');})).status,401);
}));
test('service delegates actual SIGIL search/media policy and actual intake with signed ownership retained',async()=>{
 const {default:runtime}=await import('../../sigil-booking-worker/src/runtime-index.js');
 const rows=[],native=globalThis.fetch;let writes=0;
 const env={MMD_PUBLIC_RATE_CATALOG:mockCatalog,AUTH_SERVICE_SIGIL_BOOKING_TO_MEMBER_PAGES:secret,AIRTABLE_API_KEY:'fixture',AIRTABLE_BASE_ID:'fixture',AIRTABLE_TABLE_BOOKING_REQUESTS_ID:'Bookings',AIRTABLE_TABLE_MODELS_ID:'Models',AIRTABLE_TABLE_MODEL_OFFER_RULES:'Rules',AIRTABLE_TABLE_MODEL_MEDIA_ID:'Media',AIRTABLE_TABLE_MEMBERS_ID:'Members',AIRTABLE_TABLE_ENTITLEMENTS_ID:'Entitlements',TELEGRAM_NOTIFY_ENABLED:'false'};
 env.MEMBER_PAGES_WORKER={fetch:async()=>Response.json({ok:true,identity_binding_verified:true,memberId:'member_a',memberRef:await digest('mmd-discovery-member-v1:member_a')})};
 globalThis.fetch=async(input,init={})=>{
  const url=new URL(input instanceof URL?input:typeof input==='string'?input:input.url);assert.equal(url.hostname,'api.airtable.com');const table=decodeURIComponent(url.pathname.split('/')[3]||'');
  if((init.method||'GET')!=='GET'){assert.equal(table,'Bookings');writes++;const fields=JSON.parse(init.body).fields;const row={id:'recBookingFixture',fields};rows.push(row);return Response.json(row);}
  if(table==='Members'){const member={id:'recMemberFixture01',fields:{member_id:'member_a',status:'active','MMD — Member Entitlements':['recEntitlement0001']}};return Response.json(url.pathname.endsWith('/recMemberFixture01')?member:{records:[member]});}
  if(table==='Entitlements')return Response.json({records:[{id:'recEntitlement0001',fields:{member:['recMemberFixture01'],capability:'public_member',member_lifecycle_status:'active',access_status:'active'}}]});
  if(table==='Models')return Response.json({records:[{id:model,fields:{working_name:'White',status:'active',can_work_public:true,orientation:'straight',private_tier:'premium'}}]});
  if(table==='Bookings')return Response.json({records:rows});
  return Response.json({records:[]});
 };
 try{
  const clientId='recPublicClient0001';
  const owner=await digest('my-mmd-booking-owner-v1:'+clientId+':member_a'),reference='mmdreq_'+'a'.repeat(64);
  const call=operation=>runtime.fetch(new Request('https://sigil-booking.internal/__internal/member-booking',{method:'POST',headers:{cookie:'__Host-mmd_liff_session=a','x-mmd-member-booking-secret':secret,'content-type':'application/json'},body:JSON.stringify({operation,owner,member_id:'member_a',client_id:clientId,reference,payload:{model_id:model,date:'2099-01-01',time:'18:00',area:'Bangkok',note:'fixture',public_format:'dining',duration_minutes:90,budget_thb:10000}})}),env);
  const search=await call('search');assert.equal(search.status,200);assert.equal((await search.json()).items[0]?.model_id,model);
  const submit=await call('submit');assert.equal(submit.status,201,JSON.stringify(await submit.clone().json()));assert.equal(writes,1);
  assert.equal(JSON.parse(rows[0].fields.resolver_payload_json).my_mmd_owner.owner,owner);
  const publicOwner=JSON.parse(rows[0].fields.resolver_payload_json).public_booking_owner;
  assert.equal(publicOwner.member_id,'member_a');assert.equal(publicOwner.schema,'public_booking_owner_v1');assert.match(publicOwner.signature,/^[a-f0-9]{64}$/);
  assert.equal(rows[0].fields['Client Notes'],'พื้นที่: Bangkok\nfixture');
  const stored=JSON.parse(rows[0].fields.resolver_payload_json);
  assert.equal(rows[0].fields['Preference Text'],'หมวดงาน Public: dining');
  assert.equal(stored.customer_search.service_context,'dining');
  assert.equal(stored.customer_search.duration_minutes,90);
  assert.equal(stored.customer_search.budget.max_thb,10000);
  const list=await call('list');const {items}=await list.json();
  assert.equal(items.length,1);assert.equal(items[0].request_ref,reference);
  assert.equal(items[0].public_format,'dining');
  assert.equal(items[0].duration_minutes,90);
  assert.equal(items[0].budget_thb,10000);
  const {readCreateJobPublicRequest}=await import('../../admin-worker/src/create-job-public-request.js');
  const endpoint='https://local.test/internal/admin/jobs/create-job/public-request?client_id=';
  const lookup=(client,ref='',actor={role:'owner'})=>readCreateJobPublicRequest(new Request(endpoint+client+(ref?'&ref='+ref:'')),env,actor);
  assert.equal((await lookup(clientId,'',{})).status,403);
  assert.deepEqual((await (await lookup('recPublicClient0002')).json()).items,[]);
  assert.equal((await lookup('recPublicClient0002',reference)).status,404);
  const fields=rows[0].fields, original=fields.resolver_payload_json;
  const altered=JSON.parse(original);
  altered.my_mmd_owner.publicDetails.public_format='travel';
  fields.resolver_payload_json=JSON.stringify(altered);
  assert.equal((await lookup(clientId,reference)).status,404);
  fields.resolver_payload_json=original;
  fields.lane='private';
  assert.deepEqual((await (await lookup(clientId)).json()).items,[]);
  fields.lane='public';
  const options=(await (await lookup(clientId)).json()).items;
  assert.equal(options.length,1);assert.equal(options[0].ref,reference);
  const chosen=await (await lookup(clientId,options[0].ref)).json();
  assert.equal(chosen.work_type,'dining');assert.equal(chosen.budget_thb,10000);
  assert.equal(chosen.duration_minutes,90);assert.equal(chosen.model_name,'White');
  const {JSDOM}=createRequire(import.meta.url)('jsdom');
  const {handleCreateJobWorkerPage}=await import('../../admin-worker/src/create-job-worker-page.js');
  const pageUrl='https://local.test/internal/admin/jobs/create-job';
  const html=await handleCreateJobWorkerPage(new Request(pageUrl)).text();
  const dom=new JSDOM(html,{url:pageUrl,runScripts:'outside-only'});
  const w=dom.window,doc=w.document,el=id=>doc.getElementById(id);
  const operations=[];
  w.scrollTo=()=>{};
  try{
    w.fetch=async(path,init={})=>{
      operations.push(path);
      if(path.includes('lineage-lookup'))return Response.json({ok:true,records:[{client_id:clientId,client_name:'Fixture'}]});
      if(path.includes('public-request'))return readCreateJobPublicRequest(new Request(new URL(path,pageUrl)),env,{role:'owner'});
      return Response.json({ok:true});
    };
    for(const script of doc.scripts)if(!script.src)w.eval(script.textContent);
    el('cq').value=clientId;await el('cs').onclick();el('clients').querySelector('.result').click();
    doc.querySelector('input[name=visibility][value=public]').click();
    for (const blank of ['', '   ']) {
      el('bookingRef').value=blank;
      const before=operations.length;
      await el('loadBooking').onclick();
      assert.equal(operations.length,before,'blank reference must not call an API');
      assert.match(el('bookingSummary').textContent,/เลือกรายการหรือกรอกรหัสคำขอ/);
      assert.equal(doc.activeElement,el('bookingRef'));
    }
    await el('showBookings').onclick();assert.equal(el('bookingOptions').options.length,2);
    el('bookingOptions').value=reference;el('bookingOptions').onchange();
    for(let n=0;n<20 && !el('publicFormat').value;n++)await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(el('publicFormat').value,'dining');
    assert.match(el('bookingSummary').textContent,/White.*dining.*90.*10,000/);
    assert.equal(el('amount').value,'');
    assert.equal(operations.some(path=>path.includes('create-session')||path.includes('preflight')),false);
  }finally{dom.window.close()}
  const retry=await call('submit');assert.equal(retry.status,200);
  assert.equal((await retry.json()).request_ref,reference);assert.equal(writes,1);
 }finally{globalThis.fetch=native;}
});
test('actual Private flow reuses exact session/member lookup and current entitlement; no search writes or EMs/GWs reveal',async()=>{
 const {default:runtime}=await import('../../sigil-booking-worker/src/runtime-index.js');
 const rows=[],native=globalThis.fetch,recordId='recMemberFixture01',entId='recEntitlement0001';let capability='private_premium',lifecycle='active',writes=0,blockedModel=false;
 const env={MMD_PUBLIC_RATE_CATALOG:mockCatalog,AUTH_SERVICE_SIGIL_BOOKING_TO_MEMBER_PAGES:secret,AIRTABLE_API_KEY:'fixture',AIRTABLE_BASE_ID:'fixture',AIRTABLE_TABLE_BOOKING_REQUESTS_ID:'Bookings',AIRTABLE_TABLE_MODELS_ID:'Models',AIRTABLE_TABLE_MEMBERS_ID:'Members',AIRTABLE_TABLE_ENTITLEMENTS_ID:'Entitlements',AIRTABLE_TABLE_MODEL_OFFER_RULES:'Rules',AIRTABLE_TABLE_MODEL_MEDIA_ID:'Media',TELEGRAM_NOTIFY_ENABLED:'false'};
 const member={id:recordId,fields:{member_id:'member_a',status:'active','MMD — Member Entitlements':[entId]}};
 env.MEMBER_PAGES_WORKER={fetch:async r=>Response.json({ok:true,identity_binding_verified:true,memberRef:await digest('mmd-discovery-member-v1:member_'+r.headers.get('cookie')?.split('=').at(-1))})};
 globalThis.fetch=async(input,init={})=>{
  const url=new URL(input instanceof URL?input:typeof input==='string'?input:input.url);assert.equal(url.hostname,'api.airtable.com');const table=decodeURIComponent(url.pathname.split('/')[3]||'');
  if((init.method||'GET')!=='GET'){assert.equal(table,'Bookings');writes++;const fields=JSON.parse(init.body).fields;const row={id:'recBookingFixture',fields};rows.push(row);return Response.json(row);}
  if(table==='Members')return Response.json(url.pathname.endsWith('/'+recordId)?member:{records:[member]});
  if(table==='Entitlements')return Response.json({records:[{id:entId,fields:{member:[recordId],capability,member_lifecycle_status:lifecycle,access_status:lifecycle}}]});
  if(table==='Models')return Response.json({records:[{id:model,fields:{working_name:blockedModel?'EMs04':'Private Fixture',status:'active',can_work_public:false,can_work_private:true,private_tier:'premium',orientation:'straight',private_work_format:'pn'}}]});
  if(table==='Bookings'){const formula=url.searchParams.get('filterByFormula')||'';return Response.json({records:rows.filter(r=>formula.includes("FIND('")||formula.includes(r.fields.booking_ref))});}
  return Response.json({records:[]});
 };
 try{
  const owner=await digest('my-mmd-booking-owner-v1:client_a:member_a');
  const call=(operation,extra={})=>runtime.fetch(new Request('https://sigil-booking.internal/__internal/member-booking',{method:'POST',headers:{cookie:'__Host-mmd_liff_session=a','x-mmd-member-booking-secret':secret,'content-type':'application/json'},body:JSON.stringify({operation,owner,member_id:'member_a',...extra})}),env);
  assert.deepEqual((await (await call('context')).json()).scopes,['public','private']);
  const search=await call('search',{scope:'private'});assert.equal(search.status,200);assert.equal((await search.json()).items[0].model_id,model);assert.equal(writes,0);
  const reference='mmdreq_'+'c'.repeat(64),payload={scope:'private',model_id:model,date:'2099-01-01',time:'18:00',area:'Bangkok',note:'fixture'};
  lifecycle='grace';const denied=await call('submit',{reference,payload});assert.equal(denied.status,403);assert.equal((await denied.json()).outcome,'not_started');assert.equal(writes,0);
  lifecycle='active';blockedModel=true;assert.equal((await call('search',{scope:'private'})).status,200);assert.equal((await (await call('search',{scope:'private'})).json()).items.length,0);assert.equal((await call('submit',{reference,payload})).status,422);assert.equal(writes,0);
  blockedModel=false;const saved=await call('submit',{reference,payload});assert.equal(saved.status,201,JSON.stringify(await saved.clone().json()));assert.equal(writes,1);assert.equal(rows[0].fields.lane,'private');
  const data=await (await call('list')).json();assert.equal(data.items[0].scope,'private');
  rows[0].fields['Request Status']='cancelled';assert.equal((await (await call('list')).json()).items[0].status,'cancelled');
  capability='private_standard';assert.deepEqual((await (await call('context')).json()).scopes,['public']);
  capability='black_card';assert.deepEqual((await (await call('context')).json()).scopes,['public']);
  const wrong=new Request('https://sigil-booking.internal/__internal/member-booking',{method:'POST',headers:{cookie:'__Host-mmd_liff_session=b','x-mmd-member-booking-secret':secret},body:JSON.stringify({operation:'search',owner,member_id:'member_a',scope:'private'})});assert.equal((await runtime.fetch(wrong,env)).status,401);
 }finally{globalThis.fetch=native;}
});

test('coordinator persists a definite pre-write rejection separately from unknown outcomes',async()=>fixture(async({env,deps,writes,setAvailable})=>{
 setAvailable(false);const first=await handleMemberBooking(request('a','requests',input()),env,deps);assert.equal(first.status,422);assert.equal((await first.json()).outcome,'not_started');
 setAvailable(true);const replay=await handleMemberBooking(request('a','requests',input()),env,deps);assert.equal(replay.status,422);assert.equal(writes.length,0);
 const corrected={...input(),request_id:'23456789-1234-1234-1234-123456789abc'};assert.equal((await handleMemberBooking(request('a','requests',corrected),env,deps)).status,201);assert.equal(writes.length,1);
}));

test('exact active request is reconciled even outside latest list, still requiring signed owner',async()=>fixture(async({env,deps,rows})=>{
 const saved=await (await handleMemberBooking(request('a','requests',input()),env,deps)).json();rows[0].fields['Request Status']='review_required';
 const fixtureFetch=globalThis.fetch;globalThis.fetch=async(url,init)=>new URL(url).searchParams.get('filterByFormula')?.startsWith('FIND(')?Response.json({records:[]}):fixtureFetch(url,init);
 try{const res=await handleMemberBooking(request('a','requests?request_id='+input().request_id),env,deps);const data=await res.json();assert.equal(data.active_request_ref,saved.request_ref);assert.equal(data.items[0].request_ref,saved.request_ref);assert.equal(data.items[0].status,'under_review');
 const other=await (await handleMemberBooking(request('b','requests?request_id='+input().request_id),env,deps)).json();assert.equal(other.items.length,0);
 }finally{globalThis.fetch=fixtureFetch;}
}));

test('past dates and blank areas are definite pre-write failures and corrected requests may submit',async()=>fixture(async({env,deps,writes,calls})=>{
 for(const bad of [{date:'2000-01-01'},{area:'   '}]){
  const response=await handleMemberBooking(request('a','requests',{...input(),...bad}),env,deps);
  assert.equal(response.status,400);assert.deepEqual(await response.json(),{ok:false,error:'invalid_request',outcome:'not_started'});
 }
 assert.equal(writes.length,0);assert.equal(calls.length,0);
 const corrected=await handleMemberBooking(request('a','requests',input()),env,deps);assert.equal(corrected.status,201);assert.equal(writes.length,1);
}));

test('White Public details round-trip and retries do not create another booking',async()=>fixture(async({env,deps,writes,calls})=>{
 const fields={public_format:'dining',duration_minutes:90,budget_thb:10000};
 const payload={...input(),...fields};
 const first=await handleMemberBooking(request('a','requests',payload),env,deps);
 assert.equal(first.status,201,JSON.stringify(await first.clone().json()));
 const saved=await first.json();
 const retry=await handleMemberBooking(request('a','requests',payload),env,deps);
 assert.equal(retry.status,200);assert.equal((await retry.json()).request_ref,saved.request_ref);
 assert.equal((await handleMemberBooking(request('a','requests',{...payload,budget_thb:11000}),env,deps)).status,409);
 assert.equal(writes.length,1);
 const {items}=await (await handleMemberBooking(request('a'),env,deps)).json();
 assert.equal(items.length,1);
 for(const [key,value] of Object.entries(fields))assert.equal(items[0][key],value);
 for(const bad of [{public_format:'pn'},{duration_minutes:0},{budget_thb:4999},{scope:'private'}]){
  const response=await handleMemberBooking(request('a','requests',{...payload,...bad}),env,deps);
  assert.equal(response.status,400);
  assert.equal((await response.json()).outcome,'not_started');
 }
 assert.deepEqual(calls,['/sigil/api/models/search','/sigil/api/booking/intake']);
}));

test('public rate requires exact approved model, category and duration before intake',async()=>{
 for(const override of [{status:'pending'},{model_id:'recOtherModel00001'},{public_format:'event'},
   {duration_minutes:120},{model_fee_thb:4499},{model_fee_thb:5001}]) {
  await fixture(async({env,deps,writes})=>{
   env.MMD_PUBLIC_RATE_CATALOG={lookup:async(id,format,minutes)=>{
    assert.deepEqual([id,format,minutes],[model,'dining',90]);
    return {...approvedRate,...override};
   }};
   const response=await handleMemberBooking(request('a','requests',input()),env,deps);
   assert.equal(response.status,422);assert.equal(writes.length,0);
  });
 }
});

test('120-minute approved fee uses its own record and does not become customer budget',async()=>fixture(async({env,deps,writes})=>{
 env.MMD_PUBLIC_RATE_CATALOG={lookup:async()=>({...approvedRate,duration_minutes:120,model_fee_thb:5500})};
 const response=await handleMemberBooking(request('a','requests',{...input(),duration_minutes:120,budget_thb:6000}),env,deps);
 assert.equal(response.status,201);assert.equal(writes[0].duration_minutes,120);
 assert.equal(writes[0].budget_thb,6000);
}));
test('missing mock catalog stops before intake',async()=>fixture(async({env,deps,writes})=>{
 delete env.MMD_PUBLIC_RATE_CATALOG;
 const response=await handleMemberBooking(request('a','requests',input()),env,deps);
 assert.equal(response.status,503);assert.equal(writes.length,0);
}));

test('catalog outage replays the original 503 without creating a booking', async () => fixture(async ({env,deps,writes}) => {
  let lookups = 0;
  env.MMD_PUBLIC_RATE_CATALOG = {lookup: async () => {
    lookups++;
    throw new Error('mock catalog offline');
  }};
  const payload = input();
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await handleMemberBooking(request('a','requests',payload),env,deps);
    assert.equal(response.status,503);
    const body = await response.json();
    assert.equal(body.error,'approved_rate_unavailable');
    assert.equal(body.outcome,'not_started');
    assert.equal(writes.length,0);
  }
  assert.equal(lookups,1);
}));

const registerRate = {
  ...approvedRate,
  approved_by: 'MMD-MOCK',
  approved_at: '2099-01-01T09:00:00+07:00',
  approval_ref: 'MOCK-ONLY-001',
};

test('Public register supplies the exact approved rate to Booking', async () => fixture(async ({env, deps, writes}) => {
  env.MMD_PUBLIC_RATE_CATALOG = createPublicRateCatalog([
    {...registerRate, status: 'retired', model_fee_thb: 7000},
    {...registerRate, public_format: 'event', model_fee_thb: 8000},
    registerRate,
  ]);
  const response = await handleMemberBooking(request('a', 'requests', input()), env, deps);
  assert.equal(response.status, 201);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].budget_thb, 5000);
}));

test('Public register rejects unmatched, unapproved, undocumented or ambiguous rates', async () => {
  const cases = [
    [{...registerRate, model_id: 'recOtherModel00001'}],
    [{...registerRate, public_format: 'event'}],
    [{...registerRate, duration_minutes: 120}],
    [{...registerRate, status: 'draft'}],
    [{...registerRate, status: 'retired'}],
    [{...registerRate, approval_ref: '  '}],
    [registerRate, {...registerRate}],
  ];
  for (const rows of cases) {
    await fixture(async ({env, deps, writes}) => {
      env.MMD_PUBLIC_RATE_CATALOG = createPublicRateCatalog(rows);
      const response = await handleMemberBooking(request('a', 'requests', input()), env, deps);
      assert.equal(response.status, 422, JSON.stringify(rows));
      assert.equal(writes.length, 0);
    });
  }
});

test('Booking reads White dining from a server-side JSON catalog binding', async () => fixture(async ({env, deps, writes}) => {
  env.MMD_PUBLIC_RATE_CATALOG = [registerRate];
  const payload = {...input(), public_format: 'dining', duration_minutes: 90, budget_thb: 10000};
  const submit = () => handleMemberBooking(request('a', 'requests', payload), env, deps);
  const first = await submit();
  assert.equal(first.status, 201);
  const original = await first.json();
  const retry = await submit();
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).request_ref, original.request_ref);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].budget_thb, 10000);
}));

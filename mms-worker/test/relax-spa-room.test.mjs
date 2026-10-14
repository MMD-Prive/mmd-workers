import test from 'node:test';
import assert from 'node:assert/strict';
import { agreementV3, agreementV2, roomPlan, inclusivePlan } from '../src/relax-spa-agreement.mjs';
import { RelaxSpaLedger, applySpaCommand, maybeHandleRelaxSpaLedger } from '../src/relax-spa-ledger.mjs';
import { produceSpaJob, spaJobId } from '../src/relax-spa-job.mjs';
const owner={id:'per',role:'owner'},partner={id:'mms-partner:synthetic',role:'mms_partner'};
const therapist={id:'mmst_'+'a'.repeat(24),name:'Synthetic Therapist',status:'Active'};
const now=()=>new Date().toISOString();
const body=(extra={})=>({schema_version:3,status:'confirmed',title:'Synthetic room-only agreement',therapist_id:therapist.id,spa_id:'relax-spa-by-9',duration_minutes:90,
  therapist_amount:60001,room:{type:'Synthetic room only',amount:20001,fixed_units:1,covered_minutes:120,unit_description:'one agreed block; no prorating',includes:'Room only; excludes Therapist',rate_evidence_ref:'synthetic-room-rate'},partner_amount:0,mms_mode:'fixed_fee',mms_amount:20000,
  travel:{estimate_amount:0,method:'walk from home and return',assessed_at:'2026-10-01T00:00:00Z',evidence_ref:'synthetic-home-roundtrip'},
  payees:{therapist:'Synthetic therapist payee',spa:'Synthetic room payee',mms:'Synthetic MMS payee'},terms_ref:'synthetic-terms',approval_confirmed:true,adjustments:[],...extra});
const throws=(fn,code)=>assert.throws(fn,e=>e.code===code);
function fixture(){const state={referrals:[],agreements:[],services:[],events:[],requests:{}};
 const cmd=(c,b,a=owner,canonical={therapist})=>applySpaCommand(state,a,c,{request_key:crypto.randomUUID(),...b},canonical);
 const r=cmd('referrals',{therapist_id:therapist.id},partner).id;cmd('referral-decision',{referral_id:r,decision:'accepted',evidence_ref:'synthetic-spa-accept'});
 const a=cmd('agreements',body()).id,s=cmd('drafts',{referral_id:r}).id;cmd('quotes',{service_id:s,agreement_id:a,approval_confirmed:true});return{state,cmd,service:state.services[0]};}

test('room-only charge is separate from inclusive Therapist pay; fixed fee derives C once',()=>{
 const a=agreementV3(body(),owner,now());assert.equal(a.customer_amount,100002);
 assert.deepEqual(a.preview.shares,{therapist:60001,spa:20001,partner:0,mms:20000});
 assert.equal(a.preview.rounding,'exact_integer_satang_no_proration');
 assert.equal(a.room.includes,'Room only; excludes Therapist');
 throws(()=>agreementV3(body({customer_amount:120002}),owner,now()),'ALLOCATION_MUST_BALANCE');
});
test('residual MMS is C-T-R-P, named referrer is separate even when room and referral payee match',()=>{
 const a=agreementV3(body({mms_mode:'residual',mms_amount:null,customer_amount:110003,partner_amount:1001,referrer_id:partner.id,payees:{therapist:'Therapist',spa:'Same actual account',partner:'Same actual account',mms:'MMS'}}),owner,now());
 assert.equal(a.mms_amount,29000);assert.equal(a.preview.shares.spa,20001);assert.equal(a.preview.shares.partner,1001);
 throws(()=>agreementV3(body({partner_amount:1001}),owner,now()),'REFERRER_EXPLICIT_REQUIRED');
 throws(()=>agreementV3(body({mms_mode:'residual',customer_amount:1,mms_amount:null}),owner,now()),'ALLOCATION_EXCEEDS_REVENUE');
});
test('duration, room type and Therapist amounts are independently agreed, never hourly-prorated',()=>{
 const a=agreementV3(body({therapist_id:'mmst_'+'c'.repeat(24),therapist_amount:70003,duration_minutes:120,room:{...body().room,type:'Another room',amount:40007,fixed_units:2,covered_minutes:150}}),owner,now());
 assert.equal(a.customer_amount,130010);assert.equal(a.preview.shares.spa,40007);
 throws(()=>agreementV3(body({duration_minutes:121}),owner,now()),'ROOM_COVERAGE_REQUIRED');
 throws(()=>agreementV3(body({room:{...body().room,unit_description:''}}),owner,now()),'DETAIL_REQUIRED');
});
test('unknown room/travel data can save draft but cannot confirm; zero travel requires evidence',()=>{
 const a=agreementV3({schema_version:3,status:'draft',title:'Incomplete'},owner,now());assert.equal(a.room,null);assert.equal(a.travel,null);
 throws(()=>agreementV3(body({room:null}),owner,now()),'ROOM_TERMS_REQUIRED');
 throws(()=>agreementV3(body({travel:null}),owner,now()),'TRAVEL_ASSESSMENT_REQUIRED');
 throws(()=>agreementV3(body({travel:{...body().travel,estimate_amount:null}}),owner,now()),'TRAVEL_ASSESSMENT_REQUIRED');
 assert.equal(agreementV3(body(),owner,now()).travel.confirmed_by,owner.id);
});
test('explicit discounts, refunds, fee and tax burdens balance each satang without changing room base',()=>{
 const adjustments=[{kind:'discount',amount:101,bearer:'spa',basis:'fixed_satang',evidence_ref:'synthetic-discount'},{kind:'refund',amount:202,bearer:'mms',basis:'fixed_satang',evidence_ref:'synthetic-refund'},{kind:'fee',amount:3,bearer:'mms',basis:'fixed_satang',evidence_ref:'synthetic-fee'},{kind:'tax',amount:4,bearer:'mms',basis:'fixed_satang',evidence_ref:'synthetic-tax'}];
 const a=agreementV3(body({adjustments}),owner,now());assert.equal(a.preview.shares.spa,19900);assert.equal(a.preview.shares.mms,19791);assert.equal(a.preview.total_allocated+a.preview.costs,a.preview.received);
 throws(()=>roomPlan({...a,therapist_amount:0.5}),'AMOUNT_INVALID');
 throws(()=>roomPlan({...a,adjustments:[{...adjustments[0],amount:100000}]}),'NEGATIVE_PARTY_SHARE');
});
test('historical V2 frozen quote and paid values remain on the V2 formula',()=>{
 const a=agreementV2({...body(),schema_version:2,basis:'remaining_revenue',customer_amount:100002,shares_bps:{spa:5000,partner:0,mms:5000}},owner,now());
 const before=JSON.stringify(a);agreementV3(body({room:{...body().room,amount:40000}}),owner,now());
 assert.equal(JSON.stringify(a),before);assert.equal(inclusivePlan(a).shares.spa,20001);
 const f=fixture();throws(()=>f.cmd('agreements',{...body(),schema_version:2}),'ROOM_AGREEMENT_REQUIRED');
});
// Serial transaction fixture faithfully rolls back failed callbacks and serializes concurrent reservations.
class Store{constructor(state){this.state=structuredClone(state);this.queue=Promise.resolve();}async get(){return structuredClone(this.state);}transaction(fn){const p=this.queue.then(async()=>{let next=structuredClone(this.state);const result=await fn({get:async()=>structuredClone(next),put:async(_,s)=>{next=structuredClone(s);}});this.state=next;return result;});this.queue=p.catch(()=>{});return p;}}
const invoke=(ledger,command,b={},actor=owner)=>ledger.fetch(new Request('https://spa-ledger.internal',{method:'POST',body:JSON.stringify({actor,command,body:b})}));

test('concurrent create clicks reserve one deterministic job; ambiguous result retries preserve snapshot',async()=>{
 const f=fixture(),store=new Store(f.state),ledger=new RelaxSpaLedger({storage:store}),job=await spaJobId(f.service.id);
 const input={request_key:'synthetic-create-key',service_id:f.service.id,job_id:job,service_start_at:new Date(Date.now()+86400000).toISOString(),service_evidence:'synthetic-service-order',approval_confirmed:true};
 const results=await Promise.all([invoke(ledger,'reserve-job',input),invoke(ledger,'reserve-job',input)]);const parsed=await Promise.all(results.map(r=>r.json()));
 assert.equal(parsed.filter(p=>p.data.pending).length,1);const claimed=parsed.find(p=>p.data.claim_token).data;
 const snapshot=structuredClone(store.state.services[0].agreement);
 await invoke(ledger,'release-job',{service_id:f.service.id,claim_token:claimed.claim_token});
 const retry=(await(await invoke(ledger,'reserve-job',{...input,request_key:'synthetic-retry-key'})).json()).data;
 assert.equal(retry.service.job_creation.job_id,job);assert.deepEqual(retry.service.agreement,snapshot);
 assert.equal((await invoke(ledger,'reserve-job',{...input,service_evidence:'different-evidence'})).status,409);
 await invoke(ledger,'finish-job',{service_id:f.service.id,claim_token:retry.claim_token});
 const done=(await(await invoke(ledger,'reserve-job',input)).json()).data;assert.equal(done.duplicate,true);assert.equal(store.state.services[0].status,'booked');
 assert.equal((await invoke(ledger,'reserve-job',input,partner)).status,403);
});

function externalFixture(){const db={Therapists:[{fields:{'Therapist ID':therapist.id,Status:'Active','MY MMS Access':'Approved'}}],Jobs:[],Offers:[]},calls=[],initializations=[];
 const ids={THERAPISTS:'tbl'+'t'.repeat(14),JOBS:'tbl'+'j'.repeat(14),OFFERS:'tbl'+'o'.repeat(14)},names=Object.fromEntries(Object.entries(ids).map(([k,v])=>[v,k==='THERAPISTS'?'Therapists':k==='JOBS'?'Jobs':'Offers']));
 const env={AIRTABLE_BASE_ID:'app'+'b'.repeat(14),AIRTABLE_API_TOKEN:'synthetic-only',...Object.fromEntries(Object.entries(ids).map(([k,v])=>['AIRTABLE_'+k+'_TABLE_ID',v])),MMS_DISPATCH_COORDINATOR:{idFromName:n=>n,get:()=>({initialize:async(job,offers)=>{initializations.push({job,offers});return{job:{job_id:job,state:'OFFERED'}};}})}};
 const fetch=async(url,opts={})=>{const u=new URL(url),name=names[u.pathname.split('/').at(-1)],rows=db[name];calls.push({name,method:opts.method||'GET'});if(!rows)throw Error('unexpected table');
 if(!opts.method){const formula=u.searchParams.get('filterByFormula'),m=formula.match(/^\{([^}]+)\}='([^']+)'$/);return Response.json({records:rows.filter(r=>r.fields[m[1]]===m[2])});}
 const p=JSON.parse(opts.body),field=p.performUpsert.fieldsToMergeOn[0],fields=p.records[0].fields;let row=rows.find(r=>r.fields[field]===fields[field]);if(row)Object.assign(row.fields,fields);else{row={id:'rec'+String(rows.length).padStart(14,'0'),fields};rows.push(row);}return Response.json({records:[row]});};
 return{db,calls,initializations,env,fetch};}

test('quote producer creates one MMS job and single Therapist offer, never applies 70/30 on retry',async()=>{
 const f=fixture(),x=externalFixture(),original=globalThis.fetch;globalThis.fetch=x.fetch;
 f.service.job_creation={job_id:await spaJobId(f.service.id),service_start_at:new Date(Date.now()+86400000).toISOString()};
 try{await produceSpaJob(x.env,f.service);await produceSpaJob(x.env,f.service);
 assert.equal(x.db.Jobs.length,1);assert.equal(x.db.Offers.length,1);
 const jf=x.db.Jobs[0].fields,of=x.db.Offers[0].fields;assert.equal(jf['Therapist Payout THB'],600.01);assert.equal(of['Payout THB'],600.01);
 assert.equal(jf['Accepted Therapist ID'],undefined);assert.equal(jf['Job Status'],'Offered');
 const payload=JSON.parse(jf['Internal Payload JSON']);assert.equal(payload.spa_quote.agreement.room.amount,20001);assert.equal(payload.spa_quote.agreement.customer_amount,100002);assert.equal(payload.pricing,undefined);
 assert.equal(JSON.stringify(JSON.parse(of['Safe Payload JSON'])).includes('room_amount'),false);
 assert.equal(x.calls.filter(c=>c.method==='PATCH').length,2);
 jf['Job Status']='Accepted';await produceSpaJob(x.env,f.service);assert.equal(jf['Job Status'],'Accepted');
 }finally{globalThis.fetch=original;}});

test('an offer becomes visible only after its dispatch job is ready for immediate acceptance',async()=>{
 const f=fixture(),x=externalFixture(),original=globalThis.fetch;
 f.service.job_creation={job_id:await spaJobId(f.service.id),service_start_at:new Date(Date.now()+86400000).toISOString()};
 globalThis.fetch=async(url,opts)=>{
  if(url.includes(x.env.AIRTABLE_OFFERS_TABLE_ID)&&opts?.method==='PATCH')
   assert.equal(x.initializations.length,1,'a Therapist can read/accept the offer as soon as this write succeeds');
  return x.fetch(url,opts);
 };
 try{await produceSpaJob(x.env,f.service);assert.equal(x.db.Offers.length,1);}finally{globalThis.fetch=original;}
});

test('failed dispatch initialization leaves no visible offer and the same job can be retried',async()=>{
 const f=fixture(),x=externalFixture(),original=globalThis.fetch;globalThis.fetch=x.fetch;
 f.service.job_creation={job_id:await spaJobId(f.service.id),service_start_at:new Date(Date.now()+86400000).toISOString()};
 const ready=x.env.MMS_DISPATCH_COORDINATOR.get;
 x.env.MMS_DISPATCH_COORDINATOR.get=()=>({initialize:async()=>({job:null})});
 try{await assert.rejects(()=>produceSpaJob(x.env,f.service),e=>e.code==='DISPATCH_INITIALIZATION_UNCONFIRMED');
 assert.equal(x.db.Jobs.length,1);assert.equal(x.db.Offers.length,0);
 x.env.MMS_DISPATCH_COORDINATOR.get=ready;await produceSpaJob(x.env,f.service);
 assert.equal(x.db.Jobs.length,1);assert.equal(x.db.Offers.length,1);
 }finally{globalThis.fetch=original;}
});

test('retry rejects an existing offer whose displayed snapshot differs without overwriting an accepted offer',async()=>{
 const f=fixture(),x=externalFixture(),original=globalThis.fetch;globalThis.fetch=x.fetch;
 f.service.job_creation={job_id:await spaJobId(f.service.id),service_start_at:new Date(Date.now()+86400000).toISOString()};
 try{await produceSpaJob(x.env,f.service);
 const offer=x.db.Offers[0].fields;offer['Offer Status']='Accepted';
 const safe=JSON.parse(offer['Safe Payload JSON']);safe.payout_thb=1;offer['Safe Payload JSON']=JSON.stringify(safe);
 const before=JSON.stringify(x.db),writes=x.calls.filter(c=>c.method==='PATCH').length;
 await assert.rejects(()=>produceSpaJob(x.env,f.service),e=>e.code==='JOB_SNAPSHOT_MISMATCH');
 assert.equal(JSON.stringify(x.db),before);assert.equal(x.calls.filter(c=>c.method==='PATCH').length,writes);
 for(const invalid of ['null','{broken']){offer['Safe Payload JSON']=invalid;await assert.rejects(()=>produceSpaJob(x.env,f.service),e=>e.code==='JOB_SNAPSHOT_MISMATCH');}
 }finally{globalThis.fetch=original;}
});

test('conflicting display fallback or expiry fields block retry without rewriting accepted records',async()=>{
 const f=fixture(),x=externalFixture(),original=globalThis.fetch;globalThis.fetch=x.fetch;
 f.service.job_creation={job_id:await spaJobId(f.service.id),service_start_at:new Date(Date.now()+86400000).toISOString()};
 try{await produceSpaJob(x.env,f.service);
 x.db.Jobs[0].fields['Job Status']='Accepted';x.db.Offers[0].fields['Offer Status']='Accepted';
 for(const [table,key,value] of [['Jobs','Service','Wrong service'],['Jobs','Service Start At','2027-01-01T00:00:00Z'],['Jobs','Safe Area Label','Wrong venue'],['Jobs','Travel Label','extra travel charged'],['Jobs','Payout Note','Wrong deduction'],['Jobs','ETA Label','unagreed'],['Offers','Expires At','2027-01-01T00:00:00Z'],['Offers','Safe Area Label','Wrong venue'],['Offers','Travel Label',null],['Offers','ETA Label','unagreed']]){
  const fields=x.db[table][0].fields,was=fields[key],existed=Object.hasOwn(fields,key);fields[key]=value;
  const before=JSON.stringify(x.db),writes=x.calls.filter(c=>c.method==='PATCH').length;
  await assert.rejects(()=>produceSpaJob(x.env,f.service),e=>e.code==='JOB_SNAPSHOT_MISMATCH',table+': '+key);
  assert.equal(JSON.stringify(x.db),before);assert.equal(x.calls.filter(c=>c.method==='PATCH').length,writes);
  if(existed)fields[key]=was;else delete fields[key];
 }
 }finally{globalThis.fetch=original;}
});

test('lost response after offer write retries the same accepted job and offer without updates',async()=>{
 const f=fixture(),x=externalFixture(),original=globalThis.fetch;
 f.service.job_creation={job_id:await spaJobId(f.service.id),service_start_at:new Date(Date.now()+86400000).toISOString()};
 let lose=true;globalThis.fetch=async(url,opts)=>{const response=await x.fetch(url,opts);if(lose&&url.includes(x.env.AIRTABLE_OFFERS_TABLE_ID)&&opts?.method==='PATCH'){lose=false;throw Error('synthetic lost offer response');}return response;};
 try{await assert.rejects(()=>produceSpaJob(x.env,f.service));assert.equal(x.db.Offers.length,1);
 x.db.Jobs[0].fields['Job Status']='Accepted';x.db.Offers[0].fields['Offer Status']='Accepted';const before=JSON.stringify(x.db);
 await produceSpaJob(x.env,f.service);assert.equal(JSON.stringify(x.db),before);assert.equal(x.calls.filter(c=>c.method==='PATCH').length,2);
 }finally{globalThis.fetch=original;}
});

test('missing canonical price/travel or wrong venue cannot link a quote; approved payee required',()=>{
 const f=fixture(),j={id:'mmsjob_'+'b'.repeat(24),therapist_id:therapist.id,status:'Completed',duration_minutes:90,therapist_amount:60001,customer_amount:100002,travel_amount:0,travel_included_confirmed:true,venue_id:'relax-spa-by-9',is_test:false};
 const link={service_id:f.service.id,job_id:j.id,duration_minutes:90,service_evidence:'synthetic-work'};
 for(const [patch,code]of[[{customer_amount:null},'CANONICAL_PRICE_UNCONFIRMED'],[{travel_amount:null},'CANONICAL_TRAVEL_UNCONFIRMED'],[{venue_id:null},'CANONICAL_VENUE_TRAVEL_UNCONFIRMED']])throws(()=>f.cmd('services',link,owner,{job:{...j,...patch}}),code);
 f.cmd('services',link,owner,{job:j});
 f.cmd('receipts',{service_id:f.service.id,amount:100002,received_by:'Actual inspected customer payment recipient',evidence_ref:'synthetic-bank',received_at:'2026-10-01T00:00:00Z',verification_confirmed:true});
 f.cmd('settlements',{service_id:f.service.id,approval_confirmed:true},owner,{job:j});
 throws(()=>f.cmd('payouts',{service_id:f.service.id,role:'spa',amount:20001,recipient:'Wrong account',evidence_ref:'synthetic-out',paid_at:'2026-10-01T00:00:00Z',verification_confirmed:true},owner,{job:j}),'PAYEE_MISMATCH');
});

test('job producer recovers ambiguous upsert without duplicate records and never overwrites mismatched snapshot',async()=>{
 const f=fixture(),x=externalFixture(),original=globalThis.fetch;f.service.job_creation={job_id:await spaJobId(f.service.id),service_start_at:new Date(Date.now()+86400000).toISOString()};
 let lose=true;globalThis.fetch=async(...args)=>{const response=await x.fetch(...args);if(lose&&args[1]?.method==='PATCH'){lose=false;throw Error('synthetic connection lost after write');}return response;};
 try{await assert.rejects(()=>produceSpaJob(x.env,f.service));assert.equal(x.db.Jobs.length,1);await produceSpaJob(x.env,f.service);assert.equal(x.db.Jobs.length,1);assert.equal(x.db.Offers.length,1);
 x.db.Jobs[0].fields['Therapist Payout THB']=1;
 await assert.rejects(()=>produceSpaJob(x.env,f.service),e=>e.code==='JOB_SNAPSHOT_MISMATCH');
 }finally{globalThis.fetch=original;}});

test('post-payment refund and recovered payee cash append audit entries and preserve original settlement/payout',async()=>{
 const f=fixture(),j={id:'mmsjob_'+'b'.repeat(24),therapist_id:therapist.id,status:'Completed',duration_minutes:90,therapist_amount:60001,customer_amount:100002,travel_amount:0,travel_included_confirmed:true,venue_id:'relax-spa-by-9',is_test:false};
 const cmd=(c,b)=>f.cmd(c,{service_id:f.service.id,...b},owner,{job:j});
 cmd('services',{job_id:j.id,duration_minutes:90,service_evidence:'synthetic-service'});
 cmd('receipts',{amount:100002,received_by:'Synthetic actual recipient',evidence_ref:'synthetic-receipt',received_at:'2026-10-01T00:00:00Z',verification_confirmed:true});
 cmd('settlements',{approval_confirmed:true});
 for(const[role,amount]of Object.entries(f.service.settlement.shares))if(amount)cmd('payouts',{role,amount,recipient:f.service.agreement.payees[role],evidence_ref:'synthetic-payout-'+role,paid_at:'2026-10-01T00:00:00Z',verification_confirmed:true});
 cmd('close',{approval_confirmed:true});const before=JSON.stringify({settlement:f.service.settlement,payouts:f.service.payouts});
 const correction={type:'customer_refund',role:'spa',amount:101,recipient:'Synthetic customer',evidence_ref:'synthetic-late-refund',occurred_at:'2026-10-01T00:00:00Z',reason:'Synthetic reviewed adjustment',terms_ref:'synthetic-amended-refund-terms',approval_confirmed:true,verification_confirmed:true,request_key:'synthetic-correction-key'};
 cmd('corrections',correction);assert.equal(cmd('corrections',correction).duplicate,true);assert.equal(f.service.status,'reconciling');
 throws(()=>cmd('close',{approval_confirmed:true}),'PAYOUTS_INCOMPLETE');
 cmd('corrections',{...correction,type:'payee_return',recipient:'Actual receiving MMS account',evidence_ref:'synthetic-return-from-spa',request_key:'synthetic-return-key'});
 cmd('close',{approval_confirmed:true});assert.equal(f.service.status,'closed');
 assert.equal(JSON.stringify({settlement:f.service.settlement,payouts:f.service.payouts}),before);
 assert.equal(f.service.corrections.length,2);assert.equal(f.state.events.filter(e=>e.action==='corrections').length,2);
 const ledger=new RelaxSpaLedger({storage:{get:async()=>f.state}}),snapshot=(await(await invoke(ledger,'snapshot')).json()).data.services[0].reconciliation_summary;
 assert.equal(snapshot.shares.spa,19900);assert.equal(snapshot.net_paid.spa,19900);assert.equal(snapshot.net_received,99901);assert.equal(snapshot.balanced,true);
});

test('an approved refund before first payout reduces only the reviewed target and cannot overdraw a party',()=>{
 const f=fixture(),j={id:'mmsjob_'+'b'.repeat(24),therapist_id:therapist.id,status:'Completed',duration_minutes:90,therapist_amount:60001,customer_amount:100002,travel_amount:0,travel_included_confirmed:true,venue_id:'relax-spa-by-9'};
 const cmd=(c,b)=>f.cmd(c,{service_id:f.service.id,...b},owner,{job:j});cmd('services',{job_id:j.id,duration_minutes:90,service_evidence:'synthetic'});
 cmd('receipts',{amount:100002,received_by:'Synthetic inspected recipient',evidence_ref:'synthetic-bank',received_at:'2026-10-01T00:00:00Z',verification_confirmed:true});cmd('settlements',{approval_confirmed:true});
 const c={type:'customer_refund',role:'spa',amount:1,recipient:'Synthetic customer',evidence_ref:'synthetic-refund',occurred_at:'2026-10-01T00:00:00Z',reason:'Synthetic adjustment',terms_ref:'synthetic-review',approval_confirmed:true,verification_confirmed:true};
 throws(()=>cmd('corrections',{...c,amount:20002}),'CORRECTION_EXCEEDS_BALANCE');
 throws(()=>cmd('corrections',{...c,verification_confirmed:false}),'CORRECTION_REVIEW_REQUIRED');cmd('corrections',c);
 throws(()=>cmd('payouts',{role:'spa',amount:20001,recipient:'Synthetic room payee'}),'PAYOUT_AMOUNT_MISMATCH');
 cmd('payouts',{role:'spa',amount:20000,recipient:'Synthetic room payee',evidence_ref:'synthetic-spa-net',paid_at:'2026-10-01T00:00:00Z',verification_confirmed:true});
 assert.equal(f.service.settlement.shares.spa,20001);assert.equal(f.service.payouts[0].amount,20000);
});

test('create-job API uses reserved quote, links existing MMS store and is idempotent through canonical completion',async()=>{
 const f=fixture(),store=new Store(f.state),ledger=new RelaxSpaLedger({storage:store}),x=externalFixture(),original=globalThis.fetch;globalThis.fetch=x.fetch;
 x.env.RELAX_SPA_LEDGER={idFromName:n=>n,get:()=>({fetch:r=>ledger.fetch(r)})};
 const request=(command,b)=>new Request('https://mms.internal/internal/mms/admin/relax-spa/'+command,{method:'POST',headers:{'content-type':'application/json','x-mms-spa-actor':'per','x-mms-spa-role':'owner'},body:JSON.stringify({request_key:'synthetic-api-'+command,service_id:f.service.id,...b})});
 try{
 const input={service_start_at:new Date(Date.now()+86400000).toISOString(),service_evidence:'synthetic-work',approval_confirmed:true};
 const first=await maybeHandleRelaxSpaLedger(request('create-job',input),x.env);assert.equal(first.status,200);assert.equal(store.state.services[0].status,'booked');
 const retry=await maybeHandleRelaxSpaLedger(request('create-job',input),x.env);assert.equal((await retry.json()).data.duplicate,true);assert.equal(x.db.Jobs.length,1);
 // Simulate the real Therapist accept/start/complete result without a real transaction.
 x.db.Jobs[0].fields['Accepted Therapist ID']=therapist.id;x.db.Jobs[0].fields['Job Status']='Completed';
 assert.equal((await maybeHandleRelaxSpaLedger(request('receipts',{amount:100002,received_by:'Synthetic actual receiver',received_at:'2026-10-01T00:00:00Z',evidence_ref:'synthetic-receipt-integration',verification_confirmed:true}),x.env)).status,200);
 const settled=await maybeHandleRelaxSpaLedger(request('settlements',{approval_confirmed:true}),x.env);assert.equal(settled.status,200);assert.deepEqual(store.state.services[0].settlement.shares,{therapist:60001,spa:20001,partner:0,mms:20000});
 }finally{globalThis.fetch=original;}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { S,J,buildEdit,revision,handleOwnerJobEdit,projectJob } from './src/owner-job-edit.js';
import { JobEditJournal } from './src/owner-job-edit-coordinator.js';
import { createCredentialBoundAdminSession } from './src/credential-bound-admin-session.js';
import { renderOwnerJobEdit } from './src/owner-job-edit-page.js';
globalThis.crypto ||= webcrypto;
const sid='sess_fixture_123',oldId='recAAAAAAAAAAAAAA',newId='recBBBBBBBBBBBBBB';
const price={version:1,currency:'THB',settlement_mode:'platform',client_base_amount_thb:12500,model_base_payout_thb:7000,addons:[{option:'mk',client_amount_thb:3000,model_payout_thb:1500}],client_total_amount_thb:15500,model_total_payout_thb:8500};
const note='[MMD SERVICE PRICING v1] '+JSON.stringify(price)+'\n[SIGIL Pricing v1] '+JSON.stringify({net_price_thb:15500,balance_thb:10800})+'\n[SIGIL VIP Detail v1] {"vip_detail":"Model-only remark"}\nCustomer instruction preserved';
const fixture=()=>({session:{id:'recCCCCCCCCCCCCCC',fields:{[S.id]:sid,[S.model]:[oldId],[S.name]:'Film IT',[S.client]:'Fixture customer',[S.amount]:15500,[S.payout]:8500,[S.deposit]:4700,[S.note]:note,[S.notes]:note,[S.status]:'Pending',[S.state]:'confirmed',[S.ack]:'2026-10-21T12:00:00Z',[S.customerAck]:'2026-10-21T12:00:00Z'}},job:{id:'recDDDDDDDDDDDDDD',fields:{[J.id]:sid,[J.model]:[oldId],[J.name]:'Film IT',[J.amount]:15500,[J.note]:note}}});
const body=()=>({session_id:sid,revision:'set-later',request_id:'fixture_request_1234',reason:'เปลี่ยนน้องตามที่ตกลง',model_id:newId,client_base:20000,model_base:12000,addons:[{option:'mk',client_amount_thb:3000,model_payout_thb:2000}],travel:0,model_travel:0});
const model={id:newId,fields:{fldShiT60bmCxFxRu:'Mek',fldRcAE3bL8dKmURH:'active'}};
const actor={id:'fixture-owner',role:'owner'};
function setup(){
 const data=fixture(),calls=[],memory=new Map();let failSession=false;
 const storage={get:async k=>structuredClone(memory.get(k)),put:async(k,v)=>{if(typeof k==='object')for(const [key,value]of Object.entries(k))memory.set(key,structuredClone(value));else memory.set(k,structuredClone(v));},delete:async k=>memory.delete(k),list:async()=>new Map([...memory].filter(([k])=>k.startsWith('audit:')))};
 const env={AIRTABLE_API_KEY:'fixture-key',AIRTABLE_BASE_ID:'fixture-base',ADMIN_LOGIN_CREDENTIAL:'fixture-credential',ADMIN_SESSION_SECRET:'fixture-session',AIRTABLE_HTTP:{fetch:async req=>{
  const path=new URL(req.url).pathname;const isSession=path.includes('tblC98mKWbzmPuNzX'),isJob=path.includes('tbl0jxIjN8QYwGABX');
  if(!isSession&&!isJob){assert.match(path,/tblI4B0bI446vp9GX/);return Response.json(model);}
  const row=isSession?data.session:data.job;
  if(req.method==='PATCH'){calls.push(isSession?'session':'job');if(isSession&&failSession){failSession=false;throw Error('network failure');}const patch=(await req.json()).fields;Object.assign(row.fields,patch);for(const [k,v]of Object.entries(row.fields))if(v===null||v===''||v===false)delete row.fields[k];return Response.json(row);}
  return Response.json({records:[row]});
 }}};
 const coordinator=new JobEditJournal(storage,env);env.JOB_EDIT_COORDINATOR={getByName:id=>{assert.equal(id,sid);return coordinator;}};
 return {data,calls,env,memory,coordinator,storage,fail:()=>{failSession=true;}};
}
const post=b=>new Request('https://journal/edit',{method:'POST',body:JSON.stringify({body:b,actor})});
async function authReq(env,{method='GET',path='/v1/admin/jobs/edit?session_id='+sid,role='owner',origin='https://mmdbkk.com',unauth=false,body:b}={}){
 const cookie=await createCredentialBoundAdminSession(new Request('https://mmdbkk.com'),{id:actor.id,role},env);
 return new Request('https://mmdbkk.com'+path,{method,headers:{cookie:unauth?'':'mmd_admin_gate_v1='+cookie,origin,'content-type':'application/json'},...(b?{body:JSON.stringify(b)}:{})});
}
test('Film -> Mek updates both canonical records, totals, balance, clears old acknowledgements, retains remarks',async()=>{
 const h=setup(),b={...body(),revision:await revision(h.data)};
 const res=await h.coordinator.fetch(post(b));assert.equal(res.status,200);const d=await res.json();assert.equal(d.remaining,18300);assert.equal(d.payout,14000);assert.equal(d.notification_sent,false);assert.deepEqual(h.calls,['job','session']);
 assert.deepEqual(h.data.session.fields[S.model],[newId]);assert.deepEqual(h.data.job.fields[J.model],[newId]);assert.equal(h.data.session.fields[S.ack],undefined);assert.equal(h.data.session.fields[S.customerAck],undefined);assert.equal(h.data.session.fields[S.state],'offered');assert.equal(h.data.session.fields[S.deposit],4700);
 assert.match(h.data.session.fields[S.note],/Model-only remark/);assert.match(h.data.session.fields[S.note],/Customer instruction preserved/);assert.ok(h.memory.size>=2);
 const repeated=await h.coordinator.fetch(post(b));assert.equal((await repeated.json()).idempotent,true);assert.equal(h.calls.length,2);
});
test('travel is separate and customer/model totals remain exact to satang',()=>{const b=body();b.travel=350.25;b.model_travel=250.50;const p=buildEdit(fixture(),b,model,actor);assert.equal(p.amount,23350.25);assert.equal(p.payout,14250.5);assert.equal(p.remaining,18650.25);assert.equal(p.pricing.client_total_amount_thb,23000);});
for(const [title,change] of [['negative',b=>b.client_base=-1],['NaN',b=>b.model_base=NaN],['fractional satang',b=>b.model_base=1.111],['extra field',b=>b.payment_status='paid'],['duplicate MK',b=>b.addons.push(b.addons[0])],['overpaid',b=>b.client_base=1],['payout too high',b=>b.model_base=100000]])test(title+' fails without writes',()=>{const b=body();change(b);assert.throws(()=>buildEdit(fixture(),b,model,actor));});
for(const [title,change] of [['started',f=>f[S.state]='work_started'],['cancelled',f=>f[S.status]='Cancelled'],['partner',f=>f[S.partner]='partner_1'],['partner source',f=>f[S.source]='{"source_kind":"partner"}'],['discount',f=>f[S.note]=note.replace('"version":1','"discount":{"mode":"promotion"},"version":1')]])test(title+' needs separate review',()=>{const d=fixture();change(d.session.fields);assert.throws(()=>buildEdit(d,body(),model,actor));});
test('stale revision cannot overwrite new price',async()=>{const h=setup();const r=await h.coordinator.fetch(post(body()));assert.equal(r.status,409);assert.deepEqual(h.calls,[]);});
test('partial write survives eviction and retries same amendment without duplicating job write',async()=>{const h=setup(),b={...body(),revision:await revision(h.data)};h.fail();assert.equal((await h.coordinator.fetch(post(b))).status,503);assert.deepEqual(h.calls,['job','session']);assert.ok(h.memory.has('pending'));
 const fresh=new JobEditJournal(h.storage,h.env);const r=await fresh.fetch(post(b));assert.equal(r.status,200);assert.deepEqual(h.calls,['job','session','session']);assert.equal(h.memory.has('pending'),false);});
test('pending amendment refuses another request and external conflicts',async()=>{const h=setup(),b={...body(),revision:await revision(h.data)};h.fail();await h.coordinator.fetch(post(b));assert.equal((await h.coordinator.fetch(post({...b,request_id:'another_request_1234'}))).status,409);h.data.session.fields[S.amount]=19999;assert.equal((await h.coordinator.fetch(post(b))).status,409);assert.equal(h.calls.length,2);});
for(const [title,opts,status]of [['no login',{unauth:true},401],['partner',{role:'mms_partner'},403],['cross origin',{method:'POST',origin:'https://evil.example',body:body()},403]])test(title+' rejected at authenticated route',async()=>{const h=setup();const res=await handleOwnerJobEdit(await authReq(h.env,opts),h.env);assert.equal(res.status,status);assert.equal(h.calls.length,0);});
test('read route owner-only projection and history are read-only',async()=>{const h=setup();const r=await handleOwnerJobEdit(await authReq(h.env),h.env);assert.equal(r.status,200);assert.equal((await r.json()).job.paid,4700);assert.deepEqual(h.calls,[]);const hr=await handleOwnerJobEdit(await authReq(h.env,{path:'/v1/admin/jobs/edit?session_id='+sid+'&history=1'}),h.env);assert.deepEqual((await hr.json()).history,[]);});
test('rendered script parses and has real confirmation and calculated totals',()=>{const html=renderOwnerJobEdit();const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];assert.doesNotThrow(()=>new Function(script));assert.match(html,/showModal/);assert.match(html,/crypto.randomUUID/);assert.match(html,/id="jobList"/);assert.match(html,/model-photo/);});

test('owner price edits require a new confirmation revision even when the model is unchanged',async()=>{
 const {confirmationRevision}=await import('../shared/confirmation-revision.mjs');
 const h=setup(),before=await confirmationRevision(h.env,h.data.session,sid);
 const b={...body(),model_id:oldId},sameModel={...model,id:oldId};
 const patch=buildEdit(h.data,b,sameModel,actor).sessionPatch;
 Object.assign(h.data.session.fields,patch);
 const first=await confirmationRevision(h.env,h.data.session,sid);assert.equal(first.confirmation_revision_required,true);assert.notEqual(first.confirmation_revision,before.confirmation_revision);
 h.data.session.fields[S.amount]=24000;const second=await confirmationRevision(h.env,h.data.session,sid);assert.notEqual(first.confirmation_revision,second.confirmation_revision);
});

test('active worker routes the owner editor API and rejects partners before Airtable',async()=>{
 const {default:worker}=await import('./src/admin-login-hero-worker.js');const h=setup();
 const r=await worker.fetch(await authReq(h.env),h.env,{});assert.equal(r.status,200);assert.equal((await r.json()).job.model_name,'Film IT');
 const denied=await worker.fetch(await authReq(h.env,{role:'mms_partner'}),h.env,{});assert.equal(denied.status,403);assert.equal(h.calls.length,0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { S,J,revision,loadJob,handleOwnerJobEdit } from './src/owner-job-edit.js';
import { CAPTAIN, captainProposal } from './src/owner-job-edit-captain.js';
import { JobEditJournal } from './src/owner-job-edit-coordinator.js';
import { createCredentialBoundAdminSession } from './src/credential-bound-admin-session.js';
globalThis.crypto ||= webcrypto;
const originalFetch=globalThis.fetch;
import {actor,payment,setup,body,post} from './owner-job-edit-captain-fixture.mjs';
test.afterEach(()=>{globalThis.fetch=originalFetch;});
test('existing coordinator aligns Jobs/Sessions, separates cost and preserves payment and before-image; repeat creates nothing',async()=>{
 const h=setup(),b=await body(h),before=structuredClone(h.session);
 const r=await h.journal.fetch(post(b));assert.equal(r.status,200);const result=await r.json();
 assert.equal(result.remaining,25500);assert.equal(result.paid,7500);assert.equal(result.partner_cost,23000);assert.equal(result.payout,null);assert.equal(result.payment_intent_created,false);
 for(const [row,fields]of [[h.job,J],[h.session,S]]){assert.deepEqual(row.fields[fields.model],[CAPTAIN.model]);assert.equal(row.fields[fields.name],'EMs20 - Zero');assert.equal(row.fields[fields.amount],33000);}
 assert.equal(JSON.parse(h.session.fields[S.source]).partner_record_id,CAPTAIN.partner);
 assert.equal(h.session.fields[S.deposit],7500);assert.equal(h.session.fields[S.paymentRef],before.fields[S.paymentRef]);assert.equal(h.session.fields[S.ready],undefined);
 assert.equal(h.session.fields[S.payout],undefined);assert.match(h.session.fields[S.note],/Historical quote kept/);
 assert.deepEqual(h.payments,[payment]);assert.deepEqual(h.writes,['job','session']);
 const again=await h.journal.fetch(post(b));assert.equal((await again.json()).idempotent,true);assert.deepEqual(h.writes,['job','session']);
 const audit=[...h.memory.entries()].find(([k])=>k.startsWith('audit:'))[1];assert.equal(audit.data.job.fields[J.name],'Captain S');assert.equal(audit.data.session.fields[S.name],'EMs20 - Rossi');
 assert.ok(h.payCalls.every(p=>p.endsWith('/balance')));
});
test('partial write retry after eviction resumes Session only, with original receipt and history',async()=>{
 const h=setup(),b=await body(h);h.failSession=true;
 assert.equal((await h.journal.fetch(post(b))).status,503);assert.deepEqual(h.writes,['job']);
 assert.equal((await new JobEditJournal(h.storage,h.env).fetch(post(b))).status,200);assert.deepEqual(h.writes,['job','session']);
});
for(const [label,change,status]of [
 ['relationship revoked',h=>h.relations=false,409],['source unreadable',h=>h.sourceUnavailable=true,503],
 ['payment added',h=>h.payments.push({...payment,id:'new'}),409],['signed URL still present',h=>h.session.fields[S.customerLink]='https://fixture.invalid/opaque',409],
 ['verified cash changed',h=>h.cash=8000,409],['model record changed',h=>h.model.fields.fldShiT60bmCxFxRu='Other name',409]]){
 test(label+' after preview stops without writes',async()=>{const h=setup(),b=await body(h);change(h);const r=await h.journal.fetch(post(b));assert.equal(r.status,status);assert.deepEqual(h.writes,[]);});
}
test('relationship changes after Jobs write: leaves journal and stops Session; never collects',async()=>{
 const h=setup(),b=await body(h);h.afterWrite=()=>h.relations=false;
 assert.equal((await h.journal.fetch(post(b))).status,409);assert.deepEqual(h.writes,['job']);assert.ok(h.memory.has('pending'));assert.deepEqual(h.payments,[payment]);
});
test('Owner-only amendment rejects admin and browser-supplied prices',async()=>{
 const h=setup(),b=await body(h);
 assert.equal((await h.journal.fetch(post(b,{...actor,role:'admin'}))).status,403);
 assert.equal((await h.journal.fetch(post({...b,customer_total:1}))).status,400);assert.deepEqual(h.writes,[]);
});
test('same authenticated existing route exposes proposal without writes or payment references',async()=>{
 const h=setup();const cookie=await createCredentialBoundAdminSession(new Request('https://mmdbkk.com'),actor,h.env);
 const r=await handleOwnerJobEdit(new Request('https://mmdbkk.com/v1/admin/jobs/edit?session_id='+CAPTAIN.session+'&amendment=captain-zero',{headers:{cookie:'mmd_admin_gate_v1='+cookie}}),h.env);
 assert.equal(r.status,200);const text=await r.text();assert.match(text,/25500/);assert.doesNotMatch(text,/fixture-paid-ref/);assert.deepEqual(h.writes,[]);
});

test('Owner POST through existing API uses journal only and never calls payment report or issuer',async()=>{
 const h=setup(),b=await body(h);h.env.JOB_EDIT_COORDINATOR={getByName:id=>{assert.equal(id,CAPTAIN.session);return h.journal;}};
 const cookie=await createCredentialBoundAdminSession(new Request('https://mmdbkk.com'),actor,h.env);
 const r=await handleOwnerJobEdit(new Request('https://mmdbkk.com/v1/admin/jobs/edit',{method:'POST',headers:{cookie:'mmd_admin_gate_v1='+cookie,origin:'https://mmdbkk.com','content-type':'application/json'},body:JSON.stringify(b)}),h.env);
 assert.equal(r.status,200);assert.equal((await r.json()).remaining,25500);assert.deepEqual(h.writes,['job','session']);assert.ok(h.payCalls.every(p=>p.endsWith('/balance')));
});
test('new receipt between writes stops Session and retains recovery journal',async()=>{
 const h=setup(),b=await body(h);h.afterWrite=()=>{h.cash=8000;};
 const r=await h.journal.fetch(post(b));assert.equal(r.status,409);assert.deepEqual(h.writes,['job']);assert.ok(h.memory.has('pending'));
});
test('payment read failure is 503 without mutation',async()=>{
 const h=setup(),b=await body(h),fetcher=h.env.AIRTABLE_HTTP.fetch;
 h.env.AIRTABLE_HTTP.fetch=async req=>req.url.includes('tblWGGJJOx5eBvBZJ')?new Response('',{status:503}):fetcher(req);
 assert.equal((await h.journal.fetch(post(b))).status,503);assert.deepEqual(h.writes,[]);
});
test('Console keeps edit-job view and session context in the existing shell',async()=>{
 const {consoleViewRouting,ADMIN_CONSOLE_PATH,ADMIN_CONSOLE_VIEWS}=await import('../webflow/global/admin-console-views.mjs');
 const routing=consoleViewRouting(ADMIN_CONSOLE_PATH,ADMIN_CONSOLE_VIEWS,'https://mmdbkk.com');
 const url=routing.toConsole('/internal/admin/jobs/edit?session_id='+CAPTAIN.session);
 assert.match(url,/view=edit-job/);assert.equal(routing.resolve(url).tool,'/internal/admin/jobs/edit?session_id='+CAPTAIN.session);
});

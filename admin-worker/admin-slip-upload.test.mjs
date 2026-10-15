import test from 'node:test';
import assert from 'node:assert/strict';
import adminEntry from './src/admin-login-hero-worker.js';
import studioEntry from './src/studio-telegram-worker.js';
import { handleAdminSlipUploadRequest } from './src/historical-slip-backfill-runtime.js';
import { handlePaymentReviewRequest } from './src/payment-review-runtime.js';
const PATH='/studio/api/payments/slip-intake';
function upload({source='line_ofc',type='image/png',bytes=[137,80,78,71,13,10,26,10]}={}){
 const form=new FormData();form.set('source_channel',source);form.set('note','synthetic upload test');form.set('file',new Blob([new Uint8Array(bytes)],{type}),'synthetic-slip.png');
 return new Request('https://www.mmdbkk.com'+PATH,{method:'POST',headers:{Origin:'https://www.mmdbkk.com'},body:form});
}
function fixture(){
 const proofs=[],writes=[],blobs=new Map(),extracts=[];
 const env={AIRTABLE_BASE_ID:'app_test',AIRTABLE_API_KEY:'synthetic_test_key',AIRTABLE_TABLE_PAYMENT_PROOFS_ID:'Proofs',AIRTABLE_TABLE_PAYMENTS_ID:'Payments',AIRTABLE_TABLE_SESSIONS:'Sessions',AIRTABLE_TABLE_MEMBERS_ID:'Members',AIRTABLE_TABLE_CLIENTS_ID:'Clients',
  AIRTABLE_HTTP:{async fetch(req){const table=decodeURIComponent(new URL(req.url).pathname.split('/').at(-1));
   if(req.method==='GET')return Response.json({records:table==='Proofs'?proofs:[]});
   assert.equal(req.method,'POST');assert.equal(table,'Proofs','intake may only write pending evidence');
   const body=await req.json();const record={id:'rec_upload',fields:body.fields,createdTime:'2026-10-15T02:00:00Z'};proofs.push(record);return Response.json(record,{status:201});
  }},
  SLIP_EXTRACTOR:{async fetch(req){extracts.push(req.url);return Response.json({result:{payment_ref:'SYNTHETIC_REF',amount_thb:100,confidence_score:.99,provider:'bank_qr'}})}},
  LINE_SLIP_EVIDENCE:{async put(key,bytes,opts){writes.push({key,opts});blobs.set(key,new Uint8Array(bytes));},async delete(key){blobs.delete(key);},async get(key){return blobs.has(key)?{body:blobs.get(key),httpMetadata:{contentType:'image/png'}}:null;}},
  PAYMENTS_WORKER:{fetch(){throw Error('intake must never approve or call payment mutations')}},
 };
 return {env,proofs,writes,extracts};
}
test('existing studio transport rejects unauthenticated uploads before private parsing or storage',async()=>{
 const res=await adminEntry.fetch(upload(),{},{});assert.equal(res.status,401);
 assert.equal((await res.json()).error,'unauthorized');
});
test('manual upload stages private evidence for LINE and CDM without money mutation',async()=>{
 for(const source of ['line_ofc','cdm_paper']){
  const f=fixture(),r=await studioEntry.fetch(upload({source}),f.env,{}),d=await r.json();
  assert.equal(r.status,201,JSON.stringify(d));assert.match(d.proof_id,/^upload_[a-f0-9]{24}$/);
  assert.equal(f.proofs.length,1);assert.equal(f.proofs[0].fields.status,'pending');assert.equal(f.proofs[0].fields.channel,'web_pay');
  const note=JSON.parse(f.proofs[0].fields.note);assert.equal(note.schema,'mmd_admin_slip_upload_v1');assert.equal(note.source_channel,source);assert.equal(note.explicit_context.context_text,'synthetic upload test');
  assert.equal(f.writes[0].opts.customMetadata.provenance,'admin_slip_upload');assert.equal(f.extracts.length,1);
  assert.ok(Object.values(d.guardrails).every(v=>v===false));
 }
});
test('same file retry resolves to the existing proof without storing or extracting again',async()=>{
 const f=fixture();const a=await (await handleAdminSlipUploadRequest(upload(),f.env)).json();
 const res=await handleAdminSlipUploadRequest(upload(),f.env),b=await res.json();
 assert.equal(res.status,200);assert.equal(b.duplicate,true);assert.equal(a.proof_id,b.proof_id);assert.equal(b.state,'existing');
 assert.equal(f.proofs.length,1);assert.equal(f.writes.length,1);assert.equal(f.extracts.length,1);
});
test('manual proof appears in the normal review queue and its evidence stays authenticated',async()=>{
 const f=fixture();const added=await (await handleAdminSlipUploadRequest(upload(),f.env)).json();
 const response=await handlePaymentReviewRequest(new Request('https://www.mmdbkk.com/v1/admin/payments/review-queue?limit=100'),f.env,{id:'synthetic_owner',role:'owner'});
 const queue=await response.json();assert.equal(response.status,200,JSON.stringify(queue));assert.equal(queue.items.length,1);assert.equal(queue.items[0].proof_id,added.proof_id);assert.equal(queue.items[0].source_channel,'line_ofc');
 assert.match(queue.items[0].evidence_preview_url,/^\/v1\/admin\/payments\/evidence\?proof_id=upload_/);
 const privateImage=await handlePaymentReviewRequest(new Request('https://www.mmdbkk.com'+queue.items[0].evidence_preview_url),f.env,{id:'synthetic_owner',role:'owner'});
 assert.equal(privateImage.status,200);assert.equal(privateImage.headers.get('content-type'),'image/png');assert.match(privateImage.headers.get('cache-control'),/no-store/);
 assert.equal((await privateImage.arrayBuffer()).byteLength,8);
});
test('invalid source/type, empty file and missing private bindings fail closed without storing',async()=>{
 for(const input of [{source:'invented'},{type:'image/heic'},{type:'image/gif'},{bytes:[]}]){
  const f=fixture();const r=await handleAdminSlipUploadRequest(upload(input),f.env);assert.ok(r.status>=400);assert.equal(f.writes.length,0);assert.equal(f.proofs.length,0);
 }
 for(const key of ['SLIP_EXTRACTOR','LINE_SLIP_EVIDENCE']){const f=fixture();delete f.env[key];const r=await handleAdminSlipUploadRequest(upload(),f.env);assert.equal(r.status,503);assert.equal(f.proofs.length,0);}
});
test('studio manual intake path is exact and does not add GET or review mutation routes',async()=>{
 const r=await studioEntry.fetch(new Request('https://www.mmdbkk.com'+PATH),{},{});assert.equal(r.status,405);assert.equal(r.headers.get('allow'),'POST');
});


test('manual intake uses the credential-bound owner session and rejects cross-origin or service credentials',async()=>{
 const f=fixture();Object.assign(f.env,{ADMIN_LOGIN_CREDENTIAL:'synthetic_upload_credential',ADMIN_SESSION_SECRET:'synthetic_upload_session_secret'});
 const login=await adminEntry.fetch(new Request('https://www.mmdbkk.com/internal/admin/login/session',{method:'POST',headers:{Origin:'https://www.mmdbkk.com','content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({credential:f.env.ADMIN_LOGIN_CREDENTIAL,next:'/internal/admin/payments'})}),f.env,{});
 assert.equal(login.status,303);const cookie=login.headers.get('set-cookie').split(';')[0];
 for(const headers of [{Origin:'https://other.invalid',Cookie:cookie},{Cookie:cookie},{Origin:'https://www.mmdbkk.com',Authorization:'Bearer service_test'},{Origin:'https://www.mmdbkk.com','X-Confirm-Key':'service_test'}]){
  const request=upload();const h=new Headers(request.headers);h.delete('origin');for(const [k,v]of Object.entries(headers))h.set(k,v);
  const response=await adminEntry.fetch(new Request(request,{headers:h}),f.env,{});assert.equal(response.status,403);assert.equal(f.proofs.length,0);
 }
 const request=upload();request.headers.set('Cookie',cookie);const r=await adminEntry.fetch(request,f.env,{});assert.equal(r.status,201,await r.clone().text());assert.equal(f.proofs.length,1);
});


test('duplicate historical evidence links to its actual review lane instead of disappearing from the normal queue',async()=>{
 const f=fixture();const added=await (await handleAdminSlipUploadRequest(upload(),f.env)).json();
 const note=JSON.parse(f.proofs[0].fields.note);note.schema='mmd_historical_slip_backfill_v1';f.proofs[0].fields.note=JSON.stringify(note);
 const d=await(await handleAdminSlipUploadRequest(upload(),f.env)).json();assert.equal(d.duplicate,true);assert.equal(d.review_path,'/internal/admin/payments/historical-backfill?proof_id='+added.proof_id);assert.equal(f.writes.length,1);
});

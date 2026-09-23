import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handlePrivateMediaReview, REVIEW_API, REVIEW_PAGE } from './src/private-media-review.js';
import { createCredentialBoundAdminSession } from './src/credential-bound-admin-session.js';
import { privateMediaFixture } from '../shared/private-media-fixture.mjs';

async function setup(role = 'owner') {
 const f = privateMediaFixture(); f.asset.fields.review_status = 'pending_review'; f.asset.fields.private_safe = false;
 const env = {...f.env, ADMIN_LOGIN_CREDENTIAL:'synthetic-admin-credential', AIRTABLE_TABLE_MODEL_MEDIA_ASSETS:'tblrpQXhHnbTU9RhW'};
 const cookie = 'mmd_admin_gate_v1=' + await createCredentialBoundAdminSession(new Request('https://mmdbkk.com'), {id:'reviewer-test',role},env);
 const calls=[];
 const modelFields={
  working_name:'Test Model',
  phone:'must-not-leak',
  drive_folder_id:'1ApprovedModelDrive12345',
  folder_approval_status:'Approved Folder Inventory',
  notes:'Private Teaser pilot. Explicit consent recorded for file approved-photo.jpg: verified LINE customers only.',
 };
 const http=async(input,init)=>{
  const req=input instanceof Request?input:new Request(input,init),url=new URL(req.url), parts=url.pathname.split('/');
  const table=decodeURIComponent(parts[3]),id=parts[4];calls.push({table,method:req.method,url});
  if(req.method==='GET') {
   if(table==='models') return Response.json(id?{id:'recModel',fields:modelFields}:{records:[{id:'recModel',fields:modelFields}]});
   return Response.json(id?f.asset:{records:[f.asset],offset:'next-page'});
  }
  const data=await req.json();
  if(req.method==='POST') {
   if(table==='tblrpQXhHnbTU9RhW'&&data.fields){
    f.asset.id='recImported';f.asset.fields={...data.fields};return Response.json(f.asset);
   }
   f.audits.push(data);
   if(f.auditFailure)return Response.json({}, {status:503});
   if(data.fields)return Response.json({id:'recReview',fields:data.fields});
   return Response.json({records:[{id:'recReview',fields:data.records[0].fields}]});
  }
  if(req.method==='PATCH') {f.writes.push(data);if(!f.logFailure)Object.assign(f.asset.fields,data.fields);return Response.json(f.asset);}
  throw new Error('unexpected');
 };
 env.AIRTABLE_HTTP={fetch:http};
 const request=(path=REVIEW_API, body, overrides={})=>new Request('https://mmdbkk.com'+path,{method:body?'POST':'GET',headers:{cookie,origin:'https://mmdbkk.com',...(body?{'content-type':'application/json'}:{}),...overrides},...(body?{body:JSON.stringify(body)}:{})});
 return {f,env,request,http,calls};
}
const action={model_id:'recModel',media_asset_id:'recMedia',expected_status:'pending_review',media_sha256:'a'.repeat(64),decision:'approve',note:''};

test('anonymous, forged actor header and Model cookie cannot read private queue',async()=>{
 const {env,calls}=await setup();
 for(const headers of [{},{'x-mmd-admin-role':'owner','x-mmd-admin-actor':'per'},{cookie:'mmd_model_session_v1=forged'}]){
  const res=await handlePrivateMediaReview(new Request('https://mmdbkk.com'+REVIEW_API,{headers}),env);assert.equal(res.status,401);
 }
 assert.equal(calls.length,0);
 const page=await handlePrivateMediaReview(new Request('https://mmdbkk.com'+REVIEW_PAGE),env);assert.equal(page.status,303);
});
test('signed Model and partner roles, service credentials and foreign hosts are denied',async()=>{
 for(const role of ['model','mms_partner']){const {env,request,calls}=await setup(role);assert.equal((await handlePrivateMediaReview(request(),env)).status,403);assert.equal(calls.length,0);}
 const {env,request}=await setup();
 assert.equal((await handlePrivateMediaReview(request(REVIEW_API,null,{authorization:'Bearer secret'}),env)).status,403);
 assert.equal((await handlePrivateMediaReview(new Request('https://mmdmodel.lovable.app'+REVIEW_API),env)).status,403);
});
test('queue exposes only review metadata, paginates and rejects formula injection',async()=>{
 const {env,request,calls}=await setup();
 const res=await handlePrivateMediaReview(request(REVIEW_API+'?cursor=offset-value'),env),data=await res.json();
 assert.equal(data.items[0].model_name,'Test Model');assert.equal(data.next_cursor,'next-page');assert.equal(data.items[0].reviewable,true);assert.equal(data.items[0].teaser_safe,false);
 assert(!JSON.stringify(data).match(/private_original_key|r2_bucket|must-not-leak|sha256/));
 assert.equal(calls[0].url.searchParams.get('offset'),'offset-value');assert.match(res.headers.get('cache-control'),/no-store/);
 assert.equal((await handlePrivateMediaReview(request(REVIEW_API+'?status=bad'),env)).status,400);
});
test('legacy public-bucket originals stay locked in queue',async()=>{
 const {env,request,f}=await setup();f.asset.fields.r2_bucket='mmd-models';const data=await(await handlePrivateMediaReview(request(),env)).json();assert.equal(data.items[0].reviewable,false);
});
test('page has CSP and no storage; unknown suffixes fail closed',async()=>{
 const {env,request}=await setup();const res=await handlePrivateMediaReview(request(REVIEW_PAGE),env);assert.match(res.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.match(await res.text(),/MMD Review/);
 assert.equal((await handlePrivateMediaReview(request(REVIEW_PAGE+'/unknown'),env)).status,404);
});
test('owner upload page is admin-session protected and stays in the private-media surface',async()=>{
 const {env,request}=await setup();
 const {OWNER_UPLOAD_PAGE}=await import('./src/private-media-review.js');
 const anonymous=await handlePrivateMediaReview(new Request('https://mmdbkk.com'+OWNER_UPLOAD_PAGE),env);
 assert.equal(anonymous.status,303);assert.match(anonymous.headers.get('location'),/internal%2Fadmin%2Fmmd-review%2Fupload/);
 const page=await handlePrivateMediaReview(request(OWNER_UPLOAD_PAGE),env);
 assert.equal(page.status,200);assert.equal(page.headers.get('x-mmd-admin-surface'),'private-media-owner-upload');assert.match(await page.text(),/อัปโหลด Private Teaser/);
});
test('owner can import only the exact Drive image named in Private Teaser consent and it still requires canonical review',async()=>{
 const {env,request,http,f}=await setup();
 const bytes=new Uint8Array([255,216,255,1,2,3,4,5]);
 let stored=null,driveCalls=0;
 env.PRIVATE_MODEL_MEDIA={
  head:async key=>stored?.key===key?stored.object:null,
  get:async key=>stored?.key===key?{...stored.object,body:stored.bytes}:null,
  put:async(key,value,options)=>{
   const copy=value instanceof Uint8Array?value:new Uint8Array(value);
   stored={key,bytes:copy,object:{size:copy.length,httpMetadata:options.httpMetadata,customMetadata:options.customMetadata}};
   return {etag:'stored'};
  },
 };
 env.MODEL_DRIVE_DIRECTORY={fetch:async req=>{
  driveCalls++;const url=new URL(req.url);
  assert.equal(url.hostname,'model-drive-directory.internal');
  assert.equal(url.searchParams.get('drive_folder_id'),'1ApprovedModelDrive12345');
  assert.equal(url.searchParams.get('file_name'),'approved-photo.jpg');
  return new Response(bytes,{status:200,headers:{'content-type':'image/jpeg','cache-control':'no-store, private'}});
 }};

 const denied=await handlePrivateMediaReview(request(REVIEW_API+'/import-approved-drive',{model_id:'recModel',file_name:'other.jpg'}),env);
 assert.equal(denied.status,409);assert.equal(driveCalls,0);

 const imported=await handlePrivateMediaReview(request(REVIEW_API+'/import-approved-drive',{model_id:'recModel',file_name:'approved-photo.jpg'}),env);
 assert.equal(imported.status,200,await imported.clone().text());
 const body=await imported.json();
 assert.equal(body.status,'pending_review');assert.equal(body.media_asset_id,'recImported');assert.equal(body.source,'approved_model_drive');
 assert.equal(driveCalls,1);assert.equal(f.asset.fields.review_status,'pending_review');assert.equal(f.asset.fields.private_safe,false);assert.equal(f.asset.fields.teaser_safe,false);
 assert.equal(f.asset.fields.r2_bucket,'mmd-private-model-media');assert.match(f.asset.fields.private_original_key,/^private-model-media\/recModel\/media_/);

 const original=globalThis.fetch;globalThis.fetch=http;
 try{
  const preview=await handlePrivateMediaReview(request(REVIEW_API+'/file',{model_id:'recModel',media_asset_id:'recImported'}),env);
  assert.equal(preview.status,200);const digest=preview.headers.get('x-mmd-media-sha256');assert.match(digest,/^[a-f0-9]{64}$/);
  const approved=await handlePrivateMediaReview(request(REVIEW_API+'/decision',{model_id:'recModel',media_asset_id:'recImported',expected_status:'pending_review',media_sha256:digest,decision:'approve',teaser_safe:true,note:'Owner-approved exact Drive Private Teaser asset'}),env);
  assert.equal(approved.status,200,await approved.clone().text());assert.equal((await approved.json()).teaser_safe,true);
  assert.equal(f.asset.fields.review_status,'approved');assert.equal(f.asset.fields.private_safe,true);assert.equal(f.asset.fields.teaser_safe,true);assert.equal(f.asset.fields.public_safe,false);
 }finally{globalThis.fetch=original;}
});

test('cross-origin posts, missing review hash, stale state and missing rejection note cause no writes',async()=>{
 const {env,request,f}=await setup();
 assert.equal((await handlePrivateMediaReview(request(REVIEW_API+'/decision',action,{origin:'https://evil.example'}),env)).status,403);
 for(const [patch,status] of [[{media_sha256:''},409],[{expected_status:'approved'},409],[{decision:'reject'},400]])assert.equal((await handlePrivateMediaReview(request(REVIEW_API+'/decision',{...action,...patch}),env)).status,status);
 assert.equal(f.writes.length,0);assert.equal(f.audits.length,0);
});
test('review file verifies bytes, supplies digest, denies unavailable private storage',async()=>{
 const {env,request,http}=await setup();const original=globalThis.fetch;globalThis.fetch=http;
 try{
  const res=await handlePrivateMediaReview(request(REVIEW_API+'/file',action),env);assert.equal(res.status,200);assert.equal(res.headers.get('x-mmd-media-sha256'),'a'.repeat(64));assert.equal((await res.arrayBuffer()).byteLength,8);
  env.PRIVATE_MODEL_MEDIA.head=async()=>null;assert.equal((await handlePrivateMediaReview(request(REVIEW_API+'/file',action),env)).status,503);
 }finally{globalThis.fetch=original;}
});
test('approve, reject and revoke use signed actor, audit before flags, and read back truth',async()=>{
 for(const decision of ['approve','reject','revoke']){
  const {env,request,http,f}=await setup();if(decision==='revoke'){f.asset.fields.review_status='approved';f.asset.fields.private_safe=true;}
  const original=globalThis.fetch;globalThis.fetch=http;
  try{
   const res=await handlePrivateMediaReview(request(REVIEW_API+'/decision',{...action,decision,expected_status:f.asset.fields.review_status,teaser_safe:decision==='approve',note:'Reviewed synthetic media',requested_by:'forged'}),env);
   assert.equal(res.status,200,await res.clone().text());assert.equal(f.audits[0].records[0].fields.requested_by,'reviewer-test');assert.equal(f.writes.length,1);assert.equal(f.asset.fields.private_safe,decision==='approve');assert.equal(f.asset.fields.teaser_safe,decision==='approve');assert.equal(f.asset.fields.public_safe,false);
  }finally{globalThis.fetch=original;}
 }
});
test('failed audit cannot approve; failed readback never reports success',async()=>{
 for(const failure of ['auditFailure','logFailure']){
  const {env,request,http,f}=await setup();f[failure]=true;const original=globalThis.fetch;globalThis.fetch=http;
  try{const res=await handlePrivateMediaReview(request(REVIEW_API+'/decision',action),env);assert(res.status>=500);assert.equal(f.asset.fields.private_safe,false);}finally{globalThis.fetch=original;}
 }
});
test('rendered page matches split source and does not persist browser media or drafts',async()=>{
 const {renderPrivateMediaReview}=await import('./src/private-media-review-page.js');const page=renderPrivateMediaReview('test');
 for(const name of ['html','css','js']){const text=await readFile(new URL('../webflow/internal/admin/mmd-review/review.'+name,import.meta.url),'utf8');assert(page.includes(text));}
 assert(!/localStorage|sessionStorage|indexedDB|caches\./.test(page));assert.match(page,/URL.revokeObjectURL/);assert.match(page,/id="mr-teaser"/);assert.match(page,/teaser_safe: teaserSafe/);
});
test('active production entrypoint handles review before generic wrappers',async()=>{
 const {default:worker}=await import('./src/admin-login-hero-worker.js');
 const res=await worker.fetch(new Request('https://mmdbkk.com'+REVIEW_API),{},{});assert.equal(res.status,401);assert.equal((await res.json()).error,'unauthorized');
 const {env,request}=await setup();const page=await worker.fetch(request(REVIEW_PAGE),env,{});assert.equal(page.headers.get('x-mmd-admin-surface'),'private-media-review');
});

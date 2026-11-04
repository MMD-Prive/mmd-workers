import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,createHmac,webcrypto} from 'node:crypto';
import {buildSigilOverlay,reverseEdits,sha,BASE_HASH,REVIEWED_TREE,ast,functionSpans} from './build-sigil-overlay.mjs';
const root=resolve(process.env.SIGIL_SOURCE_ROOT||dirname(fileURLToPath(import.meta.url))+'/../..');
const artifacts=resolve(process.env.SIGIL_ARTIFACT_DIR||'/workspace/shared/booking-identity-artifacts-20261103');
const baselinePath=process.env.SIGIL_BASELINE||artifacts+'/sigil-baseline.mjs';
const candidatePath=process.env.SIGIL_CANDIDATE||artifacts+'/sigil-candidate.mjs';
const baseline=fs.readFileSync(baselinePath),candidate=fs.readFileSync(candidatePath);
const built=buildSigilOverlay(baseline,{sourceRoot:root});
assert.ok(built.candidate.equals(candidate),'runtime tests must use exact freshly built candidate');
const released=(await import(pathToFileURL(candidatePath))).default;
const old=(await import(pathToFileURL(baselinePath))).default;
function fullCompiledRuntime(bytes){
 let source=bytes.toString();
 for(const n of ast(source).body.filter(n=>n.type.startsWith('Export')).reverse())source=source.slice(0,n.start)+source.slice(n.end);
 return vm.runInNewContext(source+'\n;({worker:runtime_index_default,legacyConfirm:handleTrustedBookingConfirm,privateAccess:currentPrivateAccess,discovery:resolveDiscoveryViewer})',{
  Request,Response,Headers,URL,URLSearchParams,TextEncoder,TextDecoder,AbortController,AbortSignal,crypto:webcrypto,console,Date,setTimeout,clearTimeout,atob,btoa,fetch:(...args)=>globalThis.fetch(...args),
 });
}
const legacy=fullCompiledRuntime(candidate);
const memberId='fixture-member-A',A='recAAAAAAAAAAAAAA',B='recBBBBBBBBBBBBBB',E='recEEEEEEEEEEEEEE';
const modelId='recModelFixture01',mediaId='media_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const secret='fixture-only-service-secret-longer-than-32';
const memberRef=createHash('sha256').update('mmd-discovery-member-v1:'+memberId).digest('hex');
function signedOwner(ref='book_A'){
 const owner={schema:'public_booking_owner_v1',member_id:memberId,member_record_id:A,member_ref:memberRef};
 owner.signature=createHmac('sha256',secret).update(JSON.stringify([owner.schema,ref,memberId,A,memberRef])).digest('hex');return owner;
}
function request(path,body,method=body===undefined?'GET':'POST'){
 return new Request('https://sigil.mmdbkk.com'+path,{method,headers:{'content-type':'application/json',cookie:'__Secure-mmd_discovery_session=fixture','x-mmd-internal-token':'fixture-internal'},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
function fixture(t,opts={}){
 const reads=[],writes=[],identityCalls=[],careCalls=[],storageReads=[];
 const owners=opts.owners===undefined?[A]:opts.owners;
 const booking=opts.booking===undefined?{id:'recBookingFixture',fields:{booking_ref:'book_A',member_status:'active',resolver_payload_json:JSON.stringify({access:{member_record_id:A}})}}:opts.booking;
 const privateModel={id:modelId,fields:{working_name:'Synthetic Private',status:'active',can_work_public:false,can_work_private:true,private_tier:'premium',orientation:'straight',private_work_format:'pn'}};
 const publicModel={id:modelId,fields:{working_name:'Synthetic Public',status:'active',can_work_public:true,customer_discovery_policy_json:JSON.stringify({schema_version:'model_customer_discovery_v1',require_verified_customer:true,blocked_member_refs:[]})}};
 const model=opts.model||privateModel;
 const asset={id:'recAssetFixture01',fields:{Model:[modelId],media_id:mediaId,media_type:'public_gallery',asset_role:'gallery_candidate',media_visibility:'public_candidate',review_status:'approved',public_safe:true,private_safe:false,r2_bucket:'mmd-models',file_type:'image/webp',file_size_bytes:100,private_original_key:'models/'+modelId+'/asset/image.webp',...(opts.mediaFields||{})}};
 const env={AIRTABLE_API_KEY:'fixture',AIRTABLE_BASE_ID:'fixture',AIRTABLE_TABLE_MEMBERS_ID:'Members',AIRTABLE_TABLE_ENTITLEMENTS_ID:'Entitlements',AIRTABLE_TABLE_BOOKING_REQUESTS_ID:'Bookings',AIRTABLE_TABLE_PAYMENTS_ID:'Payments',AIRTABLE_TABLE_MODELS_ID:'Models',AUTH_SERVICE_SIGIL_BOOKING_TO_MEMBER_PAGES:secret,INTERNAL_TOKEN:'fixture-internal',TELEGRAM_NOTIFY_ENABLED:'false',
  MEMBER_PAGES_WORKER:{fetch:async req=>{
   const path=new URL(req.url);
   if(path.pathname==='/__internal/care-back/approve-booking'){careCalls.push(await req.json());return Response.json({ok:true,status:'approved',approval_ref:'fixture-approval',single_use:true});}
   identityCalls.push(path);
   if(opts.identityStatus)return Response.json({ok:false,error:opts.identityError||'public_identity_review_required'},{status:opts.identityStatus});
   return Response.json({ok:true,...(opts.marker===false?{}:{identity_binding_verified:true}),memberId,memberRef});
  }},
  MMD_MODEL_ASSETS:{get:async key=>{storageReads.push(key);return{body:new Uint8Array(100),size:100,httpMetadata:{contentType:'image/webp'},customMetadata:{media_id:mediaId,model_record_id:modelId,sha256:'a'.repeat(64)}};},head:async key=>{storageReads.push(key);return{size:100,httpMetadata:{contentType:'image/webp'},customMetadata:{media_id:mediaId,model_record_id:modelId,sha256:'a'.repeat(64)}};}},
 };
 t.mock.method(globalThis,'fetch',async(input,init={})=>{
  const url=new URL(input instanceof URL ? input.href : typeof input==='string'?input:input.url),table=decodeURIComponent(url.pathname.split('/')[3]),method=init.method||input?.method||'GET';
  assert.equal(url.hostname,'api.airtable.com','no unexpected external network');
  if(method!=='GET'){
   assert.equal(table,'Bookings','no payment, entitlement, member, or notification mutation');
   const fields=JSON.parse(init.body).fields;writes.push({table,method,fields});return Response.json({id:'recBookingFixture',fields});
  }
  reads.push({table,formula:url.searchParams.get('filterByFormula')||'',path:url.pathname});
  if(table==='Members'){const row={id:A,fields:{member_id:memberId,'MMD — Member Entitlements':[E]}};return Response.json(url.pathname.endsWith('/'+A)?row:{records:[row]});}
  if(table==='Entitlements')return Response.json({records:[{id:E,fields:{member:owners,capability:opts.capability||'private_premium',member_lifecycle_status:'active',access_status:opts.expired?'expired':'active',...(opts.expired?{expire_at:'2020-01-01'}:{})}}]});
  if(table==='Bookings')return Response.json({records:booking?[booking]:[]});
  if(table==='Payments')return Response.json({records:[{id:'recPaymentFixture',fields:{status:'verified',amount_thb:4500,payment_ref:'pay_A',booking_ref:'book_A'}}]});
  if(table==='Models')return Response.json(url.pathname.endsWith('/'+modelId)?model:{records:[model]});
  if(table==='tblrpQXhHnbTU9RhW')return Response.json({records:[asset]});
  if(table==='MMD — Model Offer Rules')return Response.json({records:[]});
  throw Error('Unexpected fixture table '+table);
 });
 return{env,reads,writes,identityCalls,careCalls,storageReads,booking,publicModel,asset};
}

test('seven spans cover every reachable copy, preserve all other bytes, exports and live router',()=>{
 assert.equal(sha(baseline),BASE_HASH);assert.equal(built.edits.length,7);assert.ok(reverseEdits(candidate,built.edits).equals(baseline));
 assert.equal(built.proof.reviewed_tree,REVIEWED_TREE);assert.equal(built.proof.runtime_routes_preserved,true);assert.equal(built.proof.unrelated_bytes_preserved,true);
 for(const [name,count]of [['currentPrivateAccess',2],['resolveDiscoveryViewer',2],['resolveBookingViewer',1],['handleTrustedBookingConfirm',2]])assert.equal(functionSpans(candidate.toString(),name).length,count);
 assert.match(built.edits.find(e=>e.label==='global:handleTrustedBookingConfirm').after,/return __mmdBookingRelease20261103\.entitlementWorker\.fetch\(request, env\)/);
});
test('builder rejects modified baseline and inverse reconstruction rejects candidate drift',()=>{
 const changed=Buffer.from(baseline);changed[0]^=1;assert.throws(()=>buildSigilOverlay(changed,{sourceRoot:root}),/baseline drift/);
 const changedCandidate=Buffer.from(candidate.toString().replace('identity_binding_verified !== true','identity_binding_verified === true'));
 assert.throws(()=>reverseEdits(changedCandidate,built.edits),/inverse span drift/);
});
for(const owners of [[A,B],[B,A],[A,A],[],[B],A,null])test('compiled Public writes and Private search deny malformed/shared owner '+JSON.stringify(owners),async t=>{
 const f=fixture(t,{owners});
 const access=await legacy.privateAccess(request('/'),f.env,A,memberRef);assert.equal(access.viewerRef,'');assert.equal(access.allowedFolders.length,0);
 for(const path of ['/sigil/api/client/resolve','/sigil/api/booking/intake']){
  const res=await released.fetch(request(path,{lane:'public',budget_thb:4500,client_contact:'victim@example.invalid'}),f.env,{});
  assert.equal(res.status,403,await res.clone().text());assert.equal((await res.json()).error,'public_membership_required');
 }
 for(const scope of ['private','booking']){
  const res=await released.fetch(request('/sigil/api/models/search?scope='+scope+'&booking_ref=book_A'),f.env,{});
  const body=await res.json();assert.equal(res.status,200);assert.equal(body.access_scope,'public_only');assert.ok((body.items||[]).every(x=>x.scope!=='private'));
  if(scope==='private')assert.equal(body.blocked,true);
 }
 const intake=await released.fetch(request('/sigil/api/booking/intake',{lane:'private',booking_ref:'book_A'}),f.env,{});
 assert.equal(intake.status,403,await intake.clone().text());assert.equal(f.writes.length,0);assert.equal(f.storageReads.length,0);
 assert.ok(f.identityCalls.some(u=>u.searchParams.get('context')==='identity'));
});
test('actual old search baseline reproduces shared-owner reveal; candidate closes it',async t=>{
 const f=fixture(t,{owners:[A,B]});
 const route='/sigil/api/models/search?scope=private&booking_ref=book_A';
 const before=await(await old.fetch(request(route),f.env,{})).json();assert.equal(before.access_scope,'public_private');assert.equal(before.items[0].model_id,modelId);
 const after=await(await released.fetch(request(route),f.env,{})).json();assert.equal(after.blocked,true);assert.equal(after.items.length,0);assert.equal(f.writes.length,0);
});
test('compiled singleton entitlement still permits Private search and verified Public draft',async t=>{
 const f=fixture(t,{booking:null});
 const draft=await released.fetch(request('/sigil/api/booking/intake',{lane:'public',budget_thb:4500,booking_ref:'book_A'}),f.env,{});
 assert.equal(draft.status,200,await draft.clone().text());assert.ok(f.writes.length>0);assert.ok(f.writes.every(w=>w.fields['Request Status']!=='Confirmed'));
});
test('compiled singleton Private search still returns eligible model through global path',async t=>{
 const f=fixture(t);
 for(const scope of ['private','booking']){const res=await released.fetch(request('/sigil/api/models/search?scope='+scope+'&booking_ref=book_A'),f.env,{});const body=await res.json();assert.equal(body.access_scope,'public_private',JSON.stringify(body));assert.equal(body.items[0].model_id,modelId);}
 assert.equal(f.writes.length,0);
});
for(const marker of [false,true])test('compiled discovery marker='+marker+' gates Public writes and global Private search',async t=>{
 const f=fixture(t,{marker});
 const search=await(await released.fetch(request('/sigil/api/models/search?scope=private&booking_ref=book_A'),f.env,{})).json();assert.equal(search.access_scope,marker?'public_private':'public_only');
 if(!marker){const res=await released.fetch(request('/sigil/api/client/resolve',{lane:'public'}),f.env,{});assert.equal(res.status,503);assert.equal(f.writes.length,0);}
 assert.ok(f.identityCalls.every(u=>['identity','booking'].includes(u.searchParams.get('context'))));
});
test('member origin review denial survives compiled Public gate without writes',async t=>{
 const f=fixture(t,{identityStatus:403});const res=await released.fetch(request('/sigil/api/booking/intake',{lane:'public'}),f.env,{});
 assert.equal(res.status,403);assert.equal((await res.json()).error,'public_identity_review_required');assert.equal(f.writes.length,0);assert.equal(f.reads.length,0);
});
for(const entry of ['default','legacy'])for(const status of ['Requested','Confirmed'])test('compiled '+entry+' confirmation rejects unsigned '+status+' before entitlement/payment/write',async t=>{
 const booking={id:'recBookingFixture',fields:{booking_ref:'book_A',lane:'private','Request Status':status,client_contact:'victim@example.invalid',line_or_member_id:'claimed',resolver_payload_json:JSON.stringify({my_mmd_owner:{schema:'member_booking_owner_v2'}})}};
 const f=fixture(t,{booking});const req=request('/__internal/booking/confirm',{booking_ref:'book_A',payment_ref:'pay_A'});
 const res=entry==='default'?await released.fetch(req,f.env,{}):await legacy.legacyConfirm(req,f.env);
 assert.equal(res.status,409,await res.clone().text());assert.equal((await res.json()).error,'booking_owner_review_required');assert.ok(f.reads.every(r=>r.table==='Bookings'));assert.equal(f.writes.length,0);assert.equal(f.careCalls.length,0);
});
for(const entry of ['default','legacy'])test('compiled '+entry+' signed confirmation refuses shared entitlement before payment',async t=>{
 const booking={id:'recBookingFixture',fields:{booking_ref:'book_A',lane:'public',resolver_payload_json:JSON.stringify({public_booking_owner:signedOwner()})}};
 const f=fixture(t,{booking,owners:[A,B]});const req=request('/__internal/booking/confirm',{booking_ref:'book_A',payment_ref:'pay_A'});
 const res=entry==='default'?await released.fetch(req,f.env,{}):await legacy.legacyConfirm(req,f.env);
 assert.equal(res.status,503,await res.clone().text());assert.equal(f.writes.length,0);assert.ok(f.reads.every(r=>r.table!=='Payments'));assert.equal(f.careCalls.length,0);
});
for(const entry of ['default','legacy'])test('compiled '+entry+' signed singleton confirms once without consuming request early or duplicating CARE BACK',async t=>{
 const booking={id:'recBookingFixture',fields:{booking_ref:'book_A',lane:'public',line_or_member_id:'U'+'a'.repeat(32),'Selected Model ID':modelId,resolver_payload_json:JSON.stringify({public_booking_owner:signedOwner()})}};
 const f=fixture(t,{booking});const req=request('/__internal/booking/confirm',{booking_ref:'book_A',payment_ref:'pay_A',job_format:'PN'});
 const res=entry==='default'?await released.fetch(req,f.env,{}):await legacy.legacyConfirm(req,f.env);
 assert.equal(res.status,200,await res.clone().text());assert.equal(f.writes.length,1);assert.equal(f.writes[0].fields['Request Status'],'Confirmed');assert.equal(f.careCalls.length,entry==='default'?1:0);
});
for(const method of ['GET','HEAD'])for(const marker of [false,true])test('compiled '+method+' restricted public media rechecks marker '+marker+' before R2',async t=>{
 const f=fixture(t,{marker,model:{id:modelId,fields:{status:'active',can_work_public:true,working_name:'Synthetic Public',customer_discovery_policy_json:JSON.stringify({schema_version:'model_customer_discovery_v1',require_verified_customer:true,blocked_member_refs:[]})}}});
 const res=await released.fetch(request('/sigil/api/models/media/'+mediaId,undefined,method),f.env,{});
 assert.equal(res.status,marker?200:404,await res.clone().text());assert.equal(f.storageReads.length,marker?1:0);assert.equal(f.writes.length,0);
 assert.equal(f.identityCalls.length,1);assert.equal(f.identityCalls[0].searchParams.get('context'),'identity');
});
for(const method of ['GET','HEAD'])test('actual old '+method+' media baseline exposes without identity marker; candidate closes it',async t=>{
 const f=fixture(t,{marker:false,model:{id:modelId,fields:{status:'active',can_work_public:true,working_name:'Synthetic Public',customer_discovery_policy_json:JSON.stringify({schema_version:'model_customer_discovery_v1',require_verified_customer:true,blocked_member_refs:[]})}}});
 const path='/sigil/api/models/media/'+mediaId;
 const before=await old.fetch(request(path,undefined,method),f.env,{});assert.equal(before.status,200);assert.equal(f.storageReads.length,1);
 const after=await released.fetch(request(path,undefined,method),f.env,{});assert.equal(after.status,404);assert.equal(f.storageReads.length,1);assert.equal(f.writes.length,0);
});
for(const method of ['GET','HEAD'])test('compiled '+method+' private media cannot use public media route even with verified identity',async t=>{
 const f=fixture(t,{mediaFields:{public_safe:false,private_safe:true,media_visibility:'private'}});
 const res=await released.fetch(request('/sigil/api/models/media/'+mediaId,undefined,method),f.env,{});assert.equal(res.status,404);assert.equal(f.storageReads.length,0);assert.equal(f.writes.length,0);
});
test('4500 THB minimum, export contract and legacy media retirement remain unchanged',async t=>{
 const f=fixture(t);const path='/sigil/api/models/search?scope=public&search_mode=search&budget_thb=4499';
 const before=await(await old.fetch(request(path),f.env,{})).json();const after=await(await released.fetch(request(path),f.env,{})).json();assert.deepEqual(after,before);assert.deepEqual(after.errors,['public_budget_below_minimum']);
 for(const method of ['GET','HEAD']){const response=await released.fetch(new Request('https://models.mmdbkk.com/models/private/photo.webp',{method}),f.env,{});assert.equal(response.status,410);}
 assert.equal(f.storageReads.length,0);assert.equal(f.writes.length,0);
});

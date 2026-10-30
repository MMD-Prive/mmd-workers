import test from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { readFile } from 'node:fs/promises';
import { handleCompcardLibrary, isCompcardLibraryRequest, API, PAGE } from './src/compcard-library.js';
import { createCredentialBoundAdminSession } from './src/credential-bound-admin-session.js';
import { importEntry, updateEntry, readEntry, digest, boundedBytes, PREFIX } from './src/compcard-library-store.js';
import { listDriveSource, readDriveSource, listJobBoardSource, readJobBoardSource } from './src/compcard-library-sources.js';
import { renderCompcardLibrary } from './src/compcard-library-page.js';

const jpeg = new Uint8Array([255,216,255,224,0,1,2,3]);
const modelId='rec12345678901234';
class Bucket {
  data=new Map(); serial=0; reads=0; writes=0;
  async put(key,value,options={}) {
    const old=this.data.get(key),c=options.onlyIf;
    if(c?.etagDoesNotMatch==='*'&&old)return null;
    if(c?.etagMatches&&old?.etag!==c.etagMatches)return null;
    const bytes=typeof value==='string'?new TextEncoder().encode(value):new Uint8Array(value);
    const row={key,bytes,etag:'etag'+(++this.serial),httpMetadata:options.httpMetadata||{},customMetadata:options.customMetadata||{}};
    this.data.set(key,row);this.writes++;return {etag:row.etag};
  }
  async get(key){this.reads++;const row=this.data.get(key);if(!row)return null;return {...row,size:row.bytes.length,body:new Response(row.bytes).body,json:async()=>JSON.parse(new TextDecoder().decode(row.bytes)),text:async()=>new TextDecoder().decode(row.bytes)};}
  async list({prefix='',limit=50,cursor}={}){const keys=[...this.data.keys()].filter(k=>k.startsWith(prefix)).sort(),start=Number(cursor||0),end=start+limit;return {objects:keys.slice(start,end).map(key=>({key,etag:this.data.get(key).etag})),truncated:end<keys.length,...(end<keys.length?{cursor:String(end)}:{})};}
}
async function setup(role='owner') {
  const env={ADMIN_LOGIN_CREDENTIAL:'test-credential-only',PRIVATE_MODEL_MEDIA:new Bucket(),JOB_BOARD_COMPCARDS:new Bucket(),AIRTABLE_API_KEY:'fixture',AIRTABLE_BASE_ID:'appFixture'};
  const token=await createCredentialBoundAdminSession(new Request('https://mmdbkk.com'),{id:'test-owner',role},env);
  const req=(path=API,method='GET',body=null,headers={})=>new Request('https://mmdbkk.com'+path,{method,headers:{cookie:'mmd_admin_gate_v1='+token,...(['POST','PATCH'].includes(method)?{origin:'https://mmdbkk.com','content-type':'application/json'}:{}),...headers},...(body!==null?{body:typeof body==='string'||body instanceof Uint8Array?body:JSON.stringify(body)}:{})});
  const file=(overrides={})=>({bytes:jpeg,content_type:'image/jpeg',name:'Original',original_name:'IMG_001.jpg',source:{provider:'google_drive',ref:'drive:drive_file_000001',file_id:'drive_file_000001'},...overrides});
  return {env,req,file};
}
const actor={id:'owner'};
test('exact routes and anonymous file/data access are gated before storage',async()=>{
  const {env,req}=await setup();
  for(const p of [PAGE,API,API+'/drive',API+'/123/file'])assert.ok(isCompcardLibraryRequest(req(p)));
  assert.equal(isCompcardLibraryRequest(req(API+'-other')),false);
  for(const p of [API,API+'/drive/file?file_id=drive_file_000001',API+'/job-board/file?job_id=j&application_ref=a&slot=1',API+'/'+'a'.repeat(32)+'/file']) {
    assert.equal((await handleCompcardLibrary(new Request('https://mmdbkk.com'+p),env)).status,401);
  }
  assert.equal((await handleCompcardLibrary(new Request('https://mmdbkk.com'+PAGE),env)).status,303);
  assert.equal(env.PRIVATE_MODEL_MEDIA.reads,0);assert.equal(env.JOB_BOARD_COMPCARDS.reads,0);
});
test('model role, bearer authority, foreign and missing write origins fail closed',async()=>{
  const s=await setup('model');assert.equal((await handleCompcardLibrary(s.req(),s.env)).status,403);
  const {env,req}=await setup();
  for(const h of [{origin:'https://evil.example'},{authorization:'Bearer guessed'},{'x-confirm-key':'guess'}])assert.equal((await handleCompcardLibrary(req(API,'GET',null,h),env)).status,403);
  const r=req(API+'/upload','POST',jpeg,{'content-type':'image/jpeg','x-compcard-filename':'test.jpg'});r.headers.delete('origin');
  assert.equal((await handleCompcardLibrary(r,env)).status,403);assert.equal(env.PRIVATE_MODEL_MEDIA.writes,0);
});
test('upload stores immutable private bytes, requires real content, and deduplicates repeated files',async()=>{
  const {env,req}=await setup();const upload=()=>req(API+'/upload','POST',jpeg,{'content-type':'image/jpeg','x-compcard-filename':'Original.jpg'});
  const r=await handleCompcardLibrary(upload(),env),d=await r.json();assert.equal(r.status,201);assert.equal(d.item.status,'unmatched');assert.equal(d.item.model_id,'');assert.ok(!('blob_key'in d.item));
  const again=await(await handleCompcardLibrary(upload(),env)).json();assert.equal(again.duplicate,true);assert.equal(again.item.id,d.item.id);
  const file=await handleCompcardLibrary(req(API+'/'+d.item.id+'/file'),env);assert.deepEqual(new Uint8Array(await file.arrayBuffer()),jpeg);assert.match(file.headers.get('cache-control'),/private, no-store/);
  const bad=await handleCompcardLibrary(req(API+'/upload','POST',new TextEncoder().encode('<svg onload=alert(1)>'),{'content-type':'image/jpeg','x-compcard-filename':'evil.jpg'}),env);assert.equal(bad.status,415);
  assert.equal([...env.PRIVATE_MODEL_MEDIA.data.keys()].filter(k=>k.includes('/entries/')).length,1);
});
test('changed image under the same Drive file ID retains both versions; other source IDs do not merge',async()=>{
  const {env,file}=await setup();const a=await importEntry(env,file(),actor),b=await importEntry(env,file({bytes:new Uint8Array([...jpeg,4])}),actor),c=await importEntry(env,file({source:{provider:'google_drive',ref:'drive:other_file_000002'}}),actor);
  assert.notEqual(a.item.id,b.item.id);assert.notEqual(a.item.id,c.item.id);
  assert.equal(a.item.source.file_id,b.item.source.file_id);
  assert.deepEqual((await readEntry(env,a.item.id)).item.sha256,await digest(jpeg));
});
test('owner explicitly links a canonical model; aliases and prior metadata survive edits; stale writes reject',async()=>{
  const {env,file,req}=await setup(),a=await importEntry(env,file(),actor);
  const model={id:modelId,name:'Canonical Name',height_cm:180,weight_kg:75,status:'active'};
  const linked=await updateEntry(env,a.item.id,{etag:a.item.etag,model_id:model.id,aliases:['Old Name']},actor,model);
  assert.equal(linked.status,'linked');assert.equal(linked.model_id,modelId);assert.ok(linked.aliases.includes('IMG_001.jpg'));assert.ok(linked.aliases.includes('Old Name'));
  await assert.rejects(updateEntry(env,a.item.id,{etag:a.item.etag,name:'stale'},actor),{code:'record_changed_reload'});
  const history=await(await handleCompcardLibrary(req(API+'/'+a.item.id+'/history'),env)).json();assert.equal(history.items.length,1);assert.equal(history.items[0].model_id,'');
  await assert.rejects(updateEntry(env,a.item.id,{etag:linked.etag,status:'unmatched'},actor),{code:'status_invalid'});
});
test('R2 compare-and-swap rejects racing editors after they both read the same etag',async()=>{
  const {env,file}=await setup(),a=await importEntry(env,file(),actor),rawPut=env.PRIVATE_MODEL_MEDIA.put.bind(env.PRIVATE_MODEL_MEDIA);
  let competitor=true;
  env.PRIVATE_MODEL_MEDIA.put=async(key,value,options)=>{if(competitor&&options?.onlyIf?.etagMatches){competitor=false;await rawPut(key,JSON.stringify({...a.item,name:'Concurrent owner'}));}return rawPut(key,value,options);};
  await assert.rejects(updateEntry(env,a.item.id,{etag:a.item.etag,name:'Old editor'},actor),{code:'record_changed_reload'});
  assert.equal((await readEntry(env,a.item.id)).item.name,'Concurrent owner');
});
test('search includes original names and aliases; sparse matching pages preserve continuation',async()=>{
  const {env,file,req}=await setup();
  for(let i=0;i<260;i++)await env.PRIVATE_MODEL_MEDIA.put(PREFIX+'entries/'+String(i).padStart(32,'0')+'.json',JSON.stringify({schema:'mmd_compcard_library_v1',id:String(i).padStart(32,'0'),name:i===259?'Needle':'Other',original_name:'photo.jpg',aliases:[],content_type:'image/jpeg',status:'unmatched'}));
  const first=await(await handleCompcardLibrary(req(API+'?q=Needle'),env)).json();assert.equal(first.items.length,0);assert.ok(first.next_cursor);
  const second=await(await handleCompcardLibrary(req(API+'?q=Needle&cursor='+first.next_cursor),env)).json();assert.equal(second.items[0].name,'Needle');assert.equal(second.next_cursor,null);
});
test('bounded body reader cancels oversized streams before storage',async()=>{
  let cancelled=false;const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(10));c.enqueue(new Uint8Array(10));},cancel(){cancelled=true;}});
  await assert.rejects(boundedBytes(stream,15),{code:'file_too_large'});assert.ok(cancelled);
});
test('canonical linking re-reads model and never writes Airtable; no phone or notes are returned',async()=>{
  const {env,req,file}=await setup(),a=await importEntry(env,file(),actor),calls=[];
  env.AIRTABLE_HTTP={fetch:async(url,init)=>{calls.push({url,init});assert.equal(init.method,undefined);return Response.json({id:modelId,fields:{working_name:'Correct Name',height_cm:180,phone:'DO_NOT_RETURN',notes:'DO_NOT_RETURN'}});}};
  const d=await(await handleCompcardLibrary(req(API+'/'+a.item.id,'PATCH',{etag:a.item.etag,model_id:modelId}),env)).json();assert.equal(d.item.model_name,'Correct Name');assert.doesNotMatch(JSON.stringify(d),/DO_NOT_RETURN/);assert.equal(calls.length,1);
});
test('UI script parses, uses nonced CSP and no external media or credential storage',async()=>{
  const {env,req}=await setup(),r=await handleCompcardLibrary(req(PAGE),env),html=await r.text();assert.equal(r.status,200);assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.match(html,/grid-template-columns:repeat\(2/);assert.doesNotMatch(html,/localStorage|sessionStorage|onerror=|<img[^>]+https:/);
  const script=html.match(/<script nonce="[^"]+">([\s\S]*)<\/script>/)[1];new Script(script);
  const wrangler=await readFile(new URL('./wrangler.toml',import.meta.url),'utf8');assert.match(wrangler,/binding = "JOB_BOARD_COMPCARDS"/);assert.match(wrangler,/mmdbkk.com\/internal\/admin\/compcards\*/);
  const entry=await readFile(new URL('./src/admin-login-hero-worker.js',import.meta.url),'utf8');assert.match(entry,/if \(isCompcardLibraryRequest\(request\)\) return handleCompcardLibrary\(request, runtimeEnv\)/);
});
async function seedApplication(env,overrides={}) {
  const sha=await digest(jpeg),job='JOB-123',app='applicant_123',key=`public-job-board/v2/private-media/${job}/${app}/1.jpg`;
  await env.JOB_BOARD_COMPCARDS.put(key,jpeg,{httpMetadata:{contentType:'image/jpeg'},customMetadata:{sha256:sha,job_id:job,application_ref:app}});
  const a={schema:'mmd_public_job_board_v2.application',job_id:job,application_ref:app,submission_status:'submitted',applicant:{nickname:'Model One',height_cm:181,weight_kg:77,phone:'HIDDEN',line_id:'HIDDEN'},uploads:[{slot:1,key,content_type:'image/jpeg',bytes:jpeg.length,sha256:sha}],...overrides};
  await env.JOB_BOARD_COMPCARDS.put(`public-job-board/v2/applications/${job}/${app}.json`,JSON.stringify(a));return a;
}
test('Job Board exposes only submitted image summaries; imports selected immutable bytes without modifying source',async()=>{
  const {env,req}=await setup(),a=await seedApplication(env),before=env.JOB_BOARD_COMPCARDS.writes;
  const list=await listJobBoardSource(env,new URLSearchParams());assert.equal(list.files.length,1);assert.doesNotMatch(JSON.stringify(list),/HIDDEN|private-media/);
  const r=await handleCompcardLibrary(req(API+'/import','POST',{provider:'job_board',job_id:a.job_id,application_ref:a.application_ref,slot:1}),env),d=await r.json();assert.equal(r.status,201);assert.equal(d.item.height_cm,181);assert.equal(d.item.metrics_source,'job_board_applicant');assert.equal(d.item.model_id,'');assert.equal(env.JOB_BOARD_COMPCARDS.writes,before);
  await env.JOB_BOARD_COMPCARDS.put(a.uploads[0].key,new Uint8Array([...jpeg,4]),{httpMetadata:{contentType:'image/jpeg'},customMetadata:{sha256:'bad',job_id:a.job_id,application_ref:a.application_ref}});
  await assert.rejects(readJobBoardSource(env,new URLSearchParams({job_id:a.job_id,application_ref:a.application_ref,slot:'1'})),{code:'source_metadata_invalid'});
  assert.deepEqual(new Uint8Array(await(await handleCompcardLibrary(req(API+'/'+d.item.id+'/file'),env)).arrayBuffer()),jpeg);
});
test('draft and arbitrary Job Board object paths cannot be imported',async()=>{
  const {env}=await setup(),a=await seedApplication(env,{submission_status:'draft'});assert.equal((await listJobBoardSource(env,new URLSearchParams())).files.length,0);
  await assert.rejects(readJobBoardSource(env,new URLSearchParams({job_id:a.job_id,application_ref:a.application_ref,slot:'1'})),{code:'source_not_found'});
  await assert.rejects(readJobBoardSource(env,new URLSearchParams({job_id:'../jobs',application_ref:'x',slot:'1'})),{code:'job_board_reference_invalid'});
});
let account;
async function driveFixture(extra={}) {
  const {env}=await setup();
  if(!account){const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);const bytes=new Uint8Array(await crypto.subtle.exportKey('pkcs8',pair.privateKey));account={client_email:'fixture@example.invalid',private_key:'-----BEGIN PRIVATE KEY-----\n'+Buffer.from(bytes).toString('base64')+'\n-----END PRIVATE KEY-----'};}
  env.GOOGLE_SERVICE_ACCOUNT_JSON=account;env.COMPCARD_DRIVE_ROOTS_JSON=JSON.stringify([{id:'root_folder_00001',name:'Approved archive'}]);
  const files={root_folder_00001:{id:'root_folder_00001',name:'Archive',mimeType:'application/vnd.google-apps.folder'},sub_folder_000001:{id:'sub_folder_000001',name:'Sub',mimeType:'application/vnd.google-apps.folder',parents:['root_folder_00001']},drive_file_000001:{id:'drive_file_000001',name:'Old Name.jpg',mimeType:'image/jpeg',parents:['sub_folder_000001'],version:'2',size:String(jpeg.length)},outside_file_001:{id:'outside_file_001',name:'Private.jpg',mimeType:'image/jpeg',parents:[]},...extra};
  const calls=[];env.GOOGLE_DRIVE_HTTP={fetch:async(input)=>{const url=new URL(input);calls.push(url);if(url.hostname==='oauth2.googleapis.com')return Response.json({access_token:'fixture-only-token'});if(url.searchParams.get('alt')==='media')return new Response(jpeg);const id=url.pathname.split('/').pop();if(id==='files')return Response.json({files:[files.drive_file_000001],nextPageToken:'opaque-cursor'});return files[id]?Response.json(files[id]):Response.json({}, {status:404});}};
  return {env,files,calls};
}
test('Drive uses configured roots, paginates, checks ancestry and copies real file ID without renaming',async()=>{
  const {env,calls}=await driveFixture();const page=await listDriveSource(env,new URLSearchParams({folder_id:'sub_folder_000001'}));assert.equal(page.next_cursor,'opaque-cursor');assert.equal(page.files[0].name,'Old Name.jpg');
  const source=await readDriveSource(env,'drive_file_000001');assert.equal(source.source.file_id,'drive_file_000001');assert.match(source.source.path,/Archive \/ Sub \/ Old Name.jpg/);assert.deepEqual(source.bytes,jpeg);
  await assert.rejects(readDriveSource(env,'outside_file_001'),{code:'drive_file_outside_library'});
  assert.ok(calls.every(u=>u.hostname==='oauth2.googleapis.com'||u.hostname==='www.googleapis.com'));
});
test('Drive refuses changed versions, unsupported files and missing root config',async()=>{
  const {env,files}=await driveFixture();const http=env.GOOGLE_DRIVE_HTTP.fetch;let metaCalls=0;
  env.GOOGLE_DRIVE_HTTP.fetch=async(input)=>{const url=new URL(input);if(url.pathname.endsWith('/drive_file_000001')&&!url.searchParams.has('alt')){metaCalls++;return Response.json({...files.drive_file_000001,version:String(metaCalls)});}return http(input);};
  await assert.rejects(readDriveSource(env,'drive_file_000001'),{code:'source_changed_reload'});
  await assert.rejects(listDriveSource({},new URLSearchParams()),{code:'drive_roots_not_configured'});
});
test('Public Travel root classifies work without inferring orientation or granting public image access',async()=>{
  const {env}=await driveFixture();env.COMPCARD_DRIVE_ROOTS_JSON=JSON.stringify([{id:'root_folder_00001',name:'Public Travel',world:'public',work_types:['travel']}]);
  const source=await readDriveSource(env,'drive_file_000001'),a=await importEntry(env,source,actor);
  assert.equal(a.item.world,'public');assert.deepEqual(a.item.work_types,['travel']);assert.equal(a.item.classification_source,'drive_root');assert.equal(a.item.orientation,undefined);assert.equal(a.item.model_snapshot,null);
  const response=await handleCompcardLibrary(new Request('https://mmdbkk.com'+API+'/'+a.item.id+'/file'),env);assert.equal(response.status,401);
  const edited=await updateEntry(env,a.item.id,{etag:a.item.etag,work_types:['travel','extreme']},actor);
  assert.deepEqual(edited.work_types,['travel','extreme']);assert.equal(edited.classification_source,'owner_review');
});
test('world and work category filters preserve distinct card classifications',async()=>{
  const {env,req,file}=await setup();await importEntry(env,file({world:'public',work_types:['travel']}),actor);
  await importEntry(env,file({source:{provider:'owner_upload',ref:'upload:other'},world:'private',work_types:['vip']}),actor);
  const travel=await(await handleCompcardLibrary(req(API+'?world=public&work_type=travel'),env)).json();assert.equal(travel.items.length,1);assert.equal(travel.items[0].world,'public');
  const extreme=await(await handleCompcardLibrary(req(API+'?work_type=extreme'),env)).json();assert.equal(extreme.items.length,0);
  assert.equal((await handleCompcardLibrary(req(API+'?world=forged'),env)).status,400);
});
test('Drive reuses the deployed OAuth account and verifies its identity before reading archive files',async()=>{
  const {env,calls}=await driveFixture(),original=env.GOOGLE_DRIVE_HTTP.fetch;
  delete env.GOOGLE_SERVICE_ACCOUNT_JSON;
  Object.assign(env,{GOOGLE_DRIVE_CLIENT_ID:'fixture-client',GOOGLE_DRIVE_CLIENT_SECRET:'fixture-secret',GOOGLE_DRIVE_REFRESH_TOKEN:'fixture-refresh'});
  let refreshes=0;
  env.GOOGLE_DRIVE_HTTP.fetch=async(input,options)=>{
    if(String(input)==='https://oauth2.googleapis.com/token'){refreshes++;assert.equal(options.method,'POST');assert.equal(options.body.get('grant_type'),'refresh_token');return Response.json({access_token:'oauth-fixture-only'});}
    if(String(input).includes('/drive/v3/about?'))return Response.json({user:{emailAddress:'malemodel.bkk@gmail.com'}});
    return original(input,options);
  };
  const source=await readDriveSource(env,'drive_file_000001');assert.deepEqual(source.bytes,jpeg);assert.equal(refreshes,1);assert.ok(calls.length>0);
});
test('Drive rejects a different OAuth account or absent credentials without reading archive contents',async()=>{
  const {env}=await driveFixture();delete env.GOOGLE_SERVICE_ACCOUNT_JSON;
  Object.assign(env,{GOOGLE_DRIVE_CLIENT_ID:'fixture-client',GOOGLE_DRIVE_CLIENT_SECRET:'fixture-secret',GOOGLE_DRIVE_REFRESH_TOKEN:'fixture-refresh'});
  const calls=[];env.GOOGLE_DRIVE_HTTP.fetch=async(input)=>{calls.push(String(input));return String(input).includes('/about?')?Response.json({user:{emailAddress:'other@example.invalid'}}):Response.json({access_token:'fixture-only'});};
  await assert.rejects(readDriveSource(env,'drive_file_000001'),{code:'drive_account_mismatch'});assert.equal(calls.length,2);
  const missing={COMPCARD_DRIVE_ROOTS_JSON:env.COMPCARD_DRIVE_ROOTS_JSON};
  await assert.rejects(readDriveSource(missing,'drive_file_000001'),{code:'drive_credentials_not_configured'});
});
test('default Drive transport keeps the Workers fetch receiver for OAuth and metadata calls',async t=>{
  const {env}=await driveFixture(),original=env.GOOGLE_DRIVE_HTTP.fetch;
  delete env.GOOGLE_DRIVE_HTTP;delete env.GOOGLE_SERVICE_ACCOUNT_JSON;
  Object.assign(env,{GOOGLE_DRIVE_CLIENT_ID:'fixture-client',GOOGLE_DRIVE_CLIENT_SECRET:'fixture-secret',GOOGLE_DRIVE_REFRESH_TOKEN:'fixture-refresh'});
  t.mock.method(globalThis,'fetch',async function(input,options){
    assert.equal(this,globalThis,'Workers native fetch must keep its receiver');
    if(String(input)==='https://oauth2.googleapis.com/token')return Response.json({access_token:'fixture-only'});
    if(String(input).includes('/drive/v3/about?'))return Response.json({user:{emailAddress:'malemodel.bkk@gmail.com'}});
    return original(input,options);
  });
  assert.deepEqual((await readDriveSource(env,'drive_file_000001')).bytes,jpeg);
});

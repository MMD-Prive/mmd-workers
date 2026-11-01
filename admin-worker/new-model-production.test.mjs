import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {stageMedia,readBytes,reviewQueue,PREFIX} from './src/new-model-production.mjs';
globalThis.crypto ||= webcrypto;
const bytes=new Uint8Array([255,216,255,1]);
function fixture(){
 const objects=new Map(),records=[];let n=0,failWrites=false;
 const bucket={
  async get(key){const x=objects.get(key);return x?{...x,json:async()=>JSON.parse(typeof x.data==='string'?x.data:new TextDecoder().decode(x.data))}:null;},
  async head(key){return objects.get(key)||null;},
  async put(key,data,options={}){if(options.onlyIf?.etagDoesNotMatch==='*'&&objects.has(key))return null;if(options.onlyIf?.etagMatches!==undefined&&objects.get(key)?.etag!==options.onlyIf.etagMatches)return null;const row={data,size:typeof data==='string'?Buffer.byteLength(data):data.length,customMetadata:options.customMetadata,etag:String(++n)};objects.set(key,row);return row;},
  async delete(key){objects.delete(key);}
 };
 const registry=async(env,suffix,init={})=>{
  if(init.method==='POST'){if(failWrites)throw Error('outage');const {fields}=JSON.parse(init.body);records.push({id:'rec'+records.length,fields});return records.at(-1);}
  const formula=new URLSearchParams(suffix.slice(1)).get('filterByFormula');
  return {records:formula.includes('LEFT')?records:records.filter(x=>formula.includes(x.fields.request_id))};
 };
 return {env:{PRIVATE_MODEL_MEDIA:bucket},objects,records,registry,setFail:v=>failWrites=v};
}
const candidate={root_id:'root',file_id:'file',version:'1',visibility:'hidden',category:'standard',mimeType:'image/jpeg'};
const actor={id:'per'};
test('Hidden intake persists private original and pending review without model binding',async()=>{
 const f=fixture();const r=await stageMedia(f.env,candidate,actor,async()=>bytes,f);
 assert.equal(r.state,'pending_review');assert.equal(f.records.length,1);
 const p=JSON.parse(f.records[0].fields.payload_json);
 assert.equal(p.source.visibility,'hidden');assert.equal(p.public_safe,false);assert.equal(p.private_safe,false);assert.equal(p.canonical_model_matching_required,true);assert.equal(f.records[0].fields.Model,undefined);
 assert.ok([...f.objects.keys()].some(k=>k.startsWith(PREFIX+'receipts/')));
 assert.equal((await reviewQueue(f.env,f)).items.length,1);
});
test('repeat clicks do not download, duplicate review, or reset an approved request',async()=>{
 const f=fixture();await stageMedia(f.env,candidate,actor,async()=>bytes,f);f.records[0].fields.request_status='approved';
 const r=await stageMedia(f.env,candidate,actor,async()=>{throw Error('must not download');},f);
 assert.equal(r.state,'already_staged');assert.equal(f.records.length,1);assert.equal(f.records[0].fields.request_status,'approved');
});
test('registry failure leaves no success receipt; retry completes with the same immutable object',async()=>{
 const f=fixture();f.setFail(true);await assert.rejects(stageMedia(f.env,candidate,actor,async()=>bytes,f));
 assert.equal([...f.objects.keys()].some(k=>k.includes('/receipts/')),false);f.setFail(false);
 assert.equal((await stageMedia(f.env,candidate,actor,async()=>bytes,f)).state,'pending_review');assert.equal(f.records.length,1);
});
test('changed media contents create separate intake receipts',async()=>{
 const f=fixture();await stageMedia(f.env,candidate,actor,async()=>bytes,f);await stageMedia(f.env,{...candidate,version:'2'},actor,async()=>new Uint8Array([255,216,255,2]),f);assert.equal(f.records.length,2);
});
test('concurrent clicks acquire a single claim and create a single review',async()=>{
 const f=fixture();let release;const wait=new Promise(r=>release=r);
 const first=stageMedia(f.env,candidate,actor,async()=>{await wait;return bytes;},f);
 await new Promise(r=>setImmediate(r));const second=await stageMedia(f.env,candidate,actor,async()=>bytes,f);release();await first;
 assert.equal(second.state,'busy_or_recovery_required');assert.equal(f.records.length,1);
});
test('bounded reads reject oversized, truncated and mismatched media',async()=>{
 await assert.rejects(readBytes(new Response(bytes),3,'image/jpeg'));
 await assert.rejects(readBytes(new Response(bytes),5,'image/jpeg'));
 await assert.rejects(readBytes(new Response(bytes),4,'image/png'));
 assert.deepEqual(await readBytes(new Response(bytes),4,'image/jpeg'),bytes);
});
test('source deletion or version failure cannot create review or success receipt',async()=>{
 const f=fixture();await assert.rejects(stageMedia(f.env,candidate,actor,async()=>{throw Error('source_changed');},f));assert.equal(f.records.length,0);assert.ok([...f.objects.keys()].every(k=>k.startsWith(PREFIX+'locks/')));
});

test('actual flush scanner includes Review/Hidden, stages in resumable owner batches, and returns queue',async()=>{
 const {readFile}=await import('node:fs/promises');
 const moduleUrl=new URL('./src/new-model-production.mjs',import.meta.url).href;
 let source=await readFile(new URL('./src/model-media-flush-preview.js',import.meta.url),'utf8');
 source=source.replace(/from '\.\/new-model-production.mjs'/g,`from '${moduleUrl}'`).replace(/^import .* from "\.\/[^\n]+;\n/gm,'');
 source='const isOwnerActor=actor=>actor?.role==="owner";\n'+source;
 const {handleModelMediaFlushPreview:handle,MODEL_MEDIA_SOURCE_ROOTS:roots}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const f=fixture();const map=new Map(),email='malemodel.bkk@gmail.com';
 for(const root of roots){
   map.set(root.id,{id:root.id,mimeType:'application/vnd.google-apps.folder',owners:[{emailAddress:email}]});
   for(const name of ['Review','Hidden']){
    const folder={id:root.id+'_'+name,name,mimeType:'application/vnd.google-apps.folder',parents:[root.id],owners:[{emailAddress:email}]};map.set(folder.id,folder);
    const file={id:folder.id+'_photo',name:'photo.jpg',mimeType:'image/jpeg',parents:[folder.id],owners:[{emailAddress:email}],version:'1',size:'4'};map.set(file.id,file);
   }
 }
 let edited=false;
 const http=async value=>{
  const u=new URL(value);
  if(u.pathname.endsWith('/about'))return Response.json({user:{emailAddress:email}});
  const id=decodeURIComponent(u.pathname.split('/').at(-1));
  if(u.searchParams.get('alt')==='media')return new Response(edited?new Uint8Array([255,216,255,2]):bytes);
  if(u.searchParams.has('q')){const parent=u.searchParams.get('q').match(/^'([^']+)'/)[1];const files=[...map.values()].filter(x=>x.parents?.includes(parent));if(roots.some(r=>r.id===parent)&&!u.searchParams.has('pageToken'))return Response.json({files:files.slice(0,1),nextPageToken:'second'});return Response.json({files:u.searchParams.has('pageToken')?files.slice(1):files});}
  return Response.json(map.get(id));
 };
 const deps={readActor:async()=>({id:'per',role:'owner'}),getAccessToken:async()=>'fixture',http,sourceRoots:roots};
 // Use the real Airtable transport shape while keeping all writes in memory.
 f.env.AIRTABLE_API_KEY='fixture';f.env.AIRTABLE_BASE_ID='fixture';
 f.env.AIRTABLE_HTTP={fetch:async(url,init)=>Response.json(await f.registry(f.env,new URL(url).search,init))};
 const call=async input=>{const response=await handle(new Request('https://mmdbkk.com/v1/admin/model-media/flush-preview',{method:'POST',headers:{origin:'https://mmdbkk.com'},body:JSON.stringify(input)}),f.env,deps);assert.equal(response.status,200);return response.json();};
 const preview=await call({action:'preview_all'});assert.equal(preview.catalogue[0].images,2);assert.equal(preview.mmd_now.length,3);
 let data=await call({action:'stage_all'}),batches=1;
 while(data.continue_required){assert.ok(batches++<100);data=await call({action:'stage_all',run_id:data.run_id});}
 assert.equal(data.state,'pending_review');assert.equal(data.source_scan_complete,true);assert.equal(data.publication,false);assert.equal(f.records.length,22);
 const queue=await call({action:'review_queue'});assert.equal(queue.items.length,22);
 assert.ok(queue.items.some(x=>x.visibility==='hidden'));
 assert.ok(queue.items.some(x=>x.visibility==='review'));
 // A temporary failed write resumes from the prepared original; later files and repeat clicks stay safe.
 edited=true;for(const file of map.values())if(file.version)file.version='2';
 let rejectFirst=true;
 f.env.AIRTABLE_HTTP={fetch:async(url,init)=>{if(init?.method==='POST'&&rejectFirst){rejectFirst=false;return Response.json({}, {status:503});}return Response.json(await f.registry(f.env,new URL(url).search,init));}};
 data=await call({action:'stage_all'});batches=0;
 while(data.continue_required){assert.ok(batches++<100);data=await call({action:'stage_all',run_id:data.run_id});}
 assert.equal(data.state,'pending_review');assert.equal(data.failed_count,0);assert.equal(f.records.length,44);
 data=await call({action:'stage_all'});batches=0;
 while(data.continue_required){assert.ok(batches++<100);data=await call({action:'stage_all',run_id:data.run_id});}
 assert.equal(data.state,'pending_review');assert.equal(f.records.length,44);
});

test('production default scans exactly eight catalogue roots and excludes other lanes',async()=>{
 const {readFile}=await import('node:fs/promises');const moduleUrl=new URL('./src/new-model-production.mjs',import.meta.url).href;
 let source=await readFile(new URL('./src/model-media-flush-preview.js',import.meta.url),'utf8');source=source.replace(/from '\.\/new-model-production.mjs'/g,`from '${moduleUrl}'`).replace(/^import .* from "\.\/[^\n]+;\n/gm,'');
 source='const isOwnerActor=actor=>actor?.role==="owner";\n'+source;
 const {handleModelMediaFlushPreview:handle,MODEL_MEDIA_SOURCE_ROOTS:roots}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const requested=[];const http=async value=>{const url=new URL(value);if(url.pathname.endsWith('/about'))return Response.json({user:{emailAddress:'malemodel.bkk@gmail.com'}});if(url.pathname.includes('/files/')){const id=url.pathname.split('/').at(-1);requested.push(id);return Response.json({id,mimeType:'application/vnd.google-apps.folder',owners:[{emailAddress:'malemodel.bkk@gmail.com'}]});}return Response.json({files:[]});};
 const r=await handle(new Request('https://mmdbkk.com/v1/admin/model-media/flush-preview',{method:'POST',headers:{origin:'https://mmdbkk.com'},body:'{"action":"preview_all"}'}),{}, {readActor:async()=>({id:'per',role:'owner'}),getAccessToken:async()=>'fixture',http});
 assert.equal(r.status,200);assert.deepEqual(requested,roots.filter(r=>r.lane==='catalogue').map(r=>r.id));const data=await r.json();assert.equal(data.catalogue.length,8);assert.equal(data.mmd_now.length,0);
});

test('dependency failure reports a bounded phase/code without leaking exception details',async()=>{
 const {readFile}=await import('node:fs/promises');const moduleUrl=new URL('./src/new-model-production.mjs',import.meta.url).href;
 let source=await readFile(new URL('./src/model-media-flush-preview.js',import.meta.url),'utf8');source=source.replace(/from '\.\/new-model-production.mjs'/g,`from '${moduleUrl}'`).replace(/^import .* from "\.\/[^\n]+;\n/gm,'');source='const isOwnerActor=actor=>actor?.role==="owner";\n'+source;
 const {handleModelMediaFlushPreview:handle}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const r=await handle(new Request('https://mmdbkk.com/v1/admin/model-media/flush-preview',{method:'POST',headers:{origin:'https://mmdbkk.com'},body:'{"action":"stage_all"}'}),fixture().env, {readActor:async()=>({id:'per',role:'owner'}),getAccessToken:async()=>{throw Object.assign(Error('PRIVATE_SENTINEL'),{code:'drive_oauth_unavailable'});}});
 const data=await r.json();assert.equal(r.status,503);assert.equal(data.failed_phase,'oauth');assert.equal(data.reason,'drive_oauth_unavailable');assert.ok(!JSON.stringify(data).includes('PRIVATE_SENTINEL'));
});

test('dedicated FLUSH OAuth is isolated from shared credentials and partial config fails closed',async()=>{
 const {readFile}=await import('node:fs/promises');const moduleUrl=new URL('./src/new-model-production.mjs',import.meta.url).href;
 let source=await readFile(new URL('./src/model-media-flush-preview.js',import.meta.url),'utf8');source=source.replace(/from '\.\/new-model-production.mjs'/g,`from '${moduleUrl}'`).replace(/^import .* from "\.\/[^\n]+;\n/gm,'');
 source='const isOwnerActor=actor=>actor?.role==="owner";const libraryDriveToken=async env=>{if(env.GOOGLE_DRIVE_CLIENT_ID!=="test-client"||env.GOOGLE_DRIVE_CLIENT_SECRET!=="test-secret"||env.GOOGLE_DRIVE_REFRESH_TOKEN!=="test-refresh"||env.GOOGLE_SERVICE_ACCOUNT_JSON!==""||env.COMPCARD_DRIVE_OWNER_EMAIL!=="malemodel.bkk@gmail.com")throw Error("isolation_failed");return "fixture";};\n'+source;
 const {handleModelMediaFlushPreview:handle}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const request=()=>new Request('https://mmdbkk.com/v1/admin/model-media/flush-preview',{method:'POST',headers:{origin:'https://mmdbkk.com'},body:'{"action":"preview_all"}'});
 const env={FLUSH_GOOGLE_DRIVE_CLIENT_ID:'test-client',FLUSH_GOOGLE_DRIVE_CLIENT_SECRET:'test-secret',FLUSH_GOOGLE_DRIVE_REFRESH_TOKEN:'test-refresh',GOOGLE_DRIVE_CLIENT_ID:'shared-client',GOOGLE_SERVICE_ACCOUNT_JSON:'shared-service-account'};
 const http=async value=>{const u=new URL(value);if(u.pathname.endsWith('/about'))return Response.json({user:{emailAddress:'malemodel.bkk@gmail.com'}});if(u.pathname.includes('/files/'))return Response.json({id:u.pathname.split('/').at(-1),mimeType:'application/vnd.google-apps.folder',owners:[{emailAddress:'malemodel.bkk@gmail.com'}]});return Response.json({files:[]});};
 const deps={readActor:async()=>({id:'per',role:'owner'}),http};assert.equal((await handle(request(),env,deps)).status,200);assert.equal(env.GOOGLE_DRIVE_CLIENT_ID,'shared-client');assert.equal(env.GOOGLE_SERVICE_ACCOUNT_JSON,'shared-service-account');
 const partial=await handle(request(),{FLUSH_GOOGLE_DRIVE_CLIENT_ID:'test-client'},deps);assert.equal(partial.status,503);assert.equal((await partial.json()).reason,'drive_credentials_not_configured');
});

test('prepared originals resume registry work without downloading again',async()=>{
 const f=fixture();let downloads=0;
 assert.equal((await stageMedia(f.env,candidate,actor,async()=>{downloads++;return bytes;},{...f,deferRegistry:true})).state,'prepared_private');
 assert.equal(f.records.length,0);
 assert.equal((await stageMedia(f.env,candidate,actor,async()=>{throw Error('must not redownload');},f)).state,'pending_review');
 assert.equal(downloads,1);assert.equal(f.records.length,1);
});
test('expired claims recover with compare-and-swap and a single review',async()=>{
 const f=fixture(),{hash}=await import('./src/new-model-production.mjs');
 const id=await hash(JSON.stringify([candidate.root_id,candidate.file_id,candidate.version,candidate.visibility]));
 await f.env.PRIVATE_MODEL_MEDIA.put(PREFIX+'locks/'+id,JSON.stringify({actor:'per',at:new Date(Date.now()-181000).toISOString()}));
 const results=await Promise.all([stageMedia(f.env,candidate,actor,async()=>bytes,f),stageMedia(f.env,candidate,actor,async()=>bytes,f)]);
 assert.equal(results.filter(r=>r.state==='pending_review').length,1);assert.equal(f.records.length,1);
});
test('a late expired worker cannot commit or release its replacement claim',async()=>{
 const f=fixture();let now=1000000,release,entered;const wait=new Promise(r=>release=r),started=new Promise(r=>entered=r),deps={...f,now:()=>now};
 const first=stageMedia(f.env,candidate,actor,async()=>{entered();await wait;return bytes;},deps);
 await started;now+=180001;
 const second=await stageMedia(f.env,candidate,actor,async()=>bytes,deps);release();
 await assert.rejects(first,e=>e.code==='staging_claim_lost');assert.equal(second.state,'pending_review');assert.equal(f.records.length,1);
 const repeat=await stageMedia(f.env,candidate,actor,async()=>{throw Error('must not download');},deps);assert.equal(repeat.state,'already_staged');
});
async function loadFlush(){
 const {readFile}=await import('node:fs/promises');const moduleUrl=new URL('./src/new-model-production.mjs',import.meta.url).href;
 let source=await readFile(new URL('./src/model-media-flush-preview.js',import.meta.url),'utf8');source=source.replace(/from '\.\/new-model-production.mjs'/g,`from '${moduleUrl}'`).replace(/^import .* from "\.\/[^\n]+;\n/gm,'');
 return import('data:text/javascript;base64,'+Buffer.from('const isOwnerActor=a=>a?.role==="owner";\n'+source).toString('base64'));
}
const flushRequest=input=>new Request('https://mmdbkk.com/v1/admin/model-media/flush-preview',{method:'POST',headers:{origin:'https://mmdbkk.com'},body:JSON.stringify(input)});
test('large repeat runs bound receipt checks and do not require Google OAuth',async()=>{
 const {handleModelMediaFlushPreview:handle,MODEL_MEDIA_SOURCE_ROOTS:roots}=await loadFlush(),f=fixture(),runId=crypto.randomUUID();
 const candidates=Array.from({length:40},(_,i)=>({...candidate,root_id:roots[0].id,file_id:'file'+i}));
 for(const c of candidates)await stageMedia(f.env,c,actor,async()=>bytes,f);
 await f.env.PRIVATE_MODEL_MEDIA.put(PREFIX+'runs/'+runId+'.json',JSON.stringify({actor_id:'per',created_at:Date.now(),candidates,rows:[],scan_index:8}));
 let active=0,peak=0;
 for(const method of ['get','head']){const original=f.env.PRIVATE_MODEL_MEDIA[method];f.env.PRIVATE_MODEL_MEDIA[method]=async(...args)=>{active++;peak=Math.max(peak,active);try{await new Promise(r=>setImmediate(r));return await original(...args);}finally{active--;}};}
 let authCalls=0,steps=0,data;
 do{const r=await handle(flushRequest({action:'stage_all',run_id:runId}),f.env,{readActor:async()=>({id:'per',role:'owner'}),getAccessToken:async()=>{authCalls++;throw Error('OAuth must not be used');}});assert.equal(r.status,200);data=await r.json();assert.ok(data.completed_count<=8*++steps);}while(data.continue_required);
 assert.equal(steps,5);assert.equal(data.completed_count,40);assert.equal(authCalls,0);assert.equal(f.records.length,40);assert.ok(peak>1&&peak<=8);
});
test('a lost start response reuses the client run ID and cannot replace another actor run',async()=>{
 const {handleModelMediaFlushPreview:handle}=await loadFlush(),f=fixture(),runId=crypto.randomUUID();let available=false;
 const deps={readActor:async()=>({id:'per',role:'owner'}),getAccessToken:async()=>{if(!available)throw Object.assign(Error('offline'),{code:'drive_oauth_unavailable'});return 'fixture';},http:async value=>{const u=new URL(value);if(u.pathname.endsWith('/about'))return Response.json({user:{emailAddress:'malemodel.bkk@gmail.com'}});if(u.searchParams.has('q'))return Response.json({files:[]});return Response.json({id:u.pathname.split('/').at(-1),mimeType:'application/vnd.google-apps.folder',owners:[{emailAddress:'malemodel.bkk@gmail.com'}]});}};
 assert.equal((await handle(flushRequest({action:'stage_all',run_id:runId}),f.env,deps)).status,503);available=true;
 assert.equal((await handle(flushRequest({action:'stage_all',run_id:runId}),f.env,deps)).status,200);
 assert.equal([...f.objects.keys()].filter(k=>k.startsWith(PREFIX+'runs/')).length,1);
 assert.equal((await handle(flushRequest({action:'stage_all',run_id:runId}),f.env,{...deps,readActor:async()=>({id:'other-owner',role:'owner'})})).status,409);
});
test('cached Drive credentials refresh after a 401 without replacing the saved run',async()=>{
 const {readFile}=await import('node:fs/promises'),moduleUrl=new URL('./src/new-model-production.mjs',import.meta.url).href;
 let source=await readFile(new URL('./src/model-media-flush-preview.js',import.meta.url),'utf8');source=source.replace(/from '\.\/new-model-production.mjs'/g,`from '${moduleUrl}'`).replace(/^import .* from "\.\/[^\n]+;\n/gm,'');
 const {handleModelMediaFlushPreview:handle}=await import('data:text/javascript;base64,'+Buffer.from('const isOwnerActor=a=>a?.role==="owner";let minted=0;const libraryDriveToken=async()=>String(++minted);\n'+source).toString('base64'));
 const f=fixture(),env={...f.env,FLUSH_GOOGLE_DRIVE_CLIENT_ID:'test',FLUSH_GOOGLE_DRIVE_CLIENT_SECRET:'test',FLUSH_GOOGLE_DRIVE_REFRESH_TOKEN:'test'},runId=crypto.randomUUID(),tokens=[];
 const deps={readActor:async()=>({id:'per',role:'owner'}),http:async(value,init)=>{const t=init.headers.authorization;tokens.push(t);if(t==='Bearer 1')return Response.json({}, {status:401});const u=new URL(value);if(u.searchParams.has('q'))return Response.json({files:[]});return Response.json({id:u.pathname.split('/').at(-1),mimeType:'application/vnd.google-apps.folder',owners:[{emailAddress:'malemodel.bkk@gmail.com'}]});}};
 assert.equal((await handle(flushRequest({action:'stage_all',run_id:runId}),env,deps)).status,503);
 assert.equal((await handle(flushRequest({action:'stage_all',run_id:runId}),env,deps)).status,200);assert.ok(tokens.includes('Bearer 2'));
 assert.equal((await handle(flushRequest({action:'stage_all',run_id:runId}),{...env},deps)).status,200);assert.equal(tokens.at(-1),'Bearer 2');
 assert.equal((await handle(flushRequest({action:'stage_all',run_id:runId}),{...env,FLUSH_GOOGLE_DRIVE_CLIENT_SECRET:'rotated-test'},deps)).status,200);assert.equal(tokens.at(-1),'Bearer 3');
 assert.equal([...f.objects.keys()].filter(k=>k.startsWith(PREFIX+'runs/')).length,1);
});
test('metadata-only Drive revisions reuse the canonical review and original bytes',async()=>{
 const f=fixture();await stageMedia(f.env,candidate,actor,async()=>bytes,f);f.records[0].fields.request_status='approved';
 const changed={...candidate,version:'2'};const result=await stageMedia(f.env,changed,actor,async()=>bytes,f);
 assert.equal(result.state,'already_staged');assert.equal(f.records.length,1);assert.equal(f.records[0].fields.request_status,'approved');
 assert.equal([...f.objects.keys()].filter(k=>k.startsWith(PREFIX+'originals/')).length,1);
 assert.equal([...f.objects.keys()].filter(k=>k.startsWith(PREFIX+'receipts/')).length,2);
 assert.equal((await stageMedia(f.env,changed,actor,async()=>{throw Error('must not redownload');},f)).state,'already_staged');
});
test('concurrent revisions of the same file share a claim before content deduplication',async()=>{
 const f=fixture();let entered,release;const start=new Promise(r=>entered=r),wait=new Promise(r=>release=r);
 const first=stageMedia(f.env,candidate,actor,async()=>{entered();await wait;return bytes;},f);await start;
 const changed={...candidate,version:'2'};assert.equal((await stageMedia(f.env,changed,actor,async()=>bytes,f)).state,'busy_or_recovery_required');
 release();await first;assert.equal((await stageMedia(f.env,changed,actor,async()=>bytes,f)).state,'already_staged');assert.equal(f.records.length,1);
});
test('identical bytes in a different visibility lane still require a separate review',async()=>{
 const f=fixture();await stageMedia(f.env,candidate,actor,async()=>bytes,f);
 assert.equal((await stageMedia(f.env,{...candidate,visibility:'review'},actor,async()=>bytes,f)).state,'pending_review');assert.equal(f.records.length,2);
});

// Queue regression tests use synthetic identities and bytes only.
const queueApi=await import('./src/new-model-production.mjs');
function queueFixture(){
 const f=fixture(),id='rec00000000000001',intake='a'.repeat(64),sha='b'.repeat(64),model={id:'rec00000000000002',fields:{working_name:'NMP Synthetic Model',unique_key:'NMP-TEST'}};
 const payload={schema:'mmd.new_model_production.v1',intake_id:intake,source:{root_id:'root',category:'standard',visibility:'review',mimeType:'image/jpeg'},private_staging_key:PREFIX+'originals/'+intake+'/'+sha,sha256:sha,bytes:4,requires_per_approval:true,canonical_model_matching_required:true,public_safe:false,private_safe:false};
 let record={id,fields:{request_id:'nmp_'+intake,request_status:'pending_review',payload_json:JSON.stringify(payload)}};let patches=0,outage=false;
 const registry=async(env,suffix,init={})=>{if(init.method==='PATCH'){if(outage)throw Error('synthetic outage');patches++;Object.assign(record.fields,JSON.parse(init.body).fields);}return suffix.startsWith('?')?{records:[structuredClone(record)]}:structuredClone(record);};
 const deps={allowedRootIds:['root'],registry,models:async()=>structuredClone(model)};
 return {...f,id,payload,model,deps,get record(){return record;},get patches(){return patches;},setOutage(v){outage=v;}};
}
test('all 797 queue records are reachable across eight Airtable pages without exposing private storage keys',async()=>{
 let reads=0;const ids=new Set();let cursor;
 do{const result=await reviewQueue({}, {allowedRootIds:['root'],cursor,registry:async(env,suffix)=>{const q=new URLSearchParams(suffix.slice(1));assert.match(q.get('filterByFormula'),/FIND\('root'/);const start=Number(q.get('offset')||0);reads++;return {records:Array.from({length:Math.min(100,797-start)},(_,i)=>({id:'rec'+(start+i),fields:{payload_json:JSON.stringify({schema:'mmd.new_model_production.v1',intake_id:String(start+i),source:{root_id:'root',category:'standard',visibility:'review',mimeType:'image/jpeg'},private_staging_key:'NEVER_EXPOSE'})}})),...(start+100<797?{offset:String(start+100)}:{})};}});for(const row of result.items){ids.add(row.id);assert.equal(row.private_staging_key,undefined);}cursor=result.cursor;}while(cursor);
 assert.equal(ids.size,797);assert.equal(reads,8);
});
test('draft pairing and Hidden classification preserve immutable provenance, pending status and empty authoritative links',async()=>{
 const f=queueFixture(),before=structuredClone(f.payload),queue=await reviewQueue(f.env,f.deps);
 const input={record_id:f.id,revision:queue.items[0].revision,visibility:'hidden',model_id:f.model.id};
 const saved=await queueApi.saveReviewDraft(f.env,input,actor,f.deps);assert.equal(saved.item.model.name,'NMP Synthetic Model');assert.equal(saved.item.visibility,'hidden');assert.equal(saved.item.source_visibility,'review');assert.equal(saved.publication,false);
 const payload=JSON.parse(f.record.fields.payload_json);assert.deepEqual(payload.source,before.source);for(const key of ['public_safe','private_safe'])assert.equal(payload[key],false);assert.equal(f.record.fields.request_status,'pending_review');assert.equal(f.record.fields.Model,undefined);assert.equal(f.record.fields.linked_media_assets,undefined);
 await queueApi.saveReviewDraft(f.env,{...input,revision:saved.item.revision},actor,f.deps);assert.equal(f.patches,1);
 await assert.rejects(queueApi.saveReviewDraft(f.env,{...input,visibility:'review'},actor,f.deps),/review_conflict/);
});
test('failed draft save remains retryable; cross-root, approved and invalid-model requests fail closed',async()=>{
 const f=queueFixture(),queue=await reviewQueue(f.env,f.deps),input={record_id:f.id,revision:queue.items[0].revision,visibility:'hidden',model_id:null};
 f.setOutage(true);await assert.rejects(queueApi.saveReviewDraft(f.env,input,actor,f.deps),/outage/);assert.equal(JSON.parse(f.record.fields.payload_json).review_draft,undefined);
 f.setOutage(false);await queueApi.saveReviewDraft(f.env,input,actor,f.deps);assert.equal(f.patches,1);
 await assert.rejects(queueApi.reviewMedia(f.env,{record_id:f.id},{...f.deps,allowedRootIds:['other']}),/review_not_pending/);
 f.record.fields.request_status='approved';await assert.rejects(queueApi.reviewMedia(f.env,{record_id:f.id},f.deps),/review_not_pending/);
 await assert.rejects(queueApi.saveReviewDraft(f.env,{...input,model_id:'arbitrary'},actor,f.deps),/review_input_invalid/);
});
test('private media streams validated JPEG/MP4 only and rejects mismatched object metadata',async()=>{
 const f=queueFixture();let payload=JSON.parse(f.record.fields.payload_json);
 const object={size:4,customMetadata:{sha256:payload.sha256,intake_id:payload.intake_id,visibility:'review'},httpMetadata:{contentType:'image/jpeg'}};
 f.env.PRIVATE_MODEL_MEDIA.get=async()=>({...object,body:new ReadableStream({start(c){c.enqueue(bytes);c.close();}})});
 const response=await queueApi.reviewMedia(f.env,{record_id:f.id},f.deps);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('content-type'),'image/jpeg');assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);
 payload.source.mimeType='video/mp4';f.record.fields.payload_json=JSON.stringify(payload);object.httpMetadata.contentType='video/mp4';assert.equal((await queueApi.reviewMedia(f.env,{record_id:f.id},f.deps)).headers.get('content-type'),'video/mp4');
 object.customMetadata.sha256='bad';await assert.rejects(queueApi.reviewMedia(f.env,{record_id:f.id},f.deps),/private_media_invalid/);
});
test('model lookup uses real canonical field names, escapes query and returns only identity labels',async()=>{
 let target;const env={AIRTABLE_BASE_ID:'base',AIRTABLE_API_KEY:'test',AIRTABLE_HTTP:{fetch:async url=>{target=new URL(url);return Response.json({records:[{id:'rec00000000000002',fields:{working_name:'Synthetic',unique_key:'NMP',phone:'PRIVATE'}}]});}}};
 const result=await queueApi.reviewModels(env,{query:"NMP'"});assert.match(target.searchParams.get('filterByFormula'),/working_name/);assert.ok(target.searchParams.get('filterByFormula').includes("NMP'".toLowerCase().replace("'","\\'")));assert.deepEqual(Object.keys(result.items[0]),['id','name','key']);assert.deepEqual(target.searchParams.getAll('fields[]'),['working_name','nickname','unique_key']);
});
test('canonical single-record revalidation omits list-only query parameters before draft save',async()=>{
 const f=queueFixture(),queue=await reviewQueue(f.env,f.deps);let lookedUp=false;
 f.env.AIRTABLE_API_KEY='test';f.env.AIRTABLE_BASE_ID='base';f.env.AIRTABLE_HTTP={fetch:async url=>{const target=new URL(url);assert.equal(target.search,'');assert.ok(target.pathname.endsWith('/'+f.model.id));lookedUp=true;return Response.json(f.model);}};
 const saved=await queueApi.saveReviewDraft(f.env,{record_id:f.id,revision:queue.items[0].revision,visibility:'hidden',model_id:f.model.id},actor,{...f.deps,models:undefined});assert.equal(lookedUp,true);assert.equal(saved.item.model.id,f.model.id);
});

function draftInspectionFixture(count=2,exception=false){
 const rid=n=>'rec'+String(n).padStart(14,'0'),groupId=rid(9000),modelId=rid(9001),proposal='c'.repeat(64),folder='folder_synthetic_123456789',reviews=[],assets=[];
 for(let i=0;i<count;i++){
  const intake=String(i+1).padStart(64,'a'),sha='b'.repeat(64),id=rid(10000+i),asset=rid(11000+i),mime=i%2?'video/mp4':'image/jpeg',bytes=i%2?24:4;
  const p={schema:'mmd.new_model_production.v1',intake_id:intake,sha256:sha,bytes,private_staging_key:PREFIX+'originals/'+intake+'/'+sha,source:{root_id:'root',folder_id:folder,category:'up_country',lane:'catalogue',file_id:'file_synthetic_'+String(i).padStart(14,'0'),version:'1',mimeType:mime,visibility:i%2?'hidden':'review',ancestry:['root',folder]},public_safe:false,private_safe:false,requires_per_approval:true,canonical_model_matching_required:true,review_draft:{visibility:i%2?'hidden':'review',model:exception?null:{id:modelId,name:'Synthetic Model'},model_status:'pending_review',follow_up:{review_request_record_id:groupId,proposal_id:proposal},matching:{source_path:'Root/Synthetic Model'},...(exception?{}:{registration:{status:'draft_linked_pending_review',model_record_id:modelId,media_asset_record_id:asset,source_proposal_record_id:groupId,model_activation_approved:false,media_approved:false,identity_verified:false,public_safe:false,private_safe:false,requires_per_approval:true}})}};
  reviews.push({id,fields:{request_id:'nmp_'+intake,request_status:'pending_review',payload_json:JSON.stringify(p)}});
  assets.push({id:asset,fields:{media_id:'nmp_pending_asset_'+intake,Model:[modelId],'MMD — Model Review Requests':[groupId],review_status:'pending_review',media_type:'intake_pending_original',asset_role:'pending_model_review',media_visibility:'hidden',r2_bucket:'mmd-private-model-media',private_original_key:p.private_staging_key,file_type:mime,file_size_bytes:bytes}});
 }
 const payload={schema:exception?'mmd.model_matching_exception.v1':'mmd.new_model_creation_proposal.v1',proposal_id:proposal,proposal_status:'pending_review',source:{root_id:'root',category:'up_country',folder_id:folder,folder_path:'Root/Synthetic Model'},media:{count,review_record_ids:reviews.map(r=>r.id),intake_ids:reviews.map(r=>JSON.parse(r.fields.payload_json).intake_id)},public_safe:false,private_safe:false,requires_per_approval:true,canonical_model_matching_required:true,create_canonical_model:false,auto_create_allowed:false,publish_allowed:false,created_at:'2026-11-01T00:00:00Z',...(exception?{case_name:'Folk Synthetic',reason:'name_only_or_different_folder_scope',summary_th:'same name, different source scope',evidence:{files:reviews.map(r=>{const p=JSON.parse(r.fields.payload_json);return {review_record_id:r.id,file_id:p.source.file_id,source_parent_verified:true,parent_ids:[folder],file_name:'synthetic.jpg'};}),registry_candidates:[{id:rid(12345),name:'Synthetic Model',path:'Other Root/Public',folder_id:'other_folder_1234567',status:'active'}]}}:{proposed_model:{working_name:'Synthetic Model',identity_verified:false},draft_registration:{status:'pending_review',model_record_id:modelId,model_operational_status:'inactive',profile_review_status:'Needs review',identity_verified:false,model_activation_approved:false,media_approved:false,public_safe:false,private_safe:false,requires_per_approval:true,linked_media_count:count,media_asset_record_ids:assets.map(r=>r.id)}})};
 const group={id:groupId,fields:{request_type:exception?'model_matching_exception':'new_model_creation_proposal',request_status:'pending_review',...(exception?{}:{Model:[modelId],linked_media_assets:assets.map(r=>r.id)}),payload_json:JSON.stringify(payload)}};
 const model={id:modelId,fields:{working_name:'Synthetic Model',unique_key:'nmp_draft_'+proposal,drive_folder_id:folder,status:'inactive',requires_per_approval:true,catalog_visibility:'Hidden',canonical_profile_status:'Needs review',registry_record_type:'Intake Candidate',intake_gate_status:'Source Review',visibility_review_status:'pending_review',client_visibility_status:'hidden',phone:'NEVER_RETURN_PRIVATE_CONTACT'}};
 const backing=fixture();const calls=[];const deps={inspectionBucket:backing.env.PRIVATE_MODEL_MEDIA,allowedRootIds:['root'],registry:async(env,suffix,init)=>{calls.push({kind:'reviews',method:init?.method||'GET'});assert.equal(init?.method,undefined);return suffix.startsWith('/')?structuredClone(group):{records:[structuredClone(group)]};},readTable:async(kind,ids)=>{calls.push({kind,method:'GET'});const records=kind==='reviews'?reviews:kind==='models'?[model]:assets;return {records:structuredClone(records.filter(r=>ids.includes(r.id)))};}};
 return {group,model,reviews,assets,payload,deps,calls,backing};
}
test('group index reaches all 85 registered drafts / 739 files and three separate cases / 27 files',async()=>{
 const records=[];for(let i=0;i<85;i++){const f=draftInspectionFixture(i<59?9:8),p=JSON.parse(f.group.fields.payload_json);f.group.id='rec'+String(20000+i).padStart(14,'0');p.source.folder_id='synthetic_folder_'+i;p.draft_registration.model_record_id='rec'+String(50000+i).padStart(14,'0');f.group.fields.Model=[p.draft_registration.model_record_id];p.media.review_record_ids=p.media.review_record_ids.map((_,j)=>'rec'+String(40000+i*20+j).padStart(14,'0'));f.group.fields.payload_json=JSON.stringify(p);records.push(f.group);}for(const n of [14,6,7]){const f=draftInspectionFixture(n,true);f.group.id='rec'+String(30000+n).padStart(14,'0');const p=JSON.parse(f.group.fields.payload_json);p.media.review_record_ids=p.media.review_record_ids.map((_,j)=>'rec'+String(80000+n*20+j).padStart(14,'0'));f.group.fields.payload_json=JSON.stringify(p);records.push(f.group);}
 const result=await queueApi.draftReviewQueue({}, {},{allowedRootIds:['root'],registry:async()=>({records})});assert.equal(result.items.filter(x=>x.kind==='model').length,85);assert.equal(result.items.filter(x=>x.kind==='model').reduce((n,x)=>n+x.media_count,0),739);assert.equal(result.items.filter(x=>x.kind==='exception').reduce((n,x)=>n+x.media_count,0),27);assert.equal(result.read_only,true);assert.equal(result.publication,false);assert.equal(result.cursor,null);
 await assert.rejects(queueApi.draftReviewQueue({}, {},{allowedRootIds:['root'],registry:async()=>({records:[records[0],records[0]]})}),/state_changed/);
});
test('draft inspection validates model/asset/intake graph and returns safe evidence without private keys or contact data',async()=>{
 const f=draftInspectionFixture(),out=await queueApi.draftReviewDetail({}, {record_id:f.group.id},f.deps);assert.equal(out.media.length,2);assert.equal(out.model.operational_status,'inactive');assert.equal(out.evidence.identity_verified,false);assert.equal(out.media[1].mime,'video/mp4');assert.equal(out.media[1].visibility,'hidden');assert.equal(out.read_only,true);assert.equal(out.publication,false);assert.ok(f.calls.every(c=>c.method==='GET'));assert.doesNotMatch(JSON.stringify(out),/private_staging_key|private_original_key|payload_json|NEVER_RETURN_PRIVATE_CONTACT/);
});
test('registered draft graph drift, approval changes, cross-root references and safe-flag changes fail closed',async()=>{
 const edits=[f=>{f.model.fields.status='active';},f=>{f.assets[0].fields.public_safe=true;},f=>{f.assets[0].fields.Model=['rec00000000009999'];},f=>{f.assets[0].fields.private_original_key='outside/root';},f=>{const p=JSON.parse(f.group.fields.payload_json);p.source.root_id='outside';f.group.fields.payload_json=JSON.stringify(p);},f=>{f.reviews[0].fields.request_status='approved';},f=>{const p=JSON.parse(f.reviews[0].fields.payload_json);p.source.ancestry=['root','other_folder'];f.reviews[0].fields.payload_json=JSON.stringify(p);}];
 for(const edit of edits){const f=draftInspectionFixture();edit(f);await assert.rejects(queueApi.draftReviewDetail({}, {record_id:f.group.id},f.deps),/state_changed|review_not_pending/);}
});
test('exception inspection preserves separation and exposes recorded source evidence without creating a model',async()=>{
 const f=draftInspectionFixture(14,true),out=await queueApi.draftReviewDetail({}, {record_id:f.group.id},f.deps);assert.equal(out.item.kind,'exception');assert.equal(out.model,null);assert.equal(out.media.length,14);assert.equal(out.media[0].file_name,'synthetic.jpg');assert.equal(out.evidence.registry_candidates[0].source_path,'Other Root/Public');assert.deepEqual(f.calls.map(c=>c.kind),['reviews','reviews']);assert.equal(out.read_only,true);
});
test('registered intake can no longer be overwritten by the older draft pairing editor',async()=>{
 const f=queueFixture(),p=JSON.parse(f.record.fields.payload_json);p.review_draft={registration:{batch_id:'synthetic'}};f.record.fields.payload_json=JSON.stringify(p);const row=(await reviewQueue(f.env,f.deps)).items[0];assert.equal(row.registered_draft,true);await assert.rejects(queueApi.saveReviewDraft(f.env,{record_id:f.id,revision:row.revision,visibility:'review',model_id:null},actor,f.deps),/registered_read_only/);assert.equal(f.patches,0);
});

async function inspectionInput(f,overrides={}){const d=await queueApi.draftReviewDetail({}, {record_id:f.group.id},f.deps);return {record_id:f.group.id,revision:d.inspection.revision,operation_id:crypto.randomUUID(),result:'needs_more_evidence',reason:'Synthetic evidence check only',...overrides};}
test('model inspection appends result, required reason, server actor/time; all registry and media fields stay unchanged',async()=>{
 const f=draftInspectionFixture(),before=JSON.stringify([f.group,f.model,f.reviews,f.assets]),input=await inspectionInput(f);
 const saved=await queueApi.saveDraftInspection({},input,actor,f.deps);assert.equal(saved.publication,false);assert.equal(saved.pending_review,true);assert.equal(saved.inspection.current.reason,input.reason);assert.equal(saved.inspection.current.actor,'per');assert.ok(Number.isFinite(Date.parse(saved.inspection.current.at)));assert.equal(saved.inspection.history.length,1);
 const next=await queueApi.saveDraftInspection({},await inspectionInput(f,{result:'checked_pending_approval',reason:'Synthetic second review'}),actor,f.deps);assert.equal(next.inspection.history.length,2);assert.deepEqual(next.inspection.history[0],saved.inspection.history[0]);assert.equal(JSON.stringify([f.group,f.model,f.reviews,f.assets]),before);assert.ok(f.calls.every(c=>c.method==='GET'));
 const detail=await queueApi.draftReviewDetail({}, {record_id:f.group.id},f.deps);assert.equal(detail.inspection.history.length,2);assert.equal(detail.model.operational_status,'inactive');assert.equal(detail.item.status,'pending_review');assert.doesNotMatch(JSON.stringify(detail.inspection),/private_original_key|private_staging_key|source_revision|submission_revision/);
});
test('inspection repeats are idempotent, stale screens and changed operation contents fail closed',async()=>{
 const f=draftInspectionFixture(),input=await inspectionInput(f);await queueApi.saveDraftInspection({},input,actor,f.deps);const before=[...f.backing.objects.values()].map(o=>o.etag);
 assert.equal((await queueApi.saveDraftInspection({},input,actor,f.deps)).already_saved,true);assert.deepEqual([...f.backing.objects.values()].map(o=>o.etag),before);
 await assert.rejects(queueApi.saveDraftInspection({}, {...input,reason:'Different reason'},actor,f.deps),/inspection_conflict/);
 await assert.rejects(queueApi.saveDraftInspection({}, {...input,operation_id:crypto.randomUUID()},actor,f.deps),/inspection_conflict/);
});
test('concurrent inspection writes use conditional storage; no history is overwritten',async()=>{
 const f=draftInspectionFixture(),one=await inspectionInput(f),two={...one,operation_id:crypto.randomUUID(),reason:'Concurrent synthetic review'};
 const results=await Promise.allSettled([queueApi.saveDraftInspection({},one,actor,f.deps),queueApi.saveDraftInspection({},two,actor,f.deps)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.match(results.find(r=>r.status==='rejected').reason.message,/inspection_conflict/);
 const d=await queueApi.draftReviewDetail({}, {record_id:f.group.id},f.deps);assert.equal(d.inspection.history.length,1);
});
test('failed writes and a lost committed reply can retry with the same operation without duplicates',async()=>{
 const f=draftInspectionFixture(),input=await inspectionInput(f),bucket=f.deps.inspectionBucket,put=bucket.put;bucket.put=async()=>{throw Error('write outage');};
 await assert.rejects(queueApi.saveDraftInspection({},input,actor,f.deps),/outage/);assert.equal(f.backing.objects.size,0);
 bucket.put=async(...args)=>{await put(...args);throw Error('reply lost after commit');};await assert.rejects(queueApi.saveDraftInspection({},input,actor,f.deps),/reply lost/);
 bucket.put=put;const recovered=await queueApi.saveDraftInspection({},input,actor,f.deps);assert.equal(recovered.already_saved,true);assert.equal(recovered.inspection.history.length,1);
});
test('inspection rejects exceptions, unsafe graph, invalid reasons/results and forged history before writing',async()=>{
 const f=draftInspectionFixture(),input=await inspectionInput(f);for(const bad of [{reason:''},{reason:'   '},{reason:'x'.repeat(1001)},{result:'approved'},{result:'publish'},{operation_id:'bad'}])await assert.rejects(queueApi.saveDraftInspection({}, {...input,...bad},actor,f.deps),/invalid/);
 f.model.fields.status='active';await assert.rejects(queueApi.saveDraftInspection({},input,actor,f.deps),/state_changed/);assert.equal(f.backing.objects.size,0);
 const exception=draftInspectionFixture(7,true),d=await queueApi.draftReviewDetail({}, {record_id:exception.group.id},exception.deps);assert.equal(d.inspection,null);await assert.rejects(queueApi.saveDraftInspection({},input,actor,exception.deps),/model_invalid/);assert.equal(exception.backing.objects.size,0);
});
test('corrupted or full inspection history is preserved and never truncated',async()=>{
 const f=draftInspectionFixture(),input=await inspectionInput(f);await queueApi.saveDraftInspection({},input,actor,f.deps);const row=[...f.backing.objects.values()][0],log=JSON.parse(row.data);log.entries[0].result='approved';row.data=JSON.stringify(log);await assert.rejects(queueApi.draftReviewDetail({}, {record_id:f.group.id},f.deps),/history_invalid/);
 log.entries=Array.from({length:100},()=>({...JSON.parse(JSON.stringify(log.entries[0])),result:'needs_correction',operation_id:crypto.randomUUID()}));row.data=JSON.stringify(log);const full=await inspectionInput(f);await assert.rejects(queueApi.saveDraftInspection({},full,actor,f.deps),/history_full/);assert.equal(JSON.parse(row.data).entries.length,100);
});

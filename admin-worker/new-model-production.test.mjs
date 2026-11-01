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

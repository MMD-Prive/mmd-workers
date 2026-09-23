import test from 'node:test';
import assert from 'node:assert/strict';
import { handlePrivateMediaIngestOnce, PRIVATE_MEDIA_INGEST_ONCE_PATH } from './src/private-media-ingest-once.js';

const enc=new TextEncoder();
async function sha(value){
 const bytes=typeof value==='string'?enc.encode(value):value;
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function fixture(overrides={}){
 const token='A'.repeat(48);
 const bytes=new Uint8Array([255,216,255,1,2,3,4,5]);
 const capability={id:'recCapability',fields:{
  capability_id:'cap_test',
  model_record_id:'recModel',
  file_name:'approved.jpg',
  content_type:'image/jpeg',
  file_size_bytes:bytes.length,
  content_sha256:await sha(bytes),
  token_hash:await sha(token),
  expires_at:new Date(Date.now()+60_000).toISOString(),
  status:'ready',
  source:'test',
  ...overrides,
 }};
 let media=null,object=null;
 const requests=[];
 const env={
  AIRTABLE_API_KEY:'test',AIRTABLE_BASE_ID:'appTest',
  AIRTABLE_TABLE_PRIVATE_MEDIA_INGEST_CAPABILITIES:'tblCapabilities',
  AIRTABLE_TABLE_MODEL_MEDIA_ASSETS:'tblMedia',
  AIRTABLE_TABLE_MODEL_REVIEW_REQUESTS:'tblReviews',
  PRIVATE_MODEL_MEDIA:{
   head:async key=>object?.key===key?object.meta:null,
   get:async key=>object?.key===key?{...object.meta,body:object.bytes}:null,
   put:async(key,value,options)=>{
    const copy=value instanceof Uint8Array?value:new Uint8Array(value);
    object={key,bytes:copy,meta:{size:copy.length,httpMetadata:options.httpMetadata,customMetadata:options.customMetadata}};
    return {etag:'ok'};
   },
  },
 };
 env.AIRTABLE_HTTP={fetch:async request=>{
  const url=new URL(request.url),parts=url.pathname.split('/'),table=decodeURIComponent(parts[3]||''),id=parts[4];
  requests.push({table,method:request.method,url});
  if(table==='tblCapabilities'){
   if(request.method==='GET')return Response.json({records:[capability]});
   if(request.method==='PATCH'&&id==='recCapability'){
    const body=await request.json();Object.assign(capability.fields,body.fields);return Response.json(capability);
   }
  }
  if(table==='tblMedia'){
   if(request.method==='POST'){
    const body=await request.json();
    media={id:'recMedia',fields:{...body.fields}};
    return Response.json(media);
   }
   if(request.method==='GET'){
    if(id)return Response.json(media);
    return Response.json({records:media?[media]:[]});
   }
   if(request.method==='PATCH'&&id==='recMedia'){
    const body=await request.json();Object.assign(media.fields,body.fields);return Response.json(media);
   }
  }
  if(table==='tblReviews'&&request.method==='POST'){
   const body=await request.json();return Response.json({id:'recReview',fields:body.fields});
  }
  throw new Error('unexpected Airtable request '+request.method+' '+table+' '+id);
 }};
 const request=(rawToken=token,body=bytes,headers={})=>new Request('https://mmdbkk.com'+PRIVATE_MEDIA_INGEST_ONCE_PATH,{
  method:'POST',
  headers:{'content-type':'image/jpeg','x-mmd-private-ingest-token':rawToken,...headers},
  body,
 });
 return {env,token,bytes,capability,request,requests,getMedia:()=>media,getObject:()=>object};
}

test('one-time ingest requires capability token and rejects browser/service credentials',async()=>{
 const f=await fixture();
 assert.equal((await handlePrivateMediaIngestOnce(new Request('https://mmdbkk.com'+PRIVATE_MEDIA_INGEST_ONCE_PATH,{method:'POST',body:f.bytes,headers:{'content-type':'image/jpeg'}}),f.env)).status,401);
 assert.equal((await handlePrivateMediaIngestOnce(f.request(f.token,f.bytes,{cookie:'mmd_admin_gate_v1=x'}),f.env)).status,403);
 assert.equal((await handlePrivateMediaIngestOnce(f.request(f.token,f.bytes,{authorization:'Bearer x'}),f.env)).status,403);
 assert.equal(f.getMedia(),null);
});

test('expired, size mismatch and hash mismatch fail closed before private media creation',async()=>{
 const expired=await fixture({expires_at:new Date(Date.now()-1000).toISOString()});
 const expiredRes=await handlePrivateMediaIngestOnce(expired.request(),expired.env);
 assert.equal(expiredRes.status,410);assert.equal(expired.capability.fields.status,'expired');assert.equal(expired.getMedia(),null);

 const badSize=await fixture();
 const sizeRes=await handlePrivateMediaIngestOnce(badSize.request(badSize.token,new Uint8Array([255,216,255])),badSize.env);
 assert.equal(sizeRes.status,400);assert.equal(badSize.capability.fields.status,'ready');assert.equal(badSize.getMedia(),null);

 const badHash=await fixture({content_sha256:'b'.repeat(64)});
 const hashRes=await handlePrivateMediaIngestOnce(badHash.request(),badHash.env);
 assert.equal(hashRes.status,409);assert.equal(badHash.capability.fields.status,'ready');assert.equal(badHash.getMedia(),null);
});

test('valid ingest creates private pending-review media once and closes capability',async()=>{
 const f=await fixture();
 const res=await handlePrivateMediaIngestOnce(f.request(),f.env);
 assert.equal(res.status,200,await res.clone().text());
 const body=await res.json();
 assert.equal(body.ok,true);assert.equal(body.status,'pending_review');assert.equal(body.media_asset_id,'recMedia');
 assert.equal(f.capability.fields.status,'consumed');assert.equal(f.capability.fields.media_asset_record_id,'recMedia');
 assert.ok(f.capability.fields.consumed_at);
 const media=f.getMedia().fields;
 assert.equal(media.review_status,'pending_review');assert.equal(media.private_safe,false);assert.equal(media.teaser_safe,false);assert.equal(media.public_safe,false);
 assert.equal(media.r2_bucket,'mmd-private-model-media');
 assert.equal(f.getObject().meta.customMetadata.sha256,await sha(f.bytes));

 const replay=await handlePrivateMediaIngestOnce(f.request(),f.env);
 assert.equal(replay.status,409);assert.equal((await replay.json()).error,'ingest_capability_not_ready');
});

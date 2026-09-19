import test from "node:test";
import assert from "node:assert/strict";
import { planPrivateUpload, uploadPrivateMedia, completePrivateMetadata } from "./private-media.mjs";
import modelWorker from "../admin-worker/src/model-liff-worker.js";

function fixture() {
  const records = new Map(), objects = new Map(), reviews=[];
  const env = {AIRTABLE_API_KEY:'test',AIRTABLE_BASE_ID:'appTest',
    PRIVATE_MODEL_MEDIA:{
      head:async key=>objects.get(key),get:async key=>objects.get(key),
      put:async(key,bytes,options)=>{assert.deepEqual(options.onlyIf,{etagDoesNotMatch:'*'});if(objects.has(key))return null;const object={size:bytes.length,...options,bytes};objects.set(key,object);return object;},
    },
    AIRTABLE_HTTP:{fetch:async req=>{
      const url=new URL(req.url),id=url.pathname.split('/')[4];
      if(req.method==='GET')return Response.json({records:[...records.values()].filter(row=>url.search.includes(row.fields.media_id))});
      const body=await req.json();
      if(decodeURIComponent(url.pathname).includes('Model Review Requests')) { reviews.push(body.fields);return Response.json({id:'recReview',fields:body.fields}); }
      if(req.method==='POST'){const record={id:'recMedia',fields:body.fields};records.set('recMedia',record);return Response.json(record);}
      if(req.method==='PATCH'){const row=records.get(id);Object.assign(row.fields,body.fields);return Response.json(row);}
      throw new Error('unexpected_method');
    }},
  };
  return {env,records,objects,reviews};
}
const png=new Uint8Array([137,80,78,71,13,10,26,10]);
const planInput={file_name:'private.png',content_type:'image/png',file_size_bytes:8};
const uploadRequest=(bytes=png)=>new Request('https://www.mmdbkk.com/v1/model/media/private-upload',{method:'POST',headers:{'content-type':'image/png'},body:bytes});

test('private upload persists bytes before review and never grants approval',async()=>{
  const f=fixture(),plan=await planPrivateUpload(f.env,'recModel',{...planInput,private_safe:true,review_status:'approved',model_id:'recOther'});
  assert.equal(JSON.stringify(plan).includes('storage_key'),false);
  assert.equal(f.objects.size,0);
  const result=await uploadPrivateMedia(uploadRequest(),f.env,'recModel',plan.asset_id);
  assert.equal(result.status,'pending_review');assert.equal(f.objects.size,1);assert.equal(f.reviews.length,1);
  const fields=f.records.get('recMedia').fields;
  assert.deepEqual(fields.Model,['recModel']);assert.equal(fields.private_safe,false);assert.equal(fields.public_safe,false);
  await assert.rejects(uploadPrivateMedia(uploadRequest(),f.env,'recModel',plan.asset_id),/media_upload_state_conflict/);
});
test('metadata completion cannot invent a missing R2 object',async()=>{
  const f=fixture();await planPrivateUpload(f.env,'recModel',planInput);
  await assert.rejects(completePrivateMetadata(f.env,f.records.get('recMedia'),'recModel'),/private_media_object_unverified/);
  assert.equal(f.records.get('recMedia').fields.review_status,'pending_upload');assert.equal(f.reviews.length,0);
});
test('wrong model, forged MIME and expired plans cannot upload',async()=>{
  const f=fixture(),plan=await planPrivateUpload(f.env,'recModel',planInput);
  await assert.rejects(uploadPrivateMedia(uploadRequest(),f.env,'recOther',plan.asset_id),/media_owner_mismatch/);
  await assert.rejects(uploadPrivateMedia(uploadRequest(new Uint8Array(8)),f.env,'recModel',plan.asset_id),/media_content_type_mismatch/);
  f.records.get('recMedia').fields.uploaded_at='2020-01-01T00:00:00Z';
  await assert.rejects(uploadPrivateMedia(uploadRequest(),f.env,'recModel',plan.asset_id),/upload_plan_expired/);
  assert.equal(f.objects.size,0);
});
test('private storage never falls back to the public bucket',async()=>{
  await assert.rejects(planPrivateUpload({MMD_MODEL_ASSETS:{put:()=>{throw Error('public bucket reached');}}},'recModel',planInput),/private_media_storage_unavailable/);
});
test('admin bearer cannot substitute for a Model session on private uploads',async()=>{
  const response=await modelWorker.fetch(new Request('https://www.mmdbkk.com/v1/model/media/private-upload-plan',{method:'POST',headers:{authorization:'Bearer test-admin',origin:'https://www.mmdbkk.com','content-type':'application/json'},body:JSON.stringify(planInput)}),{ADMIN_BEARER:'test-admin',ALLOWED_ORIGINS:'https://www.mmdbkk.com'});
  assert.equal(response.status,401);
});

test('Lovable upload preflight succeeds only for the explicitly allowed host',async()=>{
  for(const origin of ['https://mmdmodel.lovable.app','https://evil.example']){
    const r=await modelWorker.fetch(new Request('https://mmdbkk.com/v1/model/media/private-upload-plan',{method:'OPTIONS',headers:{origin}}),{ALLOWED_ORIGINS:'https://mmdmodel.lovable.app'});
    assert.equal(r.status,origin.includes('evil')?403:204);
    if(r.status===204){assert.equal(r.headers.get('access-control-allow-origin'),origin);assert.equal(r.headers.get('access-control-allow-credentials'),'true');}
  }
});

test('active entrypoint binds upload ownership to signed Model session and rejects admin actions',async()=>{
  const {default:active}=await import('../admin-worker/src/admin-login-hero-worker.js');
  const f=fixture(),secret='synthetic-model-session-secret';
  f.env.MODEL_SESSION_SIGNING_SECRET=secret;f.env.ALLOWED_ORIGINS='https://mmdmodel.lovable.app,https://mmdbkk.com';
  const encoded=Buffer.from(JSON.stringify({kind:'model_session',role:'model',model_record_id:'recModel',exp:Math.floor(Date.now()/1000)+60})).toString('base64url');
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(encoded))).toString('hex');
  const cookie=`mmd_model_session_v1=${encoded}.${signature}`;
  const headers={cookie,origin:'https://mmdmodel.lovable.app','content-type':'application/json'};
  const plan=await active.fetch(new Request('https://mmdbkk.com/v1/model/media/private-upload-plan',{method:'POST',headers,body:JSON.stringify({...planInput,model_id:'recOther',private_safe:true})}),f.env,{});
  assert.equal(plan.status,200,await plan.clone().text());assert.deepEqual(f.records.get('recMedia').fields.Model,['recModel']);assert.equal(f.records.get('recMedia').fields.private_safe,false);
  for(const path of ['review-decision','review-file']){
    const response=await active.fetch(new Request('https://mmdbkk.com/v1/model/media/'+path,{method:'POST',headers,body:JSON.stringify({model_id:'recModel',media_asset_id:'recMedia',decision:'approve'})}),f.env,{});
    assert.equal(response.status,401,await response.clone().text());
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";
const runtimeSource=await readFile(new URL("../src/runtime-index-with-application-v4.js",import.meta.url),"utf8");
const isolatedRuntime=runtimeSource.replace(/^import runtime .*;$/m,'const runtime={fetch(){throw new Error("unexpected delegated route");}};').replace(/^export \{ MmsCoordinator \}.*;$/m,"");
const {default:worker}=await import("data:text/javascript;base64,"+Buffer.from(isolatedRuntime).toString("base64"));

const id="mmsapp_"+"a".repeat(24);
const origin="https://www.mmdbkk.com";
const body= new Uint8Array([1,2,3]);
function backend({missing=false,noSecret=false,patchFail=false}={}){
  const events=[];
  let claimed=false,consumed=false;
  const grant={kind:"profile_photo",r2_key:"mms/applications/"+id+"/profile_photo/test.jpg",expected_bytes:3,content_type:"image/jpeg"};
  const stub={
    async claimUploadGrant(){if(consumed)return {ok:false,code:"UPLOAD_GRANT_USED"};assert.equal(claimed,false);claimed=true;return {ok:true,grant};},
    async completeUploadGrant(){events.push("complete");consumed=true;claimed=false;},
    async releaseUploadGrant(){events.push("release");claimed=false;}
  };
  const env={AIRTABLE_BASE_ID:"app"+"x".repeat(14),AIRTABLE_APPLICATIONS_TABLE_ID:"tbl"+"x".repeat(14),AIRTABLE_API_TOKEN:noSecret?"":"test",MMS_COORDINATOR:{idFromName:n=>n,get:()=>stub},MMS_PRIVATE_UPLOADS:{async put(){events.push("store");}}};
  let fail=patchFail;
  const fetch=async(url,init)=>{
    if(init.method==="PATCH"){events.push("attach");if(fail)return Response.json({}, {status:503});return Response.json({id:"rec"+"x".repeat(14)});}
    return Response.json({records:missing?[]:[{id:"rec"+"x".repeat(14),fields:{"Application ID":id}}]});
  };
  return {env,events,fetch,recover(){fail=false;},request:()=>new Request("https://mms.example/mms/api/uploads/"+id+"/"+"b".repeat(32),{method:"PUT",headers:{origin,"content-type":"image/jpeg"},body})};
}
test("upload is completed only after private storage and application attachment",async()=>{
  const h=backend();const original=globalThis.fetch;globalThis.fetch=h.fetch;
  try{const r=await worker.fetch(h.request(),h.env);assert.equal(r.status,201);assert.equal((await r.json()).storage.airtable,"synced");assert.deepEqual(h.events,["store","attach","complete"]);}finally{globalThis.fetch=original;}
});
test("failed attachment returns retryable 503 with CORS and preserves the same grant",async()=>{
  const h=backend({patchFail:true});const original=globalThis.fetch;globalThis.fetch=h.fetch;
  try{
    const first=await worker.fetch(h.request(),h.env);assert.equal(first.status,503);assert.equal(first.headers.get("Access-Control-Allow-Origin"),origin);
    assert.equal((await first.json()).error.code,"UPLOAD_LINK_PENDING");assert.deepEqual(h.events,["store","attach","release"]);
    h.recover();const second=await worker.fetch(h.request(),h.env);assert.equal(second.status,201);
    assert.deepEqual(h.events,["store","attach","release","store","attach","complete"]);
  }finally{globalThis.fetch=original;}
});
for(const opts of [{missing:true},{noSecret:true}])test("missing application or credentials cannot report upload success "+JSON.stringify(opts),async()=>{
  const h=backend(opts);const original=globalThis.fetch;globalThis.fetch=h.fetch;
  try{const r=await worker.fetch(h.request(),h.env);assert.equal(r.status,503);assert.equal((await r.json()).ok,false);assert.ok(!h.events.includes("complete"));}finally{globalThis.fetch=original;}
});

// Browser recovery is exercised against the canonical five-step source.
const source=await readFile(new URL("../../webflow/mms/apply-therapist/apply-therapist.js",import.meta.url),"utf8");
const helpers=source.slice(source.indexOf("  async function uploadFiles("),source.indexOf("  async function readJson("));
function frontend({unsynced=false,wrongId=false,failOnce=false}={}){
  const file={name:"profile.jpg",type:"image/jpeg",size:3};
  const key="profile_photo:profile.jpg:3:image/jpeg";
  let puts=0,grants=0,fail=failOnce;
  const context={Map,AbortController,setTimeout,clearTimeout,uploadGrants:new Map(),
    draft:{pending_uploads:[{key}],uploaded:{}},root:{dataset:{uploadEndpoint:"/grants"}},persistDraft(){},setSubmissionProgress(){},
    readJson:async()=>{grants++;return {upload:{url:"/put",content_type:"image/jpeg"}}},
    fetch:async()=>{puts++;if(fail){fail=false;return Response.json({ok:false},{status:503})}
      return Response.json({ok:true,application_id:wrongId?"other":id,kind:"profile_photo",storage:{r2:"stored",airtable:unsynced?"pending":"synced"}})}
  };
  vm.createContext(context);vm.runInContext(helpers,context);
  return {context,run:()=>context.uploadFiles([{kind:"profile_photo",file}],{application_ref:id,application_token:"test"}),counts:()=>({puts,grants})};
}
for(const opts of [{unsynced:true},{wrongId:true}])test("unconfirmed or mismatched receipt remains pending "+JSON.stringify(opts),async()=>{
  const h=frontend(opts);const result=await h.run();assert.equal(result.failed,1);assert.equal(Object.keys(h.context.draft.uploaded).length,0);
});
test("retry uses the same grant and skips confirmed files",async()=>{
  const h=frontend({failOnce:true});assert.equal((await h.run()).failed,1);
  assert.equal((await h.run()).failed,0);await h.run();assert.deepEqual(h.counts(),{puts:2,grants:1});
});

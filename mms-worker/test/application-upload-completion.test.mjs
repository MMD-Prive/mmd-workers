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

const source=await readFile(new URL("../../webflow/mms/apply-therapist/apply-therapist.js",import.meta.url),"utf8");
const helpers=source.slice(source.indexOf("  var acceptedApplication="),source.indexOf("\n  form.addEventListener"));
function frontend({failExtra=false,unsynced=false}={}){
  const profile={name:"profile.jpg",type:"image/jpeg",size:3},extra={name:"extra.jpg",type:"image/jpeg",size:3};
  const fields={profile_photo:{files:[profile]},additional_photos:{files:failExtra?[extra]:[]},certificates:{files:[]}};
  const button={disabled:false};let message="",applicationPosts=0,puts=0,grants=0,shouldFail=failExtra;
  const status={textContent:""};
  const success={hidden:true,querySelector:()=>({textContent:""}),focus(){}};
  const form={elements:fields,querySelector:selector=>selector==='[type="submit"]'?button:status};
  const stage={hidden:false};
  const context={WeakMap,root:{dataset:{applicationEndpoint:"/applications",uploadEndpoint:"/grants"},querySelector:()=>success},form,panels:[],stage,sending:false,validate:()=>true,show(){},payload:()=>({}),error:(s,m)=>{message=m;},localStorage:{removeItem(){throw Error("blocked storage");}},storageKey:"test",
    fetch:async(url,init)=>{
      if(url==="/applications"){applicationPosts++;return Response.json({ok:true,application_id:id,application_token:"test-token"});}
      if(url==="/grants"){grants++;const req=JSON.parse(init.body);return Response.json({ok:true,upload:{url:"/put/"+req.kind}});}
      puts++;
      if(url.endsWith("additional_photo")&&shouldFail)return Response.json({ok:false},{status:503});
      return Response.json({ok:true,application_id:id,kind:url.split("/").pop(),storage:{r2:"stored",airtable:unsynced?"pending":"synced"}});
    }};
  vm.createContext(context);vm.runInContext(helpers,context);
  return {context,stage,success,button,counts:()=>({applicationPosts,puts,grants}),message:()=>message,recover(){shouldFail=false;}};
}
test("browser does not display success for an unlinked upload receipt",async()=>{
  const h=frontend({unsynced:true});await h.context.submit({preventDefault(){}});
  assert.equal(h.stage.hidden,false);assert.equal(h.success.hidden,true);assert.match(h.message(),/ไฟล์ยังไม่ครบ/);
});
test("retry reuses accepted application and skips a photo already confirmed linked",async()=>{
  const h=frontend({failExtra:true});await h.context.submit({preventDefault(){}});
  assert.deepEqual(h.counts(),{applicationPosts:1,puts:2,grants:2});assert.equal(h.success.hidden,true);
  h.recover();await h.context.submit({preventDefault(){}});
  assert.deepEqual(h.counts(),{applicationPosts:1,puts:3,grants:2});assert.equal(h.stage.hidden,true);assert.equal(h.success.hidden,false);
});
test("Digital form exposes six steps, mobile type sizes and accessible progress",()=>{
  assert.match(source,/MMS · DIGITAL APPLICATION/);assert.match(source,/data-digital-step/);
  assert.match(source,/font-size:16px/);assert.match(source,/aria-live.*polite/);
  assert.match(source,/sixth.dataset.applicationStep="6"/);
});

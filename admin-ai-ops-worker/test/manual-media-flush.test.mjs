import test from "node:test";
import assert from "node:assert/strict";
import gate from "../src/gate.js";

const endpoint = "https://mmdbkk.com/v1/admin/ai-ops/media/flush";
const good = (input={action:"stage_all"}) => new Request(endpoint, { method:"POST", headers:{origin:"https://mmdbkk.com",cookie:"mmd_admin_gate_v1=fixture","content-type":"application/json"},body:JSON.stringify(input) });
const fake = (expectInput = {action:"stage_all"}) => {
  const seen = [];
  const service = { fetch: async req => {
    const url = new URL(req.url);
    seen.push({path:url.pathname,method:req.method,origin:req.headers.get("origin")});
    if(url.pathname === "/v1/admin/auth/me") return Response.json({ok:true,authenticated:true,worker:"admin-worker"});
    if(url.pathname === "/v1/admin/model-media/flush-preview") {
      assert.equal(req.method,"POST");
      assert.equal(req.headers.get("cookie"),"mmd_admin_gate_v1=fixture");
      assert.deepEqual(await req.json(),expectInput);
      return Response.json({ok:true,mode:expectInput.action==="stage_all"?"private_staging":"preview_only",catalogue:[],mmd_now:[],publication:false});
    }
    return Response.json({ok:false,error:"not_found"},{status:404});
  } };
  return { service,seen };
};

test("PER · AI OPS forwards only the supported FLUSH actions and saved run ID", async () => {
  for(const input of [{action:'preview_all'},{action:'stage_all',run_id:'00000000-0000-4000-8000-000000000001'},{action:'review_queue'},{action:'review_draft_queue'},{action:'review_draft_detail',record_id:'rec00000000000001'},{action:'review_draft_save',record_id:'rec00000000000001',revision:'a'.repeat(64),operation_id:'00000000-0000-4000-8000-000000000001',result:'needs_correction',reason:'Synthetic test only'}]){
    const f=fake(input),result=await gate.fetch(good(input),{MMS_ADMIN:f.service},{});
    assert.equal(result.status,200);assert.equal((await result.json()).publication,false);
    assert.deepEqual(f.seen.map(x=>x.path),['/v1/admin/auth/me','/v1/admin/model-media/flush-preview']);
  }
});
test("unsupported publication or source overrides never reach the FLUSH backend",async()=>{
 for(const input of [{action:'publish_all'},{action:'stage_all',sourceRoots:['unapproved']},{action:'stage_all',model_id:'unapproved'},{action:'review_draft_detail',record_id:'rec00000000000001',approve:true},{action:'review_draft_queue',sourceRoots:['outside']},{action:'review_draft_save',approve:true},{action:'review_draft_save',model_id:'outside'},{action:'review_draft_save',history:[]},{action:'review_draft_save',actor:'forged'}]){
  const f=fake(),res=await gate.fetch(good(input),{MMS_ADMIN:f.service},{});assert.equal(res.status,400);assert.equal(f.seen.some(x=>x.path==='/v1/admin/model-media/flush-preview'),false);
 }
});

test("no cross-origin, GET, or anonymous request can start a media preview", async () => {
  const f=fake();
  const bad=new Request(endpoint,{method:"POST"});
  const res=await gate.fetch(bad,{MMS_ADMIN:f.service},{});
  assert.equal(res.status,403);
  assert.equal(f.seen.some(x=>x.path==="/v1/admin/model-media/flush-preview"),false);
  const get=await gate.fetch(new Request(endpoint,{method:"GET",headers:{origin:"https://mmdbkk.com"}}),{MMS_ADMIN:f.service},{});
  assert.equal(get.status,405);
  const anon = {fetch:async()=>Response.json({ok:true,authenticated:false,worker:"admin-worker"})};
  const denied=await gate.fetch(good(),{MMS_ADMIN:anon},{});
  assert.equal(denied.status,401);
});

test("the shared client exposes private intake, resume and explicit new-source scan controls", async () => {
  const result=await gate.fetch(new Request("https://mmdbkk.com/v1/admin/ai-ops/client.js"),{MMS_ADMIN:fake().service},{});
  assert.equal(result.status,200);
  const text=await result.text();
  assert.match(text,/FLUSH ALL MEDIA/);
  assert.match(text,/v1\/admin\/ai-ops\/media\/flush/);
  assert.match(text,/R2 ส่วนตัวและคิวตรวจ Airtable/);
  assert.match(text,/ยังไม่เผยแพร่/);
  assert.match(text,/ตรวจสื่อใหม่/);
  assert.match(text,/sessionStorage/);
});

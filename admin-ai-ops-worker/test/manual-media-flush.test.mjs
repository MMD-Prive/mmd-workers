import test from "node:test";
import assert from "node:assert/strict";
import gate from "../src/gate.js";

const endpoint = "https://mmdbkk.com/v1/admin/ai-ops/media/flush";
const good = () => new Request(endpoint, { method:"POST", headers:{origin:"https://mmdbkk.com",cookie:"mmd_admin_gate_v1=fixture"} });
const fake = (expectAction = "preview_all") => {
  const seen = [];
  const service = { fetch: async req => {
    const url = new URL(req.url);
    seen.push({path:url.pathname,method:req.method,origin:req.headers.get("origin")});
    if(url.pathname === "/v1/admin/auth/me") return Response.json({ok:true,authenticated:true,worker:"admin-worker"});
    if(url.pathname === "/v1/admin/model-media/flush-preview") {
      assert.equal(req.method,"POST");
      assert.equal(req.headers.get("cookie"),"mmd_admin_gate_v1=fixture");
      assert.equal((await req.json()).action,expectAction);
      return Response.json({ok:true,mode:"preview_only",catalogue:[],mmd_now:[],writes:{website:false}});
    }
    return Response.json({ok:false,error:"not_found"},{status:404});
  } };
  return { service,seen };
};

test("PER · AI OPS forwards owner click as fixed preview-only request", async () => {
  const f=fake();
  const result=await gate.fetch(good(),{MMS_ADMIN:f.service},{});
  assert.equal(result.status,200);
  const data=await result.json();
  assert.equal(data.mode,"preview_only");
  assert.deepEqual(f.seen.map(x=>x.path),["/v1/admin/auth/me","/v1/admin/model-media/flush-preview"]);
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

test("the shared client contains a functional manual media preview control", async () => {
  const result=await gate.fetch(new Request("https://mmdbkk.com/v1/admin/ai-ops/client.js"),{MMS_ADMIN:fake().service},{});
  assert.equal(result.status,200);
  const text=await result.text();
  assert.match(text,/FLUSH ALL MEDIA/);
  assert.match(text,/v1\/admin\/ai-ops\/media\/flush/);
  assert.match(text,/preview_only/);
});

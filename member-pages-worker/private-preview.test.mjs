import test from "node:test";
import assert from "node:assert/strict";
import { isPrivatePreviewRequest, PrivatePreviewGate, handlePrivatePreview } from "./src/private-preview.js";
import { privateMediaFixture } from "../shared/private-media-fixture.mjs";
import vm from "node:vm";

test("private preview routes are narrowly matched", () => {
  assert.equal(isPrivatePreviewRequest("https://mmdbkk.com/api/member/app/private-preview/status"), true);
  assert.equal(isPrivatePreviewRequest("https://mmdbkk.com/api/member/app/private-preview/consume"), true);
  assert.equal(isPrivatePreviewRequest("https://mmdbkk.com/api/member/app/private-preview/other"), false);
});

function stateMock() {
  const values = new Map();
  return {
    storage: {
      get: key => values.get(key),
      transaction: fn => fn({
        get: key => values.get(key),
        put: (key, value) => values.set(key, value),
      }),
    },
  };
}

test("private preview gate consumes exactly once", async () => {
  const gate = new PrivatePreviewGate(stateMock());
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const first = await gate.fetch(new Request("https://private-preview.internal/consume", {
    method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ expiresAt }),
  }));
  assert.equal(first.status, 204);
  const second = await gate.fetch(new Request("https://private-preview.internal/consume", {
    method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ expiresAt }),
  }));
  assert.equal(second.status, 410);
  assert.equal((await gate.fetch(new Request("https://private-preview.internal/status"))).status, 410);
});

test("expired preview cannot be consumed", async () => {
  const gate = new PrivatePreviewGate(stateMock());
  const response = await gate.fetch(new Request("https://private-preview.internal/consume", {
    method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ expiresAt:"2020-01-01T00:00:00.000Z" }),
  }));
  assert.equal(response.status, 410);
});

function setup() {
  const f=privateMediaFixture(),gate=new PrivatePreviewGate(f.state);
  f.env.PRIVATE_PREVIEW_GATE={idFromName:id=>id,get:()=>({fetch:async(input,init)=>f.gateFailure ? new Response(null,{status:f.gateFailure}) : gate.fetch(new Request(input,init))})};
  return f;
}
function req(path='consume',extra={}) {
  return new Request('https://www.mmdbkk.com/api/member/app/private-preview/'+path+(path==='status'?'?t=synthetic':''),{
    method:path==='consume'?'POST':'GET',headers:{cookie:'__Host-mmd_liff_session=test',origin:'https://www.mmdbkk.com','content-type':'application/json',...extra},...(path==='consume'?{body:JSON.stringify({t:'synthetic'})}:{}),
  });
}
test('two simultaneous consumes yield exactly one file and one durable log',async()=>{
  const f=setup();const responses=await Promise.all([handlePrivatePreview(req(),f.env),handlePrivatePreview(req(),f.env)]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,410]);assert.equal(f.writes.length,1);assert.equal(f.audits.length,1);assert.equal(f.audits[0].outcome,'consumed');
  const log=f.storage.get('consumed');assert.equal(log.media_record_id,'recMedia');assert.equal(log.client_id,'recClient');assert.equal(log.media_sha256,'a'.repeat(64));
  const success=responses.find(r=>r.status===200);assert.equal(success.headers.get('cache-control').includes('no-store'),true);
});
test('registry consumption failure returns no bytes and cannot be retried',async()=>{
  const f=setup();f.logFailure=true;
  const response=await handlePrivatePreview(req(),f.env);assert.equal(response.status,503);assert.equal(response.headers.get('content-type').includes('json'),true);
  assert.equal(f.storage.has('consumed'),true);f.logFailure=false;
  assert.equal((await handlePrivatePreview(req(),f.env)).status,410);
});
test('gate outage is fail-closed for both status and consume',async()=>{
  for(const code of [200,500])for(const action of ['status','consume']){
    const f=setup();f.gateFailure=code;assert.equal((await handlePrivatePreview(req(action),f.env)).status,503);assert.equal(f.writes.length,0);
  }
});
test('wrong customer, wrong model, unapproved media, wrong type and public-bucket grants fail closed',async()=>{
  const changes=[f=>{f.grant.fields.Client=['recOther'];},f=>{f.asset.fields.Model=['recOther'];},f=>{f.asset.fields.private_safe=false;},f=>{f.asset.fields.review_status='pending_review';},f=>{f.grant.fields.payload_json=JSON.stringify({preview_kind:'private_clip'});},f=>{f.asset.fields.r2_bucket='mmd-models';},f=>{f.grant.fields.view_limit=2;},f=>{f.grant.fields.view_count=NaN;}];
  for(const change of changes){const f=setup();change(f);assert.notEqual((await handlePrivatePreview(req(),f.env)).status,200);assert.equal(f.storage.has('consumed'),false);}
});
test('missing session and cross-origin consume cannot burn a grant',async()=>{
  const f=setup();assert.equal((await handlePrivatePreview(req('consume',{origin:'https://evil.example'}),f.env)).status,403);
  assert.equal((await handlePrivatePreview(req('consume',{cookie:''}),f.env)).status,401);assert.equal(f.storage.has('consumed'),false);
});
test('viewer is isolated, parses, and uses no persistent browser media storage',async()=>{
  const response=await handlePrivatePreview(req('view'),{});assert.equal(response.status,200);
  assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  const html=await response.text(),script=html.match(/<script nonce="[^"]+">([\s\S]*)<\/script>/)[1];
  new vm.Script(script);assert.doesNotMatch(script,/localStorage|sessionStorage|indexedDB|caches\.open/);
  assert.match(script,/setTimeout\(conceal,3000\)/);assert.match(script,/revokeObjectURL/);
});

test('append-only audit failure burns the grant and returns no media',async()=>{
  const f=setup();f.auditFailure=true;
  const response=await handlePrivatePreview(req(),f.env);assert.equal(response.status,503);assert.equal(f.storage.has('consumed'),true);assert.equal(f.writes.length,0);
  f.auditFailure=false;assert.equal((await handlePrivatePreview(req(),f.env)).status,410);
});

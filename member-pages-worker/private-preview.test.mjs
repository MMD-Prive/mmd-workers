import test from "node:test";
import assert from "node:assert/strict";
import { isPrivatePreviewRequest, PrivatePreviewGate, handlePrivatePreview } from "./src/private-preview.js";
import { SVIP_PHOTO_REVEAL_MODE_HEADER, SVIP_PHOTO_REVEAL_POLICY } from "../shared/svip-photo-reveal-rollout.mjs";
import { privateMediaFixture } from "../shared/private-media-fixture.mjs";
import vm from "node:vm";

test("private preview routes are narrowly matched", () => {
  assert.equal(isPrivatePreviewRequest("https://mmdbkk.com/api/member/app/private-preview/status"), true);
  assert.equal(isPrivatePreviewRequest("https://mmdbkk.com/api/member/app/private-preview/consume"), true);
  assert.equal(isPrivatePreviewRequest("https://mmdbkk.com/api/member/app/private-preview/resume"), true);
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
  const f=privateMediaFixture(),gate=new PrivatePreviewGate(f.state, f.env);
  f.previewGate = gate;
  f.env.PRIVATE_PREVIEW_GATE={idFromName:id=>id,get:()=>({fetch:async(input,init)=>f.gateFailure ? new Response(null,{status:f.gateFailure}) : gate.fetch(new Request(input,init))})};
  return f;
}
function req(path='consume',extra={}) {
  return new Request('https://www.mmdbkk.com/api/member/app/private-preview/'+path+(path==='status'?'?t=synthetic':''),{
    method:path==='consume'?'POST':'GET',headers:{cookie:'__Host-mmd_liff_session=test',origin:'https://www.mmdbkk.com','content-type':'application/json',...extra},...(path==='consume'?{body:JSON.stringify({t:'synthetic'})}:{}),
  });
}
function markSvipGrant(f) {
  f.grant.fields.payload_json = JSON.stringify({
    preview_kind:"private_pic",
    access_lane:"private_preview",
    policy_version:SVIP_PHOTO_REVEAL_POLICY,
    authorization_basis:"active_svip_exact_customer_photo_reveal",
  });
  return f;
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
test('Private Teaser consumption requires explicit teaser approval and never falls back to private_safe',async()=>{
  const f=setup();
  f.grant.fields.payload_json=JSON.stringify({preview_kind:'private_pic',access_lane:'private_teaser'});
  f.asset.fields.private_safe=false;f.asset.fields.teaser_safe=true;
  assert.equal((await handlePrivatePreview(req(),f.env)).status,200);
  const blocked=setup();
  blocked.grant.fields.payload_json=JSON.stringify({preview_kind:'private_pic',access_lane:'private_teaser'});
  blocked.asset.fields.private_safe=true;blocked.asset.fields.teaser_safe=false;
  assert.notEqual((await handlePrivatePreview(req(),blocked.env)).status,200);
  assert.equal(blocked.storage.has('consumed'),false);
});
test('missing session and cross-origin consume cannot burn a grant',async()=>{
  const f=setup();assert.equal((await handlePrivatePreview(req('consume',{origin:'https://evil.example'}),f.env)).status,403);
  assert.equal((await handlePrivatePreview(req('consume',{cookie:''}),f.env)).status,401);assert.equal(f.storage.has('consumed'),false);
});
test('viewer is isolated, parses, uses no persistent browser media storage, and auto-enters LIFF verify on 401',async()=>{
  const response=await handlePrivatePreview(req('view'),{});assert.equal(response.status,200);
  assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  const html=await response.text(),script=html.match(/<script nonce="[^"]+">([\s\S]*)<\/script>/)[1];
  new vm.Script(script);assert.doesNotMatch(script,/localStorage|sessionStorage|indexedDB|caches\.open/);
  assert.match(script,/setTimeout\(conceal,3000\)/);assert.match(script,/revokeObjectURL/);
  assert.match(script,/miniapp\.line\.me\/2010862595-yT4DCEMc/);
  assert.match(script,/private_photo_reveal/);
  assert.match(script,/window\.location\.replace\(loginUrl\.toString\(\)\)/);
});

test('append-only audit failure burns the grant and returns no media',async()=>{
  const f=setup();f.auditFailure=true;
  const response=await handlePrivatePreview(req(),f.env);assert.equal(response.status,503);assert.equal(f.storage.has('consumed'),true);assert.equal(f.writes.length,0);
  f.auditFailure=false;assert.equal((await handlePrivatePreview(req(),f.env)).status,410);
});


test("LINE crawler, HEAD and prefetch cannot consume a private preview grant", async () => {
  const f = setup();

  const crawlerGet = await handlePrivatePreview(new Request(
    "https://www.mmdbkk.com/api/member/app/private-preview/view#t=synthetic",
    { method: "GET", headers: { "user-agent": "Line/14 link-preview" } },
  ), f.env);
  assert.equal(crawlerGet.status, 200);
  assert.equal(f.storage.has("consumed"), false);
  assert.equal(f.audits.length, 0);
  assert.equal(f.writes.length, 0);

  const head = await handlePrivatePreview(new Request(
    "https://www.mmdbkk.com/api/member/app/private-preview/view#t=synthetic",
    { method: "HEAD", headers: { "user-agent": "Line/14 link-preview" } },
  ), f.env);
  assert.equal(head.status, 405);
  assert.equal(f.storage.has("consumed"), false);

  const prefetchStatus = await handlePrivatePreview(new Request(
    "https://www.mmdbkk.com/api/member/app/private-preview/status?t=synthetic",
    { method: "GET", headers: { "sec-purpose": "prefetch", "user-agent": "Line/14 link-preview" } },
  ), f.env);
  assert.equal(prefetchStatus.status, 401);
  assert.equal(f.storage.has("consumed"), false);
  assert.equal(f.audits.length, 0);
  assert.equal(f.writes.length, 0);

  // Even a real member session may auto-check status when the page opens.
  // Status is read-only; only the explicit authenticated POST /consume burns the grant.
  const memberStatus = await handlePrivatePreview(req("status"), f.env);
  assert.equal(memberStatus.status, 200);
  assert.equal(f.storage.has("consumed"), false);
  assert.equal(f.audits.length, 0);
  assert.equal(f.writes.length, 0);
});


test("one-tap resume after LIFF verify rotates the bearer token without consuming the grant", async () => {
  const f = setup();
  const grantId = "svip_photo_123e4567-e89b-12d3-a456-426614174000";
  f.grant.fields.grant_id = grantId;

  const response = await handlePrivatePreview(new Request(
    `https://www.mmdbkk.com/api/member/app/private-preview/resume?g=${grantId}`,
    { method: "GET", headers: { cookie: "__Host-mmd_liff_session=test" } },
  ), f.env);

  assert.equal(response.status, 303);
  const location = response.headers.get("location") || "";
  assert.match(location, new RegExp(`^https://www\\.mmdbkk\\.com/api/member/app/private-preview/view\\?g=${grantId}#t=`));
  assert.equal(response.headers.get("x-mmd-private-preview-resume"), "one-tap-line-verify-v1");
  assert.equal(f.storage.has("consumed"), false);
  assert.equal(f.audits.length, 0);
  assert.equal(f.writes.length, 1);
  assert.match(String(f.writes[0]?.fields?.preview_token_hash || ""), /^[a-f0-9]{64}$/);
  assert.equal(f.writes[0]?.fields?.signed_url_status, "not_issued");
});

test("resume is exact-client session bound and rejects malformed resume handles", async () => {
  const malformed = setup();
  const bad = await handlePrivatePreview(new Request(
    "https://www.mmdbkk.com/api/member/app/private-preview/resume?g=not-a-grant",
    { method: "GET", headers: { cookie: "__Host-mmd_liff_session=test" } },
  ), malformed.env);
  assert.equal(bad.status, 400);
  assert.equal(malformed.writes.length, 0);
  assert.equal(malformed.storage.has("consumed"), false);

  const wrongClient = setup();
  wrongClient.grant.fields.grant_id = "svip_photo_123e4567-e89b-12d3-a456-426614174000";
  wrongClient.grant.fields.Client = ["recOther"];
  const denied = await handlePrivatePreview(new Request(
    "https://www.mmdbkk.com/api/member/app/private-preview/resume?g=svip_photo_123e4567-e89b-12d3-a456-426614174000",
    { method: "GET", headers: { cookie: "__Host-mmd_liff_session=test" } },
  ), wrongClient.env);
  assert.equal(denied.status, 403);
  assert.equal(wrongClient.writes.length, 0);
  assert.equal(wrongClient.storage.has("consumed"), false);
});


test("SVIP kill switch blocks existing grants at status and consume without burning them", async () => {
  for (const mode of ["off", "dry_run", "LIVE_typo", ""]) {
    const statusFixture = markSvipGrant(setup());
    const status = await handlePrivatePreview(req("status", { [SVIP_PHOTO_REVEAL_MODE_HEADER]: mode }), statusFixture.env);
    assert.equal(status.status, 423, `status must be locked for mode=${mode || "missing"}`);
    assert.equal(statusFixture.storage.has("consumed"), false);
    assert.equal(statusFixture.audits.length, 0);
    assert.equal(statusFixture.writes.length, 0);

    const consumeFixture = markSvipGrant(setup());
    const consume = await handlePrivatePreview(req("consume", { [SVIP_PHOTO_REVEAL_MODE_HEADER]: mode }), consumeFixture.env);
    assert.equal(consume.status, 423, `consume must be locked for mode=${mode || "missing"}`);
    assert.equal(consumeFixture.storage.has("consumed"), false);
    assert.equal(consumeFixture.audits.length, 0);
    assert.equal(consumeFixture.writes.length, 0);
  }
});

test("SVIP pilot and live modes permit the exact-client one-use path", async () => {
  for (const mode of ["pilot", "live"]) {
    const f = markSvipGrant(setup());
    const status = await handlePrivatePreview(req("status", { [SVIP_PHOTO_REVEAL_MODE_HEADER]: mode }), f.env);
    assert.equal(status.status, 200);
    const consume = await handlePrivatePreview(req("consume", { [SVIP_PHOTO_REVEAL_MODE_HEADER]: mode }), f.env);
    assert.equal(consume.status, 200);
    assert.equal(f.storage.has("consumed"), true);
    assert.equal(f.audits.length, 1);
  }
});

test("LIFF resume rotates the bearer token and the old LINE URL token becomes invalid", async () => {
  const f = markSvipGrant(setup());
  const grantId = "svip_photo_123e4567-e89b-12d3-a456-426614174000";
  f.grant.fields.grant_id = grantId;

  const resume = await handlePrivatePreview(new Request(
    `https://www.mmdbkk.com/api/member/app/private-preview/resume?g=${grantId}`,
    { method:"GET", headers:{ cookie:"__Host-mmd_liff_session=test", [SVIP_PHOTO_REVEAL_MODE_HEADER]:"pilot" } },
  ), f.env);
  assert.equal(resume.status, 303);

  const location = new URL(resume.headers.get("location"));
  const freshToken = new URLSearchParams(location.hash.slice(1)).get("t");
  assert.ok(freshToken);
  assert.notEqual(freshToken, "synthetic");

  const oldStatus = await handlePrivatePreview(new Request(
    "https://www.mmdbkk.com/api/member/app/private-preview/status?t=synthetic",
    { headers:{ cookie:"__Host-mmd_liff_session=test", [SVIP_PHOTO_REVEAL_MODE_HEADER]:"pilot" } },
  ), f.env);
  assert.equal(oldStatus.status, 404);

  const freshStatus = await handlePrivatePreview(new Request(
    `https://www.mmdbkk.com/api/member/app/private-preview/status?t=${encodeURIComponent(freshToken)}`,
    { headers:{ cookie:"__Host-mmd_liff_session=test", [SVIP_PHOTO_REVEAL_MODE_HEADER]:"pilot" } },
  ), f.env);
  assert.equal(freshStatus.status, 200);
  assert.equal(f.storage.has("consumed"), false);
});

test("private media is no-store and reload after consume cannot display it again", async () => {
  const f = setup();
  const shell = await handlePrivatePreview(new Request("https://www.mmdbkk.com/api/member/app/private-preview/view#t=synthetic"), f.env);
  assert.match(shell.headers.get("cache-control") || "", /no-store/);

  const first = await handlePrivatePreview(req("consume"), f.env);
  assert.equal(first.status, 200);
  assert.match(first.headers.get("cache-control") || "", /no-store/);

  const reloadStatus = await handlePrivatePreview(req("status"), f.env);
  assert.equal(reloadStatus.status, 410);
  assert.equal(f.audits.length, 1);
});

test("viewer sends mobile browsers into LIFF but gives LINE desktop a mobile instruction instead of an error loop", async () => {
  const response = await handlePrivatePreview(req("view"), {});
  const html = await response.text();
  assert.match(html, /navigator\.userAgentData\?\.mobile/);
  assert.match(html, /Android\|iPhone\|iPad\|iPod/);
  assert.match(html, /กรุณาเปิดลิงก์นี้จาก LINE บนมือถือเพื่อดูรูปครับ/);
  assert.match(html, /miniapp\.line\.me\/2010862595-yT4DCEMc/);
});

// --- concurrent /resume rotation gate -------------------------------------
// Bearer-token rotation protects link freshness; it is not the one-use
// authority. One-use media access stays enforced exclusively by the atomic
// PrivatePreviewGate consume transaction.

const RESUME_GRANT_ID = "svip_photo_123e4567-e89b-12d3-a456-426614174000";

function resumeSetup() {
  const f = setup();
  f.grant.fields.grant_id = RESUME_GRANT_ID;
  return f;
}
function resumeReq() {
  return new Request(
    `https://www.mmdbkk.com/api/member/app/private-preview/resume?g=${RESUME_GRANT_ID}`,
    { method: "GET", headers: { cookie: "__Host-mmd_liff_session=test" } },
  );
}
function bearerOf(response) {
  const location = response.headers.get("location") || "";
  const hash = location.split("#t=")[1] || "";
  return decodeURIComponent(hash);
}
function tokenWrites(f) {
  return f.writes.filter(write => write?.fields?.preview_token_hash);
}

test("concurrent resume requests share one in-flight Airtable write and one bearer", async () => {
  const f = resumeSetup();
  f.patchDelayMs = 60;
  const [a, b, c] = await Promise.all([
    handlePrivatePreview(resumeReq(), f.env),
    handlePrivatePreview(resumeReq(), f.env),
    handlePrivatePreview(resumeReq(), f.env),
  ]);

  for (const response of [a, b, c]) assert.equal(response.status, 303);
  const tokens = [bearerOf(a), bearerOf(b), bearerOf(c)];
  for (const token of tokens) assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal(new Set(tokens).size, 1, "concurrent resumes must point at one bearer");

  // Exactly one rotation reached Airtable, so no redirect can be killed by another.
  assert.equal(tokenWrites(f).length, 1);
  const committed = await sha256Hex(tokens[0]);
  assert.equal(f.grant.fields.preview_token_hash, committed);
  assert.equal(f.storage.get("active_resume")?.token, tokens[0]);
  assert.equal(f.storage.has("consumed"), false);
  assert.equal(f.audits.length, 0);
});

test("sequential resume inside the coalescing window returns the same bearer", async () => {
  const f = resumeSetup();
  const first = await handlePrivatePreview(resumeReq(), f.env);
  const second = await handlePrivatePreview(resumeReq(), f.env);

  assert.equal(first.status, 303);
  assert.equal(second.status, 303);
  assert.equal(bearerOf(first), bearerOf(second));
  assert.equal(tokenWrites(f).length, 1, "a reused bearer must not rewrite Airtable");
});

test("resume after the window rotates and the previous bearer stops resolving", async () => {
  const f = resumeSetup();
  const first = await handlePrivatePreview(resumeReq(), f.env);
  const firstToken = bearerOf(first);

  // Expire the coalescing window deterministically instead of sleeping.
  const active = f.storage.get("active_resume");
  f.storage.set("active_resume", { ...active, expiresAt: Date.now() - 1 });

  const second = await handlePrivatePreview(resumeReq(), f.env);
  const secondToken = bearerOf(second);
  assert.equal(second.status, 303);
  assert.notEqual(secondToken, firstToken);
  assert.equal(tokenWrites(f).length, 2);
  assert.equal(f.grant.fields.preview_token_hash, await sha256Hex(secondToken));

  // The superseded bearer is no longer resolvable.
  const stale = await handlePrivatePreview(new Request(
    `https://www.mmdbkk.com/api/member/app/private-preview/status?t=${firstToken}`,
    { method: "GET", headers: { cookie: "__Host-mmd_liff_session=test" } },
  ), f.env);
  assert.equal(stale.status, 404);
});

test("an Airtable rotation write failure fails closed and a retry self-heals", async () => {
  const f = resumeSetup();
  f.logFailure = true;
  const failed = await handlePrivatePreview(resumeReq(), f.env);

  assert.equal(failed.status, 503);
  assert.equal((await failed.json()).error.code, "PREVIEW_LOCK_FAILED");
  assert.equal(failed.headers.get("location"), null, "a failed rotation must not redirect");
  assert.equal(f.storage.has("active_resume"), false, "no bearer may be held live after a failed write");
  assert.equal(f.storage.has("consumed"), false);

  f.logFailure = false;
  const recovered = await handlePrivatePreview(resumeReq(), f.env);
  assert.equal(recovered.status, 303);
  assert.match(bearerOf(recovered), /^[a-f0-9]{64}$/);
  assert.equal(f.grant.fields.preview_token_hash, await sha256Hex(bearerOf(recovered)));
});

test("waiters on a failed rotation fail closed instead of inheriting a dead bearer", async () => {
  const f = resumeSetup();
  f.logFailure = true;
  const [a, b] = await Promise.all([
    handlePrivatePreview(resumeReq(), f.env),
    handlePrivatePreview(resumeReq(), f.env),
  ]);
  for (const response of [a, b]) {
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("location"), null);
  }
  assert.equal(f.storage.has("active_resume"), false);
});

test("resume rotation is not the one-use authority: consume stays exactly once", async () => {
  const f = resumeSetup();
  const resumed = await handlePrivatePreview(resumeReq(), f.env);
  const token = bearerOf(resumed);
  assert.equal(resumed.status, 303);

  const consumeReq = () => new Request("https://www.mmdbkk.com/api/member/app/private-preview/consume", {
    method: "POST",
    headers: { cookie: "__Host-mmd_liff_session=test", origin: "https://www.mmdbkk.com", "content-type": "application/json" },
    body: JSON.stringify({ t: token }),
  });
  const [first, second] = await Promise.all([
    handlePrivatePreview(consumeReq(), f.env),
    handlePrivatePreview(consumeReq(), f.env),
  ]);
  const statuses = [first.status, second.status].sort();
  assert.deepEqual(statuses, [200, 410]);
  assert.equal(f.audits.length, 1, "one-use comes from the gate transaction, not token uniqueness");
});

test("a consumed grant can no longer mint or reuse a resume bearer", async () => {
  const f = resumeSetup();
  const resumed = await handlePrivatePreview(resumeReq(), f.env);
  const token = bearerOf(resumed);
  await handlePrivatePreview(new Request("https://www.mmdbkk.com/api/member/app/private-preview/consume", {
    method: "POST",
    headers: { cookie: "__Host-mmd_liff_session=test", origin: "https://www.mmdbkk.com", "content-type": "application/json" },
    body: JSON.stringify({ t: token }),
  }), f.env);

  const after = await handlePrivatePreview(resumeReq(), f.env);
  assert.equal(after.status, 410);
  assert.equal(after.headers.get("location"), null);
});

test("no raw resume bearer is ever written to Airtable or the consumption audit", async () => {
  const f = resumeSetup();
  const resumed = await handlePrivatePreview(resumeReq(), f.env);
  const token = bearerOf(resumed);
  assert.ok(token);

  const written = JSON.stringify(f.writes);
  assert.equal(written.includes(token), false, "Airtable must hold the hash only");
  assert.equal(JSON.stringify(f.audits).includes(token), false);
  assert.equal(JSON.stringify(f.grant.fields).includes(token), false);
  assert.match(String(f.grant.fields.preview_token_hash), /^[a-f0-9]{64}$/);
});

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, "0")).join("");
}


test("expired resume bearer is removed from DO storage", async () => {
  const f = resumeSetup();
  const response = await handlePrivatePreview(resumeReq(), f.env);
  assert.equal(response.status, 303);

  const active = f.storage.get("active_resume");
  assert.ok(active?.token);
  f.storage.set("active_resume", { ...active, expiresAt: Date.now() - 1 });
  await f.previewGate.alarm();
  assert.equal(f.storage.has("active_resume"), false);
});

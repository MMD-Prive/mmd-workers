import test from "node:test";
import assert from "node:assert/strict";
import { handlePrivateTeaser, isPrivateTeaserRequest } from "./src/private-teaser.js";

const lineUserId = `U${"a".repeat(32)}`;
const modelId = "recModel";
const clientId = "recClient";
const mediaId = "recMedia";
const sha = "a".repeat(64);

function fixture() {
  const grants = [];
  const session = { expires_at:Date.now() + 60_000, line_user_id:lineUserId, member_exists:true, member_id:"member_1", member_profile:{} };
  const media = { id:mediaId, fields:{
    media_id:"media_example", Model:[modelId], media_type:"flash_preview", review_status:"approved", teaser_safe:true, private_safe:false,
    file_type:"image/png", file_size_bytes:8, r2_bucket:"mmd-private-model-media", private_original_key:`private-model-media/${modelId}/media_example.png`,
  } };
  const env = {
    AIRTABLE_API_KEY:"test", AIRTABLE_BASE_ID:"appTest", LIFF_SESSION_SECRET:"x".repeat(32),
    AIRTABLE_TABLE_CLIENTS:"Clients", AIRTABLE_TABLE_MEMBER_ENTITLEMENTS:"Entitlements", AIRTABLE_TABLE_MODEL_OFFER_RULES:"Rules", AIRTABLE_TABLE_MODEL_MEDIA_ASSETS:"Media", AIRTABLE_TABLE_PRIVATE_FLASH_PREVIEW_GRANTS:"Grants",
    LIFF_IDENTITY_KV:{ get:async () => session },
    PRIVATE_MODEL_MEDIA:{ head:async () => ({ size:8, httpMetadata:{contentType:"image/png"}, customMetadata:{ media_id:"media_example", model_record_id:modelId, sha256:sha } }), get:async () => null },
    AIRTABLE_HTTP:{ fetch:async (request) => {
      const url = new URL(request.url); const table = decodeURIComponent(url.pathname.split("/").at(-1));
      if (request.method === "POST" && table === "Grants") { const body = await request.json(); const record = { id:`recGrant${grants.length + 1}`, fields:body.fields }; grants.push(record); return Response.json(record); }
      if (table === "Clients") return Response.json({ records:[{ id:clientId, fields:{ line_user_id:lineUserId } }] });
      if (table === "Entitlements") return Response.json({ records:[{ id:"recEntitlement", fields:{ line_user_id:lineUserId, capability:"public_member", access_status:"active" } }] });
      if (table === "Rules") return Response.json({ records:[{ id:"recRule", fields:{ Model:[modelId], status:"Active", offer_type:"companion", audience_scope:["Public Member"], sales_visibility:"on", customer_sell_rate_thb:3500, price_visibility:"visible", version:1 } }] });
      if (table === "Media") return Response.json({ records:[media] });
      return Response.json({ records:[] });
    }},
  };
  return { env, grants, media, session };
}

function request(path, { method="GET", body, cookie="__Host-mmd_liff_session=test", origin="https://www.mmdbkk.com" } = {}) {
  return new Request(`https://www.mmdbkk.com/api/member/app/private-teaser/${path}${method === "GET" ? `?model_id=${modelId}&work_lane=companion` : ""}`, {
    method, headers:{ cookie, ...(method === "POST" ? { origin, "content-type":"application/json" } : {}) }, ...(body ? { body:JSON.stringify(body) } : {}),
  });
}

test("Private Teaser routes are narrowly matched", () => {
  assert.equal(isPrivateTeaserRequest("https://mmdbkk.com/api/member/app/private-teaser/availability"), true);
  assert.equal(isPrivateTeaserRequest("https://mmdbkk.com/api/member/app/private-teaser/grant"), true);
  assert.equal(isPrivateTeaserRequest("https://mmdbkk.com/api/member/app/private-teaser/view"), false);
});

test("availability exposes only safe counts after verified identity and offer-rule match", async () => {
  const f = fixture();
  const response = await handlePrivateTeaser(request("availability"), f.env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.availability, { eligible:true, pic_count:1, clip_count:0, sales_rule_version:1 });
  assert.equal(JSON.stringify(body).includes("recMedia"), false);
  assert.equal(JSON.stringify(body).includes("private-model-media"), false);
  assert.equal(f.grants.length, 0);
});

test("grant is one-customer, one-model, one-asset and records a teaser—not-payment—basis", async () => {
  const f = fixture();
  const response = await handlePrivateTeaser(request("grant", { method:"POST", body:{ model_id:modelId, work_lane:"companion", preview_kind:"private_pic" } }), f.env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.grant.preview_kind, "private_pic");
  assert.match(body.grant.viewer_url, /private-preview\/view#t=/);
  assert.equal(f.grants.length, 1);
  const fields = f.grants[0].fields;
  assert.deepEqual(fields.Client, [clientId]); assert.deepEqual(fields.Model, [modelId]); assert.deepEqual(fields["Media Asset"], [mediaId]);
  assert.deepEqual(fields.Payment, []); assert.equal(fields.required_gate, "verified_prebooking_eligibility");
  const payload = JSON.parse(fields.payload_json);
  assert.equal(payload.access_lane, "private_teaser"); assert.equal(payload.authorization_basis, "verified_prebooking_eligibility");
  assert.equal(payload.token_storage, "sha256_hash_only"); assert.equal(fields.preview_token_hash.includes("#t="), false);
});

test("missing member session, disabled teaser approval, off-sale rule and wrong origin fail closed without a grant", async () => {
  for (const mutate of [
    (f) => { f.session.expires_at = Date.now() - 1; },
    (f) => { f.media.fields.teaser_safe = false; },
    (f) => { f.env.AIRTABLE_HTTP.fetch = async (request) => { const table = decodeURIComponent(new URL(request.url).pathname.split("/").at(-1)); if (table === "Rules") return Response.json({ records:[{ id:"recRule", fields:{ Model:[modelId], status:"Active", offer_type:"companion", audience_scope:["Public Member"], sales_visibility:"off" } }] }); if (table === "Clients") return Response.json({ records:[{ id:clientId, fields:{line_user_id:lineUserId} }] }); if (table === "Entitlements") return Response.json({records:[{id:"recEnt",fields:{line_user_id:lineUserId,capability:"public_member",access_status:"active"}}]}); if (table === "Media") return Response.json({records:[f.media]}); return Response.json({records:[]}); }; },
  ]) {
    const f = fixture(); mutate(f);
    const response = await handlePrivateTeaser(request("grant", { method:"POST", body:{ model_id:modelId, work_lane:"companion", preview_kind:"private_pic" } }), f.env);
    const body = await response.json();
    assert.notEqual(body?.grant?.status, "active", JSON.stringify(body));
    assert.equal(f.grants.length, 0);
  }
  const f = fixture();
  const response = await handlePrivateTeaser(request("grant", { method:"POST", origin:"https://evil.example", body:{ model_id:modelId, work_lane:"companion", preview_kind:"private_pic" } }), f.env);
  assert.equal(response.status, 403); assert.equal(f.grants.length, 0);
});

import assert from "node:assert/strict";
import test from "node:test";
import { resolveKenjiSeedDecision, handleKenjiSeedLineRequest } from "../src/kenji-seed-line-runtime.mjs";
import { resolveKenjiLineLiveTruth } from "../src/kenji-line-live-truth.mjs";
import { createLineSignature } from "../src/index.js";

function event(text) {
  return {
    type: "message",
    message: { type: "text", text },
    source: { type: "user", userId: "U1234567890abcdef1234567890abcdef" },
  };
}

const continuity = {
  decision: "continuation",
  effective_intent: "membership_status",
  current_intent: "membership_status",
  topic: "membership",
  conversation_stage: "awaiting_entitlement_refresh",
  client_record_id: "recKnownCustomer",
  matrix: { client_record_id: "recKnownCustomer", relationship_context: "svip_relationship" },
};

const liveTruth = {
  ok: true,
  authority: "my_mmd_entitlement_resolver_v1",
  identity_status: "resolved",
  membership: {
    level: "svip",
    label: "SVIP",
    lifecycle: "active",
    expire_at: "",
    public_service_access: true,
    private_visibility_envelope: "svip",
    member_blocked: false,
  },
  points: { status: "verified", active_points: 88 },
};

test("membership status uses canonical live truth before legacy deterministic system copy", async () => {
  const decision = await resolveKenjiSeedDecision(event("สถานะสมาชิกของผม"), {}, {
    currentIntent: "membership_status",
    continuity,
    liveTruth,
  });
  assert.equal(decision.reply_source, "live_truth");
  assert.equal(decision.live_truth_verified, true);
  assert.equal(decision.handoff_required, false);
  assert.match(decision.text, /SVIP/);
  assert.doesNotMatch(decision.text, /ยืนยันตัวตนสำเร็จก่อน|ต้องตรวจผ่าน My MMD/);
});

test("known canonical identity does not fall back to legacy reverification copy when truth read fails", async () => {
  const decision = await resolveKenjiSeedDecision(event("สถานะสมาชิกของผม"), {}, {
    currentIntent: "membership_status",
    continuity,
    liveTruth: { ok: false, status: "unavailable", authority: "my_mmd_entitlement_resolver_v1" },
  });
  assert.equal(decision.reply_source, "live_truth_unavailable");
  assert.equal(decision.handoff_required, true);
  assert.doesNotMatch(decision.text, /ยืนยันตัวตนสำเร็จก่อน|ต้องตรวจผ่าน My MMD/);
});

test("screenshot rights request reads canonical status using LINE subject, not typed profile", async () => {
  const input = event("อยากทราบสถานะสมาชิกตอนนี้ พิมพ์ เช็กสิทธิ์");
  const calls = [];
  const env = { LINE_KENJI_MODEL_ENABLED: "false", MEMBER_PAGES_WORKER: { async fetch(request) {
    calls.push({url:request.url, body:await request.json()});
    return Response.json(liveTruth);
  } } };
  const truth = await resolveKenjiLineLiveTruth({env,event:input,intent:"membership_status"});
  const decision = await resolveKenjiSeedDecision(input,env,{currentIntent:"membership_status",continuity,liveTruth:truth});
  assert.equal(calls.length,1);
  assert.equal(calls[0].body.line_user_id,input.source.userId);
  assert.equal(calls[0].body.intent,"membership_status");
  assert.equal(new URL(calls[0].url).hostname,"member-pages-worker.internal");
  assert.equal(decision.live_truth_used,true);
  assert.match(decision.text,/SVIP/);
  assert.equal(decision.model_attempted,false);
});

test("missing canonical identity/truth cannot fall into legacy system_truth copy", async () => {
  for (const env of [{}, {MEMBER_PAGES_WORKER:{async fetch(){return Response.json({ok:true,authority:liveTruth.authority,identity_status:"ambiguous"});}}}]) {
    const input=event("เช็กสิทธิ์");
    const truth=await resolveKenjiLineLiveTruth({env,event:input,intent:"membership_status"});
    const decision=await resolveKenjiSeedDecision(input,env,{currentIntent:"membership_status",liveTruth:truth});
    assert.equal(decision.reply_source,"live_truth_unavailable");
    assert.equal(decision.live_truth_verified,false);
    assert.equal(decision.truth_status,"unavailable");
    assert.equal(decision.handoff_required,true);
    assert.doesNotMatch(decision.text,/SVIP|ผมยังยืนยันสถานะ ระดับสมาชิก/);
  }
});

test("Profile follow-up does not repeat stale membership fallback or treat a name as identity", async () => {
  const decision=await resolveKenjiSeedDecision(event("Profile Potter PP"),{}, {
    currentIntent:"note_only",continuity:{...continuity,decision:"stale_refresh"},liveTruth:{ok:false,status:"unavailable"},
  });
  assert.equal(decision.reply_source,"bounded_followup");
  assert.equal(decision.intent,"human_handoff");
  assert.match(decision.text,/ชื่อที่พิมพ์มาไม่ใช้ยืนยันบัญชี/);
  assert.doesNotMatch(decision.text,/ผมยังยืนยันสถานะ|Potter/);
  assert.equal(decision.live_truth_used,false);
});

test("screenshot follow-up questions do not fall into the generic sales loop", async () => {
  for (const input of ["ผม ขอถามเพิ่มก่อนได้ไหมครับ","น้องเป็น Gay หรือเปล่า ถ้าใช่แบบไหนครับ"]) {
    const decision=await resolveKenjiSeedDecision(event(input),{LINE_KENJI_DETERMINISTIC_CONVERSATION_ENABLED:"true"},{currentIntent:"note_only",continuity:{effective_intent:"pricing_review"}});
    assert.equal(decision.reply_source,"bounded_followup");
    assert.doesNotMatch(decision.text,/สนใจสอบถามเรื่องสมาชิก ราคา/);
    assert.equal(decision.model_attempted,false);
    if(input.includes("Gay")){assert.equal(decision.handoff_required,true);assert.match(decision.text,/ไม่เดาหรือยืนยันแทน/);}
  }
});

test("a fresh explicit membership command wins over stale pricing context", async () => {
  const decision=await resolveKenjiSeedDecision(event("เช็กสิทธิ์"),{}, {
    currentIntent:"membership_status",continuity:{effective_intent:"pricing_review"},liveTruth,
  });
  assert.equal(decision.intent,"membership_status");
  assert.equal(decision.reply_source,"live_truth");
});

test("signed seed webhook calls canonical resolver with model kill active and sends one verified reply", async () => {
  const input={...event("อยากทราบสถานะสมาชิกตอนนี้ พิมพ์ เช็กสิทธิ์"),mode:"active",replyToken:"fixture-reply",message:{id:"fixture-message",type:"text",text:"อยากทราบสถานะสมาชิกตอนนี้ พิมพ์ เช็กสิทธิ์"}};
  const raw=JSON.stringify({events:[input]});
  const calls=[], replies=[];
  const original=globalThis.fetch;
  globalThis.fetch=async (url,init)=>{
    assert.equal(String(url),"https://api.line.me/v2/bot/message/reply","no external model or unrelated transport permitted");
    replies.push(JSON.parse(init.body));return Response.json({});
  };
  try {
    const env={INTERNAL_TOKEN:"fixture-internal",LINE_CHANNEL_SECRET:"fixture-secret",LINE_CHANNEL_ACCESS_TOKEN:"fixture-token",LINE_AUTO_REPLY_ENABLED:"true",LINE_KENJI_AI_ENABLED:"true",LINE_KENJI_MODEL_ENABLED:"false",
      ADMIN_WORKER:{async fetch(){return Response.json({ok:true,controls:{line_oa_auto_reply:false,model_keyword_auto_reply:true,all_kenji_mutations:false}});}},
      MEMBER_PAGES_WORKER:{async fetch(request){calls.push(await request.json());return Response.json(liveTruth);}},
    };
    const request=new Request("https://mmdbkk.com/webhooks/line",{method:"POST",headers:{"x-line-signature":await createLineSignature(raw,env.LINE_CHANNEL_SECRET)},body:raw});
    const result=await handleKenjiSeedLineRequest(request,env,null,{async fetch(){return Response.json({ok:true,saved:[{campaign_event:false}]});}});
    assert.equal(result.status,200);
    assert.equal(calls.length,1);
    assert.deepEqual(calls[0],{line_user_id:input.source.userId,intent:"membership_status"});
    assert.equal(replies.length,1);
    assert.match(replies[0].messages[0].text,/SVIP/);
    assert.doesNotMatch(replies[0].messages[0].text,/ผมยังยืนยันสถานะ|ยืนยันตัวตนสำเร็จก่อน/);
  } finally {globalThis.fetch=original;}
});

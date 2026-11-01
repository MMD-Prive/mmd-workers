import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  classifyHennaIntent,
  handleMmsLineWebhook,
  hennaReply,
  lineBotStatus,
} from "../src/line-bot.mjs";

const ENV = {
  LINE_CHANNEL_SECRET: "mms-line-secret",
  LINE_CHANNEL_ACCESS_TOKEN: "mms-line-token",
  MMS_LINE_CHANNEL_ID: "2011386859",
  LINE_AUTO_REPLY_ENABLED: "false",
};

test("HENNA exposes fail-closed configuration status", () => {
  assert.deepEqual(lineBotStatus(ENV), {
    configured: true,
    channel_id: "2011386859",
    auto_reply_enabled: false,
    persona: "HENNA",
    capability_pack: "mmd-concierge-capability-pack-v1-20260919",
    recovery_outcome_taxonomy: "mmd-recovery-outcome-taxonomy-v1-20260919",
  });
});

test("HENNA separates stable replies from manual-only decisions", () => {
  assert.equal(classifyHennaIntent("อยากจองนวดพรุ่งนี้"), "booking");
  assert.equal(classifyHennaIntent("มีบริการอะไรบ้าง"), "services");
  assert.equal(classifyHennaIntent("อยากสมัครเป็น therapist"), "apply");
  assert.equal(classifyHennaIntent("ราคาเท่าไหร่"), "manual_price");
  assert.equal(classifyHennaIntent("วันนี้ใครว่าง"), "manual_availability");
  assert.equal(classifyHennaIntent("ขอคุยกับพี่เปอร์"), "manual_handoff");
  assert.equal(classifyHennaIntent("คำถามที่ไม่มีข้อมูลยืนยัน"), "manual_unknown");
  assert.match(hennaReply("booking"), /MMS/);
  assert.equal(hennaReply("manual_price"), "");
});

test("HENNA chooses one safe CTA for each MMS audience", () => {
  const cases = [
    ["MMS คืออะไร", "home", "/male-massage/home"],
    ["พร้อมจองนวด", "booking", "/male-massage/member/mms-booking"],
    ["มีบริการอะไรบ้าง", "services", "/male-massage/therapists/mms"],
    ["เปิด MY MMS", "my_mms", "/male-massage/my-mms"],
    ["อยากเป็น Therapist", "recruit", "/therapists"],
    ["ข้อดีของ Therapist", "benefits", "/apply/mms-therapist-benefits"],
    ["Therapist Rules", "rules", "/apply/mms-therapist-rules"],
    ["อยากเรียนการนวด", "fast_track", "/male-massage/apply/mms-fast-track"],
    ["สมัครเป็น Therapist", "apply", "/apply/mms-therapist"],
    ["เข้า MY Therapist", "therapist_login", "/male-massage/therapists/login"],
  ];
  for (const [message, intent, path] of cases) {
    assert.equal(classifyHennaIntent(message), intent, message);
    const reply = hennaReply(intent);
    assert.ok(reply.includes(`https://www.mmdbkk.com${path}`), message);
    assert.equal((reply.match(/https:\/\//g) || []).length, 1, message);
    assert.doesNotMatch(reply, /ทีมงาน|\/internal\/admin\//);
  }
  assert.match(hennaReply("booking"), /ยังไม่ใช่การยืนยันคิว/);
  assert.match(hennaReply("apply"), /ยังไม่ใช่การอนุมัติ/);
  assert.match(hennaReply("therapist_login"), /อนุมัติแล้ว/);
  assert.equal(classifyHennaIntent("วันนี้ใครว่าง"), "manual_availability");
  assert.equal(classifyHennaIntent("ราคาเท่าไหร่"), "manual_price");
});

test("HENNA recognizes shared MMD capability pack 1-7 without taking cross-system authority", () => {
  assert.equal(classifyHennaIntent("GG Water ของผมถึงไหนแล้ว"), "shop_orders");
  assert.equal(classifyHennaIntent("CARE BACK คูปองของผม"), "care_back_coupon");
  assert.equal(classifyHennaIntent("ช่วยหา therapist ที่เหมาะหน่อย"), "mms_therapist_options");
  assert.equal(classifyHennaIntent("งานมีปัญหา น้องยังไม่มา"), "manual_recovery");
  assert.equal(classifyHennaIntent("เรื่องที่ส่งให้เปอร์ถึงไหนแล้ว"), "manual_handoff_status");
  assert.equal(classifyHennaIntent("ขอดู model ใน Hall"), "hall_model_discovery");
  assert.equal(classifyHennaIntent("แต้มคงเหลือเท่าไหร่"), "points_coupon_balance");

  assert.match(hennaReply("shop_orders"), /MY MMD/);
  assert.match(hennaReply("care_back_coupon"), /Coupon Wallet/);
  assert.match(hennaReply("mms_therapist_options"), /ไม่ถือว่า Confirm Therapist/);
  assert.match(hennaReply("hall_model_discovery"), /ไม่เดาเพศ\/มุมมอง/);
  assert.match(hennaReply("points_coupon_balance"), /จะไม่เดายอด/);
  assert.match(hennaReply("points_coupon_balance"), /HYPE @mmdprivebot แบบ private/);
  assert.match(hennaReply("points_coupon_balance"), /bounded canonical wallet/);
  assert.doesNotMatch(hennaReply("points_coupon_balance"), /ยอด.*\d+\s*Points|Code:\s*[A-HJ-NP-Z2-9]{6}/i);
  assert.equal(hennaReply("manual_recovery"), "");
  assert.equal(hennaReply("manual_handoff_status"), "");
});

test("LINE webhook rejects an invalid signature", async () => {
  const request = new Request("https://worker/mms/webhooks/line", {
    method: "POST",
    headers: { "content-type": "application/json", "x-line-signature": "wrong" },
    body: JSON.stringify({ events: [] }),
  });
  const result = await handleMmsLineWebhook(request, ENV);
  assert.equal(result.status, 401);
  assert.equal((await result.json()).error, "invalid_signature");
});

test("auto reply remains silent while the production gate is disabled", async () => {
  const originalFetch = globalThis.fetch;
  let externalCalls = 0;
  globalThis.fetch = async () => {
    externalCalls += 1;
    return Response.json({ ok: true });
  };
  try {
    const body = JSON.stringify({ events: [{
      type: "message",
      replyToken: "reply-token",
      source: { type: "user", userId: "U-private" },
      message: { id: "msg-1", type: "text", text: "อยากจองบริการ" },
    }] });
    const request = signedRequest(body);
    const result = await handleMmsLineWebhook(request, ENV);
    const payload = await result.json();
    assert.equal(result.status, 200);
    assert.equal(payload.results[0].action, "no_reply");
    assert.equal(externalCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("enabled HENNA replies only to stable intents", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return Response.json({}, { status: 200 });
  };
  try {
    const body = JSON.stringify({ events: [{
      type: "message",
      replyToken: "reply-token",
      source: { type: "user", userId: "U-private" },
      message: { id: "msg-2", type: "text", text: "มีบริการอะไรบ้าง" },
    }] });
    const result = await handleMmsLineWebhook(signedRequest(body), { ...ENV, LINE_AUTO_REPLY_ENABLED: "true" });
    assert.equal(result.status, 200);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /api\.line\.me\/v2\/bot\/message\/reply/);
    assert.equal(JSON.stringify(calls[0].body).includes("U-private"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function signedRequest(body) {
  const signature = crypto.createHmac("sha256", ENV.LINE_CHANNEL_SECRET).update(body).digest("base64");
  return new Request("https://worker/mms/webhooks/line", {
    method: "POST",
    headers: { "content-type": "application/json", "x-line-signature": signature },
    body,
  });
}

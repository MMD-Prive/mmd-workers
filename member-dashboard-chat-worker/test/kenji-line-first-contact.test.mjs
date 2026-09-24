import assert from "node:assert/strict";
import test from "node:test";

import { createLineSignature } from "../src/index.js";
import { decideKenjiLineFirstContact } from "../src/kenji-line-first-contact.mjs";
import { handleKenjiSeedLineRequest } from "../src/kenji-seed-line-runtime.mjs";

const env = {
  LINE_CHANNEL_SECRET: "synthetic-secret",
  LINE_CHANNEL_ACCESS_TOKEN: "synthetic-access-token",
  LINE_AUTO_REPLY_ENABLED: "false",
  LINE_FIRST_CONTACT_ENABLED: "true",
  LINE_KENJI_AI_ENABLED: "true",
  KENJI_LINE_CONTINUITY_ENABLED: "false",
  INTERNAL_TOKEN: "synthetic-internal",
  ADMIN_WORKER: { fetch: async () => Response.json({ ok: true, controls: {
    line_oa_auto_reply: false, all_kenji_mutations: false, model_keyword_auto_reply: false,
  } }) },
};

function message(value, overrides = {}) {
  return {
    type: "message", mode: "active", replyToken: "synthetic-reply-token",
    source: { type: "user", userId: "U-synthetic" },
    message: { id: "synthetic-message-id", type: "text", text: value },
    ...overrides,
  };
}

test("First Contact answers a natural opening but sends protected matters for review", () => {
  const opening = decideKenjiLineFirstContact(message("แนะนำหน่อย"), "note_only");
  assert.match(opening.text, /งานหรือกิจกรรม/);
  assert.equal(opening.handoff_required, false);

  const booking = decideKenjiLineFirstContact(message("อยากจองไปดินเนอร์"), "mmd_companion");
  assert.match(booking.text, /วันไหน/);
  assert.doesNotMatch(booking.text, /ยืนยันคิว|ราคา.*บาท/);

  const mms = decideKenjiLineFirstContact(message("อยากนวดชาย"), "mms_wellness");
  assert.match(mms.text, /LINE Official ของ MMS/);
  assert.match(mms.text, /lin\.ee\/NkfXMu7/);
  assert.doesNotMatch(mms.text, /บอกวันที่|ย่านที่สะดวก|เปอร์ช่วยดูทางเลือก/);
  assert.doesNotMatch(opening.text, /นวด|MMS/);

  const slip = decideKenjiLineFirstContact(message("สวัสดี โอนแล้ว ส่งสลิป"), "greeting");
  assert.equal(slip.text, "");
  assert.equal(slip.handoff_required, true);

  const unrelated = decideKenjiLineFirstContact(message("ขอเลขบัญชี"), "note_only");
  assert.equal(unrelated.text, "");
  assert.equal(unrelated.guard_blocked, true);

  const group = decideKenjiLineFirstContact(message("แนะนำหน่อย", { source: { type: "group", groupId: "G-synthetic" } }), "note_only");
  assert.equal(group.text, "");
});

test("signed LINE opening replies once while follow and protected events stay silent", async () => {
  const originalFetch = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (url, init = {}) => {
    assert.match(String(url), /api\.line\.me\/v2\/bot\/message\/reply/);
    sent.push(JSON.parse(init.body));
    return Response.json({});
  };

  try {
    const events = [
      { type: "follow", mode: "active", replyToken: "follow-token", source: { type: "user", userId: "U-synthetic" }, webhookEventId: "follow-1" },
      message("แนะนำหน่อย"),
      message("ผู้หญิง", { replyToken: "gender-token", message: { id: "gender-1", type: "text", text: "ผู้หญิง" } }),
      message("อยากนวดชาย", { replyToken: "mms-token", message: { id: "mms-1", type: "text", text: "อยากนวดชาย" } }),
      message("โอนแล้วครับ", { replyToken: "payment-token", message: { id: "payment-1", type: "text", text: "โอนแล้วครับ" } }),
      message("แนะนำหน่อย", { replyToken: "standby-token", mode: "standby", message: { id: "standby-1", type: "text", text: "แนะนำหน่อย" } }),
    ];
    const raw = JSON.stringify({ events });
    const signature = await createLineSignature(raw, env.LINE_CHANNEL_SECRET);
    const response = await handleKenjiSeedLineRequest(new Request("https://www.mmdbkk.com/webhooks/line", {
      method: "POST", headers: { "x-line-signature": signature }, body: raw,
    }), env, null, { fetch: async () => Response.json({ ok: true }) });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(sent.length, 3);
    assert.equal(sent[0].replyToken, "synthetic-reply-token");
    assert.equal(sent[1].replyToken, "gender-token");
    assert.match(sent[1].messages[0].text, /งานหรือกิจกรรม/);
    assert.equal(sent[2].replyToken, "mms-token");
    assert.match(sent[2].messages[0].text, /lin\.ee\/NkfXMu7/);
    assert.doesNotMatch(sent[2].messages[0].text, /บอกวันที่|ย่านที่สะดวก/);
    assert.deepEqual(body.saved.map((row) => row.replied), [false, true, true, true, false, false]);
    assert.equal(body.saved[3].reply_source, "mms_line_redirect");
    assert.equal(body.saved[4].handoff_required, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("First Contact follows voluntary greeting answers without inferring identity", () => {
  const profile = decideKenjiLineFirstContact(message("ผู้หญิง"), "note_only");
  assert.equal(profile.first_contact_state.self_reported_gender, "woman");
  const combined = decideKenjiLineFirstContact(message("ผู้หญิง ชอบลุคสุภาพ"), "note_only");
  assert.equal(combined.first_contact_state.self_reported_gender, "woman");
  assert.equal(combined.first_contact_state.preferred_style, "สุภาพ");
  assert.match(profile.text, /งานหรือกิจกรรม/);
  const preferredModel = decideKenjiLineFirstContact(message("ชอบผู้ชาย"), "note_only");
  assert.equal(preferredModel.first_contact_state.self_reported_gender, undefined);
  assert.equal(preferredModel.first_contact_state.preferred_model_gender, "man");

  const style = decideKenjiLineFirstContact(message("ชอบลุคสุภาพ"), "note_only");
  assert.equal(style.first_contact_state.preferred_style, "สุภาพ");
  const skip = decideKenjiLineFirstContact(message("ข้าม"), "note_only");
  assert.equal(skip.first_contact_state.self_reported_gender, "");

  const context = (state) => ({ available: true, decision: "continuation", matrix: { payload_json: { first_contact_v2: state } } });
  const service = decideKenjiLineFirstContact(message("งานเลี้ยงบริษัท"), "note_only", context({ awaiting: "service", self_reported_gender: "woman" }));
  assert.match(service.text, /วันไหน/);
  const date = decideKenjiLineFirstContact(message("วันศุกร์"), "note_only", context({ awaiting: "date" }));
  assert.match(date.text, /ย่าน/);
  const area = decideKenjiLineFirstContact(message("สุขุมวิท 2 ทุ่ม"), "note_only", context({ awaiting: "area_time" }));
  assert.equal(area.handoff_required, true);
  assert.equal(decideKenjiLineFirstContact(message("วันศุกร์"), "note_only").text, "");
  assert.equal(decideKenjiLineFirstContact(message("โอนแล้ว ผู้หญิง"), "note_only").text, "");
});

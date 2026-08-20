import assert from "node:assert/strict";
import {
  buildAutoReplyMessage,
  buildFaqReply,
  choosePricingReplyStrategy,
  getLineEventTextForIntent,
  inferFaqIntent,
  inferIntent,
  shouldAutoReplyForIntent,
} from "../../src/line-webhook-reply-core.mjs";

const textEvent = (text) => ({
  type: "message",
  message: { type: "text", id: "m_text", text },
  source: { type: "user", userId: "U123" },
  replyToken: "reply-token",
});

const imageEvent = (context = {}) => ({
  type: "message",
  message: { type: "image", id: "m_image" },
  source: { type: "user", userId: "U123" },
  replyToken: "reply-token",
  ...context,
});

const postbackEvent = (data, displayText = "") => ({
  type: "postback",
  postback: { data, displayText },
  source: { type: "user", userId: "U123" },
  replyToken: "reply-token",
});

assert.equal(inferFaqIntent("สอบถามเรทได้ที่ไหนครับ"), "ask_where_to_get_rate");
assert.equal(inferIntent("สอบถามเรทได้ที่ไหนครับ", textEvent("สอบถามเรทได้ที่ไหนครับ")), "ask_where_to_get_rate");
assert.equal(inferIntent("เรทสูงไหมครับ", textEvent("เรทสูงไหมครับ")), "pricing_review");
assert.equal(inferIntent("", imageEvent()), "image_only_model_inquiry");
assert.equal(inferIntent("เรทสูงไหมครับ", { ...textEvent("เรทสูงไหมครับ"), context: { image_message_id: "m_image" } }), "image_rate_inquiry");

const generic = buildFaqReply("pricing_review", "", { recommended_reply_strategy: "generic_pricing_ack" });
assert.match(generic, /สอบถามเรทกับผมตรงนี้ได้เลยครับ/);
assert.doesNotMatch(generic, /สนใจนายแบบคนไหนครับ|หมายถึงคนไหนครับ|ส่งรูปมาหน่อยครับ/);
assert.doesNotMatch(generic, /บาท|฿\d/);

const adAck = buildFaqReply("pricing_review", "", { recommended_reply_strategy: "ad_context_ack" });
assert.match(adAck, /รายการที่คุณสนใจ/);
assert.doesNotMatch(adAck, /สนใจนายแบบคนไหนครับ/);

const catalogueAck = buildFaqReply("pricing_review", "", { recommended_reply_strategy: "catalogue_ack" });
assert.match(catalogueAck, /Catalogue/);
assert.doesNotMatch(catalogueAck, /สนใจนายแบบคนไหนครับ/);

const imageAck = buildFaqReply("image_only_model_inquiry", "", {});
assert.match(imageAck, /ผมได้รับรูปแล้วครับ/);
assert.doesNotMatch(imageAck, /บาท|฿\d/);

assert.equal(choosePricingReplyStrategy({ ad_context_found: true }), "ad_context_ack");
assert.equal(choosePricingReplyStrategy({ catalogue_ref: "CAT001" }), "catalogue_ack");
assert.equal(choosePricingReplyStrategy({}), "generic_pricing_ack");

assert.equal(shouldAutoReplyForIntent("pricing_review"), true);
assert.equal(shouldAutoReplyForIntent("model_availability"), true);

assert.equal(shouldAutoReplyForIntent("greeting", "สวัสดี", textEvent("สวัสดี")), false);
assert.equal(shouldAutoReplyForIntent("greeting", "สวัสดี", textEvent("สวัสดี"), { lineKenjiAiEnabled: true }), true);
assert.equal(shouldAutoReplyForIntent("note_only", "เคนจิ", textEvent("เคนจิ"), { lineKenjiAiEnabled: true }), true);

const profile = { displayName: "Boss" };
const kenjiReply = await buildAutoReplyMessage(textEvent("เคนจิ"), profile, { lineKenjiAiEnabled: true });
assert.match(kenjiReply, /Kenji/);
assert.match(kenjiReply, /ผู้ช่วยสมาชิก/);

const hiPerReply = await buildAutoReplyMessage(textEvent("Hi Per"), profile, { lineKenjiAiEnabled: true });
assert.match(hiPerReply, /Kenji/);
assert.match(hiPerReply, /ผู้ช่วยสมาชิก/);

const thaiHiPerReply = await buildAutoReplyMessage(textEvent("สวัสดี เปอร์"), profile, { lineKenjiAiEnabled: true });
assert.match(thaiHiPerReply, /Kenji/);
assert.match(thaiHiPerReply, /ผู้ช่วยสมาชิก/);

const plainGreetingReply = await buildAutoReplyMessage(textEvent("สวัสดีครับ"), profile, { lineKenjiAiEnabled: true });
assert.match(plainGreetingReply, /สวัสดีครับ/);
assert.match(plainGreetingReply, /วันนี้ให้ผมช่วย/);

const richMenuPostback = postbackEvent("action=kenji&trigger=Hi%20Per", "Hi Per");
assert.equal(getLineEventTextForIntent(richMenuPostback), "Hi Per");
const postbackReply = await buildAutoReplyMessage(richMenuPostback, profile, { lineKenjiAiEnabled: true });
assert.match(postbackReply, /Kenji/);
assert.match(postbackReply, /ผู้ช่วยสมาชิก/);

const slipReply = await buildAutoReplyMessage(textEvent("ส่งสลิปแล้ว"), profile, { lineKenjiAiEnabled: true });
assert.match(slipReply, /supporting evidence/);
assert.match(slipReply, /official verification/);
assert.match(slipReply, /fund matching/);

const svipReply = await buildAutoReplyMessage(textEvent("SVIP"), profile, { lineKenjiAiEnabled: true });
assert.match(svipReply, /Boss Per/);
assert.match(svipReply, /ไม่ได้ปลดล็อกจากแต้มอัตโนมัติ/);

const blackCardReply = await buildAutoReplyMessage(textEvent("Black Card"), profile, { lineKenjiAiEnabled: true });
assert.match(blackCardReply, /private review/);
assert.match(blackCardReply, /automatic approval/);

const bookingReply = await buildAutoReplyMessage(textEvent("จอง"), profile, { lineKenjiAiEnabled: true });
assert.match(bookingReply, /ผมช่วยพาไปขั้นตอนการจองได้ครับ/);
assert.match(bookingReply, /ขอเช็กสถานะสมาชิก/);

console.log("webhook FAQ/pricing intent tests passed");

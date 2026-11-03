import assert from "node:assert/strict";
import test from "node:test";
import { buildBookingTelegramReplyMarkup, buildBookingTelegramText } from "./src/booking-telegram-formatter.js";

test("renders compact booking alert with Thai date and QA/expired gates", () => {
  const text = buildBookingTelegramText({
    trustedIdentity: {source:"linked_per_rename_index_v1",per_rename:"QA <Client>"},
    body: { client_name: "QA <Client>", city: "Bangkok", google_address: "TEST ONLY Bangkok", duration: "2 ชม." },
    fields: {
      client_nickname: "QA <Client>",
      "Selected Model Name": "Leo",
      "Preferred Date": "Nov 2",
      "Preferred Time": "19:00",
      member_status: "expired",
      route: "PUBLIC/DINING",
      airtable_record_id: "recaU88067r3Qt2Ex",
    },
  });
  assert.match(text, /ลูกค้า:.*QA &lt;Client&gt;/);
  assert.match(text, /โมเดล: Leo/);
  assert.match(text, /วันเวลา: 2 พ\.ย\. · 19:00 · 2 ชม\./);
  assert.match(text, /สถานะ:.*สมาชิกหมดอายุ · รอตรวจสอบ/);
  assert.match(text, /ทดสอบเท่านั้น/);
  assert.match(text, /PREPARE ONLY/);
  assert.doesNotMatch(text, /recaU88067r3Qt2Ex|PUBLIC\/DINING|Next|Admin|Contact|Ref|Session/);
});

test("handles missing fields without leaking undefined values", () => {
  const text = buildBookingTelegramText({ body: {}, fields: {} });
  assert.match(text, /ลูกค้า:.*ไม่ทราบ Per Rename/);
  assert.match(text, /วันเวลา: ไม่ระบุ/);
  assert.doesNotMatch(text, /undefined|null/);
});

test("keeps the canonical admin route and booking context in the button", () => {
  const url = "https://sigil.mmdbkk.com/internal/admin/control-room?booking_ref=book_123&record_id=rec_123";
  assert.deepEqual(buildBookingTelegramReplyMarkup(url), { inline_keyboard: [[{ text: "เปิดงาน", url }]] });
});

test("rejects external, javascript, and token-bearing button URLs", () => {
  assert.equal(buildBookingTelegramReplyMarkup("https://evil.example/steal"), undefined);
  assert.equal(buildBookingTelegramReplyMarkup("javascript:alert(1)"), undefined);
  assert.equal(buildBookingTelegramReplyMarkup("https://sigil.mmdbkk.com/internal/admin/control-room?access_token=leak"), undefined);
});

 test("browser resolver identity is never trusted and budget is normalized stored intent",()=>{
 const text=buildBookingTelegramText({body:{client_name:"Spoof",per_rename:"Spoof",budget:99999},fields:{resolver_payload_json:JSON.stringify({canonical_identity:{authority:"member-pages-canonical-client-v1",per_rename:"Spoof"},customer_search:{budget:{provided:true,max_thb:4500,min_thb:0}}})}});
 assert.doesNotMatch(text,/Spoof|99,999/);assert.match(text,/4,500 บาท/);assert.match(text,/ไม่ทราบ Per Rename/);
 });

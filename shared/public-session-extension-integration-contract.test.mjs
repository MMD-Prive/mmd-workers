import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { extensionPaymentVerified } from "../payments-worker/public-session-extension-payment.js";
import { MEMBER_EXTENSION_INTERNALS } from "../member-pages-worker/src/member-app-session-extension.js";

const admin=await readFile(new URL("../admin-worker/src/index.js",import.meta.url),"utf8");
const member=await readFile(new URL("../member-pages-worker/src/member-app-session-extension.js",import.meta.url),"utf8");
const payment=await readFile(new URL("../payments-worker/public-session-extension-payment.js",import.meta.url),"utf8");
const modelUi=await readFile(new URL("../webflow/sigil/model/model-console-payout-summary-v2.html",import.meta.url),"utf8");

test("extension payment verification requires exact ref/session/amount/stage plus Paid+verified",()=>{
  const expected={payment_ref:"pay_ext_1234567890abcdef12345678",session_id:"sess-1",amount_thb:1490};
  const base={...expected,payment_status:"paid",verification_status:"verified",stage:"extension",type:"extension",official_verification_ref:"pay_ext_1234567890abcdef12345678"};
  assert.equal(extensionPaymentVerified(base,expected),true);
  for(const bad of [
    {...base,amount_thb:1491},
    {...base,session_id:"sess-other"},
    {...base,stage:"final"},
    {...base,payment_status:"pending"},
    {...base,verification_status:"pending_review"},
    {...base,official_verification_ref:"other"},
  ]) assert.equal(extensionPaymentVerified(bad,expected),false);
});

test("member payment verification uses the same fail-closed conditions",()=>{
  const extension={fields:{
    fldQHdL9CPy52I7aX:"pay_ext_1234567890abcdef12345678",
    fldYkRVUJkztQ2ThT:"sess-1",
    fldkGgu84J4sQjxfg:1490,
  }};
  const record={fields:{
    fldOO6SY49iDw8VBZ:"pay_ext_1234567890abcdef12345678",
    fld2wdhBvc8xrV6y5:"sess-1",
    fldvCSwrUW8OMAooS:1490,
    fldrr9g8ZZjqAbdKQ:"extension",
    fldydUWHhqVLMkNSC:"extension",
    fldEJ1hmm7KwWuI6q:"Paid",
    fldJ7a0Ube9F0bmRy:"verified",
  }};
  assert.equal(MEMBER_EXTENSION_INTERNALS.paymentVerified(record,extension),true);
  record.fields.fldJ7a0Ube9F0bmRy="pending_review";
  assert.equal(MEMBER_EXTENSION_INTERNALS.paymentVerified(record,extension),false);
});

test("member runtime mutates official end only after verified payment and writes idempotent overtime adjustment",()=>{
  assert.match(member,/paymentVerified\(payment,extension\)/);
  assert.match(member,/adjustment_type:"overtime"/);
  assert.match(member,/idempotency_key:clean\(ef\[EF\.idempotency\]/);
  assert.match(member,/\{end_time:requested\}/);
  assert.match(member,/\[EF\.status\]:"mmd_confirmed"/);
  assert.match(member,/lane!=="public_model"/);
  assert.doesNotMatch(member,/pay_model_thb\s*:/);
});

test("model decision never changes lifecycle and payment intent is isolated",()=>{
  assert.match(admin,/PUBLIC_EXTENSION_MODEL_ACTIONS = new Set\(\["approve_extension", "decline_extension"\]\)/);
  assert.match(admin,/state !== "work_started"/);
  assert.match(admin,/sessionView\.model_work_lane !== "public_model"/);
  assert.match(admin,/session-extension\/intent/);
  assert.match(admin,/payment_intent_ready/);
  assert.match(payment,/schema:"mmd_public_session_extension_v1"/);
  assert.doesNotMatch(payment,/AIRTABLE_TABLE_SESSIONS/);
});

test("Model UI exposes only additional model payout and explicit approve/decline actions",()=>{
  assert.match(modelUi,/คุณได้รับเพิ่ม/);
  assert.match(modelUi,/approve_extension/);
  assert.match(modelUi,/decline_extension/);
  assert.match(modelUi,/เวลาจะยังไม่เปลี่ยนจนกว่าลูกค้าชำระและ MMD ยืนยัน/);
  assert.doesNotMatch(modelUi,/customer_amount_thb|margin_thb|commission_thb/);
});

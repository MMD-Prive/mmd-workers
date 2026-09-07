import assert from "node:assert/strict";
import test from "node:test";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const {
  isMmsLineRequest,
  handleMmsLineRequest,
  MMS_LINE_RUNTIME_INTERNALS,
} = await import("../src/mms-line-runtime.mjs");

const { richMenuDraft, deterministicReply, postbackReply, verifyLineSignature } = MMS_LINE_RUNTIME_INTERNALS;

test("MMS LINE route is isolated from MMD webhook", () => {
  assert.equal(isMmsLineRequest(new Request("https://mmdbkk.com/webhooks/line/mms")), true);
  assert.equal(isMmsLineRequest(new Request("https://mmdbkk.com/webhooks/line")), false);
});

test("MMS Rich Menu is the canonical 2500x1686 six-cell customer menu", () => {
  const menu = richMenuDraft();
  assert.deepEqual(menu.size, { width: 2500, height: 1686 });
  assert.equal(menu.selected, true);
  assert.equal(menu.areas.length, 6);
  assert.equal(menu.areas[0].action.uri, "https://mmdbkk.com/male-massage/member/mms-booking");
  assert.equal(menu.areas[1].action.uri, "https://mmdbkk.com/male-massage/therapists/mms");
  assert.equal(menu.areas[2].action.data, "mms:menu:services");
  assert.equal(menu.areas[3].action.uri, "https://mmdbkk.com/male-massage/how-to-use");
  assert.equal(menu.areas[4].action.data, "mms:menu:my_booking");
  assert.equal(menu.areas[5].action.data, "mms:menu:support");
});

test("booking reply preserves pre-booking not confirmation boundary", () => {
  const reply = deterministicReply("อยากจองนวด");
  assert.match(reply, /Pre-booking/i);
  assert.match(reply, /ไม่ถือว่า Confirm/i);
});

test("support and services stay customer-facing", () => {
  assert.match(postbackReply("mms:menu:services"), /Aroma Oil/);
  assert.match(postbackReply("mms:menu:support"), /พิมพ์เรื่องที่ต้องการให้ช่วย/);
});

test("LINE signature uses MMS secret", async () => {
  const body = JSON.stringify({ events: [] });
  const secret = "mms-test-secret";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))).toString("base64");
  assert.equal(await verifyLineSignature(body, sig, secret), true);
  assert.equal(await verifyLineSignature(body, sig, "mmd-wrong-secret"), false);
});

test("MMS webhook health fails closed without pretending credentials exist", async () => {
  const response = await handleMmsLineRequest(new Request("https://mmdbkk.com/webhooks/line/mms"), { MMS_LINE_AI_ENABLED: "true" });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.configured, false);
  assert.equal(body.ai_enabled, true);
});

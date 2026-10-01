import assert from "node:assert/strict";
import test from "node:test";

import {
  KENJI_SVIP_PHOTO_REVEAL_INTERNALS,
  parseKenjiSvipPhotoRevealText,
  tryHandleKenjiSvipPhotoRevealRequest,
} from "../src/kenji-svip-photo-reveal.mjs";

test("explicit Thai and English photo requests extract only the exact Model reference", () => {
  assert.deepEqual(parseKenjiSvipPhotoRevealText("ขอรูป EMs11 หน่อยครับ"), {
    query: "EMs11",
    mode: "exact_photo_request",
  });
  assert.deepEqual(parseKenjiSvipPhotoRevealText("GWs19 ขอรูปทั้งหมด"), {
    query: "GWs19",
    mode: "exact_photo_request",
  });
  assert.deepEqual(parseKenjiSvipPhotoRevealText("show me all photos of Jasper"), {
    query: "Jasper",
    mode: "exact_photo_request",
  });
});

test("ordinary Model lookup, booking and vague image text do not enter photo reveal", () => {
  for (const value of ["EMs11", "Jasper ว่างไหม", "จอง GWs19 คืนนี้", "ขอดูหน่อย", "รูป"]) {
    assert.equal(parseKenjiSvipPhotoRevealText(value), null);
  }
});

test("ready response contains only controlled MMD preview links and no raw private source", () => {
  const messages = KENJI_SVIP_PHOTO_REVEAL_INTERNALS.perVoiceMessages({
    status: "ready",
    model: { working_name: "Jasper" },
    photos: [
      { viewer_url: "https://www.mmdbkk.com/api/member/app/private-preview/view?g=svip_photo_123e4567-e89b-12d3-a456-426614174000#t=one" },
      { viewer_url: "https://www.mmdbkk.com/api/member/app/private-preview/view?g=svip_photo_123e4567-e89b-12d3-a456-426614174001#t=two" },
      { viewer_url: "https://drive.google.com/private-folder" },
    ],
  });
  assert.equal(messages.length, 3);
  const serialized = JSON.stringify(messages);
  assert.match(serialized, /private-preview\/view\?g=svip_photo_.*#t=/);
  assert.doesNotMatch(serialized, /drive\.google|r2|private-model-media|storage_key/i);
});

test("ready response keeps the complete approved album instead of truncating after four photos", () => {
  const photos = Array.from({ length: 7 }, (_, index) => ({
    viewer_url: `https://www.mmdbkk.com/api/member/app/private-preview/view?g=svip_photo_123e4567-e89b-12d3-a456-4266141740${String(index).padStart(2, "0")}#t=token-${index + 1}`,
  }));
  const messages = KENJI_SVIP_PHOTO_REVEAL_INTERNALS.perVoiceMessages({
    status: "ready",
    model: { working_name: "Album Model" },
    photos,
  });
  assert.equal(messages.length, 8);
  assert.match(messages[0].text, /ครบทั้งชุดที่อนุมัติ/);
  assert.match(messages[1].text, /รูป 1\/7/);
  assert.match(messages[7].text, /รูป 7\/7/);
});

test("full album delivery replies with the first five messages then pushes every remaining batch", async () => {
  const originalFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (input, init) => {
    seen.push({ url: String(input), body: JSON.parse(init.body) });
    return new Response("", { status: 200 });
  };
  try {
    const messages = Array.from({ length: 12 }, (_, index) => ({ type: "text", text: `m${index + 1}` }));
    const result = await KENJI_SVIP_PHOTO_REVEAL_INTERNALS.sendLineAlbum(
      { LINE_CHANNEL_ACCESS_TOKEN: "synthetic-token" },
      "synthetic-reply-token",
      "U1234567890abcdef1234567890abcdef",
      messages,
    );
    assert.equal(result.ok, true);
    assert.equal(result.complete, true);
    assert.equal(result.delivered_messages, 12);
    assert.equal(result.batches, 3);
    assert.equal(seen.length, 3);
    assert.equal(seen[0].url, "https://api.line.me/v2/bot/message/reply");
    assert.equal(seen[0].body.messages.length, 5);
    assert.equal(seen[1].url, "https://api.line.me/v2/bot/message/push");
    assert.equal(seen[1].body.messages.length, 5);
    assert.equal(seen[2].url, "https://api.line.me/v2/bot/message/push");
    assert.equal(seen[2].body.messages.length, 2);
    assert.deepEqual(
      seen.flatMap((item) => item.body.messages).map((item) => item.text),
      messages.map((item) => item.text),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("photo reveal decision never grants sales, availability, booking or payment authority", () => {
  const decision = KENJI_SVIP_PHOTO_REVEAL_INTERNALS.decisionFor(
    {},
    { query: "EMs11" },
    { status: "ready", photo_count: 2 },
    { ok: true },
  );
  assert.equal(decision.handoff_required, false);
  assert.equal(decision.operational.photo_only_authority, true);
  assert.equal(decision.operational.sales_authority, false);
  assert.equal(decision.operational.availability_authority, false);
  assert.equal(decision.operational.booking_authority, false);
  assert.equal(decision.operational.payment_authority, false);
});

test("caution/no-sell/ambiguity response requires Per handoff", () => {
  for (const reason_code of ["client_caution", "client_no_sell", "model_ambiguous", "model_sales_control_no_sell"]) {
    const decision = KENJI_SVIP_PHOTO_REVEAL_INTERNALS.decisionFor(
      {},
      { query: "EMs11" },
      { status: "review_required", reason_code },
      { ok: true },
    );
    assert.equal(decision.handoff_required, true);
    assert.equal(decision.operational.primary_action, "handoff_per");
    assert.match(decision.handoff_reason, /model_photo_reveal/);
  }
});


test("rollout defaults off, unknown modes fail closed, and pilot requires an approved SHA-256 user hash", async () => {
  assert.equal(KENJI_SVIP_PHOTO_REVEAL_INTERNALS.photoRevealMode({}), "off");
  assert.equal(KENJI_SVIP_PHOTO_REVEAL_INTERNALS.photoRevealMode({ KENJI_SVIP_PHOTO_REVEAL_MODE: "LIVE_typo" }), "off");
  assert.equal(KENJI_SVIP_PHOTO_REVEAL_INTERNALS.photoRevealMode({ KENJI_SVIP_PHOTO_REVEAL_MODE: "anything_else" }), "off");
  assert.equal(KENJI_SVIP_PHOTO_REVEAL_INTERNALS.photoRevealMode({ KENJI_SVIP_PHOTO_REVEAL_MODE: "dry_run" }), "dry_run");
  const userId = "U1234567890abcdef1234567890abcdef";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(userId));
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  assert.equal(await KENJI_SVIP_PHOTO_REVEAL_INTERNALS.pilotAllows({ KENJI_SVIP_PHOTO_REVEAL_PILOT_HASHES: hash }, userId), true);
  assert.equal(await KENJI_SVIP_PHOTO_REVEAL_INTERNALS.pilotAllows({ KENJI_SVIP_PHOTO_REVEAL_PILOT_HASHES: "" }, userId), false);
});

test("feature-off exits before any runtime or LINE network call", async () => {
  const originalFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = async () => { networkCalls += 1; throw new Error("network must stay dark"); };
  try {
    const request = new Request("https://www.mmdbkk.com/webhooks/line", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events: [{
        type: "message",
        replyToken: "reply-test",
        source: { type: "user", userId: "U1234567890abcdef1234567890abcdef" },
        message: { type: "text", id: "msg-test", text: "ขอรูป EMs11 หน่อยครับ" },
      }] }),
    });
    const result = await tryHandleKenjiSvipPhotoRevealRequest(request, {
      LINE_KENJI_AI_ENABLED: "true",
      LINE_AUTO_REPLY_ENABLED: "true",
    });
    assert.equal(result, null);
    assert.equal(networkCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("LINE transport test is fully mocked and never contacts the real endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (input, init) => {
    seen.push({ url: String(input), body: JSON.parse(init.body) });
    return new Response("", { status: 200 });
  };
  try {
    const result = await KENJI_SVIP_PHOTO_REVEAL_INTERNALS.sendLineReply(
      { LINE_CHANNEL_ACCESS_TOKEN: "synthetic-token" },
      "synthetic-reply-token",
      [{ type: "text", text: "synthetic only" }],
    );
    assert.equal(result.ok, true);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, "https://api.line.me/v2/bot/message/reply");
    assert.deepEqual(seen[0].body.messages, [{ type: "text", text: "synthetic only" }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("dry-run decision creates an owner receipt and never claims customer delivery", () => {
  const decision = KENJI_SVIP_PHOTO_REVEAL_INTERNALS.decisionFor(
    {},
    { query: "EMs11" },
    { status: "dry_run_ready", reason_code: "dry_run_ready", photo_count: 2 },
    { ok: false },
  );
  assert.equal(decision.handoff_required, true);
  assert.equal(decision.operational.primary_action, "dry_run_owner_receipt");
  assert.equal(decision.operational.line_delivery_status, "not_delivered");
  assert.equal(decision.operational.sales_authority, false);
  assert.equal(decision.operational.booking_authority, false);
});

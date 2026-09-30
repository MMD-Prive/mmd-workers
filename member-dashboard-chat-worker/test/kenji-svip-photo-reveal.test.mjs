import assert from "node:assert/strict";
import test from "node:test";

import {
  KENJI_SVIP_PHOTO_REVEAL_INTERNALS,
  parseKenjiSvipPhotoRevealText,
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
      { viewer_url: "https://www.mmdbkk.com/api/member/app/private-preview/view#t=one" },
      { viewer_url: "https://www.mmdbkk.com/api/member/app/private-preview/view#t=two" },
      { viewer_url: "https://drive.google.com/private-folder" },
    ],
  });
  assert.equal(messages.length, 3);
  const serialized = JSON.stringify(messages);
  assert.match(serialized, /private-preview\/view#t=/);
  assert.doesNotMatch(serialized, /drive\.google|r2|private-model-media|storage_key/i);
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

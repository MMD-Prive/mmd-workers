import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { kenjiLineModelOnlyAllowsReply } from "../src/index.js";

test("owner model-only gate allows only direct Model lookup continuations", () => {
  assert.equal(kenjiLineModelOnlyAllowsReply({ intent: "model_lookup", modelIntent: { query: "Jasper" } }), true);
  assert.equal(kenjiLineModelOnlyAllowsReply({ intent: "model_access_verification", modelIntent: {} }), true);
  assert.equal(kenjiLineModelOnlyAllowsReply({ intent: "card_campaign_lead", modelIntent: { query: "EMs11", campaign_trigger: { card_trigger: "EMs11" } } }), true);

  for (const intent of [
    "payment",
    "membership",
    "service",
    "booking",
    "availability",
    "note_only",
    "refund_request",
    "card_campaign_brief",
  ]) {
    assert.equal(kenjiLineModelOnlyAllowsReply({ intent, modelIntent: {} }), false, intent);
  }
});

test("production config keeps broad First Contact off while Model-only lock is on", async () => {
  const wrangler = await readFile(new URL("../wrangler.toml", import.meta.url), "utf8");
  assert.match(wrangler, /KENJI_LINE_MODEL_ONLY_ENABLED\s*=\s*"true"/);
  assert.match(wrangler, /LINE_FIRST_CONTACT_ENABLED\s*=\s*"false"/);
  assert.match(wrangler, /LINE_AUTO_REPLY_ENABLED\s*=\s*"true"/);
});

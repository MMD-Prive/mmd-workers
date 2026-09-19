import test from "node:test";
import assert from "node:assert/strict";

import {
  CONCIERGE_CAPABILITY_PACK_VERSION,
  CONCIERGE_CAPABILITIES,
  conciergeCapabilityById,
  conciergeCapabilityPrompt,
  detectSharedConciergeCapability,
} from "./concierge-capability-pack-v1.mjs";

test("shared concierge capability pack exposes exactly capabilities 1-7", () => {
  assert.equal(CONCIERGE_CAPABILITIES.length, 7);
  assert.deepEqual(CONCIERGE_CAPABILITIES.map((item) => item.number), [1,2,3,4,5,6,7]);
  assert.match(CONCIERGE_CAPABILITY_PACK_VERSION, /^mmd-concierge-capability-pack-v1-/);
  assert.equal(conciergeCapabilityById("mms_therapist_options")?.primary_owner, "HENNA");
  assert.equal(conciergeCapabilityById("shop_orders")?.primary_owner, "HYPE");
});

test("shared capability detection covers the seven firmware lanes", () => {
  const cases = [
    ["GG Water ของผมถึงไหนแล้ว", "shop_orders"],
    ["GG Water ยังไม่ถึงเลย", "service_recovery"],
    ["CARE BACK คูปองเปิดหรือยัง", "care_back_coupon"],
    ["ช่วยหา therapist ที่เหมาะหน่อย", "mms_therapist_options"],
    ["งานมีปัญหา น้องยังไม่มา", "service_recovery"],
    ["เรื่องที่ส่งให้เปอร์ถึงไหนแล้ว", "closed_loop_handoff"],
    ["ขอดู model ใน Hall", "hall_model_discovery"],
    ["แต้มคงเหลือเท่าไหร่", "points_coupon_balance"],
  ];
  for (const [text, expected] of cases) {
    assert.equal(detectSharedConciergeCapability(text), expected, text);
  }
});

test("HYPE and HENNA prompts preserve authority separation", () => {
  const hype = conciergeCapabilityPrompt("hype");
  const henna = conciergeCapabilityPrompt("henna");
  assert.match(hype, /HYPE owns cross-system concierge/);
  assert.match(hype, /MMS specialist work bridges to HENNA/);
  assert.match(henna, /HENNA owns MMS specialist work/);
  assert.match(henna, /non-MMS member\/account work bridges to HYPE/);
  assert.match(hype, /Never turn awareness into authority/);
  assert.match(henna, /Never turn awareness into authority/);
});

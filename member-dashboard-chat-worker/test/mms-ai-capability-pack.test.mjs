import test from "node:test";
import assert from "node:assert/strict";

import {
  MMS_AI_KNOWLEDGE_VERSION,
  MMS_AI_SYSTEM_PROMPT_V4,
  classifyMmsIntent,
  staticMmsReply,
} from "../src/mms-ai-knowledge-v4.js";

test("MMS AI/HENNA knowledge loads capability pack 1-7", () => {
  assert.match(MMS_AI_KNOWLEDGE_VERSION, /20260919-capability-pack-1-7/);
  assert.match(MMS_AI_SYSTEM_PROMPT_V4, /mmd-concierge-capability-pack-v1-20260919/);
  assert.match(MMS_AI_SYSTEM_PROMPT_V4, /HYPE is the cross-system MMD operating concierge/);

  const cases = [
    ["GG Water ของผมถึงไหนแล้ว", "mmd_shop_orders"],
    ["CARE BACK คูปองเปิดหรือยัง", "care_back_coupon"],
    ["ช่วยหา therapist ที่เหมาะหน่อย", "therapist_recommendation"],
    ["งานมีปัญหา น้องยังไม่มา", "service_recovery"],
    ["เรื่องที่ส่งให้เปอร์ถึงไหนแล้ว", "closed_loop_handoff"],
    ["ขอดู model ใน Hall", "hall_model_discovery"],
    ["แต้มคงเหลือเท่าไหร่", "points_coupon_balance"],
  ];
  for (const [message, intent] of cases) {
    assert.equal(classifyMmsIntent(message), intent, message);
  }
});

test("MMS AI bridges non-MMS lanes without taking HYPE/member authority", () => {
  assert.match(staticMmsReply({ message: "GG Water ของผมถึงไหนแล้ว" }), /MY MMD/);
  assert.match(staticMmsReply({ message: "CARE BACK คูปองเปิดหรือยัง" }), /จะไม่ activate\/reissue/);
  assert.match(staticMmsReply({ message: "ขอดู model ใน Hall" }), /จะไม่เดาเพศ\/มุมมอง/);
  assert.match(staticMmsReply({ message: "แต้มคงเหลือเท่าไหร่" }), /จะไม่เดายอด/);
  assert.match(staticMmsReply({ message: "เรื่องที่ส่งให้เปอร์ถึงไหนแล้ว" }), /จะไม่บอกว่าทีมรับแล้วหรือเคสจบแล้ว/);
});

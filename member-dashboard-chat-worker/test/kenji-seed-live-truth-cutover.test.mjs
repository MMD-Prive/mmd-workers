import assert from "node:assert/strict";
import test from "node:test";
import { resolveKenjiSeedDecision } from "../src/kenji-seed-line-runtime.mjs";

function event(text) {
  return {
    type: "message",
    message: { type: "text", text },
    source: { type: "user", userId: "U1234567890abcdef1234567890abcdef" },
  };
}

const continuity = {
  decision: "continuation",
  effective_intent: "membership_status",
  current_intent: "membership_status",
  topic: "membership",
  conversation_stage: "awaiting_entitlement_refresh",
  client_record_id: "recKnownCustomer",
  matrix: { client_record_id: "recKnownCustomer", relationship_context: "svip_relationship" },
};

const liveTruth = {
  ok: true,
  authority: "my_mmd_entitlement_resolver_v1",
  identity_status: "resolved",
  membership: {
    level: "svip",
    label: "SVIP",
    lifecycle: "active",
    expire_at: "",
    public_service_access: true,
    private_visibility_envelope: "svip",
    member_blocked: false,
  },
  points: { status: "verified", active_points: 88 },
};

test("membership status uses canonical live truth before legacy deterministic system copy", async () => {
  const decision = await resolveKenjiSeedDecision(event("สถานะสมาชิกของผม"), {}, {
    currentIntent: "membership_status",
    continuity,
    liveTruth,
  });
  assert.equal(decision.reply_source, "live_truth");
  assert.equal(decision.live_truth_verified, true);
  assert.equal(decision.handoff_required, false);
  assert.match(decision.text, /SVIP/);
  assert.doesNotMatch(decision.text, /ยืนยันตัวตนสำเร็จก่อน|ต้องตรวจผ่าน My MMD/);
});

test("known canonical identity does not fall back to legacy reverification copy when truth read fails", async () => {
  const decision = await resolveKenjiSeedDecision(event("สถานะสมาชิกของผม"), {}, {
    currentIntent: "membership_status",
    continuity,
    liveTruth: { ok: false, status: "unavailable", authority: "my_mmd_entitlement_resolver_v1" },
  });
  assert.equal(decision.reply_source, "live_truth_unavailable");
  assert.equal(decision.handoff_required, true);
  assert.doesNotMatch(decision.text, /ยืนยันตัวตนสำเร็จก่อน|ต้องตรวจผ่าน My MMD/);
});

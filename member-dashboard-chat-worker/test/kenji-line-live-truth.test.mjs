import assert from "node:assert/strict";
import test from "node:test";
import {
  buildKenjiLiveTruthDecision,
  resolveKenjiLineLiveTruth,
} from "../src/kenji-line-live-truth.mjs";

const LINE_USER_ID = "U1234567890abcdef1234567890abcdef";

function event() {
  return { source: { type: "user", userId: LINE_USER_ID } };
}

function truthPayload(overrides = {}) {
  return {
    ok: true,
    authority: "my_mmd_entitlement_resolver_v1",
    identity_status: "resolved",
    display_name: "Joeka",
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
    ...overrides,
  };
}

test("reads bounded canonical truth through member-pages service binding", async () => {
  let captured = null;
  const env = {
    MEMBER_PAGES_WORKER: {
      async fetch(request) {
        captured = request;
        return Response.json(truthPayload());
      },
    },
  };
  const truth = await resolveKenjiLineLiveTruth({ env, event: event(), intent: "membership_status" });
  assert.equal(truth.ok, true);
  assert.equal(truth.authority, "my_mmd_entitlement_resolver_v1");
  assert.equal(truth.membership.label, "SVIP");
  assert.equal(truth.membership.lifecycle, "active");
  assert.equal(new URL(captured.url).hostname, "member-pages-worker.internal");
  assert.equal(captured.headers.get("x-mmd-internal-call"), "true");
  assert.equal(captured.headers.get("x-mmd-service-binding"), "member-dashboard-chat-worker");
  const body = await captured.json();
  assert.equal(body.line_user_id, LINE_USER_ID);
  assert.equal(body.intent, "membership_status");
  assert.equal(JSON.stringify(truth).includes(LINE_USER_ID), false);
});

test("verified membership truth renders natural status instead of reverification copy", () => {
  const decision = buildKenjiLiveTruthDecision("membership_status", truthPayload(), {
    client_record_id: "recKnownCustomer",
  });
  assert.equal(decision.reply_source, "live_truth");
  assert.equal(decision.live_truth_verified, true);
  assert.equal(decision.handoff_required, false);
  assert.match(decision.text, /SVIP/);
  assert.match(decision.text, /Active/);
  assert.doesNotMatch(decision.text, /ยืนยันตัวตน|ต้องตรวจผ่าน My MMD/);
});

test("known identity never gets a reverification instruction when live truth is temporarily unavailable", () => {
  const decision = buildKenjiLiveTruthDecision("membership_status", {
    ok: false,
    status: "unavailable",
    authority: "my_mmd_entitlement_resolver_v1",
  }, {
    client_record_id: "recKnownCustomer",
  });
  assert.equal(decision.reply_source, "live_truth_unavailable");
  assert.equal(decision.handoff_required, true);
  assert.match(decision.text, /เจอบัญชีที่ผูกไว้แล้ว/);
  assert.doesNotMatch(decision.text, /ยืนยันตัวตน|สมัครใหม่/);
});

test("verified Points truth renders only the canonical value", () => {
  const decision = buildKenjiLiveTruthDecision("points_status", truthPayload(), {
    client_record_id: "recKnownCustomer",
  });
  assert.equal(decision.reply_source, "live_truth");
  assert.equal(decision.text, "ตอนนี้มี 88 Points ครับ");
});

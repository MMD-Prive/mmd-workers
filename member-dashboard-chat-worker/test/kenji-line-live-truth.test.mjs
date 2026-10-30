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

for (const [label, value] of [
  ["null", null], ["missing", undefined], ["blank", ""], ["whitespace", " "],
  ["false", false], ["true", true], ["numeric string", "88"],
  ["array", []], ["numeric array", [88]], ["object", {}],
  ["negative", -1], ["fraction", 1.5], ["NaN", NaN],
  ["infinity", Infinity], ["unsafe integer", Number.MAX_SAFE_INTEGER + 1],
]) {
  test(`malformed Points ${label} cannot become a verified LINE reply`, async () => {
    const payload = truthPayload({ points: { status: "verified", active_points: value } });
    let calls = 0;
    const env = { MEMBER_PAGES_WORKER: { async fetch() { calls++; return Response.json(payload); } } };
    const truth = await resolveKenjiLineLiveTruth({ env, event: event(), intent: "points_status" });
    assert.equal(calls, 1);
    assert.deepEqual(truth.points, { status: "unavailable", active_points: null });
    // The final reply boundary must also reject an unsanitized injected value.
    for (const input of [truth, payload]) {
      const decision = buildKenjiLiveTruthDecision("points_status", input);
      assert.equal(decision.live_truth_verified, false);
      assert.equal(decision.reply_source, "live_truth_unavailable");
      assert.match(decision.text, /intent=status&view=points/);
      assert.doesNotMatch(decision.text, /\b\d[\d,]*\s*Points\b/);
    }
  });
}

for (const identity_status of [undefined, "unresolved", "ambiguous", "owner_oa_linked"]) {
  test(`Points cannot be sent for unproven identity ${identity_status}`, () => {
    const decision = buildKenjiLiveTruthDecision("points_status", truthPayload({ identity_status }));
    assert.equal(decision.live_truth_verified, false);
    assert.equal(decision.reply_source, "live_truth_unavailable");
    assert.doesNotMatch(decision.text, /\b88 Points\b/);
  });
}

test("a verified numeric zero remains a real zero", async () => {
  const env = { MEMBER_PAGES_WORKER: { async fetch() {
    return Response.json(truthPayload({ points: { status: "verified", active_points: 0 } }));
  } } };
  const truth = await resolveKenjiLineLiveTruth({ env, event: event(), intent: "points_status" });
  const decision = buildKenjiLiveTruthDecision("points_status", truth);
  assert.equal(decision.live_truth_verified, true);
  assert.match(decision.text, /มี 0 Points/);
});

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
  assert.match(decision.text, /Public Service: ใช้ได้/);
  assert.match(decision.text, /Private visibility: SVIP/);
  assert.doesNotMatch(decision.text, /Points|แต้ม|คะแนน/i);
  assert.match(decision.text, /GWs\/EMs.*รายบุคคล/s);
  assert.match(decision.text, /ไม่ได้เปิดทั้งหมด/);
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

for (const failure_class of ["identity_unresolved", "no_entitlement", "upstream_error", "projection_invalid"]) {
  test(`membership failure ${failure_class} stays distinct and never asks for relinking`, async () => {
    const env = { MEMBER_PAGES_WORKER: { async fetch() {
      return new Response(JSON.stringify({ ok: false, status: failure_class, failure_class, authority: "my_mmd_entitlement_resolver_v1" }), { status: 503 });
    } } };
    const truth = await resolveKenjiLineLiveTruth({ env, event: event(), intent: "membership_status" });
    const decision = buildKenjiLiveTruthDecision("membership_status", truth);
    assert.equal(truth.failure_class, failure_class);
    assert.equal(decision.truth_status, failure_class);
    assert.equal(decision.handoff_required, false);
    assert.doesNotMatch(decision.text, /เชื่อม|สมัครใหม่|ชำระใหม่/);
  });
}

test("verified Points truth renders the canonical value and dedicated LIFF route", () => {
  const decision = buildKenjiLiveTruthDecision("points_status", truthPayload(), {
    client_record_id: "recKnownCustomer",
  });
  assert.equal(decision.reply_source, "live_truth");
  assert.equal(decision.text, "คุณJoeka ตอนนี้มี 88 Points ครับ\nดูรายละเอียดใน My MMD > Points ได้ที่นี่ครับ → https://miniapp.line.me/2010862595-yT4DCEMc/?intent=status&view=points");
  assert.doesNotMatch(decision.text, /workers\.dev|careback/i);
});

test("unavailable Points truth fails closed with the dedicated LIFF route and no number", () => {
  const decision = buildKenjiLiveTruthDecision("points_status", {
    ok: false,
    status: "unavailable",
    authority: "my_mmd_entitlement_resolver_v1",
  }, {});
  assert.equal(decision.reply_source, "live_truth_unavailable");
  assert.equal(decision.live_truth_verified, false);
  assert.match(decision.text, /ยังไม่ยืนยันตัวเลข/);
  assert.match(decision.text, /https:\/\/miniapp\.line\.me\/2010862595-yT4DCEMc\/\?intent=status&view=points/);
  assert.doesNotMatch(decision.text, /\b\d[\d,]*\s*Points\b/);
});


test("expired membership status does not advertise stale access as currently open", () => {
  const decision = buildKenjiLiveTruthDecision("membership_status", truthPayload({
    membership: {
      level: "private_premium",
      label: "Premium",
      lifecycle: "expired",
      expire_at: "2026-09-01",
      public_service_access: true,
      private_visibility_envelope: "premium",
      member_blocked: false,
    },
  }), { client_record_id: "recKnownCustomer" });

  assert.match(decision.text, /หมดอายุแล้ว/);
  assert.doesNotMatch(decision.text, /Public Service: ใช้ได้/);
  assert.doesNotMatch(decision.text, /Private visibility: Private Premium/);
});

for (const status of ["identity_unresolved", "no_entitlement", "upstream_error", "projection_invalid"]) {
  test(`preserves trusted ${status} from HTTP 200`, async () => {
    const result = await resolveKenjiLineLiveTruth({ event: event(), intent: "membership_status", env: {
      MEMBER_PAGES_WORKER: { fetch: async () => Response.json({ ok: false,
        authority: "my_mmd_entitlement_resolver_v1", status, failure_class: status }) },
    } });
    assert.equal(result.failure_class, status);
    assert.equal(result.ok, false);
  });
}

test("untrusted HTTP 200 failure cannot assert an identity result", async () => {
  const result = await resolveKenjiLineLiveTruth({ event: event(), intent: "membership_status", env: {
    MEMBER_PAGES_WORKER: { fetch: async () => Response.json({ ok: false,
      authority: "other", status: "no_entitlement", failure_class: "no_entitlement" }) },
  } });
  assert.equal(result.status, "unavailable");
  assert.equal(result.failure_class, undefined);
});

test("membership read accepts success after the former 1600ms deadline and makes one call", async () => {
  let calls = 0;
  const env = { MEMBER_PAGES_WORKER: { async fetch() {
    calls += 1;
    await new Promise(resolve => setTimeout(resolve, 1700));
    return Response.json(truthPayload());
  } } };
  for (let i = 0; i < 2; i += 1) {
    const result = await resolveKenjiLineLiveTruth({ env, event: event(), intent: "membership_status" });
    assert.equal(result.ok, true);
  }
  assert.equal(calls, 2);
});

test("membership read enforces total deadline even when binding ignores abort", async () => {
  const result = await resolveKenjiLineLiveTruth({ event: event(), intent: "membership_status", env: {
    MEMBER_PAGES_WORKER: { fetch: () => new Promise(() => {}) },
  } });
  assert.equal(result.failure_class, "upstream_error");
  assert.equal(result.failure_reason, "timeout");
});

test("unclassified HTTP503 is upstream failure", async () => {
  const result = await resolveKenjiLineLiveTruth({ event: event(), intent: "membership_status", env: {
    MEMBER_PAGES_WORKER: { fetch: async () => new Response("unavailable", { status: 503 }) },
  } });
  assert.equal(result.failure_class, "upstream_error");
});


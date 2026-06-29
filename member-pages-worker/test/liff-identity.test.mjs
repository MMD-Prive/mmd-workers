import assert from "node:assert/strict";
import { describe, it } from "node:test";

import worker from "../src/index.js";

async function identify(payload, url = "https://mmdbkk.com/member/api/liff/identify?t=query-token&code=query-code&promo=query-promo") {
  const response = await worker.fetch(new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }));
  const body = await response.json();
  return { response, body };
}

describe("LIFF identity bridge", () => {
  it("keeps public membership LIFF flow out of SIGIL by default", async () => {
    const { response, body } = await identify({
      line_user_id: "Uabc123",
      line_display_name: "Jay Public",
      line_picture_url: "https://profile.example/pic.jpg",
      entry_route: "public_membership",
      t: "abc",
      code: "KJ-PRV-123456",
      promo: "public-rate",
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-mmd-worker"), "member-pages-worker");
    assert.equal(response.headers.get("x-mmd-page"), "liff-identity-bridge");
    assert.equal(body.ok, true);
    assert.equal(body.data.identity_status, "possible_match");
    assert.equal(body.data.next_route, "/member/membership?t=abc&code=KJ-PRV-123456&promo=public-rate");
    assert.doesNotMatch(body.data.next_route, /^\/sigil\//);
    assert.equal(body.data.customer_safe_summary.entry_route, "public_membership");
  });

  it("keeps SIGIL LIFF flow private and review-based", async () => {
    const { body } = await identify({
      line_user_id: "Uabc123",
      entry_route: "sigil_membership",
      t: "sigil-token",
      code: "private-code",
      promo: "renewal",
    });

    assert.equal(body.ok, true);
    assert.equal(body.data.identity_status, "review_required");
    assert.equal(body.data.review_required, true);
    assert.equal(body.data.next_route, "/sigil/membership?t=sigil-token&code=private-code&promo=renewal");
    assert.equal(body.data.customer_safe_summary.entry_route, "sigil_membership");
  });

  it("does not materialize membership, payments, points, or entitlements from LIFF identity alone", async () => {
    const { body } = await identify({
      line_user_id: "Uabc123",
      entry_route: "public_membership",
      active_points: 9999,
      proposed_points: 9999,
      legacy_points: 9999,
      membership_status: "active",
      payment_status: "paid",
      entitlement_level: "blackcard",
      svip: true,
      ban_note: "hidden",
      risk_note: "hidden",
      internal_note: "hidden",
    });

    assert.equal(body.ok, true);
    assert.equal(body.data.materialization.membership_active, false);
    assert.equal(body.data.materialization.points_awarded, false);
    assert.equal(body.data.materialization.payments_verified, false);
    assert.equal(body.data.materialization.entitlements_materialized, false);
    assert.equal(body.data.materialization.reason, "liff_identity_linking_only");

    const rendered = JSON.stringify(body);
    assert.doesNotMatch(rendered, /9999/);
    assert.doesNotMatch(rendered, /blackcard/i);
    assert.doesNotMatch(rendered, /svip/i);
    assert.doesNotMatch(rendered, /ban_note|risk_note|internal_note|hidden/i);
  });

  it("preserves only t, code, and promo in safe next routes", async () => {
    const { body } = await identify({
      line_user_id: "Uabc123",
      entry_route: "dashboard",
      t: "tok",
      code: "code-1",
      promo: "promo-1",
      payment_ref: "should-not-pass",
      session_id: "should-not-pass",
      admin: "should-not-pass",
    });

    assert.equal(body.data.next_route, "/member/membership?t=tok&code=code-1&promo=promo-1");
    assert.equal(body.data.dashboard_unlock.unlocked, false);
    assert.equal(body.data.dashboard_unlock.holding_route, "/member/membership?t=tok&code=code-1&promo=promo-1");
    assert.equal(body.data.dashboard_unlock.reason, "waiting_for_first_real_job_or_session");
    assert.equal(body.data.safe_next.dashboard, null);
    assert.equal(body.data.safe_next.payment, "/pay/membership?t=tok&code=code-1&promo=promo-1");
    assert.doesNotMatch(JSON.stringify(body.data.safe_next), /payment_ref|session_id|admin|should-not-pass/);
  });

  it("does not route dashboard entry to /member/dashboard from LIFF identity alone", async () => {
    const { body } = await identify(
      {
        line_user_id: "Uabc123",
        entry_route: "dashboard",
        t: "tok",
        membership_status: "active",
        payment_status: "paid",
        entitlement_level: "premium",
      },
      "https://mmdbkk.com/member/api/liff/identify",
    );

    assert.equal(body.ok, true);
    assert.equal(body.data.next_route, "/member/membership?t=tok");
    assert.equal(body.data.dashboard_unlock.unlocked, false);
    assert.equal(body.data.dashboard_unlock.holding_route, "/member/membership?t=tok");
    assert.equal(body.data.safe_next.dashboard, null);
    assert.doesNotMatch(JSON.stringify(body.data), /\/member\/dashboard/);
  });

  it("unlocks /member/dashboard only after first real job or session evidence exists", async () => {
    const { body } = await identify(
      {
        line_user_id: "Uabc123",
        entry_route: "dashboard",
        t: "tok",
        session_id: "sess_real_123",
        first_real_session_exists: true,
        session_status: "confirmed",
      },
      "https://mmdbkk.com/member/api/liff/identify",
    );

    assert.equal(body.ok, true);
    assert.equal(body.data.next_route, "/member/dashboard?t=tok");
    assert.equal(body.data.dashboard_unlock.unlocked, true);
    assert.equal(body.data.dashboard_unlock.holding_route, null);
    assert.equal(body.data.dashboard_unlock.reason, "first_real_job_or_session_exists");
    assert.equal(body.data.safe_next.dashboard, "/member/dashboard?t=tok");
  });

  it("requires line_user_id", async () => {
    const response = await worker.fetch(new Request("https://mmdbkk.com/member/api/liff/identify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entry_route: "public_membership" }),
    }));
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.ok, false);
    assert.equal(body.error.code, "LINE_USER_ID_REQUIRED");
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import worker from "../src/index.js";

function memberStatusResolver(data) {
  return {
    fetch: async () => new Response(JSON.stringify({ ok: true, data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  };
}

async function identify(payload, url = "https://mmdbkk.com/member/api/liff/identify?t=query-token&code=query-code&promo=query-promo", env = {}) {
  const response = await worker.fetch(new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }), env);
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
    assert.equal(body.data.intent, "public_membership");
    assert.equal(body.data.membership_state, "unknown");
    assert.equal(body.data.package_state, "unknown");
    assert.equal(body.data.rich_menu_target, "public_member");
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

  it("does not trust public body fields to unlock /member/dashboard", async () => {
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
    assert.equal(body.data.next_route, "/member/membership?t=tok");
    assert.equal(body.data.dashboard_unlock.unlocked, false);
    assert.equal(body.data.safe_next.dashboard, null);
  });

  it("unlocks /member/dashboard only after trusted first real job or session evidence exists", async () => {
    const { body } = await identify(
      {
        line_user_id: "Uabc123",
        entry_route: "dashboard",
        t: "tok",
      },
      "https://mmdbkk.com/member/api/liff/identify",
      {
        MEMBER_STATUS_RESOLVER: memberStatusResolver({
          membership_state: "active",
          package_state: "current",
          has_first_job: true,
          first_session_status: "confirmed",
        }),
      },
    );

    assert.equal(body.ok, true);
    assert.equal(body.data.next_route, "/member/dashboard?t=tok");
    assert.equal(body.data.dashboard_unlock.unlocked, true);
    assert.equal(body.data.dashboard_unlock.holding_route, null);
    assert.equal(body.data.dashboard_unlock.reason, "first_real_job_or_session_exists");
    assert.equal(body.data.safe_next.dashboard, "/member/dashboard?t=tok");
  });

  it("member_status active/current returns private rich menu target without dashboard before first job", async () => {
    const { body } = await identify(
      {
        line_user_id: "Uabc123",
        entry_route: "member_status",
        t: "tok",
      },
      "https://mmdbkk.com/member/api/liff/identify",
      {
        MEMBER_STATUS_RESOLVER: memberStatusResolver({
          membership_state: "active",
          package_state: "current",
          has_first_job: false,
        }),
      },
    );

    assert.equal(body.ok, true);
    assert.equal(body.data.intent, "member_status");
    assert.equal(body.data.membership_state, "active");
    assert.equal(body.data.package_state, "current");
    assert.equal(body.data.rich_menu_target, "private_member");
    assert.equal(body.data.next_route, "/member/profile?t=tok&status=active");
    assert.equal(body.data.safe_next.booking, "/sigil/booking?t=tok");
    assert.equal(body.data.safe_next.renewal, "/sigil/pay/renewal?t=tok");
    assert.equal(body.data.safe_next.dashboard, null);
  });

  it("member_status expired and renewal expired route to /sigil/pay/renewal", async () => {
    const env = {
      MEMBER_STATUS_RESOLVER: memberStatusResolver({
        membership_state: "expired",
        package_state: "expired",
      }),
    };

    const statusResult = await identify({ line_user_id: "Uabc123", entry_route: "member_status", t: "tok" }, "https://mmdbkk.com/member/api/liff/identify", env);
    const renewalResult = await identify({ line_user_id: "Uabc123", entry_route: "renewal", t: "tok" }, "https://mmdbkk.com/member/api/liff/identify", env);

    assert.equal(statusResult.body.data.membership_state, "expired");
    assert.equal(statusResult.body.data.rich_menu_target, "renewal_required");
    assert.equal(statusResult.body.data.next_route, "/sigil/pay/renewal?t=tok");
    assert.equal(renewalResult.body.data.intent, "renewal");
    assert.equal(renewalResult.body.data.next_route, "/sigil/pay/renewal?t=tok");
    assert.equal(renewalResult.body.data.safe_next.dashboard, null);
  });

  it("booking_request active/current routes to /sigil/booking and expired routes renewal", async () => {
    const active = await identify(
      { line_user_id: "Uabc123", entry_route: "booking_request", t: "tok" },
      "https://mmdbkk.com/member/api/liff/identify",
      {
        MEMBER_STATUS_RESOLVER: memberStatusResolver({
          membership_state: "active",
          package_state: "current",
        }),
      },
    );
    const expired = await identify(
      { line_user_id: "Uabc123", entry_route: "booking_request", t: "tok" },
      "https://mmdbkk.com/member/api/liff/identify",
      {
        MEMBER_STATUS_RESOLVER: memberStatusResolver({
          membership_state: "expired",
          package_state: "expired",
        }),
      },
    );

    assert.equal(active.body.data.intent, "booking_request");
    assert.equal(active.body.data.next_route, "/sigil/booking?t=tok");
    assert.equal(active.body.data.rich_menu_target, "private_member");
    assert.equal(active.body.data.safe_next.dashboard, null);
    assert.equal(expired.body.data.next_route, "/sigil/pay/renewal?t=tok");
    assert.equal(expired.body.data.rich_menu_target, "renewal_required");
  });

  it("no paid package keeps public member path and unknown never pretends active", async () => {
    const noPaid = await identify(
      { line_user_id: "Uabc123", entry_route: "booking_request", t: "tok" },
      "https://mmdbkk.com/member/api/liff/identify",
      {
        MEMBER_STATUS_RESOLVER: memberStatusResolver({
          membership_state: "no_paid_package",
          package_state: "none",
        }),
      },
    );
    const unknown = await identify(
      { line_user_id: "Uabc123", entry_route: "member_status", t: "tok" },
      "https://mmdbkk.com/member/api/liff/identify",
    );

    assert.equal(noPaid.body.data.membership_state, "no_paid_package");
    assert.equal(noPaid.body.data.package_state, "none");
    assert.equal(noPaid.body.data.rich_menu_target, "public_member");
    assert.equal(noPaid.body.data.next_route, "/member/membership?t=tok");
    assert.equal(noPaid.body.data.safe_next.booking, null);
    assert.equal(unknown.body.data.membership_state, "unknown");
    assert.equal(unknown.body.data.package_state, "unknown");
    assert.equal(unknown.body.data.rich_menu_target, "public_member");
    assert.equal(unknown.body.data.next_route, "/member/profile?t=tok&status=review_required");
    assert.equal(unknown.body.data.safe_next.dashboard, null);
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

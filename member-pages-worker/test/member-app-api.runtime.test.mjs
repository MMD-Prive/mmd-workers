import assert from "node:assert/strict";
import test from "node:test";

import { handleMemberAppApi, isMemberAppApiPath } from "../src/member-app-api.js";
import { identityRecoveryStateFromEvidence, readIdentityRecoveryState } from "../src/member-app-api-runtime.js";

function delegate(payloadByPath = {}, statusByPath = {}) {
  const calls = [];
  return {
    calls,
    async fetch(request) {
      const path = new URL(request.url).pathname;
      calls.push({ path, method: request.method, cookie: request.headers.get("cookie") });
      const payload = payloadByPath[path] ?? { ok: false };
      return Response.json(payload, {
        status: statusByPath[path] || 200,
        headers: {
          "set-cookie": "__Host-mmd_liff_session=rotated; Secure; HttpOnly; Path=/; SameSite=Strict",
          "x-mmd-worker": "member-pages-worker",
        },
      });
    },
  };
}

function request(path, method = "GET") {
  return new Request(`https://mmdbkk.com${path}`, {
    method,
    headers: {
      origin: "https://mmdbkk.com",
      cookie: "__Host-mmd_liff_session=current",
      accept: "application/json",
    },
  });
}

test("recognizes only the bounded My MMD app routes", () => {
  for (const path of ["dashboard", "profile", "membership", "points", "coupons", "history", "care"]) {
    assert.equal(isMemberAppApiPath(`https://mmdbkk.com/api/member/app/${path}`), true, path);
  }
  assert.equal(isMemberAppApiPath("https://mmdbkk.com/api/member/app/admin"), false);
  assert.equal(isMemberAppApiPath("https://mmdbkk.com/api/member/dashboard"), false);
});

test("identity recovery manual form is unlocked only by exact server-owned not-found review evidence", () => {
  const session = { lineUserId: `U${"a".repeat(32)}`, memberExists: false, identityRecoveryState: null };

  assert.equal(identityRecoveryStateFromEvidence(session, null), "auto_resolving");
  assert.equal(identityRecoveryStateFromEvidence({ ...session, memberExists: true }, null), "linked");

  assert.equal(identityRecoveryStateFromEvidence(session, {
    fields: {
      status: "review_required",
      match_type: "not_found",
      source_path: "membership_payment_e2e_first_real_payment_acceptance",
    },
  }), "manual_required");

  assert.equal(identityRecoveryStateFromEvidence(session, {
    fields: {
      status: "review_required",
      match_type: "not_found",
      source_path: "/member/api/liff/recovery",
    },
  }), "review_required");

  assert.equal(identityRecoveryStateFromEvidence({
    ...session,
    identityRecoveryState: "known_identity",
  }, null), "review_required");

  assert.equal(identityRecoveryStateFromEvidence(session, {
    fields: {
      status: "applied",
      match_type: "exact_member_email",
      source_path: "/member/api/liff/recovery",
    },
  }), "linked");
});

test("identity recovery projection queries review evidence by the exact server LINE session only", async () => {
  const lineUserId = `U${"b".repeat(32)}`;
  const requests = [];
  const env = {
    AIRTABLE_API_KEY: "test-key",
    AIRTABLE_BASE_ID: "appTestIdentity01",
    AIRTABLE_HTTP: {
      async fetch(request) {
        requests.push(new URL(request.url));
        return Response.json({
          records: [{
            id: "recReviewABC12345",
            fields: {
              status: "review_required",
              match_type: "not_found",
              source_path: "membership_payment_e2e_first_real_payment_acceptance",
            },
          }],
        });
      },
    },
  };

  const state = await readIdentityRecoveryState(env, {
    lineUserId,
    memberExists: false,
    identityRecoveryState: null,
  });

  assert.equal(state, "manual_required");
  assert.equal(requests.length, 1);
  assert.match(requests[0].searchParams.get("filterByFormula") || "", /line_user_id/);
  assert.match(requests[0].searchParams.get("filterByFormula") || "", new RegExp(lineUserId));
  assert.equal(requests[0].searchParams.get("sort[0][field]"), "created_at");
  assert.equal(requests[0].searchParams.get("sort[0][direction]"), "desc");
});

test("identity recovery projection fails closed when canonical review storage is unavailable", async () => {
  const lineUserId = `U${"c".repeat(32)}`;
  const state = await readIdentityRecoveryState({
    AIRTABLE_API_KEY: "test-key",
    AIRTABLE_BASE_ID: "appTestIdentity02",
    AIRTABLE_HTTP: { async fetch() { throw new Error("synthetic_unavailable"); } },
  }, {
    lineUserId,
    memberExists: false,
    identityRecoveryState: null,
  });
  assert.equal(state, "auto_resolving");
});

test("coupon artwork variants require verified backend tiers and do not grant membership access", async () => {
  for (const [value, variant] of [["Public Member", "public"], ["VIP", "vip"], ["SVIP", "svip"], ["Black Card", "black_card"], ["Elite", "elite"], ["Red Card", "red_card"], ["Standard", "standard"], ["Premium", null]]) {
    for (const status of ["verified", "unresolved"]) {
      const upstream = delegate({ "/api/member/dashboard": { ok: true, data: { member: { tier: { value, status } } } } });
      const response = await handleMemberAppApi(request("/api/member/app/dashboard"), {}, upstream);
      const payload = await response.json();
      assert.equal(payload.membership.couponCardVariant, status === "verified" ? variant : null);
      assert.equal(payload.membership.couponCardVerified, status === "verified" && Boolean(variant));
      assert.equal(payload.membership.access, "checking");
    }
  }
});

test("Coupons exposes a backend Wish requirement without an approved discount", async () => {
  const upstream = delegate({ "/member/api/liff/care-back/wallet": { ok: true, wallet: { status: "wish_required" } } });
  const response = await handleMemberAppApi(request("/api/member/app/coupons"), {}, upstream);
  const [coupon] = await response.json();
  assert.equal(coupon.wishRequired, true);
  assert.equal(coupon.approvedDiscountPercent, null);
  assert.equal(coupon.state, "checking");
});

test("dashboard adapter preserves verified display facts but never infers actual access", async () => {
  const upstream = delegate({
    "/api/member/dashboard": {
      ok: true,
      data: {
        dashboard_state: "ready",
        member: {
          display_name: "คุณเปอร์",
          tier: { value: "Premium", status: "verified", source: "member_profile_resolver" },
          membership_status: { value: "active", status: "verified", source: "member_profile_resolver" },
        },
        points: { value: 125, status: "verified", source: "points_ledger", records_count: 2 },
        history: { status: "verified", events: [] },
        payment_history: { status: "empty", records: [] },
      },
    },
  });

  const response = await handleMemberAppApi(request("/api/member/app/dashboard"), {}, upstream);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.greetingName, "คุณเปอร์");
  assert.equal(payload.identity.displayName, "คุณเปอร์");
  assert.equal(payload.membership.level, "premium");
  assert.equal(payload.membership.levelVerified, true);
  assert.equal(payload.membership.status, "active");
  assert.equal(payload.membership.access, "checking");
  assert.equal(payload.membership.renewalDueAt, null);
  assert.equal(payload.points.confirmedBalance, 125);
  assert.equal(payload.points.earnedTotal, null);
  assert.match(response.headers.get("set-cookie") || "", /rotated/);
  assert.equal(response.headers.get("x-mmd-member-app-api"), "v1");
  assert.deepEqual(upstream.calls, [{
    path: "/api/member/dashboard",
    method: "GET",
    cookie: "__Host-mmd_liff_session=current",
  }]);
});

test("profile adapter exposes only explicitly safe masked contact fields", async () => {
  const upstream = delegate({
    "/member/api/liff/profile": {
      ok: true,
      data: {
        display_name: "คุณหนุ่ย",
        line_display_name: "Nui",
        email_masked: "n•••@example.com",
        email_verified: true,
        email_safe_to_display: true,
        phone_masked: "09x-xxx-5296",
        phone_verified: true,
        phone_safe_to_display: false,
        member_since: "2024-02-04",
      },
    },
  });

  const response = await handleMemberAppApi(request("/api/member/app/profile"), {}, upstream);
  const payload = await response.json();

  assert.equal(payload.displayName, "คุณหนุ่ย");
  assert.equal(payload.lineDisplayName, "Nui");
  assert.equal(payload.emailMasked, "n•••@example.com");
  assert.equal(payload.emailSafeToDisplay, true);
  assert.equal(payload.phoneMasked, "09x-xxx-5296");
  assert.equal(payload.phoneSafeToDisplay, false);
  assert.equal(payload.primaryChannel, "line");
  assert.equal(payload.avatarUrl, null);
});

test("points and history adapt only bounded customer-safe dashboard evidence", async () => {
  const dashboardPayload = {
    ok: true,
    data: {
      member: {
        tier: { value: "Standard", status: "verified" },
        membership_status: { value: "active", status: "verified" },
      },
      points: { value: 40, status: "verified", records_count: 1 },
      history: {
        status: "verified",
        events: [
          { type: "points", date: "2026-08-09", title: "Points added", status: "posted", points_delta: 25 },
          { type: "service", date: "2026-08-10", title: "Dinner", status: "completed", internal_note: "must-not-pass" },
        ],
      },
      payment_history: {
        status: "verified_history",
        records: [{ date: "2026-08-01", title: "Membership payment", status: "verified", payment_ref: "must-not-pass" }],
      },
    },
  };
  const pointsUpstream = delegate({ "/api/member/dashboard": dashboardPayload });
  const pointsResponse = await handleMemberAppApi(request("/api/member/app/points"), {}, pointsUpstream);
  const points = await pointsResponse.json();
  assert.equal(points.summary.confirmedBalance, 40);
  assert.equal(points.ledger.length, 1);
  assert.equal(points.ledger[0].delta, 25);

  const historyUpstream = delegate({ "/api/member/dashboard": dashboardPayload });
  const historyResponse = await handleMemberAppApi(request("/api/member/app/history"), {}, historyUpstream);
  const history = await historyResponse.json();
  assert.equal(history.length, 2);
  assert.equal(history[0].kind, "booking");
  assert.equal(history[1].kind, "payment");
  assert.doesNotMatch(JSON.stringify(history), /internal_note|payment_ref|must-not-pass/);
});

test("coupon adapter never promotes legacy fixed discount_percent into approvedDiscountPercent", async () => {
  const upstream = delegate({
    "/member/api/liff/care-back/wallet": {
      ok: true,
      data: {
        status: "ready",
        code: "ABC234",
        discount_percent: 10,
        benefit_value: 10,
        expires_at: "2026-10-31T00:00:00.000Z",
      },
    },
  });

  const response = await handleMemberAppApi(request("/api/member/app/coupons"), {}, upstream);
  const coupons = await response.json();

  assert.equal(coupons.length, 1);
  assert.equal(coupons[0].state, "issued");
  assert.equal(coupons[0].reference, "ABC234");
  assert.equal(coupons[0].approvedDiscountPercent, null);
});

test("coupon adapter exposes the actual rate only from approved_discount_percent", async () => {
  const upstream = delegate({
    "/member/api/liff/care-back/wallet": {
      ok: true,
      data: {
        status: "active",
        code: "ABC234",
        discount_percent: 10,
        approved_discount_percent: 7,
      },
    },
  });

  const response = await handleMemberAppApi(request("/api/member/app/coupons"), {}, upstream);
  const coupons = await response.json();
  assert.equal(coupons[0].approvedDiscountPercent, 7);
});

test("CARE completed does not become approved until canonical approved_discount_percent exists", async () => {
  const pending = delegate({
    "/member/api/liff/care-back/state": {
      ok: true,
      state: "completed",
      final_display: { message: "บันทึก Wish แล้ว" },
    },
  });
  const pendingResponse = await handleMemberAppApi(request("/api/member/app/care"), {}, pending);
  const pendingPayload = await pendingResponse.json();
  assert.equal(pendingPayload.stage, "wish_saved");
  assert.equal(pendingPayload.approvedDiscountPercent, null);

  const approved = delegate({
    "/member/api/liff/care-back/state": {
      ok: true,
      state: "completed",
      approved_discount_percent: 6,
    },
  });
  const approvedResponse = await handleMemberAppApi(request("/api/member/app/care"), {}, approved);
  const approvedPayload = await approvedResponse.json();
  assert.equal(approvedPayload.stage, "approved");
  assert.equal(approvedPayload.approvedDiscountPercent, 6);
});

test("app API is read-only", async () => {
  const response = await handleMemberAppApi(request("/api/member/app/profile", "POST"), {}, delegate());
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET");
});


test("dedicated points ledger survives a mixed activity feed containing no points", async () => {
  const upstream = delegate({ "/api/member/dashboard": { ok: true, data: {
    points: { status: "verified", value: 12, records_count: 2, history: [
      { date: "2026-09-10", title: "Points added", points_delta: 15, status: "posted" },
      { date: "2026-09-09", title: "Points adjusted", points_delta: -3, status: "pending_review" },
    ] }, history: { status: "verified", events: [] }, payment_history: { status: "empty", records: [] },
  } } });
  const body = await (await handleMemberAppApi(request("/api/member/app/points"), {}, upstream)).json();
  assert.equal(body.state, "resolved");
  assert.equal(body.summary.confirmedBalance, 12);
  assert.deepEqual(body.ledger.map(x => [x.delta, x.state]), [[15, "confirmed"], [-3, "pending"]]);
});

test("unknown history stays checking while explicitly empty verified history is resolved", async () => {
  for (const verified of [false, true]) {
    const upstream = delegate({ "/api/member/dashboard": { ok: true, data: {
      history: { status: verified ? "empty" : "checking", events: [] },
      payment_history: { status: verified ? "empty" : "checking", records: [] },
    } } });
    const body = await (await handleMemberAppApi(request("/api/member/app/history"), {}, upstream)).json();
    assert.equal(body.state, verified ? "resolved" : "checking");
    assert.deepEqual(body.items, []);
  }
});

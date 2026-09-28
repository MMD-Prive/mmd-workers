import test from "node:test";
import assert from "node:assert/strict";
import {
  displayNameFromRenamedName,
  overlayFastTrustProfile,
  notifyImpossibleGuestAlert,
  resolveLineOaFastTrust,
  trustedTierFromRenamedName,
} from "../src/my-mmd-line-identity-bridge.js";

const LINE_ID = `U${"a".repeat(32)}`;

function envFor(records) {
  return {
    AIRTABLE_API_KEY: "test",
    AIRTABLE_BASE_ID: "appTest",
    AIRTABLE_HTTP: {
      async fetch(request) {
        const url = new URL(request.url);
        assert.equal(decodeURIComponent(url.pathname.split("/").pop()), "MMD — LINE OFC Client Import Staging");
        assert.equal(url.searchParams.get("filterByFormula"), `{LINE User ID}='${LINE_ID}'`);
        return Response.json({ records });
      },
    },
  };
}

test("only terminal MMD renamed-name markers map to Fast Trust tiers", () => {
  assert.equal(trustedTierFromRenamedName("แมค VIP"), "vip");
  assert.equal(trustedTierFromRenamedName("โจ SVIP"), "svip");
  assert.equal(trustedTierFromRenamedName("คิว - SVIP -"), "svip");
  assert.equal(trustedTierFromRenamedName("โป้ Black Card"), "black_card");
  assert.equal(trustedTierFromRenamedName("โป้ BlackCard"), "black_card");
  assert.equal(trustedTierFromRenamedName("VIP แมค"), null);
  assert.equal(trustedTierFromRenamedName("แมค Premium"), null);
  assert.equal(trustedTierFromRenamedName("แมค SVIP note"), null);
});

test("display name strips only the trusted terminal marker", () => {
  assert.equal(displayNameFromRenamedName("โจ SVIP"), "โจ");
  assert.equal(displayNameFromRenamedName("โป้ - BlackCard"), "โป้");
  assert.equal(displayNameFromRenamedName("คิว - SVIP -"), "คิว");
});

test("exact canonical LINE staging lookup resolves a trusted SVIP marker with trailing separators", async () => {
  const result = await resolveLineOaFastTrust(envFor([
    { id: "recFastTrust01", fields: { "LINE User ID": LINE_ID, "Current LINE Rename": "สมาชิกทดสอบ - SVIP -" } },
  ]), LINE_ID);
  assert.equal(result.tier, "svip");
  assert.equal(result.label, "SVIP");
  assert.equal(result.displayName, "สมาชิกทดสอบ");
  assert.equal(result.source, "line_oa_renamed_name_fast_trust");
  assert.match(result.membershipExpiresAt, /^\d{4}-\d{2}-\d{2}$/);
});

test("strongest MMD-authored trusted marker wins across retained rename history", async () => {
  const result = await resolveLineOaFastTrust(envFor([
    { id: "recFastTrust01", fields: { "LINE User ID": LINE_ID, "Current LINE Rename": "ลูกค้า VIP" } },
    { id: "recFastTrust02", fields: { "LINE User ID": LINE_ID, "Current LINE Rename": "ลูกค้า Black Card" } },
  ]), LINE_ID);
  assert.equal(result.tier, "black_card");
});

test("Fast Trust overlay activates tier but does not fabricate history or points", () => {
  const profile = overlayFastTrustProfile(null, {
    label: "SVIP",
    displayName: "โจ",
    memberId: "fasttrust_test",
  });
  assert.equal(profile.tier, "SVIP");
  assert.equal(profile.membership_status, "active");
  assert.equal(profile.tier_source, "line_oa_renamed_name_fast_trust");
  assert.equal(profile.points, null);
  assert.equal(profile.points_records_count, null);
  assert.deepEqual(profile.history, []);
});


test("Fast Trust preserves explicit restrictions and unresolved null Points", () => {
  for (const membership_status of ["blocked", "suspended", "revoked", "expired", "pending_review"]) {
    const profile = { membership_status, tier: "Premium", points: 14, points_records_count: 1 };
    assert.deepEqual(overlayFastTrustProfile(profile, { label: "SVIP" }), profile);
  }
  const unknown = overlayFastTrustProfile({ points: null, points_records_count: null }, { label: "VIP" });
  assert.equal(unknown.points, null);
  assert.equal(unknown.points_records_count, null);
});


test("impossible Guest alert uses the configured HYPE route without customer identity", async () => {
  let captured = null;
  const env = {
    AUTH_SERVICE_AUTH_TO_TELEGRAM: "internal-secret",
    MY_MMD_ALERT_CHAT_ID: "-1003546439681",
    MY_MMD_ALERT_THREAD_ID: "21",
    TELEGRAM_ACCESS_RECONCILER: {
      async fetch(request) {
        assert.equal(request.headers.get("authorization"), "Bearer internal-secret");
        captured = await request.json();
        return Response.json({ ok: true, telegram: { ok: true } });
      },
    },
  };

  const result = await notifyImpossibleGuestAlert(env, {
    route: "/__internal/member-status/resolve",
    tier: "svip",
    reason: "trusted_line_oa_renamed_name",
  });

  assert.equal(result.ok, true);
  assert.equal(captured.flow, "my_mmd_resolution_alert");
  assert.equal(captured.chat_id, "-1003546439681");
  assert.equal(captured.message_thread_id, 21);
  assert.match(captured.text, /impossible Guest state prevented/);
  assert.doesNotMatch(captured.text, /U[a-f0-9]{32}/i);
});

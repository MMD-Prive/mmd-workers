import test from "node:test";
import assert from "node:assert/strict";
import {
  displayNameFromRenamedName,
  overlayFastTrustProfile,
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
        assert.match(url.searchParams.get("filterByFormula") || "", /line_user_id/);
        return Response.json({ records });
      },
    },
  };
}

test("only terminal MMD renamed-name markers map to Fast Trust tiers", () => {
  assert.equal(trustedTierFromRenamedName("แมค VIP"), "vip");
  assert.equal(trustedTierFromRenamedName("โจ SVIP"), "svip");
  assert.equal(trustedTierFromRenamedName("โป้ Black Card"), "black_card");
  assert.equal(trustedTierFromRenamedName("โป้ BlackCard"), "black_card");
  assert.equal(trustedTierFromRenamedName("VIP แมค"), null);
  assert.equal(trustedTierFromRenamedName("แมค Premium"), null);
  assert.equal(trustedTierFromRenamedName("แมค SVIP note"), null);
});

test("display name strips only the trusted terminal marker", () => {
  assert.equal(displayNameFromRenamedName("โจ SVIP"), "โจ");
  assert.equal(displayNameFromRenamedName("โป้ - BlackCard"), "โป้");
});

test("exact LINE staging lookup resolves a trusted SVIP marker", async () => {
  const result = await resolveLineOaFastTrust(envFor([
    { id: "recFastTrust01", fields: { line_user_id: LINE_ID, line_renamed_name: "โจ SVIP" } },
  ]), LINE_ID);
  assert.equal(result.tier, "svip");
  assert.equal(result.label, "SVIP");
  assert.equal(result.displayName, "โจ");
  assert.equal(result.source, "line_oa_renamed_name_fast_trust");
});

test("strongest MMD-authored trusted marker wins across retained rename history", async () => {
  const result = await resolveLineOaFastTrust(envFor([
    { id: "recFastTrust01", fields: { line_user_id: LINE_ID, line_renamed_name: "ลูกค้า VIP" } },
    { id: "recFastTrust02", fields: { line_user_id: LINE_ID, line_renamed_name: "ลูกค้า Black Card" } },
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

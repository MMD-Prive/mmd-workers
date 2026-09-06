import test from "node:test";
import assert from "node:assert/strict";
import { buildFastTrustEntitlement, hasExplicitHardStop } from "../src/my-mmd-fast-trust-entitlement.js";
import { readEntitlementSnapshot } from "../src/my-mmd-runtime-index.js";

const LINE_ID = `U${"c".repeat(32)}`;

function envWith({ entitlementRecords = [], stagingRecords = [] } = {}) {
  return {
    AIRTABLE_API_KEY: "test",
    AIRTABLE_BASE_ID: "appTest",
    AIRTABLE_TABLE_MEMBER_ENTITLEMENTS: "MMD — Member Entitlements",
    AIRTABLE_TABLE_LINE_OFC_STAGING: "LINE OFC Client Import Staging",
    AIRTABLE_HTTP: {
      async fetch(request) {
        const url = new URL(request.url);
        const table = decodeURIComponent(url.pathname.split("/").pop());
        if (table === "MMD — Member Entitlements") return Response.json({ records: entitlementRecords });
        if (table === "LINE OFC Client Import Staging") return Response.json({ records: stagingRecords });
        return Response.json({ records: [] });
      },
    },
  };
}

test("Fast Trust SVIP becomes an active protected entitlement in my_mmd_entitlement_resolver_v1", async () => {
  const env = envWith({
    stagingRecords: [{ id: "recFast", fields: { line_user_id: LINE_ID, line_renamed_name: "โจ SVIP" } }],
  });
  const snapshot = await readEntitlementSnapshot(env, { line_user_id: LINE_ID });
  assert.equal(snapshot.schema_version, "my_mmd_entitlement_resolver_v1");
  assert.equal(snapshot.source_status, "verified");
  assert.equal(snapshot.fast_trust.active, true);
  assert.equal(snapshot.fast_trust.tier, "svip");
  assert.deepEqual(snapshot.capability_state.active, ["svip"]);
  assert.equal(snapshot.access.private_visibility_envelope, "svip");
  assert.equal(snapshot.access.public_service_access, true);
  assert.equal(snapshot.access.new_model_reveals_allowed, true);
  assert.equal(snapshot.access.new_protected_grants_allowed, true);
  assert.equal(snapshot.access.new_drive_grants_allowed, true);
  assert.equal(snapshot.access.new_telegram_grants_allowed, true);
});

test("VIP and Black Card synthesize the expected canonical capabilities", async () => {
  for (const [renamed, expected] of [["แมค VIP", "vip"], ["โป้ BlackCard", "black_card"]]) {
    const entitlement = await buildFastTrustEntitlement(
      {},
      LINE_ID,
      async () => [{ id: "recFast", fields: { line_user_id: LINE_ID, line_renamed_name: renamed } }],
      [],
    );
    assert.equal(entitlement.fields.capability, expected);
    assert.equal(entitlement.fields.member_lifecycle_status, "active");
    assert.equal(entitlement.fields.access_status, "active");
    assert.equal(entitlement.fields.source, "line_oa_renamed_name_fast_trust");
  }
});

test("explicit blocked, suspended or revoked canonical state stops Fast Trust", async () => {
  for (const state of ["blocked", "suspended", "revoked"]) {
    const canonical = [{ id: `rec-${state}`, fields: { capability: "vip", member_lifecycle_status: state, access_status: state } }];
    assert.equal(hasExplicitHardStop(canonical), true);
    let queried = false;
    const entitlement = await buildFastTrustEntitlement({}, LINE_ID, async () => {
      queried = true;
      return [{ fields: { line_user_id: LINE_ID, line_renamed_name: "โจ SVIP" } }];
    }, canonical);
    assert.equal(entitlement, null);
    assert.equal(queried, false);
  }
});

test("blocked canonical entitlement remains fail-closed even when LINE OA has a trusted marker", async () => {
  const env = envWith({
    entitlementRecords: [{
      id: "recBlocked",
      fields: { capability: "vip", member_lifecycle_status: "blocked", access_status: "blocked", line_user_id: LINE_ID },
    }],
    stagingRecords: [{ id: "recFast", fields: { line_user_id: LINE_ID, line_renamed_name: "โจ SVIP" } }],
  });
  const snapshot = await readEntitlementSnapshot(env, { line_user_id: LINE_ID });
  assert.equal(snapshot.member_blocked, true);
  assert.equal(snapshot.fast_trust, null);
  assert.deepEqual(snapshot.capability_state.active, []);
  assert.equal(snapshot.access.private_visibility_envelope, "none");
  assert.equal(snapshot.access.new_protected_grants_allowed, false);
});

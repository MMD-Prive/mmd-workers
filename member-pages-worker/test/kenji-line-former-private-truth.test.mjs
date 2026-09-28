import assert from "node:assert/strict";
import test from "node:test";
import { projectKenjiLineMemberTruth } from "../src/kenji-line-member-truth.js";

test("verified Public membership keeps expired Premium visible as separate history", () => {
  const snapshot = {
    schema_version: "my_mmd_entitlement_resolver_v1", source_status: "verified", fail_closed: true,
    evaluated_at: "2026-09-24T12:00:00.000Z", member_blocked: false,
    capability_state: { active: ["public_member"], grace: [], inactive: ["private_premium"], recognized: ["public_member", "private_premium"] },
    access: { public_service_access: true, private_visibility_envelope: "none" },
    entitlements: [
      { capability: "public_member", lifecycle: "active", expire_at: "2027-09-01" },
      { capability: "private_premium", lifecycle: "expired", expire_at: "2026-09-01" },
    ],
  };
  const truth = projectKenjiLineMemberTruth({ snapshot });
  assert.equal(truth.membership.label, "Public Member");
  assert.deepEqual(truth.former_private_membership, {
    level: "private_premium", label: "Premium", lifecycle: "expired", expire_at: "2026-09-01",
  });
  snapshot.member_blocked = true;
  assert.equal(projectKenjiLineMemberTruth({ snapshot }).former_private_membership, null);
});

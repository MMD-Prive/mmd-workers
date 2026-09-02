import test from "node:test";
import assert from "node:assert/strict";
import { isDriveBootstrapCandidate, tryDriveMemberBootstrap } from "../src/drive-member-bootstrap-cutover.js";

const request = new Request("https://mmdbkk.com/member/api/liff/start", { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
const payload = { ok: true, data: { member_resolved: false, pending_identity: true } };

test("Drive is not a membership source by default", async () => {
  assert.equal(isDriveBootstrapCandidate(request, payload, {}), false);
  const result = await tryDriveMemberBootstrap(request.clone(), {});
  assert.deepEqual(result, { mapped: false, reason: "drive_membership_source_disabled" });
});

test("legacy Drive bootstrap requires explicit emergency flag", () => {
  assert.equal(isDriveBootstrapCandidate(request, payload, { DRIVE_LEGACY_MEMBERSHIP_BOOTSTRAP_ENABLED: "true" }), true);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  HYPE_SVIP_PHOTO_REVEAL_POLICY,
  evaluateSvipPhotoProfile,
} from "./src/hype-svip-photo-reveal.js";

test("SVIP exact-customer photo policy only accepts active approved photo lanes", () => {
  assert.equal(HYPE_SVIP_PHOTO_REVEAL_POLICY, "svip_exact_customer_photo_reveal_v1_20260930");

  const allowed = evaluateSvipPhotoProfile({
    fields: {
      status: "Active",
      allowed_customer_scope: ["VIP", "SVIP", "Black Card"],
      photo_visibility_policy: "VIP/SVIP/Black Card only",
    },
  });
  assert.equal(allowed.ok, true);

  const allActive = evaluateSvipPhotoProfile({
    fields: {
      status: "Active",
      allowed_customer_scope: ["All Active Members"],
      photo_visibility_policy: "Active eligible only",
    },
  });
  assert.equal(allActive.ok, true);
});

test("photo policy remains fail-closed for Per review, No photo and missing SVIP scope", () => {
  for (const [photo_visibility_policy, allowed_customer_scope, reason] of [
    ["Per review", ["SVIP"], "photo_policy_per_review"],
    ["No photo", ["SVIP"], "photo_policy_no_photo"],
    ["VIP/SVIP/Black Card only", ["VIP"], "photo_scope_excludes_svip"],
  ]) {
    const result = evaluateSvipPhotoProfile({
      fields: { status: "Active", photo_visibility_policy, allowed_customer_scope },
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, reason);
  }
});

test("inactive or unknown photo policy never auto-reveals", () => {
  assert.equal(evaluateSvipPhotoProfile({
    fields: {
      status: "Review",
      allowed_customer_scope: ["SVIP"],
      photo_visibility_policy: "VIP/SVIP/Black Card only",
    },
  }).ok, false);

  assert.equal(evaluateSvipPhotoProfile({
    fields: {
      status: "Active",
      allowed_customer_scope: ["SVIP"],
      photo_visibility_policy: "Legacy unrestricted",
    },
  }).reason, "photo_policy_unknown");
});

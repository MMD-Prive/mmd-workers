import assert from "node:assert/strict";
import test from "node:test";

import {
  HYPE_SVIP_PHOTO_REVEAL_POLICY,
  evaluateSvipPhotoProfile,
  photoGrantAuditContext,
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


test("issuance audit binds exact client, model, media, event and reason", () => {
  const audit = photoGrantAuditContext({
    clientId: "recClient",
    modelId: "recModel",
    mediaRecordId: "recMedia",
    eventRef: "msg-123",
    requestedModelRef: "EMs11",
    issuedAt: "2026-09-30T08:00:00.000Z",
  });
  assert.deepEqual(audit, {
    authorization_basis: "active_svip_exact_customer_photo_reveal",
    policy_version: HYPE_SVIP_PHOTO_REVEAL_POLICY,
    issue_reason: "svip_exact_customer_requested_approved_photo_set",
    issued_at: "2026-09-30T08:00:00.000Z",
    issued_by: "hype:svip_exact_customer_photo_reveal",
    customer_binding: "exact_canonical_line_client",
    client_record_id: "recClient",
    model_record_id: "recModel",
    media_record_id: "recMedia",
    requested_model_ref: "EMs11",
    event_ref: "msg-123",
  });
});

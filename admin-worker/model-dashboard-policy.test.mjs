import test from "node:test";
import assert from "node:assert/strict";
import {
  modelMediaPolicy,
  normalizeEtaMinutes,
  normalizeModelProfilePatch,
} from "./src/model-liff-worker.js";

test("public profile/gallery media is model self-managed", () => {
  for (const media_type of ["profile_photo", "public_gallery", "intro_video"]) {
    assert.deepEqual(modelMediaPolicy({ media_type }), {
      self_managed: true,
      requires_per_approval: false,
      policy: "model_self_managed_public",
    });
  }
});

test("private and flash media always requires Per approval", () => {
  for (const media_type of ["private_gallery", "flash_preview", "unknown_private_media"]) {
    const policy = modelMediaPolicy({ media_type });
    assert.equal(policy.self_managed, false);
    assert.equal(policy.requires_per_approval, true);
    assert.equal(policy.policy, "per_approved_private");
  }
});

test("legacy private_pending_review does not re-lock public profile/gallery after policy change", () => {
  const policy = modelMediaPolicy({
    media_type: "profile_photo",
    media_visibility: "private_pending_review",
    asset_role: "profile_candidate",
  });
  assert.equal(policy.self_managed, true);
  assert.equal(policy.requires_per_approval, false);
});

test("model profile writes allow Thai and English only", () => {
  assert.deepEqual(normalizeModelProfilePatch({ languages: ["thai", "english"] }), {
    ok: true,
    patch: { languages: ["thai", "english"] },
    errors: [],
  });
  const invalid = normalizeModelProfilePatch({ languages: ["thai", "chinese"] });
  assert.equal(invalid.ok, false);
  assert.deepEqual(invalid.errors, ["languages_invalid"]);
});

test("ETA accepts whole minutes 1 through 240 only", () => {
  assert.equal(normalizeEtaMinutes(1), 1);
  assert.equal(normalizeEtaMinutes(30), 30);
  assert.equal(normalizeEtaMinutes(240), 240);
  assert.equal(normalizeEtaMinutes(0), 0);
  assert.equal(normalizeEtaMinutes(241), 0);
  assert.equal(normalizeEtaMinutes(10.5), 0);
});

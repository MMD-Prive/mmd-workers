import test from "node:test";
import assert from "node:assert/strict";
import {
  chooseIdentityCandidate,
  modelMediaPolicy,
  normalizeEtaMinutes,
  normalizeModelIdentityName,
  normalizeModelProfilePatch,
} from "./src/model-liff-worker.js";
import {
  activationLiffUrl,
  isCanonicalLineUserId,
  normalizeActivationEnvironment,
  normalizeActivationTtlSeconds,
  validateActivationPayload,
} from "./src/model-first-time-activation.js";
import {
  modelGpsVisibilityContract,
  normalizeModelGpsVisibilityPatch,
} from "./src/model-gps-visibility.js";

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

test("identity-first normalizer stays exact after harmless punctuation and spacing", () => {
  assert.equal(normalizeModelIdentityName("  Mek  "), "mek");
  assert.equal(normalizeModelIdentityName("Nhum-K"), "nhum k");
  assert.equal(normalizeModelIdentityName("K. หนุ่ม"), "k หนุ่ม");
});

test("identity-first auto-binds Mek only with one exact candidate plus trusted job evidence", () => {
  const decision = chooseIdentityCandidate("Mek", [{
    record: { id: "recBKaHfxUKs8fkMV" },
    aliases: ["Mek", "mdl_private_premium_vip_straight_top_mek"],
    has_active_session: true,
    has_source_evidence: false,
    has_r2_evidence: false,
  }]);
  assert.equal(decision.action, "bind");
  assert.equal(decision.candidate.record.id, "recBKaHfxUKs8fkMV");
});

test("identity-first auto-binds Nhum K only when exact canonical name has source evidence", () => {
  const decision = chooseIdentityCandidate("Nhum K", [{
    record: { id: "recyUWnO9AlW2Q6co" },
    aliases: ["Nhum K", "mdl_pub_trv_nhum"],
    has_active_session: false,
    has_source_evidence: true,
    has_r2_evidence: false,
  }]);
  assert.equal(decision.action, "bind");
  assert.equal(decision.candidate.record.id, "recyUWnO9AlW2Q6co");
});

test("identity-first never auto-binds ambiguous or unsupported name matches", () => {
  const ambiguous = chooseIdentityCandidate("Mek", [
    { record: { id: "rec1" }, aliases: ["Mek"], has_active_session: true },
    { record: { id: "rec2" }, aliases: ["Mek"], has_source_evidence: true },
  ]);
  assert.equal(ambiguous.action, "review");
  assert.equal(ambiguous.reason, "identity_candidate_ambiguous");

  const unsupported = chooseIdentityCandidate("Mek", [
    { record: { id: "rec1" }, aliases: ["Mek"], has_active_session: false, has_source_evidence: false, has_r2_evidence: false },
  ]);
  assert.equal(unsupported.action, "review");
  assert.equal(unsupported.reason, "identity_supporting_evidence_required");
});

test("first-time activation accepts only canonical LINE user subjects", () => {
  assert.equal(isCanonicalLineUserId(`U${"a".repeat(32)}`), true);
  assert.equal(isCanonicalLineUserId(`u${"F".repeat(32)}`), true);
  assert.equal(isCanonicalLineUserId("@modelhandle"), false);
  assert.equal(isCanonicalLineUserId("U123"), false);
});

test("first-time activation TTL defaults to 24h and caps at 72h", () => {
  assert.equal(normalizeActivationTtlSeconds(undefined), 24 * 60 * 60);
  assert.equal(normalizeActivationTtlSeconds(30), 60 * 60);
  assert.equal(normalizeActivationTtlSeconds(2 * 60 * 60), 2 * 60 * 60);
  assert.equal(normalizeActivationTtlSeconds(100 * 60 * 60), 72 * 60 * 60);
});

test("activation token payload is model-bound, short-lived, and environment-normalized", () => {
  const now = 1_800_000_000;
  const valid = validateActivationPayload({
    version: 1,
    kind: "model_activation_v1",
    model_record_id: "rec12345678901234",
    jti: "invite-1",
    environment: "dev",
    iat: now,
    exp: now + 24 * 60 * 60,
  }, now);
  assert.equal(valid.ok, true);
  assert.equal(valid.payload.environment, "developing");

  const expired = validateActivationPayload({
    version: 1,
    kind: "model_activation_v1",
    model_record_id: "rec12345678901234",
    jti: "invite-2",
    environment: "published",
    iat: now - 100,
    exp: now - 1,
  }, now);
  assert.deepEqual(expired, { ok: false, error: "activation_token_expired" });
});

test("activation LIFF URL targets the canonical published Model Mini App", () => {
  assert.equal(normalizeActivationEnvironment("production"), "published");
  const url = new URL(activationLiffUrl("signed.token", "published"));
  assert.equal(url.origin, "https://miniapp.line.me");
  assert.equal(url.pathname, "/2010864854-N34SgCqq");
  assert.equal(url.searchParams.get("activation"), "signed.token");
});

test("Model GPS Visibility defaults OFF and is active-job-only", () => {
  assert.equal(modelGpsVisibilityContract.path, "/v1/model/settings/gps-visibility");
  assert.equal(modelGpsVisibilityContract.default_enabled, false);
  assert.equal(modelGpsVisibilityContract.active_job_only, true);
  assert.equal(modelGpsVisibilityContract.visibility, "private_customer");
  assert.equal(modelGpsVisibilityContract.stores_coordinates, false);
  assert.equal(modelGpsVisibilityContract.requests_device_location, false);
});

test("Model GPS Visibility accepts only a boolean permission switch", () => {
  assert.deepEqual(normalizeModelGpsVisibilityPatch({ enabled: true }), { ok: true, enabled: true });
  assert.deepEqual(normalizeModelGpsVisibilityPatch({ enabled: false }), { ok: true, enabled: false });
  assert.equal(normalizeModelGpsVisibilityPatch({ enabled: "true" }).error, "gps_visibility_invalid");
  assert.equal(normalizeModelGpsVisibilityPatch({ enabled: true, note: "x" }).error, "unsupported_fields");
});

test("Model GPS Visibility endpoint rejects coordinate payloads", () => {
  for (const payload of [
    { enabled: true, lat: 13.7 },
    { enabled: true, lng: 100.5 },
    { enabled: true, latitude: 13.7 },
    { enabled: true, longitude: 100.5 },
    { enabled: true, coords: { latitude: 13.7, longitude: 100.5 } },
    { enabled: true, location: "private address" },
  ]) {
    assert.equal(normalizeModelGpsVisibilityPatch(payload).error, "gps_coordinates_not_accepted");
  }
});

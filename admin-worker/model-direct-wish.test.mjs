import test from "node:test";
import assert from "node:assert/strict";
import {
  isModelDirectWishAdminQueueRequest,
  isModelDirectWishAdminReviewRequest,
  isModelDirectWishRequest,
  modelWishTelegramTargets,
  normalizeModelDirectWishInput,
  normalizeModelWishTier,
} from "./src/model-direct-wish.js";

test("direct Model Wish mode uses existing query-safe current-session route", () => {
  assert.equal(isModelDirectWishRequest(new Request("https://mmdbkk.com/v1/model/session/current?mode=year6_direct_wish")), true);
  assert.equal(isModelDirectWishRequest(new Request("https://mmdbkk.com/v1/model/session/current?mode=year6_wish")), false);
  assert.equal(isModelDirectWishRequest(new Request("https://mmdbkk.com/v1/model/wish")), false);
});

test("Model taxonomy is exactly Standard / Premium / Exclusive; VIP is not a Model tier", () => {
  assert.equal(normalizeModelWishTier("Standard Models"), "standard");
  assert.equal(normalizeModelWishTier("Premium"), "premium");
  assert.equal(normalizeModelWishTier("Exclusive Models"), "exclusive");
  assert.equal(normalizeModelWishTier("VIP"), "unknown");
  assert.equal(normalizeModelWishTier("Black Card"), "unknown");
});

test("Telegram Wish targets follow canonical Model visibility", () => {
  const env = { TELEGRAM_STANDARD_GROUP_ID: "-1001", TELEGRAM_PREMIUM_GROUP_ID: "-1002" };
  assert.deepEqual(modelWishTelegramTargets("Standard", env), [
    { audience: "standard_group", chat_id: "-1001" },
    { audience: "premium_group", chat_id: "-1002" },
  ]);
  assert.deepEqual(modelWishTelegramTargets("Premium", env), [
    { audience: "premium_group", chat_id: "-1002" },
  ]);
  assert.deepEqual(modelWishTelegramTargets("Exclusive", env), [
    { audience: "premium_group", chat_id: "-1002" },
  ]);
  assert.deepEqual(modelWishTelegramTargets("VIP", env), []);
});

test("direct Wish extends only the existing admin Model Wish review endpoints", () => {
  assert.equal(isModelDirectWishAdminQueueRequest("/v1/admin/model-wishes/review-queue", "GET"), true);
  assert.equal(isModelDirectWishAdminQueueRequest("/v1/admin/model-wishes/review-queue", "POST"), false);
  assert.equal(isModelDirectWishAdminReviewRequest("/v1/admin/model-wishes/review", "POST"), true);
  assert.equal(isModelDirectWishAdminReviewRequest("/v1/admin/model-wishes/review", "GET"), false);
});


test("direct Model Wish no longer requires profile photos", () => {
  const result = normalizeModelDirectWishInput({
    birthday_wish: "สุขสันต์ 6 ปี MMD",
    private_note_scope: "per_only",
    telegram_consent: true,
    past_clients_consent: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.birthdayWish, "สุขสันต์ 6 ปี MMD");
  assert.equal(result.consentVersion, "model_wish_v4");
  assert.equal("photoMediaIds" in result, false);
});

test("legacy page may still send one complete Gallery photo set during rollout", () => {
  const result = normalizeModelDirectWishInput({
    birthday_wish: "สุขสันต์ 6 ปี MMD",
    private_note_scope: "per_only",
    photo_media_ids: [
      "media_12345678",
      "media_22345678",
      "media_32345678",
      "media_42345678",
      "media_52345678",
    ],
    photo_count: 5,
    consent_version: "model_wish_v3",
  });
  assert.equal(result.ok, true);
  assert.equal(result.consentVersion, "model_wish_v3");
  assert.equal("photoMediaIds" in result, false);
});

test("partial or mismatched legacy photo payloads fail closed", () => {
  assert.equal(
    normalizeModelDirectWishInput({
      birthday_wish: "สุขสันต์ 6 ปี MMD",
      private_note_scope: "per_only",
      photo_media_ids: ["media_12345678"],
      photo_count: 1,
    }).error,
    "photo_media_ids_invalid",
  );
  assert.equal(
    normalizeModelDirectWishInput({
      birthday_wish: "สุขสันต์ 6 ปี MMD",
      private_note_scope: "per_only",
      photo_media_ids: [
        "media_12345678",
        "media_22345678",
        "media_32345678",
        "media_42345678",
        "media_52345678",
      ],
      photo_count: 4,
    }).error,
    "photo_count_mismatch",
  );
});

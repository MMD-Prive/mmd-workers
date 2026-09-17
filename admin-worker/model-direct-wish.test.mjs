import test from "node:test";
import assert from "node:assert/strict";
import {
  isModelDirectWishAdminQueueRequest,
  isModelDirectWishAdminReviewRequest,
  isModelDirectWishRequest,
  modelWishTelegramTargets,
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

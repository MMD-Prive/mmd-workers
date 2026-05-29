#!/usr/bin/env node

import assert from "node:assert/strict";
import test from "node:test";

import {
  validatePublicModelAssetKey,
  validatePublicModelAssetPrefix,
} from "./index.js";

test("accepts public-safe model asset prefixes", () => {
  assert.equal(validatePublicModelAssetPrefix("models/mdl_123/profile/").ok, true);
  assert.equal(validatePublicModelAssetPrefix("models/mdl_123/gallery/").ok, true);
  assert.equal(validatePublicModelAssetPrefix("models/mdl_123/compcard/").ok, true);
});

test("accepts public-safe model asset object keys", () => {
  assert.equal(validatePublicModelAssetKey("models/mdl_123/profile/main.jpg").ok, true);
  assert.equal(validatePublicModelAssetKey("models/mdl_123/gallery/img_001.jpg").ok, true);
  assert.equal(validatePublicModelAssetKey("models/mdl_123/compcard/front.jpg").ok, true);
});

test("rejects protected prefixes", () => {
  for (const prefix of ["private/", "evidence/", "line-notes/", "sigil/", "blackcard/", "slips/"]) {
    const validation = validatePublicModelAssetPrefix(`${prefix}abc/`);
    assert.equal(validation.ok, false, prefix);
    assert.equal(validation.error, "protected_model_asset_prefix_not_allowed");
  }
});

test("rejects traversal and URL-looking paths", () => {
  const cases = [
    "../models/mdl_123/profile/",
    "models/../mdl_123/profile/",
    "models/mdl_123\\profile\\",
    "models//mdl_123/profile/",
    "/models/mdl_123/profile/",
    "https://models.mmdbkk.com/models/mdl_123/profile/",
    "http://models.mmdbkk.com/models/mdl_123/profile/",
  ];

  for (const value of cases) {
    assert.equal(validatePublicModelAssetPrefix(value).ok, false, value);
  }
});

test("rejects non-public model asset shapes", () => {
  assert.equal(validatePublicModelAssetPrefix("models/mdl_123/private/").ok, false);
  assert.equal(validatePublicModelAssetPrefix("models/mdl_123/").ok, false);
  assert.equal(validatePublicModelAssetKey("models/mdl_123/profile/side.jpg").ok, false);
  assert.equal(validatePublicModelAssetKey("models/mdl_123/gallery/img_001.png").ok, false);
});

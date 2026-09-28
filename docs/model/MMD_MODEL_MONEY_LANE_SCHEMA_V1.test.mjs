import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./MMD_MODEL_MONEY_LANE_SCHEMA_V1.md", import.meta.url), "utf8");

test("membership and model-service package fields stay separate", () => {
  assert.match(source, /`model_package_code`/);
  assert.match(source, /`package_code`/);
  assert.match(source, /Membership\/access package code only/);
  assert.match(source, /must never be used to resolve model-service price/);
});

test("public and private money lanes have different authority", () => {
  assert.match(source, /public_model.*Public Money/);
  assert.match(source, /private_model.*Private Money/);
  assert.match(source, /Public matrices never apply automatically/);
  assert.match(source, /needs_review.*fail closed/);
});

test("confidential handling is not an automatic private money classification", () => {
  assert.match(source, /confidential offer does not automatically become Private Money/);
  assert.match(source, /MMD must explicitly assign the Session money lane/);
});

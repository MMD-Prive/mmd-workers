import test from "node:test";
import assert from "node:assert/strict";

import { resolveJobModelMoneyContext } from "./src/model-money-job-context.js";

test("Create Job query can supply an approved Public service package", () => {
  const result = resolveJobModelMoneyContext(
    { job_visibility: "public" },
    "https://mmdbkk.com/v1/admin/job/create?model_work_lane=public_model&model_package_code=pick_me_up",
  );
  assert.equal(result.ok, true);
  assert.equal(result.context.model_work_lane, "public_model");
  assert.equal(result.context.model_package_code, "pick_me_up");
  assert.equal(result.context.compensation_mode, "public_package_matrix");
});

test("confidential handling from query does not change the Public money lane", () => {
  const result = resolveJobModelMoneyContext(
    { job_visibility: "public" },
    "https://mmdbkk.com/v1/admin/job/create?model_work_lane=public_model&confidential_handling=1",
  );
  assert.equal(result.ok, true);
  assert.equal(result.context.model_work_lane, "public_model");
  assert.equal(result.context.confidential_handling, true);
  assert.equal(result.context.confidential_is_money_lane, false);
});

test("Private Money rejects a Public package supplied through query", () => {
  const result = resolveJobModelMoneyContext(
    { job_visibility: "private" },
    "https://mmdbkk.com/v1/admin/job/create?model_work_lane=private_model&model_package_code=pick_me_up",
  );
  assert.equal(result.ok, false);
  assert.equal(result.error, "model_package_not_allowed_for_money_lane");
});

test("body and query cannot disagree about money lane", () => {
  const result = resolveJobModelMoneyContext(
    { job_visibility: "public", model_work_lane: "public_model" },
    "https://mmdbkk.com/v1/admin/job/create?model_work_lane=private_model",
  );
  assert.equal(result.ok, false);
  assert.equal(result.error, "model_work_lane_source_conflict");
});

test("body and query cannot disagree about model service package", () => {
  const result = resolveJobModelMoneyContext(
    { job_visibility: "public", model_package_code: "pick_me_up" },
    "https://mmdbkk.com/v1/admin/job/create?model_package_code=airport_please",
  );
  assert.equal(result.ok, false);
  assert.equal(result.error, "model_package_source_conflict");
});

test("Membership package_code remains ignored even when Create Job query is present", () => {
  const result = resolveJobModelMoneyContext(
    { job_visibility: "public", package_code: "premium" },
    "https://mmdbkk.com/v1/admin/job/create?model_work_lane=public_model",
  );
  assert.equal(result.ok, true);
  assert.equal(result.context.model_package_code, "");
  assert.equal(result.context.compensation_mode, "public_session_locked");
});

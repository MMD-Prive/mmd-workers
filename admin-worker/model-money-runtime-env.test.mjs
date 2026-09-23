import test from "node:test";
import assert from "node:assert/strict";

import { modelMoneyRuntimeEnv } from "./src/admin-login-hero-worker.js";

test("model money runtime uses the dedicated model_package_code field by default", () => {
  const binding = { fetch() {} };
  const env = modelMoneyRuntimeEnv({
    AIRTABLE_API_KEY: "test",
    SOME_SERVICE: binding,
  });

  assert.equal(env.AT_SESSIONS__PACKAGE_CODE, "model_package_code");
  assert.equal(env.AIRTABLE_API_KEY, "test");
  assert.equal(env.SOME_SERVICE, binding);
});

test("legacy membership package_code cannot override the model-money field", () => {
  const env = modelMoneyRuntimeEnv({
    AT_SESSIONS__PACKAGE_CODE: "package_code",
  });

  assert.equal(env.AT_SESSIONS__PACKAGE_CODE, "model_package_code");
});

test("an explicit dedicated model package field can be configured safely", () => {
  const env = modelMoneyRuntimeEnv({
    AT_SESSIONS__MODEL_PACKAGE_CODE: "model_service_package_key",
    AT_SESSIONS__PACKAGE_CODE: "package_code",
  });

  assert.equal(env.AT_SESSIONS__PACKAGE_CODE, "model_service_package_key");
});

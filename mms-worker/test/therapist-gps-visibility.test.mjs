import test from "node:test";
import assert from "node:assert/strict";

import {
  handleMmsTherapistGpsVisibilityRequest,
  isMmsTherapistGpsVisibilityRequest,
  therapistGpsVisibilityContract,
} from "../src/therapist-gps-visibility-runtime.mjs";

const PATH = "https://www.mmdbkk.com/male-massage/therapists/api/auth/gps-visibility";

const storage = {
  async get() { return null; },
  async put() {},
};

test("recognizes only the dedicated Therapist GPS visibility path", () => {
  assert.equal(isMmsTherapistGpsVisibilityRequest("/male-massage/therapists/api/auth/gps-visibility"), true);
  assert.equal(isMmsTherapistGpsVisibilityRequest("/male-massage/therapists/api/auth/gps-visibility/"), true);
  assert.equal(isMmsTherapistGpsVisibilityRequest("/male-massage/therapists/api/auth/me"), false);
  assert.equal(therapistGpsVisibilityContract.default_enabled, false);
  assert.equal(therapistGpsVisibilityContract.audience, "mms_operations");
  assert.equal(therapistGpsVisibilityContract.active_job_only, true);
  assert.equal(therapistGpsVisibilityContract.stores_coordinates, false);
});

test("fails closed when Therapist auth is not enabled", async () => {
  const response = await handleMmsTherapistGpsVisibilityRequest(new Request(PATH), {
    MMS_PRIVATE_UPLOADS: storage,
    MMS_THERAPIST_AUTH_ENABLED: "false",
  });
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.error.code, "THERAPIST_AUTH_NOT_ENABLED");
});

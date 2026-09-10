import test from "node:test";
import assert from "node:assert/strict";

import {
  CUSTOMER_CONFIRM_PATH,
  MODEL_CONFIRM_PATH,
  canonicalizeConfirmLinkPayload,
} from "./confirm-route-canonicalizer.js";

test("defaults both confirmation pages to live SIGIL routes", () => {
  const payload = canonicalizeConfirmLinkPayload({ client_name: "Client", model_name: "Model" });
  assert.equal(payload.confirm_page, CUSTOMER_CONFIRM_PATH);
  assert.equal(payload.model_confirm_page, MODEL_CONFIRM_PATH);
});

test("rewrites legacy relative confirmation routes", () => {
  const payload = canonicalizeConfirmLinkPayload({
    confirm_page: "/confirm/job-confirmation",
    model_confirm_page: "/confirm/job-model",
  });
  assert.equal(payload.confirm_page, "/sigil/confirm/job-confirmation");
  assert.equal(payload.model_confirm_page, "/sigil/confirm/job-model");
});

test("rewrites legacy absolute production confirmation routes", () => {
  const payload = canonicalizeConfirmLinkPayload({
    confirm_page: "https://mmdbkk.com/confirm/job-confirmation",
    model_confirm_page: "https://www.mmdbkk.com/confirm/job-model",
  });
  assert.equal(payload.confirm_page, "https://mmdbkk.com/sigil/confirm/job-confirmation");
  assert.equal(payload.model_confirm_page, "https://www.mmdbkk.com/sigil/confirm/job-model");
});

test("preserves explicit non-legacy routes", () => {
  const payload = canonicalizeConfirmLinkPayload({
    confirm_page: "https://preview.example/customer-confirm",
    model_confirm_page: "/preview/model-confirm",
  });
  assert.equal(payload.confirm_page, "https://preview.example/customer-confirm");
  assert.equal(payload.model_confirm_page, "/preview/model-confirm");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertConfirmationUrlPair,
  assertConfirmationUrlRole,
  confirmationTokenRoleHint,
} from "./src/confirmation-link-role-guard.js";

function token(role) {
  return Buffer.from(JSON.stringify({
    kind: role === "model" ? "model_confirm" : "customer_confirm",
    role,
    session_id: "sess_link_guard_test",
  }), "utf8").toString("base64url") + ".signature";
}

test("confirmation token role hints decode the canonical signed payload shape", () => {
  assert.equal(confirmationTokenRoleHint(token("customer")), "customer");
  assert.equal(confirmationTokenRoleHint(token("model")), "model");
  assert.equal(confirmationTokenRoleHint("garbage"), "");
});

test("customer and model confirmation URLs must carry their matching role token", () => {
  const customer = `https://mmdbkk.com/sigil/confirm/job-confirmation?t=${encodeURIComponent(token("customer"))}`;
  const model = `https://mmdbkk.com/sigil/confirm/job-model?t=${encodeURIComponent(token("model"))}`;
  assert.equal(assertConfirmationUrlPair(customer, model), true);
});

test("issuer guard fails closed on swapped role tokens", () => {
  const modelTokenOnCustomer = `https://mmdbkk.com/sigil/confirm/job-confirmation?t=${encodeURIComponent(token("model"))}`;
  assert.throws(
    () => assertConfirmationUrlRole(modelTokenOnCustomer, "customer"),
    /confirmation_url_role_mismatch:customer:model/
  );
});

test("issuer guard fails closed on wrong route or missing token", () => {
  assert.throws(
    () => assertConfirmationUrlRole(`https://mmdbkk.com/sigil/confirm/job-model?t=${encodeURIComponent(token("customer"))}`, "customer"),
    /confirmation_url_path_mismatch:customer/
  );
  assert.throws(
    () => assertConfirmationUrlRole("https://mmdbkk.com/sigil/confirm/job-confirmation", "customer"),
    /confirmation_url_token_missing:customer/
  );
});

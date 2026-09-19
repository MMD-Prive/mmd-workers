import assert from "node:assert/strict";
import test from "node:test";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

import {
  isJobIdentityClaimRequest,
  issueHeldIdentityClaimLinks,
} from "./src/sigil-jobs-line-identity-claim.js";

test("identity claim mode is explicit", () => {
  assert.equal(isJobIdentityClaimRequest({ operational_create_mode: "identity_claim" }), true);
  assert.equal(isJobIdentityClaimRequest({ operational_create_mode: "reconcile_held" }), false);
});

test("held job issues role-bound customer and model LINE Mini App links without Airtable record IDs", async () => {
  const links = await issueHeldIdentityClaimLinks(
    { ADMIN_SESSION_SECRET: "test-only-session-secret" },
    { sessionId: "sess_test_123", pendingClient: true, pendingModel: true },
  );
  assert.equal(links.ok, true);

  const customer = new URL(links.customer_identity_url);
  assert.equal(customer.origin, "https://miniapp.line.me");
  assert.equal(customer.pathname, "/2010862595-yT4DCEMc/");
  assert.equal(customer.searchParams.get("intent"), "status");
  assert.equal(customer.searchParams.get("view"), "jobs");
  assert.ok(customer.searchParams.get("job_claim"));

  const model = new URL(links.model_identity_url);
  assert.equal(model.origin, "https://miniapp.line.me");
  assert.equal(model.pathname, "/2010864854-N34SgCqq/");
  assert.ok(model.searchParams.get("job_claim"));
  assert.notEqual(customer.searchParams.get("job_claim"), model.searchParams.get("job_claim"));

  assert.doesNotMatch(links.customer_identity_url, /rec[A-Za-z0-9]{14,}/);
  assert.doesNotMatch(links.model_identity_url, /rec[A-Za-z0-9]{14,}/);
});

test("only the missing identity receives a claim URL by default", async () => {
  const links = await issueHeldIdentityClaimLinks(
    { ADMIN_SESSION_SECRET: "test-only-session-secret" },
    { sessionId: "sess_test_456", pendingClient: false, pendingModel: true },
  );
  assert.equal(links.ok, true);
  assert.equal(links.customer_identity_url, null);
  assert.ok(links.model_identity_url);
});

test("owner collection mode can issue both role links even when canonical records already exist", async () => {
  const links = await issueHeldIdentityClaimLinks(
    { ADMIN_SESSION_SECRET: "test-only-session-secret" },
    {
      sessionId: "sess_test_identity_first",
      pendingClient: false,
      pendingModel: false,
      collectCustomer: true,
      collectModel: true,
    },
  );
  assert.equal(links.ok, true);
  assert.ok(links.customer_identity_url);
  assert.ok(links.model_identity_url);
  assert.notEqual(
    new URL(links.customer_identity_url).searchParams.get("job_claim"),
    new URL(links.model_identity_url).searchParams.get("job_claim"),
  );
});

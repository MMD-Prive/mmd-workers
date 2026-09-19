import assert from "node:assert/strict";
import test from "node:test";

import { isHeldIdentityLinkRefreshRequest } from "./src/sigil-jobs-identity-link-refresh.js";

function request(path = "/v1/admin/job/create", method = "POST") {
  return new Request(`https://mmdbkk.com${path}`, { method });
}

test("identity-link refresh is an explicit POST mode on the existing create route", () => {
  assert.equal(isHeldIdentityLinkRefreshRequest(request(), { operational_create_mode: "issue_identity_links" }), true);
  assert.equal(isHeldIdentityLinkRefreshRequest(request(), { mode: "issue_identity_links" }), true);
  assert.equal(isHeldIdentityLinkRefreshRequest(request(), { operational_create_mode: "reconcile_held" }), false);
  assert.equal(isHeldIdentityLinkRefreshRequest(request("/v1/admin/job/reconcile-held"), { operational_create_mode: "issue_identity_links" }), false);
  assert.equal(isHeldIdentityLinkRefreshRequest(request("/v1/admin/job/create", "GET"), { operational_create_mode: "issue_identity_links" }), false);
});

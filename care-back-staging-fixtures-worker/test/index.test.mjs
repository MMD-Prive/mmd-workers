import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.js";

const secret = "staging-resolver-secret-1234567890abcdef";

test("verifies only the three bounded synthetic staging tokens", async () => {
  const body = new URLSearchParams({ id_token: "care-back-staging-current", client_id: "care-back-staging-channel" });
  const response = await worker.fetch(new Request("https://fixture.local/oauth2/v2.1/verify", { method: "POST", body }));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.aud, "care-back-staging-channel");
  assert.equal(payload.sub, "U00000000000000000000000000000001");

  const rejected = await worker.fetch(new Request("https://fixture.local/oauth2/v2.1/verify", {
    method: "POST",
    body: new URLSearchParams({ id_token: "anything-else", client_id: "care-back-staging-channel" }),
  }));
  assert.equal(rejected.status, 401);
});

test("returns current, returning, and new states only behind the resolver secret", async () => {
  const resolve = (lineUserId, path = "/__internal/member-status/resolve", resolverSecret = secret) => worker.fetch(new Request(`https://fixture.local${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-mmd-member-resolver-secret": resolverSecret },
    body: JSON.stringify({ line_user_id: lineUserId }),
  }), { MEMBER_STATUS_RESOLVER_SECRET: secret });

  const current = await resolve("U00000000000000000000000000000001", "/__internal/member-profile/read");
  const returning = await resolve("U00000000000000000000000000000002", "/__internal/member-profile/read");
  const fresh = await resolve("U00000000000000000000000000000003");
  const forbidden = await resolve("U00000000000000000000000000000001", "/__internal/member-status/resolve", "wrong");

  assert.equal((await current.json()).data.profile.membership_status, "active");
  assert.equal((await returning.json()).data.profile.membership_status, "expired");
  assert.equal((await fresh.json()).data.member_exists, false);
  assert.equal(forbidden.status, 401);
});

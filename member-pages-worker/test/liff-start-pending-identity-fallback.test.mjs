import assert from "node:assert/strict";
import test from "node:test";

import {
  isRecoverableLiffStartResolutionFailure,
  recoverVerifiedLiffStartAsPendingIdentity,
  withPendingIdentityOnlyResolver,
} from "../src/liff-start-pending-identity-fallback.js";

function resolutionFailure() {
  return new Response(JSON.stringify({
    ok: false,
    error: { code: "MEMBER_RESOLUTION_FAILED" },
  }), {
    status: 503,
    headers: { "content-type": "application/json" },
  });
}

function startRequest() {
  return new Request("https://mmdbkk.com/member/api/liff/start", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://mmdbkk.com" },
    body: JSON.stringify({ id_token: "verified-token", liff_intent: "status" }),
  });
}

test("matches only exact POST LIFF start member-resolution failures", () => {
  const payload = { ok: false, error: { code: "MEMBER_RESOLUTION_FAILED" } };
  assert.equal(isRecoverableLiffStartResolutionFailure(startRequest(), resolutionFailure(), payload), true);
  assert.equal(isRecoverableLiffStartResolutionFailure(
    new Request("https://mmdbkk.com/member/api/liff/status"),
    resolutionFailure(),
    payload,
  ), false);
  assert.equal(isRecoverableLiffStartResolutionFailure(
    startRequest(),
    new Response(JSON.stringify({ ok: false, error: { code: "LINE_ID_TOKEN_INVALID" } }), {
      status: 401,
      headers: { "content-type": "application/json" },
    }),
    { ok: false, error: { code: "LINE_ID_TOKEN_INVALID" } },
  ), false);
});

test("fallback resolver is explicit no-member and grants nothing", async () => {
  const env = withPendingIdentityOnlyResolver({ KEEP: "yes" });
  assert.equal(env.KEEP, "yes");
  const response = await env.MEMBER_STATUS_RESOLVER.fetch(new Request("https://internal/resolve"));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.data.member_exists, false);
  assert.deepEqual(payload.data.grants, {
    membership: false,
    points: false,
    payment_status: false,
    private_access: false,
  });
});

test("verified start can recover to a host session only as pending identity", async () => {
  const request = startRequest();
  const original = resolutionFailure();
  const payload = { ok: false, error: { code: "MEMBER_RESOLUTION_FAILED" } };
  let calls = 0;
  const worker = {
    async fetch(retryRequest, retryEnv) {
      calls += 1;
      assert.equal(retryRequest.method, "POST");
      const resolverResponse = await retryEnv.MEMBER_STATUS_RESOLVER.fetch(new Request("https://internal/resolve"));
      const resolver = await resolverResponse.json();
      assert.equal(resolver.data.member_exists, false);
      return new Response(JSON.stringify({
        ok: true,
        data: {
          member_resolved: false,
          pending_identity: true,
          grants: { membership: false, points: false, payment_status: false, private_access: false },
        },
      }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": "__Host-mmd_liff_session=test; HttpOnly; Secure; SameSite=Strict; Path=/",
        },
      });
    },
  };

  const recovered = await recoverVerifiedLiffStartAsPendingIdentity({
    request,
    response: original,
    payload,
    worker,
    env: { MEMBER_STATUS_RESOLVER: { fetch: async () => resolutionFailure() } },
  });
  assert.equal(calls, 1);
  assert.equal(recovered.status, 200);
  assert.equal(recovered.headers.get("x-mmd-liff-start-fallback"), "pending-identity-v1");
  assert.match(recovered.headers.get("set-cookie") || "", /__Host-mmd_liff_session=/);
  const body = await recovered.json();
  assert.equal(body.data.pending_identity, true);
  assert.equal(body.data.member_resolved, false);
});

test("fallback refuses any retry response that grants protected access", async () => {
  const request = startRequest();
  const original = resolutionFailure();
  const payload = { ok: false, error: { code: "MEMBER_RESOLUTION_FAILED" } };
  const worker = {
    async fetch() {
      return new Response(JSON.stringify({
        ok: true,
        data: {
          member_resolved: false,
          pending_identity: true,
          grants: { membership: true, points: false, payment_status: false, private_access: false },
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  };
  const result = await recoverVerifiedLiffStartAsPendingIdentity({ request, response: original, payload, worker, env: {} });
  assert.equal(result, original);
  assert.equal(result.status, 503);
});

test("fallback never masks a failed second LINE/start verification", async () => {
  const request = startRequest();
  const original = resolutionFailure();
  const payload = { ok: false, error: { code: "MEMBER_RESOLUTION_FAILED" } };
  const worker = {
    async fetch() {
      return new Response(JSON.stringify({ ok: false, error: { code: "LINE_ID_TOKEN_INVALID" } }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    },
  };
  const result = await recoverVerifiedLiffStartAsPendingIdentity({ request, response: original, payload, worker, env: {} });
  assert.equal(result, original);
  assert.equal(result.status, 503);
});

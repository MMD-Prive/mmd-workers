import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import worker from "../src/index.js";

let originalFetch;
let passThroughRequests;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  passThroughRequests = [];
  globalThis.fetch = async (request) => {
    passThroughRequests.push(request);
    return new Response("pass-through", { status: 209 });
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

async function requestWithEnv(url, env, init) {
  return worker.fetch(new Request(url, init), env);
}

describe("LIFF identity API front gate", () => {
  it("routes all guarded LIFF gateway endpoints to member-pages-worker without generic pass-through", async () => {
    const serviceRequests = [];
    const env = {
      MEMBER_PAGES_WORKER: {
        fetch: async (request) => {
          serviceRequests.push(request);
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: {
              "content-type": "application/json; charset=utf-8",
              "x-mmd-worker": "member-pages-worker",
            },
          });
        },
      },
    };

    const endpointCases = [
      { method: "POST", path: "/member/api/liff/start" },
      { method: "POST", path: "/member/api/liff/intent" },
      { method: "POST", path: "/member/api/liff/audience" },
      { method: "POST", path: "/member/api/liff/package" },
      { method: "POST", path: "/member/api/liff/payment-intent" },
      { method: "GET", path: "/member/api/liff/status" },
      { method: "POST", path: "/member/api/liff/hall-token" },
    ];
    const cases = endpointCases.flatMap((item) => [item, { ...item, path: `${item.path}/` }]);

    for (const item of cases) {
      const response = await requestWithEnv(`https://mmdbkk.com${item.path}?t=abc`, env, {
        method: item.method,
        headers: { "content-type": "application/json" },
        body: item.method === "GET" ? undefined : "{}",
      });

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("location"), null);
      assert.equal(response.headers.get("x-mmd-front-gate"), "mmd-redirect-worker");
      assert.equal(response.headers.get("x-mmd-worker"), "member-pages-worker");
    }

    assert.equal(serviceRequests.length, cases.length);
    assert.deepEqual(serviceRequests.map((request) => new URL(request.url).pathname), cases.map((item) => item.path));
    assert.equal(passThroughRequests.length, 0);
  });

  it("fails closed for unknown LIFF API routes instead of falling through", async () => {
    const serviceRequests = [];
    const env = {
      MEMBER_PAGES_WORKER: {
        fetch: async (request) => {
          serviceRequests.push(request);
          return new Response("unexpected", { status: 200 });
        },
      },
    };
    const response = await requestWithEnv("https://mmdbkk.com/member/api/liff/unrecognized", env, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.error.code, "LIFF_ROUTE_NOT_FOUND");
    assert.equal(response.headers.get("x-mmd-front-gate"), "mmd-redirect-worker");
    assert.equal(serviceRequests.length, 0);
    assert.equal(passThroughRequests.length, 0);
  });

  it("routes POST /member/api/liff/identify to member-pages-worker without redirecting", async () => {
    const serviceRequests = [];
    const env = {
      MEMBER_PAGES_WORKER: {
        fetch: async (request) => {
          serviceRequests.push(request);
          return new Response(JSON.stringify({ ok: true, data: { identity_status: "possible_match" } }), {
            status: 200,
            headers: {
              "content-type": "application/json; charset=utf-8",
              "x-mmd-worker": "member-pages-worker",
              "x-mmd-page": "liff-identity-bridge",
            },
          });
        },
      },
    };

    const payload = { line_user_id: "Uabc", entry_route: "public_membership", t: "abc", code: "x", promo: "y" };
    const response = await requestWithEnv("https://www.mmdbkk.com/member/api/liff/identify?t=abc&code=x&promo=y", env, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("location"), null);
    assert.equal(response.headers.get("x-mmd-front-gate"), "mmd-redirect-worker");
    assert.equal(response.headers.get("x-mmd-worker"), "member-pages-worker");
    assert.equal(response.headers.get("x-mmd-page"), "liff-identity-bridge");
    assert.equal(body.ok, true);
    assert.equal(serviceRequests.length, 1);
    assert.equal(serviceRequests[0].url, "https://www.mmdbkk.com/member/api/liff/identify?t=abc&code=x&promo=y");
    assert.equal(passThroughRequests.length, 0);
  });

  it("falls back to member-pages-worker upstream for LIFF identity without generic pass-through", async () => {
    const response = await worker.fetch(new Request("https://mmdbkk.com/member/api/liff/identify?t=abc", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ line_user_id: "Uabc", entry_route: "public_membership" }),
    }));

    const expected = new URL("https://member-pages-worker.malemodel-bkk.workers.dev/member/api/liff/identify?t=abc");

    assert.equal(response.status, 209);
    assert.equal(response.headers.get("x-mmd-front-gate"), "mmd-redirect-worker");
    assert.equal(passThroughRequests.length, 1);
    assert.equal(passThroughRequests[0].url, expected.toString());
  });
});

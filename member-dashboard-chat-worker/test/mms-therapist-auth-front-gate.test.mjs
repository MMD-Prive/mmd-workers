import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker from "../src/mms-line-front-gate.js";

const APP = "https://www.mmdbkk.com/male-massage/therapists/app";
const APP_ACCESS = "https://www.mmdbkk.com/male-massage/therapists/api/app/access";
const PRESENTATION = "https://my-mms-therapist.lovable.app/my-mms-work-shell.html";

test("MMS customer history stays with member-pages and never enters the My MMD status redirect", async () => {
  for (const suffix of ["?view=mms-history", "?liff.state=%3Fview%3Dmms-history%26intent%3Dstatus"]) {
    const url = `https://www.mmdbkk.com/member/liff${suffix}`;
    const response = await worker.fetch(new Request(url, { headers: { cookie: "test-session=present" } }), {
      MEMBER_PAGES_WORKER: { async fetch(request) {
        assert.equal(request.url, url);
        assert.equal(request.headers.get("cookie"), "test-session=present");
        return new Response("MMS customer history", { headers: { "content-type": "text/html", "cache-control": "private, no-store" } });
      } },
    });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "MMS customer history");
  }
});

test("MMS Therapist auth routes are delegated only to mms-worker and preserve cookies", async () => {
  const calls = [];
  const env = {
    MMS_WORKER: {
      async fetch(request) {
        calls.push({
          path: new URL(request.url).pathname,
          method: request.method,
          origin: request.headers.get("origin"),
          cookie: request.headers.get("cookie"),
          body: request.method === "POST" ? await request.json() : null,
        });
        return Response.json({ ok: true, data: { role: "mms_therapist" } }, {
          status: 200,
          headers: {
            "set-cookie": "__Secure-mms_therapist_session=test; Path=/; Secure; HttpOnly; SameSite=Lax",
          },
        });
      },
    },
  };

  const requestBody = { id_token: "line-id-token", invite_token: "invite-token" };
  const response = await worker.fetch(new Request("https://www.mmdbkk.com/male-massage/therapists/api/auth/line", {
    method: "POST",
    headers: {
      origin: "https://www.mmdbkk.com",
      cookie: "other_session=unchanged",
      "content-type": "application/json",
    },
    body: JSON.stringify(requestBody),
  }), env);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, data: { role: "mms_therapist" } });
  assert.deepEqual(calls, [{
    path: "/male-massage/therapists/api/auth/line",
    method: "POST",
    origin: "https://www.mmdbkk.com",
    cookie: "other_session=unchanged",
    body: requestBody,
  }]);
  assert.match(response.headers.get("set-cookie") || "", /__Secure-mms_therapist_session=/);
  assert.equal(response.headers.get("x-mmd-worker"), "member-dashboard-chat-worker");
  assert.equal(response.headers.get("x-mmd-route-owner"), "member-dashboard-chat-worker");
  assert.equal(response.headers.get("x-mmd-upstream-service"), "mms-worker");
  assert.match(response.headers.get("cache-control") || "", /no-store/);
});

test("MMS Therapist auth front gate fails closed when mms-worker is unavailable", async () => {
  const response = await worker.fetch(new Request("https://mmdbkk.com/male-massage/therapists/api/auth/me", {
    method: "GET",
    headers: { origin: "https://mmdbkk.com" },
  }), {});

  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "MMS_THERAPIST_AUTH_UPSTREAM_NOT_CONFIGURED");
});

test("MY MMS app API stays same-origin and preserves the Therapist session only to mms-worker", async () => {
  const calls = [];
  const env = {
    MMS_WORKER: {
      async fetch(request) {
        calls.push({
          path: new URL(request.url).pathname,
          cookie: request.headers.get("cookie"),
        });
        return Response.json({ ok: true, data: { access: "approved", can_open: true } });
      },
    },
  };

  const response = await worker.fetch(new Request(APP_ACCESS, {
    headers: { cookie: "__Secure-mms_therapist_session=session-value" },
  }), env);

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{
    path: "/male-massage/therapists/api/app/access",
    cookie: "__Secure-mms_therapist_session=session-value",
  }]);
  assert.equal(response.headers.get("x-mmd-upstream-service"), "mms-worker");
  assert.match(response.headers.get("cache-control") || "", /no-store/);
});

test("MY MMS production app is server-gated before anonymous Lovable presentation is returned", async () => {
  const serviceCalls = [];
  const presentationCalls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const request = input instanceof Request ? input : new Request(input);
    presentationCalls.push({
      url: request.url,
      cookie: request.headers.get("cookie"),
      authorization: request.headers.get("authorization"),
      origin: request.headers.get("origin"),
    });
    return new Response('<!doctype html><html data-mms-shell="lovable-single-file-v1"><body>MY MMS</body></html>', {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", "set-cookie": "lovable=must-not-survive" },
    });
  };

  try {
    const env = {
      MMS_WORKER: {
        async fetch(request) {
          serviceCalls.push({
            path: new URL(request.url).pathname,
            cookie: request.headers.get("cookie"),
          });
          return Response.json({ ok: true, data: { access: "approved", can_open: true } });
        },
      },
    };

    const response = await worker.fetch(new Request(APP, {
      headers: { cookie: "__Secure-mms_therapist_session=approved-session" },
    }), env);

    assert.equal(response.status, 200);
    assert.match(await response.text(), /data-mms-shell="lovable-single-file-v1"/);
    assert.deepEqual(serviceCalls, [{
      path: "/male-massage/therapists/api/app/access",
      cookie: "__Secure-mms_therapist_session=approved-session",
    }]);
    assert.deepEqual(presentationCalls, [{
      url: PRESENTATION,
      cookie: null,
      authorization: null,
      origin: null,
    }]);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(response.headers.get("x-mmd-ui-source"), "lovable-single-file-proxy");
    assert.equal(response.headers.get("x-mmd-presentation-owner"), "lovable");
    assert.equal(response.headers.get("x-mmd-behavior-owner"), "mms-worker");
    assert.match(response.headers.get("content-security-policy") || "", /connect-src 'self'/);
    assert.match(response.headers.get("x-robots-tag") || "", /noindex/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("MY MMS locked Therapist never fetches or receives work-app presentation", async () => {
  const originalFetch = globalThis.fetch;
  let presentationFetched = false;
  globalThis.fetch = async () => {
    presentationFetched = true;
    throw new Error("presentation must not be fetched while locked");
  };

  try {
    const env = {
      MMS_WORKER: {
        async fetch() {
          return Response.json({ ok: true, data: { access: "locked", can_open: false } });
        },
      },
    };
    const response = await worker.fetch(new Request(APP, {
      headers: { cookie: "__Secure-mms_therapist_session=locked-session" },
    }), env);
    assert.equal(response.status, 302);
    assert.equal(new URL(response.headers.get("location")).pathname, "/male-massage/therapists/me");
    assert.equal(presentationFetched, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("MY MMS app sends an unauthenticated browser back through Therapist LINE login", async () => {
  const env = {
    MMS_WORKER: {
      async fetch() {
        return Response.json({ ok: false, error: { code: "THERAPIST_SESSION_REQUIRED" } }, { status: 401 });
      },
    },
  };
  const response = await worker.fetch(new Request(APP), env);
  assert.equal(response.status, 302);
  assert.equal(new URL(response.headers.get("location")).pathname, "/male-massage/therapists/login");
});

test("wrangler claims only bounded Therapist auth, app API, and work-app routes on apex and www", async () => {
  const wrangler = await readFile(new URL("../wrangler.toml", import.meta.url), "utf8");
  for (const route of [
    "mmdbkk.com/male-massage/therapists/api/auth/*",
    "www.mmdbkk.com/male-massage/therapists/api/auth/*",
    "mmdbkk.com/male-massage/therapists/api/app/*",
    "www.mmdbkk.com/male-massage/therapists/api/app/*",
    "mmdbkk.com/male-massage/therapists/app*",
    "www.mmdbkk.com/male-massage/therapists/app*",
  ]) {
    assert.ok(wrangler.includes(`pattern = "${route}"`), `missing Worker route: ${route}`);
  }
  assert.match(wrangler, /binding = "MMS_WORKER"\s+service = "mms-worker"/);
  assert.doesNotMatch(wrangler, /pattern = "(?:www\.)?mmdbkk\.com\/male-massage\/therapists\*"/);
});

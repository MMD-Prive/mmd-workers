import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import worker from "../src/index.js";

const LINE_ID = `U${"a".repeat(32)}`;
const RESOLVER_SECRET = "test-only-member-status-resolver-secret-1234567890";
const RESOLVER_URL = "https://mmd-auth-worker.internal/__internal/member-status/resolve";
const PROFILE_URL = "https://mmd-auth-worker.internal/__internal/member-profile/read";
const realFetch = globalThis.fetch;
const realConsoleWarn = console.warn;

afterEach(() => {
  globalThis.fetch = realFetch;
  console.warn = realConsoleWarn;
});

function env(overrides = {}) {
  return {
    AIRTABLE_API_KEY: "test-airtable-key",
    AIRTABLE_BASE_ID: "app_test",
    AIRTABLE_TABLE_MEMBERS: "Members",
    AIRTABLE_MEMBERS_LINE_USER_ID_FIELD: "line_user_id",
    MEMBER_STATUS_RESOLVER_SECRET: RESOLVER_SECRET,
    ...overrides,
  };
}

function resolverRequest(body, { secret = RESOLVER_SECRET, contentType = "application/json" } = {}) {
  const headers = {};
  if (contentType) headers["content-type"] = contentType;
  if (secret) headers["x-mmd-member-resolver-secret"] = secret;
  return new Request(RESOLVER_URL, { method: "POST", headers, body: JSON.stringify(body) });
}

async function captureResolverFailure(run) {
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  const response = await run();
  const payload = await response.json();
  assert.equal(response.status, 503);
  assert.equal(payload.error.code, "MEMBER_STATUS_RESOLVER_UNAVAILABLE");
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].length, 1);
  const warning = warnings[0][0];
  assert.deepEqual(Object.keys(warning).sort(), ["duration_ms", "event", "failure_class", "stage"]);
  assert.equal(warning.event, "member_status_resolver_failure");
  assert.equal(warning.stage, "airtable_members_lookup");
  assert.ok(Number.isInteger(warning.duration_ms) && warning.duration_ms >= 0);
  return { payload, warning };
}

test("member status resolver is not publicly callable", async () => {
  let airtableCalled = false;
  globalThis.fetch = async () => {
    airtableCalled = true;
    throw new Error("Airtable must not be called for an unauthorized request");
  };

  const response = await worker.fetch(resolverRequest({ line_user_id: LINE_ID, purpose: "liff_identity_resolution" }, { secret: "" }), env());
  const payload = await response.json();

  assert.equal(response.status, 404);
  assert.equal(payload.error.code, "NOT_FOUND");
  assert.equal(airtableCalled, false);
});

test("member status resolver accepts only the Phase 1 verified LINE-subject contract", async () => {
  let airtableCalled = false;
  globalThis.fetch = async () => {
    airtableCalled = true;
    throw new Error("Airtable must not be called for an invalid request");
  };

  const wrongPurpose = await worker.fetch(resolverRequest({ line_user_id: LINE_ID, purpose: "dashboard" }), env());
  const browserMemberClaim = await worker.fetch(resolverRequest({ line_user_id: LINE_ID, purpose: "liff_identity_resolution", member_id: "spoof" }), env());

  assert.equal(wrongPurpose.status, 400);
  assert.equal(browserMemberClaim.status, 400);
  assert.equal(airtableCalled, false);
});

test("member status resolver returns only a boolean for one exact member match", async () => {
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "api.airtable.com");
    assert.equal(url.pathname, "/v0/app_test/Members");
    assert.equal(init.method || "GET", "GET");
    assert.equal(url.searchParams.get("maxRecords"), "2");
    return new Response(JSON.stringify({ records: [{ id: "rec_member", fields: { line_user_id: LINE_ID, member_id: "MMD-should-not-leak" } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const response = await worker.fetch(resolverRequest({ line_user_id: LINE_ID, purpose: "liff_identity_resolution" }), env());
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload, { ok: true, data: { member_exists: true } });
  assert.doesNotMatch(JSON.stringify(payload), /MMD-should-not-leak|Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/);
});

test("member status resolver distinguishes no match from ambiguous or unavailable data without granting access", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ records: [] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  const noMatch = await worker.fetch(resolverRequest({ line_user_id: LINE_ID, purpose: "liff_identity_resolution" }), env());
  assert.deepEqual(await noMatch.json(), { ok: true, data: { member_exists: false } });

  globalThis.fetch = async () => new Response(JSON.stringify({ records: [{ id: "rec_one", fields: {} }, { id: "rec_two", fields: {} }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  const ambiguous = await worker.fetch(resolverRequest({ line_user_id: LINE_ID, purpose: "liff_identity_resolution" }), env());
  const ambiguousPayload = await ambiguous.json();
  assert.equal(ambiguous.status, 409);
  assert.equal(ambiguousPayload.error.code, "MEMBER_MATCH_AMBIGUOUS");

  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: "private Airtable diagnostic" } }), {
    status: 500,
    headers: { "content-type": "application/json" },
  });
  const unavailable = await worker.fetch(resolverRequest({ line_user_id: LINE_ID, purpose: "liff_identity_resolution" }), env());
  const unavailablePayload = await unavailable.json();
  assert.equal(unavailable.status, 503);
  assert.equal(unavailablePayload.error.code, "MEMBER_STATUS_RESOLVER_UNAVAILABLE");
  assert.doesNotMatch(JSON.stringify(unavailablePayload), /private Airtable diagnostic/);
});

test("member status resolver fails closed for Airtable auth/rate/server failures, malformed success, and timeout", async () => {
  for (const responseFactory of [
    () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "content-type": "application/json" } }),
    () => new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "content-type": "application/json" } }),
    () => new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { "content-type": "application/json" } }),
    () => new Response(JSON.stringify({ error: "unavailable" }), { status: 503, headers: { "content-type": "application/json" } }),
    () => Response.json({}),
    () => Response.json({ records: null }),
    () => Response.json({ records: {} }),
    () => Response.json({ records: "invalid" }),
  ]) {
    globalThis.fetch = async () => responseFactory();
    const response = await worker.fetch(resolverRequest({ line_user_id: LINE_ID, purpose: "liff_identity_resolution" }), env());
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, "MEMBER_STATUS_RESOLVER_UNAVAILABLE");
  }

  globalThis.fetch = async () => Response.json({ records: [] });
  const legitimateEmpty = await worker.fetch(resolverRequest({ line_user_id: LINE_ID, purpose: "liff_identity_resolution" }), env());
  assert.equal(legitimateEmpty.status, 200);
  assert.deepEqual(await legitimateEmpty.json(), { ok: true, data: { member_exists: false } });

  let aborted = false;
  globalThis.fetch = async (_input, init = {}) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => {
      aborted = true;
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
  const startedAt = Date.now();
  const response = await worker.fetch(
    resolverRequest({ line_user_id: LINE_ID, purpose: "liff_identity_resolution" }),
    env({ MEMBER_STATUS_AIRTABLE_TIMEOUT_MS: "50" }),
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "MEMBER_STATUS_RESOLVER_UNAVAILABLE");
  assert.equal(aborted, true);
  assert.ok(Date.now() - startedAt < 500, "internal resolver timeout remains bounded below the outer budget");
});

test("member status resolver permits a bounded slow Airtable response below its deadline", async () => {
  globalThis.fetch = async (_input, init = {}) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(Response.json({ records: [] })), 25);
    init.signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
  const response = await worker.fetch(
    resolverRequest({ line_user_id: LINE_ID, purpose: "liff_identity_resolution" }),
    env({ MEMBER_STATUS_AIRTABLE_TIMEOUT_MS: "50" }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, data: { member_exists: false } });
});

test("member profile preserves its prior non-strict malformed-list behavior", async () => {
  globalThis.fetch = async () => Response.json({ records: null });
  const response = await worker.fetch(new Request(PROFILE_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-mmd-member-resolver-secret": RESOLVER_SECRET },
    body: JSON.stringify({ line_user_id: LINE_ID, purpose: "liff_member_profile_read" }),
  }), env());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, data: { member_exists: false } });
});

test("member status resolver propagates caller cancellation to the Airtable lookup and fails closed", async () => {
  let aborted = false;
  globalThis.fetch = async (_input, init = {}) => new Promise((_resolve, reject) => {
    if (init.signal.aborted) {
      aborted = true;
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    init.signal.addEventListener("abort", () => {
      aborted = true;
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
  const controller = new AbortController();
  const pending = worker.fetch(new Request(RESOLVER_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-mmd-member-resolver-secret": RESOLVER_SECRET },
    body: JSON.stringify({ line_user_id: LINE_ID, purpose: "liff_identity_resolution" }),
    signal: controller.signal,
  }), env());
  controller.abort();
  const response = await pending;
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "MEMBER_STATUS_RESOLVER_UNAVAILABLE");
  assert.equal(aborted, true);
});

test("member status resolver emits only the approved privacy-safe failure classes", async () => {
  const sensitive = "sensitive-line-query-token-base-record-member-data";
  const cases = [
    {
      name: "missing config",
      expected: "missing_config",
      environment: env({ AIRTABLE_API_KEY: "" }),
      fetch: async () => { throw new Error("fetch must not run"); },
    },
    ...[
      [401, "provider_401"],
      [403, "provider_403"],
      [404, "provider_404"],
      [422, "provider_422"],
      [429, "provider_429"],
      [500, "provider_5xx"],
    ].map(([status, expected]) => ({
      name: `provider HTTP ${status}`,
      expected,
      environment: env(),
      fetch: async () => new Response(JSON.stringify({ error: sensitive }), { status }),
    })),
    {
      name: "malformed provider response",
      expected: "malformed_response",
      environment: env(),
      fetch: async () => Response.json({ records: sensitive }),
    },
    {
      name: "network failure",
      expected: "network_failure",
      environment: env(),
      fetch: async () => { throw new Error(sensitive); },
    },
  ];

  for (const testCase of cases) {
    globalThis.fetch = testCase.fetch;
    const { payload, warning } = await captureResolverFailure(() => worker.fetch(
      resolverRequest({ line_user_id: LINE_ID, purpose: "liff_identity_resolution" }),
      testCase.environment,
    ));
    assert.equal(warning.failure_class, testCase.expected, testCase.name);
    assert.doesNotMatch(JSON.stringify({ payload, warning }), new RegExp(sensitive));
    assert.doesNotMatch(JSON.stringify({ payload, warning }), /Uaaaaaaaa|app_test|filterByFormula|Authorization|rec_/i);
  }
});

test("member status resolver distinguishes bounded timeout and caller abort without leaking request data", async () => {
  globalThis.fetch = async (_input, init = {}) => new Promise((_resolve, reject) => {
    if (init.signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });

  let captured = await captureResolverFailure(() => worker.fetch(
    resolverRequest({ line_user_id: LINE_ID, purpose: "liff_identity_resolution" }),
    env({ MEMBER_STATUS_AIRTABLE_TIMEOUT_MS: "50" }),
  ));
  assert.equal(captured.warning.failure_class, "timeout");

  const controller = new AbortController();
  const pending = captureResolverFailure(() => worker.fetch(new Request(RESOLVER_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-mmd-member-resolver-secret": RESOLVER_SECRET },
    body: JSON.stringify({ line_user_id: LINE_ID, purpose: "liff_identity_resolution" }),
    signal: controller.signal,
  }), env()));
  controller.abort();
  captured = await pending;
  assert.equal(captured.warning.failure_class, "caller_abort");
  assert.doesNotMatch(JSON.stringify(captured), /Uaaaaaaaa|test-only-member-status-resolver-secret|app_test/i);
});

test("unexpected resolver exceptions use the bounded unknown provider class", async () => {
  const environment = env();
  Object.defineProperty(environment, "AIRTABLE_MEMBERS_LINE_USER_ID_FIELD", {
    get() { throw new Error("private unexpected detail"); },
  });
  const captured = await captureResolverFailure(() => worker.fetch(
    resolverRequest({ line_user_id: LINE_ID, purpose: "liff_identity_resolution" }),
    environment,
  ));
  assert.equal(captured.warning.failure_class, "unknown_provider_failure");
  assert.doesNotMatch(JSON.stringify(captured), /private unexpected detail/);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  authorityRuntimeHealth,
  captureAuthorityEvent,
  posthogAuthorityReady,
  queueAuthorityEvent,
} from "./posthog-authority-events.mjs";

test("authority analytics skips cleanly when project token is not configured", async () => {
  let called = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { called = true; throw new Error("should_not_fetch"); };
  try {
    assert.equal(posthogAuthorityReady({}), false);
    const result = await captureAuthorityEvent({}, {
      event: "payment_verified",
      authority: "payments-worker",
      distinctValue: "pay-secret-ref",
    });
    assert.equal(result.skipped, true);
    assert.equal(result.reason, "project_token_missing");
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("authority analytics hashes correlation values and strips unsafe properties", async () => {
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response("ok", { status: 200 });
  };
  try {
    const rawRef = "PAY-RAW-PRIVATE-123";
    const result = await captureAuthorityEvent({
      POSTHOG_PROJECT_TOKEN: "test-project-token",
      POSTHOG_API_HOST: "https://example.test",
    }, {
      event: "payment_verified",
      authority: "payments-worker",
      scope: "payment",
      distinctValue: rawRef,
      insertValue: rawRef,
      properties: {
        surface: "payment",
        payment_stage: "deposit",
        amount_thb: 17500,
        customer_name: "PRIVATE NAME",
        email: "private@example.test",
        line_user_id: "U-private",
      },
    });
    assert.equal(result.ok, true);
    assert.equal(requests.length, 1);
    const captured = requests[0].body;
    const serialized = JSON.stringify(captured);
    assert.equal(requests[0].url, "https://example.test/i/v0/e/");
    assert.equal(captured.event, "payment_verified");
    assert.match(captured.distinct_id, /^mmd_payment_[a-f0-9]{32}$/);
    assert.equal(serialized.includes(rawRef), false);
    assert.equal(serialized.includes("PRIVATE NAME"), false);
    assert.equal(serialized.includes("private@example.test"), false);
    assert.equal(serialized.includes("U-private"), false);
    assert.equal(captured.properties.amount_thb, 17500);
    assert.equal(captured.properties.$process_person_profile, false);
    assert.match(captured.properties.$insert_id, /^mmd_authority_[a-f0-9]{40}$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("authority analytics failure stays fail-open to the caller", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("network_down"); };
  try {
    const result = await captureAuthorityEvent({
      POSTHOG_PROJECT_TOKEN: "test-project-token",
    }, {
      event: "booking_received",
      authority: "sigil-booking-worker",
      distinctValue: "book-1",
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /network_down|posthog_capture_failed/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("queueAuthorityEvent attaches work to execution context without throwing", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("ok", { status: 200 });
  const pending = [];
  try {
    queueAuthorityEvent({ waitUntil(promise) { pending.push(promise); } }, {
      POSTHOG_PROJECT_TOKEN: "test-project-token",
    }, {
      event: "partner_terms_accepted",
      authority: "partners-worker",
      distinctValue: "recPartner",
    });
    assert.equal(pending.length, 1);
    const result = await pending[0];
    assert.equal(result.ok, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("authorityRuntimeHealth reports configured and queues one fail-open probe", async () => {
  const originalFetch = globalThis.fetch;
  const pending = [];
  globalThis.fetch = async () => new Response("ok", { status: 200 });
  try {
    const health = authorityRuntimeHealth({
      POSTHOG_PROJECT_TOKEN: "test-project-token",
      POSTHOG_API_HOST: "https://example.test",
    }, "payments-worker", {
      waitUntil(promise) { pending.push(promise); },
    });
    assert.deepEqual(health, { posthog_authority: "configured", schema: "mmd_authority_v1" });
    assert.equal(pending.length, 1);
    const result = await pending[0];
    assert.equal(result.ok, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("authorityRuntimeHealth reports missing without network activity", () => {
  let queued = 0;
  const health = authorityRuntimeHealth({}, "payments-worker", {
    waitUntil() { queued += 1; },
  });
  assert.deepEqual(health, { posthog_authority: "missing", schema: "mmd_authority_v1" });
  assert.equal(queued, 0);
});
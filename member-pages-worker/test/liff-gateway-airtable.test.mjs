import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { getLiffGatewayStore, LiffGatewayStorageError } from "../src/liff-gateway-airtable.js";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function env(overrides = {}) {
  return {
    AIRTABLE_API_KEY: "test-airtable-key-not-production",
    AIRTABLE_BASE_ID: "appTestBase",
    ...overrides,
  };
}

function mockAirtable(handler) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const request = {
      url: String(url),
      method: init.method || "GET",
      headers: new Headers(init.headers),
      body: init.body ? JSON.parse(init.body) : null,
      signal: init.signal,
    };
    calls.push(request);
    return handler(request);
  };
  return calls;
}

describe("LIFF gateway Airtable adapter", () => {
  it("writes only the bounded LIFF session fields through a mocked Airtable request", async () => {
    const calls = mockAirtable(async () => new Response(JSON.stringify({ id: "recLiff1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    const store = getLiffGatewayStore(env());
    const result = await store.upsertSession({
      session_id: "0a0b0c0d-0e0f-4a0b-8c0d-0e0f0a0b0c0d",
      liff_intent: "signup",
      source_channel: "line_liff",
      hype_decision_status: "asking_audience",
      hall_audience_context: "unknown",
      model_visibility_mode: "hold_until_selected",
      pricing_lane: "unknown",
      payment_intent_session_id: "liffpay_opaque",
      route_after_liff: "/member/membership",
      signed_route_token_hash: "a".repeat(64),
      identity_key: "must-not-leave-worker",
      raw_line_subject: "Uprivate",
      raw_signed_token: "never-store-me",
    });

    assert.deepEqual(result, { record_id: "recLiff1" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "POST");
    assert.match(calls[0].url, /MMD%20%E2%80%94%20LIFF%20Renewal%20Sessions/);
    assert.deepEqual(calls[0].body.fields, {
      session_id: "0a0b0c0d-0e0f-4a0b-8c0d-0e0f0a0b0c0d",
      liff_intent: "signup",
      source_channel: "line_liff",
      hype_decision_status: "asking_audience",
      hall_audience_context: "unknown",
      model_visibility_mode: "hold_until_selected",
      pricing_lane: "unknown",
      payment_intent_session_id: "liffpay_opaque",
      route_after_liff: "/member/membership",
      signed_route_token_hash: "a".repeat(64),
    });
    assert.doesNotMatch(JSON.stringify(calls[0].body), /must-not-leave-worker|Uprivate|never-store-me/);
  });

  it("preserves only approved null clears in an existing LIFF session PATCH", async () => {
    const calls = mockAirtable(async () => new Response(JSON.stringify({ id: "recLiff1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    const store = getLiffGatewayStore(env());
    await store.upsertSession({
      session_id: "1a1b1c1d-1e1f-4a1b-8c1d-1e1f1a1b1c1d",
      liff_intent: "signup",
      source_channel: undefined,
      hype_decision_status: null,
      hall_audience_context: "unknown",
      model_visibility_mode: undefined,
      pricing_lane: "unknown",
      payment_intent_session_id: null,
      route_after_liff: null,
      signed_route_token_hash: null,
    }, "recLiff1");

    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "PATCH");
    assert.deepEqual(calls[0].body.fields, {
      session_id: "1a1b1c1d-1e1f-4a1b-8c1d-1e1f1a1b1c1d",
      liff_intent: "signup",
      hall_audience_context: "unknown",
      pricing_lane: "unknown",
      payment_intent_session_id: null,
      route_after_liff: null,
      signed_route_token_hash: null,
    });
    assert.equal("source_channel" in calls[0].body.fields, false);
    assert.equal("hype_decision_status" in calls[0].body.fields, false);
    assert.equal("model_visibility_mode" in calls[0].body.fields, false);
  });

  it("uses a sanitized Flow Screens spec and strips unknown action endpoints", async () => {
    const calls = mockAirtable(async () => new Response(JSON.stringify({
      records: [{ fields: {
        screen_key: "start_intent",
        customer_copy: "ข้อความที่อนุมัติแล้วครับ",
        actions: JSON.stringify([
          { id: "signup", label: "สมัคร", endpoint: "/member/api/liff/intent" },
          { id: "bad", label: "Unsafe", endpoint: "https://example.invalid" },
        ]),
      } }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const screen = await getLiffGatewayStore(env()).loadScreen("start_intent");

    assert.deepEqual(screen, {
      key: "start_intent",
      copy: "ข้อความที่อนุมัติแล้วครับ",
      actions: [{ id: "signup", label: "สมัคร", endpoint: "/member/api/liff/intent", method: "POST" }],
    });
    assert.equal(calls.length, 1);
    assert.match(new URL(calls[0].url).searchParams.get("filterByFormula"), /screen_key/);
  });

  it("reads package and public-model availability through mocked Airtable requests only", async () => {
    const calls = mockAirtable(async (request) => {
      const table = decodeURIComponent(new URL(request.url).pathname.split("/").at(-1));
      if (table === "MMD — Non-Gay Package Rules") {
        return new Response(JSON.stringify({ records: [{ fields: {
          package_code: "believe",
          pricing_lane: "believe_member_2999",
          amount_thb: 2999,
          duration_days: 365,
          points_after_verification: 250,
          requires_manual_review: false,
        } }] }), { headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ records: [{ id: "recModel" }] }), { headers: { "content-type": "application/json" } });
    });
    const store = getLiffGatewayStore(env());
    const packageRule = await store.resolvePackage("believe");
    const available = await store.hasHallAudienceInventory("female_view");

    assert.deepEqual(packageRule, {
      package_code: "believe",
      pricing_lane: "believe_member_2999",
      amount_thb: 2999,
      duration_days: 365,
      points_after_verification: 250,
      requires_manual_review: false,
    });
    assert.equal(available, true);
    assert.equal(calls.length, 2);
    assert.match(new URL(calls[1].url).searchParams.get("filterByFormula"), /show_profile_to_female/);
  });

  it("rejects fractional package numeric values instead of truncating them", async () => {
    const validFields = {
      package_code: "standard",
      pricing_lane: "standard_1199",
      amount_thb: 1199,
      duration_days: 365,
      points_after_verification: 0,
      requires_manual_review: false,
    };
    for (const [field, value] of [
      ["amount_thb", 1199.5],
      ["duration_days", 365.5],
      ["points_after_verification", 0.5],
    ]) {
      const calls = mockAirtable(async () => new Response(JSON.stringify({
        records: [{ fields: { ...validFields, [field]: value } }],
      }), { headers: { "content-type": "application/json" } }));
      const packageRule = await getLiffGatewayStore(env()).resolvePackage("standard");

      assert.equal(packageRule, null, field);
      assert.equal(calls.length, 1, field);
    }
  });

  it("aborts a stalled Airtable request and returns a controlled storage failure", async () => {
    let aborted = false;
    globalThis.fetch = async (_url, init = {}) => new Promise((_resolve, reject) => {
      assert.ok(init.signal instanceof AbortSignal);
      init.signal.addEventListener("abort", () => {
        aborted = true;
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    });

    await assert.rejects(
      getLiffGatewayStore(env({ AIRTABLE_REQUEST_TIMEOUT_MS: 500 })).loadScreen("start_intent"),
      (error) => error instanceof LiffGatewayStorageError && error.code === "LIFF_GATEWAY_STORAGE_UNAVAILABLE",
    );
    assert.equal(aborted, true);
  });

  it("clears an Airtable timeout after a successful request", async () => {
    let aborted = false;
    const calls = mockAirtable(async (request) => {
      request.signal.addEventListener("abort", () => { aborted = true; }, { once: true });
      return new Response(JSON.stringify({ records: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const records = await getLiffGatewayStore(env({ AIRTABLE_REQUEST_TIMEOUT_MS: 500 })).loadScreen("start_intent");
    assert.equal(records, null);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].signal instanceof AbortSignal);
    await new Promise((resolve) => setTimeout(resolve, 550));
    assert.equal(aborted, false);
  });

  it("keeps Airtable 4xx and 5xx responses controlled", async () => {
    for (const status of [403, 500]) {
      mockAirtable(async () => new Response(JSON.stringify({ error: { type: "error" } }), {
        status,
        headers: { "content-type": "application/json" },
      }));

      await assert.rejects(
        getLiffGatewayStore(env()).loadScreen("start_intent"),
        (error) => error instanceof LiffGatewayStorageError
          && error.code === (status === 403 ? "LIFF_GATEWAY_STORAGE_FORBIDDEN" : "LIFF_GATEWAY_STORAGE_UNAVAILABLE"),
      );
    }
  });
});

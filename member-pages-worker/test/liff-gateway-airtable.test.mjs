import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { getLiffGatewayStore } from "../src/liff-gateway-airtable.js";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function env() {
  return {
    AIRTABLE_API_KEY: "test-airtable-key-not-production",
    AIRTABLE_BASE_ID: "appTestBase",
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
});

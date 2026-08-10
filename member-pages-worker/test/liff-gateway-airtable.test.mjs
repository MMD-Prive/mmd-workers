import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { getLiffGatewayStore, LIFF_GATEWAY_ROUTES, LiffGatewayStorageError } from "../src/liff-gateway-airtable.js";

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
    return handler(request, calls.length - 1);
  };
  return calls;
}

describe("LIFF gateway Airtable adapter", () => {
  it("maps the internal session id to the production renewal_session_id field", async () => {
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
      route_after_liff: "/sigil/member/membership",
      signed_route_token_hash: "a".repeat(64),
      campaign_code: "6-years-care-back",
      campaign_claim_id: "CB6-2026-ABCDEF12345678",
      promo_code: "ABC234",
      promo_status: "draft",
      identity_key: "must-not-leave-worker",
      raw_line_subject: "Uprivate",
      raw_signed_token: "never-store-me",
    });

    assert.deepEqual(result, { record_id: "recLiff1" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "POST");
    assert.match(calls[0].url, /tblXjQFwo0A2cHseh/);
    assert.deepEqual(calls[0].body.fields, {
      renewal_session_id: "0a0b0c0d-0e0f-4a0b-8c0d-0e0f0a0b0c0d",
      liff_intent: "signup",
      source_channel: "line_liff",
      hype_decision_status: "asking_audience",
      hall_audience_context: "unknown",
      model_visibility_mode: "hold_until_selected",
      pricing_lane: "unknown",
      payment_intent_session_id: "liffpay_opaque",
      route_after_liff: "/member/membership",
      signed_route_token_hash: "a".repeat(64),
      campaign_code: "6-years-care-back",
      campaign_claim_id: "CB6-2026-ABCDEF12345678",
      promo_code: "ABC234",
      promo_status: "draft",
    });
    assert.equal("session_id" in calls[0].body.fields, false);
    assert.doesNotMatch(JSON.stringify(calls[0].body), /must-not-leave-worker|Uprivate|never-store-me/);
    assert.equal(LIFF_GATEWAY_ROUTES.has("/sigil/member/membership"), true);
    assert.equal(LIFF_GATEWAY_ROUTES.has("/member/membership"), false);
  });

  it("fails closed before Airtable when a session select option or route is outside the validated schema", async () => {
    const calls = mockAirtable(async () => {
      throw new Error("invalid schema values must not reach Airtable");
    });
    const store = getLiffGatewayStore(env());
    const base = {
      session_id: "2a2b2c2d-2e2f-4a2b-8c2d-2e2f2a2b2c2d",
      liff_intent: "signup",
      source_channel: "line_liff",
      hype_decision_status: "asking_audience",
      hall_audience_context: "unknown",
      model_visibility_mode: "hold_until_selected",
      pricing_lane: "unknown",
      route_after_liff: null,
    };

    for (const change of [
      { liff_intent: "renamed_intent" },
      { source_channel: "browser_claim" },
      { model_visibility_mode: "show_everything" },
      { pricing_lane: "unverified_lane" },
      { route_after_liff: "/member/membership" },
    ]) {
      await assert.rejects(
        store.upsertSession({ ...base, ...change }),
        (error) => error instanceof LiffGatewayStorageError && error.code === "LIFF_GATEWAY_SCHEMA_MISMATCH",
      );
    }
    await assert.rejects(
      store.upsertSession({ ...base, session_id: "" }),
      (error) => error instanceof LiffGatewayStorageError && error.code === "LIFF_GATEWAY_SESSION_INVALID",
    );
    await assert.rejects(
      store.recordDecision({
        liff_session_id: base.session_id,
        hall_audience_context: "unsafe_audience",
        model_visibility_mode: "hold_until_selected",
        pricing_lane: "unknown",
        route_after_liff: null,
      }),
      (error) => error instanceof LiffGatewayStorageError && error.code === "LIFF_GATEWAY_SCHEMA_MISMATCH",
    );
    assert.equal(calls.length, 0);
  });

  it("preserves only approved null clears in an existing production LIFF session PATCH", async () => {
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
      renewal_session_id: "1a1b1c1d-1e1f-4a1b-8c1d-1e1f1a1b1c1d",
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

  it("links HYPE decisions to the production LINE Renewal Session record and omits nonexistent fields", async () => {
    const calls = mockAirtable(async (request, index) => {
      if (index === 0) {
        return new Response(JSON.stringify({ records: [{ id: "recRenewal1", fields: { renewal_session_id: "session-123" } }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ id: "recDecision1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const store = getLiffGatewayStore(env());
    await store.recordDecision({
      liff_session_id: "session-123",
      hype_decision_status: "decided",
      hall_audience_context: "female_view",
      model_visibility_mode: "show_female_profiles",
      pricing_lane: "believe_member_2999",
      route_after_liff: "/hall",
    });

    assert.equal(calls.length, 2);
    assert.equal(calls[0].method, "GET");
    assert.match(calls[0].url, /tblXjQFwo0A2cHseh/);
    assert.match(new URL(calls[0].url).searchParams.get("filterByFormula"), /renewal_session_id/);
    assert.equal(calls[1].method, "POST");
    assert.match(calls[1].url, /tblvUnooDYwVsHY91/);
    assert.deepEqual(calls[1].body.fields["LINE Renewal Session"], ["recRenewal1"]);
    assert.equal(calls[1].body.fields.source_channel, "line_liff");
    assert.equal(calls[1].body.fields.source_path, "/sigil/member/membership");
    assert.equal(calls[1].body.fields.hall_audience_context, "female_view");
    assert.equal(calls[1].body.fields.model_visibility_mode, "show_female_profiles");
    assert.equal(calls[1].body.fields.package_context, "believe_member_2999");
    assert.equal(calls[1].body.fields.route_target, "/hall");
    assert.match(calls[1].body.fields.decision_id, /^hype_lane_\d+_[0-9a-f-]{8}$/i);
    assert.equal("liff_session_id" in calls[1].body.fields, false);
    assert.equal("hype_decision_status" in calls[1].body.fields, false);
    assert.equal("pricing_lane" in calls[1].body.fields, false);
    assert.equal("route_after_liff" in calls[1].body.fields, false);
  });

  it("fails closed when a HYPE decision cannot resolve exactly one renewal-session record", async () => {
    mockAirtable(async () => new Response(JSON.stringify({ records: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));

    await assert.rejects(
      getLiffGatewayStore(env()).recordDecision({ liff_session_id: "missing-session" }),
      (error) => error instanceof LiffGatewayStorageError && error.code === "LIFF_GATEWAY_STORAGE_MALFORMED",
    );
  });

  it("treats production Flow Screen text/actions as metadata only, never customer-authoritative output", async () => {
    const calls = mockAirtable(async () => new Response(JSON.stringify({
      records: [{ fields: {
        screen_key: "start_intent",
        status: "active",
        headline_th: "HYPE UNSAFE",
        body_copy_th: "ชำระแล้วและอนุมัติสมาชิกทันที",
        primary_button_th: "รับสิทธิ์ทันที",
        backend_action: "unsafe production instruction",
        next_route_default: "/hall",
      } }],
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const screen = await getLiffGatewayStore(env()).loadScreen("start_intent");
    assert.equal(screen, null);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /tbl1g1uRkvLg5NdM1/);
    assert.match(new URL(calls[0].url).searchParams.get("filterByFormula"), /screen_key/);
  });

  it("reads package rules using production package_rule_code, price_thb, duration_days, and points_granted fields", async () => {
    const calls = mockAirtable(async (request) => {
      const table = decodeURIComponent(new URL(request.url).pathname.split("/").at(-1));
      if (table === "tble4VuGT9gPsJ2Sh") {
        return new Response(JSON.stringify({ records: [{ fields: {
          package_rule_code: "believe_member_2999",
          pricing_lane: "believe_member_2999",
          price_thb: 2999,
          duration_days: 365,
          points_granted: 250,
          requires_manual_review: false,
        } }] }), { headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ records: [{ id: "recModel" }] }), { headers: { "content-type": "application/json" } });
    });
    const store = getLiffGatewayStore(env());
    const packageRule = await store.resolvePackage("believe_member_2999");
    const available = await store.hasHallAudienceInventory("female_view");

    assert.deepEqual(packageRule, {
      package_code: "believe_member_2999",
      pricing_lane: "believe_member_2999",
      amount_thb: 2999,
      duration_days: 365,
      points_after_verification: 250,
      requires_manual_review: false,
    });
    assert.equal(available, true);
    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /tble4VuGT9gPsJ2Sh/);
    assert.match(new URL(calls[0].url).searchParams.get("filterByFormula"), /package_rule_code/);
    assert.match(calls[1].url, /tbluxhFpAAu6yY9mp/);
    assert.match(new URL(calls[1].url).searchParams.get("filterByFormula"), /show_profile_to_female/);
  });

  it("rejects fractional production package numeric values instead of truncating them", async () => {
    const validFields = {
      package_rule_code: "believe_member_2999",
      pricing_lane: "believe_member_2999",
      price_thb: 2999,
      duration_days: 365,
      points_granted: 250,
      requires_manual_review: false,
    };
    for (const [field, value] of [
      ["price_thb", 2999.5],
      ["price_thb", "2999"],
      ["duration_days", 365.5],
      ["points_granted", 250.5],
    ]) {
      const calls = mockAirtable(async () => new Response(JSON.stringify({
        records: [{ fields: { ...validFields, [field]: value } }],
      }), { headers: { "content-type": "application/json" } }));
      const packageRule = await getLiffGatewayStore(env()).resolvePackage("believe_member_2999");

      assert.equal(packageRule, null, field);
      assert.equal(calls.length, 1, field);
    }
  });

  it("fails closed on mismatched package code, unsupported lane, or non-boolean manual-review metadata", async () => {
    for (const fields of [
      {
        package_rule_code: "different_package",
        pricing_lane: "believe_member_2999",
        price_thb: 2999,
        duration_days: 365,
        points_granted: 250,
        requires_manual_review: false,
      },
      {
        package_rule_code: "believe_member_2999",
        pricing_lane: "standard_1199",
        price_thb: 1199,
        duration_days: 30,
        points_granted: 0,
        requires_manual_review: false,
      },
      {
        package_rule_code: "believe_member_2999",
        pricing_lane: "believe_member_2999",
        price_thb: 2999,
        duration_days: 365,
        points_granted: 250,
        requires_manual_review: "false",
      },
    ]) {
      const calls = mockAirtable(async () => new Response(JSON.stringify({ records: [{ fields }] }), {
        headers: { "content-type": "application/json" },
      }));
      const packageRule = await getLiffGatewayStore(env()).resolvePackage("believe_member_2999");

      assert.equal(packageRule, null);
      assert.equal(calls.length, 1);
      assert.match(calls[0].url, /tble4VuGT9gPsJ2Sh/);
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

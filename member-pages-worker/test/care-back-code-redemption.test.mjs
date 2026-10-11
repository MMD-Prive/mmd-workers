import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { getCareBackStore } from "../src/care-back-claim-store.js";
import { handleTrustedCareBackCodeRedemption } from "../src/care-back-code-redemption.js";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const SECRET = "payments-to-member-pages-test-secret-1234567";
const PROMO_ID = `rec${"P".repeat(14)}`;
const MODEL_ID = "recABCDEFGHIJKLMN";
const NOW = new Date("2026-10-11T03:00:00.000Z");

function promoFields(overrides = {}) {
  return {
    code: "GGQYHK",
    campaign_code: "6-years-care-back",
    status: "active",
    used_count: 0,
    activated_at: "2026-10-01T00:00:00.000Z",
    expires_at: "2026-12-01T00:00:00.000Z",
    payload_json: JSON.stringify({ schema_version: 3, claim_id: "CB6-2026-ABC", wish_submitted: true }),
    ...overrides,
  };
}

function fakeAirtable(initial) {
  const state = { fields: initial, patches: [], models: { working_name: "EI", model_tier: "standard", job_types: ["PN", "VIP"] } };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method || "GET";
    if (url.pathname.endsWith(`/${MODEL_ID}`)) return Response.json({ id: MODEL_ID, fields: state.models });
    if (method === "GET") return Response.json({ records: state.fields ? [{ id: PROMO_ID, fields: state.fields }] : [] });
    if (method === "PATCH") {
      const body = JSON.parse(init.body);
      state.patches.push(body.fields);
      state.fields = { ...state.fields, ...body.fields };
      return Response.json({ id: PROMO_ID, fields: state.fields });
    }
    throw new Error(`unexpected ${method} ${url}`);
  };
  return state;
}

const env = { AIRTABLE_API_KEY: "k", AIRTABLE_BASE_ID: "app_test", LIFF_SESSION_SECRET: "x".repeat(40) };
const redeem = (args) => getCareBackStore(env).redeemCouponByCode({ code: "ggqyhk", sessionId: "S-1", modelLevel: "Standard", jobFormat: "PN", now: NOW, ...args });

test("redeems an active coupon: percent comes from model level x job format and the coupon is consumed", async () => {
  const state = fakeAirtable(promoFields());
  const out = await redeem();
  assert.equal(out.approved_discount_percent, 5);
  assert.equal(out.replayed, false);
  assert.equal(state.patches[0].status, "used");
  assert.equal(state.patches[0].used_count, 1);
  assert.equal(JSON.parse(state.patches[0].payload_json).redemption.session_id, "S-1");
});

test("Standard VIP is 7 and Premium VIP is 10", async () => {
  fakeAirtable(promoFields());
  assert.equal((await redeem({ jobFormat: "VIP" })).approved_discount_percent, 7);
  fakeAirtable(promoFields());
  assert.equal((await redeem({ modelLevel: "Premium", jobFormat: "VIP" })).approved_discount_percent, 10);
});

test("replaying the same session is idempotent but another session is rejected", async () => {
  fakeAirtable(promoFields());
  await redeem();
  const again = await redeem();
  assert.equal(again.replayed, true);
  assert.equal(again.approved_discount_percent, 5);
  await assert.rejects(() => redeem({ sessionId: "S-2" }), { code: "CARE_BACK_COUPON_USED" });
});

test("rejects bad format, unknown, expired, revoked, not-ready and wish-less codes", async () => {
  fakeAirtable(promoFields());
  await assert.rejects(() => redeem({ code: "12345" }), { code: "CARE_BACK_CODE_INVALID" });
  await assert.rejects(() => redeem({ code: "ABCDEI" }), { code: "CARE_BACK_CODE_INVALID" });
  fakeAirtable(null);
  await assert.rejects(() => redeem(), { code: "CARE_BACK_CODE_NOT_FOUND" });
  fakeAirtable(promoFields({ expires_at: "2026-10-10T00:00:00.000Z" }));
  await assert.rejects(() => redeem(), { code: "CARE_BACK_COUPON_EXPIRED" });
  fakeAirtable(promoFields({ status: "revoked" }));
  await assert.rejects(() => redeem(), { code: "CARE_BACK_COUPON_UNAVAILABLE" });
  fakeAirtable(promoFields({ status: "draft" }));
  await assert.rejects(() => redeem(), { code: "CARE_BACK_COUPON_NOT_READY" });
  fakeAirtable(promoFields({ payload_json: JSON.stringify({ claim_id: "CB6-2026-ABC", wish_submitted: false }) }));
  await assert.rejects(() => redeem(), { code: "CARE_BACK_WISH_REQUIRED" });
});

test("a lost race is detected: another session wrote the redemption first", async () => {
  const state = fakeAirtable(promoFields());
  const realPatchFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const response = await realPatchFetch(input, init);
    if ((init.method || "GET") === "PATCH") {
      state.fields = { ...state.fields, payload_json: JSON.stringify({ claim_id: "CB6-2026-ABC", wish_submitted: true, redemption: { session_id: "S-OTHER" } }) };
    }
    return response;
  };
  await assert.rejects(() => redeem(), { code: "CARE_BACK_COUPON_USED" });
});

function req(body, secret = SECRET) {
  return new Request("https://member-pages-worker.internal/__internal/care-back/redeem-code", {
    method: "POST",
    headers: { "content-type": "application/json", "x-mmd-payments-secret": secret },
    body: JSON.stringify(body),
  });
}
const handlerEnv = { ...env, AUTH_SERVICE_PAYMENTS_TO_MEMBER_PAGES: SECRET, AIRTABLE_TABLE_MODELS_ID: "models" };
const goodBody = { code: "GGQYHK", session_id: "S-1", selected_model_id: MODEL_ID, job_format: "PN" };

test("handler requires service auth and refuses caller-supplied percent", async () => {
  fakeAirtable(promoFields());
  assert.equal((await handleTrustedCareBackCodeRedemption(req(goodBody, "nope"), handlerEnv)).status, 401);
  const res = await handleTrustedCareBackCodeRedemption(req({ ...goodBody, approved_discount_percent: 50 }), handlerEnv);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "caller_discount_authority_rejected");
});

test("handler approves Standard model PN at 5 percent and maps rejections to 409", async () => {
  fakeAirtable(promoFields());
  const ok = await handleTrustedCareBackCodeRedemption(req(goodBody), handlerEnv);
  const payload = await ok.json();
  assert.equal(ok.status, 200);
  assert.equal(payload.approved_discount_percent, 5);
  assert.equal(payload.model_level, "Standard Models");
  const used = await handleTrustedCareBackCodeRedemption(req({ ...goodBody, session_id: "S-2" }), handlerEnv);
  assert.equal(used.status, 409);
  const body = await used.json();
  assert.equal(body.status, "rejected");
  assert.equal(body.error, "CARE_BACK_COUPON_USED");
});

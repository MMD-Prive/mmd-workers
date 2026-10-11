import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { getCareBackStore } from "../src/care-back-claim-store.js";
import {
  handleTrustedCareBackCodeRedemption,
  handleTrustedCareBackCodeRoute,
} from "../src/care-back-code-redemption.js";
import { keyedDigest } from "../src/care-back-trusted-booking-approval.js";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const SECRET = "payments-to-member-pages-test-secret-1234567";
const PROMO_ID = `rec${"P".repeat(14)}`;
const MODEL_ID = "recABCDEFGHIJKLMN";
const NOW = new Date("2026-10-11T03:00:00.000Z");
const LINE_ID = `U${"a".repeat(32)}`;
const LIFF = "x".repeat(40);
const LINE_HASH = await keyedDigest({ LIFF_SESSION_SECRET: LIFF }, `identity:${LINE_ID}`);

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
  const state = { fields: initial, claim: { claim_id: "CB6-2026-ABC", campaign_id: "6-years-care-back", line_user_id_hash: LINE_HASH, matched_member_id: "MMD-001" }, patches: [], models: { working_name: "EI", model_tier: "standard", job_types: ["PN", "VIP"] } };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method || "GET";
    if (url.pathname.endsWith(`/${MODEL_ID}`)) return Response.json({ id: MODEL_ID, fields: state.models });
    if (method === "GET") {
      const table = decodeURIComponent(url.pathname.split("/").at(-1));
      if (table === "MMD — Campaign Claims") return Response.json({ records: [{ id: `rec${"C".repeat(14)}`, fields: state.claim }] });
      return Response.json({ records: state.fields ? [{ id: PROMO_ID, fields: state.fields }] : [] });
    }
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

test("owner binding: matching identity is bound; a different customer is refused before anything is consumed", async () => {
  const state = fakeAirtable(promoFields());
  const ok = await redeem({ memberId: "MMD-001", lineUserIdHash: LINE_HASH });
  assert.equal(ok.identity_bound, true);
  assert.equal(JSON.parse(state.patches[0].payload_json).redemption.identity_bound, true);

  const other = fakeAirtable(promoFields());
  await assert.rejects(() => redeem({ memberId: "MMD-999" }), { code: "CARE_BACK_CODE_OWNER_MISMATCH" });
  await assert.rejects(() => redeem({ lineUserIdHash: "f".repeat(64) }), { code: "CARE_BACK_CODE_OWNER_MISMATCH" });
  assert.equal(other.patches.length, 0);

  const anon = fakeAirtable(promoFields());
  const out = await redeem();
  assert.equal(out.identity_bound, false);
  assert.equal(JSON.parse(anon.patches[0].payload_json).redemption.identity_bound, false);
});

test("release gives the coupon back so a different session can use it; history is kept", async () => {
  const state = fakeAirtable(promoFields());
  await redeem();
  const store = getCareBackStore(env);
  const out = await store.releaseCouponForSession({ sessionId: "S-1", reason: "job_cancelled", now: NOW });
  assert.equal(out.status, "active");
  const last = state.patches.at(-1);
  assert.equal(last.status, "active");
  assert.equal(last.used_count, 0);
  const payload = JSON.parse(last.payload_json);
  assert.equal(payload.redemption, undefined);
  assert.equal(payload.releases[0].session_id, "S-1");
  assert.equal(payload.releases[0].reason, "job_cancelled");
  assert.equal((await redeem({ sessionId: "S-2" })).approved_discount_percent, 5);
});

test("release refuses unknown sessions and never frees a coupon bound elsewhere", async () => {
  fakeAirtable(promoFields());
  await redeem();
  await assert.rejects(() => getCareBackStore(env).releaseCouponForSession({ sessionId: "S-OTHER", now: NOW }), { code: "CARE_BACK_REDEMPTION_NOT_FOUND" });
});

test("handler checks line id format, hashes identity, and release route is service-authed", async () => {
  fakeAirtable(promoFields());
  const hEnv = { ...handlerEnv, LIFF_SESSION_SECRET: LIFF };
  const bad = await handleTrustedCareBackCodeRoute(req({ ...goodBody, line_user_id: "not-a-line-id" }), hEnv);
  assert.equal(bad.status, 409);
  const wrong = await handleTrustedCareBackCodeRoute(req({ ...goodBody, line_user_id: `U${"b".repeat(32)}` }), hEnv);
  assert.equal(wrong.status, 409);
  assert.equal((await wrong.json()).error, "CARE_BACK_CODE_OWNER_MISMATCH");
  const good = await handleTrustedCareBackCodeRoute(req({ ...goodBody, line_user_id: LINE_ID, member_id: "MMD-001" }), hEnv);
  const body = await good.json();
  assert.equal(good.status, 200);
  assert.equal(body.identity_bound, true);

  const release = (secret) => new Request("https://member-pages-worker.internal/__internal/care-back/release-code", {
    method: "POST",
    headers: { "content-type": "application/json", "x-mmd-payments-secret": secret },
    body: JSON.stringify({ session_id: "S-1", reason: "job_cancelled" }),
  });
  assert.equal((await handleTrustedCareBackCodeRoute(release("nope"), hEnv)).status, 401);
  const released = await handleTrustedCareBackCodeRoute(release(SECRET), hEnv);
  assert.equal(released.status, 200);
  assert.equal((await released.json()).code_status, "active");
});

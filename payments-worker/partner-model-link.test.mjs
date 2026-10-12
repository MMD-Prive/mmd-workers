import assert from "node:assert/strict";
import test from "node:test";
import { handlePartnerModelLink } from "./partner-model-link.js";

function setup({ system = "co_partner", partner = "P-001", pay = undefined, verified = "verified" } = {}) {
  const kv = new Map();
  const patches = [];
  const env = {
    AIRTABLE_BASE_ID: "app-test", AIRTABLE_API_KEY: "key",
    AUTH_SERVICE_PARTNERS_TO_PAYMENTS: "svc",
    PAYMENT_CONFIRMATION_SIGNING_SECRET: "signing-secret-for-partner-model-link-test",
    PAY_TOKEN_TTL_SECONDS: "3600", WEB_BASE_URL: "https://mmdbkk.com",
    PAY_SESSIONS_KV: { async put(k, v) { kv.set(k, v); }, async get(k) { return kv.get(k) || null; } },
  };
  const fetchStub = async (input, init = {}) => {
    const r = input instanceof Request ? input : new Request(input, init);
    const u = new URL(r.url);
    if (r.method === "GET" && u.pathname.includes("tblC98mKWbzmPuNzX")) {
      return Response.json({ records: [{ id: "recS", fields: {
        fldLTq2kZbyRv22IA: "sess_1", fldhwC79ndbnEXSZz: 20000, fldojgjSQLaO0uQLX: "pay_1",
        fld0jkscGAtyX7i2J: partner, fldfqNBNKkmQdr6Fp: JSON.stringify({ system }),
        ...(pay ? { fldlTO5aNfqUmlNWm: pay } : {}),
      } }] });
    }
    if (r.method === "GET" && u.pathname.includes("tblWGGJJOx5eBvBZJ")) {
      return Response.json({ records: [{ id: "recP", fields: { fldOO6SY49iDw8VBZ: "pay_1", fldrr9g8ZZjqAbdKQ: "deposit", fldJ7a0Ube9F0bmRy: verified } }] });
    }
    if (r.method === "PATCH") { patches.push((await r.json()).fields); return Response.json({ id: "recS" }); }
    throw new Error("unexpected_fetch:" + r.url);
  };
  return { env, kv, patches, fetchStub };
}

async function call(ctx, body, token = "svc") {
  const original = globalThis.fetch;
  globalThis.fetch = ctx.fetchStub;
  try {
    return await handlePartnerModelLink(new Request("https://x/v1/internal/confirm/partner-model-link", {
      method: "POST", headers: { "content-type": "application/json", "x-internal-token": token }, body: JSON.stringify(body),
    }), ctx.env);
  } finally { globalThis.fetch = original; }
}

test("issues neutral model link and stores the Partner-entered price", async () => {
  const ctx = setup();
  const res = await call(ctx, { session_id: "sess_1", partner_id: "P-001", pay_model_thb: 12000 });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.model_confirmation_url, /^https:\/\/mmdbkk\.com\/sigil\/confirm\/job-model\?t=/);
  assert.deepEqual(ctx.patches, [{ fldlTO5aNfqUmlNWm: 12000 }]);
  const claims = JSON.parse(Buffer.from(new URL(body.model_confirmation_url).searchParams.get("t").split(".")[0], "base64url").toString());
  assert.equal(claims.neutral, true);
  assert.equal(claims.via, "partner");
  assert.equal(claims.role, "model");
  assert.equal(ctx.kv.size, 1);
});

test("rejects missing service auth, wrong partner, bridge system, unverified payment, price conflicts", async () => {
  assert.equal((await call(setup(), { session_id: "sess_1", partner_id: "P-001", pay_model_thb: 1 }, "bad")).status, 401);
  assert.equal((await call(setup(), { session_id: "sess_1", partner_id: "P-999", pay_model_thb: 12000 })).status, 403);
  assert.equal((await call(setup({ system: "bridge" }), { session_id: "sess_1", partner_id: "P-001", pay_model_thb: 12000 })).status, 409);
  assert.equal((await call(setup({ verified: "pending_review" }), { session_id: "sess_1", partner_id: "P-001", pay_model_thb: 12000 })).status, 409);
  assert.equal((await call(setup({ pay: 9000 }), { session_id: "sess_1", partner_id: "P-001", pay_model_thb: 12000 })).status, 409);
  assert.equal((await call(setup(), { session_id: "sess_1", partner_id: "P-001", pay_model_thb: 25000 })).status, 409);
  assert.equal((await call(setup(), { session_id: "sess_1", partner_id: "P-001", pay_model_thb: -5 })).status, 400);
});

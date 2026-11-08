import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createConfirmTokenRecord, signConfirmToken, verifyConfirmToken } from "./index.js";
import { PartnerModelLinkIssuer, handlePartnerModelLink } from "./partner-model-link.js";

function setup({ system = "co_partner", partner = "P-001", pay = undefined, verified = "verified", payment = {}, session = {}, legacy = false } = {}) {
  const kv = new Map();
  const patches = [];
  const records = new Map();
  let queue = Promise.resolve();
  let kvWrites = 0;
  let failAfterKv = false;
  const env = {
    AIRTABLE_BASE_ID: "app-test", AIRTABLE_API_KEY: "key",
    AUTH_SERVICE_PARTNERS_TO_PAYMENTS: "svc",
    PAYMENT_CONFIRMATION_SIGNING_SECRET: "signing-secret-for-partner-model-link-test",
    PARTNER_MODEL_LINK_CUTOVER_AT: "2026-11-08T00:00:00Z",
    PAY_TOKEN_TTL_SECONDS: "3600", WEB_BASE_URL: "https://mmdbkk.com",
    PAY_SESSIONS_KV: { async put(k, v) { kvWrites++; kv.set(k, v); if (failAfterKv) { failAfterKv = false; throw Error("write outcome lost"); } }, async get(k) { return kv.get(k) || null; } },
  };
  const createIssuer = () => new PartnerModelLinkIssuer({
    storage: { async get(k) { return records.get(k); }, async put(k, value) { records.set(k, structuredClone(value)); } },
    blockConcurrencyWhile(fn) { const next = queue.then(fn); queue = next.catch(() => {}); return next; },
  }, env);
  let issuer = createIssuer();
  env.PARTNER_MODEL_LINK_ISSUER = { idFromName: id => id, get(id) { assert.equal(id, "sess_1"); return issuer; } };
  const fetchStub = async (input, init = {}) => {
    const r = input instanceof Request ? input : new Request(input, init);
    const u = new URL(r.url);
    if (r.method === "GET" && u.pathname.includes("tblC98mKWbzmPuNzX")) {
      return Response.json({ records: [{ id: "recS", createdTime: legacy ? "2026-11-07T23:00:00Z" : "2026-11-08T00:01:00Z", fields: {
        fldLTq2kZbyRv22IA: "sess_1", fldhwC79ndbnEXSZz: 20000, fldojgjSQLaO0uQLX: "pay_1",
        fld0jkscGAtyX7i2J: partner, fldfqNBNKkmQdr6Fp: JSON.stringify({ system }),
        fldrAQxUX4pRqz6qr: "confirmed", fldTY5lE6m0kQf72n: "deposit_paid",
        fldLonXanVTSybnpv: legacy ? "2026-11-07T23:59:00Z" : "2026-11-08T00:01:00Z",
        ...(pay ? { fldlTO5aNfqUmlNWm: pay } : {}),
        ...session,
      } }] });
    }
    if (r.method === "GET" && u.pathname.includes("tblWGGJJOx5eBvBZJ")) {
      return Response.json({ records: [{ id: "recP", fields: { fldOO6SY49iDw8VBZ: "pay_1", fldrr9g8ZZjqAbdKQ: "deposit", fldJ7a0Ube9F0bmRy: verified, fld2wdhBvc8xrV6y5: "sess_1", fldvCSwrUW8OMAooS: 5000, ...payment } }] });
    }
    if (r.method === "PATCH") { const fields = (await r.json()).fields; patches.push(fields); pay = fields.fldlTO5aNfqUmlNWm; return Response.json({ id: "recS" }); }
    throw new Error("unexpected_fetch:" + r.url);
  };
  return { env, kv, patches, fetchStub, records, get kvWrites() { return kvWrites; }, restart() { issuer = createIssuer(); }, failAfterWrite() { failAfterKv = true; } };
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

const job = { session_id: "sess_1", partner_id: "P-001", pay_model_thb: 12000 };

test("concurrent tabs and a restarted issuer return the same link with one write", async () => {
  const ctx = setup();
  const original = globalThis.fetch;
  globalThis.fetch = ctx.fetchStub;
  try {
    const issue = async () => (await handlePartnerModelLink(new Request("https://x/v1/internal/confirm/partner-model-link", {
      method: "POST", headers: { "x-internal-token": "svc" }, body: JSON.stringify(job),
    }), ctx.env)).json();
    const [a, b] = await Promise.all([issue(), issue()]);
    assert.ok(a.model_confirmation_url);
    assert.deepEqual(a, b);
    ctx.restart();
    assert.deepEqual(await issue(), a);
    assert.equal(ctx.kvWrites, 1);
    assert.equal(ctx.patches.length, 1);
    assert.equal(JSON.stringify([...ctx.records.values()]).includes(new URL(a.model_confirmation_url).searchParams.get("t")), false);
  } finally { globalThis.fetch = original; }
});

test("lost KV acknowledgement resumes the same issuance after restart", async () => {
  const ctx = setup();
  ctx.failAfterWrite();
  assert.equal((await call(ctx, job)).status, 500);
  assert.equal(ctx.records.get("issuance").state, "pending");
  ctx.restart();
  const result = await call(ctx, job);
  assert.equal(result.status, 200);
  assert.equal(ctx.kvWrites, 1);
  assert.equal(ctx.patches.length, 1);
  assert.equal(ctx.records.get("issuance").state, "complete");
});

test("pre-cutover jobs require proof and adopt a verified old link without minting", async () => {
  const ctx = setup({ legacy: true, pay: 12000 });
  assert.equal((await (await call(ctx, job)).json()).error, "model_link_legacy_review_required");
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    kind: "model_confirm", role: "model", session_id: "sess_1", payment_ref: "pay_1",
    payment_type: "deposit", via: "partner", neutral: true, iat: now - 20, exp: now + 120,
  };
  const token = await signConfirmToken(claims, ctx.env.PAYMENT_CONFIRMATION_SIGNING_SECRET);
  await createConfirmTokenRecord(ctx.env, token, claims);
  const res = await call(ctx, { ...job, existing_model_token: token });
  assert.equal(res.status, 200);
  assert.equal(new URL((await res.json()).model_confirmation_url).searchParams.get("t"), token);
  assert.equal(ctx.kvWrites, 1);
  assert.equal(ctx.patches.length, 0);
  ctx.kv.clear();
  assert.equal((await call(ctx, job)).status, 503);
  assert.equal(ctx.kvWrites, 1);
});

test("replay rechecks the exact payment, lifecycle, and current owner", async () => {
  const payment = {}, session = {};
  const ctx = setup({ payment, session });
  assert.equal((await call(ctx, job)).status, 200);
  payment.fldEJ1hmm7KwWuI6q = "refunded";
  assert.equal((await call(ctx, job)).status, 409);
  delete payment.fldEJ1hmm7KwWuI6q;
  payment.fld2wdhBvc8xrV6y5 = "other";
  assert.equal((await call(ctx, job)).status, 409);
  delete payment.fld2wdhBvc8xrV6y5;
  payment.fldrr9g8ZZjqAbdKQ = "";
  assert.equal((await call(ctx, job)).status, 409);
  delete payment.fldrr9g8ZZjqAbdKQ;
  session.fld57fhdWqIcOy4Jp = "cancelled";
  assert.equal((await call(ctx, job)).status, 409);
  delete session.fld57fhdWqIcOy4Jp;
  session.fld0jkscGAtyX7i2J = "P-002";
  assert.equal((await call(ctx, job)).status, 403);
  assert.equal(ctx.kvWrites, 1);
});

test("missing cutover or coordinator fails closed without issuing a link", async () => {
  const ctx = setup();
  delete ctx.env.PARTNER_MODEL_LINK_CUTOVER_AT;
  assert.equal((await call(ctx, job)).status, 503);
  delete ctx.env.PARTNER_MODEL_LINK_ISSUER;
  assert.equal((await call(ctx, job)).status, 503);
  assert.equal(ctx.kvWrites, 0);
  assert.equal(ctx.patches.length, 0);
});

test("production config exposes the issuer on its actual entrypoint", async () => {
  const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
  const config = await read("./wrangler.merged.toml");
  const entry = await read("./index.session-paid-projection-wrapper.js");
  const router = await read("./index.review-wrapper.js");
  assert.match(config, /^main = "index.session-paid-projection-wrapper.js"$/m);
  assert.match(config, /name = "PARTNER_MODEL_LINK_ISSUER"\nclass_name = "PartnerModelLinkIssuer"/);
  assert.match(config, /new_sqlite_classes = \["PartnerModelLinkIssuer"\]/);
  assert.match(entry, /export \{ PartnerModelLinkIssuer \} from "\.\/partner-model-link\.js"/);
  assert.match(router, /if \(isPartnerModelLinkRequest\(path, method\)\) \{\s*return handlePartnerModelLink\(request, env\)/);
});

test("an uncertain registration with no readable KV record cannot recreate a revoked token", async () => {
  const ctx = setup();
  ctx.failAfterWrite();
  assert.equal((await call(ctx, job)).status, 500);
  ctx.kv.clear();
  ctx.restart();
  assert.equal((await call(ctx, job)).status, 503);
  assert.equal(ctx.kvWrites, 1);
});

test("reconfirmation cannot bypass cutover on a job created before it", async () => {
  const ctx = setup({ legacy: true, session: { fldLonXanVTSybnpv: "2026-11-08T00:10:00Z" } });
  assert.equal((await (await call(ctx, job)).json()).error, "model_link_legacy_review_required");
  assert.equal(ctx.kvWrites, 0);
});

test("a legacy token cannot set a missing model price", async () => {
  const ctx = setup({ legacy: true });
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    kind: "model_confirm", role: "model", session_id: "sess_1", payment_ref: "pay_1",
    payment_type: "deposit", via: "partner", neutral: true, iat: now - 20, exp: now + 120,
  };
  const token = await signConfirmToken(claims, ctx.env.PAYMENT_CONFIRMATION_SIGNING_SECRET);
  await createConfirmTokenRecord(ctx.env, token, claims);
  assert.equal((await (await call(ctx, { ...job, existing_model_token: token })).json()).error, "model_link_legacy_review_required");
  assert.equal(ctx.patches.length, 0);
});

test("issuance pause preserves authentication and existing links, without touching issuance state", async () => {
  const ctx = setup();
  const issued = await (await call(ctx, job)).json();
  const token = new URL(issued.model_confirmation_url).searchParams.get("t");
  ctx.env.PARTNER_MODEL_LINK_ISSUANCE_PAUSED = "true";
  assert.equal((await call(ctx, job, "invalid")).status, 401);
  const before = structuredClone(ctx.records.get("issuance"));
  const paused = await call(ctx, { ...job, existing_model_token: token });
  assert.equal(paused.status, 503);
  assert.equal((await paused.json()).error, "model_link_issuance_paused");
  assert.equal((await verifyConfirmToken(ctx.env, token, { expectedRole: "model" })).session_id, job.session_id);
  assert.deepEqual(ctx.records.get("issuance"), before);
  assert.equal(ctx.kvWrites, 1);
  assert.equal(ctx.patches.length, 1);
  ctx.env.PARTNER_MODEL_LINK_ISSUANCE_PAUSED = "false";
  assert.deepEqual(await (await call(ctx, job)).json(), issued);
  assert.equal(ctx.kvWrites, 1);
});

test("paused and invalid switch settings block a first issuance before storage or network access", async () => {
  for (const setting of ["true", "unexpected"]) {
    const ctx = setup();
    ctx.env.PARTNER_MODEL_LINK_ISSUANCE_PAUSED = setting;
    ctx.fetchStub = () => assert.fail("a paused request must not access Airtable");
    const response = await call(ctx, job);
    assert.equal(response.status, 503);
    assert.equal(ctx.records.size, 0);
    assert.equal(ctx.kvWrites, 0);
    assert.equal(ctx.patches.length, 0);
  }
});

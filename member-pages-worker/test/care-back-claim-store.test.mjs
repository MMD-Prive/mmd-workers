import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { deriveClaimAndCode, getCareBackStore } from "../src/care-back-claim-store.js";

const realFetch = globalThis.fetch;
const IDENTITY = "a".repeat(64);
const SECRET = "test-only-liff-session-secret-1234567890";

afterEach(() => { globalThis.fetch = realFetch; });

function env() {
  return {
    AIRTABLE_API_KEY: "test-airtable-key",
    AIRTABLE_BASE_ID: "app_test",
    LIFF_SESSION_SECRET: SECRET,
  };
}

test("CARE BACK creates one verified claim and one draft single-use personal code without inventing a benefit", async () => {
  const writes = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const table = decodeURIComponent(url.pathname.split("/").at(-1));
    if ((init.method || "GET") === "GET") return Response.json({ records: [] });
    const body = JSON.parse(init.body);
    const fields = body.records[0].fields;
    writes.push({ table, fields });
    return Response.json({ records: [{ id: `rec_${writes.length}`, fields }] });
  };

  const result = await getCareBackStore(env()).openOrResume({ identityHash: IDENTITY, memberId: "MMD-PER-01" });

  assert.equal(writes.length, 2);
  assert.equal(writes[0].table, "MMD — Campaign Claims");
  assert.equal(writes[0].fields.campaign_id, "6-years-care-back");
  assert.equal(writes[0].fields.line_user_id_hash, IDENTITY);
  assert.equal(writes[0].fields.match_status, "matched");
  assert.equal(writes[0].fields.review_status, "pending");
  assert.equal(writes[0].fields.claim_status, "identity_verified");
  assert.equal(writes[1].table, "MMD — Promo Codes");
  assert.equal(writes[1].fields.status, "draft");
  assert.equal(writes[1].fields.max_uses, 1);
  assert.equal(writes[1].fields.used_count, 0);
  assert.equal(writes[1].fields.benefit_type, "none");
  assert.equal("benefit_value" in writes[1].fields, false);
  assert.equal("expires_at" in writes[1].fields, false);
  assert.match(result.personal_code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(result.code_status, "draft");
  assert.equal(result.review_status, "pending");
  assert.equal(result.resumed, false);
  assert.doesNotMatch(JSON.stringify(writes), /raw-token|session-secret|test-only-liff/i);
});

test("CARE BACK deterministic identifiers make a verified retry resume the same claim and code", async () => {
  const derived = await deriveClaimAndCode(IDENTITY, SECRET);
  let writes = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const table = decodeURIComponent(url.pathname.split("/").at(-1));
    if ((init.method || "GET") !== "GET") { writes += 1; throw new Error("retry must not create records"); }
    if (table === "MMD — Campaign Claims") {
      return Response.json({ records: [{ id: "rec_claim", fields: {
        claim_id: derived.claimId,
        campaign_id: "6-years-care-back",
        line_user_id_hash: IDENTITY,
        matched_member_id: "MMD-PER-01",
        claim_status: "identity_verified",
        review_status: "pending",
      } }] });
    }
    return Response.json({ records: [{ id: "rec_code", fields: {
      code: derived.code,
      campaign_code: "6-years-care-back",
      status: "draft",
      payload_json: JSON.stringify({ schema_version: 1, claim_id: derived.claimId, policy_state: "pending_review" }),
    } }] });
  };

  const result = await getCareBackStore(env()).openOrResume({ identityHash: IDENTITY, memberId: "MMD-PER-01" });
  assert.equal(writes, 0);
  assert.equal(result.claim_reference, derived.claimId);
  assert.equal(result.personal_code, derived.code);
  assert.equal(result.resumed, true);
});

test("CARE BACK fails closed if a deterministic code is already linked to another claim", async () => {
  const derived = await deriveClaimAndCode(IDENTITY, SECRET);
  globalThis.fetch = async (input) => {
    const table = decodeURIComponent(new URL(String(input)).pathname.split("/").at(-1));
    if (table === "MMD — Campaign Claims") {
      return Response.json({ records: [{ id: "rec_claim", fields: {
        claim_id: derived.claimId,
        campaign_id: "6-years-care-back",
        line_user_id_hash: IDENTITY,
        matched_member_id: "MMD-PER-01",
        claim_status: "identity_verified",
        review_status: "pending",
      } }] });
    }
    return Response.json({ records: [{ id: "rec_code", fields: {
      code: derived.code,
      campaign_code: "6-years-care-back",
      status: "draft",
      payload_json: JSON.stringify({ claim_id: "CB6-2026-DIFFERENT" }),
    } }] });
  };

  await assert.rejects(
    getCareBackStore(env()).openOrResume({ identityHash: IDENTITY, memberId: "MMD-PER-01" }),
    (error) => error?.code === "CARE_BACK_CODE_CONFLICT",
  );
});

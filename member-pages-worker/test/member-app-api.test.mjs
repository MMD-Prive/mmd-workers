import "./member-app-api.runtime.test.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { handleMemberAppApi, MEMBER_APP_WISH_READBACK_INTERNALS } from "../src/member-app-api.js";

const SECRET = "wish-readback-secret-0123456789-abcdefghijklmnopqrstuvwxyz";
const TOKEN = "session-readback-token-0123456789";
const IDENTITY = "a".repeat(64);

async function sessionKey() {
  const hash = await MEMBER_APP_WISH_READBACK_INTERNALS.hmacHex(SECRET, `session:${TOKEN}`);
  return `liff:session:${hash}`;
}

test("My MMD CARE readback returns the verified linked Wish text from backend storage", async () => {
  const key = await sessionKey();
  const expectedHash = await MEMBER_APP_WISH_READBACK_INTERNALS.hmacHex(SECRET, `wish-customer:${IDENTITY}`);
  const env = {
    LIFF_SESSION_SECRET: SECRET,
    AIRTABLE_API_KEY: "pat_test",
    AIRTABLE_BASE_ID: "app_test",
    LIFF_IDENTITY_KV: { async get(input, mode) { assert.equal(mode, "json"); return input === key ? { expires_at:Date.now()+60000, member_exists:true, member_id:"mem_001", identity_key:IDENTITY } : null; } },
  };
  const delegate = { async fetch() { return Response.json({ ok:true, state:"completed", approved_discount_percent:null, final_display:{ message:"received" } }); } };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /verified_customer_ref_hash/);
    return Response.json({ records:[{ id:"recABCDEFGHIJKLMN", fields:{ campaign_id:"care_back", source:"line_liff", wish_status:"completed", verified_customer_ref_hash:expectedHash, wish_text:"สุขสันต์วันเกิด MMD ครับ", wish_option:"", submitted_at:"2026-09-15T10:00:00.000Z" } }] });
  };
  try {
    const response = await handleMemberAppApi(new Request("https://www.mmdbkk.com/api/member/app/care", { headers:{ cookie:`__Host-mmd_liff_session=${TOKEN}` } }), env, delegate);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(payload.wish, { text:"สุขสันต์วันเกิด MMD ครับ", option:null, submittedAt:"2026-09-15T10:00:00.000Z", status:"completed" });
    assert.equal(response.headers.get("x-mmd-care-back-wish-readback"), "linked-v1");
  } finally { globalThis.fetch = originalFetch; }
});

test("Wish readback rejects an unlinked or mismatched record", () => {
  const wish = MEMBER_APP_WISH_READBACK_INTERNALS.sanitizeLinkedWishFields({ campaign_id:"care_back", source:"member_page", wish_status:"completed", verified_customer_ref_hash:"b".repeat(64), wish_text:"x", submitted_at:"2026-09-15T10:00:00.000Z" }, "a".repeat(64));
  assert.equal(wish, null);
});

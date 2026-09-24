import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/my-mms-customer-front-gate-entry.js";

test("verified Medical request stays same-origin and delegates only to member-pages-worker", async () => {
  const calls = [];
  const env = { MEMBER_PAGES_WORKER: { async fetch(request) {
    calls.push({ url: request.url, method: request.method, cookie: request.headers.get("cookie"), body: await request.json() });
    return Response.json({ ok: true, request_ref: "MED-TEST", status: "pending_mmd_scope_review" }, { status: 202 });
  } } };
  const payload = { purpose: "non_clinical_presence", acknowledgements: ["not_emergency", "no_diagnosis_or_treatment", "mmd_review_required"] };
  const response = await worker.fetch(new Request("https://www.mmdbkk.com/api/member/medical-request", {
    method: "POST", headers: { "content-type": "application/json", cookie: "__Host-mmd_liff_session=current" }, body: JSON.stringify(payload),
  }), env);

  assert.deepEqual(calls, [{ url: "https://www.mmdbkk.com/api/member/medical-request", method: "POST", cookie: "__Host-mmd_liff_session=current", body: payload }]);
  assert.equal(response.status, 202);
  assert.equal((await response.json()).status, "pending_mmd_scope_review");
  assert.equal(response.headers.get("x-mmd-route-owner"), "member-dashboard-chat-worker");
  assert.equal(response.headers.get("x-mmd-upstream-service"), "member-pages-worker");
});

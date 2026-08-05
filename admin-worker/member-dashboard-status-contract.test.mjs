import assert from "node:assert/strict";
import test from "node:test";

import worker from "./src/admin-login-hero-worker.js";

async function get(path, init = {}) {
  const response = await worker.fetch(new Request(`https://mmdbkk.com${path}`, init), {});
  const body = init.method === "HEAD" ? "" : await response.json();
  return { response, body };
}

test("member dashboard API requires private continuity token", async () => {
  const { response, body } = await get("/v1/member/dashboard");

  assert.equal(response.status, 404);
  assert.equal(response.headers.get("x-mmd-worker"), "admin-worker");
  assert.equal(response.headers.get("x-mmd-page"), "member-dashboard-api");
  assert.deepEqual(body, {
    ok: false,
    state: "invalid_link",
    message: "ไม่พบลิงก์ส่วนตัวครับ",
  });
});

test("member dashboard API returns a customer-safe contract without backend grants", async () => {
  const { response, body } = await get("/v1/member/dashboard?t=tok&code=c&promo=p&source=line&invite=i&unsafe=https://evil.example");
  const rendered = JSON.stringify(body);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-worker"), "admin-worker");
  assert.equal(response.headers.get("x-mmd-page"), "member-dashboard-api");
  assert.equal(response.headers.get("x-mmd-contract"), "customer-safe-status");
  assert.equal(body.ok, true);
  assert.equal(body.data.dashboard_state, "review_required");
  assert.equal(body.data.member.status, "review_required");
  assert.equal(body.data.access.status, "review_required");
  assert.equal(body.data.telegram_access.status, "review_required");
  assert.equal(body.data.next_recommended_step.key, "mmd_review");
  assert.equal(body.data.next_recommended_step.label, "MMD is reviewing your member status.");
  assert.deepEqual(body.data.grants, {
    membership: false,
    points: false,
    payment_status: false,
    telegram_access: false,
    private_access: false,
  });
  assert.match(body.data.actions.membership_url, /\/sigil\/member\/membership\?t=tok&code=c&promo=p&source=line&invite=i/);
  assert.doesNotMatch(rendered, /unsafe|evil|payment_ref|session_id|line_user_id|telegram_user_id|owner|founder|Boss Per|Chang|Ewvon|Admin|Staff|Handler|Operator/i);
});

test("member dashboard API HEAD returns headers without body", async () => {
  const { response, body } = await get("/v1/member/dashboard?t=tok", { method: "HEAD" });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-worker"), "admin-worker");
  assert.equal(response.headers.get("x-mmd-page"), "member-dashboard-api");
  assert.equal(body, "");
});

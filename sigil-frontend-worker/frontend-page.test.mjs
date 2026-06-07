import assert from "node:assert/strict";
import test from "node:test";

import worker from "./src/index.js";

const env = {
  TURNSTILE_SITE_KEY: "test_turnstile_site_key",
  SIGIL_FRONTEND_BUILD: "test_build",
};

async function textFor(path) {
  const response = await worker.fetch(new Request(`https://sigil.mmdbkk.com${path}`), env, {});
  const text = await response.text();
  return { response, text };
}

test("health route works", async () => {
  const { response, text } = await textFor("/_frontend-health");
  assert.equal(response.status, 200);
  const body = JSON.parse(text);
  assert.equal(body.ok, true);
  assert.equal(body.worker, "sigil-frontend-worker");
});

test("renewal page renders premium UI and backend contract", async () => {
  const { response, text } = await textFor("/pay/renewal");
  assert.equal(response.status, 200);

  assert.match(text, /mmd-renewal-premium/);
  assert.match(text, /mmd-renewal-premium-black-card/);
  assert.match(text, /mmd-renewal-premium-logo-wrap/);
  assert.match(text, /Standard Member → Premium Membership/);
  assert.match(text, /Current Client → Black Card \/ Exclusive/);
  assert.match(text, /Special discount tier estimate/);
  assert.match(text, /Admin Confirmed Amount is final/);
  assert.match(text, /proof\/slip is supporting evidence only/);
  assert.match(text, /confirmed only after official verification/);

  assert.doesNotMatch(text, /mmd-renewal-final/);
  assert.doesNotMatch(text, /ต่ออายุสมาชิกง่าย ๆ ใน 3 ขั้นตอน/);
  assert.doesNotMatch(text, /เลือกประเภทสมาชิก/);
  assert.doesNotMatch(text, /KTB|Krungthai|1420335898/);

  assert.match(text, /TTB/);
  assert.match(text, /ธัชชะ ป/);
  assert.match(text, /233-2-98800-1/);
  assert.match(text, /"endpoint":"\/api\/pay\/renewal\/proof"/);
  assert.match(text, /name="payment_type" value="renewal"/);
  assert.match(text, /name="selected_package"/);
  assert.match(text, /name="payment_method"/);
  assert.match(text, /name="session_id"/);
  assert.match(text, /name="payment_ref"/);
  assert.match(text, /name="transaction_ref"/);
  assert.match(text, /name="cf_turnstile_response"/);
  assert.match(text, /name="proof" type="file"/);
});

test("placeholder frontend routes return 200", async () => {
  const routes = [
    "/trust/inme",
    "/inme",
    "/member/dashboard",
    "/model/dashboard",
    "/apply/public-model",
    "/partner",
    "/partner/model",
    "/partner/apply",
  ];

  for (const route of routes) {
    const { response, text } = await textFor(route);
    assert.equal(response.status, 200, route);
    assert.match(text, /data-sigil-frontend-placeholder/, route);
    assert.doesNotMatch(text, /522: Connection timed out/, route);
  }
});

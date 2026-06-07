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

test("renewal page renders premium UI and backend contract for all renewal paths", async () => {
  const routes = [
    "/pay/renewal",
    "/pay/renewal/",
    "/pay/renewal?t=test123",
    "/_preview/pay/renewal",
    "/_preview/pay/renewal/",
    "/_preview/pay/renewal?t=test123",
  ];

  for (const route of routes) {
    const { response, text } = await textFor(route);
    assert.equal(response.status, 200, route);

    assert.match(text, /mmd-renewal-premium/, route);
    assert.match(text, /mmd-renewal-premium-black-card/, route);
    assert.match(text, /mmd-renewal-premium-logo-wrap/, route);
    assert.match(text, /Standard Member → Premium Membership/, route);
    assert.match(text, /Current Client → Black Card \/ Exclusive/, route);
    assert.match(text, /Special discount tier estimate/, route);
    assert.match(text, /Admin Confirmed Amount is final/, route);
    assert.match(text, /proof\/slip is supporting evidence only/, route);
    assert.match(text, /confirmed only after official verification/, route);

    assert.doesNotMatch(text, /mmd-renewal-final/, route);
    assert.doesNotMatch(text, /ต่ออายุสมาชิกง่าย ๆ ใน 3 ขั้นตอน/, route);
    assert.doesNotMatch(text, /เลือกประเภทสมาชิก/, route);
    assert.doesNotMatch(text, /KTB|Krungthai|1420335898/, route);

    assert.match(text, /TTB/, route);
    assert.match(text, /ธัชชะ ป/, route);
    assert.match(text, /233-2-98800-1/, route);
    assert.match(text, /"endpoint":"\/api\/pay\/renewal\/proof"/, route);
    assert.match(text, /name="payment_type" value="renewal"/, route);
    assert.match(text, /name="selected_package"/, route);
    assert.match(text, /name="payment_method"/, route);
    assert.match(text, /name="session_id"/, route);
    assert.match(text, /name="payment_ref"/, route);
    assert.match(text, /name="transaction_ref"/, route);
    assert.match(text, /name="cf_turnstile_response"/, route);
    assert.match(text, /name="proof" type="file"/, route);
  }
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

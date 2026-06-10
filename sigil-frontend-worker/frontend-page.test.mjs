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
    assert.match(text, /ประเมินเรทส่วนลดพิเศษ/, route);
    assert.match(text, /Admin Confirmed Amount/, route);
    assert.match(text, /สลิปเป็นเพียงหลักฐานประกอบ/, route);
    assert.match(text, /ทีมยืนยันอย่างเป็นทางการแล้วเท่านั้น/, route);

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

test("preview access gate routes render usable shells", async () => {
  const routes = [
    "/_preview/trust/inme",
    "/_preview/trust/inme/",
    "/_preview/trust/inme?t=test123",
    "/_preview/inme",
    "/_preview/inme/",
    "/_preview/inme?t=test123",
  ];

  for (const route of routes) {
    const { response, text } = await textFor(route);
    assert.equal(response.status, 200, route);
    assert.match(text, /data-sigil-access-gate/, route);
    assert.match(text, /Continue to Member Dashboard/, route);
    assert.match(text, /Renew Membership/, route);
    assert.match(text, /Request Access Help/, route);
    assert.match(text, /token parameter <code>t<\/code> is preserved|preserves <code>t<\/code>/, route);
    assert.match(text, /never auto-approves membership access/, route);
    assert.doesNotMatch(text, /mmdbkk\.com\/sigil\/pay\/renewal/, route);
    assert.doesNotMatch(text, /522: Connection timed out|Origin is unreachable/, route);
    assert.doesNotMatch(text, /Admin Console|Control Room|Create Session|Create Job/, route);
  }
});

test("preview access gate review context does not continue into normal member access", async () => {
  const { response, text } = await textFor("/_preview/inme?gender=female&t=test123");
  assert.equal(response.status, 200);
  assert.match(text, /Review path/);
  assert.match(text, /source\/gender context/);
  assert.match(text, /Request Access Help/);
  assert.match(text, /\/aftercare\?t=test123/);
  assert.doesNotMatch(text, /href="https:\/\/sigil\.mmdbkk\.com\/member\/dashboard\?t=test123"/);
});

test("preview member dashboard routes render safe shell", async () => {
  const routes = [
    "/_preview/member/dashboard",
    "/_preview/member/dashboard/",
    "/_preview/member/dashboard?t=test123",
  ];

  for (const route of routes) {
    const { response, text } = await textFor(route);
    assert.equal(response.status, 200, route);
    assert.match(text, /data-sigil-member-dashboard-shell/, route);
    assert.match(text, /Verification-first member shell/, route);
    assert.match(text, /No private member data is rendered/, route);
    assert.match(text, /\/api\/member\/dashboard/, route);
    assert.match(text, /\/api\/member\/dashboard\/view/, route);
    assert.match(text, /\/api\/member\/session\/next/, route);
    assert.match(text, /\/api\/member\/payments\/summary/, route);
    assert.match(text, /\/api\/member\/kenji\/chat/, route);
    assert.match(text, /data-token-handling="preserved"|data-token-handling="available"/, route);
    assert.doesNotMatch(text, /522: Connection timed out|Origin is unreachable/, route);
    assert.doesNotMatch(text, /fake member data/i, route);
    assert.doesNotMatch(text, /Admin Console|Control Room|Create Session|Create Job/, route);
  }
});

test("placeholder frontend routes return 200", async () => {
  const routes = [
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

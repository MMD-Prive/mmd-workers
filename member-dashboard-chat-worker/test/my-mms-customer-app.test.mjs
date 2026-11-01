import assert from "node:assert/strict";
import { test } from "node:test";

import {
  handleMyMmsCustomerApi,
  handleMyMmsCustomerUi,
  handleMyMmsCustomerAsset,
  MY_MMS_CUSTOMER_INTERNALS,
  isMyMmsCustomerApiRequest,
  isMyMmsCustomerAssetRequest,
  isMyMmsCustomerUiRequest,
  rewriteMyMmsCustomerHtml,
} from "../src/my-mms-customer-app-front-gate.js";

function req(path, init) {
  return new Request(`https://mmdbkk.com${path}`, init);
}

test("customer UI matcher owns only the bounded MY MMS routes", () => {
  for (const path of [
    "/male-massage",
    "/male-massage/",
    "/male-massage/bookings",
    "/male-massage/bookings/mmspre_aaaaaaaaaaaaaaaaaaaaaaaa",
    "/male-massage/therapists",
    "/male-massage/payment",
    "/male-massage/after-service",
    "/male-massage/profile",
    "/male-massage/support",
  ]) assert.equal(isMyMmsCustomerUiRequest(req(path)), true, path);

  for (const path of [
    "/male-massage/home",
    "/male-massage/how-to-use",
    "/male-massage/member/mms-booking",
    "/male-massage/therapists/login",
    "/male-massage/therapists/me",
    "/male-massage/therapists/app",
    "/male-massage/therapists/mms",
  ]) assert.equal(isMyMmsCustomerUiRequest(req(path)), false, path);
});

test('customer presentation uses the private Cloudflare service without forwarding identity', async (t) => {
  const calls = [];
  const env = { MMS_CUSTOMER_UI: { fetch: async (request) => {
    calls.push(request);
    return new Response('<html><body><script src="/assets/app.js"></script></body></html>', {
      headers: { 'content-type': 'text/html' },
    });
  } } };
  t.mock.method(globalThis, 'fetch', () => { throw Error('public presentation fetch forbidden'); });
  const response = await handleMyMmsCustomerUi(req('/male-massage?from=line', {
    headers: { cookie: 'test-session', authorization: 'test-authorization' },
  }), env);
  assert.equal(calls[0].url, 'https://mms-customer-ui.internal/?from=line');
  assert.equal(calls[0].headers.has('cookie'), false);
  assert.equal(calls[0].headers.has('authorization'), false);
  assert.match(await response.text(), /\/male-massage-assets\/app.js/);
});

test('customer logo and bundle assets stay on the bounded app asset path', async (t) => {
  const calls = [];
  const env = { MMS_CUSTOMER_UI: { fetch: async (request) => {
    calls.push(request.url);
    return new Response('router.update({basepath:``,serializationAdapters:[]}); (0,client.hydrateRoot)(document,app); const logo="/__l5e/assets-v1/example/logo.svg";', {
      headers: { 'content-type': 'application/javascript' },
    });
  } } };
  t.mock.method(globalThis, 'fetch', () => { throw Error('public asset fetch forbidden'); });
  const bundle = await handleMyMmsCustomerAsset(req('/male-massage-assets/app.js'), env);
  const javascript = await bundle.text();
  assert.match(javascript, /\/male-massage-assets\/lovable\/example\/logo.svg/);
  assert.match(javascript, /basepath:"\/male-massage",serializationAdapters:/);
  await handleMyMmsCustomerAsset(req('/male-massage-assets/lovable/example/logo.svg'), env);
  assert.equal(calls[1], 'https://mms-customer-ui.internal/__l5e/assets-v1/example/logo.svg');
});

test("customer assets and BFF are separately bounded", () => {
  assert.equal(isMyMmsCustomerAssetRequest(req("/male-massage-assets/app.js")), true);
  assert.equal(isMyMmsCustomerAssetRequest(req("/male-massage-assets-other/app.js")), false);
  assert.equal(isMyMmsCustomerApiRequest(req("/api/mms/app/customer")), true);
  assert.equal(isMyMmsCustomerApiRequest(req("/api/mms/application")), false);
});

test("presentation rewrite keeps assets and app navigation same-origin", () => {
  const html = rewriteMyMmsCustomerHtml(`<!doctype html><html><head><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/assets/app.css"></head><body><aside id="lovable-badge">x</aside><a href="/">Home</a><a href='/bookings/abc'>Booking</a><script src="/assets/app.js"></script></body></html>`);
  assert.doesNotMatch(html, /lovable-badge/);
  assert.match(html, /\/male-massage-assets\/app\.css/);
  assert.match(html, /\/male-massage-assets\/app\.js/);
  assert.match(html, /href="\/male-massage"/);
  assert.match(html, /href='\/male-massage\/bookings\/abc'/);
});

test("customer profile is projected from MMS customer authority without MMD tier or points", async () => {
  const env = {
    MEMBER_PAGES_WORKER: { fetch: () => { throw new Error('MMD authority must never be used'); } },
    MMS_MEMBER_WORKER: {
      fetch: async () => Response.json({
        ok: true, data: { registered: true, line_display_name: 'Ton', profile: {
        display_name: "คุณต้น",
        member_id: "mmsmem_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        membership_tier: "premium",
        points_confirmed: 1200,
        email: "ton@example.test",
        created_at: "2026-10-23T13:58:44.389Z",
        } },
      }),
    },
  };

  const response = await handleMyMmsCustomerApi(req("/api/mms/app/customer", {
    headers: { cookie: "__Host-mms_customer_published=test" },
  }), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.data.displayName, "คุณต้น");
  assert.equal(body.data.identityState, "verified");
  assert.equal(body.data.lineDisplayName, "Ton");
  assert.equal(body.data.lineAccountSummary, "เชื่อมต่อบัญชี LINE แล้ว");
  assert.match(body.data.memberSinceLabel, /23.*ต\.ค\..*2569/);
  assert.equal(body.data.customerRefDisplay, "mmsmem_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.equal(body.data.email.value, "ton@example.test");
  assert.equal(body.data.email.verified, false);
  assert.equal("membership_tier" in body.data, false);
  assert.equal("points_confirmed" in body.data, false);
});

test("LINE status is never inferred from a display name and malformed dates stay hidden", () => {
  const { customerFromProfile } = MY_MMS_CUSTOMER_INTERNALS;
  const checking = customerFromProfile({ match_state: "checking", lineDisplayName: "Fixture LINE", memberSince: "not-a-date" });
  assert.equal(checking.identityState, "checking");
  assert.equal(checking.lineAccountSummary, null);
  assert.equal(checking.memberSinceLabel, null);
  const verified = customerFromProfile({ match_state: "matched", lineDisplayName: "", memberSince: "2026-10-23T20:00:00Z" });
  assert.equal(verified.lineAccountSummary, "เชื่อมต่อบัญชี LINE แล้ว");
  assert.match(verified.memberSinceLabel, /24.*ต\.ค\..*2569/);
});

test("catalog binds the verified member only and preserves upstream checking and failure", async () => {
  let upstreamStatus = 503;
  let upstreamCode = "MMS_SEARCH_SOURCE_UNAVAILABLE";
  const calls = [];
  const env = {
    MMS_MEMBER_WORKER: { fetch: async () => Response.json({ ok: true, data: { registered: true, profile: { member_id: "mmsmem_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" } } }) },
    MMS_WORKER: { fetch: async (request) => {
      calls.push(request);
      return Response.json({ ok: false, error: { code: upstreamCode } }, { status: upstreamStatus });
    } },
  };
  const request = req("/api/mms/app/therapists/search/catalog", { headers: { cookie: "fixture-session" } });
  let response = await handleMyMmsCustomerApi(request, env);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, upstreamCode);
  assert.equal(calls[0].headers.get("x-mms-customer-member-ref"), "mmsmem_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.equal(calls[0].headers.has("cookie"), false);
  assert.equal(calls[0].url, "https://mms.internal/internal/mms/customer-search/catalog");
  upstreamStatus = 409;
  upstreamCode = "MMS_MEMBER_LINK_CHECKING";
  response = await handleMyMmsCustomerApi(request, env);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, upstreamCode);
  env.MMS_MEMBER_WORKER.fetch = async () => Response.json({ ok: false, error: { code: "MMS_SESSION_REQUIRED" } }, { status: 401 });
  response = await handleMyMmsCustomerApi(request, env);
  assert.equal(response.status, 401);
  assert.equal(calls.length, 2);
});

test("catalog uses the current account on each request and fails closed on malformed upstream", async () => {
  let memberRef = "mmsmem_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  let malformed = false;
  const seen = [];
  const env = {
    MMS_MEMBER_WORKER: { fetch: async () => Response.json({ ok: true, data: { registered: true, profile: { member_id: memberRef } } }) },
    MMS_WORKER: { fetch: async (request) => {
      seen.push(request.headers.get("x-mms-customer-member-ref"));
      return malformed
        ? Response.json({ ok: true }, { status: 200 })
        : Response.json({ ok: true, data: { services: [{ code: "fixture", label: "Fixture" }], zones: [{ code: "BKK-FIXTURE", label: "Fixture", province: "กรุงเทพมหานคร" }], availability: [{ code: "Available", label: "Online" }] } });
    } },
  };
  const request = req("/api/mms/app/therapists/search/catalog");
  assert.equal((await handleMyMmsCustomerApi(request, env)).status, 200);
  memberRef = "mmsmem_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  malformed = true;
  const response = await handleMyMmsCustomerApi(request, env);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "MMS_SEARCH_RESPONSE_INVALID");
  assert.deepEqual(seen, ["mmsmem_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "mmsmem_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"]);
});

test("catalog reports checking or provider failure without claiming no results", async () => {
  const env = {
    MMS_MEMBER_WORKER: { fetch: async () => Response.json({ ok: true, data: { registered: false } }) },
    MMS_WORKER: { fetch: async () => { throw new DOMException("timeout", "TimeoutError"); } },
  };
  const request = req("/api/mms/app/therapists/search/catalog");
  let response = await handleMyMmsCustomerApi(request, env);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, "MMS_MEMBER_LINK_CHECKING");
  env.MMS_MEMBER_WORKER.fetch = async () => Response.json({ ok: true, data: { registered: true, profile: { member_id: "mmsmem_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" } } });
  response = await handleMyMmsCustomerApi(request, env);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "MMS_SEARCH_UPSTREAM_UNAVAILABLE");
});

test("booking reads resolve member identity server-side then call mms-worker", async () => {
  const calls = [];
  const env = {
    MMS_MEMBER_WORKER: {
      fetch: async (request) => {
        calls.push(request.url);
        return Response.json({ ok: true, data: { registered: true, profile: { member_id: 'mmsmem_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } } });
      },
    },
    MMS_WORKER: {
      fetch: async (request) => {
        calls.push(request.url);
        return Response.json({
          ok: true,
          data: {
            requests: [{
              prebooking_id: "mmspre_aaaaaaaaaaaaaaaaaaaaaaaa",
              status: "confirmed",
              service_date: "2026-09-20",
              service_time: "19:30",
              zone: "Sukhumvit",
              skills: ["Aroma Oil"],
              travel_status: "en_route",
              eta_minutes: 85,
            }],
          },
        });
      },
    },
  };

  const response = await handleMyMmsCustomerApi(req("/api/mms/app/bookings/current", {
    headers: { cookie: "__Host-mms_customer_published=test" },
  }), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.id, "mmspre_aaaaaaaaaaaaaaaaaaaaaaaa");
  assert.equal(body.data.status, "confirmed");
  assert.equal(body.data.serviceLabel, "Aroma Oil");
  assert.equal(body.data.paymentState, "checking");
  assert.equal(body.data.travelStatus, "en_route");
  assert.equal(body.data.etaMinutes, 85);
  assert.match(calls[0], /\/api\/mms\/app\/membership\/me$/);
  assert.match(calls[1], /^https:\/\/mms\.internal\/internal\/mms\/member\/prebookings\?member_ref=mmsmem_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa$/);
});

test('MMD membership alone cannot unlock customer profile or bookings', async () => {
  const env = { MEMBER_PAGES_WORKER: { fetch: () => { throw new Error('MMD must not be queried'); } } };
  for (const path of ['/api/mms/app/customer', '/api/mms/app/bookings']) {
    assert.equal((await handleMyMmsCustomerApi(req(path, { headers: { cookie: '__Host-mmd_liff_session=test' } }), env)).status, 503);
  }
});

test("unconnected customer contracts fail closed", async () => {
  for (const path of ["/api/mms/app/therapists", "/api/mms/app/payments", "/api/mms/app/after-service", "/api/mms/app/support"]) {
    const response = await handleMyMmsCustomerApi(req(path), {});
    const body = await response.json();
    assert.equal(response.status, 503, path);
    assert.equal(body.error.code, "MMS_CUSTOMER_CONTRACT_CHECKING", path);
  }
});


test('missing presentation binding fails closed without contacting an external origin', async (t) => {
  t.mock.method(globalThis, 'fetch', () => { throw Error('external fetch forbidden'); });
  const page = await handleMyMmsCustomerUi(req('/male-massage'), {});
  assert.equal(page.status, 502);
  assert.match(await page.text(), /ยังเปิด MY MMS ไม่สำเร็จ/);
  assert.equal((await handleMyMmsCustomerAsset(req('/male-massage-assets/app.css'), {})).status, 502);
});

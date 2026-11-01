import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, test } from "node:test";

import worker from "../src/index.js";

let originalFetch;
let upstreamRequests;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  upstreamRequests = [];
  globalThis.fetch = async (request) => {
    upstreamRequests.push(request);
    return new Response("<!doctype html><html><head><title>Booking</title></head><body><main>Choose Your Preference</main></body></html>", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

async function request(url, init, env = {}) {
  return worker.fetch(new Request(url, init), env);
}

describe("sigil-booking-proxy-worker", () => {
  it("redirects mmdbkk.com /sigil/booking to canonical SIGIL host and preserves only safe params", async () => {
    const response = await request("https://www.mmdbkk.com/sigil/booking?t=diag&code=abc&promo=test&model_id=mdl1&request_id=req1&scope=private&mode=booking&model=Chosen&bad=drop");

    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "https://sigil.mmdbkk.com/sigil/booking?t=diag&code=abc&promo=test&model_id=mdl1&request_id=req1&scope=private&mode=booking&model=Chosen");
    assert.equal(response.headers.get("x-mmd-redirect-reason"), "canonical_sigil_host");
    assert.equal(response.headers.get("x-mmd-page"), "sigil-booking");
    assert.equal(upstreamRequests.length, 0);
  });

  it("serves canonical SIGIL booking from Webflow live source", async () => {
    const response = await request("https://sigil.mmdbkk.com/sigil/booking?t=diag&cb=123");
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-mmd-page"), "sigil-booking");
    assert.equal(response.headers.get("x-mmd-booking-source"), "webflow-live");
    assert.equal(response.headers.get("x-mmd-page-source"), "https://mmdprive.webflow.io/sigil/booking");
    assert.match(html, /Choose Your Preference/);
    assert.match(html, /mmd-page-owner/);
    assert.equal(upstreamRequests.at(-1).url, "https://mmdprive.webflow.io/sigil/booking?t=diag&cb=123");
  });

  it("returns no body for HEAD while keeping route headers", async () => {
    const response = await request("https://sigil.mmdbkk.com/sigil/booking?t=diag", { method: "HEAD" });
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.equal(body, "");
    assert.equal(response.headers.get("x-mmd-page"), "sigil-booking");
    assert.equal(response.headers.get("x-mmd-booking-source"), "webflow-live");
  });

  it("rejects non-page paths", async () => {
    const response = await request("https://sigil.mmdbkk.com/api/sigil/models/search");
    const payload = await response.json();

    assert.equal(response.status, 404);
    assert.equal(payload.error, "NOT_FOUND");
  });
});


  // New Webflow Cloud mount assets are loaded via the canonical host.
  // No Webflow preview runtime is exposed as a second booking authority.
test("serves only Cloud Release asset paths on SIGIL canonical host", async () => {
  globalThis.fetch = async (request) => {
    upstreamRequests.push(request);
    return new Response("export default {};", { headers: { "content-type": "application/javascript" } });
  };
  const response = await request("https://sigil.mmdbkk.com/sigil-booking-release/assets/index.js?v=1", undefined, { SIGIL_BOOKING_CLOUD_RELEASE_ENABLED: "true" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-booking-source"), "webflow-cloud-release");
  assert.equal(upstreamRequests.at(-1).url, "https://mmdprive.webflow.io/sigil-booking-release/assets/index.js?v=1");
  assert.equal(upstreamRequests.length, 1);
  const disabled = await request("https://sigil.mmdbkk.com/sigil-booking-release/assets/index.js?v=1");
  assert.equal(disabled.status, 404);
  assert.equal(upstreamRequests.length, 1);
  const bypass = await request("https://sigil.mmdbkk.com/private/internal.js");
  assert.equal(bypass.status, 404);
  assert.equal(upstreamRequests.length, 1);
});

test("refuses unsafe mutations to Cloud Release assets", async () => {
  const response = await request("https://sigil.mmdbkk.com/sigil-booking-release/assets/index.js", {
    method: "POST", body: "blocked",
  }, { SIGIL_BOOKING_CLOUD_RELEASE_ENABLED: "true" });
  assert.equal(response.status, 405);
  assert.equal(upstreamRequests.length, 0);
});


test("Cloud release must be explicitly enabled before serving the frozen page", async () => {
  const url = "https://sigil.mmdbkk.com/sigil/booking?t=synthetic";
  const enabled = await request(url, undefined, { SIGIL_BOOKING_CLOUD_RELEASE_ENABLED: "true" });
  assert.equal(enabled.status, 200);
  assert.equal(enabled.headers.get("x-mmd-booking-source"), "webflow-cloud-release");
  assert.equal(enabled.headers.get("x-mmd-page-source"), "https://mmdprive.webflow.io/sigil-booking-release");
  assert.equal(upstreamRequests.at(-1).url, "https://mmdprive.webflow.io/sigil-booking-release?t=synthetic");
  assert.match(await enabled.text(), /sigil-booking-cloud-release/);
});

test("non-true feature flag values cannot release new Booking", async () => {
  for (const value of ["", "1", "yes", "tru", "enabled", "false"]) {
    const response = await request("https://sigil.mmdbkk.com/sigil/booking", undefined, {
      SIGIL_BOOKING_CLOUD_RELEASE_ENABLED: value,
    });
    assert.equal(response.headers.get("x-mmd-booking-source"), "webflow-live");
  }
});

test("does not proxy release application paths or encoded asset paths", async () => {
  for (const path of ["/sigil-booking-release/api/profile", "/sigil-booking-release/confirmation", "/sigil-booking-release/assets/%2fprivate.js", "/sigil-booking-release/assets/source.js.map"]) {
    assert.equal((await request(`https://sigil.mmdbkk.com${path}`, undefined, { SIGIL_BOOKING_CLOUD_RELEASE_ENABLED: "true" })).status, 404);
  }
  assert.equal(upstreamRequests.length, 0);
});

test("preserves asset range and conditional responses without forwarding credentials", async () => {
  globalThis.fetch = async (upstream) => {
    assert.equal(upstream.redirect, "manual");
    assert.equal(upstream.headers.get("range"), "bytes=0-3");
    assert.equal(upstream.headers.get("authorization"), null);
    assert.equal(upstream.headers.get("cookie"), null);
    return new Response("data", { status: 206, headers: { "content-type": "video/mp4", "content-range": "bytes 0-3/100", "set-cookie": "ignored=true" } });
  };
  const response = await request("https://sigil.mmdbkk.com/sigil-booking-release/assets/clip.mp4", { headers: { range: "bytes=0-3", authorization: "synthetic", cookie: "synthetic=true" } }, { SIGIL_BOOKING_CLOUD_RELEASE_ENABLED: "true" });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-range"), "bytes 0-3/100");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(await response.text(), "data");
  globalThis.fetch = async (upstream) => {
    assert.equal(upstream.headers.get("if-none-match"), '"asset"');
    return new Response(null, { status: 304, headers: { etag: '"asset"' } });
  };
  const cached = await request("https://sigil.mmdbkk.com/sigil-booking-release/assets/app.js", { headers: { "if-none-match": '"asset"' } }, { SIGIL_BOOKING_CLOUD_RELEASE_ENABLED: "true" });
  assert.equal(cached.status, 304);
});

test("rejects redirects and HTML fallback for static assets", async () => {
  for (const upstream of [new Response(null, { status: 302, headers: { location: "https://example.com" } }), new Response("<html>fallback</html>", { headers: { "content-type": "text/html" } })]) {
    globalThis.fetch = async () => upstream;
    const response = await request("https://sigil.mmdbkk.com/sigil-booking-release/assets/missing.js", undefined, { SIGIL_BOOKING_CLOUD_RELEASE_ENABLED: "true" });
    assert.equal(response.status, 502);
  }
});

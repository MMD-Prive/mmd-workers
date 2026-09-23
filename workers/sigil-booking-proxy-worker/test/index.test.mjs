import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

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

async function request(url, init) {
  return worker.fetch(new Request(url, init));
}

describe("sigil-booking-proxy-worker", () => {
  it("redirects mmdbkk.com /sigil/booking to canonical SIGIL host and preserves only safe params", async () => {
    const response = await request("https://www.mmdbkk.com/sigil/booking?t=diag&code=abc&promo=test&model_id=mdl1&request_id=req1&bad=drop");

    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "https://sigil.mmdbkk.com/sigil/booking?t=diag&code=abc&promo=test&model_id=mdl1&request_id=req1");
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

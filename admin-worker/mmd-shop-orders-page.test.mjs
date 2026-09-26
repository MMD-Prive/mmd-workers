import test from "node:test";
import assert from "node:assert/strict";

import { handleAdminShopOrdersPage } from "./src/mmd-shop-orders-admin.js";

test("Shop Orders shell loads the canonical Webflow presentation without forwarding credentials", async () => {
  const originalFetch = globalThis.fetch;
  let upstreamRequest;
  globalThis.fetch = async (request) => {
    upstreamRequest = request;
    return new Response("<!doctype html><title>Shop Orders</title>", {
      headers: { "content-type": "text/html; charset=utf-8", "set-cookie": "not-forwarded=1" },
    });
  };
  try {
    const request = new Request("https://www.mmdbkk.com/internal/admin/shop/orders", {
      headers: { cookie: "private-session=redacted", accept: "text/html" },
    });
    const response = await handleAdminShopOrdersPage(request, { id: "owner", role: "owner" });
    assert.equal(upstreamRequest.url, "https://mmdprive.webflow.io/internal/admin/shop/orders");
    assert.equal(upstreamRequest.headers.has("cookie"), false);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.equal(response.headers.get("x-mmd-route-owner"), "admin-worker");
    assert.equal(response.headers.has("set-cookie"), false);
    assert.match(await response.text(), /Shop Orders/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Shop Orders shell redirects an unauthenticated request before upstream fetch", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("upstream must not be read"); };
  try {
    const response = await handleAdminShopOrdersPage(
      new Request("https://www.mmdbkk.com/internal/admin/shop/orders"),
      null,
    );
    assert.equal(response.status, 302);
    assert.equal(new URL(response.headers.get("location"), "https://www.mmdbkk.com").pathname, "/internal/admin/login");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

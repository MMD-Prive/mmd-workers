import assert from "node:assert/strict";
import test from "node:test";
import { decorateCustomer360Context, isCustomer360ContextRequest } from "../src/customer-360-live-entry.js";

test("recognizes only Customer 360 AI Ops context requests", () => {
  assert.equal(isCustomer360ContextRequest(new Request("https://mmdbkk.com/v1/admin/ai-ops/context?path=%2Finternal%2Fadmin%2Fcustomer-data")), true);
  assert.equal(isCustomer360ContextRequest(new Request("https://mmdbkk.com/v1/admin/ai-ops/context?path=%2Finternal%2Fadmin%2Fpayments")), false);
});

test("upgrades stale HOLD advisory to live canonical Customer 360", async () => {
  const base = new Response(JSON.stringify({
    ok: true,
    page: { path: "/internal/admin/customer-data", surface: "customer_data_hold", canonical: true },
    verified: ["1 read-only intelligence source(s) responded."],
    brief: ["Customer 360 ยังเป็น HOLD surface — AI อธิบาย evidence ได้"],
    anomalies: [{ code: "surface_hold", level: "warning", text: "Customer Data runtime ยัง incomplete; identity งานจริงให้ใช้ Customer Index / Create Job lookup" }],
    next_actions: [{ priority: 1, action: "client_lookup", label: "Use Create Job Client Lookup", href: "/internal/admin/jobs/create-job" }],
    sources: [{ route: "/v1/admin/customer-data/queue?limit=8", ok: true, status: 200 }],
  }), { headers: { "content-type": "application/json; charset=utf-8" } });

  const response = await decorateCustomer360Context(base, {
    clientId: "recCLIENT00000001",
    clientIntel: { ok: true, status: 200, data: { ok: true, data_status: "live" } },
  });
  const data = await response.json();

  assert.equal(response.headers.get("x-mmd-customer-360"), "live-v1");
  assert.equal(data.page.surface, "customer_360");
  assert.equal(data.page.status, "live_v1");
  assert.equal(data.customer_360.status, "live_v1");
  assert.equal(data.customer_360.identity_runtime.status, "live");
  assert.equal(data.customer_360.client_intelligence.read_only, true);
  assert.equal(data.customer_360.client_intelligence.status, "live");
  assert.equal(data.customer_360.browser_boundaries.changes_payment_truth, false);
  assert.equal(data.anomalies.some((item) => item.code === "surface_hold"), false);
  assert.equal(data.brief.some((item) => /HOLD surface/i.test(item)), false);
  assert.equal(data.sources.some((item) => item.route === "/v1/admin/clients/intelligence" && item.ok), true);
  assert.match(data.next_actions[0].href, /\/internal\/admin\/customer-data\?client_id=recCLIENT00000001/);
  assert.match(data.next_actions[1].href, /\/internal\/admin\/jobs\/create-job\?client_id=recCLIENT00000001/);
});

test("fails closed on Client Intelligence without putting Customer 360 back on HOLD", async () => {
  const base = new Response(JSON.stringify({
    ok: true,
    page: { path: "/internal/admin/customer-data", surface: "customer_data_hold", canonical: true },
    brief: [], verified: [], anomalies: [], next_actions: [], sources: [],
  }), { headers: { "content-type": "application/json" } });

  const response = await decorateCustomer360Context(base, {
    clientId: "recCLIENT00000001",
    clientIntel: { ok: false, status: 503, data: null },
  });
  const data = await response.json();
  assert.equal(data.page.surface, "customer_360");
  assert.equal(data.customer_360.client_intelligence.status, "unavailable");
  assert.equal(data.anomalies.some((item) => item.code === "client_intelligence_unavailable"), true);
  assert.equal(data.anomalies.some((item) => item.code === "surface_hold"), false);
});

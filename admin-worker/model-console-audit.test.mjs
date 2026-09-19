import assert from "node:assert/strict";
import test from "node:test";
import { handleModelConsoleAudit } from "./src/model-console-audit.js";

function request(body, headers = {}) {
  return new Request("https://admin-worker.example/v1/admin/model-console/audit", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}

test("rejects unauthenticated audit writes", async () => {
  const response = await handleModelConsoleAudit(request({ action: "model.upsert" }), {});
  assert.equal(response.status, 401);
});

test("rejects audit actions outside the typed allowlist", async () => {
  const response = await handleModelConsoleAudit(request({ action: "proxy.anything" }, { "X-Internal-Token": "secret" }), { INTERNAL_TOKEN: "secret", AIRTABLE_BASE_ID: "app", AIRTABLE_API_KEY: "pat" });
  assert.equal(response.status, 400);
});

test("writes Model Console audit to canonical System Access Log", async () => {
  let captured;
  const env = {
    INTERNAL_TOKEN: "secret", AIRTABLE_BASE_ID: "appTest", AIRTABLE_API_KEY: "patTest", AIRTABLE_TABLE_ACCESS_LOG: "System — Access Log",
    AIRTABLE_HTTP: { async fetch(url, init) { captured = { url, init, body: JSON.parse(init.body) }; return new Response(JSON.stringify({ records: [{ id: "recAudit" }] }), { status: 200, headers: { "content-type": "application/json" } }); } },
  };
  const response = await handleModelConsoleAudit(request({ action: "model.upsert", target: "EMs01", actor: "per", request_id: "req-1", downstream_status: 200, ok: true }, { "X-Internal-Token": "secret" }), env);
  assert.equal(response.status, 201);
  assert.match(captured.url, /System%20%E2%80%94%20Access%20Log$/);
  assert.equal(captured.body.records[0].fields.Action, "model.console.model.upsert");
  assert.equal(captured.body.records[0].fields.Result, "success");
});

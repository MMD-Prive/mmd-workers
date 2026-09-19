import assert from "node:assert/strict";
import test from "node:test";
import { injectAdminAiOpsPage } from "../src/admin-login-hero-worker.js";

function htmlResponse(body = "<!doctype html><html><body>Admin</body></html>", headers = {}) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });
}

test("injects shared AI Ops client into worker-owned Kenji page", async () => {
  const response = await injectAdminAiOpsPage(
    new Request("https://mmdbkk.com/internal/admin/kenji"),
    htmlResponse("<!doctype html><html><body>Kenji</body></html>", {
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
    }),
  );
  const html = await response.text();
  assert.match(html, /\/v1\/admin\/ai-ops\/client\.js\?v=1/);
  assert.match(html, /data-mmd-ai-ops="v1"/);
  assert.equal(response.headers.get("x-mmd-ai-ops-layer"), "v1");
  const csp = response.headers.get("content-security-policy") || "";
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /connect-src 'self'/);
});

test("injects shared AI Ops client into worker-owned MMS page", async () => {
  const response = await injectAdminAiOpsPage(
    new Request("https://www.mmdbkk.com/internal/admin/mms"),
    htmlResponse(),
  );
  assert.match(await response.text(), /data-mmd-ai-ops="v1"/);
});

test("does not inject into APIs or noncanonical worker pages", async () => {
  const api = new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
  assert.equal(
    await (await injectAdminAiOpsPage(new Request("https://mmdbkk.com/v1/admin/mms/snapshot"), api)).text(),
    JSON.stringify({ ok: true }),
  );
  const other = await injectAdminAiOpsPage(
    new Request("https://mmdbkk.com/internal/admin/login"),
    htmlResponse("<!doctype html><html><body>Login</body></html>"),
  );
  assert.doesNotMatch(await other.text(), /data-mmd-ai-ops="v1"/);
});

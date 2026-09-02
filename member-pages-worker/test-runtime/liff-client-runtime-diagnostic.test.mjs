import test from "node:test";
import assert from "node:assert/strict";
import {
  decorateLiffShellWithClientDiagnostic,
  handleLiffClientDiagnostic,
  isLiffClientDiagnosticPath,
} from "../src/liff-client-runtime-diagnostic.js";

test("recognizes only bounded LIFF client diagnostic paths", () => {
  assert.equal(isLiffClientDiagnosticPath(new URL("https://www.mmdbkk.com/member/liff-client-diag.js")), true);
  assert.equal(isLiffClientDiagnosticPath(new URL("https://www.mmdbkk.com/member/api/liff/client-diag")), true);
  assert.equal(isLiffClientDiagnosticPath(new URL("https://www.mmdbkk.com/member/api/liff/start")), false);
});

test("decorates LIFF shell before LINE SDK without weakening CSP", async () => {
  const source = '<html><body><script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script><script nonce="abc">boot()</script></body></html>';
  const response = new Response(source, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "script-src 'self' https://static.line-scdn.net 'nonce-abc'",
    },
  });
  const decorated = await decorateLiffShellWithClientDiagnostic(response);
  const html = await decorated.text();
  assert.match(html, /\/member\/liff-client-diag\.js/);
  assert.ok(html.indexOf("/member/liff-client-diag.js") < html.indexOf("static.line-scdn.net/liff/edge/2/sdk.js"));
  assert.match(decorated.headers.get("content-security-policy"), /script-src 'self'/);
});

test("persists only approved stage with boundary id from HttpOnly cookie", async () => {
  const writes = [];
  const env = {
    LIFF_IDENTITY_KV: {
      async put(key, value, options) { writes.push({ key, value: JSON.parse(value), options }); },
    },
  };
  const request = new Request("https://www.mmdbkk.com/member/api/liff/client-diag", {
    method: "POST",
    headers: { cookie: "mmd_liff_boundary=LIFFGET-ABCDEF123456" },
    body: "liff_init_ok",
  });
  const response = await handleLiffClientDiagnostic(request, env);
  assert.equal(response.status, 204);
  assert.equal(writes.length, 2);
  assert.equal(writes[0].value.boundary_id, "LIFFGET-ABCDEF123456");
  assert.equal(writes[0].value.stage, "liff_init_ok");
  assert.deepEqual(Object.keys(writes[0].value).sort(), ["boundary_id", "observed_at", "stage"]);
});

test("drops unknown stages and never persists request body details", async () => {
  let writes = 0;
  const env = { LIFF_IDENTITY_KV: { async put() { writes += 1; } } };
  const request = new Request("https://www.mmdbkk.com/member/api/liff/client-diag", {
    method: "POST",
    headers: { cookie: "mmd_liff_boundary=LIFFGET-ABCDEF123456" },
    body: "token=secret@example.com",
  });
  const response = await handleLiffClientDiagnostic(request, env);
  assert.equal(response.status, 204);
  assert.equal(writes, 0);
});

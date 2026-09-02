import { expect, test } from "vitest";
import {
  decorateLiffShellWithClientDiagnostic,
  handleLiffClientDiagnostic,
  isLiffClientDiagnosticPath,
} from "../src/liff-client-runtime-diagnostic.js";

test("recognizes only bounded LIFF client diagnostic paths", () => {
  expect(isLiffClientDiagnosticPath(new URL("https://www.mmdbkk.com/member/liff-client-diag.js"))).toBe(true);
  expect(isLiffClientDiagnosticPath(new URL("https://www.mmdbkk.com/member/api/liff/client-diag"))).toBe(true);
  expect(isLiffClientDiagnosticPath(new URL("https://www.mmdbkk.com/member/api/liff/start"))).toBe(false);
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
  expect(html).toMatch(/\/member\/liff-client-diag\.js/);
  expect(html.indexOf("/member/liff-client-diag.js")).toBeLessThan(html.indexOf("static.line-scdn.net/liff/edge/2/sdk.js"));
  expect(decorated.headers.get("content-security-policy")).toMatch(/script-src 'self'/);
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
  expect(response.status).toBe(204);
  expect(writes).toHaveLength(2);
  expect(writes[0].value.boundary_id).toBe("LIFFGET-ABCDEF123456");
  expect(writes[0].value.stage).toBe("liff_init_ok");
  expect(Object.keys(writes[0].value).sort()).toEqual(["boundary_id", "observed_at", "stage"]);
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
  expect(response.status).toBe(204);
  expect(writes).toBe(0);
});

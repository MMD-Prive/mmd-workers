import assert from "node:assert/strict";
import { test } from "node:test";

import worker from "../src/my-mmd-lovable-app-front-gate.js";

test("direct LINE status uses LIFF as the identity bridge before the Lovable MY MMD UI", async () => {
  const runtime = {
    MEMBER_PAGES_WORKER: {
      fetch: async () => new Response(
        `<!doctype html><html><head></head><body><main data-mmd-liff-digital="v2">NATIVE MEMBER RECOVERY</main><div id="message">กำลังเชื่อมข้อมูลเดิมของคุณ</div><div id="actions"></div><script nonce="abc123">const historyEndpoint = "/api/member/app/history";</script></body></html>`,
        { headers: { "content-type":"text/html; charset=utf-8" } },
      ),
    },
  };

  const response = await worker.fetch(new Request("https://mmdbkk.com/member/liff?intent=status"), runtime);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-liff-ui-mode"), "auth-bridge-only");
  assert.equal(response.headers.get("x-mmd-liff-return-target"), "/my-mmd/");
  assert.match(html, /NATIVE MEMBER RECOVERY/);
  assert.match(html, /กำลังเชื่อมข้อมูลเดิมของคุณ/);
  assert.match(html, /\/api\/member\/app\/history/);
  assert.match(html, /mmd-status-bridge-veil/);
});


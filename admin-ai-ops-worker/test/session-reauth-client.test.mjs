import assert from "node:assert/strict";
import test from "node:test";
import gate from "../src/gate.js";

test("shared AI Ops client repairs a raw 401 into a Back Office reauth action", async () => {
  const response = await gate.fetch(
    new Request("https://mmdbkk.com/v1/admin/ai-ops/client.js?v=4"),
    {},
    {},
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-ai-ops-session-ux"), "reauth-v1");
  const source = await response.text();
  assert.match(source, /data-mmd-aiops-reauth/);
  assert.match(source, /Back Office session หมดอายุหรือยังไม่ได้ยืนยัน/);
  assert.match(source, /\/internal\/admin\/login\?next=/);
  assert.match(source, /HTTP\\s\*401/);
});

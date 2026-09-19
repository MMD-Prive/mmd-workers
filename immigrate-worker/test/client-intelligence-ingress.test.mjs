import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("client intelligence stays on narrow same-origin ingress routes", async () => {
  const wrangler = await readFile(join(root, "wrangler.toml"), "utf8");
  const wrapper = await readFile(join(root, "src/control-room-dashboard-ingress-wrapper.ts"), "utf8");

  for (const pattern of [
    'mmdbkk.com/v1/admin/clients/intelligence*',
    'www.mmdbkk.com/v1/admin/clients/intelligence*',
  ]) {
    assert.match(wrangler, new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(wrapper, /CLIENT_INTELLIGENCE_PATH = "\/v1\/admin\/clients\/intelligence"/);
  assert.match(wrapper, /env\.ADMIN_WORKER\.fetch\(forwarded\)/);
  assert.match(wrapper, /headers\.delete\("authorization"\)/);
  assert.match(wrapper, /headers\.delete\("x-confirm-key"\)/);
  assert.match(wrapper, /immigrate-client-intelligence/);
  assert.doesNotMatch(wrangler, /pattern = "(?:www\.)?mmdbkk\.com\/v1\/admin\/\*"/);
});

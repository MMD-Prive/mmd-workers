import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("client intelligence stays on narrow same-origin ingress routes", async () => {
  const wrangler = await readFile(join(root, "wrangler.toml"), "utf8");
  const wrapper = await readFile(join(root, "src/control-room-dashboard-ingress-wrapper.ts"), "utf8");
  const deployWorkflow = await readFile(join(root, "..", ".github/workflows/deploy-immigrate-worker.yml"), "utf8");

  const intelligencePatterns = [
    'mmdbkk.com/v1/admin/clients/intelligence*',
    'www.mmdbkk.com/v1/admin/clients/intelligence*',
  ];
  for (const pattern of intelligencePatterns) {
    assert.match(wrangler, new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const pattern of [
    'mmdbkk.com/v1/admin/clients/lineage-lookup*',
    'www.mmdbkk.com/v1/admin/clients/lineage-lookup*',
    'mmdbkk.com/v1/admin/clients/recent*',
    'www.mmdbkk.com/v1/admin/clients/recent*',
    ...intelligencePatterns,
  ]) {
    assert.match(deployWorkflow, new RegExp(`"${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  }
  assert.match(deployWorkflow, /Verify Client Intelligence ingress fails closed in production/);
  assert.match(deployWorkflow, /immigrate-to-admin-client-intelligence-v1/);
  assert.match(deployWorkflow, /immigrate-to-admin-client-intelligence-audit-v1/);

  assert.match(wrapper, /CLIENT_INTELLIGENCE_PATH = "\/v1\/admin\/clients\/intelligence"/);
  assert.match(wrapper, /CLIENT_INTELLIGENCE_AUDIT_PATH = "\/v1\/admin\/clients\/intelligence\/audit"/);
  assert.match(wrapper, /env\.ADMIN_WORKER\.fetch\(forwarded\)/);
  assert.match(wrapper, /headers\.delete\("authorization"\)/);
  assert.match(wrapper, /headers\.delete\("x-confirm-key"\)/);
  assert.match(wrapper, /immigrate-client-intelligence/);
  assert.match(wrapper, /immigrate-client-intelligence-audit/);
  assert.doesNotMatch(wrangler, /pattern = "(?:www\.)?mmdbkk\.com\/v1\/admin\/\*"/);
});

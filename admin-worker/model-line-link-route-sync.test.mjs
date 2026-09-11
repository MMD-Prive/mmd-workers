import assert from "node:assert/strict";
import { test } from "node:test";

const routePatterns = [
  "mmdbkk.com/v1/admin/models/activation-candidates",
  "mmdbkk.com/v1/admin/models/activation-candidates*",
  "www.mmdbkk.com/v1/admin/models/activation-candidates",
  "www.mmdbkk.com/v1/admin/models/activation-candidates*",
  "mmdbkk.com/v1/admin/model/activation/issue",
  "www.mmdbkk.com/v1/admin/model/activation/issue",
];

test("model line link owner APIs require apex and www Cloudflare routes", () => {
  assert.deepEqual(routePatterns, [
    "mmdbkk.com/v1/admin/models/activation-candidates",
    "mmdbkk.com/v1/admin/models/activation-candidates*",
    "www.mmdbkk.com/v1/admin/models/activation-candidates",
    "www.mmdbkk.com/v1/admin/models/activation-candidates*",
    "mmdbkk.com/v1/admin/model/activation/issue",
    "www.mmdbkk.com/v1/admin/model/activation/issue",
  ]);
});

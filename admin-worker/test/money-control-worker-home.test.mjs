import test from "node:test";
import assert from "node:assert/strict";

import {
  handleMoneyControlWorkerHome,
  isMoneyControlWorkerHomeRequest,
} from "../src/money-control-worker-home.js";

test("Money Control task entrance is limited to its existing GET/HEAD page", () => {
  assert.equal(isMoneyControlWorkerHomeRequest("/internal/admin/payments", "GET"), true);
  assert.equal(isMoneyControlWorkerHomeRequest("/internal/admin/payments/", "HEAD"), true);
  assert.equal(isMoneyControlWorkerHomeRequest("/internal/admin/payments", "POST"), false);
  assert.equal(isMoneyControlWorkerHomeRequest("/internal/admin/payments/historical-backfill", "GET"), false);
  assert.equal(isMoneyControlWorkerHomeRequest("/v1/admin/payments/review", "GET"), false);
});

test("Worker page is private, self-contained, and states the operator payment boundary", async () => {
  const response = handleMoneyControlWorkerHome(new Request("https://mmdbkk.com/internal/admin/payments"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store, private");
  assert.equal(response.headers.get("x-mmd-route-owner"), "admin-worker-money-control-home");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(response.headers.get("content-security-policy"), /connect-src 'self'/);
  const html = await response.text();
  assert.match(html, /เปิดหลักฐาน/);
  assert.match(html, /เทียบยอดและลูกค้า\/งาน/);
  assert.match(html, /การรับสลิปเข้าคิวเป็นเพียงการรับหลักฐาน/);
  assert.match(html, /mmd_worker_view=existing/);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.doesNotMatch(html, /<iframe\b|cdn\./i);
});

test("HEAD returns headers without a page body", async () => {
  const response = handleMoneyControlWorkerHome(new Request("https://mmdbkk.com/internal/admin/payments", { method: "HEAD" }));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "");
});

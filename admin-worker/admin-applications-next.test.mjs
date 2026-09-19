import test from "node:test";
import assert from "node:assert/strict";
import { normalizeNext } from "./src/admin-login-hero-worker.js";

const APPLICATION_ID = "pma_20260914_example123";

test("admin login return path preserves the unified applications inbox", () => {
  assert.equal(
    normalizeNext("/internal/admin/applications"),
    "/internal/admin/applications",
  );
});

test("admin login return path preserves safe applications inbox query state", () => {
  const next = `/internal/admin/applications?lane=private&status=review&application_id=${APPLICATION_ID}`;
  assert.equal(normalizeNext(next), next);
});

test("applications inbox return path still rejects sensitive query keys", () => {
  assert.equal(
    normalizeNext("/internal/admin/applications?token=secret"),
    "/internal/admin/control-room",
  );
});

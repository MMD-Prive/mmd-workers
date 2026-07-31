import test from "node:test";
import assert from "node:assert/strict";
import worker from "../index.slip-evidence-clean.js";

test("canonical entrypoint keeps payment slip evidence evidence-only", async () => {
  const response = await worker.fetch(new Request("https://sigil.mmdbkk.com/v1/pay/slip/evidence"));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
});

test("canonical entrypoint delegates normal payment paths to the base worker", async () => {
  const response = await worker.fetch(new Request("https://sigil.mmdbkk.com/v1/pay/unknown"), {});
  assert.equal(response.status, 404);
});

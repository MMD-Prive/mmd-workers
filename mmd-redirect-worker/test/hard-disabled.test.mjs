import assert from "node:assert/strict";
import test from "node:test";

import worker, {
  FRONT_VERSION,
  REDIRECT_WORKER_DISABLED,
} from "../src/index.js";

test("redirect worker remains hard-disabled transparent pass-through", { concurrency: false }, async () => {
  assert.equal(REDIRECT_WORKER_DISABLED, true);
  assert.equal(FRONT_VERSION, "20260821-hard-disabled");

  const originalFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (request) => {
    seen.push(request.url);
    return new Response("origin", {
      status: 209,
      headers: { "x-origin": "1" },
    });
  };

  try {
    for (const url of [
      "https://mmdbkk.com/sigil/pay/membership?amount=999999&account=bad",
      "https://mmdbkk.com/pay/membership?t=signed&amount=999999",
      "https://mmdbkk.com/sigil/pay/renewal?t=signed",
      "https://mmdbkk.com/unknown-test-route-mmd",
    ]) {
      const response = await worker.fetch(new Request(url));
      assert.equal(response.status, 209, url);
      assert.equal(response.headers.get("x-origin"), "1", url);
      assert.equal(seen.at(-1), url, url);
      assert.equal(response.headers.get("location"), null, url);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("disabled redirect worker exposes no browser payment authority", async () => {
  const source = await import("node:fs").then(({ readFileSync }) => readFileSync(new URL("../src/index.js", import.meta.url), "utf8"));
  for (const forbidden of [
    "promptpay.io",
    "0829528889",
    "233-2-98800-1",
    "amount_due_thb",
    "/v1/pay/verify",
    "/api/verify-payment",
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});

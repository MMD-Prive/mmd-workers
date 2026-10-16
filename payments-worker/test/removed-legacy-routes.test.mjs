import test from "node:test";
import assert from "node:assert/strict";
import worker from "../index.js";

// /promo/validate (hardcoded promo catalog) and /pay/internal (internal verify/notify alias)
// were removed: no callers in the repo, not covered by the production Cloudflare routes.
for (const path of ["/promo/validate", "/pay/internal"]) {
  test(`${path} is no longer served`, async () => {
    const response = await worker.fetch(
      new Request(`https://payments.test${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: 1000, code: "WELCOME100", payment_ref: "PAY-1" }),
      }),
      {},
    );
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error, "not_found");
  });
}

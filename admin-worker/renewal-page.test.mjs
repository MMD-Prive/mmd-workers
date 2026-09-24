import assert from "node:assert/strict";
import test from "node:test";

import worker from "./index.js";

const env = {
  ALLOWED_ORIGINS: "https://sigil.mmdbkk.com,https://mmdbkk.com",
  AIRTABLE_API_KEY: "test_airtable_key",
  AIRTABLE_BASE_ID: "app_test",
  AIRTABLE_TABLE_PAYMENT_PROOFS_ID: "tbl_payment_proofs",
  CONFIRM_KEY: "test_confirm_key",
  TURNSTILE_SITE_KEY: "test_turnstile_site_key",
};

const required = [
  "Renew with Kenji",
  "mmd-renewal-kenji-public",
  "https://sigil.mmdbkk.com/api/pay/renewal/proof",
  "Krungsri",
  "Tatcha",
  "Security Check",
  "สลิปยังไม่ใช่การยืนยันสำเร็จ",
  "Signup",
  "Renewal",
  "Black Card Review",
  'name="payment_type" value="renewal"',
  'name="selected_package"',
  'name="payment_method"',
  'name="session_id"',
  'name="payment_ref"',
  'name="transaction_ref"',
  'name="cf_turnstile_response"',
  'name="proof" accept="image/*,.pdf" required',
  'name="t"',
];

const banned = [
  "PromptPay",
  "082-952-8889",
  "TTB",
  "233-2-98800-1",
  "KTB",
  "Krungthai",
  "1420335898",
  "PayPal",
  "8034847793",
];

for (const [url, status] of [
  ["https://mmdbkk.com/pay/renewal", 200],
  ["https://mmdbkk.com/pay/renewal/", 301],
  ["https://sigil.mmdbkk.com/pay/renewal", 200],
  ["https://sigil.mmdbkk.com/sigil/pay/renewal", 301],
]) {
  test(`renewal page ${url} renders canonical public proof contract`, async () => {
    const response = await worker.fetch(new Request(url), env, {});

    assert.equal(response.status, status);

    const finalResponse = status === 301
      ? await worker.fetch(new Request(response.headers.get("location")), env, {})
      : response;
    const html = await finalResponse.text();

    assert.equal(finalResponse.status, 200);
    assert.match(finalResponse.headers.get("content-type"), /text\/html/);
    for (const marker of required) assert.ok(html.includes(marker), `missing ${marker}`);
    for (const marker of banned) assert.ok(!html.includes(marker), `must not expose ${marker}`);
  });
}

test("renewal page preserves t query param", async () => {
  const response = await worker.fetch(
    new Request("https://mmdbkk.com/pay/renewal?t=test123"),
    env,
    {},
  );
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.ok(html.includes('name="t" value="test123"'));
});

test("renewal proof submit writes Airtable proof without R2 storage", async () => {
  const events = [];
  await withMockFetch(events, async () => {
    const response = await worker.fetch(renewalProofRequest(), env, {});
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.status, "pending_review");

    const create = events.find((event) => event.kind === "create");
    assert.ok(create);
    assert.equal(create.fields.payment_type, "renewal");
    assert.equal(create.fields.status, "pending_review");
    assert.ok(create.fields.slip_url.startsWith("urn:renewal-proof:"));
    assert.match(create.fields.note, /proof_file=renewal-slip.png/);
  });
});

test("duplicate renewal payment_ref does not create a second proof", async () => {
  const events = [];
  await withMockFetch(events, async () => {
    const response = await worker.fetch(
      renewalProofRequest({ paymentRef: "renewal_ref_existing" }),
      env,
      {},
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.duplicate, true);
    assert.equal(body.record_id, "rec_existing");
    assert.equal(events.some((event) => event.kind === "create"), false);
  });
});

test("renewal review list and decision require admin auth", async () => {
  const unauth = await worker.fetch(new Request("https://sigil.mmdbkk.com/api/pay/renewal/review/list"), env, {});
  assert.equal(unauth.status, 401);

  const events = [];
  await withMockFetch(events, async () => {
    const list = await worker.fetch(
      new Request("https://sigil.mmdbkk.com/api/pay/renewal/review/list", {
        headers: { "X-Confirm-Key": "test_confirm_key" },
      }),
      env,
      {},
    );
    const listBody = await list.json();

    assert.equal(list.status, 200);
    assert.equal(listBody.items.length, 1);

    const decision = await worker.fetch(
      new Request("https://sigil.mmdbkk.com/api/pay/renewal/review/decision", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Confirm-Key": "test_confirm_key",
        },
        body: JSON.stringify({ record_id: "rec_existing", decision: "approved" }),
      }),
      env,
      {},
    );
    const decisionBody = await decision.json();

    assert.equal(decision.status, 200);
    assert.equal(decisionBody.ok, true);
    assert.equal(events.find((event) => event.kind === "patch").fields.status, "approved");
  });
});

async function withMockFetch(events, fn) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const requestUrl = String(url);
    if (!requestUrl.startsWith("https://api.airtable.com/v0/app_test/tbl_payment_proofs")) {
      throw new Error(`unexpected fetch ${requestUrl}`);
    }

    if ((init.method || "GET").toUpperCase() === "PATCH") {
      const body = JSON.parse(init.body);
      events.push({ kind: "patch", fields: body.fields });
      return Response.json({ id: "rec_existing", fields: body.fields });
    }

    if ((init.method || "GET").toUpperCase() === "POST") {
      const body = JSON.parse(init.body);
      const fields = body.records[0].fields;
      events.push({ kind: "create", fields });
      return Response.json({ records: [{ id: "rec_created", fields }] });
    }

    const parsed = new URL(requestUrl);
    const formula = parsed.searchParams.get("filterByFormula") || "";
    if (formula.includes("renewal_ref_existing") || !formula) {
      events.push({ kind: "list", formula });
      return Response.json({
        records: [{
          id: "rec_existing",
          fields: {
            proof_id: "renewal_proof_existing",
            payment_ref: "renewal_ref_existing",
            payment_type: "renewal",
            status: "pending_review",
          },
        }],
      });
    }

    events.push({ kind: "list", formula });
    return Response.json({ records: [] });
  };

  try {
    await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function renewalProofRequest({ paymentRef = "renewal_ref_1" } = {}) {
  const form = new FormData();
  form.set("display_name", "Kenji Test");
  form.set("contact_id", "@kenji");
  form.set("amount_paid", "3000");
  form.set("paid_at", "2026-06-21T12:00");
  form.set("payment_type", "renewal");
  form.set("selected_package", "renewal");
  form.set("payment_method", "bank_transfer");
  form.set("payment_ref", paymentRef);
  form.set("transaction_ref", "renewal_txn_1");
  form.set("session_id", "renewal_session_1");
  form.set("proof", new Blob(["test-proof"], { type: "image/png" }), "renewal-slip.png");

  return new Request("https://sigil.mmdbkk.com/api/pay/renewal/proof", {
    method: "POST",
    headers: { "X-MMD-Test-Mode": "renewal-review-only" },
    body: form,
  });
}

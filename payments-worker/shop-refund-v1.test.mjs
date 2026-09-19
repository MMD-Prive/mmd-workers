import test from "node:test";
import assert from "node:assert/strict";

import { handleShopRefundConfirm } from "./shop-payment-v1.js";

const ORDER_FIELDS = {
  orderId: "flde515MCoEq08YzU",
  paymentStatus: "fldUpDeLdO6D9OUcd",
  total: "fldYIwMzRJdKdznkY",
  notes: "fldWG0u77XQ5W0wpT",
};
const PAYMENT_FIELDS = {
  status: "fldEJ1hmm7KwWuI6q",
  notes: "fldjsZIKoJPawlb2u",
  verification: "fldJ7a0Ube9F0bmRy",
  intentStatus: "fld04fr3bRJTohO6y",
  sessionId: "fld2wdhBvc8xrV6y5",
};
const TABLES = {
  orders: "tblr8lbi2wMuRM1N4",
  payments: "tblWGGJJOx5eBvBZJ",
};

function makeEnv() {
  return {
    INTERNAL_TOKEN: "internal-secret",
    AIRTABLE_BASE_ID: "appTest",
    AIRTABLE_TOKEN: "token",
  };
}

function mockAirtable() {
  const order = {
    id: "recOrder123456789",
    fields: {
      [ORDER_FIELDS.orderId]: "MMD-REFUND-1",
      [ORDER_FIELDS.paymentStatus]: "paid",
      [ORDER_FIELDS.total]: 2500,
      [ORDER_FIELDS.notes]: "schema=mmd_shop_order_v1",
    },
  };
  const payment = {
    id: "recPayment1234567",
    fields: {
      [PAYMENT_FIELDS.status]: "Paid",
      [PAYMENT_FIELDS.notes]: "schema=mmd_shop_payment_v1",
      [PAYMENT_FIELDS.verification]: "verified",
      [PAYMENT_FIELDS.intentStatus]: "Confirmed",
      [PAYMENT_FIELDS.sessionId]: "MMD-REFUND-1",
    },
  };
  const original = globalThis.fetch;
  const patches = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const parts = url.pathname.split("/").filter(Boolean);
    const table = parts[2];
    const recordId = parts[3] || "";
    const method = String(init.method || "GET").toUpperCase();

    if (method === "GET" && table === TABLES.orders) return Response.json({ records: [structuredClone(order)] });
    if (method === "GET" && table === TABLES.payments) return Response.json({ records: [structuredClone(payment)] });

    if (method === "PATCH" && table === TABLES.orders && recordId === order.id) {
      const body = JSON.parse(String(init.body || "{}"));
      Object.assign(order.fields, body.fields || {});
      patches.push({ table, fields: body.fields || {} });
      return Response.json(structuredClone(order));
    }
    if (method === "PATCH" && table === TABLES.payments && recordId === payment.id) {
      const body = JSON.parse(String(init.body || "{}"));
      Object.assign(payment.fields, body.fields || {});
      patches.push({ table, fields: body.fields || {} });
      return Response.json(structuredClone(payment));
    }
    return new Response("not found", { status: 404 });
  };
  return { order, payment, patches, restore(){ globalThis.fetch = original; } };
}

function request(amount = 2500) {
  return new Request("https://payments.internal/v1/internal/shop/refund-confirm", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-token": "internal-secret",
    },
    body: JSON.stringify({
      order_id: "MMD-REFUND-1",
      refund_reference: "RF-260919-001",
      refund_method: "PromptPay",
      refund_amount_thb: amount,
    }),
  });
}

test("payments-worker is canonical authority for full MMD Shop refund confirmation", { concurrency: false }, async () => {
  const mock = mockAirtable();
  try {
    const response = await handleShopRefundConfirm(request(), makeEnv());
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.authority, "payments-worker");
    assert.equal(body.payment_status, "refunded");
    assert.equal(body.refund_amount_thb, 2500);
    assert.equal(mock.order.fields[ORDER_FIELDS.paymentStatus], "refunded");
    assert.equal(mock.payment.fields[PAYMENT_FIELDS.status], "Refunded");
    assert.equal(mock.payment.fields[PAYMENT_FIELDS.verification], "verified");
    assert.equal(mock.payment.fields[PAYMENT_FIELDS.intentStatus], "Refunded");
    assert.match(mock.payment.fields[PAYMENT_FIELDS.notes], /refund_reference=RF-260919-001/);
    assert.equal(mock.patches.length, 2);
  } finally {
    mock.restore();
  }
});

test("full-refund closeout rejects amount mismatch", { concurrency: false }, async () => {
  const mock = mockAirtable();
  try {
    const response = await handleShopRefundConfirm(request(1000), makeEnv());
    const body = await response.json();
    assert.equal(response.status, 409);
    assert.equal(body.error, "full_refund_amount_must_match_order_total");
    assert.equal(mock.patches.length, 0);
  } finally {
    mock.restore();
  }
});

test("refund confirmation requires internal token", async () => {
  const req = request();
  const response = await handleShopRefundConfirm(new Request(req.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: await req.text(),
  }), makeEnv());
  assert.equal(response.status, 401);
});

import assert from "node:assert/strict";
import test from "node:test";
import { runSupplierSourceLowStockSweep } from "../src/supplier-low-stock-alert.js";

const BASE_ENV = {
  AIRTABLE_TOKEN: "airtable-test",
  AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
  SHARED_SUPPLIERS_TABLE_ID: "tbl81bnFyASeXCj9x",
  SHARED_SHOP_PRODUCTS_TABLE_ID: "tblzsmNLfP6J0kQ90",
  MMD_SHOP_INVENTORY_BATCHES_TABLE_ID: "tblwFgl4et1TOgtNn",
  HIMAI_SUPPLIER_LOW_STOCK_THRESHOLD: "3",
  LINE_CHANNEL_ACCESS_TOKEN: "line-test",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function installFetch({ fingerprint = "", lineConnected = true, available = 2, supplierNote = "" } = {}) {
  const calls = { line: [], patches: [] };
  const original = globalThis.fetch;

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);

    if (href.includes("/tbl81bnFyASeXCj9x?")) {
      return json({
        records: [{
          id: "supplier-nin",
          fields: {
            fldePq8Fmqq50CkPj: "SUP — Water GG Plus",
            fld1dqO4nWB3Pf6uT: lineConnected ? "U-nin" : "",
            fldZyHoik9SAUcbY6: lineConnected ? "Connected" : "Not Connected",
            fld0BL7nG45ueEMKQ: "active",
            fldViZfj7hExC1svq: supplierNote,
            fldLZBVVF81cWax1J: fingerprint,
          },
        }],
      });
    }

    if (href.includes("/tblzsmNLfP6J0kQ90?")) {
      return json({
        records: [
          {
            id: "wgg-50",
            fields: {
              fld0oKjoZrb1IqntV: "Water GG Plus 50ml",
              fldhJE7UEE4VYHjR6: "WGG-50",
              fldxYkkvmK9izvACA: "active",
              fldJCZ7YzsUjIItKf: ["supplier-nin"],
              fldAT8hnluV4CtF3c: "Supplier source SKU",
            },
          },
          {
            id: "wgg-10",
            fields: {
              fld0oKjoZrb1IqntV: "Water GG Plus 10ml",
              fldhJE7UEE4VYHjR6: "WGG-10",
              fldxYkkvmK9izvACA: "active",
              fldJCZ7YzsUjIItKf: [],
              fldAT8hnluV4CtF3c: "MMD repack SKU",
            },
          },
        ],
      });
    }

    if (href.includes("/tblwFgl4et1TOgtNn?")) {
      return json({
        records: [
          {
            id: "batch-50",
            fields: {
              fldVc73xUxjrfSjHY: ["wgg-50"],
              fldvjoRuM1mrR6ItQ: available,
              fldZW2m1Xq8q0ZH9Z: "active",
            },
          },
          {
            id: "batch-10",
            fields: {
              fldVc73xUxjrfSjHY: ["wgg-10"],
              fldvjoRuM1mrR6ItQ: 0,
              fldZW2m1Xq8q0ZH9Z: "active",
            },
          },
        ],
      });
    }

    if (href.endsWith("/tbl81bnFyASeXCj9x/supplier-nin") && options.method === "PATCH") {
      calls.patches.push(JSON.parse(options.body));
      return json({ id: "supplier-nin" });
    }

    if (href === "https://api.line.me/v2/bot/message/push") {
      calls.line.push(JSON.parse(options.body));
      return json({ sentMessages: [{ id: "1" }] });
    }

    throw new Error("unexpected_fetch:" + href);
  };

  return {
    calls,
    restore() { globalThis.fetch = original; },
  };
}

test("source stock below 3 sends one LINE alert and excludes MMD repack SKUs", async () => {
  const mock = installFetch({ available: 2 });
  try {
    const result = await runSupplierSourceLowStockSweep(BASE_ENV);
    assert.equal(result.ok, true);
    assert.equal(result.threshold, 3);
    assert.equal(mock.calls.line.length, 1);
    assert.equal(mock.calls.patches.length, 1);

    const text = mock.calls.line[0].messages[0].text;
    assert.match(text, /Water GG Plus 50ml/);
    assert.match(text, /เหลือ 2 ขวด/);
    assert.doesNotMatch(text, /10ml/);

    const fp = mock.calls.patches[0].fields.fldLZBVVF81cWax1J;
    assert.match(fp, /wgg-50/);
    assert.doesNotMatch(fp, /wgg-10/);
  } finally {
    mock.restore();
  }
});

test("unchanged low-stock fingerprint does not send duplicate LINE alert", async () => {
  const fingerprint = JSON.stringify([{ id: "wgg-50", available: 2 }]);
  const mock = installFetch({ available: 2, fingerprint });
  try {
    const result = await runSupplierSourceLowStockSweep(BASE_ENV);
    assert.equal(result.ok, true);
    assert.equal(mock.calls.line.length, 0);
    assert.equal(mock.calls.patches.length, 0);
    assert.equal(result.results[0].reason, "unchanged");
  } finally {
    mock.restore();
  }
});

test("stock of 3 is healthy because threshold is strictly below 3", async () => {
  const mock = installFetch({ available: 3 });
  try {
    const result = await runSupplierSourceLowStockSweep(BASE_ENV);
    assert.equal(result.ok, true);
    assert.equal(mock.calls.line.length, 0);
    assert.equal(result.results[0].reason, "healthy");
  } finally {
    mock.restore();
  }
});

test("low stock stays queued when supplier LINE is not connected", async () => {
  const mock = installFetch({ available: 2, lineConnected: false });
  try {
    const result = await runSupplierSourceLowStockSweep(BASE_ENV);
    assert.equal(result.ok, true);
    assert.equal(mock.calls.line.length, 0);
    assert.equal(mock.calls.patches.length, 0);
    assert.equal(result.results[0].reason, "supplier_line_not_connected");
  } finally {
    mock.restore();
  }
});


test("on-demand supplier is excluded from low-stock alerts even with zero tracked stock", async () => {
  const mock = installFetch({ available: 0, supplierNote: "on-demand supplier, no stock, fulfill only when order is placed" });
  try {
    const result = await runSupplierSourceLowStockSweep(BASE_ENV);
    assert.equal(result.ok, true);
    assert.equal(mock.calls.line.length, 0);
    assert.equal(mock.calls.patches.length, 0);
    assert.equal(result.results[0].reason, "on_demand_supplier");
  } finally {
    mock.restore();
  }
});

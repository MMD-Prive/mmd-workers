import test from "node:test";
import assert from "node:assert/strict";

import wrapper from "../src/entry-owner-preflight.js";
import { handleSupplierOwnerPreflightRequest } from "../src/supplier-owner-preflight.js";

const PREFLIGHT_TABLE = "tblN60x93vqn5BYhB";
const SUPPLIER_TABLE = "tbl81bnFyASeXCj9x";
const PREFLIGHT_TOKEN = "owner-preflight-token";
const PREFLIGHT_RECORD_ID = "recPreflight00001";
const SUPPLIER_RECORD_ID = "recpJsLK2TdFky44K";

const F = {
  id: "flduHW3z3gIjpoanx",
  supplier: "fldynuOuREgHjFore",
  status: "fld2yjpfQxl4DgmrI",
  inviteToken: "fld6ncHBcH8C7nyZZ",
  inviteExpiresAt: "fldb1GhlTt6Rp6Nfm",
};

const SF = {
  name: "fldePq8Fmqq50CkPj",
  status: "fld0BL7nG45ueEMKQ",
  lineUserId: "fld1dqO4nWB3Pf6uT",
  lineStatus: "fldZyHoik9SAUcbY6",
};

function baseEnv(overrides = {}) {
  return {
    AIRTABLE_TOKEN: "airtable-test-token",
    AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
    HIMAI_SUPPLIER_LIFF_ID: "2011701290-xBE3CirT",
    HIMAI_SUPPLIER_LIFF_ENDPOINT: "https://mmdbkk.com/shop/supplier/liff",
    HIMAI_SUPPLIER_PREFLIGHT_TABLE_ID: PREFLIGHT_TABLE,
    SHARED_SUPPLIERS_TABLE_ID: SUPPLIER_TABLE,
    SHARED_SHOP_PRODUCTS_TABLE_ID: "tblzsmNLfP6J0kQ90",
    MMD_SHOP_INVENTORY_BATCHES_TABLE_ID: "tblwFgl4et1TOgtNn",
    MMD_SHOP_STOCK_MOVEMENTS_TABLE_ID: "tblASifwHdArNKQP2",
    MMD_SHOP_ORDERS_TABLE_ID: "tblr8lbi2wMuRM1N4",
    MMD_SHOP_ORDER_ITEMS_TABLE_ID: "tbl37Iprxz4OLL65P",
    MMD_SHOP_SUPPLIER_LEDGER_TABLE_ID: "tbl2hqvi2hmk3wpe0",
    MMD_SHOP_SUPPLIER_PAYOUTS_TABLE_ID: "tblJF9dH59FK31dgA",
    MMD_SHOP_RESERVATION_TTL_MINUTES: "45",
    ...overrides,
  };
}

function preflightRecord() {
  return {
    id: PREFLIGHT_RECORD_ID,
    fields: {
      [F.id]: "HSPF-OWNER-001",
      [F.supplier]: [SUPPLIER_RECORD_ID],
      [F.status]: "created",
      [F.inviteToken]: PREFLIGHT_TOKEN,
      [F.inviteExpiresAt]: "2099-01-01T00:00:00.000Z",
    },
  };
}

test("direct owner preflight enters through canonical LIFF path", async () => {
  const response = await wrapper.fetch(
    new Request(`https://mmdbkk.com/shop/supplier/liff/owner-preflight?preflight=${PREFLIGHT_TOKEN}`),
    baseEnv(),
    {},
  );
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("location"));
  assert.equal(location.origin, "https://liff.line.me");
  assert.equal(location.pathname, "/2011701290-xBE3CirT/owner-preflight");
  assert.equal(location.searchParams.get("preflight"), PREFLIGHT_TOKEN);
  assert.equal(location.searchParams.get("_liff"), "1");
});

test("LIFF primary redirect for owner preflight renders SDK page", async () => {
  const state = encodeURIComponent(`/owner-preflight?preflight=${PREFLIGHT_TOKEN}&_liff=1`);
  const response = await wrapper.fetch(
    new Request(`https://mmdbkk.com/shop/supplier/liff?liff.state=${state}`),
    baseEnv(),
    {},
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  const html = await response.text();
  assert.match(html, /OWNER ONLY/);
  assert.match(html, /\/shop\/supplier\/liff\/preflight-api/);
  assert.match(html, /2011701290-xBE3CirT/);
});

test("owner preflight returns live supplier scope without changing canonical binding", async () => {
  const originalFetch = globalThis.fetch;
  const patches = [];
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));

    if (url.href === "https://api.line.me/v2/profile") {
      return jsonResponse({ userId: "U-owner-preflight", displayName: "Per Owner" });
    }

    if (url.hostname === "api.airtable.com") {
      const segments = url.pathname.split("/").filter(Boolean);
      const tableId = segments[2];
      const recordId = segments[3] || "";

      if (options.method === "PATCH") {
        patches.push({ tableId, recordId, body: JSON.parse(options.body) });
        return jsonResponse({ id: recordId });
      }

      if (tableId === PREFLIGHT_TABLE) {
        return jsonResponse({ records: [preflightRecord()] });
      }

      if (tableId === SUPPLIER_TABLE) {
        if (url.searchParams.get("returnFieldsByFieldId") === "true") {
          return jsonResponse({
            records: [{
              id: SUPPLIER_RECORD_ID,
              fields: {
                [SF.name]: "SUP — Water GG Plus",
                [SF.status]: "active",
                [SF.lineUserId]: "",
                [SF.lineStatus]: "Not Connected",
              },
            }],
          });
        }
        return jsonResponse({
          records: [{ id: SUPPLIER_RECORD_ID, fields: { "Supplier Name": "SUP — Water GG Plus" } }],
        });
      }

      if (tableId === "tblzsmNLfP6J0kQ90") {
        return jsonResponse({
          records: [{
            id: "recg8CLsPKT3So4uz",
            fields: {
              "Product Name": "Water GG Plus 10ml",
              "SKU": "WGG-10",
              "Brand Availability": ["Himai Shop"],
              "Category": "Other",
              "Status": "active",
              "Curation Label": "standard-curated",
              "Supplier": [SUPPLIER_RECORD_ID],
              "Product Note": "10ml variant",
              "Himai Selling Price THB": 1000,
            },
          }],
        });
      }

      if (tableId === "tblwFgl4et1TOgtNn") {
        return jsonResponse({
          records: [{
            id: "recBatch",
            fields: {
              "Product": ["recg8CLsPKT3So4uz"],
              "Quantity Remaining": 2,
              "Low Stock Flag": "Low",
              "Batch Status": "active",
            },
          }],
        });
      }

      if ([
        "tblASifwHdArNKQP2",
        "tblr8lbi2wMuRM1N4",
        "tbl37Iprxz4OLL65P",
        "tbl2hqvi2hmk3wpe0",
        "tblJF9dH59FK31dgA",
      ].includes(tableId)) {
        return jsonResponse({ records: [] });
      }
    }

    throw new Error(`unexpected_fetch:${url.href}`);
  };

  try {
    const response = await handleSupplierOwnerPreflightRequest(
      new Request("https://mmdbkk.com/shop/supplier/liff/preflight-api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ access_token: "line-access", preflight_token: PREFLIGHT_TOKEN }),
      }),
      baseEnv(),
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.preflight.owner_only, true);
    assert.equal(body.preflight.canonical_supplier_line_binding_untouched, true);
    assert.equal(body.summary.products, 1);
    assert.equal(body.summary.stock_units, 2);
    assert.deepEqual(body.products.map((item) => item.id), ["recg8CLsPKT3So4uz"]);

    const preflightPatch = patches.find((item) => item.tableId === PREFLIGHT_TABLE);
    assert.ok(preflightPatch);
    assert.equal(preflightPatch.body.fields.fld2yjpfQxl4DgmrI, "dashboard_passed");
    assert.equal(preflightPatch.body.fields.fld6ncHBcH8C7nyZZ, "");
    assert.equal(preflightPatch.body.fields.fldYyTRZNOjmnY7SI, "U-owner-preflight");
    assert.equal(patches.some((item) => item.tableId === SUPPLIER_TABLE), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("owner preflight can repair and verify the LIFF endpoint with a LINE Login token", async () => {
  const originalFetch = globalThis.fetch;
  const patches = [];
  let appReads = 0;
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));

    if (url.hostname === "api.airtable.com") {
      const segments = url.pathname.split("/").filter(Boolean);
      const tableId = segments[2];
      const recordId = segments[3] || "";
      if (options.method === "PATCH") {
        patches.push({ tableId, recordId, body: JSON.parse(options.body) });
        return jsonResponse({ id: recordId });
      }
      if (tableId === PREFLIGHT_TABLE) return jsonResponse({ records: [preflightRecord()] });
    }

    if (url.hostname === "api.line.me" && url.pathname === "/liff/v1/apps" && (!options.method || options.method === "GET")) {
      appReads += 1;
      return jsonResponse({
        apps: [{
          liffId: "2011701290-xBE3CirT",
          view: { type: "full", url: appReads === 1 ? "https://old.example.test" : "https://mmdbkk.com/shop/supplier/liff" },
        }],
      });
    }

    if (url.hostname === "api.line.me" && url.pathname === "/liff/v1/apps/2011701290-xBE3CirT" && options.method === "PUT") {
      assert.deepEqual(JSON.parse(options.body), { view: { url: "https://mmdbkk.com/shop/supplier/liff" } });
      return jsonResponse({});
    }

    throw new Error(`unexpected_fetch:${url.href}`);
  };

  try {
    const response = await handleSupplierOwnerPreflightRequest(
      new Request(`https://mmdbkk.com/shop/supplier/liff/preflight-config?preflight=${PREFLIGHT_TOKEN}&repair=1`),
      baseEnv({ LINE_LIFF_CHANNEL_ACCESS_TOKEN: "line-login-token" }),
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.repaired, true);
    assert.equal(body.observed, "https://mmdbkk.com/shop/supplier/liff");
    assert.equal(body.token_source, "line_login");
    const patch = patches.find((item) => item.tableId === PREFLIGHT_TABLE);
    assert.equal(patch.body.fields.fld2yjpfQxl4DgmrI, "endpoint_check_passed");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

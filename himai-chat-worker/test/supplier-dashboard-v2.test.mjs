import test from "node:test";
import assert from "node:assert/strict";

import { handleSupplierPortal, SUPPLIER_PORTAL_INTERNALS as supplierPortal } from "../src/supplier-portal.js";
import { renderDistributorPortalPage } from "../src/distributor-portal-page.js";
import { renderSupplierLiffPage } from "../src/supplier-liff-page.js";
import { handleSupplierAssistant } from "../../himai-shop-worker/src/supplier-assistant.js";

test("supplier dashboard page exposes scoped operational lanes", async () => {
  const response = renderDistributorPortalPage();
  assert.equal(response.status, 200);
  const html = await response.text();
  for (const expected of [
    "Supplier Dashboard",
    "Stock ของคุณ",
    "Orders ที่มีสินค้าของคุณ",
    "เติมของ & ส่งของ",
    "ยอดเงิน",
    "/shop/api/distributor/refill-draft",
    "/shop/api/distributor/workflow",
    "/shop/api/distributor/delivery-update",
  ]) {
    assert.match(html, new RegExp(expected.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&")));
  }
  assert.match(html, /ไม่แสดงชื่อ เบอร์ หรือข้อมูลส่วนตัวของลูกค้า/);
});

test("supplier portal fails closed without supplier token", async () => {
  const response = await handleSupplierPortal(
    new Request("https://example.com/shop/api/distributor/portal"),
    {}
  );
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.error, "missing_supplier_token");
});

test("supplier workflow mutations fail closed without supplier token", async () => {
  const response = await handleSupplierAssistant(
    new Request("https://example.com/shop/api/distributor/delivery-update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refill_id: "refill-test", status: "shipped" }),
    }),
    {}
  );
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.error, "missing_supplier_token");
});


test("LIFF supplier snapshot fails closed without a LINE access token", async () => {
  const response = await handleSupplierPortal(
    new Request("https://example.com/shop/api/supplier/liff-portal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }),
    {}
  );
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.error, "line_access_token_required");
});

test("LIFF supplier snapshot resolves only an exact active LINE binding", () => {
  const env = {
    HIMAI_DISTRIBUTOR_PORTAL_TOKENS: JSON.stringify({
      activeToken: {
        supplier_name: "นิน",
        supplier_ids: ["rec-nin"],
        line_user_id: "U-nin",
      },
      disabledToken: {
        active: false,
        supplier_name: "ไม่ควรเห็น",
        line_user_id: "U-disabled",
      },
    }),
  };

  assert.equal(
    supplierPortal.resolveSupplierAccessByLineUserId(env, "U-nin")?.supplier_name,
    "นิน",
  );
  assert.equal(supplierPortal.resolveSupplierAccessByLineUserId(env, "U-disabled"), null);
  assert.equal(supplierPortal.resolveSupplierAccessByLineUserId(env, "U-nin-extra"), null);
});


test("supplier LIFF page uses the production LINE app and canonical snapshot endpoint", async () => {
  const response = renderSupplierLiffPage({});
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  assert.match(response.headers.get("x-robots-tag") || "", /noindex/);
  const html = await response.text();
  assert.match(html, /2011701290-xBE3CirT/);
  assert.match(html, /\/shop\/api\/supplier\/liff-portal/);
  assert.match(html, /https:\/\/static\.line-scdn\.net\/liff\/edge\/2\/sdk\.js/);
  assert.match(html, /กำลังจอง/);
  assert.match(html, /ยอดค้างจ่าย/);
  assert.doesNotMatch(html, /mock/i);
});

import test from "node:test";
import assert from "node:assert/strict";

import { handleSupplierPortal, SUPPLIER_PORTAL_INTERNALS as supplierPortal } from "../src/supplier-portal.js";
import { renderDistributorPortalPage } from "../src/distributor-portal-page.js";
import { renderSupplierLiffPage } from "../src/supplier-liff-page.js";
import { renderSupplierInvitePage } from "../src/supplier-invite-page.js";
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
  assert.match(html, /\/shop\/api\/supplier\/liff-bind/);
  assert.match(html, /URLSearchParams\(location\.search\)\.get\("invite"\)/);
  assert.match(html, /https:\/\/static\.line-scdn\.net\/liff\/edge\/2\/sdk\.js/);
  assert.match(html, /กำลังจอง/);
  assert.match(html, /ยอดค้างจ่าย/);
  assert.doesNotMatch(html, /mock/i);
});


test("LIFF invite bind writes exact LINE identity and consumes the invite", async () => {
  const originalFetch = globalThis.fetch;
  const patches = [];
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href === "https://api.line.me/v2/profile") {
      return new Response(JSON.stringify({ userId: "U-nin-real", displayName: "Nin" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (href.includes("/tbl81bnFyASeXCj9x?")) {
      return new Response(JSON.stringify({
        records: [{
          id: "recpJsLK2TdFky44K",
          fields: {
            fld1RFwNRfArWb3cS: "invite-nin-1",
            flddW10scozb72r2T: "2099-01-01T00:00:00.000Z",
            fld0BL7nG45ueEMKQ: "active",
            fldePq8Fmqq50CkPj: "SUP — Water GG Plus",
            fld1dqO4nWB3Pf6uT: "",
          },
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (href.endsWith("/tbl81bnFyASeXCj9x/recpJsLK2TdFky44K") && options.method === "PATCH") {
      patches.push(JSON.parse(options.body));
      return new Response(JSON.stringify({ id: "recpJsLK2TdFky44K" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error("unexpected_fetch:" + href);
  };

  try {
    const response = await handleSupplierPortal(
      new Request("https://example.com/shop/api/supplier/liff-bind", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ access_token: "line-token", invite_token: "invite-nin-1" }),
      }),
      { AIRTABLE_TOKEN: "test", AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg" },
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.bound, true);
    assert.equal(body.supplier.name, "SUP — Water GG Plus");
    assert.equal(patches.length, 1);
    assert.equal(patches[0].fields.fld1dqO4nWB3Pf6uT, "U-nin-real");
    assert.equal(patches[0].fields.fldZgOx3v1FJ4k9WM, "Nin");
    assert.equal(patches[0].fields.fldZyHoik9SAUcbY6, "Connected");
    assert.equal(patches[0].fields.fld1RFwNRfArWb3cS, "");
    assert.equal(patches[0].fields.flddW10scozb72r2T, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("LIFF invite bind fails closed for an expired invite", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href === "https://api.line.me/v2/profile") {
      return new Response(JSON.stringify({ userId: "U-nin-real", displayName: "Nin" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (href.includes("/tbl81bnFyASeXCj9x?")) {
      return new Response(JSON.stringify({
        records: [{
          id: "recpJsLK2TdFky44K",
          fields: {
            fld1RFwNRfArWb3cS: "expired-nin",
            flddW10scozb72r2T: "2020-01-01T00:00:00.000Z",
            fld0BL7nG45ueEMKQ: "active",
          },
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error("unexpected_fetch:" + href);
  };
  try {
    const response = await handleSupplierPortal(
      new Request("https://example.com/shop/api/supplier/liff-bind", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ access_token: "line-token", invite_token: "expired-nin" }),
      }),
      { AIRTABLE_TOKEN: "test", AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg" },
    );
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error, "supplier_invite_invalid_or_expired");
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("supplier invite cover explains the stocked Supplier workspace before LINE binding", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes("/tbl81bnFyASeXCj9x?")) {
      return new Response(JSON.stringify({
        records: [{
          id: "rec-art",
          fields: {
            fld1RFwNRfArWb3cS: "invite-art-cover",
            flddW10scozb72r2T: "2099-01-01T00:00:00.000Z",
            fld0BL7nG45ueEMKQ: "active",
            fldePq8Fmqq50CkPj: "SUP — Pod Premium Plus",
            fldpIGevwbD2xx3sK: "อาร์ท",
            fldViZfj7hExC1svq: "stocked supplier",
          },
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error("unexpected_fetch:" + href);
  };

  try {
    const response = await renderSupplierInvitePage(
      new Request("https://example.com/shop/supplier/invite?invite=invite-art-cover"),
      { AIRTABLE_TOKEN: "test", AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg" },
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    const html = await response.text();
    assert.match(html, /สวัสดี คุณอาร์ท/);
    assert.match(html, /ผมจาก MMD ส่งพื้นที่ Supplier ส่วนตัว/);
    assert.doesNotMatch(html, /คุณคุณอาร์ท/);
    assert.match(html, /Pod Premium Plus/);
    assert.match(html, /สถานะสินค้าและสต๊อก/);
    assert.match(html, /เปิดพื้นที่ Supplier ใน LINE/);
    assert.match(html, /https:\/\/liff\.line\.me\/2011701290-xBE3CirT\?invite=invite-art-cover/);
    assert.doesNotMatch(html, /ข้อมูลลูกค้า/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("supplier invite cover explains the on-demand lane without a low-stock message", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes("/tbl81bnFyASeXCj9x?")) {
      return new Response(JSON.stringify({
        records: [{
          id: "rec-mew",
          fields: {
            fld1RFwNRfArWb3cS: "invite-mew-cover",
            flddW10scozb72r2T: "2099-01-01T00:00:00.000Z",
            fld0BL7nG45ueEMKQ: "active",
            fldePq8Fmqq50CkPj: "SUP — Glenburgies Pop Plus",
            fldpIGevwbD2xx3sK: "มิว",
            fldViZfj7hExC1svq: "on-demand supplier, no stock",
          },
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error("unexpected_fetch:" + href);
  };

  try {
    const response = await renderSupplierInvitePage(
      new Request("https://example.com/shop/supplier/invite?invite=invite-mew-cover"),
      { AIRTABLE_TOKEN: "test", AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg" },
    );
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /สวัสดี คุณมิว/);
    assert.match(html, /ผมส่งลิงก์นี้เพื่อให้คุณดูข้อมูล/);
    assert.doesNotMatch(html, /คุณคุณมิว/);
    assert.match(html, /Glenburgies Pop Plus/);
    assert.match(html, /สั่งตามออเดอร์/);
    assert.match(html, /เมื่อมีออเดอร์/);
    assert.doesNotMatch(html, /ใกล้หมด/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("supplier invite cover uses a neutral greeting without a contact name", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes("/tbl81bnFyASeXCj9x?")) {
      return new Response(JSON.stringify({
        records: [{
          id: "rec-no-contact",
          fields: {
            fld1RFwNRfArWb3cS: "invite-no-contact",
            flddW10scozb72r2T: "2099-01-01T00:00:00.000Z",
            fld0BL7nG45ueEMKQ: "active",
            fldePq8Fmqq50CkPj: "SUP — Pod Premium Plus",
            fldViZfj7hExC1svq: "stocked supplier",
          },
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error("unexpected_fetch:" + href);
  };

  try {
    const response = await renderSupplierInvitePage(
      new Request("https://example.com/shop/supplier/invite?invite=invite-no-contact"),
      { AIRTABLE_TOKEN: "test", AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg" },
    );
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /สวัสดีครับ/);
    assert.doesNotMatch(html, /คุณSupplier/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("supplier invite cover fails closed without a valid invite", async () => {
  const response = await renderSupplierInvitePage(
    new Request("https://example.com/shop/supplier/invite"),
    {},
  );
  assert.equal(response.status, 403);
  const html = await response.text();
  assert.match(html, /ลิงก์ส่วนตัวนี้ต้องเปิดจากข้อความที่ผมส่งให้คุณ/);
  assert.doesNotMatch(html, /เปิดพื้นที่ Supplier ใน LINE/);
});

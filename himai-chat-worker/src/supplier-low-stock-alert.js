const DEFAULT_THRESHOLD = 3;

const TABLES = Object.freeze({
  suppliers: "tbl81bnFyASeXCj9x",
  products: "tblzsmNLfP6J0kQ90",
  inventory: "tblwFgl4et1TOgtNn",
});

const SUPPLIER_FIELDS = Object.freeze({
  name: "fldePq8Fmqq50CkPj",
  lineUserId: "fld1dqO4nWB3Pf6uT",
  lineStatus: "fldZyHoik9SAUcbY6",
  status: "fld0BL7nG45ueEMKQ",
  alertFingerprint: "fldLZBVVF81cWax1J",
  alertSentAt: "fld2ASkCve1aqTwl7",
});

const PRODUCT_FIELDS = Object.freeze({
  name: "fld0oKjoZrb1IqntV",
  sku: "fldhJE7UEE4VYHjR6",
  status: "fldxYkkvmK9izvACA",
  supplier: "fldJCZ7YzsUjIItKf",
  note: "fldAT8hnluV4CtF3c",
});

const INVENTORY_FIELDS = Object.freeze({
  product: "fldVc73xUxjrfSjHY",
  remaining: "fldvjoRuM1mrR6ItQ",
  batchStatus: "fldZW2m1Xq8q0ZH9Z",
});

export async function runSupplierSourceLowStockSweep(env) {
  const threshold = resolveThreshold(env);
  const [suppliers, products, batches] = await Promise.all([
    airtableList(env, env.SHARED_SUPPLIERS_TABLE_ID || TABLES.suppliers, Object.values(SUPPLIER_FIELDS)),
    airtableList(env, env.SHARED_SHOP_PRODUCTS_TABLE_ID || TABLES.products, Object.values(PRODUCT_FIELDS)),
    airtableList(env, env.MMD_SHOP_INVENTORY_BATCHES_TABLE_ID || TABLES.inventory, Object.values(INVENTORY_FIELDS)),
  ]);

  const stockByProduct = buildStockByProduct(batches);
  const activeProducts = products.filter((record) =>
    selectName(record.fields?.[PRODUCT_FIELDS.status]).toLowerCase() === "active"
  );

  const results = [];
  for (const supplier of suppliers) {
    const fields = supplier.fields || {};
    if (selectName(fields[SUPPLIER_FIELDS.status]).toLowerCase() !== "active") continue;

    const supplierId = supplier.id;
    const supplierName = clean(fields[SUPPLIER_FIELDS.name], 200) || "Supplier";
    const sourceProducts = activeProducts.filter((product) =>
      linkedIds(product.fields?.[PRODUCT_FIELDS.supplier]).includes(supplierId)
    );

    if (!sourceProducts.length) {
      results.push({ supplier: supplierName, skipped: true, reason: "no_source_products" });
      continue;
    }

    const low = sourceProducts
      .map((product) => {
        const available = stockByProduct.get(product.id) ?? 0;
        return {
          id: product.id,
          name: clean(product.fields?.[PRODUCT_FIELDS.name], 200) || "สินค้า",
          sku: clean(product.fields?.[PRODUCT_FIELDS.sku], 120),
          available,
        };
      })
      .filter((product) => product.available < threshold)
      .sort((a, b) => a.id.localeCompare(b.id));

    const fingerprint = low.length
      ? JSON.stringify(low.map((item) => ({ id: item.id, available: item.available })))
      : "";
    const previous = clean(fields[SUPPLIER_FIELDS.alertFingerprint], 2000);

    if (!low.length) {
      if (previous) {
        await patchSupplier(env, supplier.id, {
          [SUPPLIER_FIELDS.alertFingerprint]: "",
        });
      }
      results.push({ supplier: supplierName, skipped: true, reason: "healthy", threshold });
      continue;
    }

    if (fingerprint === previous) {
      results.push({
        supplier: supplierName,
        skipped: true,
        reason: "unchanged",
        threshold,
        low_stock: low,
      });
      continue;
    }

    const lineStatus = selectName(fields[SUPPLIER_FIELDS.lineStatus]).toLowerCase();
    const lineUserId = clean(fields[SUPPLIER_FIELDS.lineUserId], 255);
    if (lineStatus !== "connected" || !lineUserId) {
      results.push({
        supplier: supplierName,
        skipped: true,
        reason: "supplier_line_not_connected",
        threshold,
        low_stock: low,
      });
      continue;
    }

    const sent = await pushLineLowStock(env, {
      lineUserId,
      supplierName,
      threshold,
      products: low,
    });

    if (sent) {
      await patchSupplier(env, supplier.id, {
        [SUPPLIER_FIELDS.alertFingerprint]: fingerprint,
        [SUPPLIER_FIELDS.alertSentAt]: new Date().toISOString(),
      });
    }

    results.push({
      supplier: supplierName,
      sent,
      threshold,
      low_stock: low,
    });
  }

  return {
    ok: results.every((item) => item.sent === true || item.skipped === true),
    threshold,
    checked: results.length,
    results,
  };
}

function resolveThreshold(env) {
  const value = Number(env.HIMAI_SUPPLIER_LOW_STOCK_THRESHOLD || DEFAULT_THRESHOLD);
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : DEFAULT_THRESHOLD;
}

function buildStockByProduct(records) {
  const stock = new Map();
  for (const record of records) {
    const fields = record.fields || {};
    const status = selectName(fields[INVENTORY_FIELDS.batchStatus]).toLowerCase();
    if (status.includes("archiv") || status.includes("closed")) continue;
    const remaining = Number(fields[INVENTORY_FIELDS.remaining] || 0);
    const quantity = Number.isFinite(remaining) ? remaining : 0;
    for (const productId of linkedIds(fields[INVENTORY_FIELDS.product])) {
      stock.set(productId, (stock.get(productId) || 0) + quantity);
    }
  }
  return stock;
}

async function pushLineLowStock(env, { lineUserId, supplierName, threshold, products }) {
  const token = clean(env.LINE_CHANNEL_ACCESS_TOKEN, 4096);
  if (!token) return false;

  const lines = products.map((item) =>
    `• ${item.name}${item.sku ? " (" + item.sku + ")" : ""}: เหลือ ${item.available} ขวด`
  );

  const message = [
    "Himai Supplier · แจ้งเตือนสต๊อกใกล้หมด",
    "",
    `สวัสดีครับ ${supplierName}`,
    `สินค้าต้นทางของคุณใน MMD เหลือน้อยกว่า ${threshold} ขวดแล้ว`,
    "",
    ...lines,
    "",
    "รบกวนเตรียมเติมสินค้าให้ MMD ได้เลยครับ",
  ].join("\n");

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [{ type: "text", text: message.slice(0, 5000) }],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`supplier_low_stock_line_push_failed:${response.status}:${detail.slice(0, 180)}`);
  }
  return true;
}

async function airtableList(env, tableId, fieldIds) {
  const token = env.AIRTABLE_TOKEN || env.AIRTABLE_API_KEY;
  if (!token) throw new Error("Airtable token is not configured");

  const records = [];
  let offset = "";
  let pages = 0;
  do {
    const url = new URL(`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${tableId}`);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("returnFieldsByFieldId", "true");
    for (const fieldId of fieldIds) url.searchParams.append("fields[]", fieldId);
    if (offset) url.searchParams.set("offset", offset);

    const response = await fetch(url.toString(), {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Airtable error: ${response.status}`);
    records.push(...(Array.isArray(data.records) ? data.records : []));
    offset = clean(data.offset, 300);
    pages += 1;
  } while (offset && pages < 20);

  return records;
}

async function patchSupplier(env, recordId, fields) {
  const token = env.AIRTABLE_TOKEN || env.AIRTABLE_API_KEY;
  if (!token) throw new Error("Airtable token is not configured");

  const tableId = env.SHARED_SUPPLIERS_TABLE_ID || TABLES.suppliers;
  const response = await fetch(`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${tableId}/${recordId}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ fields, typecast: true }),
  });
  if (!response.ok) throw new Error(`Airtable error: ${response.status}`);
  return response.json();
}

function linkedIds(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => typeof item === "string" ? item : item?.id || "").filter(Boolean);
}

function selectName(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && typeof value.name === "string") return value.name;
  return String(value);
}

function clean(value, max = 5000) {
  return String(value == null ? "" : value)
    .trim()
    .slice(0, max)
    .replace(/[\u0000-\u001F\u007F]/g, " ");
}

export const SUPPLIER_LOW_STOCK_INTERNALS = Object.freeze({
  buildStockByProduct,
  resolveThreshold,
});

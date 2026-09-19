import {
  buildMmdShopStockReconciliation,
  mmdShopStockHealthFingerprint,
} from "../../shared/mmd-shop-stock-reconciliation.mjs";

const AIRTABLE_API = "https://api.airtable.com/v0";
const TABLES = Object.freeze({
  products: "tblzsmNLfP6J0kQ90",
  inventory: "tblwFgl4et1TOgtNn",
  movements: "tblASifwHdArNKQP2",
});

const PRODUCT_FIELDS = Object.freeze({
  name: "fld0oKjoZrb1IqntV",
  sku: "fldhJE7UEE4VYHjR6",
  brandAvailability: "fldve5nrQmymoZgiX",
  status: "fldxYkkvmK9izvACA",
  note: "fldAT8hnluV4CtF3c",
  mmdPrice: "fldD6Q5yido7pTlU0",
});

const INVENTORY_FIELDS = Object.freeze({
  product: "fldVc73xUxjrfSjHY",
  code: "fldavW4g5y3e3Mdx1",
  quantityIn: "fldY4BJKDzpi2f844",
  remaining: "fldvjoRuM1mrR6ItQ",
  low: "fldYtzXtBvK3HuqQa",
  status: "fldZW2m1Xq8q0ZH9Z",
});

const MOVEMENT_FIELDS = Object.freeze({
  batch: "fldjF7wcc65dJIxt8",
  type: "fld95ubumrh0GQCgj",
  quantity: "fldRoDWshlUAg8aOy",
  referenceId: "flddxY12JXrNsAUpE",
});

export async function inspectMmdShopStockHealth(env = {}) {
  const [products, inventory, movements] = await Promise.all([
    listRecords(env, table(env, "products"), Object.values(PRODUCT_FIELDS)),
    listRecords(env, table(env, "inventory"), Object.values(INVENTORY_FIELDS)),
    listRecords(env, table(env, "movements"), Object.values(MOVEMENT_FIELDS)),
  ]);

  const batches = inventory.map((record) => ({
    id: record.id,
    product_id: linkedIds(record.fields?.[INVENTORY_FIELDS.product])[0] || null,
    batch_code: clean(record.fields?.[INVENTORY_FIELDS.code], 120) || null,
    quantity_in: number(record.fields?.[INVENTORY_FIELDS.quantityIn]),
    quantity_remaining: number(record.fields?.[INVENTORY_FIELDS.remaining]),
    low_stock: code(record.fields?.[INVENTORY_FIELDS.low]) === "low",
    batch_status: code(record.fields?.[INVENTORY_FIELDS.status]) || "archived",
  }));

  const movementRows = movements.map((record) => ({
    batch_id: linkedIds(record.fields?.[MOVEMENT_FIELDS.batch])[0] || null,
    movement_type: code(record.fields?.[MOVEMENT_FIELDS.type]),
    quantity: signedNumber(record.fields?.[MOVEMENT_FIELDS.quantity]),
    reference_id: clean(record.fields?.[MOVEMENT_FIELDS.referenceId], 500),
  }));

  const report = buildMmdShopStockReconciliation({
    batches,
    movements: movementRows,
    low_stock_threshold: Number(env.MMD_SHOP_LOW_STOCK_THRESHOLD || 5),
  });

  const activeBatchProductIds = new Set(
    batches
      .filter((row) => row.batch_status === "active" && row.product_id)
      .map((row) => row.product_id)
  );
  const checkoutProducts = products
    .map((record) => {
      const fields = record.fields || {};
      const name = clean(fields[PRODUCT_FIELDS.name], 220);
      const sku = clean(fields[PRODUCT_FIELDS.sku], 120);
      const brands = selectList(fields[PRODUCT_FIELDS.brandAvailability]).map((value) => value.toLowerCase());
      const active = code(fields[PRODUCT_FIELDS.status]) === "active";
      const isMmd = brands.some((value) => value.includes("mmd") || value.includes("both"));
      const price = Number(fields[PRODUCT_FIELDS.mmdPrice]);
      const restricted = isRestrictedOnlineCheckout(sku, name);
      const onDemand = isOnDemandProduct(fields[PRODUCT_FIELDS.note]);
      if (!active || !isMmd || !(Number.isFinite(price) && price > 0) || restricted) return null;
      return { product_id: record.id, sku: sku || null, product_name: name || null, on_demand: onDemand };
    })
    .filter(Boolean);

  const onDemandProducts = checkoutProducts.filter((item) => item.on_demand === true);
  const inventoryBackedProducts = checkoutProducts.filter((item) => item.on_demand !== true);
  const untrackedProducts = inventoryBackedProducts.filter((item) => !activeBatchProductIds.has(item.product_id));
  return {
    ...report,
    metrics: {
      ...report.metrics,
      active_checkout_products: checkoutProducts.length,
      on_demand_checkout_products: onDemandProducts.length,
      tracked_checkout_products: inventoryBackedProducts.length - untrackedProducts.length,
      untracked_checkout_products: untrackedProducts.length,
    },
    actionable: {
      ...report.actionable,
      untracked_product_ids: untrackedProducts.map((item) => item.product_id),
    },
    untracked_products: untrackedProducts,
    on_demand_products: onDemandProducts,
  };
}

export { mmdShopStockHealthFingerprint };

export function formatMmdShopStockHealthAlert(report = {}, options = {}) {
  const recovered = options.recovered === true;
  if (recovered) {
    return [
      "MMD SHOP · STOCK HEALTH",
      "Inventory reconciliation กลับสู่สถานะปกติแล้ว",
      "",
      "Low stock: 0",
      "Mismatch: 0",
      "Untracked checkout products: 0",
      "Checked: " + new Date().toISOString(),
    ].join("\n");
  }

  const rows = Array.isArray(report.batches) ? report.batches : [];
  const low = rows.filter((row) => row.low_stock);
  const mismatch = rows.filter((row) => row.reconciliation_status === "mismatch");
  const untracked = Array.isArray(report.untracked_products) ? report.untracked_products : [];
  const detail = [...new Map(
    [...mismatch, ...low].map((row) => [row.batch_id, row])
  ).values()].slice(0, 8);

  return [
    "MMD SHOP · STOCK HEALTH ALERT",
    "Low stock: " + low.length,
    "Reconciliation mismatch: " + mismatch.length,
    "Untracked checkout products: " + untracked.length,
    "Available: " + Number(report.metrics?.available_units || 0).toLocaleString("en-US"),
    "Reserved: " + Number(report.metrics?.reserved_units || 0).toLocaleString("en-US"),
    "",
    ...detail.map((row) => {
      const flags = [
        row.low_stock ? "LOW" : "",
        row.reconciliation_status === "mismatch" ? "MISMATCH " + signed(row.reconciliation_delta) : "",
      ].filter(Boolean).join(" · ");
      return (row.batch_code || row.batch_id)
        + ": available " + row.available_units
        + ", reserved " + row.reserved_units
        + (flags ? " · " + flags : "");
    }),
    ...untracked.slice(0, 8).map((item) =>
      "UNTRACKED · " + (item.sku || item.product_name || item.product_id)
    ),
    "",
    "Owner: /internal/admin/shop/inventory",
    "Checked: " + new Date().toISOString(),
  ].join("\n");
}

function signed(value) {
  const n = Number(value || 0);
  return n > 0 ? "+" + n : String(n);
}

async function listRecords(env, tableId, fieldIds) {
  const records = [];
  let offset = "";
  let pages = 0;
  do {
    const url = new URL(AIRTABLE_API + "/" + encodeURIComponent(baseId(env)) + "/" + encodeURIComponent(tableId));
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("returnFieldsByFieldId", "true");
    for (const field of fieldIds) url.searchParams.append("fields[]", field);
    if (offset) url.searchParams.set("offset", offset);
    const response = await fetch(url.toString(), {
      headers: { authorization: "Bearer " + token(env), accept: "application/json" },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw stockError(response.status >= 500 ? 502 : response.status, "airtable_list_" + response.status);
    records.push(...(Array.isArray(data.records) ? data.records : []));
    offset = clean(data.offset, 300);
    pages += 1;
  } while (offset && pages < 20);
  return records;
}

function table(env, kind) {
  if (kind === "products") return clean(env.SHARED_SHOP_PRODUCTS_TABLE_ID || TABLES.products, 120);
  if (kind === "inventory") return clean(env.MMD_SHOP_INVENTORY_BATCHES_TABLE_ID || TABLES.inventory, 120);
  if (kind === "movements") return clean(env.MMD_SHOP_STOCK_MOVEMENTS_TABLE_ID || TABLES.movements, 120);
  return "";
}

function baseId(env) {
  const value = clean(env.AIRTABLE_BASE_ID, 120);
  if (!value) throw stockError(503, "airtable_base_not_configured");
  return value;
}

function token(env) {
  const value = clean(env.AIRTABLE_TOKEN || env.AIRTABLE_API_KEY, 5000);
  if (!value) throw stockError(503, "airtable_token_not_configured");
  return value;
}

function linkedIds(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => clean(typeof item === "string" ? item : item?.id, 80))
    .filter((id) => /^rec[A-Za-z0-9]{14}$/.test(id));
}

function selectList(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map((item) => clean(typeof item === "string" ? item : item?.name, 120)).filter(Boolean);
}

function isOnDemandProduct(note) {
  return /\bon[-\s]*demand\b/i.test(clean(note, 500));
}

function isRestrictedOnlineCheckout(sku, productName) {
  const codeValue = clean(sku, 120).toUpperCase();
  const label = clean(productName, 220).toLowerCase();
  return /^PPP25-/.test(codeValue) || /\bpod\b/.test(label);
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function signedNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function code(value) {
  return clean(typeof value === "string" ? value : value?.name, 120)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function clean(value, max = 5000) {
  return String(value == null ? "" : value).trim().slice(0, max).replace(/[\u0000-\u001F\u007F]/g, " ");
}

function stockError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

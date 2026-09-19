import {
  buildMmdShopStockReconciliation,
  mmdShopStockHealthFingerprint,
} from "../../shared/mmd-shop-stock-reconciliation.mjs";

const AIRTABLE_API = "https://api.airtable.com/v0";
const TABLES = Object.freeze({
  inventory: "tblwFgl4et1TOgtNn",
  movements: "tblASifwHdArNKQP2",
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
  const [inventory, movements] = await Promise.all([
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

  return buildMmdShopStockReconciliation({
    batches,
    movements: movementRows,
    low_stock_threshold: Number(env.MMD_SHOP_LOW_STOCK_THRESHOLD || 5),
  });
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
      "Checked: " + new Date().toISOString(),
    ].join("\n");
  }

  const rows = Array.isArray(report.batches) ? report.batches : [];
  const low = rows.filter((row) => row.low_stock);
  const mismatch = rows.filter((row) => row.reconciliation_status === "mismatch");
  const detail = [...new Map(
    [...mismatch, ...low].map((row) => [row.batch_id, row])
  ).values()].slice(0, 8);

  return [
    "MMD SHOP · STOCK HEALTH ALERT",
    "Low stock: " + low.length,
    "Reconciliation mismatch: " + mismatch.length,
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

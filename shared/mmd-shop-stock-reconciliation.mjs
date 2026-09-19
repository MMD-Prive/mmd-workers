export function buildMmdShopStockReconciliation(input = {}) {
  const batches = Array.isArray(input.batches) ? input.batches : [];
  const movements = Array.isArray(input.movements) ? input.movements : [];
  const threshold = boundedInteger(input.low_stock_threshold, 5, 0, 1000000);

  const movementByBatch = new Map();
  for (const raw of movements) {
    const batchId = clean(raw?.batch_id, 80);
    if (!batchId) continue;
    const list = movementByBatch.get(batchId) || [];
    list.push(normalizeMovement(raw));
    movementByBatch.set(batchId, list);
  }

  const rows = batches.map((raw) => {
    const batch = normalizeBatch(raw);
    const list = movementByBatch.get(batch.id) || [];
    const hasInMovement = list.some((item) => item.type === "in");
    let expected = hasInMovement ? 0 : batch.quantity_in;
    let reservedUnits = 0;

    const reservationGroups = new Map();
    for (const item of list) {
      if (item.type === "in") expected += item.quantity;
      else if (item.type === "adjustment") expected += item.quantity;
      else if (item.type === "reserve") expected -= Math.abs(item.quantity);
      else if (item.type === "release") expected += Math.abs(item.quantity);
      else if (["return", "restock"].includes(item.type)) expected += Math.abs(item.quantity);

      const key = reservationKey(item.reference_id);
      if (!key) continue;
      const group = reservationGroups.get(key) || { reserve: 0, release: 0, out: 0 };
      if (item.type === "reserve") group.reserve += Math.abs(item.quantity);
      if (item.type === "release") group.release += Math.abs(item.quantity);
      if (item.type === "out") group.out += Math.abs(item.quantity);
      reservationGroups.set(key, group);
    }

    for (const group of reservationGroups.values()) {
      const pairedOut = Math.min(group.reserve, group.out);
      const unpairedOut = Math.max(0, group.out - pairedOut);
      expected -= unpairedOut;
      reservedUnits += Math.max(0, group.reserve - group.release - group.out);
    }

    const normalizedExpected = roundUnits(Math.max(0, expected));
    const actual = roundUnits(batch.quantity_remaining);
    const delta = roundUnits(actual - normalizedExpected);
    const lowStock = batch.batch_status === "active"
      && (batch.low_stock === true || actual <= threshold);

    return {
      batch_id: batch.id,
      product_id: batch.product_id,
      batch_code: batch.batch_code,
      batch_status: batch.batch_status,
      quantity_in: batch.quantity_in,
      quantity_remaining: actual,
      available_units: actual,
      reserved_units: roundUnits(reservedUnits),
      physical_estimate_units: roundUnits(actual + reservedUnits),
      ledger_expected_remaining: normalizedExpected,
      reconciliation_delta: delta,
      reconciliation_status: Math.abs(delta) < 0.000001 ? "ok" : "mismatch",
      low_stock: lowStock,
      low_stock_threshold: threshold,
      movement_count: list.length,
      ledger_mode: hasInMovement ? "movement_opening_balance" : "batch_opening_balance",
    };
  });

  const mismatches = rows.filter((row) => row.reconciliation_status === "mismatch");
  const lowStock = rows.filter((row) => row.low_stock);
  return {
    schema: "mmd_shop_stock_reconciliation_v1",
    threshold,
    batches: rows,
    metrics: {
      batches: rows.length,
      low_stock_batches: lowStock.length,
      reconciliation_mismatches: mismatches.length,
      available_units: roundUnits(rows.reduce((sum, row) => sum + row.available_units, 0)),
      reserved_units: roundUnits(rows.reduce((sum, row) => sum + row.reserved_units, 0)),
      physical_estimate_units: roundUnits(rows.reduce((sum, row) => sum + row.physical_estimate_units, 0)),
    },
    actionable: {
      low_stock_batch_ids: lowStock.map((row) => row.batch_id),
      mismatch_batch_ids: mismatches.map((row) => row.batch_id),
    },
  };
}

export function mmdShopStockHealthFingerprint(report = {}) {
  const low = [...(report?.actionable?.low_stock_batch_ids || [])].sort();
  const mismatch = [...(report?.actionable?.mismatch_batch_ids || [])].sort();
  const untracked = [...(report?.actionable?.untracked_product_ids || [])].sort();
  return JSON.stringify({ low, mismatch, untracked });
}

function reservationKey(referenceId) {
  const ref = clean(referenceId, 500);
  const match = ref.match(/^(.*?):(reserve|release|out):(rec[A-Za-z0-9]{14}):(rec[A-Za-z0-9]{14})$/);
  if (!match) return "";
  return [match[1], match[3], match[4]].join(":");
}

function normalizeMovement(raw = {}) {
  const type = code(raw.movement_type || raw.type);
  const quantity = Number(raw.quantity);
  return {
    type,
    quantity: Number.isFinite(quantity) ? quantity : 0,
    reference_id: clean(raw.reference_id, 500),
  };
}

function normalizeBatch(raw = {}) {
  return {
    id: clean(raw.id || raw.batch_id, 80),
    product_id: clean(raw.product_id, 80) || null,
    batch_code: clean(raw.batch_code, 120) || null,
    quantity_in: nonNegative(raw.quantity_in),
    quantity_remaining: nonNegative(raw.quantity_remaining),
    low_stock: raw.low_stock === true,
    batch_status: code(raw.batch_status || raw.status) || "archived",
  };
}

function nonNegative(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function roundUnits(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 1000) / 1000;
}

function boundedInteger(value, fallback, min, max) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

function code(value) {
  return clean(value, 120).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function clean(value, max = 5000) {
  return String(value == null ? "" : value).trim().slice(0, max).replace(/[\u0000-\u001F\u007F]/g, " ");
}

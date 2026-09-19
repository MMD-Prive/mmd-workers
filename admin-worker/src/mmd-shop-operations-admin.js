import { buildMmdShopStockReconciliation } from "../../shared/mmd-shop-stock-reconciliation.mjs";

const AIRTABLE_API = "https://api.airtable.com/v0";

const PAGE_INVENTORY = "/internal/admin/shop/inventory";
const PAGE_PRODUCTS = "/internal/admin/shop/products";
const API_INVENTORY = "/v1/admin/shop/inventory";
const API_INVENTORY_BATCH = "/v1/admin/shop/inventory/batch";
const API_INVENTORY_ADJUST = "/v1/admin/shop/inventory/adjust";
const API_PRODUCTS = "/v1/admin/shop/products";
const API_PRODUCTS_UPDATE = "/v1/admin/shop/products/update";

const PAGE_SOURCES = Object.freeze({
  [PAGE_INVENTORY]: "https://mmdprive.webflow.io/internal/admin/shop/inventory",
  [PAGE_PRODUCTS]: "https://mmdprive.webflow.io/internal/admin/shop/products",
});

const TABLES = Object.freeze({
  products: "tblzsmNLfP6J0kQ90",
  suppliers: "tbl81bnFyASeXCj9x",
  inventory: "tblwFgl4et1TOgtNn",
  movements: "tblASifwHdArNKQP2",
});

const PRODUCT_FIELDS = Object.freeze({
  name: "fld0oKjoZrb1IqntV",
  sku: "fldhJE7UEE4VYHjR6",
  brands: "fldve5nrQmymoZgiX",
  category: "fld37QbTBaTDSvgKy",
  status: "fldxYkkvmK9izvACA",
  cost: "fldXmhvM3MmSKAZCc",
  curation: "fld3Ew6qo767fGJcm",
  supplier: "fldJCZ7YzsUjIItKf",
  note: "fldAT8hnluV4CtF3c",
  mmdPrice: "fldD6Q5yido7pTlU0",
});

const SUPPLIER_FIELDS = Object.freeze({
  name: "fldePq8Fmqq50CkPj",
  status: "fld0BL7nG45ueEMKQ",
});

const INVENTORY_FIELDS = Object.freeze({
  name: "fldtfzLVljSCVdDNW",
  product: "fldVc73xUxjrfSjHY",
  supplier: "fldrrEXHJeTPKXs0l",
  code: "fldavW4g5y3e3Mdx1",
  receivedDate: "fldR9ELxn6t06P7Lb",
  quantityIn: "fldY4BJKDzpi2f844",
  remaining: "fldvjoRuM1mrR6ItQ",
  unitCost: "fldP5LaRWkq0qBJVQ",
  totalCost: "fldp15d6RYLLmhSE3",
  remainingValue: "fldmFhct2jQmIT3gL",
  low: "fldYtzXtBvK3HuqQa",
  status: "fldZW2m1Xq8q0ZH9Z",
  note: "fld5UTP9p8w6tn6JH",
});

const MOVEMENT_FIELDS = Object.freeze({
  name: "fldahJshKJkBP8Z7H",
  batch: "fldjF7wcc65dJIxt8",
  product: "fldCRBzBDOsNo3jLM",
  supplier: "fldzf4Hm1bQ9HGb7C",
  type: "fld95ubumrh0GQCgj",
  quantity: "fldRoDWshlUAg8aOy",
  unitCost: "fldqY9wq6NUqnfvFc",
  date: "flddnpCisCrCJhyHM",
  referenceType: "fld6bdKAAa1sOYw0Q",
  referenceId: "flddxY12JXrNsAUpE",
  note: "fldmnXBNlVcDdvkPh",
});

export function isAdminShopOperationsPageRequest(path, method) {
  const p = normalizePath(path);
  const verb = String(method || "GET").toUpperCase();
  return [PAGE_INVENTORY, PAGE_PRODUCTS].includes(p) && ["GET", "HEAD"].includes(verb);
}

export function isAdminShopOperationsApiRequest(path, method) {
  const p = normalizePath(path);
  const verb = String(method || "GET").toUpperCase();
  return (
    (p === API_INVENTORY && verb === "GET") ||
    (p === API_INVENTORY_BATCH && verb === "POST") ||
    (p === API_INVENTORY_ADJUST && verb === "POST") ||
    (p === API_PRODUCTS && verb === "GET") ||
    (p === API_PRODUCTS_UPDATE && verb === "POST")
  );
}

export async function handleAdminShopOperationsPage(request, actor) {
  if (!allowedActor(actor)) return adminLoginRedirect(request);
  const method = String(request.method || "GET").toUpperCase();
  const path = normalizePath(new URL(request.url).pathname);
  const sourceUrl = PAGE_SOURCES[path];
  if (!sourceUrl) return pageUnavailable(method, "MMD Shop Admin");

  let upstream;
  try {
    upstream = await fetch(new Request(sourceUrl, {
      method,
      headers: presentationHeaders(request),
      redirect: "follow",
    }));
  } catch {
    return pageUnavailable(method, path === PAGE_INVENTORY ? "MMD Shop Inventory" : "MMD Shop Products");
  }
  if (!upstream.ok) return pageUnavailable(method, path === PAGE_INVENTORY ? "MMD Shop Inventory" : "MMD Shop Products");

  const headers = new Headers(upstream.headers);
  for (const name of ["content-length", "set-cookie", "content-encoding", "etag", "last-modified", "report-to", "nel"]) headers.delete(name);
  headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("x-robots-tag", "noindex, nofollow");
  headers.set("x-mmd-route-owner", "admin-worker");
  headers.set("x-mmd-admin-surface", path === PAGE_INVENTORY ? "shop-inventory" : "shop-products");
  if (method === "HEAD") return new Response(null, { status: 200, headers });
  return new Response(upstream.body, { status: 200, headers });
}

export async function handleAdminShopOperationsApi(request, env, actor) {
  if (!allowedActor(actor)) return json({ ok: false, error: "admin_session_required" }, 401);
  const path = normalizePath(new URL(request.url).pathname);
  const method = String(request.method || "GET").toUpperCase();

  try {
    if (path === API_INVENTORY && method === "GET") {
      const data = await loadInventoryWorkspace(env);
      return json({
        ok: true,
        authority: "admin-worker",
        schema: "mmd_shop_admin_inventory_v1",
        ...data,
      });
    }

    if (path === API_INVENTORY_BATCH && method === "POST") {
      const body = await boundedJson(request);
      const result = await createInventoryBatch(env, body, actor);
      return json({
        ok: true,
        authority: "admin-worker",
        schema: "mmd_shop_inventory_batch_mutation_v1",
        ...result,
      }, 201);
    }

    if (path === API_INVENTORY_ADJUST && method === "POST") {
      const body = await boundedJson(request);
      const result = await adjustInventoryBatch(env, body, actor);
      return json({
        ok: true,
        authority: "admin-worker",
        schema: "mmd_shop_inventory_adjustment_v1",
        ...result,
      });
    }

    if (path === API_PRODUCTS && method === "GET") {
      const data = await loadProductsWorkspace(env);
      return json({
        ok: true,
        authority: "admin-worker",
        schema: "mmd_shop_admin_products_v1",
        ...data,
      });
    }

    if (path === API_PRODUCTS_UPDATE && method === "POST") {
      const body = await boundedJson(request);
      const result = await updateMmdProduct(env, body, actor);
      return json({
        ok: true,
        authority: "admin-worker",
        schema: "mmd_shop_product_admin_mutation_v1",
        ...result,
      });
    }
  } catch (error) {
    const status = Number(error?.status || 503);
    console.error("MMD Shop admin operations error:", clean(error?.message || error, 240));
    return json({
      ok: false,
      authority: "admin-worker",
      error: clean(error?.message || "shop_admin_operation_failed", 240),
    }, status);
  }

  return json({ ok: false, error: "not_found" }, 404);
}

async function loadInventoryWorkspace(env) {
  const [products, suppliers, batches, movements] = await Promise.all([
    listRecords(env, table(env, "products"), Object.values(PRODUCT_FIELDS)),
    listRecords(env, table(env, "suppliers"), Object.values(SUPPLIER_FIELDS)),
    listRecords(env, table(env, "inventory"), Object.values(INVENTORY_FIELDS)),
    listRecords(env, table(env, "movements"), Object.values(MOVEMENT_FIELDS)),
  ]);

  const productById = new Map(products.map((record) => [record.id, record]));
  const supplierById = new Map(suppliers.map((record) => [record.id, record]));
  const batchesByProduct = new Map();

  const safeBatches = batches.map((record) => safeBatch(record, productById, supplierById));
  for (const batch of safeBatches) {
    if (!batch.product_id) continue;
    const list = batchesByProduct.get(batch.product_id) || [];
    list.push(batch);
    batchesByProduct.set(batch.product_id, list);
  }

  const productRows = products
    .map((record) => {
      const fields = record.fields || {};
      const brands = selectList(fields[PRODUCT_FIELDS.brands]);
      const mmdEnabled = includesMmdShop(brands);
      const linkedBatches = batchesByProduct.get(record.id) || [];
      const activeBatches = linkedBatches.filter((batch) => batch.batch_status === "active");
      const remaining = activeBatches.reduce((sum, batch) => sum + number(batch.quantity_remaining), 0);
      if (!mmdEnabled && linkedBatches.length === 0) return null;
      return {
        id: record.id,
        product_name: clean(fields[PRODUCT_FIELDS.name], 220) || "MMD Shop Item",
        sku: clean(fields[PRODUCT_FIELDS.sku], 120),
        status: code(fields[PRODUCT_FIELDS.status]) || "draft",
        mmd_enabled: mmdEnabled,
        mmd_price_thb: numberOrNull(fields[PRODUCT_FIELDS.mmdPrice]),
        active_batches: activeBatches.length,
        quantity_remaining: remaining,
        low_stock: activeBatches.some((batch) => batch.low_stock === true),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.product_name.localeCompare(b.product_name, "th"));

  const safeMovements = movements
    .map((record) => safeMovement(record, productById, supplierById));
  const recentMovements = safeMovements
    .slice()
    .sort((a, b) => String(b.movement_date || "").localeCompare(String(a.movement_date || "")))
    .slice(0, 100);

  const reconciliation = buildMmdShopStockReconciliation({
    batches: safeBatches,
    movements: safeMovements,
    low_stock_threshold: Number(env.MMD_SHOP_LOW_STOCK_THRESHOLD || 5),
  });
  const reconciliationByBatch = new Map(reconciliation.batches.map((item) => [item.batch_id, item]));
  const enrichedBatches = safeBatches.map((batch) => ({
    ...batch,
    reconciliation: reconciliationByBatch.get(batch.id) || null,
  }));
  const reconciliationByProduct = new Map();
  for (const row of reconciliation.batches) {
    if (!row.product_id) continue;
    const current = reconciliationByProduct.get(row.product_id) || {
      reserved_units: 0,
      available_units: 0,
      physical_estimate_units: 0,
      reconciliation_mismatches: 0,
    };
    current.reserved_units += Number(row.reserved_units || 0);
    current.available_units += Number(row.available_units || 0);
    current.physical_estimate_units += Number(row.physical_estimate_units || 0);
    if (row.reconciliation_status === "mismatch") current.reconciliation_mismatches += 1;
    reconciliationByProduct.set(row.product_id, current);
  }
  for (const product of productRows) {
    const health = reconciliationByProduct.get(product.id);
    product.available_units = health?.available_units ?? product.quantity_remaining;
    product.reserved_units = health?.reserved_units ?? 0;
    product.physical_estimate_units = health?.physical_estimate_units ?? product.quantity_remaining;
    product.reconciliation_mismatches = health?.reconciliation_mismatches ?? 0;
  }

  return {
    products: productRows,
    batches: enrichedBatches
      .sort((a, b) => String(b.received_date || "").localeCompare(String(a.received_date || "")))
      .slice(0, 300),
    suppliers: suppliers
      .map((record) => ({
        id: record.id,
        supplier_name: clean(record.fields?.[SUPPLIER_FIELDS.name], 220) || record.id,
        status: code(record.fields?.[SUPPLIER_FIELDS.status]) || null,
      }))
      .sort((a, b) => a.supplier_name.localeCompare(b.supplier_name, "th")),
    movements: recentMovements,
    reconciliation,
    metrics: {
      products: productRows.length,
      tracked_products: productRows.filter((item) => item.active_batches > 0).length,
      active_batches: safeBatches.filter((item) => item.batch_status === "active").length,
      low_batches: reconciliation.metrics.low_stock_batches,
      reconciliation_mismatches: reconciliation.metrics.reconciliation_mismatches,
      reserved_units: reconciliation.metrics.reserved_units,
      total_units: reconciliation.metrics.available_units,
      physical_estimate_units: reconciliation.metrics.physical_estimate_units,
    },
  };
}

async function loadProductsWorkspace(env) {
  const [products, suppliers, batches] = await Promise.all([
    listRecords(env, table(env, "products"), Object.values(PRODUCT_FIELDS)),
    listRecords(env, table(env, "suppliers"), Object.values(SUPPLIER_FIELDS)),
    listRecords(env, table(env, "inventory"), Object.values(INVENTORY_FIELDS)),
  ]);

  const supplierById = new Map(suppliers.map((record) => [
    record.id,
    clean(record.fields?.[SUPPLIER_FIELDS.name], 220) || record.id,
  ]));

  const stockByProduct = new Map();
  for (const record of batches) {
    const fields = record.fields || {};
    if (code(fields[INVENTORY_FIELDS.status]) !== "active") continue;
    const remaining = Math.max(0, number(fields[INVENTORY_FIELDS.remaining]));
    for (const productId of linkedIds(fields[INVENTORY_FIELDS.product])) {
      const current = stockByProduct.get(productId) || { quantity_remaining: 0, active_batches: 0, low_stock: false };
      current.quantity_remaining += remaining;
      current.active_batches += 1;
      current.low_stock = current.low_stock || code(fields[INVENTORY_FIELDS.low]) === "low";
      stockByProduct.set(productId, current);
    }
  }

  const rows = products
    .map((record) => {
      const fields = record.fields || {};
      const brands = selectList(fields[PRODUCT_FIELDS.brands]);
      const stock = stockByProduct.get(record.id) || { quantity_remaining: 0, active_batches: 0, low_stock: false };
      const supplierIds = linkedIds(fields[PRODUCT_FIELDS.supplier]);
      return {
        id: record.id,
        product_name: clean(fields[PRODUCT_FIELDS.name], 220) || "Shop Item",
        sku: clean(fields[PRODUCT_FIELDS.sku], 120),
        category: selectName(fields[PRODUCT_FIELDS.category]) || "Other",
        shared_status: code(fields[PRODUCT_FIELDS.status]) || "draft",
        curation_label: selectName(fields[PRODUCT_FIELDS.curation]) || null,
        product_note: clean(fields[PRODUCT_FIELDS.note], 1200) || null,
        shared_cost_thb: numberOrNull(fields[PRODUCT_FIELDS.cost]),
        mmd_price_thb: numberOrNull(fields[PRODUCT_FIELDS.mmdPrice]),
        mmd_enabled: includesMmdShop(brands),
        brand_availability: brands,
        supplier_ids: supplierIds,
        suppliers: supplierIds.map((id) => supplierById.get(id) || id),
        quantity_remaining: stock.quantity_remaining,
        active_batches: stock.active_batches,
        low_stock: stock.low_stock,
      };
    })
    .sort((a, b) => {
      if (a.mmd_enabled !== b.mmd_enabled) return a.mmd_enabled ? -1 : 1;
      return a.product_name.localeCompare(b.product_name, "th");
    });

  return {
    products: rows,
    metrics: {
      all_products: rows.length,
      mmd_enabled: rows.filter((item) => item.mmd_enabled).length,
      active_for_sale: rows.filter((item) => item.mmd_enabled && item.shared_status === "active" && number(item.mmd_price_thb) > 0).length,
      needs_price: rows.filter((item) => item.mmd_enabled && !(number(item.mmd_price_thb) > 0)).length,
    },
    mutation_scope: {
      writable: ["mmd_enabled", "mmd_price_thb"],
      shared_fields_read_only: ["shared_status", "category", "curation_label", "product_note", "shared_cost_thb"],
    },
  };
}

async function createInventoryBatch(env, body, actor) {
  const productId = validRecordId(body?.product_id);
  if (!productId) throw httpError(400, "product_id_required");

  const product = await getRecord(env, table(env, "products"), productId, Object.values(PRODUCT_FIELDS));
  if (!product?.id) throw httpError(404, "product_not_found");
  if (!includesMmdShop(selectList(product.fields?.[PRODUCT_FIELDS.brands]))) {
    throw httpError(409, "product_not_enabled_for_mmd_shop");
  }

  const quantity = integer(body?.quantity ?? body?.quantity_in);
  if (!(quantity > 0 && quantity <= 1000000)) throw httpError(400, "invalid_quantity");

  const unitCost = moneyNumber(body?.unit_cost_thb ?? body?.unit_cost);
  if (unitCost === null || unitCost < 0) throw httpError(400, "invalid_unit_cost");

  const supplierId = validRecordId(body?.supplier_id);
  if (body?.supplier_id && !supplierId) throw httpError(400, "invalid_supplier_id");
  if (supplierId) {
    const supplier = await getRecord(env, table(env, "suppliers"), supplierId, Object.values(SUPPLIER_FIELDS));
    if (!supplier?.id) throw httpError(404, "supplier_not_found");
  }

  const receivedDate = normalizeDate(body?.received_date) || bangkokDate();
  const sku = clean(product.fields?.[PRODUCT_FIELDS.sku], 120) || "MMD";
  const batchCode = clean(body?.batch_code, 120) || makeBatchCode(sku);
  const batchName = clean(body?.batch_name, 220) || `${sku} · ${batchCode}`;
  const internalNote = clean(body?.note, 1500);
  const totalCost = roundMoney(quantity * unitCost);

  const fields = {
    [INVENTORY_FIELDS.name]: batchName,
    [INVENTORY_FIELDS.product]: [productId],
    [INVENTORY_FIELDS.code]: batchCode,
    [INVENTORY_FIELDS.receivedDate]: receivedDate,
    [INVENTORY_FIELDS.quantityIn]: quantity,
    [INVENTORY_FIELDS.remaining]: quantity,
    [INVENTORY_FIELDS.unitCost]: unitCost,
    [INVENTORY_FIELDS.totalCost]: totalCost,
    [INVENTORY_FIELDS.remainingValue]: totalCost,
    [INVENTORY_FIELDS.low]: "OK",
    [INVENTORY_FIELDS.status]: "active",
    [INVENTORY_FIELDS.note]: appendAudit(internalNote, actor, "batch_created"),
  };
  if (supplierId) fields[INVENTORY_FIELDS.supplier] = [supplierId];

  const batch = await createRecord(env, table(env, "inventory"), fields);

  try {
    const movement = await createMovement(env, {
      name: `BATCH IN · ${batchCode}`,
      batchId: batch.id,
      productId,
      supplierId,
      type: "in",
      quantity,
      unitCost,
      date: receivedDate,
      referenceType: "batch_receive",
      referenceId: batchCode,
      note: appendAudit(internalNote, actor, "batch_receive"),
    });
    return {
      batch: safeBatch(batch, new Map([[productId, product]]), new Map()),
      movement_id: movement.id,
    };
  } catch (error) {
    await patchRecord(env, table(env, "inventory"), batch.id, {
      [INVENTORY_FIELDS.note]: appendAudit(
        appendText(fields[INVENTORY_FIELDS.note], `movement_create_failed=${clean(error?.message, 180)}`),
        actor,
        "batch_movement_review_required",
      ),
    }).catch(() => null);
    const wrapped = httpError(502, "batch_created_movement_failed");
    wrapped.batchCreated = true;
    throw wrapped;
  }
}

async function adjustInventoryBatch(env, body, actor) {
  const batchId = validRecordId(body?.batch_id);
  if (!batchId) throw httpError(400, "batch_id_required");

  const delta = integer(body?.delta);
  if (!delta || Math.abs(delta) > 1000000) throw httpError(400, "invalid_adjustment_delta");

  const batch = await getRecord(env, table(env, "inventory"), batchId, Object.values(INVENTORY_FIELDS));
  if (!batch?.id) throw httpError(404, "batch_not_found");

  const fields = batch.fields || {};
  const productId = linkedIds(fields[INVENTORY_FIELDS.product])[0];
  if (!productId) throw httpError(409, "batch_product_missing");

  const current = Math.max(0, number(fields[INVENTORY_FIELDS.remaining]));
  const next = current + delta;
  if (next < 0) throw httpError(409, "adjustment_exceeds_remaining_stock");

  const unitCost = Math.max(0, number(fields[INVENTORY_FIELDS.unitCost]));
  const nextStatus = next === 0 ? "depleted" : "active";
  let low = selectName(fields[INVENTORY_FIELDS.low]) || "OK";
  if (next === 0) low = "Low";
  if (typeof body?.low_stock === "boolean" && next > 0) low = body.low_stock ? "Low" : "OK";

  const note = clean(body?.note, 1500);
  const nextNote = appendAudit(appendText(fields[INVENTORY_FIELDS.note], note), actor, `manual_adjustment:${delta}`);

  const patched = await patchRecord(env, table(env, "inventory"), batch.id, {
    [INVENTORY_FIELDS.remaining]: next,
    [INVENTORY_FIELDS.remainingValue]: roundMoney(next * unitCost),
    [INVENTORY_FIELDS.low]: low,
    [INVENTORY_FIELDS.status]: nextStatus,
    [INVENTORY_FIELDS.note]: nextNote,
  });

  const supplierId = linkedIds(fields[INVENTORY_FIELDS.supplier])[0] || null;
  let movement = null;
  try {
    movement = await createMovement(env, {
      name: `ADJUST · ${clean(fields[INVENTORY_FIELDS.code], 120) || batch.id}`,
      batchId: batch.id,
      productId,
      supplierId,
      type: "adjustment",
      quantity: delta,
      unitCost,
      date: bangkokDate(),
      referenceType: "manual",
      referenceId: batch.id,
      note: appendAudit(note, actor, "manual_adjustment"),
    });
  } catch (error) {
    await patchRecord(env, table(env, "inventory"), batch.id, {
      [INVENTORY_FIELDS.note]: appendText(nextNote, `movement_create_failed=${clean(error?.message, 180)}`),
    }).catch(() => null);
    throw httpError(502, "inventory_adjusted_movement_failed");
  }

  return {
    batch_id: batch.id,
    product_id: productId,
    previous_quantity_remaining: current,
    quantity_remaining: next,
    delta,
    batch_status: nextStatus,
    low_stock: code(low) === "low",
    movement_id: movement?.id || null,
    record_id: patched?.id || batch.id,
  };
}

async function updateMmdProduct(env, body, actor) {
  const productId = validRecordId(body?.product_id);
  if (!productId) throw httpError(400, "product_id_required");

  const record = await getRecord(env, table(env, "products"), productId, Object.values(PRODUCT_FIELDS));
  if (!record?.id) throw httpError(404, "product_not_found");

  const currentBrands = selectList(record.fields?.[PRODUCT_FIELDS.brands]);
  const fields = {};
  let nextBrands = [...currentBrands];

  if (typeof body?.mmd_enabled === "boolean") {
    nextBrands = setMmdAvailability(currentBrands, body.mmd_enabled);
    fields[PRODUCT_FIELDS.brands] = nextBrands;
  }

  if (Object.prototype.hasOwnProperty.call(body || {}, "mmd_price_thb")) {
    const value = moneyNumber(body.mmd_price_thb);
    if (value === null || value <= 0) throw httpError(400, "invalid_mmd_price");
    fields[PRODUCT_FIELDS.mmdPrice] = value;
  }

  if (body?.clear_price === true) {
    const enabled = typeof body?.mmd_enabled === "boolean"
      ? body.mmd_enabled
      : includesMmdShop(currentBrands);
    if (enabled) throw httpError(409, "disable_mmd_shop_before_clearing_price");
    fields[PRODUCT_FIELDS.mmdPrice] = null;
  }

  if (!Object.keys(fields).length) throw httpError(400, "no_supported_product_changes");

  const effectiveEnabled = typeof body?.mmd_enabled === "boolean"
    ? body.mmd_enabled
    : includesMmdShop(currentBrands);
  const effectivePrice = Object.prototype.hasOwnProperty.call(fields, PRODUCT_FIELDS.mmdPrice)
    ? fields[PRODUCT_FIELDS.mmdPrice]
    : numberOrNull(record.fields?.[PRODUCT_FIELDS.mmdPrice]);

  if (effectiveEnabled && !(Number(effectivePrice) > 0)) {
    throw httpError(409, "mmd_price_required_before_enabling");
  }

  const updated = await patchRecord(env, table(env, "products"), record.id, fields);
  console.log(JSON.stringify({
    event: "mmd_shop_product_admin_update",
    product_id: productId,
    actor_id: clean(actor?.id, 180) || "admin",
    mmd_enabled: effectiveEnabled,
    price_changed: Object.prototype.hasOwnProperty.call(fields, PRODUCT_FIELDS.mmdPrice),
  }));

  return {
    product_id: productId,
    product_name: clean(updated.fields?.[PRODUCT_FIELDS.name] || record.fields?.[PRODUCT_FIELDS.name], 220),
    sku: clean(updated.fields?.[PRODUCT_FIELDS.sku] || record.fields?.[PRODUCT_FIELDS.sku], 120),
    mmd_enabled: includesMmdShop(selectList(updated.fields?.[PRODUCT_FIELDS.brands] ?? nextBrands)),
    mmd_price_thb: numberOrNull(updated.fields?.[PRODUCT_FIELDS.mmdPrice]),
    brand_availability: selectList(updated.fields?.[PRODUCT_FIELDS.brands] ?? nextBrands),
  };
}

function safeBatch(record, productById, supplierById) {
  const fields = record?.fields || {};
  const productId = linkedIds(fields[INVENTORY_FIELDS.product])[0] || null;
  const supplierId = linkedIds(fields[INVENTORY_FIELDS.supplier])[0] || null;
  const product = productId ? productById.get(productId) : null;
  const supplier = supplierId ? supplierById.get(supplierId) : null;
  const remaining = Math.max(0, number(fields[INVENTORY_FIELDS.remaining]));
  return {
    id: record?.id || null,
    batch_name: clean(fields[INVENTORY_FIELDS.name], 220) || record?.id || "Batch",
    batch_code: clean(fields[INVENTORY_FIELDS.code], 120) || null,
    product_id: productId,
    product_name: clean(product?.fields?.[PRODUCT_FIELDS.name], 220) || productId,
    sku: clean(product?.fields?.[PRODUCT_FIELDS.sku], 120) || null,
    supplier_id: supplierId,
    supplier_name: clean(supplier?.fields?.[SUPPLIER_FIELDS.name], 220) || supplierId,
    received_date: clean(fields[INVENTORY_FIELDS.receivedDate], 60) || null,
    quantity_in: numberOrNull(fields[INVENTORY_FIELDS.quantityIn]) || 0,
    quantity_remaining: remaining,
    unit_cost_thb: numberOrNull(fields[INVENTORY_FIELDS.unitCost]),
    remaining_stock_value_thb: numberOrNull(fields[INVENTORY_FIELDS.remainingValue]),
    low_stock: code(fields[INVENTORY_FIELDS.low]) === "low",
    batch_status: code(fields[INVENTORY_FIELDS.status]) || "archived",
    internal_note: clean(fields[INVENTORY_FIELDS.note], 1200) || null,
  };
}

function safeMovement(record, productById, supplierById) {
  const fields = record?.fields || {};
  const productId = linkedIds(fields[MOVEMENT_FIELDS.product])[0] || null;
  const supplierId = linkedIds(fields[MOVEMENT_FIELDS.supplier])[0] || null;
  return {
    id: record?.id || null,
    movement_name: clean(fields[MOVEMENT_FIELDS.name], 220) || "Movement",
    movement_type: code(fields[MOVEMENT_FIELDS.type]) || null,
    quantity: numberOrNull(fields[MOVEMENT_FIELDS.quantity]),
    unit_cost_thb: numberOrNull(fields[MOVEMENT_FIELDS.unitCost]),
    movement_date: clean(fields[MOVEMENT_FIELDS.date], 60) || null,
    batch_id: linkedIds(fields[MOVEMENT_FIELDS.batch])[0] || null,
    product_id: productId,
    product_name: clean(productById.get(productId)?.fields?.[PRODUCT_FIELDS.name], 220) || productId,
    supplier_id: supplierId,
    supplier_name: clean(supplierById.get(supplierId)?.fields?.[SUPPLIER_FIELDS.name], 220) || supplierId,
    reference_type: code(fields[MOVEMENT_FIELDS.referenceType]) || null,
    reference_id: clean(fields[MOVEMENT_FIELDS.referenceId], 220) || null,
    note: clean(fields[MOVEMENT_FIELDS.note], 1000) || null,
  };
}

async function createMovement(env, input) {
  const fields = {
    [MOVEMENT_FIELDS.name]: input.name,
    [MOVEMENT_FIELDS.batch]: [input.batchId],
    [MOVEMENT_FIELDS.product]: [input.productId],
    [MOVEMENT_FIELDS.type]: input.type,
    [MOVEMENT_FIELDS.quantity]: input.quantity,
    [MOVEMENT_FIELDS.unitCost]: input.unitCost,
    [MOVEMENT_FIELDS.date]: input.date,
    [MOVEMENT_FIELDS.referenceType]: input.referenceType,
    [MOVEMENT_FIELDS.referenceId]: input.referenceId,
    [MOVEMENT_FIELDS.note]: input.note,
  };
  if (input.supplierId) fields[MOVEMENT_FIELDS.supplier] = [input.supplierId];
  return createRecord(env, table(env, "movements"), fields);
}

async function listRecords(env, tableId, fieldIds) {
  const records = [];
  let offset = "";
  let pages = 0;

  do {
    const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(baseId(env))}/${encodeURIComponent(tableId)}`);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("returnFieldsByFieldId", "true");
    for (const fieldId of fieldIds) url.searchParams.append("fields[]", fieldId);
    if (offset) url.searchParams.set("offset", offset);

    const response = await fetch(url.toString(), {
      headers: { authorization: `Bearer ${airtableToken(env)}`, accept: "application/json" },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw httpError(response.status >= 500 ? 502 : response.status, `airtable_list_${response.status}`);

    records.push(...(Array.isArray(payload.records) ? payload.records : []));
    offset = clean(payload.offset, 300);
    pages += 1;
  } while (offset && pages < 20);

  return records;
}

async function getRecord(env, tableId, recordId, fieldIds) {
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(baseId(env))}/${encodeURIComponent(tableId)}/${encodeURIComponent(recordId)}`);
  url.searchParams.set("returnFieldsByFieldId", "true");
  for (const fieldId of fieldIds) url.searchParams.append("fields[]", fieldId);
  const response = await fetch(url.toString(), {
    headers: { authorization: `Bearer ${airtableToken(env)}`, accept: "application/json" },
  });
  if (response.status === 404) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(response.status >= 500 ? 502 : response.status, `airtable_get_${response.status}`);
  return payload;
}

async function createRecord(env, tableId, fields) {
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(baseId(env))}/${encodeURIComponent(tableId)}`, {
    method: "POST",
    headers: { authorization: `Bearer ${airtableToken(env)}`, "content-type": "application/json" },
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(response.status >= 500 ? 502 : response.status, `airtable_create_${response.status}`);
  const record = payload.records?.[0];
  if (!record?.id) throw httpError(502, "airtable_create_missing_record");
  return record;
}

async function patchRecord(env, tableId, recordId, fields) {
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(baseId(env))}/${encodeURIComponent(tableId)}/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${airtableToken(env)}`, "content-type": "application/json" },
    body: JSON.stringify({ fields, typecast: true }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(response.status >= 500 ? 502 : response.status, `airtable_patch_${response.status}`);
  return payload;
}

function table(env, kind) {
  const map = {
    products: env.SHARED_SHOP_PRODUCTS_TABLE_ID || TABLES.products,
    suppliers: env.SHARED_SUPPLIERS_TABLE_ID || TABLES.suppliers,
    inventory: env.MMD_SHOP_INVENTORY_BATCHES_TABLE_ID || TABLES.inventory,
    movements: env.MMD_SHOP_STOCK_MOVEMENTS_TABLE_ID || TABLES.movements,
  };
  return clean(map[kind], 120);
}

function airtableToken(env) {
  const token = clean(env.AIRTABLE_TOKEN || env.AIRTABLE_API_KEY, 5000);
  if (!token) throw httpError(503, "airtable_not_configured");
  return token;
}

function baseId(env) {
  const id = clean(env.AIRTABLE_BASE_ID, 120);
  if (!id) throw httpError(503, "airtable_not_configured");
  return id;
}

async function boundedJson(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 20000) throw httpError(413, "body_too_large");
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw httpError(400, "invalid_json_body");
  return body;
}

function setMmdAvailability(values, enabled) {
  const result = [];
  let hadMmd = false;
  for (const value of values) {
    const name = selectName(value);
    if (!name) continue;
    if (name.toLowerCase() === "mmd shop") {
      hadMmd = true;
      if (enabled) result.push("MMD Shop");
    } else {
      result.push(name);
    }
  }
  if (enabled && !hadMmd) result.push("MMD Shop");
  return [...new Set(result)];
}

function includesMmdShop(values) {
  return values.some((value) => selectName(value).trim().toLowerCase() === "mmd shop");
}

function selectName(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && typeof value.name === "string") return value.name;
  return String(value);
}

function selectList(value) {
  return (Array.isArray(value) ? value : value == null ? [] : [value]).map(selectName).filter(Boolean);
}

function linkedIds(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => clean(typeof item === "string" ? item : item?.id, 80))
    .filter((id) => /^rec[A-Za-z0-9]{14}$/.test(id));
}

function validRecordId(value) {
  const id = clean(value, 80);
  return /^rec[A-Za-z0-9]{14}$/.test(id) ? id : "";
}

function normalizeDate(value) {
  const raw = clean(value, 40);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function integer(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : 0;
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function moneyNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? roundMoney(n) : null;
}

function roundMoney(value) {
  const n = Number(value);
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function makeBatchCode(sku) {
  const bytes = crypto.getRandomValues(new Uint8Array(2));
  const suffix = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `MMD-${clean(sku, 40).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "ITEM"}-${bangkokDate().replace(/-/g, "")}-${suffix}`;
}

function bangkokDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function actorLabel(actor) {
  return clean(actor?.email || actor?.name || actor?.id, 180) || "admin";
}

function appendAudit(current, actor, action) {
  const entry = `[${new Date().toISOString()}] ${clean(action, 180)} by ${actorLabel(actor)}`;
  return appendText(current, entry);
}

function appendText(current, extra) {
  return [clean(current, 9000), clean(extra, 1800)].filter(Boolean).join("\n").slice(0, 12000);
}

function allowedActor(actor) {
  return Boolean(actor?.id && actor?.role && String(actor.role).toLowerCase() !== "mms_partner");
}

function adminLoginRedirect(request) {
  const url = new URL(request.url);
  const next = encodeURIComponent(url.pathname + url.search);
  return new Response(null, {
    status: 302,
    headers: {
      location: `/internal/admin/login?next=${next}`,
      "cache-control": "no-store",
      "x-mmd-route-owner": "admin-worker",
    },
  });
}

function presentationHeaders(request) {
  const headers = new Headers();
  for (const name of ["accept", "accept-language", "user-agent"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function pageUnavailable(method, title) {
  const safeTitle = clean(title, 100) || "MMD Shop Admin";
  const html = `<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${safeTitle}</title><body style="font-family:system-ui;padding:28px;background:#11100e;color:#f3eee5"><h1>${safeTitle} unavailable</h1><p>กลับ Shop Orders แล้วลองอีกครั้ง</p><a style="color:#c9a86e" href="/internal/admin/shop/orders">Shop Orders</a></body></html>`;
  return new Response(method === "HEAD" ? null : html, {
    status: 502,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

function normalizePath(value) {
  const path = String(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function code(value) {
  return clean(value, 160).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function clean(value, max = 5000) {
  return String(value == null ? "" : value).trim().slice(0, max).replace(/[\u0000-\u001F\u007F]/g, " ");
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private",
      "x-mmd-route-owner": "admin-worker",
    },
  });
}

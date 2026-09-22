const DEFAULT_PRODUCT_FIELDS = [
  "Product Name",
  "SKU",
  "Brand Availability",
  "Category",
  "Status",
  "Curation Label",
  "Supplier",
  "Product Note",
  "Himai Selling Price THB"
];

const MOVEMENT_FIELDS = [
  "Movement Name",
  "Batch",
  "Product",
  "Supplier",
  "Movement Type",
  "Quantity",
  "Movement Date",
  "Reference Type"
];

const PRODUCT_ALIAS_RULES = Object.freeze([
  {
    triggers: ["pod plus", "podplus", "pod premium plus", "premium plus"],
    aliases: ["pod plus", "podplus", "pod premium plus", "premium plus", "pod premium", "pod"]
  },
  {
    triggers: ["glenburgie", "glenburgies", "pop plus", "popplus"],
    aliases: ["glenburgie", "glenburgies", "pop plus", "popplus"]
  },
  {
    triggers: ["gg water", "ggwater"],
    aliases: ["gg water", "ggwater", "gg-water"]
  }
]);

const TABLES = Object.freeze({
  orders: "tblr8lbi2wMuRM1N4",
  orderItems: "tbl37Iprxz4OLL65P",
  inventory: "tblwFgl4et1TOgtNn",
  movements: "tblASifwHdArNKQP2",
  supplierLedger: "tbl2hqvi2hmk3wpe0",
  payouts: "tblJF9dH59FK31dgA"
});

const ORDER_FIELDS = Object.freeze({
  orderId: "flde515MCoEq08YzU",
  orderDate: "fld7NNIA2kYNQNekl",
  orderStatus: "fldnCO3H5CpJoYmWD",
  paymentStatus: "fldUpDeLdO6D9OUcd",
  total: "fldYIwMzRJdKdznkY",
  shopBrand: "fld97aHqq3IbPam84"
});

const ITEM_FIELDS = Object.freeze({
  name: "fldLR9aIu2m6DTr2e",
  order: "fldSVk92UcASTOuOK",
  product: "fld40mHWKpBthoO9T",
  supplier: "fld5AUxwx9bSOd0gY",
  quantity: "fldJkKWMZiVQ3g1a6",
  lineTotal: "fldr7KTPoSbnblo5I",
  status: "flddJVVBAjVoyqcpY"
});

const LEDGER_FIELDS = Object.freeze({
  supplier: "fldwv8SHlbizOfWgm",
  amountOwed: "fldXX85oksNP4yinL",
  status: "fld5c5KU1zqW5azXM",
  date: "fldD8EbMb2jegXKXn"
});

const PAYOUT_FIELDS = Object.freeze({
  payoutId: "fldTjVmKD02E7YZYz",
  supplier: "fldWjhkv2uGCeDWGN",
  payoutDate: "fldil2gXeLm2UXwpG",
  amount: "flddxwAqW0JQFTcUF",
  method: "fldEnjFcUSgoMsmJ2",
  reference: "fldFrVOU8dfDgHDM4",
  status: "fldgo6dkYaHg8pgSr"
});

export async function handleSupplierPortal(request, env) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const pathname = url.pathname;

  if (method === "OPTIONS" && (pathname === "/shop/api/supplier/portal" || pathname === "/shop/api/distributor/portal")) {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (method === "GET" && (pathname === "/shop/api/supplier/portal" || pathname === "/shop/api/distributor/portal")) {
    return getSupplierPortal(request, env);
  }

  return null;
}

async function getSupplierPortal(request, env) {
  const token = readToken(request);
  if (!token) {
    return json({ ok: false, error: "missing_supplier_token" }, 401);
  }

  const supplierAccess = resolveSupplierAccess(env, token);
  if (!supplierAccess) {
    return json({ ok: false, error: "invalid_supplier_token" }, 403);
  }

  const [catalog, stockByProduct, movements] = await Promise.all([
    loadHimaiProducts(env),
    loadHimaiStockByProduct(env),
    loadMovements(env)
  ]);

  const visibleCatalog = catalog.filter((product) => canSeeProduct(supplierAccess, product));
  const visibleProductIds = new Set(visibleCatalog.map((product) => product.id));
  const visibleSupplierIds = new Set([
    ...(supplierAccess.supplier_ids || []),
    ...visibleCatalog.flatMap((product) => Array.isArray(product.supplier_ids) ? product.supplier_ids : [])
  ].filter(Boolean));

  const [orders, finance] = await Promise.all([
    loadSupplierOrders(env, visibleProductIds, visibleSupplierIds),
    loadSupplierFinance(env, visibleSupplierIds)
  ]);

  const visibleProducts = visibleCatalog.map((product) => {
    const stock = stockByProduct.get(product.id) || { available: null, low: false };
    const productMovements = movements.filter((movement) => movementMatchesProduct(movement, product));
    const totals = summarizeMovements(productMovements);
    const available = stock.available;
    const lowStockThreshold = numberOrNull(supplierAccess.low_stock_threshold) ?? 10;

    return {
      id: product.id,
      product_name: product.product_name,
      sku: product.sku,
      category: product.category,
      status: product.status,
      curation_label: product.curation_label,
      supplier: product.supplier,
      selling_price_thb: product.selling_price_thb,
      price_status: product.price_status,
      description: product.description,
      available,
      low_stock: stock.low || (available !== null && available <= lowStockThreshold),
      sold_total: totals.out,
      reserved_total: totals.reserve,
      refill_signal: buildRefillSignal(available, stock.low, lowStockThreshold),
      movements: productMovements.slice(0, 12).map(toSafeMovement)
    };
  });

  const summary = {
    products: visibleProducts.length,
    stock_units: visibleProducts.reduce((sum, product) => sum + (numberOrNull(product.available) || 0), 0),
    sold_units: visibleProducts.reduce((sum, product) => sum + (numberOrNull(product.sold_total) || 0), 0),
    reserved_units: visibleProducts.reduce((sum, product) => sum + (numberOrNull(product.reserved_total) || 0), 0),
    orders: orders.length,
    open_balance_thb: numberOrNull(finance?.open_balance_thb) || 0,
    paid_total_thb: numberOrNull(finance?.paid_total_thb) || 0
  };

  return json({
    ok: true,
    shop: "shop",
    portal: "supplier_dashboard_v2",
    distributor: {
      name: supplierAccess.supplier_name || supplierAccess.name || "Supplier",
      role: supplierAccess.role || "Supplier",
      token_label: supplierAccess.token_label || supplierAccess.label || "supplier-token"
    },
    supplier: {
      name: supplierAccess.supplier_name || supplierAccess.name || "Supplier",
      role: supplierAccess.role || "Supplier",
      token_label: supplierAccess.token_label || supplierAccess.label || "supplier-token"
    },
    privacy: {
      customer_data: false,
      internal_margin: false,
      unit_cost: false,
      internal_notes: false,
      reference_ids: false,
      other_suppliers: false
    },
    summary,
    products: visibleProducts,
    orders,
    finance,
    updated_at: new Date().toISOString()
  });
}

async function loadSupplierOrders(env, visibleProductIds, visibleSupplierIds) {
  if (!visibleProductIds.size && !visibleSupplierIds.size) return [];

  const [itemRecords, orderRecords] = await Promise.all([
    airtableListByFieldIds(env, env.MMD_SHOP_ORDER_ITEMS_TABLE_ID || TABLES.orderItems, Object.values(ITEM_FIELDS)),
    airtableListByFieldIds(env, env.MMD_SHOP_ORDERS_TABLE_ID || TABLES.orders, Object.values(ORDER_FIELDS))
  ]);

  const byOrder = new Map();
  for (const record of itemRecords) {
    const fields = record.fields || {};
    const productIds = linkedFieldIds(fields[ITEM_FIELDS.product]);
    const supplierIds = linkedFieldIds(fields[ITEM_FIELDS.supplier]);
    const allowed = productIds.some((id) => visibleProductIds.has(id)) || supplierIds.some((id) => visibleSupplierIds.has(id));
    if (!allowed) continue;

    const orderId = linkedFieldIds(fields[ITEM_FIELDS.order])[0];
    if (!orderId) continue;
    const list = byOrder.get(orderId) || [];
    list.push({
      product_name: cleanText(fields[ITEM_FIELDS.name], 220) || "Product",
      quantity: numberOrNull(fields[ITEM_FIELDS.quantity]) || 0,
      line_total_thb: numberOrNull(fields[ITEM_FIELDS.lineTotal]) || 0,
      status: selectName(fields[ITEM_FIELDS.status]) || ""
    });
    byOrder.set(orderId, list);
  }

  return orderRecords
    .filter((record) => byOrder.has(record.id))
    .map((record) => {
      const fields = record.fields || {};
      const items = byOrder.get(record.id) || [];
      return {
        order_id: cleanText(fields[ORDER_FIELDS.orderId], 120) || "Order",
        order_date: cleanText(fields[ORDER_FIELDS.orderDate], 80) || "",
        order_status: selectName(fields[ORDER_FIELDS.orderStatus]) || "",
        payment_status: selectName(fields[ORDER_FIELDS.paymentStatus]) || "",
        channel: cleanText(fields[ORDER_FIELDS.shopBrand], 120) || "Shop",
        quantity: items.reduce((sum, item) => sum + (numberOrNull(item.quantity) || 0), 0),
        line_total_thb: items.reduce((sum, item) => sum + (numberOrNull(item.line_total_thb) || 0), 0),
        items
      };
    })
    .sort((a, b) => String(b.order_date).localeCompare(String(a.order_date)))
    .slice(0, 80);
}

async function loadSupplierFinance(env, visibleSupplierIds) {
  if (!visibleSupplierIds.size) {
    return { open_balance_thb: 0, paid_total_thb: 0, ledger: [], payouts: [] };
  }

  const [ledgerRecords, payoutRecords] = await Promise.all([
    airtableListByFieldIds(env, env.MMD_SHOP_SUPPLIER_LEDGER_TABLE_ID || TABLES.supplierLedger, Object.values(LEDGER_FIELDS)),
    airtableListByFieldIds(env, env.MMD_SHOP_SUPPLIER_PAYOUTS_TABLE_ID || TABLES.payouts, Object.values(PAYOUT_FIELDS))
  ]);

  const ledger = ledgerRecords
    .filter((record) => linkedFieldIds(record.fields?.[LEDGER_FIELDS.supplier]).some((id) => visibleSupplierIds.has(id)))
    .map((record) => ({
      date: cleanText(record.fields?.[LEDGER_FIELDS.date], 80) || "",
      amount_owed_thb: numberOrNull(record.fields?.[LEDGER_FIELDS.amountOwed]) || 0,
      status: selectName(record.fields?.[LEDGER_FIELDS.status]) || ""
    }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 120);

  const payouts = payoutRecords
    .filter((record) => linkedFieldIds(record.fields?.[PAYOUT_FIELDS.supplier]).some((id) => visibleSupplierIds.has(id)))
    .map((record) => ({
      payout_id: cleanText(record.fields?.[PAYOUT_FIELDS.payoutId], 120) || "",
      payout_date: cleanText(record.fields?.[PAYOUT_FIELDS.payoutDate], 80) || "",
      amount_thb: numberOrNull(record.fields?.[PAYOUT_FIELDS.amount]) || 0,
      method: selectName(record.fields?.[PAYOUT_FIELDS.method]) || "",
      reference: cleanText(record.fields?.[PAYOUT_FIELDS.reference], 160) || "",
      status: selectName(record.fields?.[PAYOUT_FIELDS.status]) || ""
    }))
    .sort((a, b) => String(b.payout_date).localeCompare(String(a.payout_date)))
    .slice(0, 120);

  return {
    open_balance_thb: ledger
      .filter((entry) => String(entry.status).toLowerCase() === "open")
      .reduce((sum, entry) => sum + entry.amount_owed_thb, 0),
    paid_total_thb: payouts
      .filter((entry) => ["paid", "completed", "settled"].includes(String(entry.status).toLowerCase()))
      .reduce((sum, entry) => sum + entry.amount_thb, 0),
    ledger,
    payouts
  };
}

async function airtableListByFieldIds(env, tableId, fieldIds) {
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
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Airtable error: ${response.status}`);
    records.push(...(Array.isArray(data.records) ? data.records : []));
    offset = cleanText(data.offset, 300);
    pages += 1;
  } while (offset && pages < 20);

  return records;
}

function linkedFieldIds(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") return item;
    return item?.id || "";
  }).filter(Boolean);
}

function cleanText(value, max = 5000) {
  return String(value == null ? "" : value).trim().slice(0, max).replace(/[\u0000-\u001F\u007F]/g, " ");
}

function readToken(request) {
  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token") || url.searchParams.get("supplier_token");
  if (queryToken) return queryToken.trim();

  const auth = request.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function resolveSupplierAccess(env, token) {
  const distributorConfig = parseSupplierTokenConfig(env.HIMAI_DISTRIBUTOR_PORTAL_TOKENS);
  const legacyConfig = parseSupplierTokenConfig(env.HIMAI_SUPPLIER_PORTAL_TOKENS);
  const item = distributorConfig.get(token) || legacyConfig.get(token);
  if (!item || item.active === false) return null;
  return normalizeAccessItem(token, item);
}

function parseSupplierTokenConfig(raw) {
  const map = new Map();
  if (!raw) return map;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_error) {
    return map;
  }

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (item && typeof item.token === "string") map.set(item.token, item);
    }
    return map;
  }

  if (parsed && typeof parsed === "object") {
    for (const [key, value] of Object.entries(parsed)) {
      if (value && typeof value === "object") map.set(key, value);
    }
  }

  return map;
}

function normalizeAccessItem(token, item) {
  const productKeywords = normalizeStringList(item.product_keywords || item.products || item.product_names);
  const supplierNames = normalizeStringList(item.supplier_names || item.supplier_name || item.name);
  const supplierIds = normalizeStringList(item.supplier_ids || item.supplier_id);

  return {
    ...item,
    supplier_ids: supplierIds,
    token_label: item.token_label || item.label || token,
    product_keywords: expandMatchTerms(productKeywords),
    supplier_names: expandMatchTerms(supplierNames)
  };
}

async function loadHimaiProducts(env) {
  const tableId = env.SHARED_SHOP_PRODUCTS_TABLE_ID || "tblzsmNLfP6J0kQ90";
  const supplierNames = await loadSupplierNames(env);
  const params = new URLSearchParams();
  params.set("pageSize", "100");
  for (const field of DEFAULT_PRODUCT_FIELDS) params.append("fields[]", field);

  const result = await airtableRequest(env, `${tableId}?${params.toString()}`);
  return (result.records || [])
    .map((record) => {
      const fields = record.fields || {};
      const brandAvailability = normalizeSelectList(fields["Brand Availability"]);
      const shouldShow = brandAvailability.length === 0 || brandAvailability.some((value) => {
        const normalized = value.toLowerCase();
        return normalized.includes("himai") || normalized === "shop" || normalized.includes("both");
      });
      if (!shouldShow) return null;

      const supplierIds = Array.isArray(fields["Supplier"]) ? fields["Supplier"] : [];
      const supplier = supplierIds.map((id) => supplierNames.get(id) || id);
      const sellingPrice = numberOrNull(fields["Himai Selling Price THB"]);

      return {
        id: record.id,
        product_name: fields["Product Name"] || "",
        sku: fields["SKU"] || "",
        category: selectName(fields["Category"]) || "Selected",
        status: selectName(fields["Status"]) || "",
        curation_label: selectName(fields["Curation Label"]) || "",
        supplier,
        supplier_ids: supplierIds,
        selling_price_thb: sellingPrice,
        price_status: sellingPrice === null || sellingPrice <= 0 ? "ask_shop" : "priced",
        description: fields["Product Note"] || ""
      };
    })
    .filter(Boolean);
}

async function loadHimaiStockByProduct(env) {
  const tableId = env.MMD_SHOP_INVENTORY_BATCHES_TABLE_ID || env.HIMAI_INVENTORY_BATCHES_TABLE_ID || TABLES.inventory;
  const fields = ["Product", "Quantity Remaining", "Low Stock Flag", "Batch Status"];
  const params = new URLSearchParams();
  params.set("pageSize", "100");
  for (const field of fields) params.append("fields[]", field);

  const result = await airtableRequest(env, `${tableId}?${params.toString()}`);
  const stockByProduct = new Map();

  for (const record of result.records || []) {
    const fields = record.fields || {};
    const productIds = Array.isArray(fields["Product"]) ? fields["Product"] : [];
    const remaining = numberOrNull(fields["Quantity Remaining"]);
    const batchStatus = (selectName(fields["Batch Status"]) || "").toLowerCase();
    const lowFlag = (selectName(fields["Low Stock Flag"]) || "").toLowerCase();

    if (batchStatus.includes("archiv") || batchStatus.includes("closed")) continue;

    for (const productId of productIds) {
      const current = stockByProduct.get(productId) || { available: 0, low: false };
      current.available += remaining || 0;
      current.low = current.low || lowFlag.includes("low") || lowFlag.includes("yes") || lowFlag.includes("true");
      stockByProduct.set(productId, current);
    }
  }

  return stockByProduct;
}

async function loadSupplierNames(env) {
  const tableId = env.SHARED_SUPPLIERS_TABLE_ID || "tbl81bnFyASeXCj9x";
  const params = new URLSearchParams();
  params.set("pageSize", "100");
  params.append("fields[]", "Supplier Name");

  const result = await airtableRequest(env, `${tableId}?${params.toString()}`);
  const names = new Map();
  for (const record of result.records || []) {
    names.set(record.id, record.fields?.["Supplier Name"] || record.id);
  }
  return names;
}

async function loadMovements(env) {
  const tableId = env.MMD_SHOP_STOCK_MOVEMENTS_TABLE_ID || env.HIMAI_STOCK_MOVEMENTS_TABLE_ID || TABLES.movements;
  const params = new URLSearchParams();
  params.set("pageSize", "100");
  params.append("sort[0][field]", "Movement Date");
  params.append("sort[0][direction]", "desc");
  for (const field of MOVEMENT_FIELDS) params.append("fields[]", field);

  const result = await airtableRequest(env, `${tableId}?${params.toString()}`);
  return (result.records || []).map((record) => ({
    id: record.id,
    movement_name: record.fields?.["Movement Name"] || "",
    movement_type: selectName(record.fields?.["Movement Type"]),
    quantity: numberOrNull(record.fields?.["Quantity"]),
    product_name: linkedName(record.fields?.["Product"]),
    product_id: linkedId(record.fields?.["Product"]),
    supplier_name: linkedName(record.fields?.["Supplier"]),
    supplier_id: linkedId(record.fields?.["Supplier"]),
    movement_date: record.fields?.["Movement Date"] || "",
    reference_type: selectName(record.fields?.["Reference Type"])
  }));
}

function canSeeProduct(access, product) {
  const haystack = normalizeMatchText([
    product.product_name,
    product.sku,
    product.category,
    product.curation_label,
    product.description,
    ...(Array.isArray(product.supplier) ? product.supplier : [])
  ].join(" "));

  const compactHaystack = compactMatchText(haystack);
  const productOk = access.product_keywords.length === 0 || hasAnyMatch(haystack, compactHaystack, access.product_keywords);
  const supplierOk = access.supplier_names.length > 0 && hasAnyMatch(haystack, compactHaystack, access.supplier_names);

  if (access.product_keywords.length > 0) return productOk || supplierOk;
  return supplierOk;
}

function hasAnyMatch(haystack, compactHaystack, terms) {
  return terms.some((term) => {
    const normalized = normalizeMatchText(term);
    if (!normalized) return false;
    const compact = compactMatchText(normalized);
    return haystack.includes(normalized) || (compact.length >= 4 && compactHaystack.includes(compact));
  });
}

function expandMatchTerms(values) {
  const set = new Set();
  for (const value of normalizeStringList(values)) {
    const normalized = normalizeMatchText(value);
    if (!normalized) continue;
    set.add(normalized);
    set.add(compactMatchText(normalized));

    for (const rule of PRODUCT_ALIAS_RULES) {
      const matchesRule = rule.triggers.some((trigger) => {
        const normalizedTrigger = normalizeMatchText(trigger);
        return normalized.includes(normalizedTrigger) || compactMatchText(normalized).includes(compactMatchText(normalizedTrigger));
      });
      if (!matchesRule) continue;
      for (const alias of rule.aliases) {
        const normalizedAlias = normalizeMatchText(alias);
        set.add(normalizedAlias);
        set.add(compactMatchText(normalizedAlias));
      }
    }
  }
  return [...set].filter(Boolean);
}

function movementMatchesProduct(movement, product) {
  if (movement.product_id && movement.product_id === product.id) return true;
  const haystack = normalizeMatchText(`${movement.product_name} ${movement.movement_name}`);
  const compactHaystack = compactMatchText(haystack);
  const productTerms = expandMatchTerms([product.product_name, product.sku]);
  return hasAnyMatch(haystack, compactHaystack, productTerms);
}

function summarizeMovements(movements) {
  return movements.reduce((totals, movement) => {
    const type = (movement.movement_type || "").toLowerCase();
    const qty = Math.abs(numberOrNull(movement.quantity) || 0);
    if (type.includes("out") || type.includes("ขาย")) totals.out += qty;
    if (type.includes("reserve") || type.includes("กัน")) totals.reserve += qty;
    if (type.includes("release") || type.includes("คืน")) totals.reserve -= qty;
    return totals;
  }, { out: 0, reserve: 0 });
}

function buildRefillSignal(available, lowFlag, threshold) {
  if (available === null || available === undefined) return "unknown";
  if (available <= 0) return "refill_now";
  if (lowFlag || available <= threshold) return "check_next_refill";
  return "ok";
}

function toSafeMovement(movement) {
  return {
    id: movement.id,
    movement_type: movement.movement_type,
    quantity: movement.quantity,
    movement_date: movement.movement_date,
    reference_type: movement.reference_type
  };
}

function linkedName(value) {
  if (!Array.isArray(value) || value.length === 0) return "";
  const first = value[0];
  if (typeof first === "string") return "";
  return first?.name || "";
}

function linkedId(value) {
  if (!Array.isArray(value) || value.length === 0) return null;
  const first = value[0];
  return typeof first === "string" ? first : first?.id || null;
}

function selectName(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && typeof value.name === "string") return value.name;
  return String(value);
}

function normalizeSelectList(value) {
  if (!value) return [];
  if (!Array.isArray(value)) return [selectName(value)].filter(Boolean);
  return value.map(selectName).filter(Boolean);
}

function normalizeStringList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return [String(value)].filter(Boolean);
}

function normalizeMatchText(value) {
  return String(value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactMatchText(value) {
  return normalizeMatchText(value).replace(/\s+/g, "");
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function airtableRequest(env, path) {
  const token = env.AIRTABLE_TOKEN || env.AIRTABLE_API_KEY;
  if (!token) throw new Error("Airtable token is not configured");

  const response = await fetch(`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    throw new Error(`Airtable error: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders()
    }
  });
}

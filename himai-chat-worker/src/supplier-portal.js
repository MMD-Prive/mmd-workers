import { readMmdShopReservation } from "../../shared/mmd-shop-stock-reservation.mjs";

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
  shopBrand: "fld97aHqq3IbPam84",
  notes: "fldWG0u77XQ5W0wpT"
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

const LIFF_PORTAL_PATH = "/shop/api/supplier/liff-portal";
const LIFF_BIND_PATH = "/shop/api/supplier/liff-bind";
const SUPPLIER_FIELDS = Object.freeze({
  name: "fldePq8Fmqq50CkPj",
  lineUserId: "fld1dqO4nWB3Pf6uT",
  lineName: "fldZgOx3v1FJ4k9WM",
  lineStatus: "fldZyHoik9SAUcbY6",
  lastLinkedAt: "fldD3yQmWorCKKz4H",
  status: "fld0BL7nG45ueEMKQ",
  inviteToken: "fld1RFwNRfArWb3cS",
  inviteExpiresAt: "flddW10scozb72r2T",
  internalNote: "fldViZfj7hExC1svq",
});

export async function handleSupplierPortal(request, env) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const pathname = url.pathname;
  const supplierPortalPath = pathname === "/shop/api/supplier/portal" || pathname === "/shop/api/distributor/portal";

  if (method === "OPTIONS" && (supplierPortalPath || pathname === LIFF_PORTAL_PATH || pathname === LIFF_BIND_PATH)) {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (method === "GET" && supplierPortalPath) {
    return getSupplierPortal(request, env);
  }

  if (method === "POST" && pathname === LIFF_PORTAL_PATH) {
    return getSupplierLiffPortal(request, env);
  }

  if (method === "POST" && pathname === LIFF_BIND_PATH) {
    return bindSupplierLiff(request, env);
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

  return json(await buildSupplierPortalPayload(env, supplierAccess));
}

async function getSupplierLiffPortal(request, env) {
  const body = await request.json().catch(() => null);
  const accessToken = cleanText(body?.access_token || body?.accessToken, 4096);
  if (!accessToken) {
    return json({ ok: false, error: "line_access_token_required" }, 401);
  }

  let lineProfile;
  try {
    lineProfile = await loadLineProfile(accessToken);
  } catch (_) {
    return json({ ok: false, error: "line_profile_failed" }, 401);
  }

  const supplierAccess = await resolveSupplierAccessByLineBinding(env, lineProfile.userId)
    || resolveSupplierAccessByLineUserId(env, lineProfile.userId);
  if (!supplierAccess) {
    return json({ ok: false, error: "supplier_line_not_authorized" }, 403);
  }

  return json(await buildSupplierPortalPayload(env, supplierAccess));
}

async function loadLineProfile(accessToken) {
  const response = await fetch("https://api.line.me/v2/profile", {
    headers: { authorization: "Bearer " + accessToken, accept: "application/json" },
  });
  const data = await response.json().catch(() => ({}));
  const userId = cleanText(data?.userId, 255);
  if (!response.ok || !userId) throw new Error("line_profile_failed");
  return { userId, displayName: cleanText(data?.displayName, 255) };
}

async function bindSupplierLiff(request, env) {
  const body = await request.json().catch(() => null);
  const accessToken = cleanText(body?.access_token || body?.accessToken, 4096);
  const inviteToken = cleanText(body?.invite_token || body?.inviteToken, 512);
  if (!accessToken) return json({ ok: false, error: "line_access_token_required" }, 401);
  if (!inviteToken) return json({ ok: false, error: "supplier_invite_required" }, 400);

  let lineProfile;
  try {
    lineProfile = await loadLineProfile(accessToken);
  } catch (_) {
    return json({ ok: false, error: "line_profile_failed" }, 401);
  }

  const records = await airtableListByFieldIds(
    env,
    env.SHARED_SUPPLIERS_TABLE_ID || "tbl81bnFyASeXCj9x",
    Object.values(SUPPLIER_FIELDS),
  );
  const now = Date.now();
  const matches = records.filter((record) => {
    const fields = record.fields || {};
    if (cleanText(fields[SUPPLIER_FIELDS.inviteToken], 512) !== inviteToken) return false;
    if (selectName(fields[SUPPLIER_FIELDS.status]).toLowerCase() !== "active") return false;
    const expiresAt = Date.parse(cleanText(fields[SUPPLIER_FIELDS.inviteExpiresAt], 120));
    return Number.isFinite(expiresAt) && expiresAt > now;
  });

  if (matches.length !== 1) return json({ ok: false, error: "supplier_invite_invalid_or_expired" }, 403);

  const record = matches[0];
  const existingLineUserId = cleanText(record.fields?.[SUPPLIER_FIELDS.lineUserId], 255);
  if (existingLineUserId && existingLineUserId !== lineProfile.userId) {
    return json({ ok: false, error: "supplier_already_bound" }, 409);
  }

  await airtablePatchRecordByFieldIds(env, env.SHARED_SUPPLIERS_TABLE_ID || "tbl81bnFyASeXCj9x", record.id, {
    [SUPPLIER_FIELDS.lineUserId]: lineProfile.userId,
    [SUPPLIER_FIELDS.lineName]: lineProfile.displayName || "",
    [SUPPLIER_FIELDS.lineStatus]: "Connected",
    [SUPPLIER_FIELDS.lastLinkedAt]: new Date().toISOString(),
    [SUPPLIER_FIELDS.inviteToken]: "",
    [SUPPLIER_FIELDS.inviteExpiresAt]: null,
  });

  return json({
    ok: true,
    bound: true,
    supplier: {
      id: record.id,
      name: cleanText(record.fields?.[SUPPLIER_FIELDS.name], 255) || "Supplier",
    },
  });
}

async function resolveSupplierAccessByLineBinding(env, lineUserId) {
  const target = cleanText(lineUserId, 255);
  if (!target) return null;
  const records = await airtableListByFieldIds(
    env,
    env.SHARED_SUPPLIERS_TABLE_ID || "tbl81bnFyASeXCj9x",
    [SUPPLIER_FIELDS.name, SUPPLIER_FIELDS.lineUserId, SUPPLIER_FIELDS.lineStatus, SUPPLIER_FIELDS.status, SUPPLIER_FIELDS.internalNote],
  );
  const matches = records.filter((record) => {
    const fields = record.fields || {};
    return cleanText(fields[SUPPLIER_FIELDS.lineUserId], 255) === target
      && selectName(fields[SUPPLIER_FIELDS.lineStatus]).toLowerCase() === "connected"
      && selectName(fields[SUPPLIER_FIELDS.status]).toLowerCase() === "active";
  });
  if (matches.length !== 1) return null;
  const record = matches[0];
  return normalizeAccessItem("line-binding", {
    supplier_name: cleanText(record.fields?.[SUPPLIER_FIELDS.name], 255) || "Supplier",
    supplier_ids: [record.id],
    role: "Supplier",
    token_label: "line-binding",
    supplier_mode: supplierModeFromNote(record.fields?.[SUPPLIER_FIELDS.internalNote]),
  });
}

async function buildSupplierPortalPayload(env, supplierAccess) {
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

  const [orders, finance, reservedByProduct] = await Promise.all([
    loadSupplierOrders(env, visibleProductIds, visibleSupplierIds),
    loadSupplierFinance(env, visibleSupplierIds),
    loadActiveSupplierReservations(env, visibleProductIds, visibleSupplierIds),
  ]);

  const supplierMode = supplierAccess.supplier_mode || "stocked";
  const visibleProducts = visibleCatalog.map((product) => {
    const stock = stockByProduct.get(product.id) || { available: null, low: false };
    const productMovements = movements.filter((movement) => movementMatchesProduct(movement, product));
    const totals = summarizeMovements(productMovements);
    const available = supplierMode === "on_demand" ? null : stock.available;
    const reservedTotal = reservedByProduct.get(product.id) || 0;
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
      low_stock: supplierMode === "on_demand" ? false : (stock.low || (available !== null && available <= lowStockThreshold)),
      sold_total: totals.out,
      reserved_total: reservedTotal,
      refill_signal: supplierMode === "on_demand" ? "on_demand" : buildRefillSignal(available, stock.low, lowStockThreshold),
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

  return {
    ok: true,
    shop: "mmd-shop",
    portal: "supplier_dashboard_v2",
    stock_source: "mmd_shop_inventory_batches",
    reservation_policy: {
      ttl_minutes: Math.max(5, Math.min(240, Number(env.MMD_SHOP_RESERVATION_TTL_MINUTES || 45) || 45)),
      available_excludes_active_reservations: true,
    },
    distributor: {
      name: supplierAccess.supplier_name || supplierAccess.name || "Supplier",
      role: supplierAccess.role || "Supplier",
      token_label: supplierAccess.token_label || supplierAccess.label || "supplier-token",
      mode: supplierMode
    },
    supplier: {
      name: supplierAccess.supplier_name || supplierAccess.name || "Supplier",
      role: supplierAccess.role || "Supplier",
      token_label: supplierAccess.token_label || supplierAccess.label || "supplier-token",
      mode: supplierMode
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
  };
}

async function loadActiveSupplierReservations(env, visibleProductIds, visibleSupplierIds) {
  if (!visibleProductIds.size && !visibleSupplierIds.size) return new Map();

  const orderRecords = await airtableListByFieldIds(
    env,
    env.MMD_SHOP_ORDERS_TABLE_ID || TABLES.orders,
    [ORDER_FIELDS.orderStatus, ORDER_FIELDS.paymentStatus, ORDER_FIELDS.notes],
  );
  const totals = new Map();
  const now = Date.now();

  for (const record of orderRecords) {
    const fields = record.fields || {};
    const orderStatus = selectName(fields[ORDER_FIELDS.orderStatus]).toLowerCase();
    const paymentStatus = selectName(fields[ORDER_FIELDS.paymentStatus]).toLowerCase();
    if (["cancelled", "fulfilled"].includes(orderStatus) || paymentStatus === "paid") continue;

    const reservation = readMmdShopReservation(fields[ORDER_FIELDS.notes]);
    if (!reservation || !["reserved", "payment_review"].includes(reservation.state)) continue;

    const expiresAt = Date.parse(reservation.expires_at || "");
    if (reservation.state === "reserved" && Number.isFinite(expiresAt) && expiresAt <= now) continue;

    for (const allocation of Array.isArray(reservation.allocations) ? reservation.allocations : []) {
      const productId = cleanText(allocation?.product_id, 120);
      const supplierIds = linkedFieldIds(allocation?.supplier_ids);
      const scoped = visibleProductIds.has(productId)
        || supplierIds.some((supplierId) => visibleSupplierIds.has(supplierId));
      if (!scoped || !visibleProductIds.has(productId)) continue;

      const quantity = Math.max(0, numberOrNull(allocation?.quantity) || 0);
      if (!quantity) continue;
      totals.set(productId, (totals.get(productId) || 0) + quantity);
    }
  }

  return totals;
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

async function airtablePatchRecordByFieldIds(env, tableId, recordId, fields) {
  const token = env.AIRTABLE_TOKEN || env.AIRTABLE_API_KEY;
  if (!token) throw new Error("Airtable token is not configured");
  const response = await fetch(`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${tableId}/${recordId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ fields, typecast: true }),
  });
  if (!response.ok) throw new Error(`Airtable error: ${response.status}`);
  return response.json();
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

function resolveSupplierAccessByLineUserId(env, lineUserId) {
  const target = cleanText(lineUserId, 255);
  if (!target) return null;

  const configs = [
    parseSupplierTokenConfig(env.HIMAI_DISTRIBUTOR_PORTAL_TOKENS),
    parseSupplierTokenConfig(env.HIMAI_SUPPLIER_PORTAL_TOKENS),
  ];
  for (const config of configs) {
    for (const [token, item] of config.entries()) {
      if (!item || item.active === false) continue;
      const configuredLineUserId = cleanText(
        item.line_user_id || item.lineUserId || item.line_user || item.line_id,
        255,
      );
      if (configuredLineUserId && configuredLineUserId === target) {
        return normalizeAccessItem(token, item);
      }
    }
  }
  return null;
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
  const supplierIdOk = Array.isArray(access.supplier_ids)
    && access.supplier_ids.length > 0
    && Array.isArray(product.supplier_ids)
    && product.supplier_ids.some((id) => access.supplier_ids.includes(id));

  if (access.product_keywords.length > 0) return productOk || supplierOk || supplierIdOk;
  return supplierOk || supplierIdOk;
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

function supplierModeFromNote(note) {
  const text = cleanText(note, 1000).toLowerCase();
  return text.includes("on-demand") || text.includes("on demand") ? "on_demand" : "stocked";
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

export const SUPPLIER_PORTAL_INTERNALS = Object.freeze({
  parseSupplierTokenConfig,
  resolveSupplierAccessByLineUserId,
});

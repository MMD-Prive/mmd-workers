import {
  createMmdShopFulfillment,
  fulfillmentStateFromOrder,
  publicMmdShopFulfillment,
  readMmdShopFulfillment,
  transitionMmdShopFulfillment,
  writeMmdShopFulfillment,
} from "../../shared/mmd-shop-fulfillment.mjs";

const AIRTABLE_API = "https://api.airtable.com/v0";
const PAGE_PATHS = new Set(["/internal/admin/shop/orders", "/internal/admin/shop/orders/"]);
const API_LIST_PATH = "/v1/admin/shop/orders";
const API_FULFILL_PATH = "/v1/admin/shop/orders/fulfill";
const API_FULFILLMENT_PATH = "/v1/admin/shop/orders/fulfillment";
const SOURCE_URL = "https://mmdprive.webflow.io/internal-admin-shop-orders";

const TABLES = Object.freeze({
  customers: "tbllkfCySeL9fSfZw",
  orders: "tblr8lbi2wMuRM1N4",
  orderItems: "tbl37Iprxz4OLL65P",
});

const CUSTOMER_FIELDS = Object.freeze({
  name: "fld5OinQVj9547w7f",
  displayName: "fldsStJmYFGXD2Frm",
  phone: "fldVLZudvXfJB26Cx",
  email: "flddYltR97rxzIQa4",
  memberId: "fldCjBe9gqIq6y7rR",
  lineUserId: "fldhL0PHPwrkT8X3p",
});

const ORDER_FIELDS = Object.freeze({
  orderId: "flde515MCoEq08YzU",
  customer: "fldAY7M0IjvQiWdhH",
  orderDate: "fld7NNIA2kYNQNekl",
  orderStatus: "fldnCO3H5CpJoYmWD",
  paymentStatus: "fldUpDeLdO6D9OUcd",
  total: "fldYIwMzRJdKdznkY",
  source: "fldSMKdkzwFY6UyzQ",
  notes: "fldWG0u77XQ5W0wpT",
});

const ITEM_FIELDS = Object.freeze({
  name: "fldLR9aIu2m6DTr2e",
  order: "fldSVk92UcASTOuOK",
  quantity: "fldJkKWMZiVQ3g1a6",
  price: "fldm746RgAwIbXYL7",
  lineTotal: "fldr7KTPoSbnblo5I",
  status: "flddJVVBAjVoyqcpY",
});

const PAID_FULFILLMENT_STATES = new Set(["confirmed", "preparing", "ready", "shipped", "completed"]);

export function isAdminShopOrdersPageRequest(path, method) {
  return PAGE_PATHS.has(normalizePath(path)) && ["GET", "HEAD"].includes(String(method || "GET").toUpperCase());
}

export function isAdminShopOrdersApiRequest(path, method) {
  const p = normalizePath(path);
  const verb = String(method || "GET").toUpperCase();
  return (
    (p === API_LIST_PATH && verb === "GET") ||
    (p === API_FULFILL_PATH && verb === "POST") ||
    (p === API_FULFILLMENT_PATH && verb === "POST")
  );
}

export async function handleAdminShopOrdersPage(request, actor) {
  if (!allowedActor(actor)) return adminLoginRedirect(request);
  const method = String(request.method || "GET").toUpperCase();
  let upstream;
  try {
    upstream = await fetch(new Request(SOURCE_URL, {
      method,
      headers: presentationHeaders(request),
      redirect: "follow",
    }));
  } catch {
    return pageUnavailable(method);
  }
  if (!upstream.ok) return pageUnavailable(method);

  const headers = new Headers(upstream.headers);
  for (const name of ["content-length", "set-cookie", "content-encoding", "etag", "last-modified", "report-to", "nel"]) headers.delete(name);
  headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("x-robots-tag", "noindex, nofollow");
  headers.set("x-mmd-route-owner", "admin-worker");
  headers.set("x-mmd-admin-surface", "shop-orders");
  if (method === "HEAD") return new Response(null, { status: 200, headers });
  return new Response(upstream.body, { status: 200, headers });
}

export async function handleAdminShopOrdersApi(request, env, actor) {
  if (!allowedActor(actor)) return json({ ok: false, error: "admin_session_required" }, 401);
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);

  try {
    if (path === API_LIST_PATH && request.method.toUpperCase() === "GET") {
      const orders = await loadAdminOrders(env);
      return json({
        ok: true,
        authority: "admin-worker",
        schema: "mmd_shop_admin_orders_v2",
        orders,
        metrics: metrics(orders),
        payment_truth: "payments-worker",
        fulfillment_truth: "admin-worker",
      });
    }

    if (path === API_FULFILL_PATH && request.method.toUpperCase() === "POST") {
      const body = await boundedJson(request);
      const result = await updateFulfillment(env, actor, {
        ...body,
        state: "completed",
      });
      return json({
        ok: true,
        authority: "admin-worker",
        compatibility_endpoint: true,
        ...result,
      });
    }

    if (path === API_FULFILLMENT_PATH && request.method.toUpperCase() === "POST") {
      const body = await boundedJson(request);
      const result = await updateFulfillment(env, actor, body);
      return json({
        ok: true,
        authority: "admin-worker",
        schema: "mmd_shop_fulfillment_mutation_v1",
        ...result,
      });
    }
  } catch (error) {
    console.error("MMD Shop admin orders error:", error);
    return json({
      ok: false,
      error: clean(error?.message || "shop_orders_unavailable", 220),
    }, Number(error?.status || 503));
  }

  return json({ ok: false, error: "not_found" }, 404);
}

async function updateFulfillment(env, actor, body) {
  const orderId = clean(body?.order_id, 180);
  const state = code(body?.state);
  if (!orderId) throw httpError(400, "order_id_required");
  if (!state) throw httpError(400, "fulfillment_state_required");

  const orders = await listRecords(env, TABLES.orders, Object.values(ORDER_FIELDS));
  const order = orders.find((record) => clean(record?.fields?.[ORDER_FIELDS.orderId], 180) === orderId);
  if (!order?.id) throw httpError(404, "order_not_found");

  const fields = order.fields || {};
  const paymentStatus = code(fields[ORDER_FIELDS.paymentStatus]);
  const orderStatus = code(fields[ORDER_FIELDS.orderStatus]);

  if (orderStatus === "fulfilled" && state === "completed") {
    const current = normalizedFulfillment(fields);
    return {
      order_id: orderId,
      order_status: "fulfilled",
      payment_status: paymentStatus,
      fulfillment: adminFulfillment(current),
      idempotent: true,
    };
  }

  if (orderStatus === "cancelled" && state !== "cancelled") throw httpError(409, "cancelled_order_cannot_advance");
  if (PAID_FULFILLMENT_STATES.has(state) && paymentStatus !== "paid") throw httpError(409, "payment_not_verified");
  if (state === "cancelled" && paymentStatus === "paid") throw httpError(409, "paid_order_refund_required");

  if (state === "shipped" && !clean(body?.tracking_number, 220)) {
    throw httpError(400, "tracking_number_required_for_shipped");
  }

  const current = normalizedFulfillment(fields);
  const currentState = fulfillmentStateFromOrder(orderStatus, paymentStatus, current.state);
  const requested = transitionMmdShopFulfillment({
    ...current,
    state: currentState,
  }, {
    state,
    courier: body?.courier,
    tracking_number: body?.tracking_number,
    fulfillment_note: body?.fulfillment_note,
  });

  const nextOrderStatus = state === "completed"
    ? "fulfilled"
    : state === "cancelled"
      ? "cancelled"
      : PAID_FULFILLMENT_STATES.has(state)
        ? "confirmed"
        : orderStatus || "draft";

  const nextNotes = writeMmdShopFulfillment(
    appendAudit(fields[ORDER_FIELDS.notes], actor, `fulfillment_state:${state}`),
    requested,
  );

  await patchRecord(env, TABLES.orders, order.id, {
    [ORDER_FIELDS.orderStatus]: nextOrderStatus,
    [ORDER_FIELDS.notes]: nextNotes,
  });

  const items = (await listRecords(env, TABLES.orderItems, Object.values(ITEM_FIELDS))).filter((item) => {
    const linked = Array.isArray(item?.fields?.[ITEM_FIELDS.order]) ? item.fields[ITEM_FIELDS.order] : [];
    return linked.includes(order.id);
  });

  const itemStatus = state === "completed"
    ? "fulfilled"
    : state === "cancelled"
      ? "cancelled"
      : PAID_FULFILLMENT_STATES.has(state)
        ? "confirmed"
        : null;

  if (itemStatus) {
    await Promise.all(items.map((item) =>
      patchRecord(env, TABLES.orderItems, item.id, { [ITEM_FIELDS.status]: itemStatus })
    ));
  }

  return {
    order_id: orderId,
    order_status: nextOrderStatus,
    payment_status: paymentStatus,
    items_updated: itemStatus ? items.length : 0,
    fulfillment: adminFulfillment(requested),
  };
}

async function loadAdminOrders(env) {
  const [orders, customers, items] = await Promise.all([
    listRecords(env, TABLES.orders, Object.values(ORDER_FIELDS)),
    listRecords(env, TABLES.customers, Object.values(CUSTOMER_FIELDS)),
    listRecords(env, TABLES.orderItems, Object.values(ITEM_FIELDS)),
  ]);

  const customerById = new Map(customers.map((record) => [record.id, record]));
  const itemsByOrder = new Map();
  for (const item of items) {
    const linked = Array.isArray(item?.fields?.[ITEM_FIELDS.order]) ? item.fields[ITEM_FIELDS.order] : [];
    for (const orderId of linked) {
      const list = itemsByOrder.get(orderId) || [];
      list.push(safeItem(item));
      itemsByOrder.set(orderId, list);
    }
  }

  return orders
    .map((record) => {
      const fields = record.fields || {};
      const customerIds = Array.isArray(fields[ORDER_FIELDS.customer]) ? fields[ORDER_FIELDS.customer] : [];
      const customer = customerById.get(customerIds[0])?.fields || {};
      const fulfillment = normalizedFulfillment(fields);
      const paymentStatus = code(fields[ORDER_FIELDS.paymentStatus]) || "pending";
      const orderStatus = code(fields[ORDER_FIELDS.orderStatus]) || "draft";
      const resolvedState = fulfillmentStateFromOrder(orderStatus, paymentStatus, fulfillment.state);
      const withResolvedState = { ...fulfillment, state: resolvedState };

      return {
        order_id: clean(fields[ORDER_FIELDS.orderId], 180),
        order_date: clean(fields[ORDER_FIELDS.orderDate], 60) || null,
        order_status: orderStatus,
        payment_status: paymentStatus,
        total_thb: numberOrNull(fields[ORDER_FIELDS.total]),
        source: code(fields[ORDER_FIELDS.source]) || "web",
        customer: {
          name: clean(customer[CUSTOMER_FIELDS.displayName] || customer[CUSTOMER_FIELDS.name], 180) || "MMD Shop Customer",
          phone: clean(customer[CUSTOMER_FIELDS.phone], 60) || null,
          email: clean(customer[CUSTOMER_FIELDS.email], 220) || null,
          member_linked: Boolean(clean(customer[CUSTOMER_FIELDS.memberId], 180)),
          line_linked: Boolean(clean(customer[CUSTOMER_FIELDS.lineUserId], 180)),
        },
        items: itemsByOrder.get(record.id) || [],
        fulfillment: adminFulfillment(withResolvedState),
        fulfillment_state: resolvedState,
        can_advance_fulfillment: paymentStatus === "paid" && orderStatus !== "fulfilled" && orderStatus !== "cancelled",
        can_cancel: paymentStatus !== "paid" && orderStatus !== "fulfilled" && orderStatus !== "cancelled",
        can_fulfill: paymentStatus === "paid" && orderStatus === "confirmed",
      };
    })
    .filter((order) => order.order_id)
    .sort((a, b) => String(b.order_date || "").localeCompare(String(a.order_date || "")))
    .slice(0, 200);
}

function normalizedFulfillment(orderFields) {
  const parsed = readMmdShopFulfillment(orderFields?.[ORDER_FIELDS.notes]);
  if (parsed) return parsed;
  return createMmdShopFulfillment();
}

function adminFulfillment(value) {
  return publicMmdShopFulfillment(value, { includeAddress: true, maskPhone: false });
}

function safeItem(record) {
  const fields = record?.fields || {};
  return {
    item_name: clean(fields[ITEM_FIELDS.name], 240) || "MMD Shop Item",
    quantity: numberOrNull(fields[ITEM_FIELDS.quantity]) || 0,
    unit_price_thb: numberOrNull(fields[ITEM_FIELDS.price]),
    line_total_thb: numberOrNull(fields[ITEM_FIELDS.lineTotal]),
    status: code(fields[ITEM_FIELDS.status]) || "draft",
  };
}

function metrics(orders) {
  const out = {
    pending: 0,
    paid: 0,
    preparing: 0,
    ready: 0,
    shipped: 0,
    completed: 0,
  };
  for (const order of orders) {
    if (order.payment_status !== "paid") out.pending += 1;
    if (order.payment_status === "paid") out.paid += 1;
    if (order.fulfillment_state === "confirmed" || order.fulfillment_state === "preparing") out.preparing += 1;
    if (order.fulfillment_state === "ready") out.ready += 1;
    if (order.fulfillment_state === "shipped") out.shipped += 1;
    if (order.fulfillment_state === "completed" || order.order_status === "fulfilled") out.completed += 1;
  }
  return out;
}

async function listRecords(env, tableId, fieldIds) {
  const token = clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 5000);
  const baseId = clean(env.AIRTABLE_BASE_ID, 120);
  if (!token || !baseId) throw httpError(503, "airtable_not_configured");

  const records = [];
  let offset = "";
  let pages = 0;
  do {
    const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(tableId)}`);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("returnFieldsByFieldId", "true");
    for (const fieldId of fieldIds) url.searchParams.append("fields[]", fieldId);
    if (offset) url.searchParams.set("offset", offset);
    const response = await fetch(url.toString(), {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw httpError(response.status >= 500 ? 502 : response.status, `airtable_${response.status}`);
    records.push(...(Array.isArray(payload.records) ? payload.records : []));
    offset = clean(payload.offset, 300);
    pages += 1;
  } while (offset && pages < 20);
  return records;
}

async function patchRecord(env, tableId, recordId, fields) {
  const token = clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 5000);
  const baseId = clean(env.AIRTABLE_BASE_ID, 120);
  if (!token || !baseId) throw httpError(503, "airtable_not_configured");
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(tableId)}/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ fields, typecast: true }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(response.status >= 500 ? 502 : response.status, `airtable_patch_${response.status}`);
  return payload;
}

async function boundedJson(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 12000) throw httpError(413, "body_too_large");
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw httpError(400, "invalid_json_body");
  return body;
}

function appendAudit(current, actor, action) {
  const currentValue = clean(current, 10000);
  const actorName = clean(actor?.email || actor?.name || actor?.id, 180) || "admin";
  const line = `[${new Date().toISOString()}] ${clean(action, 220)} by ${actorName}`;
  return [currentValue, line].filter(Boolean).join("\n").slice(0, 12000);
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

function pageUnavailable(method) {
  const html = '<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>MMD Shop Orders</title><body style="font-family:system-ui;padding:28px;background:#11100e;color:#f3eee5"><h1>Shop Orders unavailable</h1><p>กลับ Control Room แล้วลองอีกครั้ง</p><a style="color:#c9a86e" href="/internal/admin/dashboard">Dashboard</a></body></html>';
  return new Response(method === "HEAD" ? null : html, {
    status: 502,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
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

function normalizePath(value) {
  const path = String(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function code(value) {
  return clean(value, 120).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function clean(value, max = 5000) {
  return String(value == null ? "" : value).trim().slice(0, max).replace(/[\u0000-\u001F\u007F]/g, " ");
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

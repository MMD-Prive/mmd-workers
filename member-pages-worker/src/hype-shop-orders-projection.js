import {
  fulfillmentStateFromOrder,
  publicMmdShopFulfillment,
  readMmdShopFulfillment,
} from "../../shared/mmd-shop-fulfillment.mjs";

const PATH = "/__internal/hype/shop-orders";
const SERVICE_HOST = "member-pages-worker.internal";
const ALLOWED_CALLER = "admin-worker";
const AIRTABLE_API = "https://api.airtable.com/v0";
const SCHEMA = "mmd.hype_shop_orders_projection.v1";

const TABLES = Object.freeze({
  customers: "tbllkfCySeL9fSfZw",
  orders: "tblr8lbi2wMuRM1N4",
  orderItems: "tbl37Iprxz4OLL65P",
});

const CUSTOMER_FIELDS = Object.freeze({
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

export const HYPE_SHOP_ORDERS_PATH = PATH;

export function isHypeShopOrdersRequest(request) {
  if (!(request instanceof Request)) return false;
  try {
    const url = new URL(request.url);
    return request.method === "POST" && url.pathname === PATH;
  } catch {
    return false;
  }
}

export async function handleHypeShopOrders(request, env = {}) {
  if (!authorized(request)) return json({ ok: false, error: "not_found" }, 404);

  const body = await request.json().catch(() => null);
  if (!plain(body) || Object.keys(body).some((key) => !["line_user_id", "order_id"].includes(key))) {
    return json({ ok: false, error: "invalid_request" }, 400);
  }

  const lineUserId = canonicalLineId(body.line_user_id);
  const requestedOrderId = clean(body.order_id, 180);
  if (!lineUserId) return json({ ok: false, error: "invalid_request" }, 400);

  try {
    const customers = await airtableList(env, TABLES.customers, Object.values(CUSTOMER_FIELDS));
    const customerIds = new Set(
      customers
        .filter((record) => clean(record?.fields?.[CUSTOMER_FIELDS.lineUserId], 80).toLowerCase() === lineUserId.toLowerCase())
        .map((record) => clean(record?.id, 80))
        .filter(Boolean),
    );

    if (!customerIds.size) {
      return json({
        ok: true,
        authority: SCHEMA,
        state: "ready",
        orders: [],
        correlation: correlationSummary([], requestedOrderId),
        guardrails: guardrails(),
      });
    }

    const ownedOrders = (await airtableList(env, TABLES.orders, Object.values(ORDER_FIELDS)))
      .filter((record) => {
        const linked = Array.isArray(record?.fields?.[ORDER_FIELDS.customer]) ? record.fields[ORDER_FIELDS.customer] : [];
        return linked.some((id) => customerIds.has(clean(id, 80)));
      })
      .sort((a, b) => clean(b?.fields?.[ORDER_FIELDS.orderDate], 80).localeCompare(clean(a?.fields?.[ORDER_FIELDS.orderDate], 80)));

    const exactMatches = requestedOrderId
      ? ownedOrders.filter((record) => clean(record?.fields?.[ORDER_FIELDS.orderId], 180).toLowerCase() === requestedOrderId.toLowerCase())
      : [];
    if (exactMatches.length > 1) {
      return json({
        ok: false,
        authority: SCHEMA,
        state: "review_required",
        error: "owned_order_reference_conflict",
      }, 409);
    }

    const selected = requestedOrderId
      ? exactMatches
      : ownedOrders.slice(0, 5);

    const selectedIds = new Set(selected.map((record) => clean(record?.id, 80)).filter(Boolean));
    const items = selectedIds.size
      ? (await airtableList(env, TABLES.orderItems, Object.values(ITEM_FIELDS)))
          .filter((record) => {
            const linked = Array.isArray(record?.fields?.[ITEM_FIELDS.order]) ? record.fields[ITEM_FIELDS.order] : [];
            return linked.some((id) => selectedIds.has(clean(id, 80)));
          })
      : [];

    const itemsByOrder = new Map();
    for (const item of items) {
      const linked = Array.isArray(item?.fields?.[ITEM_FIELDS.order]) ? item.fields[ITEM_FIELDS.order] : [];
      for (const orderRecordId of linked) {
        const key = clean(orderRecordId, 80);
        if (!selectedIds.has(key)) continue;
        const list = itemsByOrder.get(key) || [];
        list.push(projectItem(item));
        itemsByOrder.set(key, list);
      }
    }

    const projected = selected.map((record) => projectOrder(record, itemsByOrder.get(clean(record?.id, 80)) || []));
    const allOwnedProjected = ownedOrders.map((record) => projectOrder(record, []));

    return json({
      ok: true,
      authority: SCHEMA,
      state: "ready",
      orders: projected,
      correlation: correlationSummary(allOwnedProjected, requestedOrderId),
      guardrails: guardrails(),
    });
  } catch (error) {
    return json({
      ok: false,
      authority: SCHEMA,
      state: "unavailable",
      error: "shop_orders_unavailable",
      failure_class: clean(error?.message, 100) || "unknown",
    }, 503);
  }
}

function projectOrder(record, items) {
  const fields = record?.fields || {};
  const orderId = clean(fields[ORDER_FIELDS.orderId], 180);
  const orderStatus = code(fields[ORDER_FIELDS.orderStatus]) || "draft";
  const paymentStatus = code(fields[ORDER_FIELDS.paymentStatus]) || "pending";
  const rawFulfillment = readMmdShopFulfillment(fields[ORDER_FIELDS.notes]);
  const fulfillmentState = fulfillmentStateFromOrder(orderStatus, paymentStatus, rawFulfillment?.state);
  const fulfillment = rawFulfillment
    ? publicMmdShopFulfillment({ ...rawFulfillment, state: fulfillmentState }, { includeAddress: false, maskPhone: true })
    : { schema: "mmd_shop_fulfillment_v1", state: fulfillmentState };

  return {
    order_id: orderId || null,
    order_date: clean(fields[ORDER_FIELDS.orderDate], 40) || null,
    order_status: orderStatus,
    payment_status: paymentStatus,
    total_thb: numberOrNull(fields[ORDER_FIELDS.total]),
    items: items.slice(0, 12),
    fulfillment: {
      state: code(fulfillment?.state) || "awaiting_payment",
      delivery_method: code(fulfillment?.delivery_method) || null,
      courier: clean(fulfillment?.courier, 180) || null,
      tracking_number: clean(fulfillment?.tracking_number, 220) || null,
      updated_at: safeTimestamp(fulfillment?.updated_at),
    },
  };
}

function projectItem(record) {
  const fields = record?.fields || {};
  return {
    item_name: clean(fields[ITEM_FIELDS.name], 240) || "MMD Shop Item",
    quantity: numberOrNull(fields[ITEM_FIELDS.quantity]) || 0,
    line_total_thb: numberOrNull(fields[ITEM_FIELDS.lineTotal]),
    status: code(fields[ITEM_FIELDS.status]) || "draft",
  };
}

function correlationSummary(orders, requestedOrderId) {
  const requested = clean(requestedOrderId, 180);
  if (requested) {
    const matches = orders.filter((order) => clean(order.order_id, 180).toLowerCase() === requested.toLowerCase());
    return {
      requested_order_id: requested,
      exact_owned_match: matches.length === 1,
      auto_correlation_allowed: matches.length === 1,
      candidate_count: matches.length,
      candidate_order_id: matches.length === 1 ? matches[0].order_id : null,
      method: matches.length === 1 ? "explicit_owned_order_id" : "explicit_order_id_not_owned_or_missing",
    };
  }

  const candidates = orders.filter((order) => isRecoveryCandidate(order));
  return {
    requested_order_id: null,
    exact_owned_match: false,
    auto_correlation_allowed: candidates.length === 1,
    candidate_count: candidates.length,
    candidate_order_id: candidates.length === 1 ? candidates[0].order_id : null,
    method: candidates.length === 1 ? "single_recent_owned_order" : candidates.length > 1 ? "ambiguous_recent_owned_orders" : "no_recent_owned_order",
  };
}

function isRecoveryCandidate(order) {
  const date = Date.parse(clean(order?.order_date, 80));
  if (!Number.isFinite(date)) return false;
  const ageMs = Date.now() - date;
  if (ageMs < -24 * 60 * 60 * 1000 || ageMs > 90 * 24 * 60 * 60 * 1000) return false;
  return code(order?.order_status) !== "cancelled";
}

async function airtableList(env, tableId, fieldIds) {
  const apiKey = clean(env.AIRTABLE_API_KEY, 5000);
  const baseId = clean(env.AIRTABLE_BASE_ID, 160);
  if (!apiKey || !baseId) throw new Error("shop_airtable_not_configured");

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
      headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`shop_airtable_${response.status}`);
    records.push(...(Array.isArray(payload.records) ? payload.records : []));
    offset = clean(payload.offset, 300);
    pages += 1;
  } while (offset && pages < 20);
  return records;
}

function authorized(request) {
  let url;
  try { url = new URL(request.url); } catch { return false; }
  return (
    request.method === "POST"
    && url.hostname === SERVICE_HOST
    && url.pathname === PATH
    && code(request.headers.get("x-mmd-internal-call")) === "true"
    && clean(request.headers.get("x-mmd-service-binding"), 80) === ALLOWED_CALLER
  );
}

function guardrails() {
  return {
    read_only: true,
    customer_safe_projection_only: true,
    canonical_line_identity_required: true,
    ownership_filtered_server_side: true,
    payment_mutation_allowed: false,
    fulfillment_mutation_allowed: false,
    refund_mutation_allowed: false,
    raw_notes_exposed: false,
    address_exposed: false,
    phone_exposed: false,
  };
}

function canonicalLineId(value) {
  const id = clean(value, 80);
  return /^U[0-9a-f]{32}$/i.test(id) ? id : "";
}

function safeTimestamp(value) {
  const raw = clean(value, 80);
  const time = Date.parse(raw);
  return raw && Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function plain(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function code(value) {
  return clean(value, 120).toLowerCase().normalize("NFKC")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-mmd-hype-shop-orders": "bounded-v1",
    },
  });
}

import {
  createMmdShopFulfillment,
  fulfillmentStateFromOrder,
  normalizeMmdShopShipping,
  publicMmdShopFulfillment,
  readMmdShopFulfillment,
  transitionMmdShopFulfillment,
  writeMmdShopFulfillment,
} from "../../shared/mmd-shop-fulfillment.mjs";
import {
  publicMmdShopReservation,
  readMmdShopReservation,
  writeMmdShopReservation,
} from "../../shared/mmd-shop-stock-reservation.mjs";

const AIRTABLE_API = "https://api.airtable.com/v0";
const PAGE_PATHS = new Set(["/internal/admin/shop/orders", "/internal/admin/shop/orders/"]);
const API_LIST_PATH = "/v1/admin/shop/orders";
const API_FULFILL_PATH = "/v1/admin/shop/orders/fulfill";
const API_FULFILLMENT_PATH = "/v1/admin/shop/orders/fulfillment";
const API_CREATE_PATH = "/v1/admin/shop/orders/create";
const SOURCE_URL = "https://mmdprive.webflow.io/internal-admin-shop-orders";

const TABLES = Object.freeze({
  customers: "tbllkfCySeL9fSfZw",
  orders: "tblr8lbi2wMuRM1N4",
  products: "tblzsmNLfP6J0kQ90",
  orderItems: "tbl37Iprxz4OLL65P",
});

const CUSTOMER_FIELDS = Object.freeze({
  name: "fld5OinQVj9547w7f",
  displayName: "fldsStJmYFGXD2Frm",
  phone: "fldVLZudvXfJB26Cx",
  email: "flddYltR97rxzIQa4",
  memberId: "fldCjBe9gqIq6y7rR",
  lineUserId: "fldhL0PHPwrkT8X3p",
  brandOrigin: "fldtB8vxXuy0eYnC2",
  acquisitionChannel: "fldKj1Voj6R4juSeP",
  sourcePath: "fld8wsDN9c6swepc7",
  signupStatus: "fldVpDEo1QoECO9ic",
  customerOrigin: "fldSHQS36g44ngf0b",
  note: "fldiG60HuRFApYgVh",
  createdAt: "fldobLojYBjeRJHYf",
});

const PRODUCT_FIELDS = Object.freeze({
  name: "fld0oKjoZrb1IqntV",
  sku: "fldhJE7UEE4VYHjR6",
  brandAvailability: "fldve5nrQmymoZgiX",
  status: "fldxYkkvmK9izvACA",
  supplier: "fldJCZ7YzsUjIItKf",
  mmdPrice: "fldD6Q5yido7pTlU0",
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
  product: "fld40mHWKpBthoO9T",
  supplier: "fld5AUxwx9bSOd0gY",
  quantity: "fldJkKWMZiVQ3g1a6",
  price: "fldm746RgAwIbXYL7",
  lineTotal: "fldr7KTPoSbnblo5I",
  status: "flddJVVBAjVoyqcpY",
  pricingSource: "fldWmcjTLSzAAkDe3",
});

const PAID_FULFILLMENT_STATES = new Set([
  "confirmed",
  "preparing",
  "ready",
  "shipped",
  "delivered",
  "delivery_failed",
  "completed",
  "return_requested",
  "return_received",
  "refund_pending",
]);
const AFTERCARE_STATES = new Set(["return_requested", "return_received", "refund_pending", "refunded"]);

export function isAdminShopOrdersPageRequest(path, method) {
  return PAGE_PATHS.has(normalizePath(path)) && ["GET", "HEAD"].includes(String(method || "GET").toUpperCase());
}

export function isAdminShopOrdersApiRequest(path, method) {
  const p = normalizePath(path);
  const verb = String(method || "GET").toUpperCase();
  return (
    (p === API_LIST_PATH && verb === "GET") ||
    (p === API_CREATE_PATH && verb === "POST") ||
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

    if (path === API_CREATE_PATH && request.method.toUpperCase() === "POST") {
      const body = await boundedJson(request);
      const result = await createManualOrder(env, actor, body);
      return json({
        ok: true,
        authority: "admin-worker",
        schema: "mmd_shop_manual_order_v1",
        ...result,
      }, 201);
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

async function createManualOrder(env, actor, body) {
  const customerInput = normalizeManualCustomer(body?.customer || body);
  const shipping = normalizeMmdShopShipping(body?.shipping || {}, customerInput);
  const requestedItems = Array.isArray(body?.items) ? body.items : [];
  if (!requestedItems.length) throw httpError(400, "order_items_required");

  const productRecords = await listRecords(env, TABLES.products, Object.values(PRODUCT_FIELDS));
  const productById = new Map(productRecords.map((record) => [record.id, record]));
  const items = requestedItems.map((line) => {
    const productId = clean(line?.product_id, 80);
    const product = productById.get(productId);
    if (!product?.id) throw httpError(404, "product_not_found");
    const fields = product.fields || {};
    const status = code(fields[PRODUCT_FIELDS.status]);
    const brands = selectList(fields[PRODUCT_FIELDS.brandAvailability]).map((value) => value.toLowerCase());
    if (status !== "active") throw httpError(409, "product_not_active");
    if (brands.length && !brands.some((value) => value.includes("mmd") || value.includes("both"))) {
      throw httpError(409, "product_not_available_in_mmd_shop");
    }
    const quantity = integer(line?.quantity);
    const unitPrice = numberOrNull(fields[PRODUCT_FIELDS.mmdPrice]);
    if (!(quantity > 0)) throw httpError(400, "invalid_item_quantity");
    if (!(unitPrice > 0)) throw httpError(409, "product_price_unavailable");
    const productName = clean(fields[PRODUCT_FIELDS.name], 220) || "MMD Shop Item";
    const sku = clean(fields[PRODUCT_FIELDS.sku], 120);
    return {
      product_id: product.id,
      product_name: productName,
      sku,
      supplier_ids: linkedIds(fields[PRODUCT_FIELDS.supplier]),
      quantity,
      unit_price_thb: roundMoney(unitPrice),
      line_total_thb: roundMoney(unitPrice * quantity),
      stock_status: "tracked",
    };
  });

  const originalTotal = roundMoney(items.reduce((sum, item) => sum + item.line_total_thb, 0));
  const discount = roundMoney(numberOrNull(body?.discount_amount_thb) || 0);
  if (discount < 0 || discount > originalTotal) throw httpError(400, "invalid_discount_amount");
  const total = roundMoney(originalTotal - discount);
  if (!(total > 0)) throw httpError(400, "order_total_must_be_positive");
  const discountReason = clean(body?.discount_reason, 300);
  const customer = await findOrCreateManualCustomer(env, customerInput);
  const orderId = makeManualOrderId();
  const noteLines = [
    "schema=mmd_shop_order_v1",
    "source=admin_manual_order",
    "created_by=" + (clean(actor?.email || actor?.name || actor?.id, 180) || "admin"),
    "original_total_thb=" + originalTotal,
    "discount_total_thb=" + discount,
    "final_total_thb=" + total,
    "discount_reason=" + (discountReason || "close_customer"),
    "payment_verification_required=true",
  ];
  const fulfillment = createMmdShopFulfillment({ shipping });
  const baseNotes = writeMmdShopFulfillment(noteLines.join("; "), fulfillment);
  const order = await createRecord(env, TABLES.orders, {
    [ORDER_FIELDS.orderId]: orderId,
    [ORDER_FIELDS.customer]: [customer.id],
    [ORDER_FIELDS.orderDate]: new Date().toISOString(),
    [ORDER_FIELDS.orderStatus]: "draft",
    [ORDER_FIELDS.paymentStatus]: "pending",
    [ORDER_FIELDS.total]: total,
    [ORDER_FIELDS.notes]: baseNotes,
    [ORDER_FIELDS.source]: "web",
  });

  let reservation = null;
  try {
    reservation = await reserveReservationThroughShopWorker(env, {
      order_id: orderId,
      order_record_id: order.id,
      order_notes: baseNotes,
      items,
    });
    const reservedNotes = writeMmdShopReservation(baseNotes, reservation);
    await patchRecord(env, TABLES.orders, order.id, { [ORDER_FIELDS.notes]: reservedNotes });
    await createManualOrderItems(env, order.id, items);
    const payment = await createManualPaymentIntent(env, {
      orderId,
      total,
      email: customerInput.email,
    });
    if (!payment?.ok || !clean(payment.customer_payment_url, 2000)) {
      throw httpError(502, payment?.error || "payment_initialization_failed");
    }
    const paymentNotes = [
      reservedNotes,
      "payment_ref=" + clean(payment.payment_ref, 220),
      "payment_stage=shop",
      "money_truth=payments-worker",
      "reservation_expires_at=" + clean(reservation?.expires_at, 80),
    ].filter(Boolean).join("\n");
    await patchRecord(env, TABLES.orders, order.id, { [ORDER_FIELDS.notes]: paymentNotes });
    return {
      order_id: orderId,
      order_record_id: order.id,
      customer_record_id: customer.id,
      original_total_thb: originalTotal,
      discount_total_thb: discount,
      total_thb: total,
      currency: "THB",
      discount_reason: discountReason || "close_customer",
      payment_ref: clean(payment.payment_ref, 220) || null,
      payment_url: payment.customer_payment_url,
      payment_status: "pending",
      order_status: "draft",
      reservation: publicMmdShopReservation(reservation),
    };
  } catch (error) {
    if (reservation) {
      await releaseReservationThroughShopWorker(env, reservation, "manual_order_initialization_failed").catch(() => null);
    }
    await patchRecord(env, TABLES.orders, order.id, {
      [ORDER_FIELDS.orderStatus]: "cancelled",
      [ORDER_FIELDS.notes]: appendAudit(baseNotes, actor, "manual_order_failed=" + clean(error?.message || "unknown", 220)),
    }).catch(() => null);
    throw error;
  }
}

async function findOrCreateManualCustomer(env, customer) {
  const records = await listRecords(env, TABLES.customers, Object.values(CUSTOMER_FIELDS));
  const match = records.find((record) => {
    const fields = record.fields || {};
    const phone = normalizePhone(fields[CUSTOMER_FIELDS.phone]);
    const email = clean(fields[CUSTOMER_FIELDS.email], 320).toLowerCase();
    return (phone && phone === customer.phone) || (customer.email && email === customer.email);
  });
  if (match?.id) return match;
  return createRecord(env, TABLES.customers, {
    [CUSTOMER_FIELDS.name]: customer.name,
    [CUSTOMER_FIELDS.displayName]: customer.name,
    [CUSTOMER_FIELDS.phone]: customer.phone,
    [CUSTOMER_FIELDS.email]: customer.email || undefined,
    [CUSTOMER_FIELDS.brandOrigin]: "MMD Shop",
    [CUSTOMER_FIELDS.acquisitionChannel]: "web",
    [CUSTOMER_FIELDS.sourcePath]: "/internal/admin/shop/orders",
    [CUSTOMER_FIELDS.signupStatus]: "active",
    [CUSTOMER_FIELDS.customerOrigin]: "web",
    [CUSTOMER_FIELDS.note]: "Created by MMD Shop manual admin order.",
    [CUSTOMER_FIELDS.createdAt]: new Date().toISOString(),
  });
}

async function reserveReservationThroughShopWorker(env, input) {
  if (!env.MMD_SHOP_WORKER?.fetch) throw httpError(503, "mmd_shop_worker_binding_missing");
  const token = clean(env.INTERNAL_TOKEN, 5000);
  if (!token) throw httpError(503, "internal_token_not_configured");
  const response = await env.MMD_SHOP_WORKER.fetch(
    "https://himai-chat-worker.internal/mmd-shop/internal/reservation/reserve",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-token": token,
      },
      body: JSON.stringify({ input }),
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok !== true || !data.reservation) {
    throw httpError(response.status || 502, data.error || "reservation_failed");
  }
  return data.reservation;
}

async function createManualPaymentIntent(env, input) {
  if (!env.PAYMENTS_WORKER?.fetch) throw httpError(503, "payments_worker_binding_missing");
  const response = await env.PAYMENTS_WORKER.fetch(
    "https://payments.internal/v1/pay/shop-intent",
    {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        order_id: input.orderId,
        session_id: input.orderId,
        payment_stage: "shop",
        amount: input.total,
        payment_method: "promptpay",
        member_email: input.email || undefined,
        notes: "MMD Shop manual Order " + input.orderId + "; payment_stage=shop",
      }),
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, error: data?.error || "payments_http_" + response.status };
  return data;
}

async function createManualOrderItems(env, orderRecordId, items) {
  const records = items.map((item) => ({ fields: {
    [ITEM_FIELDS.name]: item.sku ? item.product_name + " · " + item.sku : item.product_name,
    [ITEM_FIELDS.order]: [orderRecordId],
    [ITEM_FIELDS.product]: [item.product_id],
    [ITEM_FIELDS.supplier]: item.supplier_ids,
    [ITEM_FIELDS.quantity]: item.quantity,
    [ITEM_FIELDS.price]: item.unit_price_thb,
    [ITEM_FIELDS.lineTotal]: item.line_total_thb,
    [ITEM_FIELDS.status]: "draft",
    [ITEM_FIELDS.pricingSource]: "catalog_default",
  }}));
  const token = clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 5000);
  const baseId = clean(env.AIRTABLE_BASE_ID, 120);
  if (!token || !baseId) throw httpError(503, "airtable_not_configured");
  const response = await fetch(
    AIRTABLE_API + "/" + encodeURIComponent(baseId) + "/" + encodeURIComponent(TABLES.orderItems),
    {
      method: "POST",
      headers: {
        authorization: "Bearer " + token,
        "content-type": "application/json",
      },
      body: JSON.stringify({ records, typecast: true }),
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(response.status >= 500 ? 502 : response.status, "airtable_order_items_" + response.status);
  return payload.records || [];
}

function normalizeManualCustomer(input) {
  const name = clean(input?.name || input?.customer_name, 180);
  const phone = normalizePhone(input?.phone || input?.customer_phone);
  const email = clean(input?.email || input?.customer_email, 320).toLowerCase();
  if (!name) throw httpError(400, "customer_name_required");
  if (phone.length < 8) throw httpError(400, "customer_phone_required");
  return { name, phone, email };
}

function makeManualOrderId() {
  const stamp = new Date().toISOString().slice(0, 10);
  const suffix = (globalThis.crypto?.randomUUID?.() || Math.random().toString(16).slice(2)).replace(/-/g, "").slice(0, 8).toUpperCase();
  return "MMD-" + stamp + "-" + suffix;
}

function linkedIds(value) {
  return Array.isArray(value) ? value.map((item) => clean(typeof item === "string" ? item : item?.id, 80)).filter(Boolean) : [];
}

function selectList(value) {
  return Array.isArray(value)
    ? value.map((item) => clean(typeof item === "string" ? item : item?.name, 120)).filter(Boolean)
    : [];
}

function integer(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : 0;
}

function roundMoney(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
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
  if (state === "refunded" && !["paid", "refunded"].includes(paymentStatus)) throw httpError(409, "payment_not_refundable");
  if (state === "cancelled" && paymentStatus === "paid") throw httpError(409, "paid_order_refund_required");

  if (state === "shipped" && !clean(body?.tracking_number, 220)) {
    throw httpError(400, "tracking_number_required_for_shipped");
  }

  const current = normalizedFulfillment(fields);
  const currentReservation = readMmdShopReservation(fields[ORDER_FIELDS.notes]);
  let nextReservation = currentReservation;
  const currentState = fulfillmentStateFromOrder(orderStatus, paymentStatus, current.state);
  if (state !== currentState && !isAllowedFulfillmentTransition(currentState, state, current.delivery_method, paymentStatus)) {
    throw httpError(409, `invalid_fulfillment_transition:${currentState}->${state}`);
  }

  let refundConfirmation = null;
  let effectivePaymentStatus = paymentStatus;
  if (state === "refunded" && paymentStatus !== "refunded") {
    refundConfirmation = await confirmRefundThroughPayments(env, {
      order_id: orderId,
      refund_reference: body?.refund_reference,
      refund_method: body?.refund_method,
      refund_amount_thb: body?.refund_amount_thb,
    });
    effectivePaymentStatus = code(refundConfirmation?.payment_status) || "refunded";
  }

  let requested = transitionMmdShopFulfillment({
    ...current,
    state: currentState,
  }, {
    state,
    courier: body?.courier,
    tracking_number: body?.tracking_number,
    fulfillment_note: body?.fulfillment_note,
    return_note: body?.return_note,
    refund_reference: state === "refunded" ? body?.refund_reference : current.refund_reference,
    refund_method: state === "refunded" ? body?.refund_method : current.refund_method,
    refund_amount_thb: state === "refunded" ? body?.refund_amount_thb : current.refund_amount_thb,
  });

  const nextOrderStatus = state === "completed"
    ? "fulfilled"
    : state === "cancelled"
      ? "cancelled"
      : orderStatus === "fulfilled" && AFTERCARE_STATES.has(state)
        ? "fulfilled"
        : PAID_FULFILLMENT_STATES.has(state)
          ? "confirmed"
          : orderStatus || "draft";

  if (state === "cancelled" && currentReservation?.state === "payment_review") {
    throw httpError(409, "payment_review_in_progress");
  }
  if (state === "cancelled" && currentReservation?.state === "reserved") {
    const released = await releaseReservationThroughShopWorker(env, currentReservation, "admin_cancelled");
    nextReservation = released.reservation;
  }

  const fulfillmentNotes = writeMmdShopFulfillment(
    appendAudit(fields[ORDER_FIELDS.notes], actor, `fulfillment_state:${state}`),
    requested,
  );
  const nextNotes = nextReservation
    ? writeMmdShopReservation(fulfillmentNotes, nextReservation)
    : fulfillmentNotes;

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

  let shippingNotification = null;
  if (state === "shipped") {
    const key = `${orderId}:${clean(requested.courier, 180)}:${clean(requested.tracking_number, 220)}`;
    if (!(current.shipping_notification_status === "sent" && current.shipping_notification_key === key)) {
      const customerIds = Array.isArray(fields[ORDER_FIELDS.customer]) ? fields[ORDER_FIELDS.customer] : [];
      const customers = await listRecords(env, TABLES.customers, Object.values(CUSTOMER_FIELDS));
      const customer = customers.find((record) => customerIds.includes(record.id));
      shippingNotification = await notifyShippingCustomer(env, {
        order_id: orderId,
        line_user_id: clean(customer?.fields?.[CUSTOMER_FIELDS.lineUserId], 220),
        customer_name: clean(customer?.fields?.[CUSTOMER_FIELDS.displayName] || customer?.fields?.[CUSTOMER_FIELDS.name], 180),
        courier: requested.courier,
        tracking_number: requested.tracking_number,
      }).catch((error) => ({ ok: false, status: "failed", error: clean(error?.message, 180) }));

      requested = transitionMmdShopFulfillment(requested, {
        state: "shipped",
        shipping_notification_status: shippingNotification?.status || (shippingNotification?.ok ? "sent" : "failed"),
        shipping_notification_key: key,
        shipping_notified_at: shippingNotification?.ok ? new Date().toISOString() : "",
      });

      const notificationNotesBase = writeMmdShopFulfillment(nextNotes, requested);
      const notificationNotes = nextReservation
        ? writeMmdShopReservation(notificationNotesBase, nextReservation)
        : notificationNotesBase;
      await patchRecord(env, TABLES.orders, order.id, {
        [ORDER_FIELDS.notes]: notificationNotes,
      });
    } else {
      shippingNotification = { ok: true, status: "sent", idempotent: true };
    }
  }

  return {
    order_id: orderId,
    order_status: nextOrderStatus,
    payment_status: effectivePaymentStatus,
    items_updated: itemStatus ? items.length : 0,
    fulfillment: adminFulfillment(requested),
    reservation: nextReservation ? publicMmdShopReservation(nextReservation) : null,
    shipping_notification: shippingNotification,
    refund_confirmation: refundConfirmation,
  };
}

async function releaseReservationThroughShopWorker(env, reservation, reason) {
  if (!env.MMD_SHOP_WORKER?.fetch) throw httpError(503, "mmd_shop_worker_binding_missing");
  const token = clean(env.INTERNAL_TOKEN, 5000);
  if (!token) throw httpError(503, "internal_token_not_configured");

  const response = await env.MMD_SHOP_WORKER.fetch("https://himai-chat-worker.internal/mmd-shop/internal/reservation/release", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-token": token,
    },
    body: JSON.stringify({ reservation, reason }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok !== true || !data.reservation) {
    throw httpError(response.status || 502, data.error || "reservation_release_failed");
  }
  return data;
}

async function confirmRefundThroughPayments(env, input) {
  if (!env.PAYMENTS_WORKER?.fetch) throw httpError(503, "payments_worker_binding_missing");
  const token = clean(env.INTERNAL_TOKEN, 5000);
  if (!token) throw httpError(503, "internal_token_not_configured");

  const refundReference = clean(input?.refund_reference, 220);
  const refundMethod = clean(input?.refund_method, 120);
  const refundAmount = numberOrNull(input?.refund_amount_thb);
  if (!refundReference) throw httpError(400, "refund_reference_required");
  if (!refundMethod) throw httpError(400, "refund_method_required");
  if (!(refundAmount > 0)) throw httpError(400, "refund_amount_required");

  const response = await env.PAYMENTS_WORKER.fetch(
    "https://payments.internal/v1/internal/shop/refund-confirm",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-token": token,
        "x-mmd-internal-call": "true",
        "x-mmd-service-binding": "admin-worker",
      },
      body: JSON.stringify({
        order_id: clean(input?.order_id, 180),
        refund_reference: refundReference,
        refund_method: refundMethod,
        refund_amount_thb: refundAmount,
      }),
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok !== true || code(data.payment_status) !== "refunded") {
    throw httpError(response.status || 502, data.error || "shop_refund_confirmation_failed");
  }
  return data;
}

async function notifyShippingCustomer(env, input) {
  const lineUserId = clean(input?.line_user_id, 220);
  if (!lineUserId) return { ok: false, status: "skipped_no_line_identity" };

  const payload = {
    line_user_id: lineUserId,
    order_id: clean(input?.order_id, 180),
    customer_name: clean(input?.customer_name, 180),
    courier: clean(input?.courier, 180) || "Courier",
    tracking_number: clean(input?.tracking_number, 220),
  };

  if (env.MEMBER_DASHBOARD_CHAT_WORKER?.fetch) {
    try {
      const response = await env.MEMBER_DASHBOARD_CHAT_WORKER.fetch(
        "https://member-dashboard-chat-worker.local/__internal/line/shop-shipping-notify",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-mmd-internal-call": "true",
            "x-mmd-service-binding": "admin-worker",
          },
          body: JSON.stringify(payload),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.ok === true) return { ok: true, status: "sent", transport: "line_runtime_binding" };
    } catch (_) {
      // Fall through to the legacy direct LINE token only if it is configured.
    }
  }

  const token = clean(env.LINE_CHANNEL_ACCESS_TOKEN, 5000);
  if (!token) return { ok: false, status: "skipped_line_runtime_unavailable" };

  const text = [
    "MMD SHOP · จัดส่งสินค้าแล้ว",
    payload.customer_name ? `คุณ${payload.customer_name}` : "",
    `Order: ${payload.order_id}`,
    `${payload.courier}: ${payload.tracking_number}`,
    "",
    "ติดตามสถานะเพิ่มเติมได้ที่ MY MMD → Orders",
    "https://mmdbkk.com/my-mmd/orders",
  ].filter(Boolean).join("\n");

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [{ type: "text", text }],
    }),
  });

  if (!response.ok) {
    const body = clean(await response.text().catch(() => ""), 500);
    return { ok: false, status: `failed_http_${response.status}`, error: body || null };
  }
  return { ok: true, status: "sent", transport: "admin_line_token_fallback" };
}

export function isAllowedFulfillmentTransition(current, next, deliveryMethod, paymentStatus) {
  if (current === next) return true;
  if (next === "cancelled") return paymentStatus !== "paid" && current !== "completed";
  if (current === "refund_pending" && next === "refunded") return ["paid", "refunded"].includes(paymentStatus);
  if (paymentStatus !== "paid") return false;

  if (current === "awaiting_payment") return next === "confirmed";
  if (current === "confirmed") return next === "preparing";
  if (current === "preparing") return next === "ready";
  if (current === "ready") {
    const method = code(deliveryMethod);
    if (method === "pickup") return next === "completed";
    if (method === "delivery") return next === "shipped";
    return next === "shipped" || next === "completed";
  }
  if (current === "shipped") return next === "delivered" || next === "delivery_failed";
  if (current === "delivery_failed") return next === "ready" || next === "refund_pending";
  if (current === "delivered") return next === "completed" || next === "return_requested";
  if (current === "completed") return next === "return_requested";
  if (current === "return_requested") return next === "return_received";
  if (current === "return_received") return next === "refund_pending";
  return false;
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
      const reservation = readMmdShopReservation(fields[ORDER_FIELDS.notes]);
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
        original_total_thb: numberOrNull(noteValue(fields[ORDER_FIELDS.notes], "original_total_thb")),
        discount_total_thb: numberOrNull(noteValue(fields[ORDER_FIELDS.notes], "discount_total_thb")) || 0,
        discount_reason: noteValue(fields[ORDER_FIELDS.notes], "discount_reason"),
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
        reservation: reservation ? publicMmdShopReservation(reservation) : null,
        can_advance_fulfillment: paymentStatus === "paid" && orderStatus !== "cancelled" && !["refund_pending", "refunded"].includes(resolvedState),
        can_cancel: paymentStatus !== "paid" && orderStatus !== "fulfilled" && orderStatus !== "cancelled" && reservation?.state !== "payment_review",
        can_fulfill: paymentStatus === "paid" && orderStatus === "confirmed",
        can_open_return: paymentStatus === "paid" && ["delivered", "completed"].includes(resolvedState),
        can_confirm_refund: paymentStatus === "paid" && resolvedState === "refund_pending",
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

function noteValue(notes, key) {
  const source = String(notes || "");
  const escapedKey = String(key).replace(/[.*+?^$()|[\]\\]/g, "\\function safeItem(record) {");
  const match = source.match(new RegExp("(?:^|[;\\n])" + escapedKey + "=([^;\\n]*)"));
  return match ? clean(match[1], 500) : "";
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
    delivered: 0,
    delivery_failed: 0,
    returns: 0,
    refund_pending: 0,
    refunded: 0,
    completed: 0,
  };
  for (const order of orders) {
    if (order.payment_status !== "paid") out.pending += 1;
    if (order.payment_status === "paid") out.paid += 1;
    if (order.fulfillment_state === "confirmed" || order.fulfillment_state === "preparing") out.preparing += 1;
    if (order.fulfillment_state === "ready") out.ready += 1;
    if (order.fulfillment_state === "shipped") out.shipped += 1;
    if (order.fulfillment_state === "delivered") out.delivered += 1;
    if (order.fulfillment_state === "delivery_failed") out.delivery_failed += 1;
    if (["return_requested", "return_received"].includes(order.fulfillment_state)) out.returns += 1;
    if (order.fulfillment_state === "refund_pending") out.refund_pending += 1;
    if (order.fulfillment_state === "refunded" || order.payment_status === "refunded") out.refunded += 1;
    if (order.fulfillment_state === "completed" || (order.order_status === "fulfilled" && !AFTERCARE_STATES.has(order.fulfillment_state))) out.completed += 1;
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

async function createRecord(env, tableId, fields) {
  const token = clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 5000);
  const baseId = clean(env.AIRTABLE_BASE_ID, 120);
  if (!token || !baseId) throw httpError(503, "airtable_not_configured");
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(tableId)}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ fields, typecast: true }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(response.status >= 500 ? 502 : response.status, `airtable_create_${response.status}`);
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

function normalizePhone(value) {
  return clean(value, 60).replace(/[^0-9+]/g, "").replace(/^00/, "+");
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

import {
  createConfirmTokenRecord,
  getConfirmTokenTtlSeconds,
  signConfirmToken,
  verifyConfirmToken,
} from "./index.js";
import {
  createMmdShopFulfillment,
  publicMmdShopFulfillment,
  readMmdShopFulfillment,
  transitionMmdShopFulfillment,
  writeMmdShopFulfillment,
} from "../shared/mmd-shop-fulfillment.mjs";
import {
  commitMmdShopReservation,
  publicMmdShopReservation,
  readMmdShopReservation,
  writeMmdShopReservation,
} from "../shared/mmd-shop-stock-reservation.mjs";

const AIRTABLE_API = "https://api.airtable.com/v0";
export const SHOP_INTENT_PATH = "/v1/pay/shop-intent";
const SHOP_STAGE = "shop";

const TABLES = Object.freeze({
  orders: "tblr8lbi2wMuRM1N4",
  orderItems: "tbl37Iprxz4OLL65P",
  payments: "tblWGGJJOx5eBvBZJ",
});

const ORDER_FIELDS = Object.freeze({
  orderId: "flde515MCoEq08YzU",
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

const PAYMENT_FIELDS = Object.freeze({
  paymentRef: "fldOO6SY49iDw8VBZ",
  paymentDate: "fld3yAwxIu2dkw7fO",
  amount: "fldvCSwrUW8OMAooS",
  status: "fldEJ1hmm7KwWuI6q",
  method: "fldsblzIn0wzan3c9",
  notes: "fldjsZIKoJPawlb2u",
  verification: "fldJ7a0Ube9F0bmRy",
  intentStatus: "fld04fr3bRJTohO6y",
  createdAt: "flduxcPpowBxEZSLu",
  source: "flduqtlX4PuOAJbFC",
  sessionId: "fld2wdhBvc8xrV6y5",
});

export function isShopIntentRequest(path, method) {
  return normalizePath(path) === SHOP_INTENT_PATH && ["POST", "OPTIONS"].includes(String(method || "POST").toUpperCase());
}

export async function handleShopIntent(request, env) {
  if (request.method.toUpperCase() === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }
  if (request.method.toUpperCase() !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405, request, env);

  const body = await request.json().catch(() => null);
  try {
    const orderId = text(body?.order_id || body?.session_id, 180);
    const amount = positive(body?.amount ?? body?.amount_thb);
    const email = text(body?.member_email || body?.email, 320).toLowerCase();
    if (!orderId) throw httpError(400, "order_id_required");
    if (amount == null) throw httpError(400, "amount_required");

    const order = await findOrderByOrderId(env, orderId);
    if (!order?.id) throw httpError(404, "shop_order_not_found");
    const orderStatus = code(order.fields?.[ORDER_FIELDS.orderStatus]);
    const orderPaymentStatus = code(order.fields?.[ORDER_FIELDS.paymentStatus]);
    const reservation = readMmdShopReservation(order.fields?.[ORDER_FIELDS.notes]);
    if (orderStatus === "cancelled") throw httpError(409, "shop_order_cancelled");
    if (reservation && ["expired", "released"].includes(reservation.state)) throw httpError(409, "shop_order_reservation_expired");
    if (reservation?.state === "reserved" && Date.parse(reservation.expires_at || "") <= Date.now() && orderPaymentStatus !== "paid") {
      throw httpError(409, "shop_order_reservation_expired");
    }

    const orderTotal = positive(order.fields?.[ORDER_FIELDS.total]);
    if (orderTotal == null || Math.abs(orderTotal - amount) > 0.009) throw httpError(409, "shop_order_amount_mismatch");

    const paymentRef = await stableShopPaymentRef(orderId);
    const existing = await findPaymentByRef(env, paymentRef);
    if (!existing?.id) {
      await createPaymentRecord(env, {
        paymentRef,
        orderId,
        amount,
        email,
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const claims = {
      kind: "customer_confirm",
      role: "customer",
      session_id: orderId,
      payment_ref: paymentRef,
      payment_type: SHOP_STAGE,
      iat: now,
      exp: now + getConfirmTokenTtlSeconds(env),
    };
    const token = await signConfirmToken(claims, signingSecret(env));
    await createConfirmTokenRecord(env, token, claims);

    return json({
      ok: true,
      authority: "payments-worker",
      schema: "mmd_shop_payment_intent_v1",
      payment_stage: SHOP_STAGE,
      payment_ref: paymentRef,
      session_id: orderId,
      order_id: orderId,
      amount,
      status: "pending",
      verification_status: "pending",
      customer_t: token,
      customer_payment_url: `https://mmdbkk.com/pay/checkout?t=${encodeURIComponent(token)}`,
      payment_surface: "public",
      official_verification_required: true,
    }, 200, request, env);
  } catch (error) {
    return json({ ok: false, authority: "payments-worker", error: text(error?.message || error, 300) }, Number(error?.status || 500), request, env);
  }
}

export async function maybeHandleShopConfirmationDetails(request, env) {
  if (request.method.toUpperCase() !== "POST") return null;
  const body = await request.clone().json().catch(() => null);
  const token = text(body?.t || body?.token, 12000);
  if (!token) return null;

  let claims;
  try {
    claims = await verifyConfirmToken(env, token, { expectedRole: "customer" });
  } catch {
    return null;
  }
  if (text(claims?.payment_type, 80).toLowerCase() !== SHOP_STAGE) return null;

  try {
    const [order, payment] = await Promise.all([
      findOrderByOrderId(env, claims.session_id),
      findPaymentByRef(env, claims.payment_ref),
    ]);
    if (!order?.id) throw httpError(404, "shop_order_not_found");
    if (!payment?.id) throw httpError(404, "shop_payment_not_found");

    const total = positive(order.fields?.[ORDER_FIELDS.total]);
    const orderItems = await findOrderItems(env, order.id);
    const paymentFields = payment.fields || {};
    const paymentStatus = code(paymentFields[PAYMENT_FIELDS.status]);
    const verificationStatus = code(paymentFields[PAYMENT_FIELDS.verification]);
    const intentStatus = code(paymentFields[PAYMENT_FIELDS.intentStatus]);
    const verified = ["paid", "full_payment", "verified", "completed"].includes(paymentStatus) || verificationStatus === "verified";
    const proofReceived = ["manual_slip_evidence_received", "pending_review", "submitted", "reviewing"].includes(intentStatus) || verificationStatus === "pending_review";

    return json({
      ok: true,
      authority: "payments-worker",
      schema: "confirmation_details_v1",
      role: "customer",
      session_id: claims.session_id,
      payment_ref: claims.payment_ref,
      payment_type: SHOP_STAGE,
      session_status: text(order.fields?.[ORDER_FIELDS.orderStatus], 80) || "draft",
      payment_status: text(order.fields?.[ORDER_FIELDS.paymentStatus], 80) || "pending",
      client_name: "MMD Shop Customer",
      model_name: "MMD Shop",
      job_type: "MMD Shop Order",
      job_date: null,
      start_time: null,
      end_time: null,
      location_name: "MMD Shop",
      google_map_url: null,
      vip_detail: null,
      created_at: null,
      amount_thb: total,
      pricing: {
        full_price_thb: total,
        discount_mode: "none",
        discount_percent: null,
        discount_thb: 0,
        net_price_thb: total,
        deposit_basis_thb: total,
        deposit_percent: 100,
        deposit_due_thb: total,
        deposit_received_thb: verified ? total : 0,
        balance_thb: verified ? 0 : total,
      },
      payment: {
        schema: "customer_payment_display_v1",
        stage: SHOP_STAGE,
        method: normalizeMethod(paymentFields[PAYMENT_FIELDS.method]),
        amount_due_thb: verified ? 0 : total,
        qr_url: null,
        proof_status_available: true,
        proof_received: proofReceived,
        verified,
      },
      shop_order: {
        schema: "mmd_shop_order_payment_context_v1",
        order_id: claims.session_id,
        order_record_id: order.id,
        items: orderItems.map(safeShopOrderItem),
        fulfillment: (() => {
          const value = readMmdShopFulfillment(order.fields?.[ORDER_FIELDS.notes]);
          return value ? publicMmdShopFulfillment(value) : null;
        })(),
        reservation: (() => {
          const value = readMmdShopReservation(order.fields?.[ORDER_FIELDS.notes]);
          return value ? publicMmdShopReservation(value) : null;
        })(),
      },
    }, 200, request, env);
  } catch (error) {
    return json({ ok: false, authority: "payments-worker", error: text(error?.message || error, 300) }, Number(error?.status || 500), request, env);
  }
}

export async function preflightReviewedShopPayment(request, env) {
  const body = await request.clone().json().catch(() => null);
  const stage = code(body?.payment_stage || body?.stage || body?.payment_type);
  if (stage !== SHOP_STAGE) return null;

  const orderId = text(body?.session_id || body?.order_id, 180);
  if (!orderId) return json({ ok: false, authority: "payments-worker", error: "shop_order_id_required" }, 400, request, env);

  try {
    const order = await findOrderByOrderId(env, orderId);
    if (!order?.id) throw httpError(404, "shop_order_not_found");

    const orderStatus = code(order.fields?.[ORDER_FIELDS.orderStatus]);
    const paymentStatus = code(order.fields?.[ORDER_FIELDS.paymentStatus]);
    const reservation = readMmdShopReservation(order.fields?.[ORDER_FIELDS.notes]);

    if (paymentStatus === "paid") return null;
    if (orderStatus === "cancelled") throw httpError(409, "shop_order_cancelled");
    if (reservation && ["expired", "released"].includes(reservation.state)) {
      throw httpError(409, "shop_order_reservation_expired");
    }
    if (reservation?.state === "reserved") {
      const expires = Date.parse(reservation.expires_at || "");
      if (Number.isFinite(expires) && expires <= Date.now()) {
        throw httpError(409, "shop_order_reservation_expired");
      }
    }

    return null;
  } catch (error) {
    return json({
      ok: false,
      authority: "payments-worker",
      error: text(error?.message || error || "shop_payment_preflight_failed", 300),
      payment_committed: false,
    }, Number(error?.status || 409), request, env);
  }
}

export async function reconcileReviewedShopPayment(request, response, env) {
  if (!response?.ok) return response;
  const body = await request.clone().json().catch(() => null);
  const stage = code(body?.payment_stage || body?.stage || body?.payment_type);
  if (stage !== SHOP_STAGE) return response;

  const payload = await response.clone().json().catch(() => null);
  if (!payload?.ok) return response;

  const orderId = text(body?.session_id || body?.order_id, 180);
  if (!orderId) return response;

  try {
    const order = await findOrderByOrderId(env, orderId);
    if (!order?.id) throw httpError(404, "shop_order_not_found");

    const existingReservation = readMmdShopReservation(order.fields?.[ORDER_FIELDS.notes]);
    let committedReservation = existingReservation;
    if (existingReservation?.state === "reserved") {
      const committed = await commitMmdShopReservation(env, existingReservation);
      committedReservation = committed.reservation;
    } else if (existingReservation && existingReservation.state !== "committed") {
      throw httpError(409, `shop_reservation_not_committable:${existingReservation.state}`);
    }

    const paymentAuditNote = appendNote(
      order.fields?.[ORDER_FIELDS.notes],
      `payment_verified_at=${new Date().toISOString()}; payment_ref=${text(body?.payment_ref || body?.transaction_ref, 220)}; verified_by=payments-worker`,
    );
    const existingFulfillment = readMmdShopFulfillment(order.fields?.[ORDER_FIELDS.notes]) || createMmdShopFulfillment();
    const confirmedFulfillment = transitionMmdShopFulfillment(existingFulfillment, { state: "confirmed" });
    const fulfillmentNotes = writeMmdShopFulfillment(paymentAuditNote, confirmedFulfillment);
    const orderNotes = committedReservation
      ? writeMmdShopReservation(fulfillmentNotes, committedReservation)
      : fulfillmentNotes;

    await patchRecord(env, table(env, "orders"), order.id, {
      [ORDER_FIELDS.orderStatus]: "confirmed",
      [ORDER_FIELDS.paymentStatus]: "paid",
      [ORDER_FIELDS.notes]: orderNotes,
    });

    const items = await findOrderItems(env, order.id);
    await Promise.all(items.map((item) =>
      patchRecord(env, table(env, "orderItems"), item.id, { [ITEM_FIELDS.status]: "confirmed" })
    ));

    await notifyShopPayment(env, {
      orderId,
      paymentRef: text(body?.payment_ref || body?.transaction_ref, 220),
      amount: positive(body?.amount_thb ?? body?.amount) || positive(order.fields?.[ORDER_FIELDS.total]) || 0,
    }).catch(() => null);

    const headers = new Headers(response.headers);
    headers.delete("content-length");
    headers.set("content-type", "application/json; charset=utf-8");
    headers.set("x-mmd-shop-payment", "confirmed");
    return new Response(JSON.stringify({
      ...payload,
      shop_order_settlement: {
        ok: true,
        order_id: orderId,
        order_record_id: order.id,
        order_status: "confirmed",
        payment_status: "paid",
        items_confirmed: items.length,
        fulfillment: publicMmdShopFulfillment(confirmedFulfillment),
        reservation: committedReservation ? publicMmdShopReservation(committedReservation) : null,
        inventory_out_committed: committedReservation ? committedReservation.state === "committed" : null,
      },
    }), { status: response.status, headers });
  } catch (error) {
    return json({
      ok: false,
      authority: "payments-worker",
      error: text(error?.message || error || "shop_settlement_failed", 300),
      payment_committed: true,
      shop_order_reconcile_required: true,
    }, Number(error?.status || 502), request, env);
  }
}

async function createPaymentRecord(env, input) {
  return createRecord(env, table(env, "payments"), {
    [PAYMENT_FIELDS.paymentRef]: input.paymentRef,
    [PAYMENT_FIELDS.paymentDate]: bangkokDate(),
    [PAYMENT_FIELDS.amount]: input.amount,
    [PAYMENT_FIELDS.status]: "Pending",
    [PAYMENT_FIELDS.method]: "PromptPay",
    [PAYMENT_FIELDS.notes]: `schema=mmd_shop_payment_v1; order_id=${input.orderId}; payment_stage=shop; official_verification_required=true${input.email ? `; customer_email=${input.email}` : ""}`,
    [PAYMENT_FIELDS.verification]: "pending_review",
    [PAYMENT_FIELDS.intentStatus]: "Pending Confirmation",
    [PAYMENT_FIELDS.createdAt]: new Date().toISOString(),
    [PAYMENT_FIELDS.source]: "web_pay",
    [PAYMENT_FIELDS.sessionId]: input.orderId,
  });
}

async function findOrderByOrderId(env, orderId) {
  return findFirst(env, table(env, "orders"), `{Order ID}='${formulaValue(orderId)}'`);
}

async function findPaymentByRef(env, paymentRef) {
  return findFirst(env, table(env, "payments"), `{Payment Reference}='${formulaValue(paymentRef)}'`);
}

async function findOrderItems(env, orderRecordId) {
  const baseId = text(env.AIRTABLE_BASE_ID, 100);
  const apiKey = airtableToken(env);
  const tableId = table(env, "orderItems");
  const matches = [];
  let offset = "";
  let pages = 0;

  do {
    const url = new URL(`${AIRTABLE_API}/${baseId}/${encodeURIComponent(tableId)}`);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("returnFieldsByFieldId", "true");
    for (const fieldId of Object.values(ITEM_FIELDS)) url.searchParams.append("fields[]", fieldId);
    if (offset) url.searchParams.set("offset", offset);

    const response = await fetch(url.toString(), { headers: { authorization: `Bearer ${apiKey}` } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw httpError(502, "shop_order_items_lookup_failed");

    for (const record of Array.isArray(data.records) ? data.records : []) {
      const linked = Array.isArray(record.fields?.[ITEM_FIELDS.order]) ? record.fields[ITEM_FIELDS.order] : [];
      if (linked.includes(orderRecordId)) matches.push(record);
    }

    offset = text(data.offset, 300);
    pages += 1;
  } while (offset && pages < 20);

  return matches;
}

function safeShopOrderItem(record) {
  const fields = record?.fields || {};
  const quantity = numberOrNull(fields[ITEM_FIELDS.quantity]) || 0;
  const unitPrice = numberOrNull(fields[ITEM_FIELDS.price]);
  const lineTotal = numberOrNull(fields[ITEM_FIELDS.lineTotal]);
  return {
    item_name: text(fields[ITEM_FIELDS.name], 240) || "MMD Shop Item",
    quantity,
    unit_price_thb: unitPrice,
    line_total_thb: lineTotal,
    status: code(fields[ITEM_FIELDS.status]) || "draft",
  };
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function findFirst(env, tableId, formula) {
  const baseId = text(env.AIRTABLE_BASE_ID, 100);
  const apiKey = airtableToken(env);
  const url = new URL(`${AIRTABLE_API}/${baseId}/${encodeURIComponent(tableId)}`);
  url.searchParams.set("maxRecords", "1");
  url.searchParams.set("filterByFormula", formula);
  url.searchParams.set("returnFieldsByFieldId", "true");
  const response = await fetch(url.toString(), { headers: { authorization: `Bearer ${apiKey}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(502, "airtable_lookup_failed");
  return data.records?.[0] || null;
}

async function createRecord(env, tableId, fields) {
  const data = await airtableWrite(env, tableId, "", "POST", { records: [{ fields }], typecast: true });
  return data.records?.[0] || null;
}

async function patchRecord(env, tableId, recordId, fields) {
  return airtableWrite(env, tableId, recordId, "PATCH", { fields, typecast: true });
}

async function airtableWrite(env, tableId, recordId, method, body) {
  const baseId = text(env.AIRTABLE_BASE_ID, 100);
  const apiKey = airtableToken(env);
  const suffix = recordId ? `/${encodeURIComponent(recordId)}` : "";
  const response = await fetch(`${AIRTABLE_API}/${baseId}/${encodeURIComponent(tableId)}${suffix}`, {
    method,
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(502, `airtable_write_${response.status}`);
  return data;
}

async function stableShopPaymentRef(orderId) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`mmd-shop:${orderId}`));
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `shop_${hex.slice(0, 24)}`;
}

async function notifyShopPayment(env, input) {
  const token = text(env.TELEGRAM_BOT_TOKEN, 5000);
  if (!token) return { ok: false, skipped: true };
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: text(env.TELEGRAM_CHAT_ID || "-1003546439681", 120),
      message_thread_id: Number(env.TG_THREAD_MMD_SHOP_PAYMENTS || 161),
      parse_mode: "HTML",
      text: [
        "<b>MMD SHOP · PAYMENT VERIFIED</b>",
        `Order: <code>${escapeHtml(input.orderId)}</code>`,
        `Ref: <code>${escapeHtml(input.paymentRef)}</code>`,
        `Amount: <b>${Number(input.amount || 0).toLocaleString("en-US")} THB</b>`,
        "Order status: <b>confirmed</b>",
      ].join("\n"),
    }),
  });
  return { ok: response.ok, status: response.status };
}

function signingSecret(env) {
  const value = text(env.PAYMENT_CONFIRMATION_SIGNING_SECRET || env.CONFIRM_KEY, 5000);
  if (!value) throw httpError(503, "missing_payment_confirmation_signing_secret");
  return value;
}

function airtableToken(env) {
  const token = text(env.AIRTABLE_API_KEY, 5000);
  if (!token || !text(env.AIRTABLE_BASE_ID, 100)) throw httpError(503, "airtable_not_ready");
  return token;
}

function table(env, kind) {
  const values = {
    orders: env.MMD_SHOP_ORDERS_TABLE_ID || TABLES.orders,
    orderItems: env.MMD_SHOP_ORDER_ITEMS_TABLE_ID || TABLES.orderItems,
    payments: env.AIRTABLE_TABLE_PAYMENTS || TABLES.payments,
  };
  return text(values[kind], 120);
}

function normalizeMethod(value) {
  const raw = code(value);
  if (raw === "promptpay") return "promptpay";
  if (raw === "bank_transfer") return "bank_transfer";
  if (raw === "credit_card" || raw === "paypal") return "paypal";
  return raw || "promptpay";
}

function appendNote(current, extra) {
  return [text(current, 12000), text(extra, 2000)].filter(Boolean).join("\n");
}

function bangkokDate() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function formulaValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
function positive(value) {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}
function normalizePath(value) {
  const path = text(value || "/", 300).replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}
function code(value) {
  return text(value, 180).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
function text(value, max = 5000) {
  return String(value == null ? "" : value).trim().slice(0, max).replace(/[\u0000-\u001F\u007F]/g, " ");
}
function escapeHtml(value) {
  return text(value, 1000).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
function allowedOrigins(env) {
  return text(env.ALLOWED_ORIGINS, 5000).replace(/^[\"']|[\"']$/g, "").split(",").map((value) => value.trim().replace(/^[\"']|[\"']$/g, "")).filter(Boolean);
}
function corsHeaders(request, env) {
  const headers = new Headers({
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "access-control-max-age": "86400",
    vary: "Origin",
  });
  const origin = text(request.headers.get("origin"), 500);
  if (origin && allowedOrigins(env).includes(origin)) headers.set("access-control-allow-origin", origin);
  return headers;
}
function json(payload, status = 200, request = null, env = {}) {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store, private", "x-mmd-payment-authority": "payments-worker" });
  if (request) corsHeaders(request, env).forEach((value, key) => headers.set(key, value));
  return new Response(JSON.stringify(payload), { status, headers });
}

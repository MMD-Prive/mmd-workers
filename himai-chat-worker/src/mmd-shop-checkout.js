import { createMmdShopFulfillment, normalizeMmdShopShipping, publicMmdShopFulfillment, writeMmdShopFulfillment } from "../../shared/mmd-shop-fulfillment.mjs";
import { publicMmdShopReservation, writeMmdShopReservation } from "../../shared/mmd-shop-stock-reservation.mjs";
import { releaseViaMmdShopCoordinator, reserveViaMmdShopCoordinator } from "./mmd-shop-stock-coordinator.js";

const AIRTABLE_API = "https://api.airtable.com/v0";

const TABLES = Object.freeze({
  products: "tblzsmNLfP6J0kQ90",
  customers: "tbllkfCySeL9fSfZw",
  orders: "tblr8lbi2wMuRM1N4",
  orderItems: "tbl37Iprxz4OLL65P",
  inventory: "tblwFgl4et1TOgtNn",
});

const PRODUCT_FIELDS = Object.freeze({
  name: "fld0oKjoZrb1IqntV",
  sku: "fldhJE7UEE4VYHjR6",
  brandAvailability: "fldve5nrQmymoZgiX",
  status: "fldxYkkvmK9izvACA",
  supplier: "fldJCZ7YzsUjIItKf",
  note: "fldAT8hnluV4CtF3c",
  mmdPrice: "fldD6Q5yido7pTlU0",
  himaiPrice: "fldo4N9GRq6rHPiCh",
});

const CUSTOMER_FIELDS = Object.freeze({
  name: "fld5OinQVj9547w7f",
  displayName: "fldsStJmYFGXD2Frm",
  phone: "fldVLZudvXfJB26Cx",
  email: "flddYltR97rxzIQa4",
  brandOrigin: "fldtB8vxXuy0eYnC2",
  acquisitionChannel: "fldKj1Voj6R4juSeP",
  sourcePath: "fld8wsDN9c6swepc7",
  signupStatus: "fldVpDEo1QoECO9ic",
  customerOrigin: "fldSHQS36g44ngf0b",
  note: "fldiG60HuRFApYgVh",
  createdAt: "fldobLojYBjeRJHYf",
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
  source: "fldSMKdkzwFY6UyzQ",
  telegramSent: "flda0AwcOFAYSy2kB",
  shopBrand: "fld97aHqq3IbPam84",
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

const INVENTORY_FIELDS = Object.freeze({
  product: "fldVc73xUxjrfSjHY",
  remaining: "fldvjoRuM1mrR6ItQ",
  low: "fldYtzXtBvK3HuqQa",
  status: "fldZW2m1Xq8q0ZH9Z",
});

const SHOP_CHECKOUT_CONFIG = Object.freeze({
  "mmd-shop": Object.freeze({
    key: "mmd-shop",
    path: "/mmd-shop/api/checkout",
    publicName: "MMD Shop",
    sourcePath: "/mmd-shop",
    orderPrefix: "MMD",
    priceField: PRODUCT_FIELDS.mmdPrice,
    brandToken: "mmd",
    telegramFlow: "mmd_shop_orders",
    telegramTitle: "MMD SHOP",
  }),
  shop: Object.freeze({
    key: "shop",
    path: "/shop/api/checkout",
    publicName: "Himai Shop",
    sourcePath: "/shop",
    orderPrefix: "HIMAI",
    priceField: PRODUCT_FIELDS.himaiPrice,
    brandToken: "himai",
    telegramFlow: "himai_orders",
    telegramTitle: "HIMAI SHOP",
  }),
});

function checkoutConfigForPath(pathname) {
  return Object.values(SHOP_CHECKOUT_CONFIG).find((item) => item.path === pathname) || null;
}


export async function handleMmdShopCheckout(request, env) {
  const url = new URL(request.url);
  const shop = checkoutConfigForPath(url.pathname);
  if (!shop) return null;

  if (request.method.toUpperCase() === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (request.method.toUpperCase() !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  let reservation = null;
  let order = null;
  let orderId = "";

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw httpError(400, "invalid_json_body");

    const customerInput = normalizeCustomer(body.customer || body);
    const shipping = normalizeMmdShopShipping(body.shipping || {}, customerInput);
    const memberContext = await resolveServerMemberContext(request, env);
    const cartInput = normalizeCart(body.items);
    const products = await loadProducts(env, cartInput.map((item) => item.product_id));
    const stock = await loadMmdStock(env);
    const pricedCart = validateAndPriceCart(cartInput, products, stock, shop);
    const customer = await findOrCreateCustomer(env, customerInput, body.source_path, memberContext, shop);
    orderId = makeOrderId(shop.orderPrefix);
    const total = pricedCart.reduce((sum, item) => sum + item.line_total_thb, 0);
    const stockConfirmationRequired = pricedCart.some((item) => item.stock_status === "on_demand");

    order = await createOrder(env, {
      orderId,
      customerRecordId: customer.id,
      total,
      stockConfirmationRequired,
      sourcePath: clean(body.source_path, 300) || shop.sourcePath,
      shop,
      shipping,
      reservation: null,
    });

    reservation = await reserveViaMmdShopCoordinator(env, {
      order_id: orderId,
      order_record_id: order.id,
      order_notes: order.fields?.[ORDER_FIELDS.notes] || "",
      items: pricedCart,
    });
    order.fields = order.fields || {};
    order.fields[ORDER_FIELDS.notes] = writeMmdShopReservation(order.fields[ORDER_FIELDS.notes] || "", reservation);

    const orderItems = await createOrderItems(env, order.id, pricedCart, shop);

    const telegram = await notifyOrder(env, {
      orderId,
      total,
      customerName: customerInput.name,
      items: pricedCart,
      stockConfirmationRequired,
      reservation,
      shop,
    }).catch(() => ({ ok: false }));

    if (telegram.ok) {
      await patchRecord(env, table(env, "orders"), order.id, { [ORDER_FIELDS.telegramSent]: true }).catch(() => null);
    }

    const payment = await createPaymentIntent(env, { orderId, total, email: customerInput.email, shop });
    if (!payment?.ok || !clean(payment.customer_payment_url, 2000)) {
      const released = await releaseViaMmdShopCoordinator(env, reservation, "payment_initialization_failed").catch(() => null);
      if (released?.reservation) reservation = released.reservation;
      const currentNotes = clean(order?.fields?.[ORDER_FIELDS.notes], 14000);
      await patchRecord(env, table(env, "orders"), order.id, {
        [ORDER_FIELDS.orderStatus]: "cancelled",
        [ORDER_FIELDS.notes]: writeMmdShopReservation(
          [currentNotes, `payment_initialization_failed=${clean(payment?.error || "payment_url_missing", 500)}`].filter(Boolean).join("\n"),
          reservation,
        ),
      }).catch(() => null);
      return json({
        ok: false,
        error: "payment_initialization_failed",
        retryable: true,
        order_created: true,
        order_id: orderId,
        total_thb: total,
        reservation: publicMmdShopReservation(reservation),
      }, 502);
    }

    await appendOrderNote(env, order, [
      `payment_ref=${clean(payment.payment_ref, 220)}`,
      "payment_stage=shop",
      "money_truth=payments-worker",
      `reservation_expires_at=${clean(reservation?.expires_at, 80)}`,
    ].join("; ")).catch(() => null);

    return json({
      ok: true,
      schema: shop.key === "mmd-shop" ? "mmd_shop_checkout_v2" : "himai_shop_checkout_v2",
      shop: shop.key,
      order_id: orderId,
      order_record_id: order.id,
      customer_record_id: customer.id,
      total_thb: total,
      currency: "THB",
      payment_ref: clean(payment.payment_ref, 220) || null,
      payment_url: payment.customer_payment_url,
      payment_status: "pending",
      order_status: "draft",
      official_payment_verification_required: true,
      stock_confirmation_required: stockConfirmationRequired,
      reservation: publicMmdShopReservation(reservation),
      fulfillment: publicMmdShopFulfillment(createMmdShopFulfillment({ shipping })),
      items: pricedCart.map((item, index) => ({
        order_item_record_id: orderItems[index]?.id || null,
        product_id: item.product_id,
        sku: item.sku,
        product_name: item.product_name,
        quantity: item.quantity,
        unit_price_thb: item.unit_price_thb,
        line_total_thb: item.line_total_thb,
        available: item.available,
        stock_status: item.stock_status,
      })),
    });
  } catch (error) {
    if (reservation?.state === "reserved") {
      const released = await releaseViaMmdShopCoordinator(env, reservation, "checkout_failed").catch(() => null);
      if (released?.reservation) reservation = released.reservation;
    }
    if (order?.id) {
      const currentNotes = clean(order?.fields?.[ORDER_FIELDS.notes], 14000);
      await patchRecord(env, table(env, "orders"), order.id, {
        [ORDER_FIELDS.orderStatus]: "cancelled",
        [ORDER_FIELDS.notes]: reservation
          ? writeMmdShopReservation([currentNotes, `checkout_failed=${clean(error?.message, 300)}`].filter(Boolean).join("\n"), reservation)
          : currentNotes,
      }).catch(() => null);
    }
    console.error("MMD Shop checkout error:", error);
    return json({ ok: false, error: clean(error?.message || error || "checkout_failed", 300), order_id: orderId || null }, Number(error?.status || 500));
  }
}

function normalizeCustomer(raw) {
  const name = clean(raw?.name || raw?.display_name || raw?.customer_name, 180);
  const phone = normalizePhone(raw?.phone || raw?.tel || raw?.mobile);
  const email = clean(raw?.email, 320).toLowerCase();
  if (name.length < 2) throw httpError(400, "customer_name_required");
  if (phone.length < 8) throw httpError(400, "customer_phone_required");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, "invalid_customer_email");
  return { name, phone, email };
}

function normalizeCart(items) {
  if (!Array.isArray(items) || !items.length) throw httpError(400, "cart_empty");
  if (items.length > 20) throw httpError(400, "cart_too_large");
  const merged = new Map();
  for (const raw of items) {
    const productId = clean(raw?.product_id || raw?.id, 80);
    const quantity = Number(raw?.quantity ?? raw?.qty ?? 0);
    if (!/^rec[A-Za-z0-9]{14}$/.test(productId)) throw httpError(400, "invalid_product_id");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw httpError(400, "invalid_quantity");
    merged.set(productId, (merged.get(productId) || 0) + quantity);
  }
  return [...merged.entries()].map(([product_id, quantity]) => {
    if (quantity > 20) throw httpError(400, "quantity_limit_exceeded");
    return { product_id, quantity };
  });
}

async function loadProducts(env, productIds) {
  const out = new Map();
  await Promise.all(productIds.map(async (productId) => {
    const params = new URLSearchParams({ returnFieldsByFieldId: "true" });
    const record = await airtable(env, `${encodeURIComponent(table(env, "products"))}/${encodeURIComponent(productId)}?${params}`, { method: "GET" });
    if (record?.id) out.set(record.id, record);
  }));
  return out;
}

async function loadMmdStock(env) {
  const stock = new Map();
  let offset = "";
  let pages = 0;
  do {
    const params = new URLSearchParams({ pageSize: "100", returnFieldsByFieldId: "true" });
    for (const id of Object.values(INVENTORY_FIELDS)) params.append("fields[]", id);
    if (offset) params.set("offset", offset);
    const data = await airtable(env, `${encodeURIComponent(table(env, "inventory"))}?${params}`, { method: "GET" });
    for (const record of data.records || []) {
      const fields = record.fields || {};
      const status = selectName(fields[INVENTORY_FIELDS.status]).toLowerCase();
      if (status !== "active") continue;
      const productIds = linkedIds(fields[INVENTORY_FIELDS.product]);
      const remaining = Math.max(0, number(fields[INVENTORY_FIELDS.remaining]));
      const low = selectName(fields[INVENTORY_FIELDS.low]).toLowerCase() === "low";
      for (const productId of productIds) {
        const current = stock.get(productId) || { available: 0, low: false, active_batches: 0 };
        current.available += remaining;
        current.low = current.low || low;
        current.active_batches += 1;
        stock.set(productId, current);
      }
    }
    offset = clean(data.offset, 300);
    pages += 1;
  } while (offset && pages < 20);
  return stock;
}

export function validateAndPriceCart(cart, products, stock, shop = SHOP_CHECKOUT_CONFIG["mmd-shop"]) {
  return cart.map((line) => {
    const record = products.get(line.product_id);
    if (!record?.id) throw httpError(404, "product_not_found");
    const fields = record.fields || {};
    const status = selectName(fields[PRODUCT_FIELDS.status]).toLowerCase();
    const brands = selectList(fields[PRODUCT_FIELDS.brandAvailability]).map((value) => value.toLowerCase());
    const availableForShop = brands.some((value) =>
      value.includes(shop.brandToken) || value.includes("both") || (shop.key === "shop" && value === "shop")
    );
    const price = positiveNumber(fields[shop.priceField]);
    const sku = clean(fields[PRODUCT_FIELDS.sku], 120);
    const productName = clean(fields[PRODUCT_FIELDS.name], 220);
    if (isRestrictedCheckoutProduct(sku, productName, fields[PRODUCT_FIELDS.note])) throw httpError(403, "product_not_eligible_for_online_checkout");
    if (status !== "active") throw httpError(409, "product_not_active");
    if (!availableForShop) throw httpError(409, "product_not_available_in_shop");
    if (price === null) throw httpError(409, "product_price_unavailable");

    const inventory = stock.get(record.id);
    const onDemand = isOnDemandProduct(fields[PRODUCT_FIELDS.note]);
    if (!inventory && !onDemand) throw httpError(409, "stock_untracked");
    if (!onDemand && (inventory.available <= 0 || line.quantity > inventory.available)) throw httpError(409, "insufficient_stock");
    if (onDemand && linkedIds(fields[PRODUCT_FIELDS.supplier]).length === 0) throw httpError(409, "on_demand_supplier_unavailable");
    return {
      product_id: record.id,
      product_name: productName || `${shop.publicName} Item`,
      sku,
      supplier_ids: linkedIds(fields[PRODUCT_FIELDS.supplier]),
      quantity: line.quantity,
      unit_price_thb: price,
      line_total_thb: roundMoney(price * line.quantity),
      available: onDemand ? null : inventory.available,
      low_stock: onDemand ? false : Boolean(inventory.low),
      stock_status: onDemand ? "on_demand" : "tracked",
    };
  });
}

async function findOrCreateCustomer(env, customer, sourcePath, memberContext = null, shop = SHOP_CHECKOUT_CONFIG["mmd-shop"]) {
  const found = await findExistingCustomer(env, customer, memberContext);
  if (found) {
    const currentMemberId = clean(found.fields?.[CUSTOMER_FIELDS.memberId], 180);
    const currentLineUserId = clean(found.fields?.[CUSTOMER_FIELDS.lineUserId], 220);
    const verifiedMemberId = clean(memberContext?.member_id, 180);
    const verifiedLineUserId = clean(memberContext?.line_user_id, 220);

    if (verifiedMemberId && currentMemberId && currentMemberId !== verifiedMemberId) {
      throw httpError(409, "shop_member_identity_conflict");
    }
    if (verifiedLineUserId && currentLineUserId && currentLineUserId !== verifiedLineUserId) {
      throw httpError(409, "shop_line_identity_conflict");
    }

    const patch = {};
    if (verifiedMemberId && !currentMemberId) patch[CUSTOMER_FIELDS.memberId] = verifiedMemberId;
    if (verifiedLineUserId && !currentLineUserId) patch[CUSTOMER_FIELDS.lineUserId] = verifiedLineUserId;
    if (Object.keys(patch).length) return patchRecord(env, table(env, "customers"), found.id, patch);
    return found;
  }

  const fields = {
    [CUSTOMER_FIELDS.name]: customer.name,
    [CUSTOMER_FIELDS.displayName]: customer.name,
    [CUSTOMER_FIELDS.phone]: customer.phone,
    [CUSTOMER_FIELDS.acquisitionChannel]: memberContext?.member_id ? "mmd_member" : "web",
    [CUSTOMER_FIELDS.sourcePath]: clean(sourcePath, 300) || shop.sourcePath,
    [CUSTOMER_FIELDS.signupStatus]: "active",
    [CUSTOMER_FIELDS.customerOrigin]: memberContext?.member_id ? "mmd_member" : "web",
    [CUSTOMER_FIELDS.note]: memberContext?.member_id
      ? `Created by ${shop.publicName} checkout with server-verified MY MMD identity.`
      : `Created by ${shop.publicName} web checkout.`,
    [CUSTOMER_FIELDS.createdAt]: new Date().toISOString(),
  };
  if (shop.key === "mmd-shop") fields[CUSTOMER_FIELDS.brandOrigin] = "MMD Shop";
  if (customer.email) fields[CUSTOMER_FIELDS.email] = customer.email;
  if (memberContext?.member_id) fields[CUSTOMER_FIELDS.memberId] = memberContext.member_id;
  if (memberContext?.line_user_id) fields[CUSTOMER_FIELDS.lineUserId] = memberContext.line_user_id;
  return createRecord(env, table(env, "customers"), fields);
}

async function findExistingCustomer(env, customer, memberContext = null) {
  const records = [];
  let offset = "";
  let pages = 0;
  do {
    const params = new URLSearchParams({ pageSize: "100", returnFieldsByFieldId: "true" });
    params.append("fields[]", CUSTOMER_FIELDS.phone);
    params.append("fields[]", CUSTOMER_FIELDS.email);
    params.append("fields[]", CUSTOMER_FIELDS.memberId);
    params.append("fields[]", CUSTOMER_FIELDS.lineUserId);
    if (offset) params.set("offset", offset);
    const data = await airtable(env, `${encodeURIComponent(table(env, "customers"))}?${params}`, { method: "GET" });
    records.push(...(data.records || []));
    offset = clean(data.offset, 300);
    pages += 1;
  } while (offset && pages < 20);

  const verifiedMemberId = clean(memberContext?.member_id, 180);
  const verifiedLineUserId = clean(memberContext?.line_user_id, 220);

  if (verifiedMemberId) {
    const exactMember = records.find((record) =>
      clean(record.fields?.[CUSTOMER_FIELDS.memberId], 180) === verifiedMemberId
    );
    if (exactMember) return exactMember;
  }

  if (verifiedLineUserId) {
    const exactLine = records.find((record) =>
      clean(record.fields?.[CUSTOMER_FIELDS.lineUserId], 220) === verifiedLineUserId
    );
    if (exactLine) return exactLine;
  }

  for (const record of records) {
    const boundMemberId = clean(record.fields?.[CUSTOMER_FIELDS.memberId], 180);
    const boundLineUserId = clean(record.fields?.[CUSTOMER_FIELDS.lineUserId], 220);

    // Phone/email may link only an unbound shop customer. A browser contact value
    // never overrides or adopts an already-bound MY MMD / LINE identity.
    if (boundMemberId || boundLineUserId) continue;

    const phone = normalizePhone(record.fields?.[CUSTOMER_FIELDS.phone]);
    const email = clean(record.fields?.[CUSTOMER_FIELDS.email], 320).toLowerCase();
    if (phone && phone === customer.phone) return record;
    if (customer.email && email && email === customer.email) return record;
  }

  return null;
}

async function resolveServerMemberContext(request, env) {
  if (!env.MEMBER_PAGES_WORKER?.fetch) return null;
  const cookie = clean(request.headers.get("cookie"), 12000);
  if (!cookie) return null;

  try {
    const response = await env.MEMBER_PAGES_WORKER.fetch(new Request("https://member-pages.internal/__internal/mmd-shop/member-context", {
      method: "GET",
      headers: { cookie, accept: "application/json" },
    }));
    const payload = await response.json().catch(() => null);
    const memberId = clean(payload?.member_id, 180);
    const lineUserId = clean(payload?.line_user_id, 220);
    return response.ok && payload?.ok === true && memberId
      ? { member_id: memberId, line_user_id: lineUserId || null }
      : null;
  } catch {
    return null;
  }
}

async function createOrder(env, input) {
  const noteLines = [
    "schema=mmd_shop_order_v1",
    `shop_brand=${input.shop?.key || "mmd-shop"}`,
    "source=web_checkout",
    `source_path=${input.sourcePath}`,
    input.stockConfirmationRequired ? "stock_confirmation_required=true" : "stock_confirmation_required=false",
    "payment_verification_required=true",
  ];
  const fulfillment = createMmdShopFulfillment({ shipping: input.shipping });
  const fulfillmentNotes = writeMmdShopFulfillment(noteLines.join("; "), fulfillment);
  const notes = input.reservation
    ? writeMmdShopReservation(fulfillmentNotes, input.reservation)
    : fulfillmentNotes;

  return createRecord(env, table(env, "orders"), {
    [ORDER_FIELDS.orderId]: input.orderId,
    [ORDER_FIELDS.customer]: [input.customerRecordId],
    [ORDER_FIELDS.orderDate]: bangkokDate(),
    [ORDER_FIELDS.orderStatus]: "draft",
    [ORDER_FIELDS.paymentStatus]: "pending",
    [ORDER_FIELDS.total]: input.total,
    [ORDER_FIELDS.notes]: notes,
    [ORDER_FIELDS.source]: "web",
    [ORDER_FIELDS.telegramSent]: false,
    [ORDER_FIELDS.shopBrand]: input.shop?.publicName || "MMD Shop",
  });
}

async function createOrderItems(env, orderRecordId, items, shop = SHOP_CHECKOUT_CONFIG["mmd-shop"]) {
  const records = items.map((item) => ({ fields: {
    [ITEM_FIELDS.name]: item.sku ? `${item.product_name} · ${item.sku}` : item.product_name,
    [ITEM_FIELDS.order]: [orderRecordId],
    [ITEM_FIELDS.product]: [item.product_id],
    [ITEM_FIELDS.supplier]: item.supplier_ids,
    [ITEM_FIELDS.quantity]: item.quantity,
    [ITEM_FIELDS.price]: item.unit_price_thb,
    [ITEM_FIELDS.lineTotal]: item.line_total_thb,
    [ITEM_FIELDS.status]: "draft",
    [ITEM_FIELDS.pricingSource]: "catalog_default",
  }}));
  const data = await airtable(env, encodeURIComponent(table(env, "orderItems")), {
    method: "POST",
    body: JSON.stringify({ records, typecast: true }),
  });
  return data.records || [];
}

export async function createPaymentIntent(env, { orderId, total, email, shop = SHOP_CHECKOUT_CONFIG["mmd-shop"] }) {
  const body = JSON.stringify({
    order_id: orderId,
    session_id: orderId,
    payment_stage: "shop",
    amount: total,
    payment_method: "promptpay",
    member_email: email || undefined,
    notes: `${shop.publicName} Order ${orderId}; shop_brand=${shop.key}; payment_stage=shop`,
  });

  let response;
  if (env.PAYMENTS_WORKER?.fetch) {
    response = await env.PAYMENTS_WORKER.fetch(new Request("https://payments.internal/v1/pay/shop-intent", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body,
    }));
  } else {
    const base = clean(env.MMD_PAYMENTS_BASE_URL || "https://sigil.mmdbkk.com", 500).replace(/\/+$/g, "");
    response = await fetch(`${base}/v1/pay/shop-intent`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://mmdbkk.com" },
      body,
    });
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, error: data?.error || `payments_http_${response.status}` };
  return data;
}

async function notifyOrder(env, input) {
  const service = env.TELEGRAM_WORKER;
  const token = clean(env.AUTH_SERVICE_HIMAI_TO_TELEGRAM, 5000);
  if (!service || typeof service.fetch !== "function") return { ok: false, skipped: true, reason: "telegram_router_binding_missing" };
  if (!token) return { ok: false, skipped: true, reason: "telegram_router_auth_missing" };
  const lines = input.items.map((item) => `• ${escapeHtml(item.product_name)} x${item.quantity} = ${money(item.line_total_thb)} THB`);
  const response = await service.fetch(new Request("https://telegram-worker.internal/telegram/internal/send", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      flow: input.shop?.telegramFlow || "mmd_shop_orders",
      parse_mode: "HTML",
      disable_web_page_preview: true,
      text: [
        `<b>${escapeHtml(input.shop?.telegramTitle || "MMD SHOP")} · NEW ORDER</b>`,
        `Order: <code>${escapeHtml(input.orderId)}</code>`,
        `Customer: <b>${escapeHtml(input.customerName)}</b>`,
        ...lines,
        `Total: <b>${money(input.total)} THB</b>`,
        input.stockConfirmationRequired ? "Stock: <b>on-demand supplier confirmation required</b>" : "Stock: reserved",
        input.reservation?.expires_at ? `Reservation until: <code>${escapeHtml(input.reservation.expires_at)}</code>` : "",
        "Payment: pending · official verification required",
      ].join("\n"),
    }),
  }));
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok && data?.ok === true && data?.telegram?.ok === true, status: response.status, flow: input.shop?.telegramFlow || "mmd_shop_orders" };
}

async function appendOrderNote(env, order, extra) {
  const current = clean(order?.fields?.[ORDER_FIELDS.notes], 8000);
  return patchRecord(env, table(env, "orders"), order.id, { [ORDER_FIELDS.notes]: [current, clean(extra, 2000)].filter(Boolean).join("\n") });
}

function table(env, kind) {
  const values = {
    products: env.SHARED_SHOP_PRODUCTS_TABLE_ID || TABLES.products,
    customers: env.MMD_SHOP_CUSTOMERS_TABLE_ID || TABLES.customers,
    orders: env.MMD_SHOP_ORDERS_TABLE_ID || TABLES.orders,
    orderItems: env.MMD_SHOP_ORDER_ITEMS_TABLE_ID || TABLES.orderItems,
    inventory: env.MMD_SHOP_INVENTORY_BATCHES_TABLE_ID || TABLES.inventory,
  };
  return clean(values[kind], 120);
}

async function createRecord(env, tableId, fields) {
  const data = await airtable(env, encodeURIComponent(tableId), {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  });
  const record = data.records?.[0];
  if (!record?.id) throw httpError(502, "airtable_record_create_failed");
  return record;
}

async function patchRecord(env, tableId, recordId, fields) {
  return airtable(env, `${encodeURIComponent(tableId)}/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    body: JSON.stringify({ fields, typecast: true }),
  });
}

async function airtable(env, path, init = {}) {
  const token = clean(env.AIRTABLE_TOKEN || env.AIRTABLE_API_KEY, 5000);
  const baseId = clean(env.AIRTABLE_BASE_ID, 120);
  if (!token || !baseId) throw httpError(503, "airtable_not_configured");
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(response.status >= 500 ? 502 : response.status, `airtable_${response.status}`);
  return data;
}

function makeOrderId(prefix = "MMD") {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const suffix = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `${clean(prefix, 16).toUpperCase() || "MMD"}-${bangkokDate().replace(/-/g, "")}-${suffix}`;
}

function bangkokDate() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function isOnDemandProduct(note) {
  return /\bon[-\s]*demand\b/i.test(clean(note, 500));
}

function isRestrictedCheckoutProduct(sku, name, productNote) {
  const code = String(sku || "").trim().toUpperCase();
  const text = [sku, name, productNote]
    .map((value) => String(value || ""))
    .join(" ")
    .toLowerCase();
  return code.startsWith("PPP25-")
    || /\bpod\b/i.test(String(name || ""))
    || /\b(?:nicotine|vape|e[-\s]?cig(?:arette)?s?)\b|บุหรี่ไฟฟ้า/i.test(text);
}

function selectName(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && typeof value.name === "string") return value.name;
  return String(value);
}
function selectList(value) { return (Array.isArray(value) ? value : [value]).map(selectName).filter(Boolean); }
function linkedIds(value) { return Array.isArray(value) ? value.map((item) => clean(typeof item === "string" ? item : item?.id, 80)).filter((id) => /^rec[A-Za-z0-9]{14}$/.test(id)) : []; }
function normalizePhone(value) { return String(value ?? "").replace(/[^0-9+]/g, "").replace(/^\+66/, "0").replace(/\+/g, "").slice(0, 20); }
function positiveNumber(value) { const n = Number(value); return Number.isFinite(n) && n > 0 ? roundMoney(n) : null; }
function number(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }
function roundMoney(value) { const n = Number(value); return Math.round((n + Number.EPSILON) * 100) / 100; }
function money(value) { return Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 }); }
function clean(value, max = 5000) { return String(value == null ? "" : value).trim().slice(0, max).replace(/[\u0000-\u001F\u007F]/g, " "); }
function escapeHtml(value) { return clean(value, 1000).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function httpError(status, message) { const error = new Error(message); error.status = status; return error; }
function corsHeaders() { return { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "Content-Type" }; }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...corsHeaders() } }); }

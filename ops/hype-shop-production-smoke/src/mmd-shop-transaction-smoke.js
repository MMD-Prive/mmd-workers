import {
  claimMmdShopReservationForPayment,
  commitMmdShopReservation,
  expireMmdShopReservations,
  publicMmdShopReservation,
  readMmdShopReservation,
  reserveMmdShopStock,
  writeMmdShopReservation,
} from "../../../shared/mmd-shop-stock-reservation.mjs";
import {
  createMmdShopFulfillment,
  normalizeMmdShopShipping,
  publicMmdShopFulfillment,
  readMmdShopFulfillment,
  transitionMmdShopFulfillment,
  writeMmdShopFulfillment,
} from "../../../shared/mmd-shop-fulfillment.mjs";

const TABLES = Object.freeze({
  orders: "tblr8lbi2wMuRM1N4",
  orderItems: "tbl37Iprxz4OLL65P",
  inventory: "tblwFgl4et1TOgtNn",
  movements: "tblASifwHdArNKQP2",
});

const F = Object.freeze({
  orderId: "flde515MCoEq08YzU",
  orderStatus: "fldnCO3H5CpJoYmWD",
  paymentStatus: "fldUpDeLdO6D9OUcd",
  orderNotes: "fldWG0u77XQ5W0wpT",
  itemOrder: "fldSVk92UcASTOuOK",
  itemProduct: "fld40mHWKpBthoO9T",
  itemQuantity: "fldJkKWMZiVQ3g1a6",
  itemStatus: "flddJVVBAjVoyqcpY",
  inventoryProduct: "fldVc73xUxjrfSjHY",
  inventorySupplier: "fldrrEXHJeTPKXs0l",
  inventoryReceived: "fldR9ELxn6t06P7Lb",
  inventoryRemaining: "fldvjoRuM1mrR6ItQ",
  inventoryUnitCost: "fldP5LaRWkq0qBJVQ",
  inventoryRemainingValue: "fldmFhct2jQmIT3gL",
  inventoryLow: "fldYtzXtBvK3HuqQa",
  inventoryStatus: "fldZW2m1Xq8q0ZH9Z",
  movementType: "fld95ubumrh0GQCgj",
  movementReference: "flddxY12JXrNsAUpE",
});

export async function runMmdShopTransactionSmoke(env = {}) {
  const store = makeSyntheticStore();
  const shopEnv = {
    AIRTABLE_BASE_ID: "appSyntheticSmoke",
    AIRTABLE_TOKEN: "synthetic-only",
    MMD_SHOP_RESERVATION_TTL_MINUTES: "45",
    MMD_SHOP_AIRTABLE_FETCH: store.fetch,
  };

  const initialQty = store.batch.fields[F.inventoryRemaining];

  const expireReservation = await reserveMmdShopStock(shopEnv, {
    order_id: "MMD-SMOKE-EXPIRE",
    order_record_id: store.orders[0].id,
    order_notes: store.orders[0].fields[F.orderNotes],
    items: [{ product_id: store.productId, quantity: 1, stock_status: "tracked" }],
  });
  const forcedExpired = {
    ...expireReservation,
    expires_at: new Date(Date.now() - 60_000).toISOString(),
  };
  store.orders[0].fields[F.orderNotes] = writeMmdShopReservation(
    store.orders[0].fields[F.orderNotes],
    forcedExpired,
  );

  const expirySweep = await expireMmdShopReservations(shopEnv);
  const expiredState = readMmdShopReservation(store.orders[0].fields[F.orderNotes]);

  const payReservation = await reserveMmdShopStock(shopEnv, {
    order_id: "MMD-SMOKE-PAY",
    order_record_id: store.orders[1].id,
    order_notes: store.orders[1].fields[F.orderNotes],
    items: [{ product_id: store.productId, quantity: 2, stock_status: "tracked" }],
  });
  const claimed = await claimMmdShopReservationForPayment(shopEnv, payReservation, "SMOKE-PAYMENT-REVIEW");
  const claimedPastExpiry = {
    ...claimed.reservation,
    expires_at: new Date(Date.now() - 60_000).toISOString(),
  };
  store.orders[1].fields[F.orderNotes] = writeMmdShopReservation(
    store.orders[1].fields[F.orderNotes],
    claimedPastExpiry,
  );

  const raceSweep = await expireMmdShopReservations(shopEnv);
  const raceState = readMmdShopReservation(store.orders[1].fields[F.orderNotes]);
  const committed = await commitMmdShopReservation(shopEnv, raceState);
  const committedAgain = await commitMmdShopReservation(shopEnv, committed.reservation);

  const shipping = normalizeMmdShopShipping({
    delivery_method: "delivery",
    recipient_name: "Synthetic Customer",
    phone: "0812345678",
    address_line1: "Synthetic smoke address",
    district: "Synthetic District",
    province: "Bangkok",
    postal_code: "10110",
  });

  let fulfillment = createMmdShopFulfillment({ shipping });
  for (const state of ["confirmed", "preparing", "ready"]) {
    fulfillment = transitionMmdShopFulfillment(fulfillment, { state });
  }
  fulfillment = transitionMmdShopFulfillment(fulfillment, {
    state: "shipped",
    courier: "MMD Smoke Courier",
    tracking_number: "SMOKE-TRACK-260919",
  });
  const shippedProjection = publicMmdShopFulfillment(fulfillment);
  fulfillment = transitionMmdShopFulfillment(fulfillment, { state: "delivered" });
  fulfillment = transitionMmdShopFulfillment(fulfillment, { state: "completed" });
  fulfillment = transitionMmdShopFulfillment(fulfillment, { state: "return_requested", return_note: "synthetic return" });
  fulfillment = transitionMmdShopFulfillment(fulfillment, { state: "return_received" });
  fulfillment = transitionMmdShopFulfillment(fulfillment, { state: "refund_pending" });
  fulfillment = transitionMmdShopFulfillment(fulfillment, {
    state: "refunded",
    refund_reference: "SMOKE-RF-260919",
    refund_method: "PromptPay",
    refund_amount_thb: 2500,
  });
  store.orders[1].fields[F.orderNotes] = writeMmdShopFulfillment(
    store.orders[1].fields[F.orderNotes],
    fulfillment,
  );
  const fulfillmentRoundTrip = readMmdShopFulfillment(store.orders[1].fields[F.orderNotes]);

  const lineDryRun = await callShippingDryRun(env, {
    line_user_id: "U" + "1".repeat(32),
    order_id: "MMD-SMOKE-PAY",
    customer_name: "Synthetic Customer",
    courier: shippedProjection.courier,
    tracking_number: shippedProjection.tracking_number,
  });

  const movementTypes = store.movements.map((record) => String(record.fields?.[F.movementType] || "").toLowerCase());
  const outCount = movementTypes.filter((value) => value === "out").length;
  const releaseCount = movementTypes.filter((value) => value === "release").length;
  const reserveCount = movementTypes.filter((value) => value === "reserve").length;

  const finalReservation = readMmdShopReservation(store.orders[1].fields[F.orderNotes]);
  const finalProjection = {
    reservation: publicMmdShopReservation(finalReservation),
    fulfillment: publicMmdShopFulfillment(fulfillmentRoundTrip),
  };

  const checks = {
    reserve_created: expireReservation.state === "reserved" && payReservation.state === "reserved",
    expiry_releases_stock: expirySweep.expired === 1
      && expiredState?.state === "expired"
      && store.orders[0].fields[F.orderStatus] === "cancelled"
      && store.items[0].fields[F.itemStatus] === "cancelled"
      && releaseCount === 1,
    payment_review_blocks_expiry: raceSweep.expired === 0
      && raceState?.state === "payment_review"
      && store.orders[1].fields[F.orderStatus] === "draft",
    inventory_out_once: committed.reservation.state === "committed"
      && committedAgain.idempotent === true
      && outCount === 1
      && store.batch.fields[F.inventoryRemaining] === initialQty - 2,
    reservation_movement_sequence: reserveCount === 2 && releaseCount === 1 && outCount === 1,
    fulfillment_delivery_lifecycle: shippedProjection.state === "shipped"
      && shippedProjection.tracking_number === "SMOKE-TRACK-260919"
      && Boolean(fulfillmentRoundTrip?.delivered_at)
      && Boolean(fulfillmentRoundTrip?.completed_at),
    aftercare_refund_projection: fulfillmentRoundTrip?.state === "refunded"
      && fulfillmentRoundTrip?.refund_reference === "SMOKE-RF-260919"
      && fulfillmentRoundTrip?.refund_amount_thb === 2500
      && publicMmdShopFulfillment(fulfillmentRoundTrip).state === "refunded"
      && publicMmdShopFulfillment(fulfillmentRoundTrip).refund_amount_thb === 2500
      && !Object.prototype.hasOwnProperty.call(publicMmdShopFulfillment(fulfillmentRoundTrip), "refund_reference"),
    line_shipping_dry_run: lineDryRun.status === 200
      && lineDryRun.body?.ok === true
      && lineDryRun.body?.status === "dry_run"
      && lineDryRun.body?.checks?.contains_order === true
      && lineDryRun.body?.checks?.contains_tracking === true
      && lineDryRun.body?.checks?.contains_my_mmd_orders === true
      && lineDryRun.body?.line_push_sent === false,
    customer_projection_contract: finalProjection.reservation.state === "committed"
      && finalProjection.fulfillment.state === "refunded"
      && finalProjection.fulfillment.refund_amount_thb === 2500
      && finalProjection.fulfillment.address === null
      && !Object.prototype.hasOwnProperty.call(finalProjection.fulfillment, "refund_reference"),
  };

  return {
    ok: Object.values(checks).every(Boolean),
    state: Object.values(checks).every(Boolean) ? "pass" : "failed",
    checks,
    observations: {
      expiry_sweep_expired: expirySweep.expired,
      race_sweep_expired: raceSweep.expired,
      final_inventory_remaining: store.batch.fields[F.inventoryRemaining],
      reserve_movements: reserveCount,
      release_movements: releaseCount,
      out_movements: outCount,
      reservation_state: finalProjection.reservation.state,
      fulfillment_state: finalProjection.fulfillment.state,
      refund_amount_thb: finalProjection.fulfillment.refund_amount_thb,
      line_dry_run_status: lineDryRun.body?.status || null,
    },
    guardrails: {
      synthetic_store_only: true,
      production_airtable_called: false,
      business_truth_mutated: false,
      customer_created: false,
      payment_intent_created: false,
      line_push_sent: false,
    },
  };
}

async function callShippingDryRun(env, payload) {
  if (!env.MEMBER_DASHBOARD_CHAT_WORKER?.fetch) {
    return { status: 0, body: { ok: false, error: "line_runtime_binding_missing" } };
  }
  try {
    const response = await env.MEMBER_DASHBOARD_CHAT_WORKER.fetch(
      new Request("https://member-dashboard-chat-worker.local/__internal/line/shop-shipping-notify/smoke", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-mmd-internal-call": "true",
          "x-mmd-service-binding": "hype-shop-production-smoke",
        },
        body: JSON.stringify(payload),
      }),
    );
    return { status: response.status, body: await response.json().catch(() => null) };
  } catch {
    return { status: 0, body: { ok: false, error: "line_runtime_binding_unavailable" } };
  }
}

function makeSyntheticStore() {
  const productId = "recProduct1234567";
  const batch = {
    id: "recBatch123456789",
    fields: {
      [F.inventoryProduct]: [productId],
      [F.inventorySupplier]: [],
      [F.inventoryReceived]: "2026-09-01",
      [F.inventoryRemaining]: 5,
      [F.inventoryUnitCost]: 100,
      [F.inventoryRemainingValue]: 500,
      [F.inventoryLow]: "OK",
      [F.inventoryStatus]: "active",
    },
  };
  const orders = [
    {
      id: "recOrder123456789",
      fields: {
        [F.orderId]: "MMD-SMOKE-EXPIRE",
        [F.orderStatus]: "draft",
        [F.paymentStatus]: "pending",
        [F.orderNotes]: "schema=mmd_shop_order_v1",
      },
    },
    {
      id: "recOrder223456789",
      fields: {
        [F.orderId]: "MMD-SMOKE-PAY",
        [F.orderStatus]: "draft",
        [F.paymentStatus]: "pending",
        [F.orderNotes]: "schema=mmd_shop_order_v1",
      },
    },
  ];
  const items = [
    {
      id: "recItem1234567890",
      fields: {
        [F.itemOrder]: [orders[0].id],
        [F.itemProduct]: [productId],
        [F.itemQuantity]: 1,
        [F.itemStatus]: "draft",
      },
    },
    {
      id: "recItem2234567890",
      fields: {
        [F.itemOrder]: [orders[1].id],
        [F.itemProduct]: [productId],
        [F.itemQuantity]: 2,
        [F.itemStatus]: "draft",
      },
    },
  ];
  const movements = [];

  const fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const parts = url.pathname.split("/").filter(Boolean);
    const table = parts[2];
    const recordId = parts[3] || "";
    const method = String(init.method || "GET").toUpperCase();

    if (table === TABLES.orders) {
      if (method === "GET" && !recordId) return Response.json({ records: clone(orders) });
      if (method === "GET") {
        const record = orders.find((item) => item.id === recordId);
        return record ? Response.json(clone(record)) : new Response("not found", { status: 404 });
      }
      if (method === "PATCH") return patch(orders, recordId, init);
    }

    if (table === TABLES.orderItems) {
      if (method === "GET" && !recordId) return Response.json({ records: clone(items) });
      if (method === "GET") {
        const record = items.find((item) => item.id === recordId);
        return record ? Response.json(clone(record)) : new Response("not found", { status: 404 });
      }
      if (method === "PATCH") return patch(items, recordId, init);
    }

    if (table === TABLES.inventory) {
      if (method === "GET" && !recordId) return Response.json({ records: [clone(batch)] });
      if (method === "GET" && recordId === batch.id) return Response.json(clone(batch));
      if (method === "PATCH" && recordId === batch.id) {
        const body = JSON.parse(String(init.body || "{}"));
        Object.assign(batch.fields, body.fields || {});
        return Response.json(clone(batch));
      }
    }

    if (table === TABLES.movements) {
      if (method === "GET") return Response.json({ records: clone(movements) });
      if (method === "POST") {
        const body = JSON.parse(String(init.body || "{}"));
        const record = {
          id: "recMove" + String(movements.length + 1).padStart(10, "0"),
          fields: body.records?.[0]?.fields || {},
        };
        movements.push(record);
        return Response.json({ records: [clone(record)] });
      }
    }

    return new Response("not found", { status: 404 });
  };

  return { productId, batch, orders, items, movements, fetch };
}

function patch(records, recordId, init) {
  const record = records.find((item) => item.id === recordId);
  if (!record) return new Response("not found", { status: 404 });
  const body = JSON.parse(String(init.body || "{}"));
  Object.assign(record.fields, body.fields || {});
  return Response.json(clone(record));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const AIRTABLE_API = "https://api.airtable.com/v0";

const TABLES = Object.freeze({
  orders: "tblr8lbi2wMuRM1N4",
  orderItems: "tbl37Iprxz4OLL65P",
  inventory: "tblwFgl4et1TOgtNn",
  movements: "tblASifwHdArNKQP2",
});

const ORDER_FIELDS = Object.freeze({
  orderId: "flde515MCoEq08YzU",
  orderStatus: "fldnCO3H5CpJoYmWD",
  paymentStatus: "fldUpDeLdO6D9OUcd",
  notes: "fldWG0u77XQ5W0wpT",
});

const ITEM_FIELDS = Object.freeze({
  order: "fldSVk92UcASTOuOK",
  product: "fld40mHWKpBthoO9T",
  quantity: "fldJkKWMZiVQ3g1a6",
  status: "flddJVVBAjVoyqcpY",
});

const INVENTORY_FIELDS = Object.freeze({
  product: "fldVc73xUxjrfSjHY",
  supplier: "fldrrEXHJeTPKXs0l",
  receivedDate: "fldR9ELxn6t06P7Lb",
  remaining: "fldvjoRuM1mrR6ItQ",
  unitCost: "fldP5LaRWkq0qBJVQ",
  remainingValue: "fldmFhct2jQmIT3gL",
  low: "fldYtzXtBvK3HuqQa",
  status: "fldZW2m1Xq8q0ZH9Z",
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

export const MMD_SHOP_RESERVATION_SCHEMA = "mmd_shop_reservation_v1";
export const MMD_SHOP_RESERVATION_PREFIX = MMD_SHOP_RESERVATION_SCHEMA + "=";

export function createReservationMetadata(orderId, allocations, ttlMinutes = 45) {
  const createdAt = new Date();
  const ttl = Math.max(5, Math.min(240, Number(ttlMinutes) || 45));
  const expiresAt = new Date(createdAt.getTime() + ttl * 60_000);
  return sanitizeReservation({
    schema: MMD_SHOP_RESERVATION_SCHEMA,
    order_id: orderId,
    state: "reserved",
    created_at: createdAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    committed_at: "",
    released_at: "",
    release_reason: "",
    order_record_id: "",
    payment_review_started_at: "",
    payment_review_key: "",
    payment_expiry_synced_at: "",
    allocations,
  });
}

export function readMmdShopReservation(notes) {
  const line = String(notes || "").split(/\r?\n/).find((entry) => entry.startsWith(MMD_SHOP_RESERVATION_PREFIX));
  if (!line) return null;
  try {
    return sanitizeReservation(JSON.parse(decodeURIComponent(line.slice(MMD_SHOP_RESERVATION_PREFIX.length))));
  } catch {
    return null;
  }
}

export function writeMmdShopReservation(notes, reservation) {
  const cleanReservation = sanitizeReservation(reservation || {});
  const line = MMD_SHOP_RESERVATION_PREFIX + encodeURIComponent(JSON.stringify(cleanReservation));
  const lines = String(notes || "").split(/\r?\n/).filter((entry) => !entry.startsWith(MMD_SHOP_RESERVATION_PREFIX));
  lines.push(line);
  return lines.filter(Boolean).join("\n").slice(0, 16000);
}

export function publicMmdShopReservation(value) {
  const r = sanitizeReservation(value || {});
  return {
    schema: MMD_SHOP_RESERVATION_SCHEMA,
    state: r.state,
    created_at: r.created_at || null,
    expires_at: r.expires_at || null,
    committed_at: r.committed_at || null,
    released_at: r.released_at || null,
    release_reason: r.release_reason || null,
  };
}

export async function reserveMmdShopStock(env, input) {
  const orderId = clean(input?.order_id, 180);
  const items = Array.isArray(input?.items) ? input.items : [];
  if (!orderId) throw reservationError(400, "order_id_required");
  if (!items.length) throw reservationError(400, "reservation_items_required");

  const batches = await listRecords(env, table(env, "inventory"), Object.values(INVENTORY_FIELDS));
  const allocations = [];

  for (const item of items) {
    const productId = validRecordId(item?.product_id);
    const qty = integer(item?.quantity);
    if (!productId || !(qty > 0)) throw reservationError(400, "invalid_reservation_item");
    if (item?.stock_status !== "tracked") continue;

    const candidates = batches
      .filter((record) => {
        const fields = record.fields || {};
        return code(fields[INVENTORY_FIELDS.status]) === "active"
          && linkedIds(fields[INVENTORY_FIELDS.product]).includes(productId)
          && number(fields[INVENTORY_FIELDS.remaining]) > 0;
      })
      .sort((a, b) => {
        const ad = String(a.fields?.[INVENTORY_FIELDS.receivedDate] || "");
        const bd = String(b.fields?.[INVENTORY_FIELDS.receivedDate] || "");
        return ad.localeCompare(bd) || a.id.localeCompare(b.id);
      });

    let need = qty;
    for (const batch of candidates) {
      if (need <= 0) break;
      const fields = batch.fields || {};
      const current = Math.max(0, number(fields[INVENTORY_FIELDS.remaining]));
      if (current <= 0) continue;
      const take = Math.min(need, current);
      const next = current - take;
      const unitCost = Math.max(0, number(fields[INVENTORY_FIELDS.unitCost]));
      const supplierIds = linkedIds(fields[INVENTORY_FIELDS.supplier]);

      await patchRecord(env, table(env, "inventory"), batch.id, {
        [INVENTORY_FIELDS.remaining]: next,
        [INVENTORY_FIELDS.remainingValue]: roundMoney(next * unitCost),
        [INVENTORY_FIELDS.low]: lowFlag(next),
        [INVENTORY_FIELDS.status]: next <= 0 ? "depleted" : "active",
      });

      try {
        await createMovement(env, {
          batch_id: batch.id,
          product_id: productId,
          supplier_ids: supplierIds,
          movement_type: "reserve",
          quantity: take,
          unit_cost: unitCost,
          reference_id: reservationRef(orderId, "reserve", batch.id, productId),
          note: `MMD Shop reservation; order=${orderId}; before=${current}; after=${next}`,
        });
      } catch (error) {
        await patchRecord(env, table(env, "inventory"), batch.id, {
          [INVENTORY_FIELDS.remaining]: current,
          [INVENTORY_FIELDS.remainingValue]: roundMoney(current * unitCost),
          [INVENTORY_FIELDS.low]: lowFlag(current),
          [INVENTORY_FIELDS.status]: current <= 0 ? "depleted" : "active",
        }).catch(() => null);
        throw error;
      }

      allocations.push({
        product_id: productId,
        batch_id: batch.id,
        supplier_ids: supplierIds,
        quantity: take,
        unit_cost_thb: unitCost,
      });

      fields[INVENTORY_FIELDS.remaining] = next;
      need -= take;
    }

    if (need > 0) {
      await bestEffortReleaseAllocations(env, orderId, allocations, "reservation_rollback");
      throw reservationError(409, "insufficient_stock_during_reservation");
    }
  }

  const orderRecordId = validRecordId(input?.order_record_id);
  const reservation = sanitizeReservation({
    ...createReservationMetadata(
      orderId,
      allocations,
      Number(env.MMD_SHOP_RESERVATION_TTL_MINUTES || 45),
    ),
    order_record_id: orderRecordId,
  });
  if (orderRecordId) {
    try {
      const baseNotes = clean(input?.order_notes, 14000);
      await patchRecord(env, table(env, "orders"), orderRecordId, {
        [ORDER_FIELDS.notes]: writeMmdShopReservation(baseNotes, reservation),
      });
    } catch (error) {
      await bestEffortReleaseAllocations(env, orderId, allocations, "reservation_metadata_write_failed");
      throw error;
    }
  }

  return reservation;
}

export async function claimMmdShopReservationForPayment(env, reservation, reviewKey = "") {
  const current = sanitizeReservation(reservation || {});
  const key = clean(reviewKey, 500) || current.order_id;
  if (current.state === "committed") return { reservation: current, idempotent: true };
  if (["released", "expired"].includes(current.state)) throw reservationError(409, `reservation_not_claimable:${current.state}`);

  if (current.state === "payment_review") {
    if (current.payment_review_key && current.payment_review_key !== key) {
      throw reservationError(409, "reservation_payment_review_in_progress");
    }
    return { reservation: current, idempotent: true };
  }

  if (current.state !== "reserved") throw reservationError(409, `reservation_not_claimable:${current.state}`);
  const expires = Date.parse(current.expires_at || "");
  if (Number.isFinite(expires) && expires <= Date.now()) throw reservationError(409, "reservation_expired");

  const next = sanitizeReservation({
    ...current,
    state: "payment_review",
    payment_review_started_at: new Date().toISOString(),
    payment_review_key: key,
  });
  await persistReservationMetadata(env, next);
  return { reservation: next, idempotent: false };
}

export async function abortMmdShopPaymentClaim(env, reservation, reviewKey = "", reason = "payment_review_failed") {
  const current = sanitizeReservation(reservation || {});
  const key = clean(reviewKey, 500) || current.order_id;
  if (current.state !== "payment_review") return { reservation: current, idempotent: true };
  if (current.payment_review_key && current.payment_review_key !== key) {
    throw reservationError(409, "reservation_payment_review_key_mismatch");
  }

  const expires = Date.parse(current.expires_at || "");
  if (Number.isFinite(expires) && expires <= Date.now()) {
    const releasable = sanitizeReservation({ ...current, state: "reserved" });
    const released = await releaseMmdShopReservation(env, releasable, "expired");
    await persistReservationMetadata(env, released.reservation);
    return released;
  }

  const next = sanitizeReservation({
    ...current,
    state: "reserved",
    payment_review_started_at: "",
    payment_review_key: "",
    release_reason: clean(reason, 180),
  });
  await persistReservationMetadata(env, next);
  return { reservation: next, idempotent: false };
}

export async function commitMmdShopReservation(env, reservation) {
  const current = sanitizeReservation(reservation || {});
  if (current.state === "committed") return { reservation: current, idempotent: true };
  if (!["reserved", "payment_review"].includes(current.state)) throw reservationError(409, `reservation_not_committable:${current.state}`);

  for (const allocation of current.allocations) {
    const ref = reservationRef(current.order_id, "out", allocation.batch_id, allocation.product_id);
    if (!(await movementExists(env, ref, "out"))) {
      await createMovement(env, {
        batch_id: allocation.batch_id,
        product_id: allocation.product_id,
        supplier_ids: allocation.supplier_ids,
        movement_type: "out",
        quantity: allocation.quantity,
        unit_cost: allocation.unit_cost_thb,
        reference_id: ref,
        note: `MMD Shop sale committed from reservation; order=${current.order_id}`,
      });
    }
  }

  const next = sanitizeReservation({
    ...current,
    state: "committed",
    committed_at: new Date().toISOString(),
  });
  await persistReservationMetadata(env, next);
  return { reservation: next, idempotent: false };
}

export async function releaseMmdShopReservation(env, reservation, reason = "released") {
  const current = sanitizeReservation(reservation || {});
  if (["released", "expired"].includes(current.state)) return { reservation: current, idempotent: true };
  if (current.state === "committed") throw reservationError(409, "committed_reservation_cannot_release");
  if (current.state !== "reserved") throw reservationError(409, `reservation_not_releasable:${current.state}`);

  for (const allocation of current.allocations) {
    const ref = reservationRef(current.order_id, "release", allocation.batch_id, allocation.product_id);
    if (await movementExists(env, ref, "release")) continue;

    const batch = await getRecord(env, table(env, "inventory"), allocation.batch_id, Object.values(INVENTORY_FIELDS));
    if (!batch?.id) throw reservationError(404, "reservation_batch_not_found");

    const fields = batch.fields || {};
    const currentQty = Math.max(0, number(fields[INVENTORY_FIELDS.remaining]));
    const nextQty = currentQty + allocation.quantity;
    const unitCost = Math.max(0, number(fields[INVENTORY_FIELDS.unitCost] ?? allocation.unit_cost_thb));

    await patchRecord(env, table(env, "inventory"), batch.id, {
      [INVENTORY_FIELDS.remaining]: nextQty,
      [INVENTORY_FIELDS.remainingValue]: roundMoney(nextQty * unitCost),
      [INVENTORY_FIELDS.low]: lowFlag(nextQty),
      [INVENTORY_FIELDS.status]: "active",
    });

    await createMovement(env, {
      batch_id: batch.id,
      product_id: allocation.product_id,
      supplier_ids: allocation.supplier_ids,
      movement_type: "release",
      quantity: allocation.quantity,
      unit_cost: unitCost,
      reference_id: ref,
      note: `MMD Shop reservation released; order=${current.order_id}; reason=${clean(reason, 180)}`,
    });
  }

  const expired = reason === "expired";
  const next = sanitizeReservation({
    ...current,
    state: expired ? "expired" : "released",
    released_at: new Date().toISOString(),
    release_reason: clean(reason, 180),
  });
  return { reservation: next, idempotent: false };
}

export async function expireMmdShopReservations(env) {
  const orders = await listRecords(env, table(env, "orders"), Object.values(ORDER_FIELDS));
  const now = Date.now();
  const results = [];
  const paymentExpiryOrderIds = new Set();

  for (const order of orders) {
    const fields = order.fields || {};
    const paymentStatus = code(fields[ORDER_FIELDS.paymentStatus]);
    const orderStatus = code(fields[ORDER_FIELDS.orderStatus]);
    const reservation = readMmdShopReservation(fields[ORDER_FIELDS.notes]);

    if (paymentStatus === "paid" || orderStatus === "fulfilled") continue;
    if (!reservation) continue;

    if (reservation.state === "expired") {
      if (!reservation.payment_expiry_synced_at) {
        const id = clean(fields[ORDER_FIELDS.orderId], 180);
        if (id) paymentExpiryOrderIds.add(id);
      }
      continue;
    }

    if (orderStatus === "cancelled") continue;
    if (reservation.state !== "reserved") continue;

    const expires = Date.parse(reservation.expires_at || "");
    if (!Number.isFinite(expires) || expires > now) continue;

    try {
      const released = await releaseMmdShopReservation(env, reservation, "expired");
      const nextNotes = writeMmdShopReservation(
        appendText(fields[ORDER_FIELDS.notes], `reservation_expired_at=${new Date().toISOString()}`),
        released.reservation,
      );
      await patchRecord(env, table(env, "orders"), order.id, {
        [ORDER_FIELDS.orderStatus]: "cancelled",
        [ORDER_FIELDS.notes]: nextNotes,
      });

      const items = await listRecords(env, table(env, "orderItems"), Object.values(ITEM_FIELDS));
      const linked = items.filter((item) => linkedIds(item.fields?.[ITEM_FIELDS.order]).includes(order.id));
      await Promise.all(linked.map((item) =>
        patchRecord(env, table(env, "orderItems"), item.id, { [ITEM_FIELDS.status]: "cancelled" })
      ));

      const orderId = clean(fields[ORDER_FIELDS.orderId], 180);
      if (orderId) paymentExpiryOrderIds.add(orderId);
      results.push({ order_id: orderId, released: true });
    } catch (error) {
      results.push({ order_id: clean(fields[ORDER_FIELDS.orderId], 180), released: false, error: clean(error?.message, 180) });
    }
  }

  return {
    ok: results.every((item) => item.released !== false),
    checked: orders.length,
    expired: results.filter((item) => item.released).length,
    expired_order_ids: results.filter((item) => item.released).map((item) => item.order_id).filter(Boolean),
    payment_expiry_order_ids: [...paymentExpiryOrderIds],
    failures: results.filter((item) => item.released === false),
  };
}

async function persistReservationMetadata(env, reservation) {
  const value = sanitizeReservation(reservation || {});
  let orderRecordId = validRecordId(value.order_record_id);

  if (!orderRecordId && value.order_id) {
    const orders = await listRecords(env, table(env, "orders"), Object.values(ORDER_FIELDS));
    const found = orders.find((record) => clean(record.fields?.[ORDER_FIELDS.orderId], 180) === value.order_id);
    orderRecordId = found?.id || "";
  }
  if (!orderRecordId) throw reservationError(404, "reservation_order_not_found");

  const order = await getRecord(env, table(env, "orders"), orderRecordId, Object.values(ORDER_FIELDS));
  if (!order?.id) throw reservationError(404, "reservation_order_not_found");

  await patchRecord(env, table(env, "orders"), orderRecordId, {
    [ORDER_FIELDS.notes]: writeMmdShopReservation(order.fields?.[ORDER_FIELDS.notes], value),
  });
  return value;
}

async function bestEffortReleaseAllocations(env, orderId, allocations, reason) {
  const reservation = createReservationMetadata(orderId, allocations, 5);
  try {
    await releaseMmdShopReservation(env, reservation, reason);
  } catch {
    // Checkout caller will fail closed. Inventory review can reconcile from reserve movements.
  }
}

async function movementExists(env, referenceId, movementType) {
  const records = await listRecords(env, table(env, "movements"), [
    MOVEMENT_FIELDS.type,
    MOVEMENT_FIELDS.referenceId,
  ]);
  return records.some((record) =>
    code(record.fields?.[MOVEMENT_FIELDS.type]) === code(movementType)
    && clean(record.fields?.[MOVEMENT_FIELDS.referenceId], 220) === referenceId
  );
}

async function createMovement(env, input) {
  return createRecord(env, table(env, "movements"), {
    [MOVEMENT_FIELDS.name]: `${input.movement_type.toUpperCase()} · ${input.quantity} · ${input.reference_id}`,
    [MOVEMENT_FIELDS.batch]: [input.batch_id],
    [MOVEMENT_FIELDS.product]: [input.product_id],
    [MOVEMENT_FIELDS.supplier]: Array.isArray(input.supplier_ids) ? input.supplier_ids : [],
    [MOVEMENT_FIELDS.type]: input.movement_type,
    [MOVEMENT_FIELDS.quantity]: Math.abs(Number(input.quantity || 0)),
    [MOVEMENT_FIELDS.unitCost]: Math.max(0, Number(input.unit_cost || 0)),
    [MOVEMENT_FIELDS.date]: bangkokDate(),
    [MOVEMENT_FIELDS.referenceType]: "order_item",
    [MOVEMENT_FIELDS.referenceId]: input.reference_id,
    [MOVEMENT_FIELDS.note]: clean(input.note, 1600),
  });
}

function reservationRef(orderId, action, batchId, productId) {
  return `${clean(orderId, 120)}:${clean(action, 40)}:${clean(batchId, 80)}:${clean(productId, 80)}`;
}

function sanitizeReservation(value) {
  const state = ["reserved", "payment_review", "committed", "released", "expired"].includes(code(value?.state))
    ? code(value.state)
    : "reserved";
  return {
    schema: MMD_SHOP_RESERVATION_SCHEMA,
    order_id: clean(value?.order_id, 180),
    state,
    created_at: clean(value?.created_at, 80),
    expires_at: clean(value?.expires_at, 80),
    committed_at: clean(value?.committed_at, 80),
    released_at: clean(value?.released_at, 80),
    release_reason: clean(value?.release_reason, 180),
    order_record_id: validRecordId(value?.order_record_id),
    payment_review_started_at: clean(value?.payment_review_started_at, 80),
    payment_review_key: clean(value?.payment_review_key, 500),
    payment_expiry_synced_at: clean(value?.payment_expiry_synced_at, 80),
    allocations: Array.isArray(value?.allocations)
      ? value.allocations.map((item) => ({
          product_id: validRecordId(item?.product_id),
          batch_id: validRecordId(item?.batch_id),
          supplier_ids: linkedIds(item?.supplier_ids),
          quantity: Math.max(0, integer(item?.quantity)),
          unit_cost_thb: Math.max(0, number(item?.unit_cost_thb)),
        })).filter((item) => item.product_id && item.batch_id && item.quantity > 0)
      : [],
  };
}

function lowFlag(qty) {
  if (qty <= 5) return "Low";
  return "OK";
}

async function listRecords(env, tableId, fieldIds) {
  const out = [];
  let offset = "";
  let pages = 0;
  do {
    const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(baseId(env))}/${encodeURIComponent(tableId)}`);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("returnFieldsByFieldId", "true");
    for (const fieldId of fieldIds) url.searchParams.append("fields[]", fieldId);
    if (offset) url.searchParams.set("offset", offset);
    const response = await airtableFetch(env, url.toString(), {
      headers: { authorization: `Bearer ${token(env)}`, accept: "application/json" },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw reservationError(response.status >= 500 ? 502 : response.status, `airtable_list_${response.status}`);
    out.push(...(Array.isArray(data.records) ? data.records : []));
    offset = clean(data.offset, 300);
    pages += 1;
  } while (offset && pages < 20);
  return out;
}

async function getRecord(env, tableId, recordId, fieldIds) {
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(baseId(env))}/${encodeURIComponent(tableId)}/${encodeURIComponent(recordId)}`);
  url.searchParams.set("returnFieldsByFieldId", "true");
  for (const fieldId of fieldIds) url.searchParams.append("fields[]", fieldId);
  const response = await airtableFetch(env, url.toString(), {
    headers: { authorization: `Bearer ${token(env)}`, accept: "application/json" },
  });
  if (response.status === 404) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw reservationError(response.status >= 500 ? 502 : response.status, `airtable_get_${response.status}`);
  return data;
}

async function createRecord(env, tableId, fields) {
  const response = await airtableFetch(env, `${AIRTABLE_API}/${encodeURIComponent(baseId(env))}/${encodeURIComponent(tableId)}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token(env)}`, "content-type": "application/json" },
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw reservationError(response.status >= 500 ? 502 : response.status, `airtable_create_${response.status}`);
  const record = data.records?.[0];
  if (!record?.id) throw reservationError(502, "airtable_create_missing_record");
  return record;
}

async function patchRecord(env, tableId, recordId, fields) {
  const response = await airtableFetch(env, `${AIRTABLE_API}/${encodeURIComponent(baseId(env))}/${encodeURIComponent(tableId)}/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${token(env)}`, "content-type": "application/json" },
    body: JSON.stringify({ fields, typecast: true }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw reservationError(response.status >= 500 ? 502 : response.status, `airtable_patch_${response.status}`);
  return data;
}

async function airtableFetch(env, input, init = {}) {
  const injected = env?.MMD_SHOP_AIRTABLE_FETCH;
  if (typeof injected === "function") return injected(input, init);
  return fetch(input, init);
}

function table(env, kind) {
  const map = {
    orders: env.MMD_SHOP_ORDERS_TABLE_ID || TABLES.orders,
    orderItems: env.MMD_SHOP_ORDER_ITEMS_TABLE_ID || TABLES.orderItems,
    inventory: env.MMD_SHOP_INVENTORY_BATCHES_TABLE_ID || TABLES.inventory,
    movements: env.MMD_SHOP_STOCK_MOVEMENTS_TABLE_ID || TABLES.movements,
  };
  return clean(map[kind], 120);
}

function token(env) {
  const value = clean(env.AIRTABLE_TOKEN || env.AIRTABLE_API_KEY, 5000);
  if (!value) throw reservationError(503, "airtable_not_configured");
  return value;
}

function baseId(env) {
  const value = clean(env.AIRTABLE_BASE_ID, 120);
  if (!value) throw reservationError(503, "airtable_not_configured");
  return value;
}

function validRecordId(value) {
  const id = clean(value, 80);
  return /^rec[A-Za-z0-9]{14}$/.test(id) ? id : "";
}

function linkedIds(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => clean(typeof item === "string" ? item : item?.id, 80)).filter((id) => /^rec[A-Za-z0-9]{14}$/.test(id));
}

function code(value) {
  return clean(value, 120).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function integer(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : 0;
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function appendText(current, extra) {
  return [clean(current, 14000), clean(extra, 1800)].filter(Boolean).join("\n").slice(0, 16000);
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

function clean(value, max = 5000) {
  return String(value == null ? "" : value).trim().slice(0, max).replace(/[\u0000-\u001F\u007F]/g, " ");
}

function reservationError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

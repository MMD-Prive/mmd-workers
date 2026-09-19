export const MMD_SHOP_FULFILLMENT_SCHEMA = "mmd_shop_fulfillment_v1";
export const MMD_SHOP_FULFILLMENT_PREFIX = MMD_SHOP_FULFILLMENT_SCHEMA + "=";

const STATES = new Set([
  "awaiting_payment",
  "confirmed",
  "preparing",
  "ready",
  "shipped",
  "completed",
  "cancelled",
]);

const DELIVERY_METHODS = new Set(["delivery", "pickup"]);

export function normalizeMmdShopShipping(raw = {}, fallback = {}) {
  const deliveryMethod = code(raw.delivery_method || raw.method || "delivery");
  if (!DELIVERY_METHODS.has(deliveryMethod)) throw fulfillmentError(400, "invalid_delivery_method");

  const recipientName = clean(raw.recipient_name || fallback.name, 180);
  const phone = normalizePhone(raw.phone || fallback.phone);
  const addressLine1 = clean(raw.address_line1 || raw.address || raw.shipping_address, 500);
  const addressLine2 = clean(raw.address_line2, 300);
  const subdistrict = clean(raw.subdistrict || raw.sub_district, 180);
  const district = clean(raw.district, 180);
  const province = clean(raw.province, 180);
  const postalCode = clean(raw.postal_code || raw.postcode || raw.zip, 20).replace(/[^0-9]/g, "").slice(0, 5);
  const deliveryNote = clean(raw.delivery_note || raw.note, 800);

  if (!recipientName) throw fulfillmentError(400, "shipping_recipient_required");
  if (phone.length < 8) throw fulfillmentError(400, "shipping_phone_required");

  if (deliveryMethod === "delivery") {
    if (addressLine1.length < 5) throw fulfillmentError(400, "shipping_address_required");
    if (!district) throw fulfillmentError(400, "shipping_district_required");
    if (!province) throw fulfillmentError(400, "shipping_province_required");
    if (postalCode.length !== 5) throw fulfillmentError(400, "shipping_postal_code_required");
  }

  return {
    delivery_method: deliveryMethod,
    recipient_name: recipientName,
    phone,
    address_line1: deliveryMethod === "delivery" ? addressLine1 : "",
    address_line2: deliveryMethod === "delivery" ? addressLine2 : "",
    subdistrict: deliveryMethod === "delivery" ? subdistrict : "",
    district: deliveryMethod === "delivery" ? district : "",
    province: deliveryMethod === "delivery" ? province : "",
    postal_code: deliveryMethod === "delivery" ? postalCode : "",
    delivery_note: deliveryNote,
  };
}

export function createMmdShopFulfillment(input = {}) {
  const now = isoNow();
  const shipping = input.shipping && typeof input.shipping === "object" ? input.shipping : {};
  return sanitizeFulfillment({
    schema: MMD_SHOP_FULFILLMENT_SCHEMA,
    state: "awaiting_payment",
    ...shipping,
    courier: "",
    tracking_number: "",
    fulfillment_note: "",
    created_at: now,
    updated_at: now,
    confirmed_at: "",
    preparing_at: "",
    ready_at: "",
    shipped_at: "",
    completed_at: "",
    cancelled_at: "",
  });
}

export function readMmdShopFulfillment(notes) {
  const lines = String(notes || "").split(/\r?\n/);
  const line = lines.find((value) => value.startsWith(MMD_SHOP_FULFILLMENT_PREFIX));
  if (!line) return null;

  const encoded = line.slice(MMD_SHOP_FULFILLMENT_PREFIX.length);
  if (!encoded) return null;

  try {
    const decoded = decodeURIComponent(encoded);
    const parsed = JSON.parse(decoded);
    return sanitizeFulfillment(parsed);
  } catch {
    return null;
  }
}

export function writeMmdShopFulfillment(notes, fulfillment) {
  const value = sanitizeFulfillment({
    ...(fulfillment && typeof fulfillment === "object" ? fulfillment : {}),
    schema: MMD_SHOP_FULFILLMENT_SCHEMA,
    updated_at: isoNow(),
  });
  const encoded = encodeURIComponent(JSON.stringify(value));
  const line = MMD_SHOP_FULFILLMENT_PREFIX + encoded;
  const source = String(notes || "");
  const lines = source.split(/\r?\n/).filter((entry) => !entry.startsWith(MMD_SHOP_FULFILLMENT_PREFIX));
  lines.push(line);
  return lines.filter(Boolean).join("\n").slice(0, 12000);
}

export function transitionMmdShopFulfillment(current, patch = {}) {
  const now = isoNow();
  const base = sanitizeFulfillment(current || {});
  const state = code(patch.state || base.state || "awaiting_payment");
  if (!STATES.has(state)) throw fulfillmentError(400, "invalid_fulfillment_state");

  const next = sanitizeFulfillment({
    ...base,
    ...pickFulfillmentPatch(patch),
    schema: MMD_SHOP_FULFILLMENT_SCHEMA,
    state,
    updated_at: now,
  });

  if (state === "confirmed" && !next.confirmed_at) next.confirmed_at = now;
  if (state === "preparing" && !next.preparing_at) next.preparing_at = now;
  if (state === "ready" && !next.ready_at) next.ready_at = now;
  if (state === "shipped" && !next.shipped_at) next.shipped_at = now;
  if (state === "completed" && !next.completed_at) next.completed_at = now;
  if (state === "cancelled" && !next.cancelled_at) next.cancelled_at = now;

  return next;
}

export function publicMmdShopFulfillment(value, options = {}) {
  const item = sanitizeFulfillment(value || {});
  const includeAddress = options.includeAddress === true;
  const maskPhoneValue = options.maskPhone !== false;
  return {
    schema: MMD_SHOP_FULFILLMENT_SCHEMA,
    state: item.state || "awaiting_payment",
    delivery_method: item.delivery_method || null,
    recipient_name: item.recipient_name || null,
    phone: item.phone ? (maskPhoneValue ? maskPhone(item.phone) : item.phone) : null,
    address: includeAddress && item.delivery_method === "delivery"
      ? {
          address_line1: item.address_line1 || null,
          address_line2: item.address_line2 || null,
          subdistrict: item.subdistrict || null,
          district: item.district || null,
          province: item.province || null,
          postal_code: item.postal_code || null,
        }
      : null,
    delivery_note: includeAddress ? item.delivery_note || null : null,
    courier: item.courier || null,
    tracking_number: item.tracking_number || null,
    fulfillment_note: item.fulfillment_note || null,
    updated_at: item.updated_at || null,
    confirmed_at: item.confirmed_at || null,
    preparing_at: item.preparing_at || null,
    ready_at: item.ready_at || null,
    shipped_at: item.shipped_at || null,
    completed_at: item.completed_at || null,
    cancelled_at: item.cancelled_at || null,
  };
}

export function fulfillmentStateFromOrder(orderStatus, paymentStatus, currentState) {
  const order = code(orderStatus);
  const payment = code(paymentStatus);
  const current = code(currentState);
  if (order === "fulfilled") return "completed";
  if (order === "cancelled") return "cancelled";
  if (current && STATES.has(current) && current !== "awaiting_payment") return current;
  if (payment === "paid" && order === "confirmed") return "confirmed";
  return "awaiting_payment";
}

function pickFulfillmentPatch(patch) {
  const out = {};
  for (const key of [
    "delivery_method",
    "recipient_name",
    "phone",
    "address_line1",
    "address_line2",
    "subdistrict",
    "district",
    "province",
    "postal_code",
    "delivery_note",
    "courier",
    "tracking_number",
    "fulfillment_note",
  ]) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) out[key] = patch[key];
  }
  return out;
}

function sanitizeFulfillment(value) {
  const state = code(value?.state);
  const deliveryMethod = code(value?.delivery_method);
  return {
    schema: MMD_SHOP_FULFILLMENT_SCHEMA,
    state: STATES.has(state) ? state : "awaiting_payment",
    delivery_method: DELIVERY_METHODS.has(deliveryMethod) ? deliveryMethod : "",
    recipient_name: clean(value?.recipient_name, 180),
    phone: normalizePhone(value?.phone),
    address_line1: clean(value?.address_line1, 500),
    address_line2: clean(value?.address_line2, 300),
    subdistrict: clean(value?.subdistrict, 180),
    district: clean(value?.district, 180),
    province: clean(value?.province, 180),
    postal_code: clean(value?.postal_code, 20).replace(/[^0-9]/g, "").slice(0, 5),
    delivery_note: clean(value?.delivery_note, 800),
    courier: clean(value?.courier, 180),
    tracking_number: clean(value?.tracking_number, 220),
    fulfillment_note: clean(value?.fulfillment_note, 1200),
    created_at: clean(value?.created_at, 80),
    updated_at: clean(value?.updated_at, 80),
    confirmed_at: clean(value?.confirmed_at, 80),
    preparing_at: clean(value?.preparing_at, 80),
    ready_at: clean(value?.ready_at, 80),
    shipped_at: clean(value?.shipped_at, 80),
    completed_at: clean(value?.completed_at, 80),
    cancelled_at: clean(value?.cancelled_at, 80),
  };
}

function maskPhone(value) {
  const phone = normalizePhone(value);
  if (phone.length <= 4) return phone;
  return phone.slice(0, 3) + "•••" + phone.slice(-3);
}

function normalizePhone(value) {
  return String(value ?? "")
    .replace(/[^0-9+]/g, "")
    .replace(/^\+66/, "0")
    .replace(/\+/g, "")
    .slice(0, 20);
}

function code(value) {
  return clean(value, 120).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function clean(value, max = 5000) {
  return String(value == null ? "" : value).trim().slice(0, max).replace(/[\u0000-\u001F\u007F]/g, " ");
}

function isoNow() {
  return new Date().toISOString();
}

function fulfillmentError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

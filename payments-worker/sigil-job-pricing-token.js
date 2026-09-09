const PRICING_MARKER = "[SIGIL Pricing v1]";

function clean(value, max = 12000) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function integer(value) {
  return Math.max(0, Math.round(number(value)));
}

export function normalizeSigilPricing(value = {}) {
  const full = integer(value.full_price_thb);
  const discount = Math.min(full, integer(value.discount_thb));
  const net = integer(value.net_price_thb || Math.max(0, full - discount));
  const discountMode = ["none", "percent", "amount"].includes(clean(value.discount_mode).toLowerCase())
    ? clean(value.discount_mode).toLowerCase()
    : discount > 0 ? "amount" : "none";
  const discountPercent = discountMode === "percent"
    ? Math.min(20, Math.max(3, integer(value.discount_percent)))
    : 0;
  const depositPercent = Math.min(100, integer(value.deposit_percent));
  const depositBasis = integer(value.deposit_basis_thb || full);
  const depositDue = integer(value.deposit_due_thb);
  const depositReceived = integer(value.deposit_received_thb);
  const balance = integer(value.balance_thb);
  if (!full || net > full || depositBasis !== full) return null;
  return {
    full_price_thb: full,
    discount_mode: discountMode,
    discount_percent: discountPercent,
    discount_thb: discount,
    net_price_thb: net,
  const discountMode = clean(value.discount_mode).toLowerCase() || "none";
  const discountPercent = integer(value.discount_percent);
  const discount = integer(value.discount_thb);
  const net = integer(value.net_price_thb);
  const paymentType = clean(value.payment_type).toLowerCase() || "deposit";
  const depositPercent = integer(value.deposit_percent);
  const depositBasis = integer(value.deposit_basis_thb);
  const depositDue = integer(value.deposit_due_thb);
  const depositReceived = integer(value.deposit_received_thb);
  const balance = integer(value.balance_thb);

  if (!full || !net || net !== full - discount) return null;
  if (!["none", "percent", "amount"].includes(discountMode)) return null;
  if (!["deposit", "full"].includes(paymentType)) return null;
  if (discountMode === "none" && (discount !== 0 || discountPercent !== 0)) return null;
  if (discountMode === "percent") {
    if (discountPercent < 3 || discountPercent > 20) return null;
    if (discount !== Math.round(full * discountPercent / 100)) return null;
  }
  if (discountMode === "amount" && (discount <= 0 || discount >= full || discountPercent !== 0)) return null;
  if (depositBasis !== full) return null;

  if (paymentType === "full") {
    if (depositDue !== 0 || depositReceived !== net || balance !== 0) return null;
  } else {
    if (depositPercent <= 0 || depositPercent > 100) return null;
    if (depositDue !== Math.round(full * depositPercent / 100)) return null;
    if (balance !== Math.max(0, net - depositReceived)) return null;
  }

  return {
    full_price_thb: full,
    discount_mode: discountMode,
    discount_percent: discountMode === "percent" ? discountPercent : 0,
    discount_thb: discount,
    net_price_thb: net,
    payment_type: paymentType,
    deposit_basis_thb: full,
    deposit_percent: depositPercent,
    deposit_due_thb: depositDue,
    deposit_received_thb: depositReceived,
    balance_thb: balance,
  };
}

export function pricingFromNote(note) {
  const text = clean(note);
  const index = text.lastIndexOf(PRICING_MARKER);
  if (index < 0) return null;
  const tail = text.slice(index + PRICING_MARKER.length).trim().split("\n")[0];
  try { return normalizeSigilPricing(JSON.parse(tail)); } catch { return null; }
}

function base64UrlEncode(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(input) {
  const value = clean(input).replace(/-/g, "+").replace(/_/g, "/");
  const padded = value.padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256Hex(message, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToHex(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

async function sha256Hex(value) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function decodeClaims(token) {
  const [payloadPart] = clean(token).split(".");
  if (!payloadPart) return null;
  try { return JSON.parse(base64UrlDecode(payloadPart)); } catch { return null; }
}

async function signClaims(claims, env) {
  const secret = clean(env.PAYMENT_CONFIRMATION_SIGNING_SECRET || env.CONFIRM_KEY, 5000);
  if (!secret) throw new Error("missing_payment_confirmation_signing_secret");
  const encoded = base64UrlEncode(JSON.stringify(claims));
  return `${encoded}.${await hmacSha256Hex(encoded, secret)}`;
}

async function storeToken(token, claims, env) {
  if (!env.PAY_SESSIONS_KV) throw new Error("missing_pay_sessions_kv");
  const now = Math.floor(Date.now() / 1000);
  const ttl = Math.max(60, Math.min(60 * 60 * 24 * 30, Number(claims.exp || 0) - now));
  const hash = await sha256Hex(token);
  await env.PAY_SESSIONS_KV.put(`sig:${hash.slice(0, 24)}`, JSON.stringify(claims), { expirationTtl: ttl });
}

function rebuild(response, data) {
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function attachSigilPricingToCustomerToken(requestBody, response, env) {
  if (!response?.ok) return response;
  const pricing = pricingFromNote(requestBody?.note || requestBody?.notes);
  if (!pricing) return response;
  const data = await response.clone().json().catch(() => null);
  if (!data?.customer_t || !data?.customer_confirmation_url) return response;
  const baseClaims = decodeClaims(data.customer_t);
  if (!baseClaims || baseClaims.role !== "customer" || baseClaims.kind !== "customer_confirm") return response;
  const claims = { ...baseClaims, pricing };
  const token = await signClaims(claims, env);
  await storeToken(token, claims, env);
  const url = new URL(data.customer_confirmation_url);
  url.searchParams.set("t", token);
  return rebuild(response, {
    ...data,
    customer_t: token,
    customer_confirmation_url: url.toString(),
    pricing_contract: "sigil_pricing_v1",
  });
}

export async function exposeVerifiedSigilPricing(requestBody, response) {
  if (!response?.ok || clean(requestBody?.expected_role).toLowerCase() !== "customer") return response;
  const claims = decodeClaims(requestBody?.t || requestBody?.token);
  const pricing = normalizeSigilPricing(claims?.pricing || {});
  if (!pricing) return response;
  const data = await response.clone().json().catch(() => null);
  if (!data?.ok) return response;
  return rebuild(response, {
    ...data,
    pricing,
    claims: { ...(data.claims || {}), pricing },
  });
}

export { PRICING_MARKER };

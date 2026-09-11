export const PAYMENT_INSTRUCTIONS_PATH = "/v1/confirm/payment-instructions";
const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_TABLE = "tblTPC2yV1P3CwbgU";

export function isPaymentInstructionsRequest(path, method) {
  const normalized = String(path || "/").replace(/\/{2,}/g, "/").replace(/\/+$/g, "") || "/";
  const verb = String(method || "GET").toUpperCase();
  return normalized === PAYMENT_INSTRUCTIONS_PATH && (verb === "POST" || verb === "OPTIONS");
}

export async function handlePaymentInstructions(request, env = {}, fetchConfirmationDetails) {
  if (typeof fetchConfirmationDetails !== "function") {
    return json({ ok: false, error: "confirmation_details_dependency_missing", authority: "payments-worker" }, 503);
  }

  if (request.method.toUpperCase() === "OPTIONS") {
    const target = new URL("/v1/confirm/details", request.url);
    return fetchConfirmationDetails(new Request(target, { method: "OPTIONS", headers: request.headers }));
  }

  if (request.method.toUpperCase() !== "POST") {
    return json({ ok: false, error: "method_not_allowed", authority: "payments-worker" }, 405);
  }

  const body = await request.json().catch(() => null);
  const token = text(body?.t || body?.token, 12000);
  const detailsRequest = new Request(new URL("/v1/confirm/details", request.url), {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({ t: token, expected_role: "customer" }),
  });
  const detailsResponse = await fetchConfirmationDetails(detailsRequest);
  const responseHeaders = customerHeaders(detailsResponse.headers);
  const detailsText = await detailsResponse.text();
  let details = null;
  try { details = detailsText ? JSON.parse(detailsText) : null; } catch {}

  if (!detailsResponse.ok || !details?.ok) {
    return new Response(detailsText || JSON.stringify({ ok: false, error: "confirmation_details_failed" }), {
      status: detailsResponse.status || 502,
      headers: responseHeaders,
    });
  }

  const payment = details.payment && typeof details.payment === "object" ? details.payment : null;
  if (!payment) {
    return responseJson({ ok: false, error: "payment_state_unavailable", authority: "payments-worker" }, 409, responseHeaders);
  }

  const base = {
    ok: true,
    authority: "payments-worker",
    schema: "mmd_payment_instructions_v1",
    session_id: text(details.session_id, 200) || null,
    payment_ref: text(details.payment_ref, 200) || null,
    stage: text(payment.stage, 80) || null,
    amount_due_thb: numberOrNull(payment.amount_due_thb),
    currency: "THB",
  };

  if (payment.verified) {
    return responseJson({ ...base, available: false, reason: "payment_verified" }, 200, responseHeaders);
  }
  if (payment.proof_received) {
    return responseJson({ ...base, available: false, reason: "proof_received_waiting_verification" }, 200, responseHeaders);
  }
  if (!(base.amount_due_thb > 0)) {
    return responseJson({ ...base, available: false, reason: "no_amount_due" }, 200, responseHeaders);
  }

  const config = await readActiveInstructions(env);
  if (!config) {
    return responseJson({ ok: false, error: "payment_instructions_unavailable", authority: "payments-worker" }, 503, responseHeaders);
  }

  const methods = new Set(array(config.Methods).map((value) => text(value, 80).toLowerCase()));
  const promptPayRef = digits(config["PromptPay Ref"]);
  const accountNumber = text(config["Account Number"], 120);
  const paypalUrl = safeHttpsUrl(config["PayPal URL"]);
  const qrUrl = methods.has("promptpay") && promptPayRef && text(config["QR Strategy"], 80) === "dynamic_amount"
    ? dynamicPromptPayQr(promptPayRef, base.amount_due_thb)
    : null;

  const instructions = {
    promptpay: methods.has("promptpay") && promptPayRef ? {
      enabled: true,
      display_ref: formatPromptPay(promptPayRef),
      qr_url: qrUrl,
    } : { enabled: false },
    bank_transfer: methods.has("bank_transfer") && accountNumber ? {
      enabled: true,
      provider: text(config["Bank Provider"], 80) || null,
      bank_name_th: text(config["Bank Name TH"], 160) || null,
      bank_name_en: text(config["Bank Name EN"], 160) || null,
      account_name_th: text(config["Account Name TH"], 160) || null,
      account_name_en: text(config["Account Name EN"], 160) || null,
      account_number: accountNumber,
    } : { enabled: false },
    paypal_card: methods.has("paypal_card") && paypalUrl ? {
      enabled: true,
      url: paypalUrl,
    } : { enabled: false },
  };

  if (!instructions.promptpay.enabled && !instructions.bank_transfer.enabled && !instructions.paypal_card.enabled) {
    return responseJson({ ok: false, error: "payment_instructions_unavailable", authority: "payments-worker" }, 503, responseHeaders);
  }

  return responseJson({ ...base, available: true, instructions }, 200, responseHeaders);
}

async function readActiveInstructions(env) {
  const baseId = text(env.AIRTABLE_BASE_ID, 120);
  const table = text(env.AIRTABLE_TABLE_PAYMENT_INSTRUCTIONS, 120) || DEFAULT_TABLE;
  const apiKey = text(env.AIRTABLE_API_KEY, 500);
  if (!baseId || !table || !apiKey) return null;

  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}`);
  url.searchParams.set("maxRecords", "50");
  url.searchParams.set("filterByFormula", "{Status}='active'");
  const http = env.AIRTABLE_HTTP && typeof env.AIRTABLE_HTTP.fetch === "function" ? env.AIRTABLE_HTTP : globalThis;
  const response = await http.fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  const now = Date.now();
  const candidates = array(payload?.records)
    .map((record) => record?.fields || {})
    .filter((fields) => text(fields.Status, 40).toLowerCase() === "active")
    .filter((fields) => {
      const effective = Date.parse(text(fields["Effective From"], 120));
      return !Number.isFinite(effective) || effective <= now;
    })
    .sort((a, b) => (numberOrNull(b.Version) || 0) - (numberOrNull(a.Version) || 0));
  return candidates[0] || null;
}

function dynamicPromptPayQr(ref, amount) {
  const numeric = numberOrNull(amount);
  if (!ref || !(numeric > 0)) return null;
  return `https://promptpay.io/${encodeURIComponent(ref)}/${numeric.toFixed(2)}.png`;
}

function formatPromptPay(value) {
  const raw = digits(value);
  if (raw.length === 10) return `${raw.slice(0, 3)}-${raw.slice(3, 6)}-${raw.slice(6)}`;
  return raw;
}

function customerHeaders(input) {
  const headers = new Headers(input || {});
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store, private");
  headers.set("x-mmd-payment-authority", "payments-worker");
  return headers;
}

function responseJson(payload, status, headers) {
  return new Response(JSON.stringify(payload), { status, headers: customerHeaders(headers) });
}

function json(payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private",
      "x-mmd-payment-authority": "payments-worker",
    },
  });
}

function safeHttpsUrl(value) {
  const raw = text(value, 2000);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch { return null; }
}

function digits(value) { return String(value ?? "").replace(/\D+/g, ""); }
function array(value) { return Array.isArray(value) ? value : []; }
function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function text(value, max = 1000) { return String(value ?? "").trim().slice(0, max); }

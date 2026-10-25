export const PAYMENT_INSTRUCTIONS_PATH = "/v1/confirm/payment-instructions";
const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_TABLE = "tblTPC2yV1P3CwbgU";
const DEFAULT_CARD_FEE_PERCENT = 4;
const PRIMARY_INSTRUCTION_ID = "mmd_payment_primary_v1";
const SHOP_INSTRUCTION_ID = "mmd_shop_himai_v1";
// Per-item-type destinations. Each falls back to the primary profile while its own
// Airtable row does not exist yet, so deploying this code never removes a working destination.
const JOB_INSTRUCTION_ID = "mmd_job_v1";
const MEMBERSHIP_INSTRUCTION_ID = "mmd_membership_v1";
const BLACKCARD_POLICY_TABLE = "tbl1SaC6KrcmsdTcc";
const BLACKCARD_PACKAGES_TABLE = "tblg2z8dENx75yHka";
const BLACKCARD_POLICY_KEY_FIELD = "fldD1KRV5tv8I01lh";
const BLACKCARD_POLICY_STATUS_FIELD = "fldenQShc6H828u7K";
const BLACKCARD_POLICY_PRICE_FIELD = "fldwQS9RrBw144y2u";
const BLACKCARD_POLICY_DURATION_FIELD = "fld3skEnauU7GbR3b";
const PACKAGE_CODE_FIELD = "fldWtPdGpHi6YSwP2";
const PACKAGE_PRICE_FIELD = "fldoEWuXFM1NEOpTq";
const PACKAGE_DURATION_FIELD = "fld5yB479gSiwUUMW";
const PACKAGE_TIER_FIELD = "fldbyKiFwelihSsjn";
const PACKAGE_ACTIVE_FIELD = "fldavrXJPlMxjCY65";
const JOB_STAGES = new Set(["deposit", "มัดจำ", "balance", "remaining", "remainder", "คงเหลือ", "final", "finalpayment", "full", "fullpayment", "payinfull", "extension", "adjustment", "pointstopup", "topup", "tmibstory"]);
const MEMBERSHIP_STAGES = new Set(["membership", "renewal", "renew", "blackcard", "redcard", "elite", "mmdmember"]);
const PUBLIC_MEMBERSHIP_SESSION_PREFIX = "publicmem_";

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

  const instructionIds = paymentInstructionIds(details, payment);
  const base = {
    ok: true,
    authority: "payments-worker",
    schema: "mmd_payment_instructions_v1",
    session_id: text(details.session_id, 200) || null,
    payment_ref: text(details.payment_ref, 200) || null,
    stage: text(payment.stage, 80) || null,
    amount_due_thb: numberOrNull(payment.amount_due_thb),
    currency: "THB",
    instruction_profile: instructionIds[0],
  };

  const blackCard = isBlackCardStage(details.package_code) || isBlackCardStage(payment.stage) || isBlackCardStage(details.payment_type) || isBlackCardStage(details.payment_stage);
  if (blackCard) {
    const membershipToken = ["membership", "blackcard"].includes(text(details.payment_type, 80).toLowerCase().replace(/[\s_-]+/g, ""));
    if (!isBlackCardStage(details.package_code) || !membershipToken) return responseJson({ ...base, available: false, reason: "blackcard_subject_mismatch" }, 200, responseHeaders);
    try {
      if (!await blackCardSaleIsActive(env)) return responseJson({ ...base, available: false, reason: "blackcard_not_activated_for_sale" }, 200, responseHeaders);
      if (base.amount_due_thb !== 35000) return responseJson({ ...base, available: false, reason: "blackcard_amount_mismatch" }, 200, responseHeaders);
    } catch {
      return responseJson({ ok: false, error: "blackcard_policy_unavailable", authority: "payments-worker" }, 503, responseHeaders);
    }
  }

  if (payment.accepting_payment === false) {
    return responseJson({ ...base, available: false, reason: "payment_not_accepting" }, 200, responseHeaders);
  }
  if (payment.verified) {
    return responseJson({ ...base, available: false, reason: "payment_verified" }, 200, responseHeaders);
  }
  if (payment.proof_received) {
    return responseJson({ ...base, available: false, reason: "proof_received_waiting_verification" }, 200, responseHeaders);
  }
  if (!(base.amount_due_thb > 0)) {
    return responseJson({ ...base, available: false, reason: "no_amount_due" }, 200, responseHeaders);
  }

  let config = null;
  let instructionId = instructionIds[instructionIds.length - 1];
  for (const candidateId of instructionIds) {
    const found = await readActiveInstructions(env, candidateId);
    if (found) {
      config = found;
      instructionId = candidateId;
      break;
    }
  }
  if (!config) {
    return responseJson({ ok: false, error: "payment_instructions_unavailable", authority: "payments-worker" }, 503, responseHeaders);
  }

  const methods = new Set(array(config.Methods).map((value) => text(value, 80).toLowerCase()));
  const promptPayRef = digits(config["PromptPay Ref"]);
  const accountNumber = text(config["Account Number"], 120);
  const paypalUrl = safeHttpsUrl(config["PayPal URL"]);
  const configuredCardFeePercent = numberOrNull(config["Card Fee Percent"]);
  const cardFeePercent = configuredCardFeePercent !== null && configuredCardFeePercent >= 0
    ? configuredCardFeePercent
    : DEFAULT_CARD_FEE_PERCENT;
  const cardFeeThb = roundMoney(base.amount_due_thb * cardFeePercent / 100);
  const cardAmountDueThb = roundMoney(base.amount_due_thb + cardFeeThb);
  const qrStrategy = text(config["QR Strategy"], 80);
  const configuredQrUrl = safeHttpsUrl(config["QR Image URL"]);
  const qrUrl = methods.has("promptpay")
    ? (qrStrategy === "dynamic_amount" && promptPayRef
      ? dynamicPromptPayQr(promptPayRef, base.amount_due_thb)
      : qrStrategy === "static_url"
        ? configuredQrUrl
        : null)
    : null;

  const instructions = {
    promptpay: methods.has("promptpay") && qrUrl ? {
      enabled: true,
      display_ref: promptPayRef ? formatPromptPay(promptPayRef) : null,
      qr_url: qrUrl,
      qr_strategy: qrStrategy || null,
      amount_entry: qrStrategy === "static_url" ? "customer_manual" : "embedded",
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
      fee_percent: cardFeePercent,
      fee_thb: cardFeeThb,
      service_amount_thb: base.amount_due_thb,
      amount_due_thb: cardAmountDueThb,
      fee_scope: "processing_fee_only",
    } : { enabled: false },
  };

  if (!instructions.promptpay.enabled && !instructions.bank_transfer.enabled && !instructions.paypal_card.enabled) {
    return responseJson({ ok: false, error: "payment_instructions_unavailable", authority: "payments-worker" }, 503, responseHeaders);
  }

  return responseJson({ ...base, instruction_profile: instructionId, available: true, instructions }, 200, responseHeaders);
}

async function blackCardSaleIsActive(env) {
  if (env.BLACKCARD_SALES_ENABLED !== "true") return false;
  const policy = await readCatalogRows(env, BLACKCARD_POLICY_TABLE, BLACKCARD_POLICY_KEY_FIELD, "black_card_35000_3y_final", [BLACKCARD_POLICY_KEY_FIELD, BLACKCARD_POLICY_STATUS_FIELD, BLACKCARD_POLICY_PRICE_FIELD, BLACKCARD_POLICY_DURATION_FIELD]);
  const packages = await readCatalogRows(env, BLACKCARD_PACKAGES_TABLE, PACKAGE_CODE_FIELD, "blackcard", [PACKAGE_CODE_FIELD, PACKAGE_PRICE_FIELD, PACKAGE_DURATION_FIELD, PACKAGE_TIER_FIELD, PACKAGE_ACTIVE_FIELD]);
  if (policy.length !== 1 || packages.length !== 1) return false;
  const p = policy[0], product = packages[0];
  return p[BLACKCARD_POLICY_STATUS_FIELD] === "Owner Confirmed / Activated" &&
    Number(p[BLACKCARD_POLICY_PRICE_FIELD]) === 35000 && Number(p[BLACKCARD_POLICY_DURATION_FIELD]) === 3 &&
    product[PACKAGE_CODE_FIELD] === "blackcard" && product[PACKAGE_ACTIVE_FIELD] === true &&
    Number(product[PACKAGE_PRICE_FIELD]) === 35000 && Number(product[PACKAGE_DURATION_FIELD]) === 1095 &&
    String(product[PACKAGE_TIER_FIELD]?.name || product[PACKAGE_TIER_FIELD] || "").toLowerCase() === "blackcard";
}

async function readCatalogRows(env, tableId, keyFieldId, key, fieldIds) {
  const baseId = text(env.AIRTABLE_BASE_ID, 120), apiKey = text(env.AIRTABLE_API_KEY, 500);
  if (!baseId || !apiKey) return [];
  const table = tableId === BLACKCARD_PACKAGES_TABLE ? text(env.AIRTABLE_TABLE_PACKAGES, 120) || tableId : tableId;
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}`);
  url.searchParams.set("maxRecords", "2");
  url.searchParams.set("returnFieldsByFieldId", "true");
  url.searchParams.set("filterByFormula", `{${keyFieldId}}='${formulaValue(key)}'`);
  for (const fieldId of fieldIds) url.searchParams.append("fields[]", fieldId);
  const http = env.AIRTABLE_HTTP && typeof env.AIRTABLE_HTTP.fetch === "function" ? env.AIRTABLE_HTTP : globalThis;
  const response = await http.fetch(url.toString(), { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } });
  if (!response.ok) return [];
  const payload = await response.json().catch(() => null);
  return array(payload?.records).map(record => record?.fields || {});
}

function isBlackCardStage(value) {
  return text(value, 80).toLowerCase().replace(/[\s_-]+/g, "") === "blackcard";
}

// Ordered candidates: the first profile with an active, effective Airtable row wins.
// Unknown item types stay on the primary profile only (never guessed into job/membership).
function paymentInstructionIds(details = {}, payment = {}) {
  if (isBlackCardStage(details.package_code) || isBlackCardStage(details.payment_type) || isBlackCardStage(details.payment_stage) || isBlackCardStage(payment.stage)) return [MEMBERSHIP_INSTRUCTION_ID, PRIMARY_INSTRUCTION_ID];
  const raw = text(payment.stage || details.payment_type || details.payment_stage, 80).toLowerCase();
  if (raw === "shop" || details.shop_order) return [SHOP_INSTRUCTION_ID];
  const stage = raw.replace(/[\s_-]+/g, "");
  if (JOB_STAGES.has(stage)) return [JOB_INSTRUCTION_ID, PRIMARY_INSTRUCTION_ID];
  if (MEMBERSHIP_STAGES.has(stage) || text(details.session_id, 200).startsWith(PUBLIC_MEMBERSHIP_SESSION_PREFIX)) {
    return [MEMBERSHIP_INSTRUCTION_ID, PRIMARY_INSTRUCTION_ID];
  }
  return [PRIMARY_INSTRUCTION_ID];
}

async function readActiveInstructions(env, instructionId) {
  const baseId = text(env.AIRTABLE_BASE_ID, 120);
  const table = text(env.AIRTABLE_TABLE_PAYMENT_INSTRUCTIONS, 120) || DEFAULT_TABLE;
  const apiKey = text(env.AIRTABLE_API_KEY, 500);
  if (!baseId || !table || !apiKey) return null;

  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}`);
  url.searchParams.set("maxRecords", "50");
  url.searchParams.set("filterByFormula", `AND({Status}='active',{Instruction ID}='${formulaValue(instructionId)}')`);
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
    .filter((fields) => text(fields["Instruction ID"], 160) === instructionId)
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

function formulaValue(value) {
  return text(value, 240).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
function digits(value) { return String(value ?? "").replace(/\D+/g, ""); }
function array(value) { return Array.isArray(value) ? value : []; }
function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function roundMoney(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : null;
}
function text(value, max = 1000) { return String(value ?? "").trim().slice(0, max); }

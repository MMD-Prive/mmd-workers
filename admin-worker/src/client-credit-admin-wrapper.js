import delegatedWorker from "./admin-dashboard-model-link-wrapper.js";
import { readCredentialBoundAdminActor } from "./credential-bound-admin-session.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_BASE_ID = "appsV1ILPRfIjkaYg";
const CLIENT_CREDITS_TABLE = "tblKvhl2zZm9yYBmT";
const PAYMENTS_TABLE = "tblWGGJJOx5eBvBZJ";
const SESSIONS_TABLE = "tblC98mKWbzmPuNzX";

const CREDIT = {
  id: "fldemjkV42O2DcJgr",
  client: "fldil7TkCWHRfIHVp",
  member: "fldCRRiOScpWGsjDx",
  sourcePayment: "fldEkhpVkuMkXqMqU",
  sourceSession: "fldBQQZtj3BivZubi",
  originalAmount: "fldTEoh5lolc9xn9y",
  availableAmount: "fldzuorjny0B7Iwgu",
  appliedAmount: "fldXAxkgJHutksHgQ",
  status: "fld54sOB3tz6VlULs",
  reason: "fldFcWDDSOdloOR3n",
  appliedToSession: "fldKcF81477e1kTx6",
  refundable: "fldYF2FjG09N48A5J",
  customerNote: "fld4tqzxvVjYXeJzl",
  internalNote: "fldlKSch7FgQgA3D6",
  createdBy: "fld9DqtuwtzVgceqg",
  createdAt: "fldTU9owdHDUNqRPE",
  usedAt: "fldUNnrsgp6GaHITz",
  refundedAt: "fldBHxkSvPB1K2dns",
  idempotencyKey: "fldNEUXDTeMy9KE14",
  clientRecordId: "fldJHQ2mpj96G5VW8",
  paymentRef: "fldsjcpz8nM8NgHHt",
  sessionId: "fldwsZHbxqu5Bk7E8",
  memberId: "fldg5DGXEkKk8I4Vu",
};

const PAYMENT = {
  ref: "fldOO6SY49iDw8VBZ",
  amount: "fldvCSwrUW8OMAooS",
  status: "fldEJ1hmm7KwWuI6q",
  client: "fldcrLuJijj7xr0y8",
  notes: "fldjsZIKoJPawlb2u",
  amountReceived: "fld5rTIVEF1DXwfe2",
  verification: "fldJ7a0Ube9F0bmRy",
  sessionId: "fld2wdhBvc8xrV6y5",
  paymentStage: "fldrr9g8ZZjqAbdKQ",
  depositStatus: "fldD0mQWTfdmyBAeT",
  officialVerifiedAt: "fldPNK6qgxCSdaJRM",
  officialVerificationRef: "flddkMKy5H8RbFwt9",
  officialVerifiedBy: "fld208LCmQZB5llNo",
  officialMatchReason: "fldXH56EPA122RoGa",
};

const SESSION = {
  client: "fld6P6if0vDZCeV0C",
  status: "fldmwuvOaiCFdzzRa",
  sessionId: "fldLTq2kZbyRv22IA",
  paymentRef: "fldojgjSQLaO0uQLX",
  paymentStatus: "fldTY5lE6m0kQf72n",
  memberId: "fldHsczyzr8axfwUC",
};

const ALLOWED_REASONS = new Set([
  "client_cancel_gt_48h",
  "client_cancel_no_penalty",
  "admin_carry_forward",
  "refund_conversion",
  "goodwill",
  "correction",
  "other",
]);

const APPROVED_VERIFICATION = new Set(["verified", "official_verified", "approved", "confirmed"]);

function clean(value, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function normalized(value) {
  return clean(value, 120).toLowerCase().replace(/[\s-]+/g, "_");
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function recId(value) {
  const id = clean(value, 40);
  return /^rec[A-Za-z0-9]{14}$/.test(id) ? id : "";
}

function json(payload, status = 200, headers = {}) {
  return Response.json(payload, {
    status,
    headers: {
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function sameOrigin(request) {
  const origin = clean(request.headers.get("origin"), 240);
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function airtableConfig(env = {}) {
  return {
    token: clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 500),
    baseId: clean(env.AIRTABLE_BASE_ID, 40) || DEFAULT_BASE_ID,
    creditsTable: clean(env.AIRTABLE_CLIENT_CREDITS_TABLE_ID, 40) || CLIENT_CREDITS_TABLE,
  };
}

async function airtableRequest(env, tableId, path = "", init = {}) {
  const config = airtableConfig(env);
  if (!config.token || !config.baseId) {
    throw new Error("AIRTABLE_CONFIG_MISSING");
  }
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(config.baseId)}/${encodeURIComponent(tableId)}${path}`);
  url.searchParams.set("returnFieldsByFieldId", "true");
  if (init.query) {
    for (const [key, value] of Object.entries(init.query)) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }
  }
  const response = await fetch(url.toString(), {
    method: init.method || "GET",
    headers: {
      authorization: `Bearer ${config.token}`,
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`AIRTABLE_${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function readRecord(env, tableId, recordId) {
  return airtableRequest(env, tableId, `/${encodeURIComponent(recordId)}`);
}

function formulaString(value) {
  return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

async function listCredits(env, { clientId = "", paymentRef = "", idempotencyKey = "" } = {}) {
  const config = airtableConfig(env);
  const clauses = [];
  if (clientId) clauses.push(`{client_record_id}=${formulaString(clientId)}`);
  if (paymentRef) clauses.push(`{source_payment_ref}=${formulaString(paymentRef)}`);
  if (idempotencyKey) clauses.push(`{idempotency_key}=${formulaString(idempotencyKey)}`);
  const filterByFormula = clauses.length > 1 ? `AND(${clauses.join(",")})` : clauses[0] || "";
  const payload = await airtableRequest(env, config.creditsTable, "", {
    query: {
      pageSize: 100,
      filterByFormula,
    },
  });
  return Array.isArray(payload?.records) ? payload.records : [];
}

function field(record, id) {
  return record?.fields?.[id];
}

function recordLinks(record, id) {
  const value = field(record, id);
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function officialPaymentState(payment) {
  const verification = normalized(field(payment, PAYMENT.verification));
  const depositStatus = normalized(field(payment, PAYMENT.depositStatus));
  const officialAt = clean(field(payment, PAYMENT.officialVerifiedAt), 120);
  const officialRef = clean(field(payment, PAYMENT.officialVerificationRef), 240);
  const officialBy = clean(field(payment, PAYMENT.officialVerifiedBy), 160);
  const officialEvidence = Boolean(officialAt || officialRef || officialBy);
  const approved = APPROVED_VERIFICATION.has(verification)
    || (depositStatus === "official_verified" && officialEvidence);
  const received = numberValue(field(payment, PAYMENT.amountReceived));
  return {
    approved: approved && officialEvidence,
    verification,
    depositStatus,
    officialEvidence,
    receivedThb: received === null ? 0 : Math.max(0, received),
  };
}

function safeCredit(record) {
  return {
    recordId: record?.id || null,
    creditId: clean(field(record, CREDIT.id), 120) || null,
    clientId: clean(field(record, CREDIT.clientRecordId), 40) || null,
    sourcePaymentRef: clean(field(record, CREDIT.paymentRef), 120) || null,
    sourceSessionId: clean(field(record, CREDIT.sessionId), 160) || null,
    originalAmountThb: numberValue(field(record, CREDIT.originalAmount)) || 0,
    availableAmountThb: numberValue(field(record, CREDIT.availableAmount)) || 0,
    appliedAmountThb: numberValue(field(record, CREDIT.appliedAmount)) || 0,
    status: normalized(field(record, CREDIT.status)) || "unknown",
    reason: normalized(field(record, CREDIT.reason)) || "other",
    refundable: field(record, CREDIT.refundable) === true,
    customerDisplayNote: clean(field(record, CREDIT.customerNote), 500) || null,
    internalNote: clean(field(record, CREDIT.internalNote), 1000) || null,
    createdBy: clean(field(record, CREDIT.createdBy), 160) || null,
    createdAt: clean(field(record, CREDIT.createdAt), 80) || null,
  };
}

async function requireActor(request, env) {
  const actor = await readCredentialBoundAdminActor(request, env);
  if (!actor) return { response: json({ ok: false, error: { code: "UNAUTHORIZED", message: "Admin session required." } }, 401) };
  return { actor };
}

async function handleList(request, env) {
  const auth = await requireActor(request, env);
  if (auth.response) return auth.response;
  const url = new URL(request.url);
  const clientId = recId(url.searchParams.get("client_id"));
  if (!clientId) return json({ ok: false, error: { code: "CLIENT_ID_REQUIRED", message: "Canonical client_id is required." } }, 400);
  try {
    const records = await listCredits(env, { clientId });
    const items = records.map(safeCredit).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    const availableBalanceThb = items
      .filter((item) => ["available", "partially_used"].includes(item.status))
      .reduce((sum, item) => sum + Math.max(0, item.availableAmountThb), 0);
    return json({ ok: true, clientId, availableBalanceThb, items });
  } catch (error) {
    return json({ ok: false, error: { code: clean(error?.message, 80) || "CLIENT_CREDIT_READ_FAILED", message: "Client credit data is temporarily unavailable." } }, 503);
  }
}

async function handleCarryForward(request, env) {
  const auth = await requireActor(request, env);
  if (auth.response) return auth.response;
  if (!sameOrigin(request)) return json({ ok: false, error: { code: "FORBIDDEN_ORIGIN", message: "Same-origin request required." } }, 403);

  const idempotencyKey = clean(request.headers.get("idempotency-key"), 180);
  if (idempotencyKey.length < 8) {
    return json({ ok: false, error: { code: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency-Key header is required." } }, 400);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ ok: false, error: { code: "INVALID_JSON", message: "JSON body required." } }, 400);
  }

  const clientId = recId(body.client_id);
  const paymentRecordId = recId(body.source_payment_record_id);
  const sessionRecordId = recId(body.source_session_record_id);
  const memberRecordId = recId(body.member_record_id);
  const memberId = clean(body.member_id, 120);
  const amountThb = numberValue(body.amount_thb);
  const reason = normalized(body.reason || "admin_carry_forward");
  const refundable = body.refundable === true;
  const customerNote = clean(body.customer_display_note, 500)
    || "ยอดมัดจำคงเหลือพร้อมใช้กับการจองครั้งถัดไป";
  const internalNote = clean(body.internal_note, 1000);

  if (!clientId || !paymentRecordId || !sessionRecordId || amountThb === null || amountThb <= 0) {
    return json({ ok: false, error: { code: "INVALID_CARRY_FORWARD_INPUT", message: "client_id, source payment/session records and positive amount_thb are required." } }, 400);
  }
  if (!ALLOWED_REASONS.has(reason)) {
    return json({ ok: false, error: { code: "INVALID_REASON", message: "Unsupported client-credit reason." } }, 400);
  }

  try {
    const replay = await listCredits(env, { idempotencyKey });
    if (replay.length) {
      return json({ ok: true, idempotentReplay: true, credit: safeCredit(replay[0]) });
    }

    const [payment, session] = await Promise.all([
      readRecord(env, PAYMENTS_TABLE, paymentRecordId),
      readRecord(env, SESSIONS_TABLE, sessionRecordId),
    ]);

    if (!recordLinks(payment, PAYMENT.client).includes(clientId) || !recordLinks(session, SESSION.client).includes(clientId)) {
      return json({ ok: false, error: { code: "CLIENT_LINK_MISMATCH", message: "Payment and session must belong to the same canonical Client." } }, 409);
    }

    const paymentRef = clean(field(payment, PAYMENT.ref), 120);
    const paymentSessionId = clean(field(payment, PAYMENT.sessionId), 160);
    const sessionId = clean(field(session, SESSION.sessionId), 160);
    const sessionPaymentRef = clean(field(session, SESSION.paymentRef), 120);
    if (!paymentRef || !sessionId || paymentSessionId !== sessionId || (sessionPaymentRef && sessionPaymentRef !== paymentRef)) {
      return json({ ok: false, error: { code: "SOURCE_LINK_MISMATCH", message: "Payment/session references do not match." } }, 409);
    }

    const money = officialPaymentState(payment);
    if (!money.approved || money.receivedThb <= 0) {
      return json({
        ok: false,
        error: {
          code: "SOURCE_PAYMENT_NOT_VERIFIED",
          message: "Carry-forward credit requires officially verified received funds.",
          paymentVerification: money.verification || "unknown",
          depositStatus: money.depositStatus || "unknown",
          receivedThb: money.receivedThb,
        },
      }, 409);
    }

    const sourceCredits = await listCredits(env, { paymentRef });
    const alreadyAllocated = sourceCredits
      .filter((record) => normalized(field(record, CREDIT.status)) !== "void")
      .reduce((sum, record) => sum + Math.max(0, numberValue(field(record, CREDIT.originalAmount)) || 0), 0);
    const availableFromPayment = Math.max(0, money.receivedThb - alreadyAllocated);
    if (amountThb > availableFromPayment + 0.001) {
      return json({
        ok: false,
        error: {
          code: "CREDIT_EXCEEDS_VERIFIED_FUNDS",
          message: "Requested credit exceeds unallocated verified received funds.",
          receivedThb: money.receivedThb,
          alreadyAllocatedThb: alreadyAllocated,
          availableFromPaymentThb: availableFromPayment,
        },
      }, 409);
    }

    const now = new Date().toISOString();
    const creditId = `CRD-${now.slice(0, 10).replace(/-/g, "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const fields = {
      [CREDIT.id]: creditId,
      [CREDIT.client]: [clientId],
      [CREDIT.sourcePayment]: [paymentRecordId],
      [CREDIT.sourceSession]: [sessionRecordId],
      [CREDIT.originalAmount]: amountThb,
      [CREDIT.availableAmount]: amountThb,
      [CREDIT.appliedAmount]: 0,
      [CREDIT.status]: "available",
      [CREDIT.reason]: reason,
      [CREDIT.refundable]: refundable,
      [CREDIT.customerNote]: customerNote,
      [CREDIT.internalNote]: internalNote || `Carry-forward from ${paymentRef} / ${sessionId}.`,
      [CREDIT.createdBy]: clean(auth.actor?.id || auth.actor?.role || "admin", 160),
      [CREDIT.createdAt]: now,
      [CREDIT.idempotencyKey]: idempotencyKey,
      [CREDIT.clientRecordId]: clientId,
      [CREDIT.paymentRef]: paymentRef,
      [CREDIT.sessionId]: sessionId,
    };
    if (memberRecordId) fields[CREDIT.member] = [memberRecordId];
    if (memberId) fields[CREDIT.memberId] = memberId;

    const config = airtableConfig(env);
    const created = await airtableRequest(env, config.creditsTable, "", {
      method: "POST",
      body: { records: [{ fields }], typecast: false },
    });
    const record = Array.isArray(created?.records) ? created.records[0] : null;
    if (!record) throw new Error("CLIENT_CREDIT_CREATE_FAILED");

    return json({
      ok: true,
      idempotentReplay: false,
      credit: safeCredit(record),
      source: {
        paymentRef,
        sessionId,
        verifiedReceivedThb: money.receivedThb,
      },
    }, 201);
  } catch (error) {
    return json({
      ok: false,
      error: {
        code: clean(error?.message, 80) || "CLIENT_CREDIT_CREATE_FAILED",
        message: "Client credit could not be created.",
      },
    }, 503);
  }
}

export function isClientCreditAdminRequest(request) {
  const url = new URL(request.url);
  return url.pathname === "/v1/admin/client-credits"
    || url.pathname === "/v1/admin/client-credits/carry-forward";
}

export async function handleClientCreditAdminRequest(request, env = {}) {
  const url = new URL(request.url);
  if (url.pathname === "/v1/admin/client-credits" && request.method === "GET") return handleList(request, env);
  if (url.pathname === "/v1/admin/client-credits/carry-forward" && request.method === "POST") return handleCarryForward(request, env);
  return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Unsupported client-credit operation." } }, 405, { allow: url.pathname.endsWith("carry-forward") ? "POST" : "GET" });
}

const worker = {
  ...delegatedWorker,
  async fetch(request, env, ctx) {
    if (isClientCreditAdminRequest(request)) return handleClientCreditAdminRequest(request, env);
    return delegatedWorker.fetch(request, env, ctx);
  },
};

export default worker;

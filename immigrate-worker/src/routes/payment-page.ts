import { linkSigningSecret, verifyLinkPayload } from "../lib/crypto";
import { getConfirmSecret } from "../lib/invite";
import { redirect } from "../lib/response";
import {
  airtableTable,
  airtableWritesEnabled,
  createRecordWithFallbacks,
  patchRecordWithFallbacks,
  type AirtableWriteResult,
} from "../lib/airtable-schema";
import type { Env } from "../types";

export const PAYMENT_PAGE_PATH = "/pay";
export const MEMBERSHIP_PAYMENT_PAGE_PATH = "/pay/membership";

const LEGACY_PAYMENT_PATHS = new Set([
  "/sigil/pay",
  "/sigil/pay/",
  "/sigil/pay/session",
  "/confirmation/payment-confirmation",
]);

type SignedPaymentPayload = Record<string, unknown>;

type AirtableRecord = {
  id: string;
  fields?: Record<string, unknown>;
};

type PaymentPageContext = {
  token: string;
  token_kind: string;
  payment_record_id: string;
  session_id: string;
  payment_ref: string;
  payment_type: string;
  amount_thb: number | null;
  total_amount_thb: number | null;
  deposit_amount_thb: number | null;
  final_amount_thb: number | null;
  client_name: string;
  model_name: string;
  package_code: string;
  member_email: string;
  payment_status: string;
  promptpay_id: string;
  bank_name: string;
  bank_account_name: string;
  bank_account_number: string;
  bank_branch: string;
  paypal_card_url: string;
  warnings: string[];
};

type SubmissionResult = {
  ok: boolean;
  code?: string;
  status?: string;
  message: string;
  payment_ref?: string;
  session_id?: string;
  upstream?: Record<string, unknown> | null;
  proof_write?: AirtableWriteResult | null;
};

type SubmissionReceipt = {
  receipt_url: string;
  provider_txn_id: string;
  payer_name: string;
  note: string;
};

type SubmissionReceiptResult =
  | { ok: true; receipt: SubmissionReceipt }
  | { ok: false; code: string; message: string };

function toStr(value: unknown): string {
  return String(value ?? "").trim();
}

function toNum(value: unknown): number | null {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function escapeHtml(value: unknown): string {
  return toStr(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value: unknown): string {
  return escapeHtml(value);
}

function readPaymentType(value: unknown): string {
  const raw = toStr(value).toLowerCase();
  if (["deposit", "final", "tips", "full"].includes(raw)) return raw;
  return "";
}

function normalizePaymentType(value: unknown): string {
  const raw = readPaymentType(value);
  if (raw) return raw;
  return "deposit";
}

function paymentTypeLabel(value: unknown): string {
  const raw = normalizePaymentType(value);
  if (raw === "full") return "Full payment";
  if (raw === "final") return "Final balance";
  if (raw === "tips") return "Tips";
  return "Deposit";
}

function formatMoney(amount: number | null): string {
  if (amount == null || !Number.isFinite(amount)) return "Amount unavailable";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

function formatPromptPayAmount(amount: number | null): string {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return "";
  return Number(amount).toFixed(2).replace(/\.00$/, "");
}

function normalizePromptPayId(value: unknown): string {
  return toStr(value).replace(/[^\d]/g, "");
}

function normalizeProofUrl(value: unknown): string {
  const raw = toStr(value);
  if (!raw) return "";

  try {
    const url = new URL(raw);
    if (url.protocol === "https:") return url.toString();
  } catch {}

  return "";
}

function promptPayQrUrl(promptpayId: string, amount: number | null): string {
  const id = normalizePromptPayId(promptpayId);
  if (!id) return "";
  const amountPart = formatPromptPayAmount(amount);
  return `https://promptpay.io/${encodeURIComponent(id)}${amountPart ? `/${encodeURIComponent(amountPart)}` : ""}.png`;
}

function getPaypalCardUrl(env: Env): string {
  return toStr(
    env.PAYPAL_CREDIT_CARD_URL ||
      env.PAYPAL_CARD_URL ||
      env.CREDIT_CARD_PAYMENT_URL ||
      env.PAYPAL_URL,
  );
}

function draftOnlyPaymentContext(env: Env): PaymentPageContext {
  return {
    token: "",
    token_kind: "booking_draft",
    payment_record_id: "",
    session_id: "",
    payment_ref: "",
    payment_type: "deposit",
    amount_thb: null,
    total_amount_thb: null,
    deposit_amount_thb: null,
    final_amount_thb: null,
    client_name: "",
    model_name: "",
    package_code: "",
    member_email: "",
    payment_status: "draft",
    promptpay_id: toStr(env.PROMPTPAY_ID),
    bank_name: toStr(env.PAYMENT_BANK_NAME || "PromptPay / Thai bank transfer"),
    bank_account_name: toStr(env.PAYMENT_BANK_ACCOUNT_NAME || "MMD SIGIL"),
    bank_account_number: toStr(env.PAYMENT_BANK_ACCOUNT_NUMBER || env.PROMPTPAY_ID),
    bank_branch: toStr(env.PAYMENT_BANK_BRANCH),
    paypal_card_url: getPaypalCardUrl(env),
    warnings: [
      "This page has your booking draft only. MMD will confirm the schedule and amount before payment is treated as complete.",
    ],
  };
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
}

function airtableHeaders(env: Env): HeadersInit {
  return {
    authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
    "content-type": "application/json",
  };
}

function airtableConfigured(env: Env): boolean {
  return Boolean(env.AIRTABLE_API_KEY && env.AIRTABLE_BASE_ID);
}

function encodeFormulaValue(value: string): string {
  return toStr(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function listAirtableRecords(
  env: Env,
  tableName: string,
  formula: string,
  maxRecords = 3,
): Promise<AirtableRecord[]> {
  if (!airtableConfigured(env) || !tableName || !formula) return [];

  const url = new URL(
    `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}`,
  );
  url.searchParams.set("maxRecords", String(maxRecords));
  url.searchParams.set("filterByFormula", formula);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: airtableHeaders(env),
  });

  if (!response.ok) return [];

  const data = (await response.json().catch(() => null)) as { records?: AirtableRecord[] } | null;
  return Array.isArray(data?.records) ? data.records.filter((record) => Boolean(record?.id)) : [];
}

async function findAirtableRecords(
  env: Env,
  tableName: string,
  formulas: string[],
  maxRecords = 3,
): Promise<AirtableRecord[]> {
  const records = new Map<string, AirtableRecord>();
  for (const formula of formulas.filter(Boolean)) {
    for (const record of await listAirtableRecords(env, tableName, formula, maxRecords)) {
      if (record.id) records.set(record.id, record);
    }
    if (records.size > 1) break;
  }

  return Array.from(records.values());
}

async function getAirtableRecordById(env: Env, tableName: string, recordId: string): Promise<AirtableRecord | null> {
  if (!airtableConfigured(env) || !tableName || !recordId) return null;

  const response = await fetch(
    `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}/${encodeURIComponent(recordId)}`,
    {
      method: "GET",
      headers: airtableHeaders(env),
    },
  );

  if (!response.ok) return null;
  const record = (await response.json().catch(() => null)) as AirtableRecord | null;
  return record?.id ? record : null;
}

function pickString(fields: Record<string, unknown> | undefined, keys: string[]): string {
  for (const key of keys) {
    const value = fields?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function pickNumber(fields: Record<string, unknown> | undefined, keys: string[]): number | null {
  for (const key of keys) {
    const value = toNum(fields?.[key]);
    if (value != null && Number.isFinite(value)) return value;
  }
  return null;
}

function fieldEquals(field: string, value: string): string {
  return `{${field}}="${encodeFormulaValue(value)}"`;
}

function fieldLowerEquals(field: string, value: string): string {
  return `LOWER({${field}})="${encodeFormulaValue(value.toLowerCase())}"`;
}

function sessionLookupFormulas(sessionId: string, paymentRef: string): string[] {
  const sid = encodeFormulaValue(sessionId);
  const ref = encodeFormulaValue(paymentRef);
  const formulas: string[] = [];

  if (sessionId && paymentRef) {
    formulas.push(`AND({session_id}="${sid}",{payment_ref}="${ref}")`);
    formulas.push(`AND({fldLTq2kZbyRv22IA}="${sid}",{fldojgjSQLaO0uQLX}="${ref}")`);
  }

  return formulas;
}

function paymentLookupFormulas(paymentRef: string, sessionId: string, paymentType: string): string[] {
  if (!paymentRef || !sessionId || !paymentType) return [];

  const paymentRefFields = ["payment_ref", "Payment Reference", "Payment Ref"];
  const sessionIdFields = ["session_id", "Session ID"];
  const paymentTypeFields = ["payment_type", "payment_stage", "Payment Type", "Payment Stage"];
  const formulas: string[] = [];

  for (const refField of paymentRefFields) {
    for (const sessionField of sessionIdFields) {
      for (const typeField of paymentTypeFields) {
        formulas.push(`AND(${fieldEquals(refField, paymentRef)},${fieldEquals(sessionField, sessionId)},${fieldLowerEquals(typeField, paymentType)})`);
      }
    }
  }

  return formulas;
}

async function readAirtablePaymentContext(
  env: Env,
  sessionId: string,
  paymentRef: string,
  paymentType: string,
): Promise<{ session: AirtableRecord | null; payment: AirtableRecord | null }> {
  if (!airtableConfigured(env)) throw new Error("PAYMENT_LOOKUP_UNAVAILABLE");
  if (!sessionId) throw new Error("MISSING_SESSION_ID");
  if (!paymentRef) throw new Error("MISSING_PAYMENT_REF");
  if (!paymentType) throw new Error("MISSING_PAYMENT_TYPE");

  const payments = await findAirtableRecords(
    env,
    airtableTable(env, "payments"),
    paymentLookupFormulas(paymentRef, sessionId, paymentType),
  );

  if (payments.length > 1) throw new Error("AMBIGUOUS_PAYMENT_LOOKUP");
  if (payments.length < 1) throw new Error("PAYMENT_NOT_FOUND");

  const sessions = await findAirtableRecords(
    env,
    airtableTable(env, "sessions"),
    sessionLookupFormulas(sessionId, paymentRef),
    1,
  );

  return { session: sessions[0] || null, payment: payments[0] };
}

function amountForType(input: {
  paymentType: string;
  tokenAmount: number | null;
  sessionFields?: Record<string, unknown>;
  paymentFields?: Record<string, unknown>;
}): {
  amount: number | null;
  total: number | null;
  deposit: number | null;
  final: number | null;
} {
  const paymentAmount = pickNumber(input.paymentFields, [
    "amount_thb",
    "Amount THB",
    "Amount",
    "amount",
  ]);
  const total = pickNumber(input.sessionFields, [
    "amount_total_thb",
    "amount_thb",
    "Amount THB",
    "Amount",
    "fldhwC79ndbnEXSZz",
  ]) ?? paymentAmount ?? input.tokenAmount;
  const deposit = pickNumber(input.sessionFields, [
    "deposit_amount_thb",
    "Deposit Amount THB",
    "Deposit Amount",
  ]);
  const final = pickNumber(input.sessionFields, [
    "final_amount_thb",
    "Final Amount THB",
    "Final Amount",
    "fldug5LUyiLyLvrCV",
  ]);

  if (input.paymentType === "deposit") {
    return { amount: deposit ?? paymentAmount ?? input.tokenAmount ?? total, total, deposit, final };
  }
  if (input.paymentType === "final") {
    return { amount: final ?? paymentAmount ?? input.tokenAmount ?? total, total, deposit, final };
  }

  return { amount: paymentAmount ?? input.tokenAmount ?? total, total, deposit, final };
}

function readTokenAmount(payload: SignedPaymentPayload): number | null {
  return toNum(
    payload.amount_thb ||
      payload.payment_amount_thb ||
      payload.selected_amount_thb ||
      payload.amount,
  );
}

function validatePaymentTokenPayload(payload: SignedPaymentPayload): SignedPaymentPayload {
  const kind = toStr(payload.kind);
  const role = toStr(payload.role);
  const paymentRef = toStr(payload.payment_ref || payload.transaction_ref || payload.ref);

  if (kind === "customer_confirm") {
    if (role && role !== "customer") throw new Error("invalid_payment_role");
    if (!paymentRef) throw new Error("MISSING_PAYMENT_REF");
    return payload;
  }

  if (kind === "customer_invite") {
    if (role && role !== "customer") throw new Error("invalid_invite_role");
    if (!paymentRef) throw new Error("MISSING_PAYMENT_REF");
    return payload;
  }

  throw new Error("invalid_payment_token_kind");
}

async function verifyPaymentToken(token: string, env: Env): Promise<SignedPaymentPayload> {
  const confirmSecret = getConfirmSecret(env);
  const alternateSecret = linkSigningSecret(env);

  try {
    return validatePaymentTokenPayload(
      await verifyLinkPayload<SignedPaymentPayload>(token, confirmSecret),
    );
  } catch (error) {
    if (alternateSecret && alternateSecret !== confirmSecret) {
      return validatePaymentTokenPayload(
        await verifyLinkPayload<SignedPaymentPayload>(token, alternateSecret),
      );
    }
    throw error;
  }
}

async function resolvePaymentPageContext(token: string, env: Env): Promise<PaymentPageContext> {
  const payload = await verifyPaymentToken(token, env);
  const tokenKind = toStr(payload.kind);
  const tokenPaymentType = readPaymentType(payload.payment_type || payload.payment_stage || payload.stage);
  const tokenAmount = readTokenAmount(payload);
  const tokenSessionId = toStr(payload.session_id || payload.immigration_id);
  const tokenPaymentRef = toStr(payload.payment_ref || payload.transaction_ref || payload.ref);
  if (!tokenSessionId) throw new Error("MISSING_SESSION_ID");
  if (!tokenPaymentRef) throw new Error("MISSING_PAYMENT_REF");
  if (!tokenPaymentType) throw new Error("MISSING_PAYMENT_TYPE");

  const records = await readAirtablePaymentContext(env, tokenSessionId, tokenPaymentRef, tokenPaymentType);
  const sessionFields = records.session?.fields;
  const paymentFields = records.payment?.fields;

  const sessionId =
    tokenSessionId ||
    pickString(sessionFields, ["session_id", "Session ID", "fldLTq2kZbyRv22IA"]) ||
    pickString(paymentFields, ["session_id", "Session ID"]);
  const paymentRef =
    tokenPaymentRef ||
    pickString(paymentFields, ["payment_ref", "Payment Reference", "Payment Ref"]) ||
    pickString(sessionFields, ["payment_ref", "Payment Reference", "Payment Ref", "fldojgjSQLaO0uQLX"]);
  const resolvedPaymentType = normalizePaymentType(
    tokenPaymentType ||
      pickString(paymentFields, ["payment_stage", "payment_type", "Payment Type"]) ||
      pickString(sessionFields, ["payment_stage", "payment_type", "Payment Type"]),
  );
  const amounts = amountForType({
    paymentType: resolvedPaymentType,
    tokenAmount,
    sessionFields,
    paymentFields,
  });
  const warnings: string[] = [];

  if (!airtableConfigured(env) && tokenAmount == null) {
    warnings.push("Airtable is not configured, and the signed token did not include an amount.");
  }
  if (!amounts.amount || amounts.amount <= 0) {
    warnings.push("Payment amount could not be resolved from the signed token or Airtable records.");
  }
  if (!paymentRef) {
    warnings.push("Payment reference is missing. The slip cannot be submitted until the link is refreshed.");
  }
  if (!sessionId) {
    warnings.push("Session ID is missing. The slip cannot be submitted until the link is refreshed.");
  }

  return {
    token,
    token_kind: tokenKind,
    payment_record_id: records.payment?.id || "",
    session_id: sessionId,
    payment_ref: paymentRef,
    payment_type: resolvedPaymentType,
    amount_thb: amounts.amount,
    total_amount_thb: amounts.total,
    deposit_amount_thb: amounts.deposit,
    final_amount_thb: amounts.final,
    client_name:
      pickString(sessionFields, ["client_name", "mmd_client_name", "Client Name", "Member Name"]) ||
      toStr(payload.mmd_client_name || payload.client_name || payload.customer_name),
    model_name: pickString(sessionFields, ["model_name", "Model Name"]) || toStr(payload.model_name),
    package_code:
      pickString(paymentFields, ["package_code", "Package Code"]) ||
      pickString(sessionFields, ["package_code", "Package Code"]) ||
      toStr(payload.package_code || payload.package),
    member_email:
      pickString(paymentFields, ["member_email", "Member Email", "email", "Email"]) ||
      pickString(sessionFields, ["member_email", "Member Email", "email", "Email"]) ||
      toStr(payload.member_email || payload.email),
    payment_status:
      pickString(paymentFields, ["payment_status", "Payment Status", "status", "Status"]) ||
      pickString(sessionFields, ["payment_status", "Payment Status"]) ||
      "pending",
    promptpay_id: toStr(env.PROMPTPAY_ID),
    bank_name: toStr(env.PAYMENT_BANK_NAME || "PromptPay / Thai bank transfer"),
    bank_account_name: toStr(env.PAYMENT_BANK_ACCOUNT_NAME || "MMD SIGIL"),
    bank_account_number: toStr(env.PAYMENT_BANK_ACCOUNT_NUMBER || env.PROMPTPAY_ID),
    bank_branch: toStr(env.PAYMENT_BANK_BRANCH),
    paypal_card_url: getPaypalCardUrl(env),
    warnings,
  };
}

function submissionReceiptFromForm(form: FormData): SubmissionReceiptResult {
  const slipUrlRaw = toStr(form.get("slip_url"));
  const slipUrl = normalizeProofUrl(slipUrlRaw);
  const slipFile = firstSubmittedFile(form, ["slip_file", "receipt_file", "attachment", "file"]);
  const providerTxnId = toStr(form.get("provider_txn_id"));
  const payerName = toStr(form.get("payer_name"));
  const note = toStr(form.get("note"));

  if (slipFile) {
    if (slipFile.size <= 0) {
      return {
        ok: false,
        code: "EMPTY_PROOF_FILE",
        message: "Uploaded slip proof is empty. Please provide a real https slip proof URL.",
      };
    }

    return {
      ok: false,
      code: "FILE_UPLOAD_NOT_CONFIGURED",
      message: "Slip file upload is not configured. TODO: configure R2 or Airtable attachment upload before accepting uploaded files; provide a real https slip proof URL instead.",
    };
  }

  if (slipUrlRaw && !slipUrl) {
    return {
      ok: false,
      code: "INVALID_PROOF_URL",
      message: "Slip proof must be a real https URL.",
    };
  }

  if (!slipUrl) {
    return {
      ok: false,
      code: "MISSING_PROOF_URL",
      message: "Please provide a real slip proof URL before submitting.",
    };
  }

  return {
    ok: true,
    receipt: {
      receipt_url: slipUrl,
      provider_txn_id: providerTxnId,
      payer_name: payerName,
      note,
    },
  };
}

function firstSubmittedFile(form: FormData, names: string[]): File | null {
  for (const name of names) {
    const value = form.get(name);
    if (value instanceof File && (value.name || value.size > 0)) return value;
  }
  return null;
}

const FINAL_PAYMENT_STATUSES = new Set(["paid", "verified", "approved", "completed", "settled"]);
const FINAL_VERIFICATION_STATUSES = new Set(["verified", "approved"]);
const FINAL_INTENT_STATUSES = new Set(["verified", "approved", "completed", "settled"]);

function normalizedState(value: unknown): string {
  return toStr(value).toLowerCase().replace(/[\s_-]+/g, "_");
}

function isFinalPaymentRecord(fields: Record<string, unknown> | undefined): boolean {
  const paymentStatus = normalizedState(pickString(fields, ["payment_status", "Payment Status", "status", "Status"]));
  const verificationStatus = normalizedState(pickString(fields, ["verification_status", "Verification Status"]));
  const intentStatus = normalizedState(pickString(fields, [
    "payment_intent_status",
    "Payment Intent Status",
    "intent_status",
    "Intent Status",
  ]));

  return (
    FINAL_PAYMENT_STATUSES.has(paymentStatus) ||
    FINAL_VERIFICATION_STATUSES.has(verificationStatus) ||
    FINAL_INTENT_STATUSES.has(intentStatus)
  );
}

function proofFieldContainsUrl(value: unknown, proofUrl: string): boolean {
  if (!value) return false;
  if (typeof value === "string") return value.includes(proofUrl);
  if (Array.isArray(value)) {
    return value.some((item) => {
      if (typeof item === "string") return item.includes(proofUrl);
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        return proofFieldContainsUrl(record.url || record.filename || record.name, proofUrl);
      }
      return false;
    });
  }
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((nested) => proofFieldContainsUrl(nested, proofUrl));
  }
  return false;
}

function proofUrlPersisted(fields: Record<string, unknown> | undefined, proofUrl: string): boolean {
  const acceptedFields = [
    "Receipt Photo",
    "receipt_photo",
    "slip_url",
    "proof_url",
    "receipt_url",
    "payment_evidence_url",
    "notes",
    "Notes",
    "details",
    "Details",
    "payload_json",
  ];

  return acceptedFields.some((field) => proofFieldContainsUrl(fields?.[field], proofUrl));
}

async function writePaymentProofActivity(
  env: Env,
  action: string,
  context: PaymentPageContext,
  receipt: SubmissionReceipt,
): Promise<void> {
  if (!airtableWritesEnabled(env)) return;

  await createRecordWithFallbacks(env, airtableTable(env, "activity_logs"), {
    action,
    source: "immigrate_worker_public_pay",
    session_id: context.session_id,
    payment_ref: context.payment_ref,
    payment_type: context.payment_type,
    proof_url: receipt.receipt_url,
    created_at: new Date().toISOString(),
    notes: `public_payment_page_${action}`,
  }).catch(() => {
    // Activity logging must never block proof submission or leak secrets.
  });
}

async function recordManualReviewSubmission(
  env: Env,
  context: PaymentPageContext,
  receipt: SubmissionReceipt,
): Promise<AirtableWriteResult | null> {
  if (!airtableWritesEnabled(env)) return null;
  if (!context.payment_record_id) {
    return {
      table: airtableTable(env, "payments"),
      action: "error",
      error: "PAYMENT_NOT_FOUND",
    };
  }

  const now = new Date().toISOString();
  return patchRecordWithFallbacks(
    env,
    airtableTable(env, "payments"),
    context.payment_record_id,
    {
      review_status: "manual_review",
      proof_review_status: "manual_review",
      manual_review_status: "manual_review",
      receipt_url: receipt.receipt_url,
      slip_url: receipt.receipt_url,
      "Receipt Photo": [{ url: receipt.receipt_url }],
      receipt_photo: [{ url: receipt.receipt_url }],
      proof_url: receipt.receipt_url,
      payment_evidence_url: receipt.receipt_url,
      provider_txn_id: receipt.provider_txn_id,
      payer_name: receipt.payer_name,
      submitted_at: now,
      proof_submitted_at: now,
      notes: [
        "public_payment_page_manual_review_submission",
        `slip_proof_url=${receipt.receipt_url}`,
        receipt.provider_txn_id ? `provider_txn_id=${receipt.provider_txn_id}` : "",
        receipt.payer_name ? `payer=${receipt.payer_name}` : "",
        receipt.note,
      ].filter(Boolean).join(" | "),
      payload_json: JSON.stringify({
        source: "immigrate_worker_public_pay",
        review_status: "manual_review",
        session_id: context.session_id,
        payment_ref: context.payment_ref,
        amount_thb: context.amount_thb,
        payment_type: context.payment_type,
        slip_proof_url: receipt.receipt_url,
        provider_txn_id: receipt.provider_txn_id,
        payer_name: receipt.payer_name,
        submitted_at: now,
      }),
    },
  );
}

function manualReviewNotes(receipt: SubmissionReceipt): string {
  return [
    "public_payment_page_manual_review_submission",
    `slip_proof_url=${receipt.receipt_url}`,
    receipt.provider_txn_id ? `provider_txn_id=${receipt.provider_txn_id}` : "",
    receipt.payer_name ? `payer=${receipt.payer_name}` : "",
    receipt.note,
  ].filter(Boolean).join(" | ");
}

async function submitManualReviewPaymentProof(
  env: Env,
  context: PaymentPageContext,
  receipt: SubmissionReceipt,
): Promise<SubmissionResult> {
  if (!context.payment_ref || !context.session_id || !context.amount_thb || context.amount_thb <= 0) {
    return {
      ok: false,
      code: "MISSING_PAYMENT_CONTEXT",
      message: "This payment link is missing a session ID, payment reference, or amount.",
      payment_ref: context.payment_ref,
      session_id: context.session_id,
      upstream: null,
    };
  }

  if (!airtableWritesEnabled(env)) {
    return {
      ok: false,
      code: "PROOF_STORAGE_NOT_CONFIGURED",
      message: "Payment proof storage is not configured. TODO: enable Airtable writes or add R2/Airtable attachment upload before accepting public slip submissions.",
      payment_ref: context.payment_ref,
      session_id: context.session_id,
      upstream: {
        skipped: true,
        reason: "manual_review_storage_unavailable",
      },
    };
  }

  const existingRecord = context.payment_record_id
    ? await getAirtableRecordById(env, airtableTable(env, "payments"), context.payment_record_id)
    : null;
  if (!existingRecord?.id) {
    return {
      ok: false,
      code: "PAYMENT_NOT_FOUND",
      message: "Payment record was not found for this session, reference, and payment type.",
      payment_ref: context.payment_ref,
      session_id: context.session_id,
      upstream: null,
    };
  }

  if (isFinalPaymentRecord(existingRecord.fields)) {
    await writePaymentProofActivity(env, "already_verified_public_proof_seen", context, receipt);
    return {
      ok: true,
      code: "ALREADY_VERIFIED",
      status: "already_verified",
      message: "Payment is already reviewed or verified. Your proof was not used to change payment status.",
      payment_ref: context.payment_ref,
      session_id: context.session_id,
      proof_write: {
        table: airtableTable(env, "payments"),
        action: "skipped",
        record_id: existingRecord.id,
      },
      upstream: {
        skipped: true,
        reason: "payment_already_final",
      },
    };
  }

  const proofWrite = await recordManualReviewSubmission(env, context, receipt);
  if (proofWrite && proofWrite.action === "error") {
    return {
      ok: false,
      code: toStr(proofWrite.error) || "PROOF_WRITE_FAILED",
      message: "Payment proof could not be stored for manual review. Please try again or contact an operator.",
      payment_ref: context.payment_ref,
      session_id: context.session_id,
      upstream: null,
      proof_write: proofWrite,
    };
  }

  const recordId = proofWrite?.record_id || context.payment_record_id;
  const readback = recordId
    ? await getAirtableRecordById(env, airtableTable(env, "payments"), recordId)
    : null;
  if (!proofUrlPersisted(readback?.fields, receipt.receipt_url)) {
    await writePaymentProofActivity(env, "proof_not_persisted", context, receipt);
    return {
      ok: false,
      code: "PROOF_NOT_PERSISTED",
      message: "Payment proof could not be verified after storage. Please contact an operator.",
      payment_ref: context.payment_ref,
      session_id: context.session_id,
      upstream: null,
      proof_write: proofWrite,
    };
  }

  await writePaymentProofActivity(env, "manual_review_proof_submitted", context, receipt);

  return {
    ok: true,
    code: "MANUAL_REVIEW_PENDING",
    status: "manual_review",
    message: "Payment proof submitted. Status remains pending until manual review.",
    payment_ref: context.payment_ref,
    session_id: context.session_id,
    proof_write: proofWrite,
    upstream: {
      skipped: true,
      reason: "public_payment_page_manual_review_only",
    },
  };
}

function renderWarnings(warnings: string[]): string {
  if (!warnings.length) return "";
  return `
    <div class="notice warn">
      ${warnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join("")}
    </div>
  `;
}

function renderSubmission(result: SubmissionResult | null): string {
  if (!result) return "";
  const kind = result.ok ? "success" : "error";
  return `
    <div class="notice ${kind}">
      <strong>${result.ok ? "Submission received" : "Submission failed"}</strong>
      <p>${escapeHtml(result.message)}</p>
      ${result.code ? `<p>Code: <code>${escapeHtml(result.code)}</code></p>` : ""}
      ${result.status ? `<p>Status: <code>${escapeHtml(result.status)}</code></p>` : ""}
      ${result.payment_ref ? `<p>Payment ref: <code>${escapeHtml(result.payment_ref)}</code></p>` : ""}
    </div>
  `;
}

function renderPaymentPage(context: PaymentPageContext, submission: SubmissionResult | null = null): Response {
  const qrUrl = promptPayQrUrl(context.promptpay_id, context.amount_thb);
  const canSubmit = Boolean(context.session_id && context.payment_ref && context.amount_thb && context.amount_thb > 0);
  const canOpenPaymentDetails = canSubmit && Boolean(qrUrl || context.bank_account_number);
  const paypalCardUrl = context.paypal_card_url;

  return htmlResponse(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MMD SIGIL Payment</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #060606;
      --panel: #101010;
      --panel-2: #17130b;
      --gold: #d9b45b;
      --gold-2: #f0d98a;
      --line: rgba(217, 180, 91, 0.24);
      --text: #f7f1df;
      --muted: #b7ad93;
      --danger: #ff8f8f;
      --ok: #9cf0bd;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at 50% 0%, rgba(217, 180, 91, 0.18), transparent 34rem),
        linear-gradient(180deg, #0b0a08 0%, var(--bg) 52%, #000 100%);
      color: var(--text);
    }
    main {
      width: min(1120px, calc(100% - 32px));
      margin: 0 auto;
      padding: 32px 0 40px;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      padding: 16px 0 28px;
      border-bottom: 1px solid var(--line);
    }
    .brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
    .sigil {
      width: 48px;
      height: 48px;
      border: 1px solid var(--gold);
      display: grid;
      place-items: center;
      color: var(--gold-2);
      font-weight: 800;
      letter-spacing: 0;
      background: #050505;
    }
    h1 { margin: 0; font-size: clamp(1.65rem, 3vw, 3.1rem); letter-spacing: 0; }
    .sub { margin: 5px 0 0; color: var(--muted); font-size: 0.95rem; }
    .status-pill {
      border: 1px solid var(--line);
      color: var(--gold-2);
      padding: 8px 12px;
      white-space: nowrap;
      font-size: 0.85rem;
      background: rgba(217, 180, 91, 0.08);
    }
    .grid {
      display: grid;
      grid-template-columns: minmax(280px, 0.9fr) minmax(320px, 1.1fr);
      gap: 20px;
      margin-top: 24px;
      align-items: start;
    }
    .panel {
      border: 1px solid var(--line);
      background: linear-gradient(180deg, rgba(23, 19, 11, 0.88), rgba(8, 8, 8, 0.94));
      padding: 20px;
    }
    .qr-wrap {
      display: grid;
      gap: 16px;
    }
    .qr {
      width: min(100%, 340px);
      aspect-ratio: 1;
      background: #fff;
      padding: 14px;
      justify-self: center;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .qr img { width: 100%; height: 100%; object-fit: contain; display: block; }
    .amount {
      font-size: clamp(2.1rem, 6vw, 4.6rem);
      line-height: 1;
      color: var(--gold-2);
      font-weight: 800;
      letter-spacing: 0;
      margin: 6px 0 4px;
    }
    .rows { display: grid; gap: 10px; margin-top: 18px; }
    .row {
      display: grid;
      grid-template-columns: 140px minmax(0, 1fr);
      gap: 12px;
      padding: 11px 0;
      border-bottom: 1px solid rgba(217, 180, 91, 0.12);
    }
    .row span:first-child { color: var(--muted); }
    code {
      color: var(--gold-2);
      word-break: break-word;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .methods {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-top: 14px;
    }
    .method {
      border: 1px solid rgba(217, 180, 91, 0.18);
      padding: 14px;
      background: rgba(255, 255, 255, 0.03);
      min-width: 0;
    }
    .method h3, form h2 { margin: 0 0 8px; font-size: 1rem; color: var(--gold-2); }
    .method p { margin: 6px 0; color: var(--muted); line-height: 1.45; }
    .summary-panel { margin-top: 24px; }
    .summary-panel[hidden] { display: none; }
    .summary-sync {
      margin: 12px 0 0;
      color: var(--muted);
      line-height: 1.5;
      font-size: 0.92rem;
    }
    .summary-sync[data-kind="success"] { color: var(--ok); }
    .summary-sync[data-kind="error"] { color: var(--danger); }
    .summary-grid { display: grid; gap: 10px; margin-top: 14px; }
    .summary-item {
      display: grid;
      grid-template-columns: 150px minmax(0, 1fr);
      gap: 12px;
      padding: 10px 0;
      border-bottom: 1px solid rgba(217, 180, 91, 0.12);
    }
    .summary-item dt { color: var(--muted); margin: 0; }
    .summary-item dd { margin: 0; min-width: 0; white-space: pre-line; }
    .payment-actions { display: grid; gap: 12px; margin-top: 14px; }
    .payment-note { color: var(--muted); line-height: 1.55; margin: 0; }
    .payment-dialog {
      position: fixed;
      inset: 0;
      z-index: 100;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 18px;
      background: rgba(0, 0, 0, 0.72);
    }
    .payment-dialog.is-open { display: flex; }
    .payment-dialog__panel {
      width: min(720px, 100%);
      max-height: min(760px, calc(100vh - 36px));
      overflow: auto;
      border: 1px solid var(--line);
      background: #101010;
      padding: 20px;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
    }
    .payment-dialog__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
    }
    .payment-dialog__head h2 { margin: 0; color: var(--gold-2); font-size: 1.15rem; }
    .payment-dialog__close {
      width: auto;
      min-height: 36px;
      padding: 0 12px;
      background: transparent;
      color: var(--gold-2);
    }
    a.button, button {
      display: inline-flex;
      justify-content: center;
      align-items: center;
      min-height: 44px;
      padding: 0 16px;
      border: 1px solid var(--gold);
      background: var(--gold);
      color: #090806;
      font-weight: 800;
      text-decoration: none;
      cursor: pointer;
      width: 100%;
    }
    button:disabled, .disabled {
      opacity: 0.48;
      cursor: not-allowed;
      background: transparent;
      color: var(--muted);
    }
    form { display: grid; gap: 14px; }
    label { display: grid; gap: 7px; color: var(--muted); font-size: 0.92rem; }
    input, textarea {
      width: 100%;
      min-height: 44px;
      border: 1px solid rgba(217, 180, 91, 0.28);
      background: #080808;
      color: var(--text);
      padding: 10px 12px;
      font: inherit;
    }
    input[type="file"] { padding: 9px; }
    textarea { min-height: 86px; resize: vertical; }
    .notice {
      border: 1px solid var(--line);
      padding: 13px 14px;
      margin: 0 0 16px;
      background: rgba(255, 255, 255, 0.035);
    }
    .notice p { margin: 6px 0 0; color: var(--muted); }
    .notice.success { border-color: rgba(156, 240, 189, 0.5); color: var(--ok); }
    .notice.error, .notice.warn { border-color: rgba(255, 143, 143, 0.45); color: var(--danger); }
    .fineprint { color: var(--muted); font-size: 0.84rem; line-height: 1.5; margin: 10px 0 0; }
    @media (max-width: 820px) {
      main { width: min(100% - 24px, 640px); padding-top: 20px; }
      header { align-items: flex-start; flex-direction: column; }
      .grid, .methods { grid-template-columns: 1fr; }
      .row, .summary-item { grid-template-columns: 1fr; gap: 4px; }
      .status-pill { white-space: normal; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="brand">
        <div class="sigil">M</div>
        <div>
          <h1>MMD SIGIL Payment</h1>
          <p class="sub">Secure payment reference for your session.</p>
        </div>
      </div>
      <div class="status-pill">${escapeHtml(context.payment_status || "pending")}</div>
    </header>

    <section class="grid">
      <div class="panel qr-wrap">
        <div>
          <div class="sub">${escapeHtml(paymentTypeLabel(context.payment_type))}</div>
          <div class="amount">${escapeHtml(formatMoney(context.amount_thb))}</div>
        </div>
        <p class="payment-note">Payment and booking are confirmed only after MMD verifies the schedule, amount, and payment proof. Open the payment details when you are ready to transfer.</p>
        <div class="payment-actions">
          <button type="button" data-payment-open ${canOpenPaymentDetails ? "" : "disabled"}>Open payment details</button>
        </div>
        <div class="rows">
          <div class="row"><span>Payment ref</span><code>${escapeHtml(context.payment_ref || "Missing")}</code></div>
          <div class="row"><span>Session ID</span><code>${escapeHtml(context.session_id || "Missing")}</code></div>
          <div class="row"><span>Client</span><span>${escapeHtml(context.client_name || "MMD client")}</span></div>
          ${context.model_name ? `<div class="row"><span>Model</span><span>${escapeHtml(context.model_name)}</span></div>` : ""}
        </div>
      </div>

      <div class="panel">
        ${renderSubmission(submission)}
        ${renderWarnings(context.warnings)}
        <section class="summary-panel" data-booking-summary hidden>
          <h2>Booking summary</h2>
          <p class="payment-note">Kenji will keep this as a draft until MMD checks the schedule, amount, and proof.</p>
          <p class="summary-sync" data-booking-sync-status></p>
          <dl class="summary-grid" data-booking-summary-list></dl>
        </section>

        <form method="post" action="${escapeAttr(`${PAYMENT_PAGE_PATH}?t=${encodeURIComponent(context.token)}`)}">
          <h2>Submit payment proof</h2>
          <label>
            Slip proof URL / attachment URL
            <input name="slip_url" type="url" placeholder="https://..." required />
          </label>
          <label>
            Bank transaction reference
            <input name="provider_txn_id" type="text" autocomplete="off" />
          </label>
          <label>
            Payer name
            <input name="payer_name" type="text" autocomplete="name" />
          </label>
          <label>
            Note
            <textarea name="note"></textarea>
          </label>
          <button type="submit" ${canSubmit ? "" : "disabled"}>Submit for manual review</button>
          <p class="fineprint">Your booking/payment stays pending until MMD manually verifies the schedule, amount, and payment proof.</p>
        </form>
      </div>
    </section>

    <section class="payment-dialog" data-payment-dialog aria-hidden="true">
      <div class="payment-dialog__panel" role="dialog" aria-modal="true" aria-labelledby="paymentDetailsTitle">
        <div class="payment-dialog__head">
          <h2 id="paymentDetailsTitle">Payment details</h2>
          <button class="payment-dialog__close" type="button" data-payment-close>Close</button>
        </div>
        <div class="methods">
          <article class="method">
            <h3>Bank transfer</h3>
            <p>${escapeHtml(context.bank_name)}</p>
            <p>Account name: <strong>${escapeHtml(context.bank_account_name)}</strong></p>
            <p>Account number: <code>${escapeHtml(context.bank_account_number || context.promptpay_id || "Not configured")}</code></p>
            ${context.bank_branch ? `<p>Branch: ${escapeHtml(context.bank_branch)}</p>` : ""}
          </article>
          <article class="method">
            <h3>QR payment</h3>
            <div class="qr">
              ${qrUrl ? `<img src="${escapeAttr(qrUrl)}" alt="PromptPay QR" />` : ""}
            </div>
          </article>
          <article class="method">
            <h3>PayPal / Credit Card</h3>
            <p>A 6% processing fee applies to PayPal or Credit Card payments.</p>
            ${
              paypalCardUrl
                ? `<a class="button" href="${escapeAttr(paypalCardUrl)}" target="_blank" rel="noopener noreferrer">Open card payment</a>`
                : `<span class="button disabled">Card URL not configured</span>`
            }
          </article>
        </div>
      </div>
    </section>
  </main>
  <script>
    (() => {
      const DRAFT_KEYS = [
        "sigil_booking_draft_v12",
        "sigil_booking_draft_v11",
        "sigil_booking_draft_v10",
        "sigil_booking_draft_v9",
        "sigil_booking_draft",
        "sigil_booking_request_draft_v2",
        "mmd_booking_draft",
        "booking_draft"
      ];
      const BOOKING_ENDPOINT = "/v1/public/booking-request";
      const text = (value, fallback = "-") => String(value ?? "").trim() || fallback;
      const label = (item, fallback = "-") => text(item && (item.label || item.value), fallback);
      const params = new URLSearchParams(window.location.search);

      function readDraft() {
        for (const key of DRAFT_KEYS) {
          try {
            const raw = window.localStorage.getItem(key);
            if (!raw) continue;
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object") return parsed;
          } catch {}
        }
        return draftFromParams();
      }

      function saveDraft(draft) {
        try {
          const key = draft && draft.version === "v2" ? "sigil_booking_request_draft_v2" : DRAFT_KEYS[0];
          window.localStorage.setItem(key, JSON.stringify(draft));
        } catch {}
      }

      function draftFromParams() {
        const get = (name) => params.get(name) || "";
        if (![...params.keys()].length) return null;
        return {
          lane: { label: get("lane_label") || get("lane") },
          job_class: { label: get("job_class_label") || get("job_class") || get("class") },
          schedule: {
            date: get("date"),
            time: get("time"),
            duration_label: get("duration_label") || get("duration")
          },
          location: {
            place_name: get("place_name") || get("place"),
            google_address: get("google_address") || get("address")
          },
          model_spec: {
            model_id_or_name: get("model_id_or_name") || get("model"),
            height_min_cm: get("height_min_cm"),
            height_max_cm: get("height_max_cm"),
            orientation_label: get("orientation_label") || get("orientation"),
            private_type_label: get("private_type_label") || get("private_type"),
            body_type_label: get("body_type_label") || get("body_type"),
            face_look_label: get("face_look_label") || get("face_look")
          },
          client: { contact: get("contact") || get("client_contact") }
        };
      }

      function first() {
        for (let i = 0; i < arguments.length; i += 1) {
          const value = String(arguments[i] ?? "").trim();
          if (value) return value;
        }
        return "";
      }

      function numericDuration(value) {
        const raw = String(value ?? "").trim().toLowerCase();
        if (!raw) return "";
        const match = raw.match(/\\d+(?:\\.\\d+)?/);
        if (match) return match[0];
        if (raw === "short") return "2";
        if (raw === "standard") return "3";
        if (raw === "extended" || raw === "long") return "4";
        return "";
      }

      function draftBrief(draft) {
        const pieces = [
          first(draft.brief, draft.note),
          draft.model_spec ? modelSpecSummary(draft.model_spec) : "",
          draft.preferred_models && draft.preferred_models.length
            ? "Preferred models: " + draft.preferred_models.map((model) => label(model, "")).filter(Boolean).join(", ")
            : "",
          draft.preferred_slots && draft.preferred_slots.length
            ? "Preferred slots: " + draft.preferred_slots.map((slot) => text(slot.value, "")).filter(Boolean).join(" | ")
            : ""
        ].filter(Boolean);
        return pieces.join("\\n") || "Booking draft from review page";
      }

      function bookingPayloadFromDraft(draft) {
        const schedule = draft.schedule || {};
        const location = draft.location || {};
        const client = draft.client || {};
        const modelSpec = draft.model_spec || {};
        const jobType = draft.job_type || draft.jobType || draft.job_class || {};
        const packageTier = draft.package_tier || draft.packageTier || {};
        const duration = draft.duration || {};
        const preference = draft.preference || {};
        return {
          source: "sigil_booking",
          mode: "request",
          build_marker: "SIGIL_BOOKING_BUILD: payment-page-draft-api-20260614",
          t: params.get("t") || "",
          code: params.get("code") || "",
          promo: params.get("promo") || "",
          session_id: params.get("session_id") || first(draft.session_id),
          payment_ref: params.get("payment_ref") || first(draft.payment_ref),
          booking_id: params.get("booking_id") || first(draft.booking_id),
          booking_ref: params.get("booking_ref") || first(draft.booking_ref),
          request_mode: first(draft.request_mode, draft.mode, "review"),
          booking_lane: first(draft.booking_lane, draft.lane && draft.lane.value, "member_booking"),
          request_type: first(draft.request_type, "brief_first"),
          matching_mode: first(draft.matching_mode, "sigil_assisted_recommendation"),
          request_status: "pending_operator_review",
          brief: draftBrief(draft),
          selected_model_id: first(modelSpec.model_id_or_name, draft.selected_model_id),
          selected_model_name: first(modelSpec.model_id_or_name, draft.selected_model_name),
          job_type: first(jobType.value, draft.job_type, "private_booking"),
          package_tier: first(packageTier.value, draft.package_tier, "premium"),
          duration_hours: numericDuration(first(duration.hours, duration.value, duration.label, schedule.duration_hours, schedule.duration_label)),
          booking_date: first(schedule.date, draft.booking_date),
          start_time: first(schedule.time, draft.start_time),
          area: first(location.area, location.place_name, draft.area),
          location_name: first(location.place_name, location.google_address, draft.area),
          preferred_vibe: first(preference.value, draft.preferred_vibe),
          language_preference: first(modelSpec.language_preference, draft.language_preference),
          client_name: first(client.name, draft.client_name),
          contact: first(client.contact, draft.contact),
          note: first(draft.note),
          page_path: window.location.pathname,
          created_from_url: window.location.href,
          created_at_client: new Date().toISOString()
        };
      }

      function missingBookingFields(payload) {
        return [
          "brief",
          "booking_lane",
          "request_mode",
          "job_type",
          "package_tier",
          "duration_hours",
          "booking_date",
          "start_time",
          "area",
          "client_name",
          "contact"
        ].filter((key) => !String(payload[key] ?? "").trim());
      }

      function setSyncStatus(message, kind) {
        const el = document.querySelector("[data-booking-sync-status]");
        if (!el) return;
        el.textContent = message || "";
        if (kind) el.dataset.kind = kind;
        else delete el.dataset.kind;
      }

      function modelSpecSummary(spec = {}) {
        const min = text(spec.height_min_cm, "");
        const max = text(spec.height_max_cm, "");
        const height = min && max ? min + " to " + max + " cm" : "-";
        return [
          "Model ID/Name: " + text(spec.model_id_or_name),
          "Height: " + height,
          "Orientation: " + text(spec.orientation_label, "Let Kenji review"),
          "VIP/PN: " + text(spec.private_type_label, "Let Kenji review"),
          "Body: " + text(spec.body_type_label, "Let Kenji review"),
          "Look: " + text(spec.face_look_label, "Let Kenji review")
        ].join("\\n");
      }

      function renderBookingSummary() {
        const panel = document.querySelector("[data-booking-summary]");
        const list = document.querySelector("[data-booking-summary-list]");
        if (!panel || !list) return;
        const draft = readDraft();
        if (!draft) return;
        const dateTime = [draft.schedule && draft.schedule.date, draft.schedule && draft.schedule.time].map((part) => text(part, "")).filter(Boolean).join(" ");
        const rows = [
          ["Job Lane", label(draft.lane)],
          ["Job Class", label(draft.job_class)],
          ["Date & Time", text(dateTime)],
          ["Duration", text(draft.schedule && draft.schedule.duration_label)],
          ["Place Name", text(draft.location && draft.location.place_name)],
          ["Google Address", text(draft.location && draft.location.google_address)],
          ["Model Spec", modelSpecSummary(draft.model_spec || {})],
          ["Contact", text((draft.client && draft.client.contact) || draft.contact)],
          ["Booking ID", text(draft.booking_id || draft.booking_ref, "Pending sync")]
        ];
        list.innerHTML = rows.map(([term, value]) => '<div class="summary-item"><dt>' + escapeHtml(term) + '</dt><dd>' + escapeHtml(value) + '</dd></div>').join("");
        panel.hidden = false;
        syncBookingDraft(draft);
      }

      async function syncBookingDraft(draft) {
        if (!draft || draft.booking_id || draft.booking_ref) {
          if (draft && (draft.booking_id || draft.booking_ref)) setSyncStatus("Booking draft is linked to the API.", "success");
          return;
        }
        const payload = bookingPayloadFromDraft(draft);
        const missing = missingBookingFields(payload);
        if (missing.length) {
          setSyncStatus("Kenji needs a little more detail before payment: " + missing.join(", ") + ".", "error");
          return;
        }

        setSyncStatus("Kenji is saving this booking draft...", "");
        try {
          const res = await fetch(BOOKING_ENDPOINT + window.location.search, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload)
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || data.ok === false) {
            const message = data && data.error && data.error.message ? data.error.message : "Booking draft could not be saved.";
            throw new Error(message);
          }

          const nextDraft = Object.assign({}, draft, {
            booking_id: data.booking_id || data.request_id || "",
            booking_ref: data.booking_ref || data.booking_id || data.request_id || "",
            session_id: data.session_id || payload.session_id || "",
            payment_ref: data.payment_ref || payload.payment_ref || "",
            api_next_url: data.next_url || ""
          });
          saveDraft(nextDraft);
          if (data.next_url) window.history.replaceState(null, "", data.next_url);
          setSyncStatus("Booking draft saved. Ref: " + text(nextDraft.booking_ref), "success");
          renderBookingSummary();
        } catch (error) {
          setSyncStatus("Kenji could not save this draft yet. " + (error && error.message ? error.message : "Please try again."), "error");
        }
      }

      function escapeHtml(value) {
        return String(value ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }

      function bindPaymentDialog() {
        const dialog = document.querySelector("[data-payment-dialog]");
        const open = document.querySelector("[data-payment-open]");
        const close = document.querySelector("[data-payment-close]");
        if (!dialog || !open || !close) return;
        const setOpen = (isOpen) => {
          dialog.classList.toggle("is-open", isOpen);
          dialog.setAttribute("aria-hidden", isOpen ? "false" : "true");
        };
        open.addEventListener("click", () => setOpen(true));
        close.addEventListener("click", () => setOpen(false));
        dialog.addEventListener("click", (event) => {
          if (event.target === dialog) setOpen(false);
        });
        window.addEventListener("keydown", (event) => {
          if (event.key === "Escape") setOpen(false);
        });
      }

      renderBookingSummary();
      bindPaymentDialog();
    })();
  </script>
</body>
</html>`);
}

function renderPaymentErrorPage(message: string, status = 400): Response {
  return htmlResponse(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MMD SIGIL Payment</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #060606;
      color: #f7f1df;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      width: min(520px, calc(100% - 32px));
      border: 1px solid rgba(217, 180, 91, 0.28);
      padding: 24px;
      background: #101010;
    }
    h1 { margin: 0 0 8px; color: #f0d98a; letter-spacing: 0; }
    p { margin: 0; color: #b7ad93; line-height: 1.5; }
  </style>
</head>
<body>
  <main>
    <h1>MMD SIGIL Payment</h1>
    <p>${escapeHtml(message)}</p>
  </main>
</body>
</html>`, status);
}

export function isPaymentPageRoute(pathname: string): boolean {
  return pathname === PAYMENT_PAGE_PATH || pathname === MEMBERSHIP_PAYMENT_PAGE_PATH || LEGACY_PAYMENT_PATHS.has(pathname);
}

export function canonicalPaymentRedirect(request: Request): Response | null {
  const url = new URL(request.url);
  if (!isPaymentPageRoute(url.pathname)) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return null;

  const token = toStr(url.searchParams.get("t"));
  if (!token) return null;

  if (url.pathname === PAYMENT_PAGE_PATH || url.pathname === MEMBERSHIP_PAYMENT_PAGE_PATH) return null;

  const canonical = new URL(PAYMENT_PAGE_PATH, url.origin);
  url.searchParams.forEach((value, key) => canonical.searchParams.append(key, value));
  return redirect(canonical.toString(), 302);
}

export async function handlePaymentPage(request: Request, env: Env): Promise<Response> {
  if (request.method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  const url = new URL(request.url);
  const token = toStr(url.searchParams.get("t"));
  if (!token) {
    if (request.method === "GET") return renderPaymentPage(draftOnlyPaymentContext(env));
    return renderPaymentErrorPage("Missing payment token. Use /pay?t=... before submitting proof.", 400);
  }

  let context: PaymentPageContext;
  try {
    context = await resolvePaymentPageContext(token, env);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_payment_token";
    return renderPaymentErrorPage(`Payment link is invalid or expired: ${message}`, 401);
  }

  if (request.method === "GET") {
    return renderPaymentPage(context);
  }

  if (request.method === "POST") {
    const form = await request.formData().catch(() => null);
    if (!form) {
      return renderPaymentPage(context, {
        ok: false,
        message: "Slip form could not be read.",
      });
    }

    const receiptResult = submissionReceiptFromForm(form);
    if (!receiptResult.ok) {
      return renderPaymentPage(context, {
        ok: false,
        code: receiptResult.code,
        message: receiptResult.message,
        payment_ref: context.payment_ref,
        session_id: context.session_id,
      });
    }

    const result = await submitManualReviewPaymentProof(env, context, receiptResult.receipt);
    return renderPaymentPage(context, result);
  }

  return renderPaymentErrorPage("Method not allowed.", 405);
}

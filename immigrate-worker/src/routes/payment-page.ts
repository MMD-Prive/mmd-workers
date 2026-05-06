import { verifyLinkPayload } from "../lib/crypto";
import { getConfirmSecret } from "../lib/invite";
import { redirect } from "../lib/response";
import {
  airtableTable,
  airtableWritesEnabled,
  upsertRecordWithFallbacks,
  type AirtableWriteResult,
} from "../lib/airtable-schema";
import type { Env } from "../types";

export const PAYMENT_PAGE_PATH = "/pay";

const LEGACY_PAYMENT_PATHS = new Set([
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
  | { ok: false; message: string };

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
  if (["deposit", "final", "tips", "full", "membership"].includes(raw)) return raw;
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
  if (raw === "membership") return "Membership";
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
    if (url.protocol === "https:" || url.protocol === "http:") return url.toString();
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

function getPaymentsBaseUrl(env: Env): string {
  const direct = toStr(env.PAYMENTS_WORKER_BASE_URL || env.PAYMENTS_BASE_URL);
  if (direct) return direct.replace(/\/+$/, "");

  const createLinksUrl = toStr(env.CREATE_LINKS_URL);
  if (createLinksUrl) {
    try {
      return new URL(createLinksUrl).origin.replace(/\/+$/, "");
    } catch {
      return "";
    }
  }

  return "";
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

async function findAirtableRecord(
  env: Env,
  tableName: string,
  formulas: string[],
): Promise<AirtableRecord | null> {
  if (!airtableConfigured(env) || !tableName) return null;

  for (const formula of formulas.filter(Boolean)) {
    const url = new URL(
      `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}`,
    );
    url.searchParams.set("maxRecords", "1");
    url.searchParams.set("filterByFormula", formula);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: airtableHeaders(env),
    });

    if (!response.ok) continue;

    const data = (await response.json().catch(() => null)) as { records?: AirtableRecord[] } | null;
    const record = data?.records?.[0];
    if (record?.id) return record;
  }

  return null;
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

function sessionLookupFormulas(sessionId: string, paymentRef: string): string[] {
  const sid = encodeFormulaValue(sessionId);
  const ref = encodeFormulaValue(paymentRef);
  const formulas: string[] = [];

  if (sessionId && paymentRef) {
    formulas.push(`AND({session_id}="${sid}",{payment_ref}="${ref}")`);
    formulas.push(`AND({fldLTq2kZbyRv22IA}="${sid}",{fldojgjSQLaO0uQLX}="${ref}")`);
  }
  if (sessionId) {
    formulas.push(`{session_id}="${sid}"`);
    formulas.push(`{fldLTq2kZbyRv22IA}="${sid}"`);
    formulas.push(`{Session ID}="${sid}"`);
  }
  if (paymentRef) {
    formulas.push(`{payment_ref}="${ref}"`);
    formulas.push(`{Payment Ref}="${ref}"`);
    formulas.push(`{Payment Reference}="${ref}"`);
    formulas.push(`{fldojgjSQLaO0uQLX}="${ref}"`);
  }

  return formulas;
}

function paymentLookupFormulas(paymentRef: string, sessionId: string): string[] {
  const ref = encodeFormulaValue(paymentRef);
  const sid = encodeFormulaValue(sessionId);
  const formulas: string[] = [];

  if (paymentRef) {
    formulas.push(`{payment_ref}="${ref}"`);
    formulas.push(`{Payment Reference}="${ref}"`);
    formulas.push(`{Payment Ref}="${ref}"`);
  }
  if (sessionId) {
    formulas.push(`{session_id}="${sid}"`);
    formulas.push(`{Session ID}="${sid}"`);
  }

  return formulas;
}

async function readAirtablePaymentContext(
  env: Env,
  sessionId: string,
  paymentRef: string,
): Promise<{ session: AirtableRecord | null; payment: AirtableRecord | null }> {
  const session = await findAirtableRecord(
    env,
    toStr(env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX"),
    sessionLookupFormulas(sessionId, paymentRef),
  );
  const payment = await findAirtableRecord(
    env,
    toStr(env.AIRTABLE_TABLE_PAYMENTS || "payments"),
    paymentLookupFormulas(paymentRef, sessionId),
  );

  return { session, payment };
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

async function verifyPaymentToken(token: string, env: Env): Promise<SignedPaymentPayload> {
  const secret = getConfirmSecret(env);
  const payload = await verifyLinkPayload<SignedPaymentPayload>(token, secret);
  const kind = toStr(payload.kind);
  const role = toStr(payload.role);

  if (kind === "customer_confirm") {
    if (role && role !== "customer") throw new Error("invalid_payment_role");
    return payload;
  }

  if (kind === "customer_invite") {
    if (role && role !== "customer") throw new Error("invalid_invite_role");
    return payload;
  }

  throw new Error("invalid_payment_token_kind");
}

async function resolvePaymentPageContext(token: string, env: Env): Promise<PaymentPageContext> {
  const payload = await verifyPaymentToken(token, env);
  const tokenKind = toStr(payload.kind);
  const tokenPaymentType = readPaymentType(payload.payment_type || payload.payment_stage || payload.stage);
  const tokenAmount = readTokenAmount(payload);
  const tokenSessionId = toStr(payload.session_id || payload.immigration_id);
  const tokenPaymentRef = toStr(payload.payment_ref || payload.transaction_ref || payload.ref);
  const records = await readAirtablePaymentContext(env, tokenSessionId, tokenPaymentRef);
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
  const providerTxnId = toStr(form.get("provider_txn_id"));
  const payerName = toStr(form.get("payer_name"));
  const note = toStr(form.get("note"));

  if (slipUrlRaw && !slipUrl) {
    return {
      ok: false,
      message: "Slip proof must be a real http(s) URL.",
    };
  }

  if (!slipUrl) {
    return {
      ok: false,
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

async function recordManualReviewSubmission(
  env: Env,
  context: PaymentPageContext,
  receipt: SubmissionReceipt,
): Promise<AirtableWriteResult | null> {
  if (!airtableWritesEnabled(env)) return null;

  const now = new Date().toISOString();
  return upsertRecordWithFallbacks(
    env,
    airtableTable(env, "payments"),
    `{Payment Reference}="${encodeFormulaValue(context.payment_ref)}"`,
    {
      "Payment Reference": context.payment_ref,
      payment_ref: context.payment_ref,
      session_id: context.session_id,
      amount_thb: context.amount_thb ?? undefined,
      amount: context.amount_thb ?? undefined,
      total_amount_thb: context.total_amount_thb ?? undefined,
      deposit_amount_thb: context.deposit_amount_thb ?? undefined,
      final_amount_thb: context.final_amount_thb ?? undefined,
      payment_stage: context.payment_type,
      payment_type: context.payment_type,
      payment_method: "promptpay",
      payment_status: "pending",
      "Payment Status": "pending",
      status: "pending",
      verification_status: "manual_review",
      "Verification Status": "manual_review",
      intent_status: "manual_review",
      receipt_url: receipt.receipt_url,
      slip_url: receipt.receipt_url,
      receipt_photo: receipt.receipt_url,
      proof_url: receipt.receipt_url,
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
        payment_status: "pending",
        verification_status: "manual_review",
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

async function submitPaymentToPaymentsWorker(
  env: Env,
  context: PaymentPageContext,
  receipt: SubmissionReceipt,
): Promise<SubmissionResult> {
  const base = getPaymentsBaseUrl(env);
  if (!base) {
    return {
      ok: false,
      message: "Payments worker URL is not configured.",
      payment_ref: context.payment_ref,
      session_id: context.session_id,
      upstream: {
        todo: "TODO: configure PAYMENTS_WORKER_BASE_URL or CREATE_LINKS_URL before enabling public payment confirmation.",
      },
    };
  }

  if (!context.payment_ref || !context.session_id || !context.amount_thb || context.amount_thb <= 0) {
    return {
      ok: false,
      message: "This payment link is missing a session ID, payment reference, or amount.",
      payment_ref: context.payment_ref,
      session_id: context.session_id,
      upstream: null,
    };
  }

  const proofWrite = await recordManualReviewSubmission(env, context, receipt);
  if (proofWrite && proofWrite.action === "error") {
    return {
      ok: false,
      message: "Payment proof could not be stored for manual review. Please try again or contact an operator.",
      payment_ref: context.payment_ref,
      session_id: context.session_id,
      upstream: null,
      proof_write: proofWrite,
    };
  }

  const reviewNotes = manualReviewNotes(receipt);
  const payload = {
    payment_ref: context.payment_ref,
    transaction_ref: context.payment_ref,
    session_id: context.session_id,
    payment_stage: context.payment_type,
    payment_type: context.payment_type,
    amount: context.amount_thb,
    amount_thb: context.amount_thb,
    member_email: context.member_email,
    package_code: context.package_code,
    payment_method: "promptpay",
    provider: "promptpay",
    provider_txn_id: receipt.provider_txn_id,
    receipt_url: receipt.receipt_url,
    slip_url: receipt.receipt_url,
    submitted_at: new Date().toISOString(),
    status: "pending",
    payment_status: "pending",
    verification_status: "manual_review",
    intent_status: "manual_review",
    source: "immigrate_worker_public_pay",
    message_thread_id: 61,
    telegram_message_thread_id: 61,
    notes: reviewNotes,
    note: reviewNotes,
    admin_reason: [reviewNotes, "telegram_confirm_thread=61"].filter(Boolean).join(" | "),
  };

  const response = await fetch(`${base}/v1/pay/verify`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(env.INTERNAL_TOKEN ? { authorization: `Bearer ${env.INTERNAL_TOKEN}` } : {}),
      ...(env.CONFIRM_KEY ? { "x-confirm-key": env.CONFIRM_KEY } : {}),
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  const data = (() => {
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return text ? { raw: text } : null;
    }
  })();

  if (!response.ok || !data || data.ok === false) {
    return {
      ok: false,
      message: toStr((data as Record<string, unknown> | null)?.error) || `payments_worker_http_${response.status}`,
      payment_ref: context.payment_ref,
      session_id: context.session_id,
      upstream: data,
    };
  }

  return {
    ok: true,
    message: "Payment proof submitted. Status remains pending until manual review.",
    payment_ref: context.payment_ref,
    session_id: context.session_id,
    proof_write: proofWrite,
    upstream: {
      ...data,
      telegram_thread: "61",
      telegram_source: "payments-worker notifier",
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
      ${result.payment_ref ? `<p>Payment ref: <code>${escapeHtml(result.payment_ref)}</code></p>` : ""}
    </div>
  `;
}

function renderPaymentPage(context: PaymentPageContext, submission: SubmissionResult | null = null): Response {
  const qrUrl = promptPayQrUrl(context.promptpay_id, context.amount_thb);
  const canSubmit = Boolean(context.session_id && context.payment_ref && context.amount_thb && context.amount_thb > 0);
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
      .row { grid-template-columns: 1fr; gap: 4px; }
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
        <div class="qr">
          ${qrUrl ? `<img src="${escapeAttr(qrUrl)}" alt="PromptPay QR for ${escapeAttr(context.promptpay_id)}" />` : ""}
        </div>
        <div class="rows">
          <div class="row"><span>PromptPay ID</span><code>${escapeHtml(context.promptpay_id || "Not configured")}</code></div>
          <div class="row"><span>Payment ref</span><code>${escapeHtml(context.payment_ref || "Missing")}</code></div>
          <div class="row"><span>Session ID</span><code>${escapeHtml(context.session_id || "Missing")}</code></div>
          <div class="row"><span>Client</span><span>${escapeHtml(context.client_name || "MMD client")}</span></div>
          ${context.model_name ? `<div class="row"><span>Model</span><span>${escapeHtml(context.model_name)}</span></div>` : ""}
        </div>
      </div>

      <div class="panel">
        ${renderSubmission(submission)}
        ${renderWarnings(context.warnings)}
        <div class="methods">
          <article class="method">
            <h3>Bank transfer</h3>
            <p>${escapeHtml(context.bank_name)}</p>
            <p>Account name: <strong>${escapeHtml(context.bank_account_name)}</strong></p>
            <p>Account number: <code>${escapeHtml(context.bank_account_number || context.promptpay_id)}</code></p>
            ${context.bank_branch ? `<p>Branch: ${escapeHtml(context.bank_branch)}</p>` : ""}
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
          <p class="fineprint">The page keeps <code>session_id</code> and <code>payment_ref</code> inside the signed token and server lookup, so refreshes and repeat submissions remain idempotent.</p>
        </form>
      </div>
    </section>
  </main>
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
  return pathname === PAYMENT_PAGE_PATH || LEGACY_PAYMENT_PATHS.has(pathname);
}

export function canonicalPaymentRedirect(request: Request): Response | null {
  const url = new URL(request.url);
  if (!isPaymentPageRoute(url.pathname)) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return null;

  const token = toStr(url.searchParams.get("t"));
  if (!token) return null;

  const onlyT = Array.from(url.searchParams.keys()).every((key) => key === "t");
  if (url.pathname === PAYMENT_PAGE_PATH && onlyT) return null;

  const canonical = new URL(PAYMENT_PAGE_PATH, url.origin);
  canonical.searchParams.set("t", token);
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
  if (!token) return renderPaymentErrorPage("Missing payment token. Use /pay?t=...", 400);

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
        message: receiptResult.message,
        payment_ref: context.payment_ref,
        session_id: context.session_id,
      });
    }

    const result = await submitPaymentToPaymentsWorker(env, context, receiptResult.receipt);
    return renderPaymentPage(context, result);
  }

  return renderPaymentErrorPage("Method not allowed.", 405);
}

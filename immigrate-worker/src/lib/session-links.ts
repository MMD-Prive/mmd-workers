import type { Env } from "../types";
import { signLinkPayload } from "./crypto";
import {
  airtableTable,
  airtableWritesEnabled,
  createRecordWithFallbacks,
  encodeFormulaValue,
  type AirtableWriteResult,
  upsertRecordWithFallbacks,
} from "./airtable-schema";
import { buildLineClientFields, clientLookupFormula } from "./line-client-import";
import { buildModelNoteArtifacts, type ModelNotePayload } from "./model-note-enrichment";

export type CreateLinksPayload = ModelNotePayload & {
  session_id?: unknown;
  payment_ref?: unknown;
  client_name?: unknown;
  nickname?: unknown;
  mmd_client_name?: unknown;
  line_user_id?: unknown;
  email?: unknown;
  gmail?: unknown;
  phone?: unknown;
  memberstack_id?: unknown;
  model_name?: unknown;
  model_record_id?: unknown;
  job_type?: unknown;
  job_date?: unknown;
  start_time?: unknown;
  end_time?: unknown;
  location_name?: unknown;
  google_map_url?: unknown;
  amount_thb?: unknown;
  amount?: unknown;
  payment_amount_thb?: unknown;
  selected_amount_thb?: unknown;
  total_amount_thb?: unknown;
  amount_total_thb?: unknown;
  totalAmount?: unknown;
  deposit_amount_thb?: unknown;
  depositAmount?: unknown;
  final_amount_thb?: unknown;
  finalAmount?: unknown;
  payment_type?: unknown;
  payment_stage?: unknown;
  payment_method?: unknown;
  package_code?: unknown;
  package?: unknown;
  customer_name?: unknown;
  note?: unknown;
  notes?: unknown;
};

export type SessionLinkArtifacts = {
  customer_token: string;
  model_token: string;
  customer_payment_token: string;
  customer_dashboard_url: string;
  customer_payment_url: string;
  model_console_url: string;
  next_booking_url: string;
  promptpay_id: string;
};

export type CreateLinksAirtableSummary = {
  mode: "airtable" | "mock";
  writes: Record<string, AirtableWriteResult>;
  model_notes: {
    has_notes: boolean;
    status: string;
    source: string;
  };
};

type LinkBundleLike = {
  customer_token: string;
  model_token: string;
  customer_dashboard_url: string;
  model_dashboard_url: string;
};

function toStr(value: unknown): string {
  return String(value ?? "").trim();
}

function toNum(value: unknown): number | null {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function compactRecord(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== "" && value !== null && value !== undefined),
  );
}

function isLikelyGeneratedId(value: string, prefix: string): boolean {
  return new RegExp(`^${prefix}_[a-z0-9_]+_[a-z0-9]+_[a-f0-9]{8}$`, "i").test(value);
}

function realLineUserId(value: unknown): string {
  const candidate = toStr(value);
  return /^U[a-zA-Z0-9_-]{20,}$/.test(candidate) ? candidate : "";
}

function realMemberstackId(value: unknown): string {
  const candidate = toStr(value);
  if (!candidate || isLikelyGeneratedId(candidate, "customer")) return "";
  return candidate;
}

function realModelRecordId(value: unknown): string {
  const candidate = toStr(value);
  if (!candidate || isLikelyGeneratedId(candidate, "model")) return "";
  return candidate;
}

function readPaymentType(payload: CreateLinksPayload, upstream?: Record<string, unknown> | null): string {
  const raw = toStr(
    upstream?.payment_type ||
      upstream?.payment_stage ||
      payload.payment_type ||
      payload.payment_stage ||
      "deposit",
  ).toLowerCase();
  if (["deposit", "final", "tips", "full"].includes(raw)) return raw;
  return "deposit";
}

function readPaymentAmounts(
  payload: CreateLinksPayload,
  upstream?: Record<string, unknown> | null,
): {
  amount: number | null;
  total: number | null;
  deposit: number | null;
  final: number | null;
} {
  const paymentType = readPaymentType(payload, upstream);
  const total = toNum(
    upstream?.total_amount_thb ??
      upstream?.amount_total_thb ??
      upstream?.totalAmount ??
      payload.total_amount_thb ??
      payload.amount_total_thb ??
      payload.totalAmount,
  );
  const deposit = toNum(
    upstream?.deposit_amount_thb ??
      upstream?.depositAmount ??
      payload.deposit_amount_thb ??
      payload.depositAmount,
  );
  const final = toNum(
    upstream?.final_amount_thb ??
      upstream?.finalAmount ??
      payload.final_amount_thb ??
      payload.finalAmount,
  );
  const direct = toNum(
    upstream?.amount_thb ??
      upstream?.amount ??
      payload.amount_thb ??
      payload.payment_amount_thb ??
      payload.selected_amount_thb ??
      payload.amount,
  );

  if (paymentType === "deposit") {
    return { amount: deposit ?? direct ?? total, total, deposit, final };
  }
  if (paymentType === "final") {
    return { amount: final ?? direct ?? total, total, deposit, final };
  }

  return { amount: direct ?? total ?? deposit, total, deposit, final };
}

function sanitizedSourcePayload(payload: CreateLinksPayload): Record<string, unknown> {
  const copy = { ...payload } as Record<string, unknown>;
  const lineUserId = realLineUserId(copy.line_user_id);
  const memberstackId = realMemberstackId(copy.memberstack_id);
  const modelRecordId = realModelRecordId(copy.model_record_id);

  if (lineUserId) copy.line_user_id = lineUserId;
  else delete copy.line_user_id;
  if (memberstackId) copy.memberstack_id = memberstackId;
  else delete copy.memberstack_id;
  if (modelRecordId) copy.model_record_id = modelRecordId;
  else delete copy.model_record_id;

  return compactRecord(copy);
}

function baseUrl(value: unknown, fallback: string): string {
  return (toStr(value) || fallback).replace(/\/+$/, "");
}

function customerDashboardUrl(webBaseUrl: string, customerToken: string): string {
  return `${webBaseUrl}/member/first-db?t=${encodeURIComponent(customerToken)}`;
}

function modelConsoleUrl(webBaseUrl: string, modelToken: string): string {
  return `${webBaseUrl}/model/console-sigil?t=${encodeURIComponent(modelToken)}`;
}

function readTokenFromUrl(value: unknown): string {
  const raw = toStr(value);
  if (!raw) return "";

  try {
    return toStr(new URL(raw).searchParams.get("t"));
  } catch {
    try {
      return toStr(new URL(raw, "https://sigil.mmdbkk.com").searchParams.get("t"));
    } catch {
      return "";
    }
  }
}

function paymentPageUrl(sigilBaseUrl: string, token: string): string {
  return `${sigilBaseUrl}/pay?t=${encodeURIComponent(token)}`;
}

async function buildPaymentToken(
  env: Env,
  payload: CreateLinksPayload,
  upstream?: Record<string, unknown> | null,
): Promise<string> {
  const paymentType = readPaymentType(payload, upstream);
  const amounts = readPaymentAmounts(payload, upstream);
  const sessionId = toStr(upstream?.session_id || payload.session_id);
  const paymentRef = toStr(upstream?.payment_ref || upstream?.transaction_ref || payload.payment_ref);
  const clientName = toStr(
    upstream?.client_name ||
      upstream?.customer_name ||
      payload.client_name ||
      payload.mmd_client_name ||
      payload.customer_name ||
      payload.nickname,
  );
  const modelName = toStr(upstream?.model_name || payload.model_name);
  const packageCode = toStr(upstream?.package_code || payload.package_code || payload.package || payload.job_type);
  const email = toStr(
    upstream?.member_email ||
      upstream?.email ||
      payload.email ||
      payload.gmail,
  ).toLowerCase();

  return signLinkPayload(env, compactRecord({
    kind: "customer_confirm",
    role: "customer",
    source: "immigrate_worker_create_links",
    session_id: sessionId,
    immigration_id: sessionId,
    payment_ref: paymentRef,
    transaction_ref: paymentRef,
    amount_thb: amounts.amount ?? undefined,
    amount: amounts.amount ?? undefined,
    payment_amount_thb: amounts.amount ?? undefined,
    selected_amount_thb: amounts.amount ?? undefined,
    total_amount_thb: amounts.total ?? undefined,
    amount_total_thb: amounts.total ?? undefined,
    totalAmount: amounts.total ?? undefined,
    deposit_amount_thb: amounts.deposit ?? undefined,
    depositAmount: amounts.deposit ?? undefined,
    final_amount_thb: amounts.final ?? undefined,
    finalAmount: amounts.final ?? undefined,
    payment_type: paymentType,
    payment_stage: paymentType,
    payment_method: toStr(upstream?.payment_method || payload.payment_method || "promptpay"),
    client_name: clientName,
    customer_name: clientName,
    mmd_client_name: toStr(payload.mmd_client_name || clientName),
    model_name: modelName,
    model_record_id: realModelRecordId(payload.model_record_id),
    package_code: packageCode,
    member_email: email,
    email,
    line_user_id: realLineUserId(payload.line_user_id),
    memberstack_id: realMemberstackId(payload.memberstack_id),
  }));
}

export async function buildSessionLinkArtifacts(
  env: Env,
  payload: CreateLinksPayload,
  linkBundle: LinkBundleLike,
  upstream?: Record<string, unknown> | null,
): Promise<SessionLinkArtifacts> {
  const webBaseUrl = baseUrl(env.WEB_BASE_URL, "https://mmdbkk.com");
  const sigilBaseUrl = baseUrl(env.SIGIL_BASE_URL || env.PUBLIC_WEB_BASE_URL, "https://sigil.mmdbkk.com");
  const customerToken = linkBundle.customer_token;
  const modelToken = linkBundle.model_token;
  const paymentToken = await buildPaymentToken(env, payload, upstream);
  const paymentUrl = paymentPageUrl(sigilBaseUrl, paymentToken);

  return {
    customer_token: customerToken,
    model_token: modelToken,
    customer_payment_token: paymentToken,
    customer_dashboard_url: customerDashboardUrl(webBaseUrl, customerToken),
    customer_payment_url: paymentUrl,
    model_console_url: modelConsoleUrl(webBaseUrl, modelToken),
    next_booking_url: webBaseUrl,
    promptpay_id: toStr(env.PROMPTPAY_ID),
  };
}

async function safeWrite(name: string, write: () => Promise<AirtableWriteResult>): Promise<AirtableWriteResult> {
  try {
    return await write();
  } catch (error) {
    return {
      table: name,
      action: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function writeCreateLinksMigrationRecords(
  env: Env,
  payload: CreateLinksPayload,
  links: SessionLinkArtifacts,
  upstream?: Record<string, unknown> | null,
): Promise<CreateLinksAirtableSummary> {
  const modelNotes = buildModelNoteArtifacts(payload);

  if (!airtableWritesEnabled(env)) {
    return {
      mode: "mock",
      writes: {},
      model_notes: {
        has_notes: modelNotes.has_notes,
        status: modelNotes.status,
        source: modelNotes.source,
      },
    };
  }

  const sessionId = toStr(payload.session_id) || `session_${Date.now().toString(36)}`;
  const paymentRef = toStr(payload.payment_ref) || `pay_${Date.now().toString(36)}`;
  const amounts = readPaymentAmounts(payload, upstream);
  const amountThb = amounts.amount;
  const totalAmountThb = amounts.total;
  const depositAmountThb = amounts.deposit;
  const finalAmountThb = amounts.final;
  const lineUserId = realLineUserId(payload.line_user_id);
  const memberstackId = realMemberstackId(payload.memberstack_id);
  const modelRecordId = realModelRecordId(payload.model_record_id);
  const clientName = toStr(payload.client_name || payload.mmd_client_name || payload.nickname) || "MMD Client";
  const email = toStr(payload.email || payload.gmail).toLowerCase();
  const now = new Date().toISOString();
  const upstreamJson = upstream ? JSON.stringify(upstream) : "";
  const payloadJson = JSON.stringify({
    session_id: sessionId,
    payment_ref: paymentRef,
    promptpay_id: links.promptpay_id,
    links,
    amounts: {
      amount_thb: amountThb,
      total_amount_thb: totalAmountThb,
      deposit_amount_thb: depositAmountThb,
      final_amount_thb: finalAmountThb,
    },
    source_payload: sanitizedSourcePayload(payload),
  });

  const clientFields = buildLineClientFields({
    client_name: clientName,
    nickname: toStr(payload.nickname),
    mmd_client_name: toStr(payload.mmd_client_name || clientName),
    line_user_id: lineUserId,
    email,
    phone: toStr(payload.phone),
    memberstack_id: memberstackId,
    dashboard_url: links.customer_dashboard_url,
    payment_url: links.customer_payment_url,
    model_console_url: links.model_console_url,
    notes: toStr(payload.note || payload.notes),
  });

  const writes: Record<string, AirtableWriteResult> = {};
  writes.clients = await safeWrite(airtableTable(env, "clients"), () =>
    upsertRecordWithFallbacks(
      env,
      airtableTable(env, "clients"),
      clientLookupFormula({
        client_name: clientName,
        line_user_id: toStr(payload.line_user_id),
        email,
      }),
      clientFields,
    ),
  );
  writes.sessions = await safeWrite(airtableTable(env, "sessions"), () =>
    upsertRecordWithFallbacks(
      env,
      airtableTable(env, "sessions"),
      `{session_id}="${encodeFormulaValue(sessionId)}"`,
      {
        session_id: sessionId,
        payment_ref: paymentRef,
        client_name: clientName,
        model_name: toStr(payload.model_name),
        model_record_id: modelRecordId,
        job_type: toStr(payload.job_type),
        job_date: toStr(payload.job_date),
        start_time: toStr(payload.start_time),
        end_time: toStr(payload.end_time),
        location_name: toStr(payload.location_name),
        google_map_url: toStr(payload.google_map_url),
        amount_thb: totalAmountThb ?? amountThb ?? undefined,
        total_amount_thb: totalAmountThb ?? undefined,
        deposit_amount_thb: depositAmountThb ?? undefined,
        final_amount_thb: finalAmountThb ?? undefined,
        payment_stage: toStr(payload.payment_stage || payload.payment_type || "deposit"),
        session_status: "links_created",
        customer_dashboard_url: links.customer_dashboard_url,
        customer_payment_url: links.customer_payment_url,
        model_console_url: links.model_console_url,
        payload_json: payloadJson,
      },
    ),
  );
  writes.payments = await safeWrite(airtableTable(env, "payments"), () =>
    upsertRecordWithFallbacks(
      env,
      airtableTable(env, "payments"),
      `{Payment Reference}="${encodeFormulaValue(paymentRef)}"`,
      {
        "Payment Reference": paymentRef,
        payment_ref: paymentRef,
        session_id: sessionId,
        client_name: clientName,
        amount_thb: amountThb ?? undefined,
        total_amount_thb: totalAmountThb ?? undefined,
        deposit_amount_thb: depositAmountThb ?? undefined,
        final_amount_thb: finalAmountThb ?? undefined,
        payment_stage: toStr(payload.payment_stage || payload.payment_type || "deposit"),
        payment_method: toStr(payload.payment_method || "promptpay"),
        promptpay_id: links.promptpay_id,
        payment_url: links.customer_payment_url,
        status: "pending",
        payload_json: payloadJson,
      },
    ),
  );
  writes.internal_notes = await safeWrite(airtableTable(env, "internal_notes"), () =>
    createRecordWithFallbacks(env, airtableTable(env, "internal_notes"), {
      Name: `Create links - ${clientName}`,
      session_id: sessionId,
      payment_ref: paymentRef,
      client_name: clientName,
      model_name: toStr(payload.model_name),
      note_summary: toStr(payload.note || payload.notes || modelNotes.note).slice(0, 500),
      raw_note: [toStr(payload.note || payload.notes), modelNotes.note].filter(Boolean).join("\n\n"),
      customer_dashboard_url: links.customer_dashboard_url,
      customer_payment_url: links.customer_payment_url,
      model_console_url: links.model_console_url,
      payload_json: payloadJson,
      upstream_json: upstreamJson,
      created_at: now,
    }),
  );
  writes.activity_logs = await safeWrite(airtableTable(env, "activity_logs"), () =>
    createRecordWithFallbacks(env, airtableTable(env, "activity_logs"), {
      Name: `create-links:${sessionId}`,
      action: "create_links",
      actor: "immigrate-worker",
      session_id: sessionId,
      payment_ref: paymentRef,
      client_name: clientName,
      model_name: toStr(payload.model_name),
      status: "ok",
      payload_json: payloadJson,
      created_at: now,
    }),
  );

  if (modelNotes.has_notes) {
    writes.model_history_imports = await safeWrite(airtableTable(env, "model_history_imports"), () =>
      createRecordWithFallbacks(env, airtableTable(env, "model_history_imports"), {
        ...modelNotes.model_history_fields,
        session_id: sessionId,
        payment_ref: paymentRef,
        customer_dashboard_url: links.customer_dashboard_url,
        model_console_url: links.model_console_url,
      }),
    );
  }

  return {
    mode: "airtable",
    writes,
    model_notes: {
      has_notes: modelNotes.has_notes,
      status: modelNotes.status,
      source: modelNotes.source,
    },
  };
}

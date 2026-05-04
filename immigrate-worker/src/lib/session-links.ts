import type { Env } from "../types";
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
  deposit_amount_thb?: unknown;
  payment_type?: unknown;
  payment_stage?: unknown;
  payment_method?: unknown;
  note?: unknown;
  notes?: unknown;
};

export type SessionLinkArtifacts = {
  customer_token: string;
  model_token: string;
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

function baseUrl(value: unknown, fallback: string): string {
  return (toStr(value) || fallback).replace(/\/+$/, "");
}

function customerDashboardUrl(webBaseUrl: string, customerToken: string): string {
  return `${webBaseUrl}/member/first-db?t=${encodeURIComponent(customerToken)}`;
}

export function buildSessionLinkArtifacts(
  env: Env,
  payload: CreateLinksPayload,
  linkBundle: LinkBundleLike,
  upstream?: Record<string, unknown> | null,
): SessionLinkArtifacts {
  const webBaseUrl = baseUrl(env.WEB_BASE_URL, "https://mmdbkk.com");
  const sigilBaseUrl = baseUrl(env.SIGIL_BASE_URL || env.PUBLIC_WEB_BASE_URL, "https://sigil.mmdbkk.com");
  const sessionId = toStr(payload.session_id);
  const paymentRef = toStr(payload.payment_ref);
  const customerToken = linkBundle.customer_token;
  const modelToken = linkBundle.model_token;
  const paymentUrl =
    toStr(upstream?.customer_payment_url) ||
    toStr(upstream?.payment_url) ||
    `${sigilBaseUrl}/sigil/pay/session?t=${encodeURIComponent(customerToken)}&session_id=${encodeURIComponent(sessionId)}&payment_ref=${encodeURIComponent(paymentRef)}`;

  return {
    customer_token: customerToken,
    model_token: modelToken,
    customer_dashboard_url: customerDashboardUrl(webBaseUrl, customerToken),
    customer_payment_url: paymentUrl,
    model_console_url:
      toStr(upstream?.model_console_url) ||
      `${webBaseUrl}/model/console?t=${encodeURIComponent(modelToken)}`,
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
  const amountThb = toNum(payload.amount_thb ?? payload.amount);
  const depositAmountThb = toNum(payload.deposit_amount_thb);
  const clientName = toStr(payload.client_name || payload.mmd_client_name || payload.nickname) || "MMD Client";
  const email = toStr(payload.email || payload.gmail).toLowerCase();
  const now = new Date().toISOString();
  const upstreamJson = upstream ? JSON.stringify(upstream) : "";
  const payloadJson = JSON.stringify({
    session_id: sessionId,
    payment_ref: paymentRef,
    promptpay_id: links.promptpay_id,
    links,
    source_payload: payload,
  });

  const clientFields = buildLineClientFields({
    client_name: clientName,
    nickname: toStr(payload.nickname),
    mmd_client_name: toStr(payload.mmd_client_name || clientName),
    line_user_id: toStr(payload.line_user_id),
    email,
    phone: toStr(payload.phone),
    memberstack_id: toStr(payload.memberstack_id),
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
        model_record_id: toStr(payload.model_record_id),
        job_type: toStr(payload.job_type),
        job_date: toStr(payload.job_date),
        start_time: toStr(payload.start_time),
        end_time: toStr(payload.end_time),
        location_name: toStr(payload.location_name),
        google_map_url: toStr(payload.google_map_url),
        amount_thb: amountThb ?? undefined,
        deposit_amount_thb: depositAmountThb ?? undefined,
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
        deposit_amount_thb: depositAmountThb ?? undefined,
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

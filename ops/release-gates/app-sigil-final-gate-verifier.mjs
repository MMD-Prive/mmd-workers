#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { buildModelJobBoardBroadcastLink } from "../../shared/model-job-board-links.mjs";

const DEFAULT_BASE_URL = "https://sigil.mmdbkk.com";
const DEFAULT_CAMPAIGN_ID = "app-sigil-always-on-20260929";
const DEFAULT_CAMPAIGN_SOURCE = "x_campaign";
const ALLOWED_CAMPAIGN_HOSTS = new Set(["www.mmdbkk.com", "mmdbkk.com", "miniapp.line.me"]);
const SENSITIVE_RECEIPT_RE = /mmd_job_board_handoff|line_user_id|cookie|authorization|id_token|access_token|payment|customer_payload/i;

function clean(value = "", max = 500) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function required(value, code) {
  const out = clean(value, 1000);
  if (!out) throw new Error(code);
  return out;
}

function assertHttpsUrl(value, code) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw new Error(code);
  }
  if (url.protocol !== "https:") throw new Error(code);
  return url;
}

export function buildCampaignDestination(input = {}) {
  const explicit = clean(input.destinationUrl || process.env.CAMPAIGN_DESTINATION_URL, 2000);
  if (explicit) return validateCampaignDestinationUrl(explicit).toString();

  const campaignId = clean(input.campaignId || process.env.CAMPAIGN_ID || DEFAULT_CAMPAIGN_ID, 128);
  const source = clean(input.source || process.env.CAMPAIGN_SOURCE || DEFAULT_CAMPAIGN_SOURCE, 80);
  const jobId = clean(input.jobId || process.env.HANDOFF_JOB_ID || process.env.CAMPAIGN_JOB_ID, 128);
  const next = clean(input.next || process.env.CAMPAIGN_NEXT, 2000);
  return buildModelJobBoardBroadcastLink({ source, campaign_id: campaignId, job_id: jobId, next });
}

export function validateCampaignDestinationUrl(value) {
  const url = assertHttpsUrl(value, "campaign_destination_url_invalid");
  if (!ALLOWED_CAMPAIGN_HOSTS.has(url.hostname)) throw new Error("campaign_destination_host_invalid");

  if (url.hostname === "miniapp.line.me") {
    if (!url.pathname.startsWith("/2010864854-N34SgCqq")) throw new Error("campaign_destination_miniapp_invalid");
    return url;
  }

  if (url.pathname !== "/sigil/model/login") throw new Error("campaign_destination_path_invalid");
  if (url.searchParams.get("intent") !== "job_board") throw new Error("campaign_destination_intent_invalid");
  if (url.searchParams.get("return_to") !== "public_job_board") throw new Error("campaign_destination_return_invalid");
  const next = assertHttpsUrl(url.searchParams.get("next") || "", "campaign_destination_next_invalid");
  if (next.origin !== DEFAULT_BASE_URL || !next.pathname.startsWith("/public/api/jobs")) {
    throw new Error("campaign_destination_next_invalid");
  }
  if (!clean(url.searchParams.get("campaign_id"), 128)) throw new Error("campaign_destination_campaign_id_required");
  return url;
}

export async function verifyCampaignDestination(input = {}) {
  const fetchImpl = input.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("fetch_unavailable");

  const destination = buildCampaignDestination(input);
  const url = validateCampaignDestinationUrl(destination);
  const response = await fetchImpl(url.toString(), {
    method: "GET",
    redirect: "manual",
    headers: {
      Accept: "text/html,application/json;q=0.8,*/*;q=0.5",
      "User-Agent": "mmd-app-sigil-final-gate-verifier/1",
      ...(input.headers || {}),
    },
  });

  const status = Number(response.status || 0);
  if (status < 200 || status === 404 || status >= 500) {
    throw new Error(`campaign_destination_http_${status || "missing"}`);
  }

  const redirectLocation = typeof response.headers?.get === "function" ? clean(response.headers.get("location"), 2000) : "";
  if ([301, 302, 303, 307, 308].includes(status) && !redirectLocation) {
    throw new Error("campaign_destination_redirect_missing_location");
  }

  let bodyCheck = "not_read";
  if (status === 200 && typeof response.text === "function") {
    const body = await response.text();
    if (/page\s+not\s+found|404\s+not\s+found|this\s+page\s+could\s+not\s+be\s+found/i.test(body.slice(0, 5000))) {
      throw new Error("campaign_destination_not_found_body");
    }
    bodyCheck = "ok";
  }

  return {
    status: "pass",
    checked_at: new Date().toISOString(),
    campaign_destination_url: url.toString(),
    http_status: status,
    redirect_location: redirectLocation || null,
    body_check: bodyCheck,
    campaign_id: url.searchParams.get("campaign_id") || null,
    intent: url.searchParams.get("intent") || null,
    next: url.searchParams.get("next") || null,
  };
}

export async function verifyModelHandoffReceipt(input = {}) {
  const fetchImpl = input.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("fetch_unavailable");

  const internalToken = required(
    input.internalToken || process.env.PUBLIC_ACCESS_INTERNAL_TOKEN || process.env.INTERNAL_TOKEN,
    "handoff_internal_token_required",
  );
  const modelRecordId = required(input.modelRecordId || process.env.HANDOFF_MODEL_RECORD_ID, "handoff_model_record_id_required");
  const jobId = required(input.jobId || process.env.HANDOFF_JOB_ID, "handoff_job_id_required");
  if (!/^rec[A-Za-z0-9]{14}$/.test(modelRecordId)) throw new Error("handoff_model_record_id_invalid");
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,99}$/.test(jobId)) throw new Error("handoff_job_id_invalid");

  const baseUrl = clean(input.baseUrl || process.env.BASE_URL || DEFAULT_BASE_URL, 2000);
  const url = new URL("/public/api/jobs/internal/handoffs", assertHttpsUrl(baseUrl, "handoff_base_url_invalid"));
  url.searchParams.set("model_record_id", modelRecordId);
  url.searchParams.set("job_id", jobId);

  const response = await fetchImpl(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "mmd-app-sigil-final-gate-verifier/1",
      "x-internal-token": internalToken,
      ...(input.headers || {}),
    },
  });

  const httpStatus = Number(response.status || 0);
  if (httpStatus !== 200) throw new Error(`handoff_receipt_http_${httpStatus || "missing"}`);
  const body = await response.json();
  if (body?.ok !== true || !Array.isArray(body.handoffs)) throw new Error("handoff_receipt_body_invalid");

  const receipt = body.handoffs.find((row) => row?.model_record_id === modelRecordId && row?.job_id === jobId);
  if (!receipt) throw new Error("handoff_receipt_not_found");
  if (receipt.schema !== "mmd_public_job_board_v2.model_handoff_receipt") throw new Error("handoff_receipt_schema_invalid");
  if (!/^handoff_[a-f0-9]{24}$/.test(String(receipt.receipt_ref || ""))) throw new Error("handoff_receipt_ref_invalid");
  if (receipt.source !== "validated_model_handoff") throw new Error("handoff_receipt_source_invalid");
  if (!String(receipt.target_path || "").startsWith("/public/api/jobs")) throw new Error("handoff_receipt_target_invalid");
  if (!Number.isFinite(Date.parse(receipt.verified_at))) throw new Error("handoff_receipt_verified_at_invalid");
  if (SENSITIVE_RECEIPT_RE.test(JSON.stringify(receipt))) throw new Error("handoff_receipt_sensitive_payload_leak");

  return {
    status: "pass",
    checked_at: new Date().toISOString(),
    receipt_ref: receipt.receipt_ref,
    model_record_id: receipt.model_record_id,
    job_id: receipt.job_id,
    target_path: receipt.target_path,
    verified_at: receipt.verified_at,
    source: receipt.source,
  };
}

export function summarizeGateEvidence({ handoff, campaign } = {}) {
  if (!handoff || handoff.status !== "pass") throw new Error("handoff_evidence_required");
  if (!campaign || campaign.status !== "pass") throw new Error("campaign_destination_evidence_required");
  return {
    schema: "mmd.app_sigil_final_gate_evidence.v1",
    generated_at: new Date().toISOString(),
    gates: {
      mmd_app_job_handoff: handoff,
      campaign_destination_smoke: campaign,
    },
    release_gate_update_policy: "Paste the generated gate evidence into ops/release-gates/app-sigil-always-on.json only after this production verifier ran against the real post-LIFF handoff and real campaign destination URL.",
  };
}

export async function runFinalGateVerifier(input = {}) {
  const campaign = await verifyCampaignDestination(input);
  const handoff = await verifyModelHandoffReceipt(input);
  return summarizeGateEvidence({ handoff, campaign });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runFinalGateVerifier()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(JSON.stringify({ ok: false, error: String(error?.message || error) }, null, 2));
      process.exitCode = 1;
    });
}

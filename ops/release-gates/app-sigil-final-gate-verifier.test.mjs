import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCampaignDestination,
  verifyCampaignDestination,
  verifyModelHandoffReceipt,
  summarizeGateEvidence,
} from "./app-sigil-final-gate-verifier.mjs";

function headers(values = {}) {
  const map = new Map(Object.entries(values).map(([key, value]) => [key.toLowerCase(), value]));
  return { get: (key) => map.get(String(key).toLowerCase()) || null };
}

function mockResponse({ status = 200, body = {}, text = "", responseHeaders = {} } = {}) {
  return {
    status,
    headers: headers(responseHeaders),
    json: async () => body,
    text: async () => text,
  };
}

test("buildCampaignDestination creates the canonical MY MODEL job-board campaign URL", () => {
  const value = buildCampaignDestination({ campaignId: "app-sigil-test", source: "x_campaign" });
  const url = new URL(value);
  assert.equal(url.origin, "https://www.mmdbkk.com");
  assert.equal(url.pathname, "/sigil/model/login");
  assert.equal(url.searchParams.get("intent"), "job_board");
  assert.equal(url.searchParams.get("source"), "x_campaign");
  assert.equal(url.searchParams.get("return_to"), "public_job_board");
  assert.equal(url.searchParams.get("campaign_id"), "app-sigil-test");
  assert.equal(url.searchParams.get("next"), "https://sigil.mmdbkk.com/public/api/jobs");
});

test("verifyCampaignDestination accepts a live non-404 campaign landing response", async () => {
  let requestedUrl = "";
  const evidence = await verifyCampaignDestination({
    campaignId: "app-sigil-test",
    fetchImpl: async (url) => {
      requestedUrl = String(url);
      return mockResponse({ status: 200, text: "<html><title>MY MODEL</title></html>" });
    },
  });

  assert.equal(new URL(requestedUrl).searchParams.get("campaign_id"), "app-sigil-test");
  assert.equal(evidence.status, "pass");
  assert.equal(evidence.http_status, 200);
  assert.equal(evidence.body_check, "ok");
});

test("verifyCampaignDestination rejects an invalid or missing ad destination", async () => {
  await assert.rejects(
    () => verifyCampaignDestination({ destinationUrl: "https://evil.example/sigil/model/login", fetchImpl: async () => mockResponse() }),
    /campaign_destination_host_invalid/,
  );

  await assert.rejects(
    () => verifyCampaignDestination({
      campaignId: "app-sigil-test",
      fetchImpl: async () => mockResponse({ status: 404, text: "404 Not Found" }),
    }),
    /campaign_destination_http_404/,
  );
});

test("verifyModelHandoffReceipt requires the real owner token, Model record and Job ID", async () => {
  await assert.rejects(
    () => verifyModelHandoffReceipt({ fetchImpl: async () => mockResponse() }),
    /handoff_internal_token_required/,
  );

  await assert.rejects(
    () => verifyModelHandoffReceipt({ internalToken: "secret", fetchImpl: async () => mockResponse() }),
    /handoff_model_record_id_required/,
  );
});

test("verifyModelHandoffReceipt accepts only safe validated production receipts", async () => {
  let authHeader = "";
  const receipt = {
    schema: "mmd_public_job_board_v2.model_handoff_receipt",
    receipt_ref: "handoff_0123456789abcdef01234567",
    model_record_id: "rec12345678901234",
    job_id: "JOB-20261001-HANDOFF1",
    target_path: "/public/api/jobs/JOB-20261001-HANDOFF1",
    verified_at: "2026-09-29T06:00:00.000Z",
    source: "validated_model_handoff",
  };

  const evidence = await verifyModelHandoffReceipt({
    internalToken: "owner-secret",
    modelRecordId: "rec12345678901234",
    jobId: "JOB-20261001-HANDOFF1",
    fetchImpl: async (_url, init = {}) => {
      authHeader = init.headers["x-internal-token"];
      return mockResponse({ status: 200, body: { ok: true, handoffs: [receipt] } });
    },
  });

  assert.equal(authHeader, "owner-secret");
  assert.equal(evidence.status, "pass");
  assert.equal(evidence.receipt_ref, receipt.receipt_ref);
  assert.equal(evidence.model_record_id, receipt.model_record_id);
  assert.equal(evidence.job_id, receipt.job_id);
});

test("verifyModelHandoffReceipt rejects sensitive handoff payload leaks", async () => {
  await assert.rejects(
    () => verifyModelHandoffReceipt({
      internalToken: "owner-secret",
      modelRecordId: "rec12345678901234",
      jobId: "JOB-20261001-HANDOFF1",
      fetchImpl: async () => mockResponse({
        status: 200,
        body: { ok: true, handoffs: [{
          schema: "mmd_public_job_board_v2.model_handoff_receipt",
          receipt_ref: "handoff_0123456789abcdef01234567",
          model_record_id: "rec12345678901234",
          job_id: "JOB-20261001-HANDOFF1",
          target_path: "/public/api/jobs/JOB-20261001-HANDOFF1",
          verified_at: "2026-09-29T06:00:00.000Z",
          source: "validated_model_handoff",
          mmd_job_board_handoff: "raw-token",
        }] },
      }),
    }),
    /handoff_receipt_sensitive_payload_leak/,
  );
});

test("summarizeGateEvidence requires both final gates", () => {
  const handoff = {
    status: "pass",
    receipt_ref: "handoff_0123456789abcdef01234567",
    model_record_id: "rec12345678901234",
    job_id: "JOB-20261001-HANDOFF1",
  };
  const campaign = {
    status: "pass",
    campaign_destination_url: "https://www.mmdbkk.com/sigil/model/login?intent=job_board&return_to=public_job_board&campaign_id=app-sigil-test&next=https%3A%2F%2Fsigil.mmdbkk.com%2Fpublic%2Fapi%2Fjobs",
  };
  const summary = summarizeGateEvidence({ handoff, campaign });
  assert.equal(summary.schema, "mmd.app_sigil_final_gate_evidence.v1");
  assert.equal(summary.gates.mmd_app_job_handoff.receipt_ref, handoff.receipt_ref);
  assert.equal(summary.gates.campaign_destination_smoke.campaign_destination_url, campaign.campaign_destination_url);
});

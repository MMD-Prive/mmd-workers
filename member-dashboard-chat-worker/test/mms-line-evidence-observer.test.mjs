import assert from "node:assert/strict";
import test from "node:test";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const {
  observeMmsLineEvidence,
  MMS_LINE_EVIDENCE_INTERNALS,
} = await import("../src/mms-line-evidence-observer.mjs");

async function sign(body, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))).toString("base64");
}

function webhookRequest(body, signature) {
  return new Request("https://mmdbkk.com/webhooks/line/mms", {
    method: "POST",
    headers: { "content-type": "application/json", "x-line-signature": signature },
    body,
  });
}

function imageEvent(overrides = {}) {
  return {
    type: "message",
    webhookEventId: "mms-wh-001",
    timestamp: 1788792000000,
    deliveryContext: { isRedelivery: false },
    source: { type: "group", groupId: "CmaleMassageGroup", userId: "Uowner" },
    message: { type: "image", id: "mms-image-001" },
    ...overrides,
  };
}

function fileEvent(overrides = {}) {
  return {
    type: "message",
    webhookEventId: "mms-wh-file-001",
    timestamp: 1788792000000,
    deliveryContext: { isRedelivery: false },
    source: { type: "group", groupId: "CmaleMassageGroup", userId: "Uowner" },
    message: { type: "file", id: "mms-file-001", fileName: "therapist-document.pdf" },
    ...overrides,
  };
}

function baseEnv(r2) {
  return {
    MMS_LINE_CHANNEL_SECRET: "mms-secret",
    MMS_LINE_CHANNEL_ACCESS_TOKEN: "mms-access-token",
    MMS_LINE_GROUP_ID: "CmaleMassageGroup",
    MMS_LINE_SOURCE_GROUP_NAME: "Male Massage",
    AIRTABLE_BASE_ID: "appMmsEvidenceTest",
    AIRTABLE_API_KEY: "airtable-token",
    AIRTABLE_TABLE_PAYMENT_PROOFS_ID: "tblPaymentProofs",
    AIRTABLE_TABLE_MODEL_HISTORY_IMPORTS_ID: "tblModelHistory",
    LINE_SLIP_EVIDENCE: r2,
  };
}

test("MMS observer maps the approved group into the canonical MMD group-slip environment", async () => {
  const mapped = await MMS_LINE_EVIDENCE_INTERNALS.buildMmsEvidenceEnv(baseEnv({}));
  assert.equal(mapped.LINE_CHANNEL_ACCESS_TOKEN, "mms-access-token");
  assert.match(mapped.LINE_PAYMENT_PROOF_GROUP_HASHES, /^[a-f0-9]{64}$/);
});

test("MMS group image uses the same pending Payment Proof evidence core and dedupes redelivery", async () => {
  const originalFetch = globalThis.fetch;
  let proofCreated = false;
  let proofPost = null;
  let r2Puts = 0;
  const r2 = {
    async head() { return null; },
    async put() { r2Puts += 1; },
  };

  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = String(init?.method || "GET").toUpperCase();
    if (url.includes("api-data.line.me/v2/bot/message/mms-image-001/content")) {
      return new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { "content-type": "image/png", "content-length": "4" },
      });
    }
    if (url.includes("api.airtable.com") && url.includes("tblPaymentProofs") && method === "GET") {
      return Response.json({ records: proofCreated ? [{ id: "recProofExisting", fields: {} }] : [] });
    }
    if (url.includes("api.airtable.com") && url.includes("tblPaymentProofs") && method === "POST") {
      proofPost = JSON.parse(String(init.body || "{}"));
      proofCreated = true;
      return Response.json({ id: "recProofCreated", fields: proofPost.fields || {} });
    }
    throw new Error(`unexpected_fetch:${method}:${url}`);
  };

  try {
    const body = JSON.stringify({ events: [imageEvent()] });
    const signature = await sign(body, "mms-secret");
    const first = await observeMmsLineEvidence(webhookRequest(body, signature), baseEnv(r2));
    assert.equal(first.images_captured, 1);
    assert.equal(first.failed, 0);
    assert.equal(r2Puts, 1);
    assert.equal(proofPost.fields.status, "pending");
    assert.equal(proofPost.fields.channel, "line_ofc");
    const note = JSON.parse(proofPost.fields.note);
    assert.equal(note.schema, "line_payment_evidence_v2");
    assert.equal(note.payment_truth, "unverified");
    assert.equal(note.may_mark_paid, false);
    assert.equal(note.may_award_points, false);
    assert.equal(note.may_extend_membership, false);
    assert.equal(note.may_confirm_session, false);

    const redeliveredBody = JSON.stringify({
      events: [imageEvent({ deliveryContext: { isRedelivery: true } })],
    });
    const redeliveredSignature = await sign(redeliveredBody, "mms-secret");
    const second = await observeMmsLineEvidence(webhookRequest(redeliveredBody, redeliveredSignature), baseEnv(r2));
    assert.equal(second.images_captured, 1);
    assert.equal(second.deduped, 1);
    assert.equal(r2Puts, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("MMS LINE file evidence is private R2 plus Model History metadata only", async () => {
  const originalFetch = globalThis.fetch;
  let historyPost = null;
  let r2Put = null;
  const r2 = {
    async head() { return null; },
    async put(key, body, options) { r2Put = { key, body, options }; },
  };

  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = String(init?.method || "GET").toUpperCase();
    if (url.includes("api-data.line.me/v2/bot/message/mms-file-001/content")) {
      return new Response(new Uint8Array([37, 80, 68, 70]), {
        status: 200,
        headers: { "content-type": "application/pdf", "content-length": "4" },
      });
    }
    if (url.includes("api.airtable.com") && url.includes("tblModelHistory") && method === "GET") {
      return Response.json({ records: [] });
    }
    if (url.includes("api.airtable.com") && url.includes("tblModelHistory") && method === "POST") {
      historyPost = JSON.parse(String(init.body || "{}"));
      return Response.json({ id: "recHistory", fields: historyPost.fields || {} });
    }
    throw new Error(`unexpected_fetch:${method}:${url}`);
  };

  try {
    const body = JSON.stringify({ events: [fileEvent()] });
    const signature = await sign(body, "mms-secret");
    const result = await observeMmsLineEvidence(webhookRequest(body, signature), baseEnv(r2));
    assert.equal(result.files_captured, 1);
    assert.equal(result.failed, 0);
    assert.match(r2Put.key, /^line-mms\/operational-evidence\//);
    assert.equal(historyPost.fields.source_name, "mms_line_group");
    assert.equal(historyPost.fields.source_group_name, "Male Massage");
    assert.equal(historyPost.fields.raw_text, "therapist-document.pdf");
    const note = JSON.parse(historyPost.fields.admin_note);
    assert.equal(note.tenant, "mms");
    assert.equal(note.evidence_only, true);
    assert.equal(note.truth_mutation_allowed, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("MMS evidence observer rejects wrong signature and wrong group", async () => {
  const body = JSON.stringify({ events: [imageEvent()] });
  const bad = await observeMmsLineEvidence(webhookRequest(body, "bad-signature"), baseEnv({}));
  assert.equal(bad.reason, "signature_rejected");

  const signature = await sign(body, "mms-secret");
  const env = baseEnv({ async head() { return null; }, async put() {} });
  env.MMS_LINE_GROUP_ID = "CsomeOtherGroup";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("fetch_should_not_run_for_wrong_group"); };
  try {
    const wrongGroup = await observeMmsLineEvidence(webhookRequest(body, signature), env);
    assert.equal(wrongGroup.images_captured, 0);
    assert.equal(wrongGroup.skipped, 1);
    assert.equal(wrongGroup.failed, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

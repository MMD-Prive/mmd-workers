import assert from "node:assert/strict";
import test from "node:test";
import worker, { ProtocolPublishCoordinator, publishedSnapshot, runQaChecks } from "../src/index.js";

const REGISTRY_ID = "tbllGMkWNjdhuaTyh";
const QA_ID = "tblnaZZ0SXTRTQRK4";
const ACTIVITY_ID = "tblbUWRoFL6OI6QMJ";

function baseRegistry() {
  return {
    id: "recProtocol000001",
    fields: {
      "Protocol Key": "payments",
      Title: "Payments Protocol",
      Domain: "Payments",
      Status: "QA Passed",
      "Draft Version": 2,
      "Draft Text": "Payment timing and evidence are defined by the authoritative payments backend.",
      "Published Version": 1,
      "Published Text": "Old published copy.",
      Owner: "Per",
      "Risk Level": "Critical",
      "Source of Truth": "Airtable canonical base",
    },
  };
}

function qaRecord(passed = true) {
  return {
    id: "recQa00000000001",
    fields: {
      "QA Run ID": "qa_payments_2_test",
      "Protocol Key": "payments",
      "Draft Version": 2,
      Passed: passed,
      "Checks JSON": "[]",
      "Result Summary": passed ? "pass" : "fail",
      "Ran At": "2026-09-05T04:00:00.000Z",
      "Ran By": "boss-per",
      "Request ID": "qa-request-001",
    },
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function airtableHarness({ auditFails = false, qaPass = true } = {}) {
  let registry = structuredClone(baseRegistry());
  const audits = [];
  const cache = [];
  const calls = [];

  const fetchMock = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = (init.method || "GET").toUpperCase();
    calls.push({ url: url.toString(), method });

    if (url.pathname.includes(`/${REGISTRY_ID}`)) {
      if (method === "GET") return jsonResponse({ records: [structuredClone(registry)] });
      if (method === "PATCH") {
        const payload = JSON.parse(init.body);
        registry.fields = { ...registry.fields, ...payload.records[0].fields };
        return jsonResponse({ records: [structuredClone(registry)] });
      }
    }

    if (url.pathname.includes(`/${QA_ID}`) && method === "GET") {
      return jsonResponse({ records: qaPass ? [qaRecord(true)] : [] });
    }

    if (url.pathname.includes(`/${ACTIVITY_ID}`)) {
      if (method === "GET") return jsonResponse({ records: [] });
      if (method === "POST") {
        if (auditFails) return jsonResponse({ error: { message: "audit unavailable" } }, 500);
        const payload = JSON.parse(init.body);
        const record = { id: `recAudit${audits.length + 1}`, fields: payload.records[0].fields };
        audits.push(record);
        return jsonResponse({ records: [record] });
      }
    }

    return jsonResponse({ error: { message: `unexpected ${method} ${url.pathname}` } }, 500);
  };

  const env = {
    AIRTABLE_API_KEY: "test-airtable",
    AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
    AIRTABLE_PROTOCOL_REGISTRY_ID: REGISTRY_ID,
    AIRTABLE_PROTOCOL_QA_RUNS_ID: QA_ID,
    AIRTABLE_ACTIVITY_LOGS_ID: ACTIVITY_ID,
    PROTOCOLS_KV: {
      async put(key, value) {
        cache.push({ key, value: JSON.parse(value) });
      },
    },
  };

  return {
    env,
    fetchMock,
    cache,
    audits,
    calls,
    registry: () => structuredClone(registry),
  };
}

function publishRequest(requestId = "publish-request-001") {
  return new Request("https://mmdbkk.com/v1/admin/protocols/payments/publish", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": requestId,
      "X-MMD-Protocol-Trusted": "1",
      "X-MMD-Protocol-Actor-Id": "boss-per",
      "X-MMD-Protocol-Actor-Role": "owner",
    },
    body: JSON.stringify({ expected_version: 2, change_summary: "Publish QA-approved payment copy." }),
  });
}

test("QA checks require review stage, meaningful text, identity fields and newer version", () => {
  const record = baseRegistry();
  record.fields.Status = "In Review";
  const checks = runQaChecks(record);
  assert.equal(checks.every((check) => check.passed), true);
  record.fields["Draft Text"] = "short";
  assert.equal(runQaChecks(record).find((check) => check.name === "draft_text_present").passed, false);
});

test("published snapshot contains only bounded published fields", () => {
  const record = baseRegistry();
  record.fields["Published Version"] = 2;
  record.fields["Published Text"] = record.fields["Draft Text"];
  const snapshot = publishedSnapshot(record);
  assert.equal(snapshot.protocol_key, "payments");
  assert.equal(snapshot.version, 2);
  assert.equal(snapshot.source_of_truth, "Airtable canonical base");
  assert.equal("draft_text" in snapshot, false);
});

test("worker fails closed when canonical admin session authority rejects cookie", async () => {
  const response = await worker.fetch(
    new Request("https://mmdbkk.com/v1/admin/protocols", {
      headers: { Cookie: "mmd_admin_gate_v1=fake" },
    }),
    { ADMIN_WORKER: { fetch: async () => jsonResponse({ ok: false, authenticated: false }, 401) } },
  );
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "unauthorized");
});

test("Publish requires exact-version passing QA, promotes draft, audits, then caches", async () => {
  const harness = airtableHarness();
  const previousFetch = globalThis.fetch;
  globalThis.fetch = harness.fetchMock;
  try {
    const coordinator = new ProtocolPublishCoordinator({}, harness.env);
    const response = await coordinator.fetch(publishRequest());
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.item.status, "Published");
    assert.equal(body.item.published_version, 2);
    assert.equal(body.item.published_text, baseRegistry().fields["Draft Text"]);
    assert.equal(harness.audits.length, 1);
    assert.equal(harness.audits[0].fields.event_type, "protocol.publish");
    assert.equal(harness.cache.length, 1);
    assert.equal(harness.cache[0].value.version, 2);
    assert.equal(harness.registry().fields["Published Version"], 2);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Publish refuses when exact draft version has no passing QA", async () => {
  const harness = airtableHarness({ qaPass: false });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = harness.fetchMock;
  try {
    const coordinator = new ProtocolPublishCoordinator({}, harness.env);
    const response = await coordinator.fetch(publishRequest("publish-request-002"));
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "qa_required");
    assert.equal(harness.cache.length, 0);
    assert.equal(harness.audits.length, 0);
    assert.equal(harness.registry().fields["Published Version"], 1);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Audit failure rolls Airtable publish back and never refreshes KV", async () => {
  const harness = airtableHarness({ auditFails: true });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = harness.fetchMock;
  try {
    const coordinator = new ProtocolPublishCoordinator({}, harness.env);
    const response = await coordinator.fetch(publishRequest("publish-request-003"));
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.equal(body.error, "audit_write_failed");
    assert.equal(body.rolled_back, true);
    assert.equal(harness.registry().fields.Status, "QA Passed");
    assert.equal(harness.registry().fields["Published Version"], 1);
    assert.equal(harness.registry().fields["Published Text"], "Old published copy.");
    assert.equal(harness.cache.length, 0);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

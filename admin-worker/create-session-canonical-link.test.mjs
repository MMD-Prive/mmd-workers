import assert from "node:assert/strict";
import test from "node:test";

import {
  handleCanonicalLinkedJobCreate,
  isCanonicalLinkedJobCreate,
} from "./src/create-session-canonical-link-runtime.js";

const ENV = {
  AIRTABLE_API_KEY: "test-airtable-token",
  AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
  AIRTABLE_TABLE_CLIENTS_ID: "tblVv58TCbwh5j1fS",
  AIRTABLE_TABLE_MODELS: "tblI4B0bI446vp9GX",
  AIRTABLE_TABLE_SESSIONS: "tblC98mKWbzmPuNzX",
  AIRTABLE_TABLE_JOBS: "tbl0jxIjN8QYwGABX",
};

const CLIENT_ID = "recCLIENT00000001";
const MODEL_ID = "recMODEL000000001";
const SESSION_RECORD_ID = "recSESSION0000001";
const JOB_RECORD_ID = "recJOB00000000001";

function request(body) {
  return new Request("https://mmdbkk.com/v1/admin/job/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function baseBody(overrides = {}) {
  return {
    client_name: "LINE Client",
    model_name: "Mira",
    job_type: "private",
    job_date: "2026-09-20",
    start_time: "19:00",
    end_time: "21:00",
    location_name: "Sukhumvit",
    amount_thb: 15000,
    ...overrides,
  };
}

function linkedBody(overrides = {}) {
  return baseBody({
    client_lineage: {
      client_id: CLIENT_ID,
      client_name: "LINE Client",
      line_user_id: "U-line-001",
      lineage_source: "line_ofc",
    },
    line_identity: { line_user_id: "U-line-001" },
    model: {
      model_id: MODEL_ID,
      model_name: "Mira",
      source: "r2_migrated",
    },
    job_details: {
      job_date: "2026-09-20",
      start_time: "19:00",
      end_time: "21:00",
      location_name: "Sukhumvit",
    },
    payment: { amount_thb: 15000 },
    ...overrides,
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function urlString(input) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function tableFrom(url) {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  return decodeURIComponent(parts[2] || "");
}

function recordFrom(url) {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  return decodeURIComponent(parts[3] || "");
}

function makeFetch({ lineUserId = "U-line-001", existingJob = false } = {}) {
  const calls = [];
  const fetch = async (input, init = {}) => {
    const url = urlString(input);
    const method = String(init.method || "GET").toUpperCase();
    const table = tableFrom(url);
    const recordId = recordFrom(url);
    calls.push({ url, method, body: init.body ? JSON.parse(init.body) : null });

    if (method === "GET" && table === ENV.AIRTABLE_TABLE_CLIENTS_ID && recordId === CLIENT_ID) {
      return json({ id: CLIENT_ID, fields: { "Client Name": "LINE Client", line_user_id: lineUserId, primary_channel: "line" } });
    }
    if (method === "GET" && table === ENV.AIRTABLE_TABLE_MODELS && recordId === MODEL_ID) {
      return json({
        id: MODEL_ID,
        fields: {
          working_name: "Mira",
          storage_source_primary: "r2",
          is_migrated_to_r2: true,
          r2_prefix: "private/Premium/Mira",
          registry_record_type: "Existing Model Record",
          intake_gate_status: "Complete",
        },
      });
    }

    if (method === "GET" && table === ENV.AIRTABLE_TABLE_SESSIONS) {
      return json({ records: [{ id: SESSION_RECORD_ID, fields: { session_id: "sess_001", job_id: "" } }] });
    }
    if (method === "PATCH" && table === ENV.AIRTABLE_TABLE_SESSIONS && recordId === SESSION_RECORD_ID) {
      return json({ id: SESSION_RECORD_ID, fields: init.body ? JSON.parse(init.body).fields : {} });
    }

    if (method === "GET" && table === ENV.AIRTABLE_TABLE_JOBS) {
      if (existingJob) {
        return json({ records: [{ id: JOB_RECORD_ID, fields: { session_id: "sess_001", job_id: "JOB-EXISTING" } }] });
      }
      return json({ records: [] });
    }
    if (method === "PATCH" && table === ENV.AIRTABLE_TABLE_JOBS && recordId === JOB_RECORD_ID) {
      return json({ id: JOB_RECORD_ID, fields: JSON.parse(init.body).fields });
    }
    if (method === "POST" && table === ENV.AIRTABLE_TABLE_JOBS) {
      return json({ id: JOB_RECORD_ID, fields: JSON.parse(init.body).fields });
    }

    throw new Error(`unexpected fetch ${method} ${url}`);
  };
  return { fetch, calls };
}

test("recognizes only POST /v1/admin/job/create", () => {
  assert.equal(isCanonicalLinkedJobCreate("/v1/admin/job/create", "POST"), true);
  assert.equal(isCanonicalLinkedJobCreate("/v1/admin/job/create", "GET"), false);
  assert.equal(isCanonicalLinkedJobCreate("/v1/admin/job/draft", "POST"), false);
});

test("allows typed Client and Model names without canonical IDs", async () => {
  const originalFetch = globalThis.fetch;
  const mock = makeFetch();
  globalThis.fetch = mock.fetch;
  try {
    let downstreamCalls = 0;
    const response = await handleCanonicalLinkedJobCreate(
      request(baseBody()),
      ENV,
      {},
      { fetch: async () => { downstreamCalls += 1; return json({ ok: true, session_id: "sess_001" }); } },
    );
    assert.equal(response.status, 200);
    assert.equal(downstreamCalls, 1);
    const data = await response.json();
    assert.equal(data.linkage.status, "pending");
    assert.equal(data.linkage.client_link_status, "pending");
    assert.equal(data.linkage.model_link_status, "pending");
    assert.equal(data.linkage.client_record_id, null);
    assert.equal(data.linkage.model_record_id, null);

    assert.equal(mock.calls.some((c) => c.method === "GET" && tableFrom(c.url) === ENV.AIRTABLE_TABLE_CLIENTS_ID), false);
    assert.equal(mock.calls.some((c) => c.method === "GET" && tableFrom(c.url) === ENV.AIRTABLE_TABLE_MODELS), false);

    const sessionPatches = mock.calls.filter((c) => c.method === "PATCH" && tableFrom(c.url) === ENV.AIRTABLE_TABLE_SESSIONS);
    assert.equal(sessionPatches.length, 0);
    const jobCreate = mock.calls.find((c) => c.method === "POST" && tableFrom(c.url) === ENV.AIRTABLE_TABLE_JOBS);
    assert.equal(jobCreate.body.fields["Model (โมเดล)"], "Mira");
    assert.equal("Client (ลูกค้า)" in jobCreate.body.fields, false);
    assert.equal("Canonical Model" in jobCreate.body.fields, false);
    assert.match(jobCreate.body.fields["Internal Notes"], /Client snapshot: LINE Client/);
    assert.match(jobCreate.body.fields["Internal Notes"], /progressive identity flow/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("links only Client when Model is still pending", async () => {
  const originalFetch = globalThis.fetch;
  const mock = makeFetch();
  globalThis.fetch = mock.fetch;
  try {
    const body = baseBody({
      client_lineage: {
        client_id: CLIENT_ID,
        client_name: "LINE Client",
        line_user_id: "U-line-001",
        lineage_source: "line_ofc",
      },
    });
    const response = await handleCanonicalLinkedJobCreate(
      request(body), ENV, {}, { fetch: async () => json({ ok: true, session_id: "sess_001" }) },
    );
    const data = await response.json();
    assert.equal(data.linkage.status, "partial");
    assert.equal(data.linkage.client_link_status, "linked");
    assert.equal(data.linkage.model_link_status, "pending");

    const sessionPatch = mock.calls.find((c) => c.method === "PATCH" && tableFrom(c.url) === ENV.AIRTABLE_TABLE_SESSIONS);
    assert.deepEqual(sessionPatch.body.fields.Client, [CLIENT_ID]);
    assert.equal("Canonical Model" in sessionPatch.body.fields, false);

    const jobCreate = mock.calls.find((c) => c.method === "POST" && tableFrom(c.url) === ENV.AIRTABLE_TABLE_JOBS);
    assert.deepEqual(jobCreate.body.fields["Client (ลูกค้า)"], [CLIENT_ID]);
    assert.equal("Canonical Model" in jobCreate.body.fields, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("links only Model when Client is still pending", async () => {
  const originalFetch = globalThis.fetch;
  const mock = makeFetch();
  globalThis.fetch = mock.fetch;
  try {
    const body = baseBody({ model: { model_id: MODEL_ID, model_name: "Mira", source: "r2_migrated" } });
    const response = await handleCanonicalLinkedJobCreate(
      request(body), ENV, {}, { fetch: async () => json({ ok: true, session_id: "sess_001" }) },
    );
    const data = await response.json();
    assert.equal(data.linkage.status, "partial");
    assert.equal(data.linkage.client_link_status, "pending");
    assert.equal(data.linkage.model_link_status, "linked");

    const sessionPatch = mock.calls.find((c) => c.method === "PATCH" && tableFrom(c.url) === ENV.AIRTABLE_TABLE_SESSIONS);
    assert.equal("Client" in sessionPatch.body.fields, false);
    assert.deepEqual(sessionPatch.body.fields["Canonical Model"], [MODEL_ID]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects malformed supplied canonical IDs without blocking omitted IDs", async () => {
  let downstreamCalls = 0;
  const response = await handleCanonicalLinkedJobCreate(
    request(baseBody({ client_record_id: "not-a-record" })),
    ENV,
    {},
    { fetch: async () => { downstreamCalls += 1; return json({ ok: true }); } },
  );
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "canonical_client_record_invalid");
  assert.equal(downstreamCalls, 0);
});

test("rejects LINE identity mismatch before creating downstream session", async () => {
  const originalFetch = globalThis.fetch;
  const mock = makeFetch({ lineUserId: "U-other-line" });
  globalThis.fetch = mock.fetch;
  try {
    let downstreamCalls = 0;
    const response = await handleCanonicalLinkedJobCreate(
      request(linkedBody()), ENV, {},
      { fetch: async () => { downstreamCalls += 1; return json({ ok: true }); } },
    );
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "client_line_identity_mismatch");
    assert.equal(downstreamCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("links LINE OFC Client and canonical Model into Session and Job", async () => {
  const originalFetch = globalThis.fetch;
  const mock = makeFetch();
  globalThis.fetch = mock.fetch;
  try {
    let downstreamCalls = 0;
    const response = await handleCanonicalLinkedJobCreate(
      request(linkedBody()), ENV, {},
      { fetch: async () => { downstreamCalls += 1; return json({ ok: true, session_id: "sess_001", payment_ref: "PAY-001" }); } },
    );
    assert.equal(response.status, 200);
    assert.equal(downstreamCalls, 1);
    const data = await response.json();
    assert.equal(data.linkage.status, "linked");
    assert.equal(data.linkage.client_record_id, CLIENT_ID);
    assert.equal(data.linkage.model_record_id, MODEL_ID);
    assert.equal(data.linkage.client_source, "line_ofc_to_clients");
    assert.equal(data.linkage.model_provenance, "r2_to_models_to_canonical");

    const sessionPatch = mock.calls.find((c) => c.method === "PATCH" && tableFrom(c.url) === ENV.AIRTABLE_TABLE_SESSIONS);
    assert.deepEqual(sessionPatch.body.fields.Client, [CLIENT_ID]);
    assert.deepEqual(sessionPatch.body.fields["Canonical Model"], [MODEL_ID]);

    const jobCreate = mock.calls.find((c) => c.method === "POST" && tableFrom(c.url) === ENV.AIRTABLE_TABLE_JOBS);
    assert.deepEqual(jobCreate.body.fields["Client (ลูกค้า)"], [CLIENT_ID]);
    assert.deepEqual(jobCreate.body.fields["Canonical Model"], [MODEL_ID]);
    assert.equal(jobCreate.body.fields.session_id, "sess_001");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("updates existing Job by session_id instead of creating a duplicate", async () => {
  const originalFetch = globalThis.fetch;
  const mock = makeFetch({ existingJob: true });
  globalThis.fetch = mock.fetch;
  try {
    const response = await handleCanonicalLinkedJobCreate(
      request(linkedBody()), ENV, {}, { fetch: async () => json({ ok: true, session_id: "sess_001" }) },
    );
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.linkage.job_record_id, JOB_RECORD_ID);
    assert.equal(mock.calls.filter((c) => c.method === "POST" && tableFrom(c.url) === ENV.AIRTABLE_TABLE_JOBS).length, 0);
    assert.equal(mock.calls.filter((c) => c.method === "PATCH" && tableFrom(c.url) === ENV.AIRTABLE_TABLE_JOBS).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

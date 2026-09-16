import assert from "node:assert/strict";
import test from "node:test";

import { handleCanonicalLinkedJobCreate } from "./src/create-session-canonical-link-runtime.js";

const ENV = {
  AIRTABLE_API_KEY: "test-airtable-token",
  AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
  AIRTABLE_TABLE_CLIENTS_ID: "tblVv58TCbwh5j1fS",
  AIRTABLE_TABLE_MODELS: "tblI4B0bI446vp9GX",
  AIRTABLE_TABLE_SESSIONS: "tblC98mKWbzmPuNzX",
  AIRTABLE_TABLE_JOBS: "tbl0jxIjN8QYwGABX",
};

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

test("keeps a rich Model display snapshot while validating the canonical working name", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  let createdJobFields = null;

  globalThis.fetch = async (input, init = {}) => {
    const url = urlString(input);
    const method = String(init.method || "GET").toUpperCase();
    const table = tableFrom(url);
    const recordId = recordFrom(url);
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, method, table, recordId, body });

    if (method === "GET" && table === ENV.AIRTABLE_TABLE_MODELS && recordId === MODEL_ID) {
      return json({
        id: MODEL_ID,
        fields: {
          working_name: "EMs01",
          registry_record_type: "Existing Model Record",
          intake_gate_status: "Complete",
        },
      });
    }
    if (method === "GET" && table === ENV.AIRTABLE_TABLE_SESSIONS) {
      return json({ records: [{ id: SESSION_RECORD_ID, fields: { session_id: "sess_display_001", job_id: "" } }] });
    }
    if (method === "PATCH" && table === ENV.AIRTABLE_TABLE_SESSIONS && recordId === SESSION_RECORD_ID) {
      return json({ id: SESSION_RECORD_ID, fields: body.fields });
    }
    if (method === "GET" && table === ENV.AIRTABLE_TABLE_JOBS) {
      return json({ records: [] });
    }
    if (method === "POST" && table === ENV.AIRTABLE_TABLE_JOBS) {
      createdJobFields = body.fields;
      return json({ id: JOB_RECORD_ID, fields: body.fields });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  };

  try {
    let downstreamCalls = 0;
    const response = await handleCanonicalLinkedJobCreate(
      request({
        client_name: "Client Alias",
        model_name: "EMs01 · Jay Jatu",
        model_record_id: MODEL_ID,
        model: {
          model_id: MODEL_ID,
          model_name: "EMs01",
          source: "airtable_models",
        },
        job_type: "private:exclusive:straight",
        job_date: "2026-09-20",
        start_time: "19:00",
        end_time: "21:00",
        location_name: "Sukhumvit",
        amount_thb: 15000,
      }),
      ENV,
      {},
      {
        fetch: async () => {
          downstreamCalls += 1;
          return json({ ok: true, session_id: "sess_display_001" });
        },
      },
    );

    assert.equal(response.status, 200);
    assert.equal(downstreamCalls, 1);
    const data = await response.json();
    assert.equal(data.linkage.status, "partial");
    assert.equal(data.linkage.model_record_id, MODEL_ID);
    assert.equal(createdJobFields["Model (โมเดล)"], "EMs01 · Jay Jatu");
    assert.deepEqual(createdJobFields["Canonical Model"], [MODEL_ID]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

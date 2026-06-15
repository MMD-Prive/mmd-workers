#!/usr/bin/env node

import assert from "node:assert/strict";

import worker from "./src/index.js";

const CONFIRM_KEY = "test_confirm_key";
const BASE_ENV = {
  CONFIRM_KEY,
  AIRTABLE_API_KEY: "test_airtable_key",
  AIRTABLE_BASE_ID: "appTest",
  AIRTABLE_TABLE_SESSIONS: "sessions",
  AIRTABLE_TABLE_JOBS: "jobs",
  AIRTABLE_TABLE_PAYMENTS: "payments",
  AIRTABLE_TABLE_ACTIVITY_LOGS: "activity_logs",
};

const sessionRecord = {
  id: "recSession",
  fields: {
    session_id: "sess_truth_1",
    payment_ref: "pay_truth_1",
    model_record_id: "recModel1",
    model_name: "Tart",
    status: "arrived",
  },
};

const jobRecord = {
  id: "recJob",
  fields: {
    job_id: "job_truth_1",
    session_id: "sess_truth_1",
    payment_ref: "pay_truth_1",
    events_json: JSON.stringify([{ ts: "2026-06-15T00:00:00.000Z", event: "arrived" }]),
  },
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function base64UrlEncode(input) {
  const bytes = new TextEncoder().encode(String(input || ""));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256Hex(message, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

async function signedRef() {
  const encoded = base64UrlEncode(JSON.stringify({
    kind: "customer_invite",
    role: "model",
    lane: "model_console",
    invite_id: "invite_truth_1",
    immigration_id: "sess_truth_1",
    model_record_id: "recModel1",
    model_name: "Tart",
    exp: Math.floor(Date.now() / 1000) + 3600,
  }));
  return `${encoded}.${await hmacSha256Hex(encoded, CONFIRM_KEY)}`;
}

function installAirtableMock({ payments = [] } = {}) {
  const writes = [];
  const previousFetch = globalThis.fetch;

  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const parts = url.pathname.split("/").filter(Boolean);
    const table = decodeURIComponent(parts[parts.length - 1] || "");
    const method = String(init.method || "GET").toUpperCase();

    if (method === "GET") {
      if (table === "sessions") return jsonResponse({ records: [sessionRecord] });
      if (table === "jobs") return jsonResponse({ records: [jobRecord] });
      if (table === "payments") {
        return jsonResponse({
          records: payments.map((fields, index) => ({ id: `recPayment${index + 1}`, fields })),
        });
      }
      return jsonResponse({ records: [] });
    }

    if (method === "POST" && table === "activity_logs") {
      const body = JSON.parse(init.body);
      const fields = body.records[0].fields;
      writes.push({ table, fields });
      return jsonResponse({ records: [{ id: `recActivity${writes.length}`, fields }] });
    }

    return jsonResponse({ records: [] });
  };

  return {
    writes,
    restore() {
      globalThis.fetch = previousFetch;
    },
  };
}

function eventsWorkerMock(events) {
  return {
    async fetch(request) {
      const body = await request.json();
      events.push(body);
      return jsonResponse({
        ok: true,
        job_id: body.job_id,
        status: body.event,
        updated_at: "2026-06-15T00:01:00.000Z",
      });
    },
  };
}

async function post(path, body, env = BASE_ENV) {
  const t = await signedRef();
  const request = new Request(`https://admin-worker.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ t, ...body }),
  });
  const response = await worker.fetch(request, env, {});
  return { response, body: await response.json() };
}

async function assertSignalWrite(path, payload, expectedAction) {
  const mock = installAirtableMock();
  try {
    const { response, body } = await post(path, payload);
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.stubbed, undefined);
    assert.equal(body.implemented, undefined);
    assert.equal(body.session_id, "sess_truth_1");
    assert.equal(body.action, expectedAction);
    assert.equal(body.activity_log.table, "activity_logs");
    assert.equal(mock.writes.length, 1);
    assert.equal(mock.writes[0].fields.session_id, "sess_truth_1");
    assert.equal(mock.writes[0].fields.payment_ref, "pay_truth_1");
    assert.equal(mock.writes[0].fields.job_id, "job_truth_1");
    assert.equal(mock.writes[0].fields.action, `model_session_${expectedAction}`);
    return mock.writes[0].fields;
  } finally {
    mock.restore();
  }
}

const gpsFields = await assertSignalWrite("/v1/model/session/gps", { enabled: true, lat: 13.7, lng: 100.5 }, "gps_on");
assert.equal(gpsFields.status, "active");

const updateFields = await assertSignalWrite("/v1/model/session/update", { type: "eta", eta_text: "12 min" }, "eta");
assert.equal(updateFields.status, "received");

const emergencyFields = await assertSignalWrite("/v1/model/session/emergency", { note: "Need team call" }, "emergency");
assert.equal(emergencyFields.status, "sent");

{
  const mock = installAirtableMock();
  try {
    const response = await worker.fetch(new Request("https://admin-worker.test/v1/model/session/gps", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    }), BASE_ENV, {});
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.ok, false);
    assert.equal(body.error.code, "MISSING_T");
    assert.equal(mock.writes.length, 0);
  } finally {
    mock.restore();
  }
}

{
  const mock = installAirtableMock();
  try {
    const { response, body } = await post("/v1/model/session/status", { status: "work_started" });
    assert.equal(response.status, 423);
    assert.equal(body.ok, false);
    assert.equal(body.error.code, "PAYMENT_GATE_LOCKED");
    assert.equal(mock.writes.length, 0);
  } finally {
    mock.restore();
  }
}

{
  const eventWrites = [];
  const mock = installAirtableMock({
    payments: [{
      session_id: "sess_truth_1",
      payment_ref: "pay_truth_1",
      payment_stage: "final",
      payment_status: "verified",
      verification_status: "verified",
    }],
  });
  try {
    const { response, body } = await post(
      "/v1/model/session/status",
      { status: "work_started" },
      { ...BASE_ENV, EVENTS_WORKER: eventsWorkerMock(eventWrites) },
    );
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.status, "work_started");
    assert.equal(body.session_id, "sess_truth_1");
    assert.equal(eventWrites.length, 3);
    assert.equal(eventWrites[0].event, "final_payment_pending");
    assert.equal(eventWrites[1].event, "final_payment_confirmed");
    assert.equal(eventWrites[2].event, "work_started");
    assert.equal(mock.writes.length, 0);
  } finally {
    mock.restore();
  }
}

console.log("model session truth-state tests passed");

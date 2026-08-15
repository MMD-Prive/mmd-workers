#!/usr/bin/env node

import assert from "node:assert/strict";
import test from "node:test";

import worker from "./src/index.js";

const CONFIRM_KEY = "test_confirm_key_runtime_v1a";
const BASE_ENV = {
  CONFIRM_KEY,
  AIRTABLE_API_KEY: "test_airtable_key",
  AIRTABLE_BASE_ID: "appRuntime",
  AIRTABLE_TABLE_SESSIONS: "sessions",
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

async function signedModelT(overrides = {}, secret = CONFIRM_KEY) {
  const encoded = base64UrlEncode(JSON.stringify({
    kind: "model_confirm",
    role: "model",
    session_id: "session_runtime_v1a",
    payment_ref: "payment_runtime_v1a",
    model_record_id: "model_runtime_v1a",
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  }));
  return `${encoded}.${await hmacSha256Hex(encoded, secret)}`;
}

function makeSession(state) {
  return {
    id: "recRuntimeSession",
    fields: {
      session_id: "session_runtime_v1a",
      payment_ref: "payment_runtime_v1a",
      model_record_id: "model_runtime_v1a",
      state,
    },
  };
}

function installRuntimeFetchMock({ initialState = "offered", paymentTruth = null } = {}) {
  const previousFetch = globalThis.fetch;
  const calls = [];
  let session = makeSession(initialState);

  globalThis.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    calls.push({ method, url: request.url });

    if (url.hostname === "payments.test") {
      if (paymentTruth instanceof Response) return paymentTruth;
      return jsonResponse(paymentTruth || { ok: true, final_payment_confirmed: false });
    }

    const parts = url.pathname.split("/").filter(Boolean);
    const table = decodeURIComponent(parts[2] || parts.at(-1) || "");

    if (table === "sessions" && method === "GET") {
      return jsonResponse({ records: [session] });
    }

    if (table === "sessions" && method === "PATCH") {
      const body = await request.json();
      session = {
        id: session.id,
        fields: {
          ...session.fields,
          ...(body.fields || {}),
        },
      };
      return jsonResponse({ id: session.id, fields: session.fields });
    }

    return jsonResponse({ records: [] }, 404);
  };

  return {
    calls,
    get session() {
      return session;
    },
    restore() {
      globalThis.fetch = previousFetch;
    },
  };
}

async function getCurrent(t, env = BASE_ENV) {
  const url = t
    ? `https://admin-worker.test/v1/model/session/current?t=${encodeURIComponent(t)}`
    : "https://admin-worker.test/v1/model/session/current";
  const response = await worker.fetch(new Request(url), env);
  return { response, body: await response.json() };
}

async function postAction(t, action, options = {}) {
  const response = await worker.fetch(
    new Request("https://admin-worker.test/v1/model/session/action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t, action, ...(options.body || {}) }),
    }),
    options.env || BASE_ENV,
  );
  return { response, body: await response.json() };
}

test("GET /v1/model/session/current requires signed t before Airtable access", async () => {
  const mock = installRuntimeFetchMock();
  try {
    const { response, body } = await getCurrent("");
    assert.equal(response.status, 401);
    assert.equal(body.error, "unauthorized");
    assert.equal(mock.calls.length, 0);
  } finally {
    mock.restore();
  }
});

test("invalid signed t returns 401 before Airtable access", async () => {
  const mock = installRuntimeFetchMock();
  try {
    const { response, body } = await getCurrent("bad.access.value");
    assert.equal(response.status, 401);
    assert.equal(body.error, "unauthorized");
    assert.equal(mock.calls.length, 0);
  } finally {
    mock.restore();
  }
});

test("dedicated model-session signing secret rejects the legacy fallback key", async () => {
  const dedicated = "test_dedicated_model_session_secret";
  const env = { ...BASE_ENV, MODEL_SESSION_SIGNING_SECRET: dedicated };
  const legacyT = await signedModelT({ kind: "model_session" });
  const dedicatedT = await signedModelT({ kind: "model_session" }, dedicated);
  const mock = installRuntimeFetchMock({ initialState: "confirmed" });
  try {
    const rejected = await getCurrent(legacyT, env);
    assert.equal(rejected.response.status, 401);
    assert.equal(rejected.body.error, "unauthorized");

    const accepted = await getCurrent(dedicatedT, env);
    assert.equal(accepted.response.status, 200);
    assert.equal(accepted.body.ok, true);
  } finally {
    mock.restore();
  }
});

test("payment confirmation tokens use their own verifier secret when configured", async () => {
  const paymentSecret = "test_payment_confirmation_signing_secret";
  const env = { ...BASE_ENV, PAYMENT_CONFIRMATION_SIGNING_SECRET: paymentSecret };
  const legacyT = await signedModelT({ kind: "model_confirm" });
  const paymentT = await signedModelT({ kind: "model_confirm" }, paymentSecret);
  const mock = installRuntimeFetchMock({ initialState: "confirmed" });
  try {
    assert.equal((await getCurrent(legacyT, env)).response.status, 401);
    assert.equal((await getCurrent(paymentT, env)).response.status, 200);
  } finally {
    mock.restore();
  }
});

test("expired signed t is rejected before Airtable access", async () => {
  const t = await signedModelT({ exp: Math.floor(Date.now() / 1000) - 1 });
  const mock = installRuntimeFetchMock();
  try {
    const { response, body } = await getCurrent(t);
    assert.equal(response.status, 401);
    assert.equal(body.error, "unauthorized");
    assert.equal(mock.calls.length, 0);
  } finally {
    mock.restore();
  }
});

test("wrong model/session returns 403 after signed t resolves", async () => {
  const t = await signedModelT({ model_record_id: "different_model_runtime_v1a" });
  const mock = installRuntimeFetchMock({ initialState: "confirmed" });
  try {
    const { response, body } = await getCurrent(t);
    assert.equal(response.status, 403);
    assert.equal(body.error, "forbidden");
  } finally {
    mock.restore();
  }
});

test("GET /v1/model/session/current returns normalized state, page, route, and allowed actions", async () => {
  const t = await signedModelT();
  const mock = installRuntimeFetchMock({ initialState: "assigned" });
  try {
    const { response, body } = await getCurrent(t);
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.session.state, "assigned");
    assert.equal(body.session.normalized_state, "confirmed");
    assert.equal(body.session.page, "assigned");
    assert.equal(body.session.route, "/model/session/assigned");
    assert.deepEqual(body.session.allowed_actions, ["start_travel"]);
    assert.equal(body.session.t, undefined);
  } finally {
    mock.restore();
  }
});

test("valid transition: offered + accept_job -> confirmed", async () => {
  const t = await signedModelT();
  const mock = installRuntimeFetchMock({ initialState: "offered" });
  try {
    const { response, body } = await postAction(t, "accept_job");
    assert.equal(response.status, 200);
    assert.equal(body.session.normalized_state, "confirmed");
    assert.equal(mock.session.fields.state, "confirmed");
  } finally {
    mock.restore();
  }
});

test("valid transition: confirmed + start_travel -> en_route", async () => {
  const t = await signedModelT();
  const mock = installRuntimeFetchMock({ initialState: "confirmed" });
  try {
    const { response, body } = await postAction(t, "start_travel");
    assert.equal(response.status, 200);
    assert.equal(body.session.normalized_state, "en_route");
  } finally {
    mock.restore();
  }
});

test("legacy action alias: confirmed + go_en_route -> en_route", async () => {
  const t = await signedModelT();
  const mock = installRuntimeFetchMock({ initialState: "confirmed" });
  try {
    const { response, body } = await postAction(t, "go_en_route");
    assert.equal(response.status, 200);
    assert.equal(body.session.normalized_state, "en_route");
  } finally {
    mock.restore();
  }
});

test("valid transition: en_route + mark_arrived -> arrived", async () => {
  const t = await signedModelT();
  const mock = installRuntimeFetchMock({ initialState: "en_route" });
  try {
    const { response, body } = await postAction(t, "mark_arrived");
    assert.equal(response.status, 200);
    assert.equal(body.session.normalized_state, "arrived");
  } finally {
    mock.restore();
  }
});

test("valid transition: nearby + mark_arrived -> arrived", async () => {
  const t = await signedModelT();
  const mock = installRuntimeFetchMock({ initialState: "nearby" });
  try {
    const { response, body } = await postAction(t, "mark_arrived");
    assert.equal(response.status, 200);
    assert.equal(body.session.normalized_state, "arrived");
  } finally {
    mock.restore();
  }
});

test("valid transition: arrived + mark_met_customer -> met_customer", async () => {
  const t = await signedModelT();
  const mock = installRuntimeFetchMock({ initialState: "arrived" });
  try {
    const { response, body } = await postAction(t, "mark_met_customer");
    assert.equal(response.status, 200);
    assert.equal(body.session.normalized_state, "met_customer");
  } finally {
    mock.restore();
  }
});

test("valid transition: work_started + mark_work_finished -> work_finished", async () => {
  const t = await signedModelT();
  const mock = installRuntimeFetchMock({ initialState: "work_started" });
  try {
    const { response, body } = await postAction(t, "mark_work_finished");
    assert.equal(response.status, 200);
    assert.equal(body.session.normalized_state, "work_finished");
  } finally {
    mock.restore();
  }
});

test("valid transition: work_finished + confirm_separated -> separated", async () => {
  const t = await signedModelT();
  const mock = installRuntimeFetchMock({ initialState: "work_finished" });
  try {
    const { response, body } = await postAction(t, "confirm_separated");
    assert.equal(response.status, 200);
    assert.equal(body.session.normalized_state, "separated");
  } finally {
    mock.restore();
  }
});

test("invalid transition returns 409 invalid_transition", async () => {
  const t = await signedModelT();
  const mock = installRuntimeFetchMock({ initialState: "offered" });
  try {
    const { response, body } = await postAction(t, "mark_arrived");
    assert.equal(response.status, 409);
    assert.equal(body.error, "invalid_transition");
    assert.equal(mock.session.fields.state, "offered");
  } finally {
    mock.restore();
  }
});

test("allowed_actions is a UI hint but POST revalidates current server state", async () => {
  const t = await signedModelT();
  const mock = installRuntimeFetchMock({ initialState: "confirmed" });
  try {
    const current = await getCurrent(t);
    assert.deepEqual(current.body.session.allowed_actions, ["start_travel"]);

    mock.session.fields.state = "offered";
    const action = await postAction(t, "start_travel");
    assert.equal(action.response.status, 409);
    assert.equal(action.body.error, "invalid_transition");
  } finally {
    mock.restore();
  }
});

test("model cannot call confirm_final_payment", async () => {
  const t = await signedModelT();
  const mock = installRuntimeFetchMock({ initialState: "final_payment_pending" });
  try {
    const { response, body } = await postAction(t, "confirm_final_payment");
    assert.equal(response.status, 409);
    assert.equal(body.error, "invalid_transition");
  } finally {
    mock.restore();
  }
});

test("model cannot set final_payment_confirmed", async () => {
  const t = await signedModelT();
  const mock = installRuntimeFetchMock({ initialState: "final_payment_pending" });
  try {
    const { response, body } = await postAction(t, "set_final_payment_confirmed");
    assert.equal(response.status, 409);
    assert.equal(body.error, "invalid_transition");
    assert.equal(mock.session.fields.state, "final_payment_pending");
  } finally {
    mock.restore();
  }
});

test("start_work is rejected when payment truth endpoint is unavailable", async () => {
  const t = await signedModelT();
  const mock = installRuntimeFetchMock({ initialState: "final_payment_confirmed" });
  try {
    const { response, body } = await postAction(t, "start_work");
    assert.equal(response.status, 403);
    assert.equal(body.error, "payment_gate_not_ready");
    assert.equal(mock.session.fields.state, "final_payment_confirmed");
  } finally {
    mock.restore();
  }
});

test("start_work is rejected when live payment truth is not confirmed", async () => {
  const t = await signedModelT();
  const mock = installRuntimeFetchMock({
    initialState: "final_payment_confirmed",
    paymentTruth: { ok: true, final_payment_confirmed: false },
  });
  try {
    const { response, body } = await postAction(t, "start_work", {
      env: { ...BASE_ENV, MODEL_SESSION_PAYMENT_TRUTH_URL: "https://payments.test/final-payment/status" },
    });
    assert.equal(response.status, 403);
    assert.equal(body.error, "payment_not_confirmed");
    assert.equal(mock.session.fields.state, "final_payment_confirmed");
  } finally {
    mock.restore();
  }
});

test("start_work succeeds after live payment truth confirms final payment", async () => {
  const t = await signedModelT();
  const mock = installRuntimeFetchMock({
    initialState: "final_payment_confirmed",
    paymentTruth: { ok: true, final_payment_confirmed: true },
  });
  try {
    const { response, body } = await postAction(t, "start_work", {
      env: { ...BASE_ENV, MODEL_SESSION_PAYMENT_TRUTH_URL: "https://payments.test/final-payment/status" },
    });
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.session.normalized_state, "work_started");
    assert.equal(mock.session.fields.state, "work_started");

    const paymentCallIndex = mock.calls.findIndex((call) => call.url === "https://payments.test/final-payment/status");
    const patchCallIndex = mock.calls.findIndex((call) => call.method === "PATCH" && call.url.includes("/sessions/"));
    assert.notEqual(paymentCallIndex, -1);
    assert.notEqual(patchCallIndex, -1);
    assert(paymentCallIndex < patchCallIndex);
  } finally {
    mock.restore();
  }
});

#!/usr/bin/env node

import assert from "node:assert/strict";
import test from "node:test";

import worker from "./src/index.js";

const ADMIN_BEARER = "test_admin_bearer_link_v1b";
const CONFIRM_KEY = "test_confirm_key_link_v1b";
const INTERNAL_TOKEN = "test_internal_token_link_v1b";
const BASE_ENV = {
  ADMIN_BEARER,
  CONFIRM_KEY,
  INTERNAL_TOKEN,
  AIRTABLE_API_KEY: "test_airtable_key_link_v1b",
  AIRTABLE_BASE_ID: "appLinkIssuer",
  AIRTABLE_TABLE_SESSIONS: "sessions",
};

const SESSION_RECORD = {
  id: "recLinkIssuerSession",
  fields: {
    session_id: "session_link_v1b",
    payment_ref: "payment_link_v1b",
    model_record_id: "model_link_v1b",
    model_name: "Runtime Test Model",
    state: "assigned",
  },
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function installLinkIssuerFetchMock({ session = SESSION_RECORD, airtableStatus = 200 } = {}) {
  const previousFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    calls.push({ method, url: request.url });

    const parts = url.pathname.split("/").filter(Boolean);
    const table = decodeURIComponent(parts[2] || parts.at(-1) || "");
    if (table !== "sessions" || method !== "GET") return jsonResponse({ records: [] }, 404);
    if (airtableStatus !== 200) return jsonResponse({ error: { type: "INVALID_REQUEST" } }, airtableStatus);

    const formula = url.searchParams.get("filterByFormula") || "";
    const matchesSession = formula.includes('"session_link_v1b"');
    const matchesPayment = formula.includes('"payment_link_v1b"');
    return jsonResponse({ records: session && (matchesSession || matchesPayment) ? [session] : [] });
  };

  return {
    calls,
    restore() {
      globalThis.fetch = previousFetch;
    },
  };
}

async function postLink(body, { env = BASE_ENV, headers = {} } = {}) {
  const response = await worker.fetch(
    new Request("https://admin-worker.test/v1/admin/model/session/link", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body || {}),
    }),
    env,
  );
  return { response, body: await response.json() };
}

test("POST /v1/admin/model/session/link requires admin auth before Airtable access", async () => {
  const mock = installLinkIssuerFetchMock();
  try {
    const { response, body } = await postLink({ session_id: "session_link_v1b" }, { headers: {} });
    assert.equal(response.status, 401);
    assert.equal(body.error, "unauthorized");
    assert.equal(mock.calls.length, 0);
  } finally {
    mock.restore();
  }
});

test("missing lookup key returns 400", async () => {
  const mock = installLinkIssuerFetchMock();
  try {
    const { response, body } = await postLink({}, {
      headers: { Authorization: `Bearer ${ADMIN_BEARER}` },
    });
    assert.equal(response.status, 400);
    assert.equal(body.error, "missing_lookup_key");
    assert.equal(mock.calls.length, 0);
  } finally {
    mock.restore();
  }
});

test("bearer INTERNAL_TOKEN uses existing admin auth behavior for the link issuer", async () => {
  const mock = installLinkIssuerFetchMock();
  try {
    const { response, body } = await postLink({ session_id: "session_link_v1b" }, {
      headers: { Authorization: `Bearer ${INTERNAL_TOKEN}` },
    });
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.match(body.model_session_url, /\bt=/);
    assert.equal(mock.calls.length, 1);
  } finally {
    mock.restore();
  }
});

test("session not found returns 404", async () => {
  const mock = installLinkIssuerFetchMock({ session: null });
  try {
    const { response, body } = await postLink({ session_id: "session_link_v1b" }, {
      headers: { Authorization: `Bearer ${ADMIN_BEARER}` },
    });
    assert.equal(response.status, 404);
    assert.equal(body.error, "session_not_found");
    assert.equal(mock.calls.length, 1);
  } finally {
    mock.restore();
  }
});

test("missing model identity fields returns 409", async () => {
  const mock = installLinkIssuerFetchMock({
    session: {
      ...SESSION_RECORD,
      fields: {
        ...SESSION_RECORD.fields,
        model_record_id: "",
        model_name: "",
      },
    },
  });
  try {
    const { response, body } = await postLink({ session_id: "session_link_v1b" }, {
      headers: { Authorization: `Bearer ${ADMIN_BEARER}` },
    });
    assert.equal(response.status, 409);
    assert.equal(body.error, "model_identity_not_ready");
  } finally {
    mock.restore();
  }
});

test("model_record_id alone is enough to issue a signed URL", async () => {
  const mock = installLinkIssuerFetchMock({
    session: {
      ...SESSION_RECORD,
      fields: {
        ...SESSION_RECORD.fields,
        model_name: "",
      },
    },
  });
  try {
    const { response, body } = await postLink({ session_id: "session_link_v1b" }, {
      headers: { Authorization: `Bearer ${ADMIN_BEARER}` },
    });
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.match(body.model_session_url, /\bt=/);
  } finally {
    mock.restore();
  }
});

test("model_name alone is enough to issue a signed URL", async () => {
  const mock = installLinkIssuerFetchMock({
    session: {
      ...SESSION_RECORD,
      fields: {
        ...SESSION_RECORD.fields,
        model_record_id: "",
      },
    },
  });
  try {
    const { response, body } = await postLink({ session_id: "session_link_v1b" }, {
      headers: { Authorization: `Bearer ${ADMIN_BEARER}` },
    });
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.match(body.model_session_url, /\bt=/);
  } finally {
    mock.restore();
  }
});

test("missing signing secret returns 503", async () => {
  const mock = installLinkIssuerFetchMock();
  try {
    const { response, body } = await postLink(
      { session_id: "session_link_v1b" },
      {
        env: { ...BASE_ENV, CONFIRM_KEY: "", INTERNAL_TOKEN: "" },
        headers: { Authorization: `Bearer ${ADMIN_BEARER}` },
      },
    );
    assert.equal(response.status, 503);
    assert.equal(body.error, "signing_not_ready");
  } finally {
    mock.restore();
  }
});

test("existing session returns signed URL, no-store, and no separate raw t field", async () => {
  const mock = installLinkIssuerFetchMock();
  try {
    const { response, body } = await postLink(
      { session_id: "session_link_v1b", expires_in_seconds: 3600 },
      { headers: { Authorization: `Bearer ${ADMIN_BEARER}` } },
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(body.ok, true);
    assert.equal(body.session.session_id, "session_link_v1b");
    assert.equal(body.session.normalized_state, "confirmed");
    assert.equal(body.session.page, "assigned");
    assert.equal(body.session.route, "/model/session/assigned");
    assert.deepEqual(body.session.allowed_actions, ["start_travel"]);
    assert.match(body.model_session_url, /^https:\/\/admin-worker\.test\/v1\/model\/session\/current\?t=/);
    assert.equal(body.t, undefined);
    assert.equal(mock.calls.length, 1);
  } finally {
    mock.restore();
  }
});

test("X-Confirm-Key auth can issue a signed URL", async () => {
  const mock = installLinkIssuerFetchMock();
  try {
    const { response, body } = await postLink(
      { payment_ref: "payment_link_v1b" },
      { headers: { "X-Confirm-Key": CONFIRM_KEY } },
    );
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.match(body.model_session_url, /\bt=/);
  } finally {
    mock.restore();
  }
});

test("MODEL_SESSION_PUBLIC_BASE_URL controls the returned current URL origin", async () => {
  const mock = installLinkIssuerFetchMock();
  try {
    const { response, body } = await postLink(
      { session_id: "session_link_v1b" },
      {
        env: { ...BASE_ENV, MODEL_SESSION_PUBLIC_BASE_URL: "https://admin-worker.malemodel-bkk.workers.dev" },
        headers: { Authorization: `Bearer ${ADMIN_BEARER}` },
      },
    );
    assert.equal(response.status, 200);
    assert.match(body.model_session_url, /^https:\/\/admin-worker\.malemodel-bkk\.workers\.dev\/v1\/model\/session\/current\?t=/);
  } finally {
    mock.restore();
  }
});

test("MODEL_SESSION_CURRENT_URL can override the returned current URL", async () => {
  const mock = installLinkIssuerFetchMock();
  try {
    const { response, body } = await postLink(
      { session_id: "session_link_v1b" },
      {
        env: { ...BASE_ENV, MODEL_SESSION_CURRENT_URL: "https://console.example/current" },
        headers: { Authorization: `Bearer ${ADMIN_BEARER}` },
      },
    );
    assert.equal(response.status, 200);
    assert.match(body.model_session_url, /^https:\/\/console\.example\/current\?t=/);
  } finally {
    mock.restore();
  }
});

test("returned t works against GET /v1/model/session/current", async () => {
  const mock = installLinkIssuerFetchMock();
  try {
    const issued = await postLink(
      { session_id: "session_link_v1b" },
      { headers: { Authorization: `Bearer ${ADMIN_BEARER}` } },
    );
    const t = new URL(issued.body.model_session_url).searchParams.get("t");
    assert.ok(t);

    const current = await worker.fetch(
      new Request(`https://admin-worker.test/v1/model/session/current?t=${encodeURIComponent(t)}`),
      BASE_ENV,
    );
    const body = await current.json();
    assert.equal(current.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.session.normalized_state, "confirmed");
    assert.equal(body.session.page, "assigned");
    assert.equal(body.session.route, "/model/session/assigned");
    assert.deepEqual(body.session.allowed_actions, ["start_travel"]);
    assert.equal(mock.calls.length, 2);
  } finally {
    mock.restore();
  }
});

test("successful response does not expose secret env values", async () => {
  const mock = installLinkIssuerFetchMock();
  try {
    const response = await postLink(
      { session_id: "session_link_v1b" },
      { headers: { Authorization: `Bearer ${ADMIN_BEARER}` } },
    );
    assert.equal(response.response.status, 200);
    const text = JSON.stringify(response.body);
    assert.equal(text.includes(ADMIN_BEARER), false);
    assert.equal(text.includes(CONFIRM_KEY), false);
    assert.equal(text.includes(INTERNAL_TOKEN), false);
    assert.equal(text.includes(BASE_ENV.AIRTABLE_API_KEY), false);
    assert.equal(text.includes("X-Confirm-Key"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(response.body, "t"), false);
  } finally {
    mock.restore();
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { handleModelSelectedJobHandoff } from "./src/model-selected-job-handoff.js";

const ORIGIN = "https://mmdbkk.com";
const SESSION_ID = "sess_mu8oo9ao_a97c529604a34602";
const MODEL_ID = "recbdC0waCS3qp452";

function request(body = { session_id: SESSION_ID }) {
  return new Request(`${ORIGIN}/v1/model/selected-job/handoff`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      cookie: "mmd_model_session_v1=opaque",
    },
    body: JSON.stringify(body),
  });
}

function env({ canonicalModelId = MODEL_ID } = {}) {
  let paymentsCalls = 0;
  const runtime = {
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_API_KEY: "airtable-test",
    AIRTABLE_TABLE_SESSIONS: "tblC98mKWbzmPuNzX",
    AUTH_SERVICE_ADMIN_TO_PAYMENTS: "service-test",
    PAYMENTS_WORKER: {
      async fetch(input) {
        paymentsCalls += 1;
        const req = input instanceof Request ? input : new Request(input);
        assert.equal(new URL(req.url).pathname, "/v1/internal/confirm/reissue-model");
        assert.equal(req.headers.get("x-internal-token"), "service-test");
        const body = await req.json();
        assert.deepEqual(body, { session_id: SESSION_ID });
        return Response.json({
          ok: true,
          session_id: SESSION_ID,
          model_confirmation_url: "https://mmdbkk.com/sigil/confirm/job-model?t=fresh.model_token_123",
          expires_at: 2_000_000_000,
        });
      },
    },
    __paymentsCalls: () => paymentsCalls,
    __canonicalModelId: canonicalModelId,
  };
  return runtime;
}

function installAirtable(runtime) {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const req = input instanceof Request ? input : new Request(input, init);
    const url = new URL(req.url);
    if (url.hostname === "api.airtable.com" && req.method === "GET") {
      return Response.json({
        records: [{
          id: "recSession",
          fields: {
            fldLTq2kZbyRv22IA: SESSION_ID,
            fldrXQAyOMPCvbOaY: [{ id: runtime.__canonicalModelId, name: "EMs16" }],
          },
        }],
      });
    }
    throw new Error(`unexpected_fetch:${req.method}:${req.url}`);
  };
  return () => { globalThis.fetch = original; };
}

test("existing linked Model receives a fresh Model-only confirmation URL for its exact canonical Session", async () => {
  const runtime = env();
  const restore = installAirtable(runtime);
  try {
    const response = await handleModelSelectedJobHandoff(
      request(),
      runtime,
      async () => Response.json({ ok:true, model:{ id:MODEL_ID, display_name:"EMs16" } }),
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.session_id, SESSION_ID);
    assert.match(body.redirect_url, /^https:\/\/mmdbkk\.com\/sigil\/confirm\/job-model\?t=/);
    assert.equal(body.customer_confirmation_url, undefined);
    assert.equal(runtime.__paymentsCalls(), 1);
  } finally {
    restore();
  }
});

test("a linked Model cannot resolve another Model's selected Session", async () => {
  const runtime = env({ canonicalModelId:"recAAAAAAAAAAAAAAA" });
  const restore = installAirtable(runtime);
  try {
    const response = await handleModelSelectedJobHandoff(
      request(),
      runtime,
      async () => Response.json({ ok:true, model:{ id:MODEL_ID, display_name:"EMs16" } }),
    );
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, "selected_job_forbidden");
    assert.equal(runtime.__paymentsCalls(), 0);
  } finally {
    restore();
  }
});

test("selected-job handoff requires the existing Model session before reading Session truth", async () => {
  const runtime = env();
  const original = globalThis.fetch;
  let airtableCalls = 0;
  globalThis.fetch = async () => { airtableCalls += 1; throw new Error("must_not_read"); };
  try {
    const response = await handleModelSelectedJobHandoff(
      request(),
      runtime,
      async () => Response.json({ ok:false, error:"unauthorized" }, { status:401 }),
    );
    assert.equal(response.status, 401);
    assert.equal(airtableCalls, 0);
    assert.equal(runtime.__paymentsCalls(), 0);
  } finally {
    globalThis.fetch = original;
  }
});

test("selected-job handoff accepts only canonical MMD Session ids", async () => {
  const runtime = env();
  const response = await handleModelSelectedJobHandoff(
    request({ session_id:"../not-a-session" }),
    runtime,
    async () => { throw new Error("profile_should_not_run"); },
  );
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "session_id_invalid");
  assert.equal(runtime.__paymentsCalls(), 0);
});

import assert from "node:assert/strict";
import test from "node:test";
import { handleModelSelectedJobHandoff } from "./src/model-selected-job-handoff.js";

const ORIGIN = "https://mmdbkk.com";
const SESSION_ID = "sess_mu8oo9ao_a97c529604a34602";
const MODEL_ID = "recbdC0waCS3qp452";
const LINE_USER_ID = "U934b42a077c2c5ac34bacbcc72cfc9e5";

function request(body = { session_id: SESSION_ID }, { cookie = true } = {}) {
  const headers = {
    "content-type": "application/json",
    origin: ORIGIN,
  };
  if (cookie) headers.cookie = "mmd_model_session_v1=opaque";
  return new Request(`${ORIGIN}/v1/model/selected-job/handoff`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function env({ canonicalModelId = MODEL_ID, bindingResult = null } = {}) {
  let paymentsCalls = 0;
  let bindingCalls = 0;
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
    MODEL_ACTIVATION_COORDINATOR: {
      idFromName(value) {
        return String(value);
      },
      get() {
        return {
          async fetch(input, init = {}) {
            bindingCalls += 1;
            const req = input instanceof Request ? input : new Request(input, init);
            assert.equal(new URL(req.url).pathname, "/bind");
            const body = await req.json();
            assert.equal(body.model_record_id, canonicalModelId);
            assert.equal(body.line_user_id, LINE_USER_ID);
            assert.match(body.jti, /^selected_job_[a-f0-9]{32}$/);
            assert.ok(Number(body.exp) > Math.floor(Date.now() / 1000));
            if (bindingResult) {
              return Response.json(
                { ok: bindingResult.ok, error: bindingResult.error },
                { status: bindingResult.status },
              );
            }
            return Response.json({
              ok: true,
              idempotent: false,
              model_record_id: canonicalModelId,
            });
          },
        };
      },
    },
    __paymentsCalls: () => paymentsCalls,
    __bindingCalls: () => bindingCalls,
    __canonicalModelId: canonicalModelId,
  };
  return runtime;
}

function installExternal(runtime) {
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
    if (url.hostname === "api.line.me" && url.pathname === "/oauth2/v2.1/verify" && req.method === "POST") {
      return Response.json({
        sub: LINE_USER_ID,
        aud: "2010864854",
      });
    }
    throw new Error(`unexpected_fetch:${req.method}:${req.url}`);
  };
  return () => { globalThis.fetch = original; };
}

test("existing linked Model receives a fresh Model-only confirmation URL for its exact canonical Session", async () => {
  const runtime = env();
  const restore = installExternal(runtime);
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
    assert.equal(runtime.__bindingCalls(), 0);
    assert.equal(runtime.__paymentsCalls(), 1);
  } finally {
    restore();
  }
});

test("first selected-job link can connect an unlinked canonical Model through real LINE and never falls into signup", async () => {
  const runtime = env();
  const restore = installExternal(runtime);
  const calls = [];
  try {
    const response = await handleModelSelectedJobHandoff(
      request({
        session_id: SESSION_ID,
        idToken: "real-line-id-token",
        environment: "published",
      }, { cookie:false }),
      runtime,
      async (input) => {
        const req = input instanceof Request ? input : new Request(input);
        calls.push(new URL(req.url).pathname);
        assert.equal(new URL(req.url).pathname, "/v1/model/liff/exchange");
        const body = await req.json();
        assert.equal(body.idToken, "real-line-id-token");
        assert.equal(body.environment, "published");
        return new Response(JSON.stringify({
          ok:true,
          model:{ id:MODEL_ID, display_name:"EMs16" },
        }), {
          status:200,
          headers:{
            "content-type":"application/json",
            "set-cookie":"mmd_model_session_v1=fresh-model-session; Path=/v1/model; HttpOnly; Secure; SameSite=Lax",
          },
        });
      },
    );

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.session_id, SESSION_ID);
    assert.match(body.redirect_url, /^https:\/\/mmdbkk\.com\/sigil\/confirm\/job-model\?t=/);
    assert.match(response.headers.get("set-cookie") || "", /mmd_model_session_v1=fresh-model-session/);
    assert.deepEqual(calls, ["/v1/model/liff/exchange"]);
    assert.equal(runtime.__bindingCalls(), 1);
    assert.equal(runtime.__paymentsCalls(), 1);
  } finally {
    restore();
  }
});

test("selected-job LINE binding fails closed when that LINE already belongs to another Model", async () => {
  const runtime = env({
    bindingResult: { ok:false, status:409, error:"line_identity_already_linked" },
  });
  const restore = installExternal(runtime);
  try {
    const response = await handleModelSelectedJobHandoff(
      request({
        session_id: SESSION_ID,
        idToken: "real-line-id-token",
        environment: "published",
      }, { cookie:false }),
      runtime,
      async () => { throw new Error("exchange_must_not_run"); },
    );
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "line_identity_already_linked");
    assert.equal(runtime.__bindingCalls(), 1);
    assert.equal(runtime.__paymentsCalls(), 0);
  } finally {
    restore();
  }
});

test("a linked Model cannot resolve another Model's selected Session", async () => {
  const runtime = env({ canonicalModelId:"recAAAAAAAAAAAAAAA" });
  const restore = installExternal(runtime);
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

test("selected-job handoff without LINE token still supports an existing Model session fallback", async () => {
  const runtime = env();
  const restore = installExternal(runtime);
  try {
    const response = await handleModelSelectedJobHandoff(
      request(),
      runtime,
      async () => Response.json({ ok:false, error:"model_session_required" }, { status:401 }),
    );
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, "model_session_required");
    assert.equal(runtime.__bindingCalls(), 0);
    assert.equal(runtime.__paymentsCalls(), 0);
  } finally {
    restore();
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

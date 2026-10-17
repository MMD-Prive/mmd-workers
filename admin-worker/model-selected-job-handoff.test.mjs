import assert from "node:assert/strict";
import test from "node:test";
import { handleModelSelectedJobHandoff } from "./src/model-selected-job-handoff.js";

const ORIGIN = "https://mmdbkk.com";
const SESSION_ID = "sess_mu8oo9ao_a97c529604a34602";
const MODEL_ID = "recbdC0waCS3qp452";
const OTHER_MODEL_ID = "recAAAAAAAAAAAAAAA";
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

function runtime({ canonicalModelIds = [MODEL_ID], modelLineMatches = [], reissueFailure = false, existingModelUrl = "", existingDetailsSession = SESSION_ID, existingDetailsRole = "model" } = {}) {
  let paymentsCalls = 0;
  const state = {
    holdWrites: [],
    claimWrites: [],
    canonicalModelIds,
    modelLineMatches,
    existingModelUrl,
  };
  const env = {
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_API_KEY: "airtable-test",
    AIRTABLE_TABLE_SESSIONS: "tblC98mKWbzmPuNzX",
    AIRTABLE_TABLE_MODELS: "Models",
    AIRTABLE_TABLE_MODEL_LINE_IDENTITY_CLAIMS: "tbluoZ5JiRcoUP6WT",
    ALLOWED_ORIGINS: ORIGIN,
    AUTH_SERVICE_ADMIN_TO_PAYMENTS: "service-test",
    PAYMENTS_WORKER: {
      async fetch(input) {
        paymentsCalls += 1;
        const req = input instanceof Request ? input : new Request(input);
        const path = new URL(req.url).pathname;
        if (path === "/v1/confirm/details") {
          const body = await req.json();
          assert.equal(body.expected_role, "model");
          assert.equal(body.t, new URL(existingModelUrl).searchParams.get("t"));
          return Response.json({
            ok: true,
            authority: "payments-worker",
            schema: "confirmation_details_v1",
            role: existingDetailsRole,
            session_id: existingDetailsSession,
            session_status: "scheduled",
          });
        }
        assert.equal(path, "/v1/internal/confirm/reissue-model");
        assert.equal(req.headers.get("x-internal-token"), "service-test");
        assert.deepEqual(await req.json(), { session_id: SESSION_ID });
        if (reissueFailure) return Response.json({ ok:false, error:"service_auth_required" }, {status:401});
        return Response.json({
          ok: true,
          session_id: SESSION_ID,
          model_confirmation_url: "https://mmdbkk.com/sigil/confirm/job-model?t=fresh.model_token_123",
          expires_at: 2_000_000_000,
        });
      },
    },
    __state: state,
    __paymentsCalls: () => paymentsCalls,
  };
  return env;
}

function installExternal(env) {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const req = input instanceof Request ? input : new Request(input, init);
    const url = new URL(req.url);

    if (url.hostname === "api.line.me" && url.pathname === "/oauth2/v2.1/verify" && req.method === "POST") {
      return Response.json({
        sub: LINE_USER_ID,
        aud: "2010864854",
        name: "Film J",
        picture: "https://profile.line-scdn.net/avatar/film-j",
      });
    }

    if (url.hostname === "api.airtable.com") {
      const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
      const table = segments[2] || "";
      const recordId = segments[3] || "";

      if (table === "tblC98mKWbzmPuNzX" && req.method === "GET" && !recordId) {
        return Response.json({
          records: [{
            id: "recSession",
            fields: {
              fldLTq2kZbyRv22IA: SESSION_ID,
              fldrXQAyOMPCvbOaY: env.__state.canonicalModelIds.map((id) => ({ id, name: id === MODEL_ID ? "EMs16" : "Other" })),
              fldwl9Gs5tYlXG5ls: "existing note",
              fld0mFma9J9yfEaKb: env.__state.existingModelUrl,
            },
          }],
        });
      }

      if (table === "tblC98mKWbzmPuNzX" && recordId === "recSession" && req.method === "PATCH") {
        const body = await req.json();
        env.__state.holdWrites.push(body.fields || {});
        return Response.json({ id:"recSession", fields:body.fields || {} });
      }

      if (table === "Models" && req.method === "GET") {
        return Response.json({
          records: env.__state.modelLineMatches.map((id) => ({
            id,
            fields: { working_name: id === MODEL_ID ? "EMs16" : "Known Other" },
          })),
        });
      }

      if (table === "tbluoZ5JiRcoUP6WT" && req.method === "PATCH") {
        const body = await req.json();
        const fields = body.records?.[0]?.fields || {};
        env.__state.claimWrites.push(fields);
        return Response.json({ records:[{ id:"recClaim", fields }] });
      }
    }

    throw new Error(`unexpected_fetch:${req.method}:${req.url}`);
  };
  return () => { globalThis.fetch = original; };
}

test("already-bound exact Model opens its selected Session immediately", async () => {
  const env = runtime();
  const restore = installExternal(env);
  try {
    const response = await handleModelSelectedJobHandoff(
      request({
        session_id: SESSION_ID,
        idToken: "real-line-id-token",
        environment: "published",
      }, { cookie:false }),
      env,
      async () => new Response(JSON.stringify({
        ok:true,
        model:{ id:MODEL_ID, display_name:"EMs16" },
      }), {
        status:200,
        headers:{
          "content-type":"application/json",
          "set-cookie":"mmd_model_session_v1=fresh-model-session; Path=/v1/model; HttpOnly; Secure; SameSite=Lax",
        },
      }),
    );

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.session_id, SESSION_ID);
    assert.match(body.redirect_url, /^https:\/\/mmdbkk\.com\/sigil\/confirm\/job-model\?t=/);
    assert.match(response.headers.get("set-cookie") || "", /mmd_model_session_v1=fresh-model-session/);
    assert.equal(env.__state.claimWrites.length, 0);
    assert.equal(env.__state.holdWrites.length, 0);
    assert.equal(env.__paymentsCalls(), 1);
  } finally {
    restore();
  }
});

test("canonical Model without proven LINE is held for Per instead of auto-binding", async () => {
  const env = runtime({ canonicalModelIds:[MODEL_ID], modelLineMatches:[] });
  const restore = installExternal(env);
  try {
    const response = await handleModelSelectedJobHandoff(
      request({
        session_id: SESSION_ID,
        idToken: "real-line-id-token",
        environment: "published",
      }, { cookie:false }),
      env,
      async () => Response.json({
        ok:false,
        state:"identity_review_required",
        error:"identity_review_required",
        claim_id:"model_line_existing",
      }, { status:202 }),
    );

    assert.equal(response.status, 202);
    const body = await response.json();
    assert.equal(body.state, "owner_confirmation_required");
    assert.equal(body.error, "selected_model_owner_confirmation_required");
    assert.equal(body.session_id, SESSION_ID);
    assert.equal(body.message, "ส่งให้พี่เปอร์แล้ว เดี๋ยวเปิดงานให้ครับ");
    assert.match(body.claim_id, /^model_line_[a-f0-9]{24}$/);
    assert.equal(env.__paymentsCalls(), 0);
    assert.equal(env.__state.claimWrites.length, 1);
    assert.equal(env.__state.holdWrites.length, 1);
    const notes = env.__state.holdWrites[0].fldwl9Gs5tYlXG5ls;
    assert.match(notes, /\[MMD_SELECTED_MODEL_HOLD_V1\]/);
    assert.match(notes, new RegExp(SESSION_ID));
    assert.match(notes, new RegExp(MODEL_ID));
    assert.doesNotMatch(notes, new RegExp(LINE_USER_ID));
  } finally {
    restore();
  }
});

test("first-job selected person with no canonical Model is captured and held for Per", async () => {
  const env = runtime({ canonicalModelIds:[], modelLineMatches:[] });
  const restore = installExternal(env);
  try {
    const response = await handleModelSelectedJobHandoff(
      request({
        session_id: SESSION_ID,
        idToken: "real-line-id-token",
        environment: "published",
      }, { cookie:false }),
      env,
      async () => Response.json({
        ok:false,
        state:"identity_review_required",
        error:"identity_review_required",
      }, { status:202 }),
    );

    assert.equal(response.status, 202);
    const body = await response.json();
    assert.equal(body.state, "owner_confirmation_required");
    assert.equal(env.__paymentsCalls(), 0);
    assert.equal(env.__state.claimWrites.length, 1);
    assert.equal(env.__state.holdWrites.length, 1);
    const marker = env.__state.claimWrites[0].safe_note;
    assert.match(marker, /MMD_SELECTED_MODEL_HOLD_V1/);
    assert.match(marker, new RegExp(SESSION_ID));
  } finally {
    restore();
  }
});

test("known LINE clicking a Session selected for someone else is held for Per, never rebound automatically", async () => {
  const env = runtime({ canonicalModelIds:[MODEL_ID], modelLineMatches:[OTHER_MODEL_ID] });
  const restore = installExternal(env);
  try {
    const response = await handleModelSelectedJobHandoff(
      request({
        session_id: SESSION_ID,
        idToken: "real-line-id-token",
        environment: "published",
      }, { cookie:false }),
      env,
      async () => Response.json({
        ok:true,
        model:{ id:OTHER_MODEL_ID, display_name:"Known Other" },
      }),
    );

    assert.equal(response.status, 202);
    const body = await response.json();
    assert.equal(body.state, "owner_confirmation_required");
    assert.equal(env.__paymentsCalls(), 0);
    assert.equal(env.__state.claimWrites.length, 1);
    const marker = env.__state.claimWrites[0].safe_note;
    assert.match(marker, new RegExp(MODEL_ID));
    assert.match(marker, new RegExp(OTHER_MODEL_ID));
  } finally {
    restore();
  }
});

test("selected-job handoff without LINE token still supports an exact existing Model session", async () => {
  const env = runtime();
  const restore = installExternal(env);
  try {
    const response = await handleModelSelectedJobHandoff(
      request(),
      env,
      async () => Response.json({ ok:true, model:{ id:MODEL_ID, display_name:"EMs16" } }),
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
    assert.equal(env.__paymentsCalls(), 1);
  } finally {
    restore();
  }
});

test("selected-job handoff without LINE token cannot guess a first-job Model", async () => {
  const env = runtime({ canonicalModelIds:[] });
  const restore = installExternal(env);
  try {
    const response = await handleModelSelectedJobHandoff(
      request(),
      env,
      async () => { throw new Error("profile_should_not_run"); },
    );
    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.state, "owner_confirmation_required");
    assert.equal(body.reopen_in_line, true);
    assert.equal(env.__paymentsCalls(), 0);
  } finally {
    restore();
  }
});

test("selected-job handoff accepts only canonical MMD Session ids", async () => {
  const env = runtime();
  const response = await handleModelSelectedJobHandoff(
    request({ session_id:"../not-a-session" }),
    env,
    async () => { throw new Error("profile_should_not_run"); },
  );
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "session_id_invalid");
  assert.equal(env.__paymentsCalls(), 0);
});


test("verified existing model token safely recovers selected job if model reissue fails", async () => {
  const existingModelUrl = "https://mmdbkk.com/sigil/confirm/job-model?t=verified.stub_token_123";
  const env = runtime({ reissueFailure:true, existingModelUrl });
  const restore = installExternal(env);
  try {
    const response = await handleModelSelectedJobHandoff(
      request({session_id:SESSION_ID,idToken:"real-line-id-token",environment:"published"}, {cookie:false}),
      env,
      async () => Response.json({ok:true,model:{id:MODEL_ID}}, {
        headers: {"content-type":"application/json", "set-cookie":"mmd_model_session_v1=linked; Path=/v1/model; Secure; HttpOnly"},
      }),
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.redirect_url, existingModelUrl);
    assert.equal(body.handoff_source, "verified_existing_model_link");
    assert.match(response.headers.get("set-cookie") || "", /mmd_model_session_v1=linked/);
    assert.equal(env.__paymentsCalls(), 2);
    assert.equal(env.__state.holdWrites.length, 0);
    assert.equal(env.__state.claimWrites.length, 0);
  } finally {
    restore();
  }
});

test("fallback rejects a token that payment authority resolves to another Session", async () => {
  const env = runtime({
    reissueFailure:true,
    existingModelUrl:"https://mmdbkk.com/sigil/confirm/job-model?t=verified.stub_token_123",
    existingDetailsSession:"sess_other_unrelated123",
  });
  const restore = installExternal(env);
  try {
    const response = await handleModelSelectedJobHandoff(
      request(),
      env,
      async () => Response.json({ok:true,model:{id:MODEL_ID}}),
    );
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, "service_auth_required");
    assert.equal(env.__paymentsCalls(), 2);
  } finally {
    restore();
  }
});

test("fallback rejects a customer token even when stored under model URL", async () => {
  const env = runtime({
    reissueFailure:true,
    existingModelUrl:"https://mmdbkk.com/sigil/confirm/job-model?t=verified.stub_token_123",
    existingDetailsRole:"customer",
  });
  const restore = installExternal(env);
  try {
    const response = await handleModelSelectedJobHandoff(
      request(),
      env,
      async () => Response.json({ok:true,model:{id:MODEL_ID}}),
    );
    assert.equal(response.status, 401);
    assert.equal(env.__paymentsCalls(), 2);
  } finally {
    restore();
  }
});

test("model ownership mismatch cannot use an existing signed URL fallback", async () => {
  const env = runtime({
    reissueFailure:true,
    existingModelUrl:"https://mmdbkk.com/sigil/confirm/job-model?t=verified.stub_token_123",
  });
  const restore = installExternal(env);
  try {
    const response = await handleModelSelectedJobHandoff(
      request({session_id:SESSION_ID,idToken:"real-line-id-token",environment:"published"}, {cookie:false}),
      env,
      async () => Response.json({ok:true,model:{id:OTHER_MODEL_ID}}),
    );
    assert.equal(response.status, 202);
    assert.equal((await response.json()).state, "owner_confirmation_required");
    assert.equal(env.__paymentsCalls(), 0);
  } finally {
    restore();
  }
});

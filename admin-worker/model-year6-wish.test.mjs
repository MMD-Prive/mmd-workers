import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  MODEL_YEAR6_WISH_CAMPAIGN_ID,
  MODEL_YEAR6_WISH_MAX_LENGTH,
  handleModelYear6WishRequest,
  isModelYear6WishEligibleState,
  isModelYear6WishRequest,
} from "./src/model-year6-wish.js";

const SECRET = "test-model-session-secret";
const MODEL_ID = "recModel123456789";
const SESSION_ID = "session-year6-wish-001";

function token() {
  const payload = {
    kind: "model_session",
    role: "model",
    model_record_id: MODEL_ID,
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", SECRET).update(encoded).digest("hex");
  return `${encoded}.${signature}`;
}

function wishRequest(method = "GET", body) {
  const headers = new Headers({
    cookie: `mmd_model_session_v1=${encodeURIComponent(token())}`,
    origin: "https://mmdmodel.lovable.app",
  });
  if (body !== undefined) headers.set("content-type", "application/json");
  return new Request("https://mmdbkk.com/v1/model/session/current?mode=year6_wish", {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function coreFor(state) {
  return {
    async fetch(request) {
      const url = new URL(request.url);
      assert.equal(url.pathname, "/v1/model/session/current");
      assert.equal(url.search, "");
      assert.equal(request.method, "GET");
      return Response.json({
        ok: true,
        session: {
          session_id: SESSION_ID,
          normalized_state: state,
        },
      });
    },
  };
}

const env = {
  MODEL_SESSION_SIGNING_SECRET: SECRET,
  AIRTABLE_API_KEY: "pat-test",
  AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
  AIRTABLE_TABLE_CARE_BACK_BIRTHDAY_WISHES: "tblvMJjYXy29mgDLb",
};

test("Year 6 Wish uses the existing model current-session ingress only", async () => {
  assert.equal(isModelYear6WishRequest("/v1/model/session/current"), true);
  assert.equal(isModelYear6WishRequest("/v1/model/session/wish"), false);

  let delegated = false;
  const response = await handleModelYear6WishRequest(
    new Request("https://mmdbkk.com/v1/model/session/current"),
    {},
    { async fetch() { delegated = true; return Response.json({ ok: true, canonical: true }); } },
  );
  assert.equal(delegated, true);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).canonical, true);
});

test("Year 6 Wish is eligible only after separation and never becomes a payout gate", async () => {
  for (const state of ["separated", "under_review", "payout_pending", "closed"]) {
    assert.equal(isModelYear6WishEligibleState(state), true, state);
  }
  for (const state of ["confirmed", "en_route", "arrived", "work_started", "work_finished"]) {
    assert.equal(isModelYear6WishEligibleState(state), false, state);
  }

  const response = await handleModelYear6WishRequest(wishRequest(), env, coreFor("work_finished"));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.eligible, false);
  assert.equal(body.required, false);
  assert.equal(body.skip_allowed, true);
  assert.equal(body.payout_gate, false);
  assert.equal(body.reason, "available_after_separation");
});

test("eligible GET exposes campaign status without private payout or lifecycle mutation", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    assert.match(url, /tblvMJjYXy29mgDLb/);
    assert.equal(String(init.method || "GET").toUpperCase(), "GET");
    return Response.json({ records: [] });
  };
  try {
    const response = await handleModelYear6WishRequest(wishRequest(), env, coreFor("separated"));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.eligible, true);
    assert.equal(body.submitted, false);
    assert.equal(body.required, false);
    assert.equal(body.skip_allowed, true);
    assert.equal(body.payout_gate, false);
    assert.equal(body.max_length, MODEL_YEAR6_WISH_MAX_LENGTH);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("POST stores one post-job Wish with Airtable-safe controlled selects and no payout gate", async () => {
  const originalFetch = globalThis.fetch;
  let createdFields = null;
  globalThis.fetch = async (input, init = {}) => {
    const method = String(init.method || "GET").toUpperCase();
    if (method === "GET") return Response.json({ records: [] });
    assert.equal(method, "POST");
    assert.equal(JSON.parse(init.body).typecast, false);
    createdFields = JSON.parse(init.body).fields;
    return Response.json({ id: "recWish1234567890", fields: createdFields });
  };
  try {
    const response = await handleModelYear6WishRequest(
      wishRequest("POST", { wish_text: "ขอให้ MMD ปีที่ 6 สนุกมากครับ", language: "chinese" }),
      env,
      coreFor("separated"),
    );
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.state, "completed");
    assert.equal(body.submitted, true);
    assert.equal(body.required, false);
    assert.equal(body.payout_gate, false);
    assert.equal(createdFields.campaign_id, MODEL_YEAR6_WISH_CAMPAIGN_ID);
    assert.equal(createdFields.wish_option, "post_job_model");
    assert.equal(createdFields.wish_status, "completed");
    assert.equal(createdFields.source, "member_page");
    assert.equal(createdFields.source_path, "mmdmodel.lovable.app");
    assert.equal("language" in createdFields, false, "unsupported Airtable zh select must be omitted");
    const payload = JSON.parse(createdFields.payload_json);
    assert.equal(payload.requested_language, "zh");
    assert.equal(payload.source, "my_mmd_model_wrap_up");
    assert.equal(payload.session_id, SESSION_ID);
    assert.equal(payload.payout_gate, false);
    assert.equal(payload.required, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("POST rejects unexpected fields so payout/lifecycle flags cannot be smuggled in", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ records: [] });
  try {
    const response = await handleModelYear6WishRequest(
      wishRequest("POST", { wish_text: "test", language: "th", payout_gate: true }),
      env,
      coreFor("separated"),
    );
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "unexpected_field");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

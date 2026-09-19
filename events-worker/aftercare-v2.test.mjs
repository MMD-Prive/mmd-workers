import test from "node:test";
import assert from "node:assert/strict";

import {
  handleCustomerAftercare,
  normalizeAftercareInput,
  shouldRecommendPrivateCare,
} from "./src/customer-aftercare-v2.js";

const SESSION_ID = "sess_aftercare_v2_test";
const TOKEN = "customer.signed.token";

function request(body, origin = "https://www.mmdbkk.com") {
  return new Request("https://events-worker.malemodel-bkk.workers.dev/v1/customer/session/aftercare", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function envFor({ state = "separated", events = [], paymentOk = true } = {}) {
  let patchCount = 0;
  let patchedFields = null;
  const job = {
    id: "rec_aftercare_job",
    fields: {
      session_id: SESSION_ID,
      job_id: "JOB-AFTERCARE-001",
      status: state,
      events_json: JSON.stringify(events),
      last_update_at: "2026-09-10T10:00:00.000Z",
    },
  };

  const env = {
    AIRTABLE_BASE_ID: "app_test",
    AIRTABLE_TABLE_JOBS: "jobs",
    AIRTABLE_API_KEY: "pat_test",
    ALLOWED_ORIGINS: "https://mmdbkk.com,https://www.mmdbkk.com",
    PAYMENTS_HTTP: {
      async fetch() {
        return new Response(JSON.stringify(paymentOk
          ? { ok: true, role: "customer", session_id: SESSION_ID }
          : { ok: false, error: "invalid_confirmation_token" }), {
          status: paymentOk ? 200 : 401,
          headers: { "content-type": "application/json" },
        });
      },
    },
    AIRTABLE_HTTP: {
      async fetch(req) {
        if (req.method === "GET") {
          return new Response(JSON.stringify({ records: [job] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (req.method === "PATCH") {
          patchCount += 1;
          const body = await req.json();
          patchedFields = body.fields;
          return new Response(JSON.stringify({
            ...job,
            fields: { ...job.fields, ...body.fields },
          }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        throw new Error(`unexpected_method:${req.method}`);
      },
    },
  };

  return {
    env,
    get patchCount() { return patchCount; },
    get patchedFields() { return patchedFields; },
  };
}

function validBody(overrides = {}) {
  return {
    t: TOKEN,
    rating: 5,
    idempotency_key: "aftercare-test-0001",
    quick_tags: ["on_time", "polite", "on_time"],
    issue_tags: [],
    private_model_message: "ขอบคุณครับ",
    private_mmd_message: "ดูแลดีครับ",
    ...overrides,
  };
}

test("normalizer accepts canonical fields and deduplicates tags", () => {
  const input = normalizeAftercareInput(validBody());
  assert.equal(input.rating, 5);
  assert.deepEqual(input.quickTags, ["on_time", "polite"]);
  assert.deepEqual(input.issueTags, []);
  assert.equal(input.privateModelMessage, "ขอบคุณครับ");
  assert.equal(input.privateMmdMessage, "ดูแลดีครับ");
});

test("normalizer rejects invalid ratings, keys, and tags", () => {
  assert.throws(() => normalizeAftercareInput(validBody({ rating: 0 })), /rating_must_be_1_to_5/);
  assert.throws(() => normalizeAftercareInput(validBody({ idempotency_key: "short" })), /idempotency_key_invalid/);
  assert.throws(() => normalizeAftercareInput(validBody({ quick_tags: ["public_review"] })), /quick_tag_invalid/);
  assert.throws(() => normalizeAftercareInput(validBody({ issue_tags: ["other"] })), /issue_tag_invalid/);
});

test("private care is recommended only for low rating or sensitive issue tags", () => {
  assert.equal(shouldRecommendPrivateCare(2, []), true);
  assert.equal(shouldRecommendPrivateCare(5, ["privacy"]), true);
  assert.equal(shouldRecommendPrivateCare(5, []), false);
});

test("work_finished remains locked until separated", async () => {
  const ctx = envFor({ state: "work_finished" });
  const response = await handleCustomerAftercare(request(validBody()), ctx.env);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "aftercare_wait_for_separated");
  assert.equal(ctx.patchCount, 0);
});

test("separated submission records private aftercare and advances to under_review", async () => {
  const ctx = envFor({ state: "separated" });
  const response = await handleCustomerAftercare(request(validBody()), ctx.env);
  assert.equal(response.status, 201);
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.equal(data.schema, "customer_aftercare_v2");
  assert.equal(data.state, "under_review");
  assert.equal(data.aftercare_complete, true);
  assert.equal(data.private_model_message_received, true);
  assert.equal(data.private_mmd_message_received, true);
  assert.equal(data.private_care.recommended, false);
  assert.equal(ctx.patchCount, 1);
  assert.equal(ctx.patchedFields.status, "under_review");

  const events = JSON.parse(ctx.patchedFields.events_json);
  assert.equal(events.at(-2).event, "aftercare_submitted");
  assert.equal(events.at(-2).rating, 5);
  assert.deepEqual(events.at(-2).quick_tags, ["on_time", "polite"]);
  assert.equal(events.at(-1).event, "request_review");
  assert.equal(events.at(-1).from, "separated");
  assert.equal(events.at(-1).to, "under_review");

  const serialized = JSON.stringify(data);
  assert.equal(serialized.includes("ขอบคุณครับ"), false);
  assert.equal(serialized.includes("ดูแลดีครับ"), false);
});

test("low rating and sensitive tags return signed Private Care continuation", async () => {
  const ctx = envFor({ state: "separated" });
  const response = await handleCustomerAftercare(request(validBody({
    rating: 2,
    issue_tags: ["safety", "payment"],
  })), ctx.env);
  assert.equal(response.status, 201);
  const data = await response.json();
  assert.equal(data.private_care.recommended, true);
  assert.match(data.private_care.url, /^\/sigil\/recovery\?t=/);
  assert.deepEqual(data.private_care.reasons, ["low_rating", "safety", "payment"]);
});

test("existing aftercare completion is idempotent and never rewrites lifecycle", async () => {
  const ctx = envFor({
    state: "under_review",
    events: [{
      ts: "2026-09-10T10:10:00.000Z",
      event: "aftercare_submitted",
      rating: 5,
      quick_tags: ["good_care"],
      private_care_recommended: false,
    }],
  });
  const response = await handleCustomerAftercare(request(validBody()), ctx.env);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.idempotent, true);
  assert.equal(data.state, "under_review");
  assert.equal(ctx.patchCount, 0);
});

test("untrusted origin is rejected before token or storage access", async () => {
  const ctx = envFor();
  const response = await handleCustomerAftercare(request(validBody(), "https://example.com"), ctx.env);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "origin_not_allowed");
  assert.equal(ctx.patchCount, 0);
});

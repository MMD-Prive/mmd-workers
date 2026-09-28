import assert from "node:assert/strict";
import test from "node:test";
import { ModelActivationCoordinator } from "./src/model-first-time-activation.js";
import { bindVerifiedModelLineClaim } from "./src/model-line-link-review.js";

const MODEL_ID = "recModel1234567890";
const OLD_LINE_ID = "Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const NEW_LINE_ID = "Ubbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function memoryStorage() {
  const data = new Map();
  return {
    async get(key) { return data.get(key); },
    async put(key, value) { data.set(key, value); },
  };
}

test("owner recovery atomically replaces only the verified unreachable Model LINE binding", async () => {
  const storage = memoryStorage();
  const record = { id: MODEL_ID, fields: { line_user_id: OLD_LINE_ID } };
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    requests.push({ url: url.toString(), init });
    if (url.pathname.endsWith(`/${MODEL_ID}`) && (init.method || "GET") === "GET") return Response.json(record);
    if (url.pathname.endsWith(`/${MODEL_ID}`) && init.method === "PATCH") {
      const body = JSON.parse(init.body);
      Object.assign(record.fields, body.fields);
      return Response.json(record);
    }
    if (url.pathname.endsWith("/Models") && (init.method || "GET") === "GET") return Response.json({ records: [] });
    throw new Error(`unexpected request ${url}`);
  };

  try {
    const coordinator = new ModelActivationCoordinator({ storage }, {
      AIRTABLE_API_KEY: "airtable-secret",
      AIRTABLE_BASE_ID: "app_test",
    });
    const response = await coordinator.fetch(new Request("https://model-activation.internal/recover", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model_record_id: MODEL_ID,
        previous_line_user_id: OLD_LINE_ID,
        line_user_id: NEW_LINE_ID,
        jti: "owner_recovery_model_line_0123456789abcdef01234567",
        exp: Math.floor(Date.now() / 1000) + 60,
      }),
    }));

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      idempotent: false,
      recovered: true,
      model_record_id: MODEL_ID,
    });
    assert.equal(record.fields.line_user_id, NEW_LINE_ID);
    assert.equal(requests.filter((request) => request.init.method === "PATCH").length, 1);

    const idempotent = await coordinator.fetch(new Request("https://model-activation.internal/recover", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model_record_id: MODEL_ID,
        previous_line_user_id: OLD_LINE_ID,
        line_user_id: NEW_LINE_ID,
        jti: "owner_recovery_model_line_0123456789abcdef01234567",
        exp: Math.floor(Date.now() / 1000) + 60,
      }),
    }));
    assert.equal(idempotent.status, 200);
    assert.deepEqual(await idempotent.json(), {
      ok: true,
      idempotent: true,
      recovered: true,
      model_record_id: MODEL_ID,
    });
    assert.equal(requests.filter((request) => request.init.method === "PATCH").length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("owner recovery fails closed when the stored binding changed after preflight", async () => {
  const storage = memoryStorage();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    id: MODEL_ID,
    fields: { line_user_id: "Ucccccccccccccccccccccccccccccccc" },
  });
  try {
    const coordinator = new ModelActivationCoordinator({ storage }, {
      AIRTABLE_API_KEY: "airtable-secret",
      AIRTABLE_BASE_ID: "app_test",
    });
    const response = await coordinator.fetch(new Request("https://model-activation.internal/recover", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model_record_id: MODEL_ID,
        previous_line_user_id: OLD_LINE_ID,
        line_user_id: NEW_LINE_ID,
        jti: "owner_recovery_model_line_0123456789abcdef01234567",
        exp: Math.floor(Date.now() / 1000) + 60,
      }),
    }));
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "model_line_recovery_current_identity_changed");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("owner-reviewed verified claim uses non-sending reachability proof before recovering a stale Model LINE ID", async () => {
  const claimId = "model_line_0123456789abcdef01234567";
  const claimRecordId = "recClaim1234567890";
  const modelRecordId = "rec12345678901234";
  const originalFetch = globalThis.fetch;
  let recoveryPreflight = null;
  let coordinatorPayload = null;
  let claimPatched = false;

  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname.includes("/tbluoZ5JiRcoUP6WT") && (init.method || "GET") === "GET") {
      return Response.json({ records: [{
        id: claimRecordId,
        fields: { claim_id: claimId, claim_status: "verified_unlinked", line_user_id: NEW_LINE_ID },
      }] });
    }
    if (url.pathname.endsWith(`/Models/${modelRecordId}`) && (init.method || "GET") === "GET") {
      return Response.json({
        id: modelRecordId,
        fields: {
          working_name: "EMs16",
          status: "active",
          drive_folder_id: "driveFolder123456",
          line_user_id: OLD_LINE_ID,
        },
      });
    }
    if (url.pathname.endsWith("/Models") && (init.method || "GET") === "GET") return Response.json({ records: [] });
    if (url.pathname.includes("/tbluoZ5JiRcoUP6WT") && init.method === "PATCH") {
      claimPatched = true;
      return Response.json({ records: [{ id: claimRecordId }] });
    }
    throw new Error(`unexpected request ${url}`);
  };

  try {
    const response = await bindVerifiedModelLineClaim(new Request("https://www.mmdbkk.com/v1/admin/model/activation/issue", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "bind_verified_claim", claim_id: claimId, model_record_id: modelRecordId, confirm: true }),
    }), {
      AIRTABLE_API_KEY: "airtable-secret",
      AIRTABLE_BASE_ID: "app_test",
      AUTH_SERVICE_ADMIN_TO_EVENTS: "admin-events-secret",
      EVENTS_WORKER: {
        async fetch(request) {
          recoveryPreflight = await request.clone().json();
          assert.equal(new URL(request.url).pathname, "/__internal/model/line-identity/recovery-preflight");
          assert.equal(request.headers.get("x-internal-token"), "admin-events-secret");
          return Response.json({ ok: true, ready: true, state: "model_line_identity_recovery_ready", message_sent: false });
        },
      },
      MODEL_ACTIVATION_COORDINATOR: {
        idFromName() { return "coordinator-id"; },
        get() {
          return {
            async fetch(input, init = {}) {
              coordinatorPayload = JSON.parse(init.body);
              assert.equal(new URL(input).pathname, "/recover");
              return Response.json({ ok: true, idempotent: false, recovered: true });
            },
          };
        },
      },
    }, { id: "owner-test" });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.recovered_stale_identity, true);
    assert.equal(claimPatched, true);
    assert.deepEqual(recoveryPreflight, { previous_line_user_id: OLD_LINE_ID, candidate_line_user_id: NEW_LINE_ID });
    assert.equal(coordinatorPayload.previous_line_user_id, OLD_LINE_ID);
    assert.equal(coordinatorPayload.line_user_id, NEW_LINE_ID);
    assert.doesNotMatch(JSON.stringify(payload), /aaaaaaaa|bbbbbbbb|secret/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

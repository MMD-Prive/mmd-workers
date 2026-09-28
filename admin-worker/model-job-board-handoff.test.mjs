import assert from "node:assert/strict";
import { test } from "node:test";
import {
  handleModelJobBoardHandoff,
  handleModelJobBoardValidate,
} from "./src/model-job-board-handoff.js";

const ENV = {
  INTERNAL_TOKEN: "shared-internal-token-for-job-board",
  MODEL_JOB_BOARD_HANDOFF_SECRET: "model-job-board-handoff-secret-long-enough",
};

function request(path, init = {}) {
  return new Request(`https://mmdbkk.com${path}`, init);
}

test("verified Model session receives a short-lived sigil Job Board redirect", async () => {
  const calls = [];
  const response = await handleModelJobBoardHandoff(
    request("/v1/model/job-board/handoff?job_id=JOB-20260928-001&next=https%3A%2F%2Fsigil.mmdbkk.com%2Fpublic%2Fapi%2Fjobs%2FJOB-20260928-001", {
      headers: { cookie: "mmd_model_session_v1=opaque", origin: "https://mmdbkk.com" },
    }),
    ENV,
    async (profileRequest) => {
      calls.push(profileRequest);
      return Response.json({ ok: true, model: { id: "rec12345678901234", display_name: "Model A" } });
    },
  );

  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).pathname, "/v1/model/profile");
  assert.equal(calls[0].headers.get("cookie"), "mmd_model_session_v1=opaque");
  const redirect = new URL(body.redirect_url);
  assert.equal(redirect.origin, "https://sigil.mmdbkk.com");
  assert.equal(redirect.pathname, "/public/api/jobs/JOB-20260928-001");
  assert.ok(redirect.searchParams.get("mmd_job_board_handoff"));

  const token = redirect.searchParams.get("mmd_job_board_handoff");
  const validated = await handleModelJobBoardValidate(
    new Request("https://model-auth.internal/__internal/model-job-board/validate", {
      method: "POST",
      headers: { "content-type": "application/json", "x-mmd-service-caller": "public-access-worker" },
      body: JSON.stringify({ token }),
    }),
    ENV,
  );
  const validatedBody = await validated.json();
  assert.equal(validated.status, 200, JSON.stringify(validatedBody));
  assert.equal(validatedBody.model_record_id, "rec12345678901234");
});

test("handoff fails closed without a valid Model session", async () => {
  const response = await handleModelJobBoardHandoff(
    request("/v1/model/job-board/handoff"),
    ENV,
    async () => Response.json({ ok: false, error: "model_session_required" }, { status: 401 }),
  );
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "model_session_required");
});

test("handoff rejects destinations outside the canonical Job Board", async () => {
  const response = await handleModelJobBoardHandoff(
    request("/v1/model/job-board/handoff?next=https%3A%2F%2Fevil.example%2Fsteal"),
    ENV,
    async () => Response.json({ ok: true, model: { id: "rec12345678901234" } }),
  );
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "job_board_next_invalid");
});

test("internal validator requires the service-binding hostname and caller marker", async () => {
  for (const req of [
    new Request("https://mmdbkk.com/__internal/model-job-board/validate", {
      method: "POST",
      headers: { "content-type": "application/json", "x-mmd-service-caller": "public-access-worker" },
      body: JSON.stringify({ token: "x.y" }),
    }),
    new Request("https://model-auth.internal/__internal/model-job-board/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "x.y" }),
    }),
  ]) {
    const response = await handleModelJobBoardValidate(req, ENV);
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, "service_auth_required");
  }
});

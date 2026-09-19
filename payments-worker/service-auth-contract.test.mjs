import assert from "node:assert/strict";
import test from "node:test";

import worker from "./index.js";

function post(path, token = "") {
  return new Request(`https://payments.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { "X-Internal-Token": token } : {}),
    },
    body: "{}",
  });
}

test("Admin confirmation-link route enforces only Admin to Payments auth", async () => {
  const env = {
    AUTH_SERVICE_ADMIN_TO_PAYMENTS: "admin-payments-secret",
    AUTH_SERVICE_IMMIGRATE_TO_PAYMENTS: "immigrate-payments-secret",
    AUTH_SERVICE_EVENTS_TO_PAYMENTS: "events-payments-secret",
  };

  for (const token of ["", "events-payments-secret", "wrong-secret"]) {
    const response = await worker.fetch(post("/v1/confirm/link", token), env);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, "service_auth_required");
  }

  const authenticated = await worker.fetch(post("/v1/confirm/link", "admin-payments-secret"), env);
  assert.equal(authenticated.status, 400, "dedicated auth must pass the guard and reach input validation");
  assert.equal((await authenticated.json()).error, "client_name_required");

  const immigrate = await worker.fetch(post("/v1/confirm/link", "immigrate-payments-secret"), env);
  assert.equal(immigrate.status, 400, "Immigrate has its own credential for the same intended route");
  assert.equal((await immigrate.json()).error, "client_name_required");
});

test("Events payment route is separate and rejects unrelated service credentials", async () => {
  const env = {
    AUTH_SERVICE_ADMIN_TO_PAYMENTS: "admin-payments-secret",
    AUTH_SERVICE_EVENTS_TO_PAYMENTS: "events-payments-secret",
  };

  for (const token of ["", "admin-payments-secret", "wrong-secret"]) {
    const response = await worker.fetch(post("/v1/internal/pay/verify", token), env);
    assert.equal(response.status, 401);
  }

  const authenticated = await worker.fetch(post("/v1/internal/pay/verify", "events-payments-secret"), env);
  assert.equal(authenticated.status, 400, "dedicated auth must pass the guard and reach input validation");
  assert.equal((await authenticated.json()).error, "session_id_required");
});

test("public payment intent route remains available to the existing member flow", async () => {
  const response = await worker.fetch(post("/v1/pay/verify"), {});
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "session_id_required");
});

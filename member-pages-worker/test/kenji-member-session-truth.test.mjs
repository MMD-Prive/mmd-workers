import test from "node:test";
import assert from "node:assert/strict";
import { handleKenjiMemberSessionTruth } from "../src/kenji-member-session-truth.js";

function request(headers = {}) {
  return new Request("https://member-pages-worker.internal/__internal/kenji/member-session-truth", {
    method: "POST",
    headers,
    body: "{}",
  });
}

test("session truth bridge is service-binding only", async () => {
  const response = await handleKenjiMemberSessionTruth(request(), {});
  assert.equal(response.status, 404);
});

test("session truth bridge fails closed without a verified member session", async () => {
  const response = await handleKenjiMemberSessionTruth(request({
    "x-mmd-internal-call": "true",
    "x-mmd-service-binding": "member-dashboard-chat-worker",
  }), {});
  assert.equal(response.status, 401);
  const payload = await response.json();
  assert.equal(payload.error, "member_session_required");
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  invokeMemberProfileMaterializer,
  materializationEventKey,
  normalizeMaterializationRequest,
  validateReadinessAggregate,
} from "./member-profile-materialization.mjs";

test("normalizes the four trigger contracts and defaults to dry-run", () => {
  for (const trigger of ["dashboard_access", "sigil_booking", "verified_renewal", "admin_commit"]) {
    const result = normalizeMaterializationRequest({ trigger, stagingImportId: "legacy_123", memberId: "MMD-1" });
    assert.equal(result.commit, false);
    assert.equal(result.actor, `trigger:${trigger}`);
  }
  assert.throws(() => normalizeMaterializationRequest({ trigger: "browser", stagingImportId: "legacy_123", memberId: "MMD-1" }), /trigger_invalid/);
});

test("uses a deterministic hashed event key without raw member identity", async () => {
  const first = await materializationEventKey({ trigger: "dashboard_access", memberId: "MMD-PRIVATE-1" });
  const second = await materializationEventKey({ trigger: "dashboard_access", memberId: "MMD-PRIVATE-1" });
  assert.equal(first, second);
  assert.match(first, /^member_profile:dashboard_access:[a-f0-9]{64}$/);
  assert.doesNotMatch(first, /MMD-PRIVATE/);
});

test("binding invocation is bounded and sanitizes provider output", async () => {
  let requestBody;
  const binding = { fetch: async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return Response.json({ ok: true, outcome: "triggered", wrote: ["session", "points", "secret"] });
  } };
  const result = await invokeMemberProfileMaterializer(binding, {
    trigger: "admin_commit", stagingImportId: "legacy_123", memberId: "MMD-1", commit: true, actor: "admin:session",
  });
  assert.deepEqual(result, { ok: true, outcome: "triggered", dry_run: false, wrote: ["session", "points"] });
  assert.deepEqual(Object.keys(requestBody).sort(), ["actor", "commit", "memberId", "stagingImportId", "trigger"]);
});

test("missing, failing and malformed bindings fail safely", async () => {
  const request = { trigger: "dashboard_access", stagingImportId: "legacy_123", memberId: "MMD-1" };
  assert.equal((await invokeMemberProfileMaterializer(null, request)).outcome, "materialization_failed_safe");
  assert.equal((await invokeMemberProfileMaterializer({ fetch: async () => new Response("bad", { status: 503 }) }, request)).outcome, "materialization_failed_safe");
});

test("readiness aggregates expose counts only", () => {
  const output = validateReadinessAggregate({ total_staged: 5, safe: 2, customer_email: "hidden@example.com", blocked: -1 });
  assert.equal(output.total_staged, 5);
  assert.equal(output.safe, 2);
  assert.equal(output.blocked, 0);
  assert.equal("customer_email" in output, false);
  assert.equal(Object.keys(output).length, 13);
});

import test from "node:test";
import assert from "node:assert/strict";
import { inspectRecoveryEvidence } from "../src/member-email-recovery.js";

const LINE_ID = `U${"a".repeat(32)}`;

function envWith(recordsByTable = {}) {
  return {
    AIRTABLE_API_KEY: "test-key",
    AIRTABLE_BASE_ID: "appTestRecovery123",
    AIRTABLE_HTTP: {
      async fetch(request) {
        const url = new URL(request.url);
        const table = decodeURIComponent(url.pathname.split("/").pop());
        const records = recordsByTable[table] || [];
        return Response.json({ records });
      },
    },
  };
}

test("exact Identity Seed / Pre-Session email is treated as known prior identity, not a new member", async () => {
  const env = envWith({
    "MMD — Pre-Session Client Index": [
      { id: "recSeedABC1234567", fields: { identity_email: "old@example.com", candidate_only: true } },
    ],
  });

  const result = await inspectRecoveryEvidence(env, {
    lineUserId: LINE_ID,
    email: " OLD@EXAMPLE.COM ",
  });

  assert.equal(result.state, "known_identity");
  assert.equal(result.match_type, "pre_session_email");
  assert.equal(result.confidence, 85);
  assert.deepEqual(result.evidenceSources, ["pre_session_identity_seed"]);
});

test("one exact existing Member email wins as canonical identity evidence without changing rights", async () => {
  const env = envWith({
    Members: [
      { id: "recMemberABC12345", fields: { "Contact Email": "member@example.com", member_id: "MMD-001" } },
    ],
  });

  const result = await inspectRecoveryEvidence(env, {
    lineUserId: LINE_ID,
    email: "member@example.com",
  });

  assert.equal(result.state, "known_identity");
  assert.equal(result.match_type, "exact_member_email");
  assert.equal(result.confidence, 100);
  assert.deepEqual(result.candidateMemberIds, ["recMemberABC12345"]);
});

test("ambiguous canonical Member email fails closed to manual review", async () => {
  const env = envWith({
    Members: [
      { id: "recMemberABC12345", fields: { "Contact Email": "dup@example.com" } },
      { id: "recMemberXYZ12345", fields: { "Contact Email": "dup@example.com" } },
    ],
  });

  const result = await inspectRecoveryEvidence(env, {
    lineUserId: LINE_ID,
    email: "dup@example.com",
  });

  assert.equal(result.state, "review_required");
  assert.equal(result.match_type, "ambiguous");
  assert.equal(result.confidence, 0);
});

test("a claimed old account with no exact evidence is review_required, never auto-created as a new Member", async () => {
  const result = await inspectRecoveryEvidence(envWith(), {
    lineUserId: LINE_ID,
    email: "missing@example.com",
  });

  assert.equal(result.state, "review_required");
  assert.equal(result.match_type, "not_found");
  assert.deepEqual(result.candidateMemberIds, []);
  assert.deepEqual(result.candidateClientIds, []);
});

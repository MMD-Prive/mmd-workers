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

test("one exact Client phone match is treated as known prior identity without changing rights", async () => {
  const env = envWith({
    Clients: [
      { id: "recClientPhone123", fields: { "Phone Number": "081 234 5678" } },
    ],
  });

  const result = await inspectRecoveryEvidence(env, {
    lineUserId: LINE_ID,
    phone: "081-234-5678",
  });

  assert.equal(result.state, "known_identity");
  assert.equal(result.match_type, "exact_client_phone");
  assert.equal(result.confidence, 92);
  assert.deepEqual(result.candidateClientIds, ["recClientPhone123"]);
  assert.deepEqual(result.evidenceSources, ["clients_phone"]);
});

test("one exact Client nickname match is treated as review evidence without changing rights", async () => {
  const env = envWith({
    Clients: [
      { id: "recClientNick123", fields: { nickname: "บอส" } },
    ],
  });

  const result = await inspectRecoveryEvidence(env, {
    lineUserId: LINE_ID,
    nickname: " บอส ",
  });

  assert.equal(result.state, "known_identity");
  assert.equal(result.match_type, "exact_client_nickname");
  assert.equal(result.confidence, 70);
  assert.deepEqual(result.candidateClientIds, ["recClientNick123"]);
  assert.deepEqual(result.evidenceSources, ["clients_nickname"]);
});

test("LINE OFC nickname candidate is queued as manual review evidence", async () => {
  const env = envWith({
    "LINE OFC Client Import Staging": [
      { id: "recLineOfcNick123", fields: { normalized_name: "book" } },
    ],
  });

  const result = await inspectRecoveryEvidence(env, {
    lineUserId: LINE_ID,
    nickname: "Book",
  });

  assert.equal(result.state, "known_identity");
  assert.equal(result.match_type, "line_ofc_nickname");
  assert.equal(result.confidence, 60);
  assert.deepEqual(result.candidateClientIds, []);
  assert.deepEqual(result.evidenceSources, ["line_ofc_nickname_candidate"]);
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

test("ambiguous nickname evidence fails closed to manual review", async () => {
  const env = envWith({
    Clients: [
      { id: "recClientNickABC1", fields: { nickname: "บอส" } },
      { id: "recClientNickXYZ1", fields: { nickname: "บอส" } },
    ],
  });

  const result = await inspectRecoveryEvidence(env, {
    lineUserId: LINE_ID,
    nickname: "บอส",
  });

  assert.equal(result.state, "review_required");
  assert.equal(result.match_type, "ambiguous");
  assert.equal(result.confidence, 0);
});

test("unlinked Client Access Evidence never establishes identity", async () => {
  const env = envWith({
    "Client Access Evidence": [
      { id: "recEvidenceAAA123", fields: { identity_email: "raw@example.com", review_status: "approved_evidence" } },
    ],
  });

  const result = await inspectRecoveryEvidence(env, {
    lineUserId: LINE_ID,
    email: "raw@example.com",
  });

  assert.equal(result.state, "review_required");
  assert.equal(result.match_type, "not_found");
  assert.deepEqual(result.candidateClientIds, []);
});

test("review-required Client Access Evidence never establishes identity even when linked", async () => {
  const env = envWith({
    "Client Access Evidence": [
      { id: "recEvidenceBBB123", fields: { identity_email: "pending@example.com", review_status: "review_required", client: ["recClientABC12345"] } },
    ],
  });

  const result = await inspectRecoveryEvidence(env, {
    lineUserId: LINE_ID,
    email: "pending@example.com",
  });

  assert.equal(result.state, "review_required");
  assert.equal(result.match_type, "not_found");
  assert.deepEqual(result.candidateClientIds, []);
});

test("approved Client Access Evidence with exactly one Canonical Client is known identity", async () => {
  const env = envWith({
    "Client Access Evidence": [
      { id: "recEvidenceCCC123", fields: { identity_email: "approved@example.com", review_status: "approved_evidence", client: ["recClientABC12345"] } },
    ],
  });

  const result = await inspectRecoveryEvidence(env, {
    lineUserId: LINE_ID,
    email: "approved@example.com",
  });

  assert.equal(result.state, "known_identity");
  assert.equal(result.match_type, "client_access_evidence");
  assert.equal(result.confidence, 90);
  assert.deepEqual(result.candidateClientIds, ["recClientABC12345"]);
  assert.deepEqual(result.evidenceSources, ["client_access_evidence"]);
});

test("approved Client Access Evidence pointing to multiple Canonical Clients fails closed", async () => {
  const env = envWith({
    "Client Access Evidence": [
      { id: "recEvidenceDDD123", fields: { identity_email: "conflict@example.com", review_status: "approved_evidence", client: ["recClientABC12345"] } },
      { id: "recEvidenceEEE123", fields: { identity_email: "conflict@example.com", review_status: "approved_evidence", client: ["recClientXYZ12345"] } },
    ],
  });

  const result = await inspectRecoveryEvidence(env, {
    lineUserId: LINE_ID,
    email: "conflict@example.com",
  });

  assert.equal(result.state, "review_required");
  assert.equal(result.match_type, "ambiguous");
  assert.deepEqual(result.candidateClientIds, ["recClientABC12345", "recClientXYZ12345"]);
});

test("a claimed old account with no exact evidence is review_required, never auto-created as a new Member", async () => {
  const result = await inspectRecoveryEvidence(envWith(), {
    lineUserId: LINE_ID,
    phone: "0991234567",
    nickname: "missing",
  });

  assert.equal(result.state, "review_required");
  assert.equal(result.match_type, "not_found");
  assert.deepEqual(result.candidateMemberIds, []);
  assert.deepEqual(result.candidateClientIds, []);
});

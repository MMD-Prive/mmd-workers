import test from "node:test";
import assert from "node:assert/strict";
import {
  legacyCandidate,
  privateCandidate,
  matchVerifiedPaymentProof,
  __test,
} from "./src/member-history-recovery.js";

const clientId = "rec12345678901234";

test("legacy candidate uses structured evidence without exposing raw note", async () => {
  const candidate = legacyCandidate({
    id: "recAAAAAAAAAAAAAA",
    fields: {
      import_id: "line-import-1",
      raw_note: "secret raw note",
      historical_events_json: JSON.stringify({
        amounts: [{ type: "service", amount: 1500 }],
        dates: ["2026-08-01"],
        payment_refs: ["PAY-1"],
        service_details: { service_type: "companion", location_text: "Bangkok" },
      }),
      historical_service_status: "completed",
    },
  }, clientId);
  await __test.normalizeCandidateIds([candidate]);
  assert.equal(candidate.amount_thb, 1500);
  assert.equal(candidate.service_date, "2026-08-01");
  assert.match(candidate.history_review_id, /^hist_review_[a-f0-9]{24}$/);
  assert.equal(candidate.evidence_summary.includes("secret raw note"), false);
});

test("private critical evidence remains review-required", () => {
  const candidate = privateCandidate({
    id: "recBBBBBBBBBBBBBB",
    fields: {
      "Import ID": "private-1",
      "Source Hash": "abc123",
      "Service History Candidate JSON": JSON.stringify({
        service_count: 1,
        service_amount_thb: 15500,
        service_date: "2026-08-21",
        service_type: "private_model",
        private_critical_evidence: true,
        needs_human_review: true,
      }),
    },
  }, clientId);
  assert.equal(candidate.requires_human_review, true);
});

test("verified payment proof requires exact verified evidence", () => {
  const candidate = { service_date: "2026-08-01", amount_thb: 1500, payment_ref: "PAY-1" };
  const result = matchVerifiedPaymentProof(candidate, [{
    id: "recPPPPPPPPPPPPPP",
    fields: {
      status: "verified",
      verified_at: "2026-08-02T00:00:00.000Z",
      verified_by: "official-verify",
      payment_ref: "PAY-1",
      amount_thb: 1500,
      paid_at: "2026-08-01",
    },
  }]);
  assert.equal(result.kind, "one");
});

test("public status excludes private note and LINE identity", () => {
  const status = __test.publicStatus({
    state: "review_required",
    source_note_count: 3,
    raw_note: "do not leak",
    line_user_id: "U00000000000000000000000000000000",
  });
  assert.equal(status.state, "review_required");
  assert.equal("raw_note" in status, false);
  assert.equal("line_user_id" in status, false);
});

class FakeDb {
  constructor() {
    this.sessions = [];
    this.payments = [];
  }

  async list(table, { formula }) {
    if (table === "tblC98mKWbzmPuNzX") {
      return this.sessions.filter((record) => formula.includes(record.fields.session_id));
    }
    if (table === "tblWGGJJOx5eBvBZJ") {
      const match = formula.match(/'([^']+)'/);
      return this.payments.filter((record) => record.fields["Payment Reference"] === match?.[1]);
    }
    return [];
  }

  async create(table, fields) {
    const record = {
      id: `rec${String(this.sessions.length + this.payments.length).padStart(14, "0")}`,
      fields,
    };
    if (table === "tblC98mKWbzmPuNzX") this.sessions.push(record);
    if (table === "tblWGGJJOx5eBvBZJ") this.payments.push(record);
    return record;
  }
}

test("canonical materialization is idempotent", async () => {
  const db = new FakeDb();
  const candidate = {
    history_review_id: "hist_review_123456789012345678901234",
    client_id: clientId,
    service_date: "2026-08-01",
    amount_thb: 1500,
  };
  const proof = {
    fields: {
      payment_ref: "PAY-1",
      paid_at: "2026-08-01",
      verified_at: "2026-08-02T00:00:00Z",
    },
  };
  const review = { fields: { history_review_id: candidate.history_review_id } };
  assert.equal(await __test.materializeCanonicalHistory({ db, candidate, proof, review }), "materialized");
  assert.equal(await __test.materializeCanonicalHistory({ db, candidate, proof, review }), "duplicate");
  assert.equal(db.sessions.length, 1);
  assert.equal(db.payments.length, 1);
});

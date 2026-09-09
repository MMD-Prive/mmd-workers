const test = require("node:test");
const assert = require("node:assert/strict");

const {
  evidenceKind,
  normalizeMmsHistoryRow,
  runMmsHistoryEvidenceIntake,
} = require("./mms-history-evidence-intake.js");

class FakeAirtable {
  constructor() {
    this.writes = [];
    this.existing = new Map();
  }

  async list() {
    return [];
  }

  async findOne(table, formula) {
    return this.existing.get(`${table}:${formula}`) || null;
  }

  async requestWithFieldFallback(table, init) {
    const fields = { ...(init.body?.fields || {}) };
    const record = { id: `rec_${this.writes.length + 1}`, fields };
    this.writes.push({ table, method: init.method, fields });
    return record;
  }
}

test("MMS customer slip is normalized into the canonical LINE crew evidence contract", () => {
  const row = normalizeMmsHistoryRow({
    message_id: "mms-msg-001",
    display_name: "Customer A",
    message_text: "ส่งสลิปมัดจำ 1,500 บาทครับ",
    amount_thb: "1500",
    payment_ref: "MMSPAY001",
    attachment_url: "https://example.invalid/mms-slip.webp",
  }, 0);

  assert.equal(row.source, "line_crew");
  assert.equal(row.source_ref, "mms:male_massage:mms-msg-001");
  assert.match(row.raw_note, /group=Male Massage/);
  assert.match(row.raw_note, /kind=payment/);
  assert.equal(row.amount_thb, "1500");
  assert.equal(row.payment_ref, "MMSPAY001");
  assert.equal(row.attachment_url, "https://example.invalid/mms-slip.webp");
});

test("MMS payout evidence does not get promoted into customer Payment Proofs", async () => {
  const airtable = new FakeAirtable();
  const result = await runMmsHistoryEvidenceIntake({
    rows: [{
      message_id: "mms-payout-001",
      display_name: "Therapist A",
      message_text: "โอนให้น้อง Therapist แล้ว ค่าแรง 2,000 บาท",
      amount_thb: "2000",
      payment_ref: "PAYOUT2000",
      attachment_url: "https://example.invalid/payout.webp",
    }],
    batchId: "mms_history_test",
    applyEvidence: true,
    airtable,
  });

  assert.equal(result.mode, "mms_history_evidence_intake_v1");
  assert.equal(result.tenant, "mms");
  assert.equal(result.evidence_kinds.payout, 1);
  assert.equal(result.boundaries.payment_truth_changed, false);
  assert.equal(result.boundaries.session_or_booking_truth_changed, false);
  assert.equal(airtable.writes.length, 1);
  assert.equal(airtable.writes[0].table, "tbl1u0foFBvgFpT9G");
  assert.match(airtable.writes[0].fields.raw_row_json, /kind=payout/);
});

test("room-level operational document remains review-only and gets a safe room identity fallback", () => {
  const row = normalizeMmsHistoryRow({
    message_ref: "doc-001",
    file_name: "therapist-document.pdf",
    attachment_url: "https://example.invalid/therapist-document.pdf",
  }, 0);

  assert.equal(evidenceKind(row), "operational_document");
  assert.equal(row.line_renamed_name, "Male Massage");
  assert.equal(row.attachment_url, "");
  assert.match(row.raw_note, /attachment_url=https:\/\/example\.invalid\/therapist-document\.pdf/);
});

test("dry-run keeps all canonical truth boundaries closed", async () => {
  const airtable = new FakeAirtable();
  const result = await runMmsHistoryEvidenceIntake({
    rows: [{
      message_id: "mms-msg-002",
      display_name: "Customer B",
      message_text: "payment slip deposit 2500 THB",
      amount_thb: "2500",
    }],
    batchId: "mms_history_dry_run",
    airtable,
  });

  assert.equal(result.dry_run, true);
  assert.equal(result.boundaries.payment_truth_changed, false);
  assert.equal(result.boundaries.points_ledger_changed, false);
  assert.equal(result.boundaries.current_entitlement_changed, false);
  assert.equal(airtable.writes.length, 0);
});

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

test("OA customer notes use the renamed name and a stable OA source, not the crew room", async () => {
  const rows = [{ source: "line_ofc", note_id: "customer-a:note-1", current_line_rename: "คุณเอ MMS",
    display_name: "LINE display", line_user_id: `U${"a".repeat(32)}`,
    evidence_kind: "service_history", raw_line_notes: "บริการนวด 1,500 บาท 2026-07-01", date: "2026-07-01" }];
  const row = normalizeMmsHistoryRow(rows[0]);
  assert.equal(row.source, "line_ofc");
  assert.equal(row.line_renamed_name, "คุณเอ MMS");
  assert.equal(row.source_ref, "mms:line_ofc:customer-a:note-1");
  assert.match(row.raw_note, /บริการนวด/);
  assert.doesNotMatch(row.raw_note, /group=Male Massage/);
  const airtable = new FakeAirtable();
  const result = await runMmsHistoryEvidenceIntake({ rows, airtable, applyEvidence: true });
  assert.equal(result.source_account, "@malemassage");
  assert.equal(result.source_group_name, null);
  assert.equal(result.plans[0].proof_id, "");
  assert.equal(airtable.writes.length, 1);
  assert.equal(result.plans[0].matched_client_id, "");
});

test("OA import rejects missing stable reference and missing customer identity", async () => {
  assert.throws(() => normalizeMmsHistoryRow({ source: "line_ofc", raw_note: "test" }), /MMS_OFC_SOURCE_REF_REQUIRED/);
  await assert.rejects(runMmsHistoryEvidenceIntake({ source: "line_ofc", rows: [{ note_id: "note-1", raw_note: "test" }], airtable: new FakeAirtable() }), /HISTORY_IDENTITY_EVIDENCE_REQUIRED/);
});

test("OA replay survives batch and row-order changes, while different notes remain distinct", async () => {
  const a = { note_id: "a:1", current_line_rename: "A", raw_line_notes: "นวดไทย" };
  const b = { note_id: "b:1", current_line_rename: "B", raw_line_notes: "นวดไทย" };
  const airtable = new FakeAirtable();
  const first = await runMmsHistoryEvidenceIntake({ source: "line_ofc", rows: [a, b], batchId: "first", airtable });
  const second = await runMmsHistoryEvidenceIntake({ source: "line_ofc", rows: [b, a], batchId: "second", airtable });
  assert.equal(first.plans[0].import_id, second.plans[1].import_id);
  assert.notEqual(first.plans[0].import_id, first.plans[1].import_id);
});

test("payout date alone never creates a customer payment proof", async () => {
  const airtable = new FakeAirtable();
  const result = await runMmsHistoryEvidenceIntake({ rows: [{ message_id: "payout-dated", display_name: "Therapist", kind: "payout", raw_note: "ค่าแรง", date: "2026-07-01" }], airtable, applyEvidence: true });
  assert.equal(result.plans[0].proof_id, "");
  assert.equal(airtable.writes.length, 1);
});

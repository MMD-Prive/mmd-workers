const test = require("node:test");
const assert = require("node:assert/strict");

const {
  PAYMENT_PROOFS_TABLE,
  STAGING_TABLE,
  buildEvidencePlan,
  normalizeItem,
  runHistoryEvidenceIntake,
} = require("./history-evidence-intake.js");

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

test("LINE OA service history produces staged proposed points but no truth mutation", async () => {
  const airtable = new FakeAirtable();
  const item = normalizeItem({
    source: "line_ofc",
    source_ref: "oa:chat:peapo:2024-05-12:001",
    line_user_id: "U0123456789abcdef0123456789abcdef",
    line_display_name: "Peapo",
    line_renamed_name: "โป้ Blackcard",
    tags: "#client #mem65 #mem66 #memBlackCard",
    note: "Service purchase 12,000 THB on 12/05/2024 ref ABCD1234",
  }, 0);

  const plan = await buildEvidencePlan(item, { batchId: "history_test", airtable });
  assert.equal(plan.staging_fields.line_renamed_name, "โป้ Blackcard");
  assert.equal(plan.staging_fields.proposed_points, 120);
  assert.equal(plan.staging_fields.points_review_required, "false");
  assert.equal(plan.payment_proof_fields, null);
  assert.equal(airtable.writes.length, 0);
});

test("Crew slip metadata is payment evidence only and does not invent service points", async () => {
  const airtable = new FakeAirtable();
  const item = normalizeItem({
    source: "line_crew",
    source_ref: "crew:album:2026-06:peapo-slip-001",
    line_renamed_name: "โป้ Blackcard",
    amount_thb: 35000,
    paid_at: "2026-06-22T14:17:00+07:00",
    payment_ref: "A24fe4dc9b64e43ca",
    slip_url: "https://example.invalid/private-slip-ref",
  }, 0);

  const plan = await buildEvidencePlan(item, { batchId: "history_test", airtable });
  assert.equal(plan.staging_fields.proposed_points, 0);
  assert.equal(plan.payment_proof_fields.amount_thb, 35000);
  assert.equal(plan.payment_proof_fields.payment_ref, "A24fe4dc9b64e43ca");
  assert.equal(plan.payment_proof_fields.status, "pending");
  assert.equal(Object.hasOwn(plan.payment_proof_fields, "verified_at"), false);
  assert.equal(Object.hasOwn(plan.payment_proof_fields, "verified_by"), false);
  assert.equal(Object.hasOwn(plan.payment_proof_fields, "payment"), false);
  assert.equal(Object.hasOwn(plan.payment_proof_fields, "member"), false);
  assert.equal(Object.hasOwn(plan.payment_proof_fields, "session"), false);
});

test("dry-run is default and writes nothing", async () => {
  const airtable = new FakeAirtable();
  const result = await runHistoryEvidenceIntake({
    items: [{
      source: "line_group_album",
      source_ref: "album:annual-membership:2025:001",
      line_renamed_name: "คุณเอ",
      tags: "#client #mem25 Premium",
      note: "ใช้บริการ 5,000 บาท 12/06/2025 ref JOB5000",
    }],
    batchId: "history_dry_run",
    airtable,
  });

  assert.equal(result.dry_run, true);
  assert.equal(result.boundaries.current_entitlement_changed, false);
  assert.equal(result.boundaries.points_ledger_changed, false);
  assert.equal(result.boundaries.payment_truth_changed, false);
  assert.equal(result.boundaries.session_or_booking_truth_changed, false);
  assert.equal(airtable.writes.length, 0);
});

test("explicit apply writes only staging and pending payment proof tables", async () => {
  const airtable = new FakeAirtable();
  const result = await runHistoryEvidenceIntake({
    items: [{
      source: "line_crew",
      source_ref: "crew:msg:001",
      line_renamed_name: "คุณบี",
      note: "ลูกค้าส่งสลิปไว้ในกลุ่ม Crew",
      amount_thb: 4200,
      paid_at: "2025-03-04",
      payment_ref: "CREW4200",
    }],
    batchId: "history_apply",
    applyEvidence: true,
    airtable,
  });

  assert.equal(result.dry_run, false);
  assert.equal(airtable.writes.length, 2);
  assert.deepEqual(new Set(airtable.writes.map((write) => write.table)), new Set([STAGING_TABLE, PAYMENT_PROOFS_TABLE]));
  const proofWrite = airtable.writes.find((write) => write.table === PAYMENT_PROOFS_TABLE);
  assert.equal(proofWrite.fields.status, "pending");
  assert.equal(result.boundaries.current_entitlement_changed, false);
  assert.equal(result.boundaries.points_ledger_changed, false);
});

test("rejects unsafe or unsupported intake source", () => {
  assert.throws(() => normalizeItem({
    source: "airtable",
    source_ref: "x",
    line_renamed_name: "A",
    note: "history",
  }, 0), /HISTORY_SOURCE_NOT_ALLOWED/);

  assert.throws(() => normalizeItem({
    source: "line_ofc",
    source_ref: "Bearer secret-token",
    line_renamed_name: "A",
    note: "history",
  }, 0), /HISTORY_SOURCE_REF_LOOKS_SECRET/);
});

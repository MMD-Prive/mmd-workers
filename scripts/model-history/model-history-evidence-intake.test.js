const test = require("node:test");
const assert = require("node:assert/strict");

const {
  FIELD,
  TABLE_ID,
  buildPlan,
  normalizeRow,
  runModelHistoryEvidenceIntake,
  splitConfirmationBlocks,
} = require("./model-history-evidence-intake.js");

const MODEL_ID = "recModelABC123456789";

class FakeAirtable {
  constructor() {
    this.records = new Map();
    this.writes = [];
  }

  async findOne(table, formula) {
    assert.equal(table, TABLE_ID);
    const importId = formula.match(/="([^"]+)"$/)?.[1] || "";
    return this.records.get(importId) || null;
  }

  async request(table, init) {
    assert.equal(table, TABLE_ID);
    assert.equal(init.method, "POST");
    const fields = { ...init.body.fields };
    const record = { id: `recImport${this.writes.length + 1}`, fields };
    this.records.set(fields[FIELD.importId], record);
    this.writes.push(record);
    return record;
  }
}

test("MMD Confirmation is staged for owner review and stays invisible to the model", async () => {
  const airtable = new FakeAirtable();
  const result = await runModelHistoryEvidenceIntake({
    rows: [{
      source: "line_model_group",
      source_ref: "group:confirm:001",
      model_name: "Model A",
      model_id_candidate: MODEL_ID,
      raw_text: "MMD Confirmation\nModel: Model A\n12/05/2024\nค่าตัว 4,500 บาท\nเวลา 19:00-22:00",
    }],
    airtable,
  });

  assert.equal(result.dry_run, true);
  assert.equal(result.plans[0].evidence_kind, "mmd_confirmation");
  assert.equal(result.plans[0].amount_basis, "model_payout_label");
  assert.equal(result.plans[0].review_status, "needs_review");
  assert.equal(result.plans[0].privacy_level, "internal");
  assert.equal(result.safety.model_visible_records_created, false);
  assert.equal(airtable.writes.length, 0);
});

test("missing slip is recorded as missing evidence, never as unpaid", () => {
  const item = normalizeRow({
    source: "line_private_chat",
    source_ref: "private:001",
    model_id_candidate: MODEL_ID,
    raw_text: "MMD Confirmation งานวันที่ 2025-03-04 ค่าตัว 3000 บาท",
  }, 0);
  const plan = buildPlan(item, item.rawText, 0);

  assert.equal(plan.summary.slip_status, "not_attached");
  assert.match(plan.fields[FIELD.adminNote], /missing_slip_never_means_unpaid=true/);
  assert.equal(plan.fields[FIELD.sourceType], "other");
  assert.equal(plan.fields[FIELD.sourceName], "LINE private chat");
  assert.equal(JSON.stringify(plan.summary).includes(item.rawText), false);
});

test("informal conversation without confirmation remains in the review queue", () => {
  const item = normalizeRow({
    source: "chat_backup",
    source_ref: "backup:informal:001",
    model_name: "Model B",
    raw_text: "คุยกันไว้แล้ว งานพรุ่งนี้ช่วงค่ำ แต่ยังไม่ได้ทำคอนเฟิร์ม",
  }, 0);
  const plan = buildPlan(item, item.rawText, 0);

  assert.equal(plan.summary.evidence_kind, "informal_conversation");
  assert.equal(plan.fields[FIELD.review], "needs_review");
  assert.equal(plan.fields[FIELD.privacy], "internal");
  assert.equal(plan.fields[FIELD.workType], "needs_review");
});

test("model identity is linked only from an exact Airtable record ID", () => {
  const invalid = normalizeRow({
    source: "line_group_note",
    source_ref: "note:001",
    model_id_candidate: "Model A",
    raw_text: "MMD Confirmation งานวันที่ 2025-01-01",
  }, 0);
  const invalidPlan = buildPlan(invalid, invalid.rawText, 0);
  assert.equal(Object.hasOwn(invalidPlan.fields, FIELD.modelId), false);
  assert.equal(invalidPlan.summary.model_identity, "invalid_model_record_id_requires_review");

  const valid = normalizeRow({
    source: "line_group_note",
    source_ref: "note:002",
    model_id_candidate: MODEL_ID,
    raw_text: "MMD Confirmation งานวันที่ 2025-01-01",
  }, 0);
  const validPlan = buildPlan(valid, valid.rawText, 0);
  assert.equal(validPlan.fields[FIELD.modelId], MODEL_ID);
});

test("apply is idempotent and duplicate import IDs are not written twice", async () => {
  const airtable = new FakeAirtable();
  const input = [{
    source: "line_team_group",
    source_ref: "team:001",
    model_id_candidate: MODEL_ID,
    raw_text: "MMD Confirmation 2025-05-20 payout 5,000 THB",
  }];
  const first = await runModelHistoryEvidenceIntake({ rows: input, apply: true, airtable });
  const second = await runModelHistoryEvidenceIntake({ rows: input, apply: true, airtable });

  assert.equal(first.created_count, 1);
  assert.equal(first.duplicate_count, 0);
  assert.equal(second.created_count, 0);
  assert.equal(second.duplicate_count, 1);
  assert.equal(airtable.writes.length, 1);
});

test("multiple confirmations in one backup become separate review items", () => {
  const blocks = splitConfirmationBlocks("header\nMMD Confirmation first\nMMD Confirmation second");
  assert.deepEqual(blocks, ["header", "MMD Confirmation first", "MMD Confirmation second"]);
});

test("dry-run output never contains raw chat text", async () => {
  const secretText = "MMD Confirmation private customer details should not print";
  const result = await runModelHistoryEvidenceIntake({
    rows: [{ source: "chat_backup", source_ref: "backup:001", raw_text: secretText }],
    airtable: new FakeAirtable(),
  });
  assert.equal(JSON.stringify(result).includes(secretText), false);
  assert.equal(result.safety.raw_text_in_output, false);
});

test("source references that look like secrets are rejected", () => {
  assert.throws(() => normalizeRow({
    source: "chat_backup",
    source_ref: "Bearer very-secret-token",
    raw_text: "history",
  }, 0), /MODEL_HISTORY_SOURCE_REF_LOOKS_SECRET/);
});

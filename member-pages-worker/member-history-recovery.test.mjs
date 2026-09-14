import test from "node:test";
import assert from "node:assert/strict";
import {
  legacyCandidate,
  privateCandidate,
  detectExplicitCancellation,
  findOrphanPaymentProofs,
  notePointSummary,
  __test,
} from "./src/member-history-recovery.js";

const CLIENT_ID = "rec12345678901234";
const LINE_ID = `U${"a".repeat(32)}`;

class FakeDb {
  constructor() {
    this.tables = new Map();
  }

  rows(table) {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return this.tables.get(table);
  }

  async list(table, { formula = "" } = {}) {
    const rows = this.rows(table);
    if (table === "tblC98mKWbzmPuNzX") {
      const ids = [...formula.matchAll(/'([^']+)'/g)].map((match) => match[1]);
      return rows.filter((row) => ids.includes(row.fields.session_id) || ids.includes(row.fields.imported_source_ref));
    }
    if (table === "tbl5dfnwjUFMLbnWL") return rows;
    return rows;
  }

  async findOne(table, formula) {
    const match = formula.match(/'([^']+)'/);
    const key = match?.[1];
    const rows = this.rows(table).filter((row) => row.fields.history_review_id === key);
    return rows.length === 1 ? rows[0] : null;
  }

  async create(table, fields) {
    const row = {
      id: `rec${String(this.rows(table).length + 1).padStart(14, "0")}`,
      fields: { ...fields },
    };
    this.rows(table).push(row);
    return row;
  }

  async update(table, id, fields) {
    const row = this.rows(table).find((item) => item.id === id);
    if (!row) throw new Error("missing_fake_row");
    row.fields = { ...row.fields, ...fields };
    return row;
  }
}

test("legacy note is a completed occurrence without requiring an old slip", async () => {
  const candidate = legacyCandidate({
    id: "recAAAAAAAAAAAAAA",
    fields: {
      import_id: "line-import-1",
      raw_note: "งานกับ Model A 1,500 บาท วันที่ 1/8/2026",
      line_renamed_name: "คุณเอ็ม",
      historical_events_json: JSON.stringify({
        amounts: [{ type: "service", amount: 1500 }],
        dates: ["2026-08-01"],
        payment_refs: [],
        service_details: { model_text: "Model A", service_type: "companion" },
      }),
      reconciled_service_amount: 1500,
    },
  }, CLIENT_ID, LINE_ID);
  const [normalized] = await __test.normalizeAndDedupeCandidates([candidate]);
  const db = new FakeDb();
  const result = await __test.processNoteCandidate({
    db,
    candidate: normalized,
    trigger: "login",
    now: new Date("2026-09-14T03:00:00Z"),
  });
  assert.equal(result.kind, "materialized");
  assert.equal(db.rows("tblC98mKWbzmPuNzX").length, 1);
  assert.equal(db.rows("tblC98mKWbzmPuNzX")[0].fields["Session Status"], "Completed");
  assert.equal(db.rows("tblnpDFQMpo8AmNQv")[0].fields.review_status, "materialized");
});

test("an explicit cancel marker excludes the job and points", async () => {
  assert.equal(detectExplicitCancellation("งานยกเลิก ลูกค้าแจ้งแล้ว"), true);
  const candidate = legacyCandidate({
    id: "recBBBBBBBBBBBBBB",
    fields: {
      import_id: "line-import-cancel",
      raw_note: "งานยกเลิก 2,000 บาท",
      historical_events_json: JSON.stringify({
        amounts: [{ type: "service", amount: 2000 }],
        dates: ["2026-08-02"],
      }),
      service_amount: 2000,
    },
  }, CLIENT_ID, LINE_ID);
  const [normalized] = await __test.normalizeAndDedupeCandidates([candidate]);
  const db = new FakeDb();
  const result = await __test.processNoteCandidate({
    db,
    candidate: normalized,
    trigger: "login",
    now: new Date(),
  });
  assert.equal(result.kind, "cancelled");
  assert.equal(db.rows("tblC98mKWbzmPuNzX").length, 0);
  assert.deepEqual(notePointSummary([normalized]), {
    eligible_amount_thb: 0,
    points: 0,
    rate_thb_per_point: 100,
    expires: false,
  });
});

test("historical points use the combined note total and do not expire", () => {
  const result = notePointSummary([
    { note_present: true, cancelled: false, points_eligible_amount_thb: 1550 },
    { note_present: true, cancelled: false, points_eligible_amount_thb: 950 },
    { note_present: true, cancelled: true, points_eligible_amount_thb: 9000 },
  ]);
  assert.equal(result.eligible_amount_thb, 2500);
  assert.equal(result.points, 25);
  assert.equal(result.expires, false);
});

test("aggregate historical points are updated idempotently instead of duplicated", async () => {
  const db = new FakeDb();
  const wallet = { member_id: "MMD-1", member_email: "member@example.com" };
  const target = { points: 25, eligible_amount_thb: 2500 };
  const first = await __test.reconcileHistoricalPointsTotal({
    db,
    wallet,
    clientId: CLIENT_ID,
    pointsTarget: target,
    now: new Date("2026-09-14T03:00:00Z"),
  });
  const second = await __test.reconcileHistoricalPointsTotal({
    db,
    wallet,
    clientId: CLIENT_ID,
    pointsTarget: target,
    now: new Date("2026-09-14T04:00:00Z"),
  });
  assert.equal(first.current_points_total, 25);
  assert.equal(first.historical_points_added, 25);
  assert.equal(second.current_points_total, 25);
  assert.equal(second.historical_points_added, 0);
  assert.equal(db.rows("tbl5dfnwjUFMLbnWL").length, 1);
  assert.equal(db.rows("tbl5dfnwjUFMLbnWL")[0].fields.expires_at, undefined);
});

test("verified slip with no note match remains orphan evidence for later stitching", () => {
  const proofs = [{
    id: "recPPPPPPPPPPPPPP",
    fields: {
      amount_thb: 3200,
      paid_at: "2026-08-05",
      payment_ref: "PAY-X",
      Client: [CLIENT_ID],
    },
  }];
  const orphans = findOrphanPaymentProofs(proofs, [{
    cancelled: false,
    service_amount_thb: 1500,
    service_date: "2026-08-01",
    payment_ref: "",
  }]);
  assert.equal(orphans.length, 1);
});

test("private history candidate follows the same note-first rule", () => {
  const candidate = privateCandidate({
    id: "recCCCCCCCCCCCCCC",
    fields: {
      "Import ID": "private-1",
      "Raw LINE Notes": "งาน private model เรียบร้อย 12,000 บาท",
      "Service History Candidate JSON": JSON.stringify({
        service_amount_thb: 12000,
        service_date: "2026-07-20",
        model_name: "Model B",
      }),
    },
  }, CLIENT_ID, LINE_ID);
  assert.equal(candidate.note_present, true);
  assert.equal(candidate.cancelled, false);
  assert.equal(candidate.points_eligible_amount_thb, 12000);
});

test("public recovery status includes total points policy but never raw evidence", () => {
  const status = __test.publicStatus({
    state: "review_required",
    source_note_count: 5,
    current_points_total: 325,
    historical_points_recovered: 250,
    raw_note: "private",
    line_user_id: LINE_ID,
  });
  assert.equal(status.current_points_total, 325);
  assert.equal(status.points_expire, false);
  assert.equal(status.history_window_years, 5);
  assert.equal("raw_note" in status, false);
  assert.equal("line_user_id" in status, false);
});

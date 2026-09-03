const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assertHistoricalEventGate,
  assertReviewGate,
  buildMaterializationPlan,
  materializeHistoricalRecord,
  parseHistoricalDate,
} = require("./history-materializer.js");

function reviewedFields(overrides = {}) {
  return {
    import_id: "line_ofc_hist_001",
    review_status: "committed",
    decision: "link_existing_client",
    decision_source: "manual_review",
    reviewed_by: "per",
    reviewed_at: "2026-09-03T16:00:00.000Z",
    matched_client_id: "recABCDEFGHIJKL",
    matched_client: ["recABCDEFGHIJKL"],
    dry_run_only: false,
    line_renamed_name: "โป้ Blackcard",
    email_candidate: "customer@example.com",
    historical_events_json: JSON.stringify({
      amounts: [{ type: "service", amount: 1250, token: "1,250 บาท", context: "service 1,250 บาท" }],
      dates: ["13/07/2569"],
      payment_refs: ["ref HIST001"],
    }),
    points_eligible_amount: 1250,
    unknown_amount: 0,
    points_review_required: "false",
    ...overrides,
  };
}

function client() {
  return { id: "recABCDEFGHIJKL", fields: { "Client Name": "โป้", "Contact Email": "customer@example.com" } };
}

test("manual committed identity review is mandatory", () => {
  assert.throws(() => assertReviewGate(reviewedFields({ review_status: "ready_to_review" })), /HISTORY_REVIEW_NOT_COMMITTED/);
  assert.throws(() => assertReviewGate(reviewedFields({ decision_source: "parser" })), /HISTORY_MANUAL_REVIEW_REQUIRED/);
  assert.equal(assertReviewGate(reviewedFields()).clientId, "recABCDEFGHIJKL");
});

test("Thai Buddhist historical date is normalized without changing the day", () => {
  assert.equal(parseHistoricalDate("13/07/2569"), "2026-07-13T12:00:00.000Z");
});

test("single reviewed service event produces deterministic session/payment/points plan", () => {
  const fields = reviewedFields();
  const planA = buildMaterializationPlan({ fields, importId: fields.import_id, client: client(), priorRemainderThb: 50 });
  const planB = buildMaterializationPlan({ fields, importId: fields.import_id, client: client(), priorRemainderThb: 50 });
  assert.equal(planA.writes.session.session_id, planB.writes.session.session_id);
  assert.equal(planA.writes.payment.payment_ref, planB.writes.payment.payment_ref);
  assert.equal(planA.writes.points.points, 13);
  assert.equal(planA.writes.points.remainder_after_thb, 0);
  assert.equal(planA.writes.payment["Verification Status"], "historical_reviewed");
  assert.deepEqual(planA.forbidden_writes, ["MMD — Member Entitlements"]);
});

test("ambiguous or points-review-required history fails closed", () => {
  assert.throws(() => assertHistoricalEventGate(reviewedFields({ points_review_required: "true" })), /HISTORY_POINTS_REVIEW_REQUIRED/);
  const multiple = reviewedFields({
    historical_events_json: JSON.stringify({
      amounts: [{ type: "service", amount: 1000 }, { type: "service", amount: 2000 }],
      dates: ["2025-01-01"],
      payment_refs: [],
    }),
  });
  assert.throws(() => assertHistoricalEventGate(multiple), /HISTORY_MULTIPLE_SERVICE_EVENTS_REVIEW_REQUIRED/);
});

class FakeAirtable {
  constructor(fields = reviewedFields()) {
    this.staging = { id: "recSTAGING00001", fields };
    this.client = client();
    this.entitlements = [{ id: "recENT00000001", fields: { member_email: "customer@example.com", entitlement_id: "ent_public", capability: "public_member", member_status: "active", access_status: "active", expire_at: "2027-01-01T00:00:00.000Z", source_ref: "test" } }];
    this.sessions = [];
    this.payments = [];
    this.points = [];
    this.writes = [];
  }

  async findOne(table, formula) {
    if (table.includes("tbl1u0") || table.includes("Staging")) return this.staging;
    const match = formula.match(/\{([^}]+)\}=\"([^\"]+)\"/);
    if (!match) return null;
    const [, field, value] = match;
    const rows = table.includes("tblC98") ? this.sessions : table.includes("tblWGG") ? this.payments : table === "points_ledger" ? this.points : [];
    return rows.find((row) => String(row.fields?.[field] || "") === value) || null;
  }

  async list(table) {
    if (table.includes("tblVv58")) return [this.client];
    if (table.includes("tblNIm")) return this.entitlements;
    if (table === "points_ledger") return this.points;
    return [];
  }

  async requestWithFieldFallback(table, init) {
    const record = { id: `recWRITE${String(this.writes.length + 1).padStart(8, "0")}`, fields: { ...(init.body?.fields || {}) } };
    this.writes.push({ table, record });
    if (table.includes("tblC98")) this.sessions.push(record);
    else if (table.includes("tblWGG")) this.payments.push(record);
    else if (table === "points_ledger") this.points.push(record);
    else throw new Error(`unexpected_write:${table}`);
    return record;
  }
}

async function resolver(records) {
  const active = records.some((row) => row.fields?.capability === "public_member") ? ["public_member"] : [];
  return {
    schema_version: "my_mmd_entitlement_resolver_v1",
    member_blocked: false,
    capability_state: { active, expiring_soon: [], grace: [], inactive: [], recognized: active },
    access: { public_service_access: active.length > 0, private_visibility_envelope: "none" },
  };
}

test("dry-run plans materialization and performs zero canonical history writes", async () => {
  const airtable = new FakeAirtable();
  const result = await materializeHistoricalRecord({ importId: "line_ofc_hist_001", apply: false, airtable, resolver, now: "2026-09-03T16:05:00.000Z" });
  assert.equal(result.ok, true);
  assert.equal(result.dry_run, true);
  assert.equal(result.resolver_write, false);
  assert.equal(airtable.writes.length, 0);
});

test("apply writes Session + Payment + Points only and proves resolver unchanged", async () => {
  const airtable = new FakeAirtable();
  const result = await materializeHistoricalRecord({ importId: "line_ofc_hist_001", apply: true, airtable, resolver, now: "2026-09-03T16:05:00.000Z" });
  assert.equal(result.ok, true);
  assert.equal(result.dry_run, false);
  assert.equal(result.resolver_unchanged, true);
  assert.equal(result.entitlement_write, false);
  assert.equal(airtable.sessions.length, 1);
  assert.equal(airtable.payments.length, 1);
  assert.equal(airtable.points.length, 1);
  assert.equal(airtable.writes.some((item) => item.table.includes("Entitlement")), false);

  const second = await materializeHistoricalRecord({ importId: "line_ofc_hist_001", apply: true, airtable, resolver, now: "2026-09-03T16:05:00.000Z" });
  assert.equal(second.session.duplicate, true);
  assert.equal(second.payment.duplicate, true);
  assert.equal(second.points.duplicate, true);
  assert.equal(airtable.sessions.length, 1);
  assert.equal(airtable.payments.length, 1);
  assert.equal(airtable.points.length, 1);
});

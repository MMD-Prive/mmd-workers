const assert = require("node:assert/strict");
const test = require("node:test");

const { materializeMemberProfile, stableKey } = require("./member-profile-materializer.js");
const { MemberProfileAirtableStore, SCHEMA } = require("./member-profile-airtable-store.js");

function approvedStaging(overrides = {}) {
  const f = SCHEMA.staging.fields;
  return {
    id: "recStaging0000001",
    fields: {
      [f.importId]: "line_ofc_history_001",
      [f.decision]: "approve_materialization",
      [f.memberIdCandidate]: "MMD-001",
      [f.reviewedBy]: "Per",
      [f.reviewedAt]: "2026-08-26T00:00:00.000Z",
      [f.historicalServiceStatus]: "completed",
      [f.reconciledServiceAmount]: 1499,
      [f.proposedPoints]: 14,
      [f.pointsReviewRequired]: "false",
      [f.pointsConfidence]: 0.95,
      [f.noteDetectedDates]: JSON.stringify(["2026-08-20"]),
      ...overrides,
    },
  };
}

function memberRecord(overrides = {}) {
  const f = SCHEMA.members.fields;
  return {
    id: "recMember00000001",
    fields: { [f.memberId]: "MMD-001", [f.email]: "member@example.com", [f.lineUserId]: `U${"a".repeat(32)}`, ...overrides },
  };
}

function formulaValue(formula) {
  const match = String(formula).match(/\}="((?:\\.|[^"])*)"$/);
  return match ? match[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\") : "";
}

function formulaField(formula) {
  return String(formula).match(/^\{([^}]+)\}=/)?.[1] || "";
}

class MemoryTransport {
  constructor({ staging = approvedStaging(), member = memberRecord(), fail = [] } = {}) {
    this.tables = new Map([
      [SCHEMA.staging.table, staging ? [staging] : []],
      [SCHEMA.members.table, member ? [member] : []],
      [SCHEMA.sessions.table, []],
      [SCHEMA.points.table, []],
      [SCHEMA.activity.table, []],
    ]);
    this.calls = [];
    this.fail = [...fail];
    this.sequence = 0;
  }

  async request(table, init = {}) {
    const method = init.method || "GET";
    this.calls.push({ table, method, recordId: init.recordId || "", fields: init.fields || null });
    const failIndex = this.fail.findIndex((item) => item.table === table && item.method === method);
    if (failIndex >= 0) {
      this.fail.splice(failIndex, 1);
      throw new Error("intercepted_transport_failure");
    }
    const records = this.tables.get(table) || [];
    if (method === "GET") {
      const field = formulaField(init.query?.filterByFormula);
      const value = formulaValue(init.query?.filterByFormula);
      return { records: records.filter((record) => String(record.fields?.[field] ?? "") === value).slice(0, 2) };
    }
    if (method === "POST") {
      const record = { id: `recCreated${String(++this.sequence).padStart(7, "0")}`, fields: { ...init.fields } };
      records.push(record);
      this.tables.set(table, records);
      return record;
    }
    if (method === "PATCH") {
      const record = records.find((item) => item.id === init.recordId);
      if (!record) throw new Error("missing_patch_record");
      Object.assign(record.fields, init.fields);
      return record;
    }
    throw new Error("unexpected_method");
  }

  mutationCalls() { return this.calls.filter((call) => call.method === "POST" || call.method === "PATCH"); }
}

function storeFor(transport, commit = true) {
  return new MemberProfileAirtableStore({ transport, commit, now: () => "2026-08-26T12:00:00.000Z" });
}

async function run(transport, { commit = true, trigger = "dashboard_access", memberId = "MMD-001" } = {}) {
  return materializeMemberProfile({ store: storeFor(transport, commit), importId: "line_ofc_history_001", memberId, trigger });
}

test("approved materialization writes Session, Points, Activity, then staging receipt", async () => {
  const transport = new MemoryTransport();
  const result = await run(transport);
  assert.equal(result.ok, true);
  assert.deepEqual(transport.mutationCalls().map((call) => [call.table, call.method]), [
    [SCHEMA.sessions.table, "POST"], [SCHEMA.points.table, "POST"], [SCHEMA.activity.table, "POST"], [SCHEMA.staging.table, "PATCH"],
  ]);
  const points = transport.tables.get(SCHEMA.points.table)[0].fields;
  const session = transport.tables.get(SCHEMA.sessions.table)[0].fields;
  assert.equal(session[SCHEMA.sessions.fields.sessionStatus], "Completed");
  assert.equal(session[SCHEMA.sessions.fields.importReviewStatus], "approved");
  assert.equal(points[SCHEMA.points.fields.points], 14);
  assert.equal(points[SCHEMA.points.fields.source], "line_ofc_history");
  assert.equal(points[SCHEMA.points.fields.idempotencyKey], stableKey("line_ofc_history_001", "points"));
  assert.equal(Object.prototype.hasOwnProperty.call(points, "expires_at"), false);
});

test("rejected, missing, mismatched and fuzzy-only identities make zero operational writes", async () => {
  const f = SCHEMA.staging.fields;
  for (const setup of [
    { staging: approvedStaging({ [f.decision]: "reject_materialization" }) },
    { member: null },
    { member: memberRecord({ [SCHEMA.members.fields.memberId]: "MMD-OTHER" }) },
    { staging: approvedStaging({ [f.memberIdCandidate]: "" }) },
  ]) {
    const transport = new MemoryTransport(setup);
    const result = await run(transport);
    assert.equal(result.ok, false);
    assert.equal(transport.mutationCalls().length, 0);
  }
});

test("unsupported trigger and ambiguous review state fail closed before writes", async () => {
  const f = SCHEMA.staging.fields;
  for (const [transport, trigger] of [
    [new MemoryTransport(), "liff_identity"],
    [new MemoryTransport({ staging: approvedStaging({ [f.historicalServiceStatus]: "review_required" }) }), "dashboard_access"],
  ]) {
    const result = await run(transport, { trigger });
    assert.equal(result.ok, false);
    assert.equal(transport.mutationCalls().length, 0);
  }
});

test("cancelled history is audit-only and never creates Session or Points", async () => {
  const f = SCHEMA.staging.fields;
  const transport = new MemoryTransport({ staging: approvedStaging({ [f.historicalServiceStatus]: "cancelled", [f.reconciledServiceAmount]: 0, [f.proposedPoints]: 0 }) });
  const result = await run(transport, { trigger: "admin_commit" });
  assert.equal(result.ok, true);
  assert.deepEqual(transport.mutationCalls().map((call) => [call.table, call.method]), [[SCHEMA.activity.table, "POST"], [SCHEMA.staging.table, "PATCH"]]);
});

test("duplicate Session, Points and Activity records are reused without duplicate creates", async () => {
  const transport = new MemoryTransport();
  const keys = { session: stableKey("line_ofc_history_001", "session"), points: stableKey("line_ofc_history_001", "points"), audit: stableKey("line_ofc_history_001", "audit") };
  transport.tables.get(SCHEMA.sessions.table).push({ id: "recSessionExisting", fields: { [SCHEMA.sessions.fields.sessionId]: keys.session } });
  transport.tables.get(SCHEMA.points.table).push({ id: "recPointsExisting0", fields: { [SCHEMA.points.fields.idempotencyKey]: keys.points } });
  transport.tables.get(SCHEMA.activity.table).push({ id: "recAuditExisting00", fields: { [SCHEMA.activity.fields.idempotencyKey]: keys.audit } });
  const result = await run(transport);
  assert.deepEqual(result.wrote, []);
  assert.deepEqual(transport.mutationCalls().map((call) => [call.table, call.method]), [[SCHEMA.staging.table, "PATCH"]]);
});

test("duplicate idempotency integrity conflicts fail closed", async () => {
  for (const [table, field, suffix] of [
    [SCHEMA.sessions.table, SCHEMA.sessions.fields.sessionId, "session"],
    [SCHEMA.points.table, SCHEMA.points.fields.idempotencyKey, "points"],
    [SCHEMA.activity.table, SCHEMA.activity.fields.idempotencyKey, "audit"],
  ]) {
    const transport = new MemoryTransport();
    const key = stableKey("line_ofc_history_001", suffix);
    transport.tables.get(table).push({ id: "recDuplicate00001", fields: { [field]: key } }, { id: "recDuplicate00002", fields: { [field]: key } });
    await assert.rejects(() => run(transport), /integrity_conflict/);
    assert.equal(transport.mutationCalls().length, 0);
  }
});

test("partial Session then Points failure resumes without duplicating Session", async () => {
  const transport = new MemoryTransport({ fail: [{ table: SCHEMA.points.table, method: "POST" }] });
  await assert.rejects(() => run(transport), /intercepted_transport_failure/);
  assert.equal(transport.tables.get(SCHEMA.sessions.table).length, 1);
  await run(transport);
  assert.equal(transport.tables.get(SCHEMA.sessions.table).length, 1);
  assert.equal(transport.tables.get(SCHEMA.points.table).length, 1);
  assert.equal(transport.tables.get(SCHEMA.activity.table).length, 1);
});

test("partial Points then Activity failure resumes without duplicating operational writes", async () => {
  const transport = new MemoryTransport({ fail: [{ table: SCHEMA.activity.table, method: "POST" }] });
  await assert.rejects(() => run(transport), /intercepted_transport_failure/);
  assert.equal(transport.tables.get(SCHEMA.sessions.table).length, 1);
  assert.equal(transport.tables.get(SCHEMA.points.table).length, 1);
  await run(transport);
  assert.equal(transport.tables.get(SCHEMA.sessions.table).length, 1);
  assert.equal(transport.tables.get(SCHEMA.points.table).length, 1);
  assert.equal(transport.tables.get(SCHEMA.activity.table).length, 1);
});

test("Activity then receipt failure resumes receipt without duplicate Activity", async () => {
  const transport = new MemoryTransport({ fail: [{ table: SCHEMA.staging.table, method: "PATCH" }] });
  await assert.rejects(() => run(transport), /intercepted_transport_failure/);
  assert.equal(transport.tables.get(SCHEMA.activity.table).length, 1);
  await run(transport);
  assert.equal(transport.tables.get(SCHEMA.sessions.table).length, 1);
  assert.equal(transport.tables.get(SCHEMA.points.table).length, 1);
  assert.equal(transport.tables.get(SCHEMA.activity.table).length, 1);
  assert.equal(transport.mutationCalls().filter((call) => call.table === SCHEMA.staging.table && call.method === "PATCH").length, 2);
});

test("raw evidence and forbidden Member, payment and entitlement tables never enter write payloads", async () => {
  const f = SCHEMA.staging.fields;
  const staging = approvedStaging({ raw_note: "private raw note", payment_ref: "secret-ref", entitlement: "grant" });
  const transport = new MemoryTransport({ staging });
  await run(transport);
  const serialized = JSON.stringify(transport.mutationCalls());
  assert.doesNotMatch(serialized, /private raw note|secret-ref|entitlement|payment_ref|raw_note/i);
  assert.equal(transport.mutationCalls().some((call) => [SCHEMA.members.table, SCHEMA.clients.table].includes(call.table)), false);
  assert.equal(staging.fields[f.decision], "approve_materialization");
});

test("dry-run is default and performs zero network mutations while returning bounded plans", async () => {
  const transport = new MemoryTransport();
  const store = storeFor(transport, false);
  const result = await materializeMemberProfile({ store, importId: "line_ofc_history_001", memberId: "MMD-001", trigger: "dashboard_access" });
  assert.equal(result.ok, true);
  assert.equal(result.dry_run, true);
  assert.equal(transport.mutationCalls().length, 0);
  assert.deepEqual(store.writeAttempts.map((item) => item.operation), ["session", "points", "audit", "receipt"]);
});

test("authorized store rejects payload substitution and premature staging receipt", async () => {
  const transport = new MemoryTransport();
  const store = storeFor(transport, true);
  const stagingRecord = await store.getStagingByImportId("line_ofc_history_001");
  const member = await store.getMemberById("MMD-001");
  const { buildMaterializationPlan } = require("./member-profile-materializer.js");
  const plan = buildMaterializationPlan({ stagingRecord, member, trigger: "dashboard_access" });
  store.authorizeMaterialization({ plan, stagingRecord, member, memberId: "MMD-001", trigger: "dashboard_access" });
  await assert.rejects(() => store.createPoints({ ...plan.writes.points, points: 999 }), /write_authority:points_payload/);
  await assert.rejects(() => store.markStagingMaterialized(stagingRecord.id, { committed_by: "trigger:dashboard_access" }), /write_authority:incomplete_operations/);
  assert.equal(transport.mutationCalls().length, 0);
});

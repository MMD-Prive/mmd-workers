const { MATERIALIZATION_TRIGGERS } = require("./member-profile-materializer.js");

const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_BASE_ID = "appsV1ILPRfIjkaYg";
const DEFAULT_TIMEOUT_MS = 10000;

const SCHEMA = Object.freeze({
  staging: Object.freeze({
    table: "tbl1u0foFBvgFpT9G",
    fields: Object.freeze({
      importId: "fld4WvEkUiPipY3Qd",
      decision: "fldz2GqssfUdaRRGC",
      memberIdCandidate: "fldSnu9uFkEsSjhZX",
      reviewedBy: "fldSQlGTsjr5UwGCq",
      reviewedAt: "fldLsziZPVcdvdHVg",
      historicalServiceStatus: "fldKDi5zvQ3Pfn4hs",
      reconciledServiceAmount: "fldFNsI0uN2WD64Hq",
      proposedPoints: "fldeyaCioKKX6KLSj",
      pointsReviewRequired: "fldJ2fwB1znlO9Zaj",
      pointsConfidence: "fldBtMaa6f5N60HaL",
      noteDetectedDates: "flduhM8UHsWd48DHN",
      committedAt: "fldt5Jk3cZxHJy47a",
      committedBy: "fldzqw58Roey8fCJ5",
    }),
  }),
  members: Object.freeze({
    table: "tblgWc5VRon5o8Mhk",
    fields: Object.freeze({
      memberId: "fld3hISS6bp1fjOQT",
      email: "fldgxTkuNR86HCuVB",
      lineUserId: "fld5SAU291FAMWdus",
    }),
  }),
  clients: Object.freeze({
    table: "tblVv58TCbwh5j1fS",
    fields: Object.freeze({
      lineUserId: "fld5HfSGChKFbd4uh",
      email: "fldbAlmCs8VpI9Clw",
      stagingLinks: "fldjJnbMdl2UnsreT",
    }),
  }),
  sessions: Object.freeze({
    table: "tblC98mKWbzmPuNzX",
    fields: Object.freeze({
      sessionId: "fldLTq2kZbyRv22IA",
      email: "fldHrtgfjHDZ9NRmN",
      lineUserId: "fld5tzCzdTTh8AJyI",
      jobType: "fldjK3U9bghnj7xUe",
      jobDate: "fldpnqoIsUMfN7y3c",
      sessionStatus: "fldmwuvOaiCFdzzRa",
      amountThb: "fldhwC79ndbnEXSZz",
      importReviewStatus: "fld3PiG8vqs3kk3qQ",
      importedSourceRef: "fldTd0TeikeQS4XX4",
      importedConfidenceScore: "fldFCBEHG8Hyd8QfL",
    }),
  }),
  points: Object.freeze({
    table: "tbl5dfnwjUFMLbnWL",
    fields: Object.freeze({
      memberEmail: "fldhJOrzDUwHr18gE",
      amountThb: "fldlRA1YfsMTjzWCP",
      points: "fldpgsITgYMNjAeEV",
      ratePolicy: "fldJt2dC5kfqsijPh",
      source: "fldvMTFjpTUojO7QE",
      idempotencyKey: "flds5SvWQGmJ7HoQ6",
      postedAt: "fldaGmp5d5LIUqJUc",
      transactionStatus: "fldnTeyFxPOknCyjg",
    }),
  }),
  activity: Object.freeze({
    table: "tblbUWRoFL6OI6QMJ",
    fields: Object.freeze({
      eventType: "fldoAu14JWm4gUbe6",
      afterJson: "fldcGk6eAA41bsxZX",
      reasonCode: "fldeIkKKMmLN8QAnj",
      idempotencyKey: "fldySzuIWzzCp56m2",
    }),
  }),
});

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function selectName(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? clean(value.name || value.value)
    : clean(value);
}

function formulaString(value) {
  return `"${clean(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function assertExactOne(records, label) {
  if (records.length > 1) throw new Error(`integrity_conflict:${label}`);
  return records[0] || null;
}

function publicError(error) {
  const message = clean(error?.message);
  if (/^(airtable_|integrity_conflict:|write_authority:)/.test(message)) return error;
  return new Error("airtable_transport_failed");
}

class AirtableTransport {
  constructor({ apiKey, baseId = DEFAULT_BASE_ID, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = globalThis.fetch } = {}) {
    this.apiKey = clean(apiKey);
    this.baseId = clean(baseId);
    this.timeoutMs = Number(timeoutMs);
    this.fetchImpl = fetchImpl;
  }

  async request(table, { method = "GET", query = {}, recordId = "", fields } = {}) {
    if (!this.apiKey || !this.baseId || typeof this.fetchImpl !== "function") throw new Error("airtable_not_configured");
    const suffix = recordId ? `/${encodeURIComponent(recordId)}` : "";
    const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(this.baseId)}/${encodeURIComponent(table)}${suffix}`);
    for (const [key, value] of Object.entries(query)) {
      if (Array.isArray(value)) value.forEach((item) => url.searchParams.append(key, item));
      else url.searchParams.set(key, value);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method,
        headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
        body: fields ? JSON.stringify({ fields, typecast: false }) : undefined,
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`airtable_request_failed:${response.status}`);
      return payload;
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("airtable_request_timeout");
      throw publicError(error);
    } finally {
      clearTimeout(timer);
    }
  }
}

class MemberProfileAirtableStore {
  constructor({ transport, commit = false, now = () => new Date().toISOString() } = {}) {
    if (!transport || typeof transport.request !== "function") throw new Error("airtable_transport_required");
    this.transport = transport;
    this.dryRun = commit !== true;
    this.now = now;
    this.authorization = null;
    this.writeAttempts = [];
    this.completed = new Set();
  }

  async listByFormula(table, formula, fields) {
    const payload = await this.transport.request(table, {
      query: { filterByFormula: formula, maxRecords: "2", pageSize: "2", "fields[]": fields },
    });
    return Array.isArray(payload.records) ? payload.records : [];
  }

  async getStagingByImportId(importId) {
    const f = SCHEMA.staging.fields;
    const fields = Object.values(f);
    const record = assertExactOne(await this.listByFormula(SCHEMA.staging.table, `{${f.importId}}=${formulaString(importId)}`, fields), "staging_import_id");
    if (!record) return null;
    const raw = record.fields || {};
    return {
      id: record.id,
      fields: {
        import_id: raw[f.importId], decision: raw[f.decision], member_id_candidate: raw[f.memberIdCandidate],
        reviewed_by: raw[f.reviewedBy], reviewed_at: raw[f.reviewedAt], historical_service_status: raw[f.historicalServiceStatus],
        reconciled_service_amount: raw[f.reconciledServiceAmount], proposed_points: raw[f.proposedPoints],
        points_review_required: raw[f.pointsReviewRequired], points_confidence: raw[f.pointsConfidence], note_detected_dates: raw[f.noteDetectedDates],
      },
    };
  }

  async getMemberById(memberId) {
    const f = SCHEMA.members.fields;
    const record = assertExactOne(await this.listByFormula(SCHEMA.members.table, `{${f.memberId}}=${formulaString(memberId)}`, Object.values(f)), "member_id");
    if (!record) return null;
    return { record_id: record.id, member_id: record.fields?.[f.memberId], email: record.fields?.[f.email], line_user_id: record.fields?.[f.lineUserId] };
  }

  authorizeMaterialization({ plan, stagingRecord, member, memberId, trigger }) {
    const fields = stagingRecord?.fields || {};
    if (!plan?.ok || !plan?.writes) throw new Error("write_authority:invalid_plan");
    if (selectName(fields.decision) !== "approve_materialization") throw new Error("write_authority:decision");
    if (!MATERIALIZATION_TRIGGERS.has(trigger)) throw new Error("write_authority:trigger");
    if (!clean(memberId) || clean(fields.member_id_candidate) !== clean(memberId) || clean(member.member_id) !== clean(memberId)) throw new Error("write_authority:member_link");
    for (const key of [plan.idempotency?.session, plan.idempotency?.points, plan.idempotency?.audit]) {
      if (!/^line_ofc_history:[a-f0-9]{64}$/.test(clean(key))) throw new Error("write_authority:idempotency");
    }
    const cancelled = selectName(fields.historical_service_status) === "cancelled";
    if (cancelled && (plan.writes.session || plan.writes.points)) throw new Error("write_authority:cancellation");
    if (!cancelled && (!plan.writes.session || !plan.writes.points)) throw new Error("write_authority:operational_writes");
    this.authorization = { plan, stagingId: stagingRecord.id, trigger };
  }

  requireAuthorized(operation, payload) {
    if (!this.authorization) throw new Error("write_authority:missing");
    const plan = this.authorization.plan;
    if (operation === "session" && (payload.session_id !== plan.idempotency.session || JSON.stringify(payload) !== JSON.stringify(plan.writes.session))) {
      throw new Error("write_authority:session_payload");
    }
    if (operation === "points" && (payload.idempotency_key !== plan.idempotency.points || JSON.stringify(payload) !== JSON.stringify(plan.writes.points))) {
      throw new Error("write_authority:points_payload");
    }
    if (operation === "audit") {
      const expected = { ...plan.writes.audit, idempotency_key: plan.writes.audit.idempotency_key || plan.idempotency.audit };
      if (clean(payload.idempotency_key) !== plan.idempotency.audit || JSON.stringify(payload) !== JSON.stringify(expected)) throw new Error("write_authority:audit_payload");
    }
  }

  async uniqueExists(table, fieldId, key, label) {
    const records = await this.listByFormula(table, `{${fieldId}}=${formulaString(key)}`, [fieldId]);
    return Boolean(assertExactOne(records, label));
  }

  async hasSession(key) { const exists = await this.uniqueExists(SCHEMA.sessions.table, SCHEMA.sessions.fields.sessionId, key, "session_idempotency"); if (exists) this.completed.add("session"); return exists; }
  async hasPoints(key) { const exists = await this.uniqueExists(SCHEMA.points.table, SCHEMA.points.fields.idempotencyKey, key, "points_idempotency"); if (exists) this.completed.add("points"); return exists; }
  async hasAudit(key) { const exists = await this.uniqueExists(SCHEMA.activity.table, SCHEMA.activity.fields.idempotencyKey, key, "audit_idempotency"); if (exists) this.completed.add("audit"); return exists; }

  async write(table, fields, operation) {
    this.writeAttempts.push({ table, operation, fields });
    if (this.dryRun) return { dry_run: true };
    return this.transport.request(table, { method: "POST", fields });
  }

  async createSession(input) {
    this.requireAuthorized("session", input);
    const f = SCHEMA.sessions.fields;
    const result = await this.write(SCHEMA.sessions.table, {
      [f.sessionId]: input.session_id, [f.email]: input.email, [f.lineUserId]: input.line_user_id || undefined,
      [f.jobType]: input.job_type, [f.jobDate]: input.job_date, [f.sessionStatus]: input.status === "completed" ? "Completed" : input.status, [f.amountThb]: input.amount_thb,
      [f.importReviewStatus]: input.import_review_status, [f.importedSourceRef]: input.imported_source_ref,
      [f.importedConfidenceScore]: input.imported_confidence_score,
    }, "session");
    this.completed.add("session");
    return result;
  }

  async createPoints(input) {
    this.requireAuthorized("points", input);
    const f = SCHEMA.points.fields;
    if (input.source !== "line_ofc_history" || input.rate_policy !== "100THB=1PT_FLOOR" || input.expires_at !== undefined) throw new Error("write_authority:points_contract");
    const result = await this.write(SCHEMA.points.table, {
      [f.memberEmail]: input.member_email, [f.amountThb]: input.amount_thb, [f.points]: input.points,
      [f.ratePolicy]: input.rate_policy, [f.source]: input.source, [f.idempotencyKey]: input.idempotency_key,
      [f.postedAt]: input.posted_at, [f.transactionStatus]: input.transaction_status,
    }, "points");
    this.completed.add("points");
    return result;
  }

  async createAudit(input) {
    const plan = this.authorization?.plan;
    const bounded = { ...input, idempotency_key: input.idempotency_key || plan?.idempotency?.audit };
    this.requireAuthorized("audit", bounded);
    const f = SCHEMA.activity.fields;
    const result = await this.write(SCHEMA.activity.table, {
      [f.eventType]: bounded.event_type, [f.reasonCode]: bounded.reason_code, [f.idempotencyKey]: bounded.idempotency_key,
      [f.afterJson]: JSON.stringify({ trigger: this.authorization.trigger, result: bounded.reason_code, source: "line_ofc_history" }),
    }, "audit");
    this.completed.add("audit");
    return result;
  }

  async markStagingMaterialized(recordId, receipt) {
    if (!this.authorization || recordId !== this.authorization.stagingId) throw new Error("write_authority:staging_receipt");
    const required = this.authorization.plan.writes.session ? ["session", "points", "audit"] : ["audit"];
    if (required.some((operation) => !this.completed.has(operation))) throw new Error("write_authority:incomplete_operations");
    const f = SCHEMA.staging.fields;
    const fields = { [f.committedAt]: receipt.committed_at || this.now(), [f.committedBy]: receipt.committed_by };
    this.writeAttempts.push({ table: SCHEMA.staging.table, operation: "receipt", fields });
    if (this.dryRun) return { dry_run: true };
    return this.transport.request(SCHEMA.staging.table, { method: "PATCH", recordId, fields });
  }
}

module.exports = { AirtableTransport, MemberProfileAirtableStore, SCHEMA, assertExactOne };

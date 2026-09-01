export const KNOWLEDGE_STAGE = Object.freeze({
  DRAFT: "draft",
  REVIEW: "review",
  QA_PASSED: "qa_passed",
  PUBLISHED: "published",
  ARCHIVED: "archived",
});

export const KNOWLEDGE_ACTION = Object.freeze({
  SUBMIT_REVIEW: "submit_review",
  RECORD_QA: "record_qa",
  PUBLISH: "publish",
});

const LANGUAGES = new Set(["th", "en", "zh"]);
const PUBLISH_ROLES = new Set(["owner", "publisher"]);
const REQUIRED_FIELDS = Object.freeze([
  "knowledge_id",
  "title",
  "category",
  "language",
  "approved_answer",
  "allowed_audience",
  "source",
  "owner",
]);

const UNSAFE_CUSTOMER_TERMS = Object.freeze([
  /\b(?:admin|staff|operator|handler)\b/i,
  /\b(?:paid|verified|approved|payment successful)\b/i,
  /(?:ชำระเงินสำเร็จแล้ว|อนุมัติแล้ว|ยืนยันยอดแล้ว|จ่ายแล้ว)/,
]);

export class KnowledgeContractError extends Error {
  constructor(code, status = 400, details = {}) {
    super(code);
    this.name = "KnowledgeContractError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function executeKnowledgeCommand(recordInput, commandInput, trustedContext = {}) {
  const record = normalizeRecord(recordInput);
  const command = normalizeCommand(commandInput);
  const actor = normalizeActor(trustedContext.actor);
  const now = normalizeNow(trustedContext.now);
  assertExpectedVersion(record, trustedContext.expectedVersion);

  if (record.stage === KNOWLEDGE_STAGE.PUBLISHED || record.stage === KNOWLEDGE_STAGE.ARCHIVED) {
    throw new KnowledgeContractError("immutable_terminal_stage", 409, { stage: record.stage });
  }

  if (command.action === KNOWLEDGE_ACTION.SUBMIT_REVIEW) {
    assertStage(record, KNOWLEDGE_STAGE.DRAFT);
    const validation = validateForReview(record);
    if (!validation.pass) {
      throw new KnowledgeContractError("review_validation_failed", 422, validation);
    }
    return transition(record, KNOWLEDGE_STAGE.REVIEW, actor, now, {
      action: KNOWLEDGE_ACTION.SUBMIT_REVIEW,
      validation,
    });
  }

  if (command.action === KNOWLEDGE_ACTION.RECORD_QA) {
    assertStage(record, KNOWLEDGE_STAGE.REVIEW);
    const qa = runKnowledgeQa(record, command.qa);
    if (!qa.pass) {
      return auditWithoutTransition(record, actor, now, {
        action: "qa_failed",
        qa,
      });
    }
    return transition(record, KNOWLEDGE_STAGE.QA_PASSED, actor, now, {
      action: KNOWLEDGE_ACTION.RECORD_QA,
      qa,
      qa_snapshot: snapshotQa(qa, record.version),
    });
  }

  if (command.action === KNOWLEDGE_ACTION.PUBLISH) {
    assertStage(record, KNOWLEDGE_STAGE.QA_PASSED);
    if (!PUBLISH_ROLES.has(actor.role)) {
      throw new KnowledgeContractError("publisher_role_required", 403);
    }
    if (!record.qa_snapshot?.pass || record.qa_snapshot.version !== record.version) {
      throw new KnowledgeContractError("fresh_qa_pass_required", 409);
    }
    const published = transition(record, KNOWLEDGE_STAGE.PUBLISHED, actor, now, {
      action: KNOWLEDGE_ACTION.PUBLISH,
      published_version: record.version + 1,
    });
    published.record.version = record.version + 1;
    published.record.published_at = now;
    published.record.published_by = actor.id;
    return published;
  }

  throw new KnowledgeContractError("unsupported_action", 400);
}

export function validateForReview(recordInput) {
  const record = normalizeRecord(recordInput);
  const missing = REQUIRED_FIELDS.filter((field) => {
    const value = record[field];
    return Array.isArray(value) ? value.length === 0 : !clean(value);
  });
  const errors = [];
  if (missing.length) errors.push({ code: "required_fields_missing", fields: missing });
  if (record.language && !LANGUAGES.has(record.language)) {
    errors.push({ code: "unsupported_language", value: record.language });
  }
  return { pass: errors.length === 0, errors };
}

export function runKnowledgeQa(recordInput, evidenceInput = {}) {
  const record = normalizeRecord(recordInput);
  const evidence = object(evidenceInput);
  const errors = [];
  const warnings = [];

  const review = validateForReview(record);
  errors.push(...review.errors);

  const answer = clean(record.approved_answer);
  for (const pattern of UNSAFE_CUSTOMER_TERMS) {
    if (pattern.test(answer)) {
      errors.push({ code: "unsafe_customer_copy", term: String(pattern) });
    }
  }

  if (record.risk_level === "critical" && evidence.privacy_checked !== true) {
    errors.push({ code: "privacy_check_required" });
  }
  if (evidence.policy_path_match !== true) {
    errors.push({ code: "production_policy_path_not_verified" });
  }
  if (!clean(evidence.sample_question)) {
    errors.push({ code: "sample_question_required" });
  }
  if (!Array.isArray(evidence.blocked_information)) {
    warnings.push({ code: "blocked_information_not_recorded" });
  }

  return {
    pass: errors.length === 0,
    errors,
    warnings,
    checked_at: clean(evidence.checked_at) || null,
    channel: clean(evidence.channel) || null,
    audience: clean(evidence.audience) || null,
  };
}

export function toCustomerSafeKnowledge(recordInput) {
  const record = normalizeRecord(recordInput);
  if (record.stage !== KNOWLEDGE_STAGE.PUBLISHED) {
    throw new KnowledgeContractError("published_record_required", 409);
  }
  return Object.freeze({
    knowledge_id: record.knowledge_id,
    title: record.title,
    category: record.category,
    language: record.language,
    answer: record.approved_answer,
    allowed_audience: [...record.allowed_audience],
    version: record.version,
    effective_date: record.effective_date || null,
    expiry_date: record.expiry_date || null,
  });
}

function transition(record, nextStage, actor, now, detail) {
  const event = auditEvent(record, nextStage, actor, now, detail);
  return {
    ok: true,
    transitioned: true,
    record: {
      ...record,
      stage: nextStage,
      status: nextStage,
      updated_at: now,
      updated_by: actor.id,
      qa_snapshot: detail.qa_snapshot || record.qa_snapshot || null,
      audit_log: [...record.audit_log, event],
    },
    event,
  };
}

function auditWithoutTransition(record, actor, now, detail) {
  const event = auditEvent(record, record.stage, actor, now, detail);
  return {
    ok: false,
    transitioned: false,
    record: {
      ...record,
      updated_at: now,
      updated_by: actor.id,
      audit_log: [...record.audit_log, event],
    },
    event,
    qa: detail.qa,
  };
}

function auditEvent(record, toStage, actor, now, detail) {
  return Object.freeze({
    event_id: `${record.knowledge_id}:${record.version}:${detail.action}:${now}`,
    knowledge_id: record.knowledge_id,
    action: detail.action,
    from_stage: record.stage,
    to_stage: toStage,
    actor_id: actor.id,
    actor_role: actor.role,
    at: now,
    version: record.version,
    validation: detail.validation || undefined,
    qa: detail.qa || undefined,
    published_version: detail.published_version || undefined,
  });
}

function snapshotQa(qa, version) {
  return Object.freeze({
    pass: true,
    version,
    checked_at: qa.checked_at,
    channel: qa.channel,
    audience: qa.audience,
    warnings: qa.warnings,
  });
}

function normalizeRecord(input) {
  const source = object(input);
  const stage = normalizeStage(source.stage || source.status);
  const audience = Array.isArray(source.allowed_audience)
    ? source.allowed_audience.map(clean).filter(Boolean)
    : clean(source.allowed_audience).split(",").map(clean).filter(Boolean);
  return {
    ...source,
    knowledge_id: clean(source.knowledge_id || source.id),
    title: clean(source.title),
    category: clean(source.category),
    language: clean(source.language).toLowerCase(),
    approved_answer: clean(source.approved_answer || source.customer_answer),
    allowed_audience: audience,
    source: clean(source.source || source.source_ref || source.source_path),
    owner: clean(source.owner),
    risk_level: clean(source.risk_level).toLowerCase(),
    stage,
    status: stage,
    version: positiveInteger(source.version, 1),
    qa_snapshot: objectOrNull(source.qa_snapshot),
    audit_log: Array.isArray(source.audit_log) ? source.audit_log.slice() : [],
  };
}

function normalizeCommand(input) {
  const source = object(input);
  return {
    action: clean(source.action).toLowerCase(),
    qa: object(source.qa),
  };
}

function normalizeActor(input) {
  const actor = object(input);
  const id = clean(actor.id);
  const role = clean(actor.role).toLowerCase();
  if (!id || !role) throw new KnowledgeContractError("trusted_actor_required", 401);
  return { id, role };
}

function assertExpectedVersion(record, expectedVersion) {
  if (!Number.isInteger(expectedVersion)) {
    throw new KnowledgeContractError("expected_version_required", 428);
  }
  if (expectedVersion !== record.version) {
    throw new KnowledgeContractError("version_conflict", 409, {
      expected: expectedVersion,
      actual: record.version,
    });
  }
}

function assertStage(record, expected) {
  if (record.stage !== expected) {
    throw new KnowledgeContractError("invalid_stage_transition", 409, {
      expected,
      actual: record.stage,
    });
  }
}

function normalizeStage(value) {
  const stage = clean(value || KNOWLEDGE_STAGE.DRAFT).toLowerCase();
  if (stage === "active") return KNOWLEDGE_STAGE.PUBLISHED;
  if (Object.values(KNOWLEDGE_STAGE).includes(stage)) return stage;
  throw new KnowledgeContractError("invalid_stage", 400, { stage });
}

function normalizeNow(value) {
  const now = clean(value);
  if (!now || Number.isNaN(Date.parse(now))) {
    throw new KnowledgeContractError("trusted_timestamp_required", 500);
  }
  return new Date(now).toISOString();
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function objectOrNull(value) {
  const output = object(value);
  return Object.keys(output).length ? output : null;
}

function clean(value) {
  return String(value ?? "").trim();
}

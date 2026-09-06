const AIRTABLE_API = "https://api.airtable.com/v0";
const REVIEW_TYPE = "kenji_model_keyword_profile";
const MAX_SCAN = 500;

export const KENJI_MODEL_REVIEW_QUEUE_PATH = "/v1/admin/kenji/models/review-queue";
const REVIEW_ACTION_PATH = /^\/v1\/admin\/kenji\/models\/reviews\/([A-Za-z0-9][A-Za-z0-9_-]{7,159})\/(review|qa|publish|audit)$/;
const PUBLISH_ROLES = new Set(["owner", "publisher", "admin"]);
const REVIEW_ROLES = new Set(["owner", "publisher", "admin", "reviewer"]);

const PROFILE_FIELDS = Object.freeze({
  model: "Model",
  modelKey: "model_key",
  folderName: "folder_name",
  workingName: "working_name",
  aliases: "search_aliases",
  safeInfo: "customer_safe_info",
  positiveSensitive: "positive_sensitive_description",
  safeRemark: "customer_safe_remark",
  tier: "model_tier",
  customerScope: "allowed_customer_scope",
  photoPolicy: "photo_visibility_policy",
  depositGate: "deposit_preview_gate",
  status: "status",
  publicKenji: "include_in_public_kenji",
  sourceRef: "source_ref",
  version: "version",
  reviewedAt: "reviewed_at",
});

export function isKenjiModelWorkflowRequest(path, method = "GET") {
  const normalized = normalizePath(path);
  const verb = clean(method, 12).toUpperCase();
  if (normalized === KENJI_MODEL_REVIEW_QUEUE_PATH) {
    return verb === "GET" || verb === "HEAD" || verb === "OPTIONS";
  }
  const match = normalized.match(REVIEW_ACTION_PATH);
  if (!match) return false;
  if (verb === "OPTIONS" || verb === "HEAD") return true;
  return match[2] === "audit" ? verb === "GET" : verb === "POST";
}

export async function handleKenjiModelWorkflowRequest(request, env = {}, options = {}) {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  const method = request.method.toUpperCase();
  if (!isKenjiModelWorkflowRequest(path, method)) return json({ ok: false, error: "not_found" }, 404);
  if (method === "OPTIONS") return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  if (method === "HEAD") return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });

  const actor = trustedActor(request, options);
  if (!actor) return json({ ok: false, error: "trusted_actor_required" }, 401);
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
    return json({ ok: false, error: "missing_airtable_env" }, 503);
  }
  const fetchImpl = options.fetchImpl || fetch;

  if (path === KENJI_MODEL_REVIEW_QUEUE_PATH) {
    return listReviewQueue(request, env, actor, fetchImpl);
  }

  const match = path.match(REVIEW_ACTION_PATH);
  const requestId = match[1];
  const action = match[2];
  const loaded = await loadReviewByRequestId(env, requestId, fetchImpl);
  if (!loaded.ok) return json({ ok: false, error: "review_source_unavailable" }, serviceStatus(loaded.status));
  if (!loaded.record) return json({ ok: false, error: "model_review_not_found", request_id: requestId }, 404);
  if (clean(loaded.record.fields?.[reviewFields(env).requestType], 120) !== REVIEW_TYPE) {
    return json({ ok: false, error: "review_type_mismatch" }, 409);
  }

  const review = projectReview(loaded.record, env);
  if (action === "audit") {
    return json({
      ok: true,
      request_id: review.request_id,
      stage: review.stage,
      workflow_version: review.workflow_version,
      request_status: review.request_status,
      events: review.audit_log,
      count: review.audit_log.length,
      published_profile_id: review.published_profile_id || null,
      published_profile_version: review.published_profile_version || null,
    });
  }

  const idempotencyKey = clean(request.headers.get("Idempotency-Key"), 180);
  if (idempotencyKey.length < 8) return json({ ok: false, error: "idempotency_key_required" }, 428);
  const parsed = await parseJson(request);
  if (!parsed.ok) return json({ ok: false, error: "invalid_json" }, 400);
  const expectedVersion = Number(parsed.data.expected_version);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    return json({ ok: false, error: "expected_version_required" }, 428);
  }
  if (review.last_command_id === idempotencyKey) {
    return json({
      ok: true,
      idempotent_replay: true,
      request_id: review.request_id,
      stage: review.stage,
      request_status: review.request_status,
      workflow_version: review.workflow_version,
      published_profile_id: review.published_profile_id || null,
      published_profile_version: review.published_profile_version || null,
    });
  }
  if (expectedVersion !== review.workflow_version) {
    return json({
      ok: false,
      error: "version_conflict",
      expected: expectedVersion,
      actual: review.workflow_version,
    }, 409);
  }

  if (action === "review") {
    return recordReviewApproval(loaded.record, review, env, actor, idempotencyKey, fetchImpl);
  }
  if (action === "qa") {
    return recordQa(loaded.record, review, parsed.data.qa, env, actor, idempotencyKey, fetchImpl);
  }
  return publishReview(loaded.record, review, env, actor, idempotencyKey, fetchImpl);
}

async function listReviewQueue(request, env, actor, fetchImpl) {
  if (!REVIEW_ROLES.has(actor.role)) return json({ ok: false, error: "reviewer_role_required" }, 403);
  const records = await fetchAllRecords(env, config(env).reviewTable, fetchImpl);
  if (!records.ok) return json({ ok: false, error: "review_source_unavailable" }, serviceStatus(records.status));
  const url = new URL(request.url);
  const statusMode = clean(url.searchParams.get("status"), 40).toLowerCase() || "open";
  const q = clean(url.searchParams.get("q"), 120).toLowerCase();
  const requestedLimit = Number(url.searchParams.get("limit") || 80);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(160, Math.floor(requestedLimit))) : 80;

  const items = records.records
    .filter((record) => clean(record.fields?.[reviewFields(env).requestType], 120) === REVIEW_TYPE)
    .map((record) => projectReview(record, env))
    .filter((item) => statusMode === "all" || !["published", "rejected", "archived"].includes(item.stage))
    .filter((item) => !q || [item.request_id, item.model_key, item.working_name, item.request_status].join(" ").toLowerCase().includes(q))
    .sort((a, b) => String(b.requested_at || "").localeCompare(String(a.requested_at || "")))
    .slice(0, limit);

  return json({
    ok: true,
    source: "airtable_model_review_requests",
    canonical_surface: "/internal/admin/kenji#models",
    workflow: "Review → QA → Publish → Audit Log",
    count: items.length,
    items: items.map(publicReviewItem),
  });
}

async function recordReviewApproval(record, review, env, actor, commandId, fetchImpl) {
  if (!REVIEW_ROLES.has(actor.role)) return json({ ok: false, error: "reviewer_role_required" }, 403);
  if (review.stage !== "review") return json({ ok: false, error: "invalid_stage_transition", expected: "review", actual: review.stage }, 409);
  if (review.reviewed_at) return json({ ok: false, error: "review_already_completed" }, 409);

  const validation = validateDraftForReview(review.draft);
  if (!validation.pass) return json({ ok: false, error: "review_validation_failed", details: validation }, 422);

  const now = new Date().toISOString();
  const nextVersion = review.workflow_version + 1;
  const event = auditEvent(review, actor, now, "review_approved", "review", {
    validation,
  });
  const workflow = {
    ...review.workflow,
    stage: "review",
    version: nextVersion,
    reviewed_at: now,
    reviewed_by: actor.id,
    updated_at: now,
    updated_by: actor.id,
    last_command_id: commandId,
    audit_log: [...review.audit_log, event],
  };
  const saved = await saveWorkflow(record, review.draft, workflow, env, {
    requestStatus: "reviewed",
    decisionNote: `Review approved by ${actor.id}; QA required before Production publish.`,
  }, fetchImpl);
  if (!saved.ok) return json({ ok: false, error: "review_write_failed" }, serviceStatus(saved.status));
  return json({
    ok: true,
    request_id: review.request_id,
    stage: "review",
    request_status: "reviewed",
    workflow_version: nextVersion,
    event,
    production_mutated: false,
  });
}

async function recordQa(record, review, qaInput, env, actor, commandId, fetchImpl) {
  if (!REVIEW_ROLES.has(actor.role)) return json({ ok: false, error: "reviewer_role_required" }, 403);
  if (review.stage !== "review") return json({ ok: false, error: "invalid_stage_transition", expected: "review", actual: review.stage }, 409);
  if (!review.reviewed_at) return json({ ok: false, error: "review_approval_required" }, 409);

  const qa = runModelQa(review.draft, qaInput);
  const now = new Date().toISOString();
  const nextVersion = review.workflow_version + 1;
  const draftHash = await hashDraft(review.draft);
  const passed = qa.pass === true;
  const event = auditEvent(review, actor, now, passed ? "qa_passed" : "qa_failed", passed ? "qa_passed" : "review", { qa });
  const workflow = {
    ...review.workflow,
    stage: passed ? "qa_passed" : "review",
    version: nextVersion,
    qa_snapshot: passed ? {
      pass: true,
      workflow_version: nextVersion,
      draft_hash: draftHash,
      checked_at: now,
      checked_by: actor.id,
      warnings: qa.warnings,
    } : null,
    updated_at: now,
    updated_by: actor.id,
    last_command_id: commandId,
    audit_log: [...review.audit_log, event],
  };
  const saved = await saveWorkflow(record, review.draft, workflow, env, {
    requestStatus: passed ? "qa_passed" : "qa_failed",
    decisionNote: passed
      ? `QA passed by ${actor.id}; publish remains a separate explicit action.`
      : `QA failed by ${actor.id}; Production unchanged.`,
  }, fetchImpl);
  if (!saved.ok) return json({ ok: false, error: "qa_write_failed" }, serviceStatus(saved.status));
  return json({
    ok: passed,
    request_id: review.request_id,
    stage: workflow.stage,
    request_status: passed ? "qa_passed" : "qa_failed",
    workflow_version: nextVersion,
    qa,
    event,
    production_mutated: false,
  }, passed ? 200 : 422);
}

async function publishReview(record, review, env, actor, commandId, fetchImpl) {
  if (!PUBLISH_ROLES.has(actor.role)) return json({ ok: false, error: "publisher_role_required" }, 403);
  if (review.stage !== "qa_passed") {
    return json({ ok: false, error: "invalid_stage_transition", expected: "qa_passed", actual: review.stage }, 409);
  }
  const qa = object(review.workflow.qa_snapshot);
  if (qa.pass !== true || !qa.draft_hash) return json({ ok: false, error: "fresh_qa_pass_required" }, 409);
  const currentHash = await hashDraft(review.draft);
  if (currentHash !== qa.draft_hash) return json({ ok: false, error: "draft_changed_after_qa" }, 409);

  const published = await publishKeywordProfile(review.draft, env, actor, fetchImpl);
  if (!published.ok) return json({ ok: false, error: published.error, details: published.details || undefined }, published.status || 409);

  const now = new Date().toISOString();
  const nextVersion = review.workflow_version + 1;
  const event = auditEvent(review, actor, now, "publish", "published", {
    published_profile_id: published.profile_id,
    published_profile_version: published.profile_version,
    recovered: Boolean(published.recovered),
  });
  const workflow = {
    ...review.workflow,
    stage: "published",
    version: nextVersion,
    published_at: now,
    published_by: actor.id,
    published_profile_id: published.profile_id,
    published_profile_version: published.profile_version,
    updated_at: now,
    updated_by: actor.id,
    last_command_id: commandId,
    audit_log: [...review.audit_log, event],
  };
  const saved = await saveWorkflow(record, review.draft, workflow, env, {
    requestStatus: "published",
    decisionNote: `Published Model Keyword Profile ${published.profile_id} v${published.profile_version} by ${actor.id}.`,
  }, fetchImpl);
  if (!saved.ok) {
    return json({
      ok: false,
      error: "audit_finalize_failed_after_profile_publish",
      recoverable: true,
      published_profile_id: published.profile_id,
      published_profile_version: published.profile_version,
    }, 503);
  }
  return json({
    ok: true,
    request_id: review.request_id,
    stage: "published",
    request_status: "published",
    workflow_version: nextVersion,
    published_profile_id: published.profile_id,
    published_profile_version: published.profile_version,
    recovered_publish: Boolean(published.recovered),
    event,
    production_mutated: true,
  });
}

function validateDraftForReview(draft) {
  const errors = [];
  const warnings = [];
  if (!/^rec[A-Za-z0-9]{14,}$/.test(clean(draft.model_id, 80))) errors.push({ code: "canonical_model_required" });
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/.test(clean(draft.model_key, 64))) errors.push({ code: "invalid_model_key" });
  if (!clean(draft.working_name, 120)) errors.push({ code: "working_name_required" });
  if (!["Public", "GWs", "EMs", "Private"].includes(clean(draft.model_tier, 40))) errors.push({ code: "invalid_model_tier" });
  if (!clean(draft.source_ref, 240)) warnings.push({ code: "source_ref_missing" });
  if (!clean(draft.customer_safe_info, 800) && !clean(draft.customer_safe_remark, 500)) warnings.push({ code: "customer_safe_copy_empty" });
  if (containsActualOperationalData(draft.customer_safe_info) || containsActualOperationalData(draft.customer_safe_remark) || containsActualOperationalData(draft.positive_sensitive_description)) {
    errors.push({ code: "operational_data_forbidden" });
  }
  return { pass: errors.length === 0, errors, warnings };
}

function runModelQa(draft, evidenceInput = {}) {
  const evidence = object(evidenceInput);
  const validation = validateDraftForReview(draft);
  const errors = validation.errors.slice();
  const warnings = validation.warnings.slice();
  if (evidence.policy_path_match !== true) errors.push({ code: "production_policy_path_not_verified" });
  if (evidence.customer_safe_preview_checked !== true) errors.push({ code: "customer_safe_preview_not_checked" });
  if (evidence.source_checked !== true) errors.push({ code: "source_not_checked" });
  if (evidence.privacy_checked !== true) errors.push({ code: "privacy_check_required" });
  return {
    pass: errors.length === 0,
    errors,
    warnings,
    checked_at: new Date().toISOString(),
  };
}

async function publishKeywordProfile(draft, env, actor, fetchImpl) {
  const cfg = config(env);
  const model = await airtableGetRecord(env, cfg.modelsTable, clean(draft.model_id, 80), fetchImpl);
  if (!model.ok) return { ok: false, error: model.status === 404 ? "canonical_model_not_found" : "model_source_unavailable", status: serviceStatus(model.status) };
  const identityKey = firstField(model.data?.fields || {}, ["unique_key", "model_code", "model_lookup_key"]);
  if (identityKey && clean(identityKey, 80).toLowerCase() !== clean(draft.model_key, 80).toLowerCase()) {
    return { ok: false, error: "model_key_identity_mismatch", status: 409, details: { canonical_model_key: clean(identityKey, 80) } };
  }

  const profiles = await fetchAllRecords(env, cfg.keywordProfilesTable, fetchImpl);
  if (!profiles.ok) return { ok: false, error: "keyword_profile_source_unavailable", status: serviceStatus(profiles.status) };
  const requestedId = clean(draft.keyword_profile_id, 80);
  const existing = requestedId
    ? profiles.records.find((item) => item.id === requestedId)
    : profiles.records.find((item) => {
        const fields = item.fields || {};
        const key = clean(fields[PROFILE_FIELDS.modelKey], 80).toLowerCase();
        const linked = arrayValue(fields[PROFILE_FIELDS.model]).includes(clean(draft.model_id, 80));
        return key === clean(draft.model_key, 80).toLowerCase() || linked;
      });

  const expectedProfileVersion = draft.expected_profile_version == null ? null : Number(draft.expected_profile_version);
  if (requestedId && !existing) return { ok: false, error: "keyword_profile_not_found", status: 404 };
  if (!requestedId && existing) {
    if (profileMatchesDraft(existing, draft, 1)) {
      return { ok: true, profile_id: existing.id, profile_version: positiveInteger(existing.fields?.[PROFILE_FIELDS.version], 1), recovered: true };
    }
    return { ok: false, error: "keyword_profile_already_exists", status: 409, details: { profile_id: existing.id } };
  }

  let nextVersion = 1;
  if (existing) {
    const currentVersion = positiveInteger(existing.fields?.[PROFILE_FIELDS.version], 1);
    if (!Number.isInteger(expectedProfileVersion) || expectedProfileVersion < 1) {
      return { ok: false, error: "expected_profile_version_required", status: 428 };
    }
    if (currentVersion === expectedProfileVersion + 1 && profileMatchesDraft(existing, draft, currentVersion)) {
      return { ok: true, profile_id: existing.id, profile_version: currentVersion, recovered: true };
    }
    if (currentVersion !== expectedProfileVersion) {
      return { ok: false, error: "profile_version_conflict", status: 409, details: { expected: expectedProfileVersion, actual: currentVersion } };
    }
    nextVersion = currentVersion + 1;
  }

  const now = new Date().toISOString();
  const fields = profileWriteFields(draft, nextVersion, now);
  let result;
  if (existing) {
    result = await airtableFetch(env, cfg.keywordProfilesTable, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records: [{ id: existing.id, fields }], typecast: true }),
    }, null, fetchImpl);
  } else {
    result = await airtableFetch(env, cfg.keywordProfilesTable, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records: [{ fields }], typecast: true }),
    }, null, fetchImpl);
  }
  if (!result.ok) {
    return { ok: false, error: result.status === 422 ? "keyword_profile_schema_not_ready" : "keyword_profile_publish_failed", status: result.status === 422 ? 503 : serviceStatus(result.status) };
  }
  const saved = result.data?.records?.[0];
  if (!saved?.id) return { ok: false, error: "keyword_profile_publish_missing_record", status: 503 };
  return { ok: true, profile_id: saved.id, profile_version: nextVersion, recovered: false, published_by: actor.id };
}

function profileWriteFields(draft, version, reviewedAt) {
  const fields = {
    [PROFILE_FIELDS.modelKey]: clean(draft.model_key, 64),
    [PROFILE_FIELDS.folderName]: clean(draft.folder_name, 120),
    [PROFILE_FIELDS.workingName]: clean(draft.working_name, 120),
    [PROFILE_FIELDS.aliases]: uniqueList(draft.search_aliases, 30, 80),
    [PROFILE_FIELDS.safeInfo]: clean(draft.customer_safe_info, 800),
    [PROFILE_FIELDS.positiveSensitive]: clean(draft.positive_sensitive_description, 800),
    [PROFILE_FIELDS.safeRemark]: clean(draft.customer_safe_remark, 500),
    [PROFILE_FIELDS.tier]: clean(draft.model_tier, 40),
    [PROFILE_FIELDS.customerScope]: uniqueList(draft.allowed_customer_scope, 8, 60),
    [PROFILE_FIELDS.photoPolicy]: clean(draft.photo_visibility_policy, 80),
    [PROFILE_FIELDS.depositGate]: clean(draft.deposit_preview_gate, 80),
    [PROFILE_FIELDS.status]: "Active",
    [PROFILE_FIELDS.publicKenji]: Boolean(draft.include_in_public_kenji),
    [PROFILE_FIELDS.sourceRef]: clean(draft.source_ref, 240),
    [PROFILE_FIELDS.version]: version,
    [PROFILE_FIELDS.reviewedAt]: reviewedAt,
  };
  if (draft.model_id) fields[PROFILE_FIELDS.model] = [clean(draft.model_id, 80)];
  return fields;
}

function profileMatchesDraft(record, draft, expectedVersion) {
  const fields = record?.fields || {};
  const projected = profileWriteFields(draft, expectedVersion, clean(fields[PROFILE_FIELDS.reviewedAt], 80));
  const compareKeys = [
    PROFILE_FIELDS.modelKey, PROFILE_FIELDS.folderName, PROFILE_FIELDS.workingName,
    PROFILE_FIELDS.safeInfo, PROFILE_FIELDS.positiveSensitive, PROFILE_FIELDS.safeRemark,
    PROFILE_FIELDS.tier, PROFILE_FIELDS.photoPolicy, PROFILE_FIELDS.depositGate,
    PROFILE_FIELDS.status, PROFILE_FIELDS.publicKenji, PROFILE_FIELDS.sourceRef, PROFILE_FIELDS.version,
  ];
  for (const key of compareKeys) {
    if (JSON.stringify(normalizeCompare(fields[key])) !== JSON.stringify(normalizeCompare(projected[key]))) return false;
  }
  if (JSON.stringify(uniqueList(fields[PROFILE_FIELDS.aliases], 30, 80)) !== JSON.stringify(uniqueList(projected[PROFILE_FIELDS.aliases], 30, 80))) return false;
  if (JSON.stringify(uniqueList(fields[PROFILE_FIELDS.customerScope], 8, 60)) !== JSON.stringify(uniqueList(projected[PROFILE_FIELDS.customerScope], 8, 60))) return false;
  if (draft.model_id && !arrayValue(fields[PROFILE_FIELDS.model]).includes(clean(draft.model_id, 80))) return false;
  return true;
}

async function saveWorkflow(record, draft, workflow, env, meta, fetchImpl) {
  const fields = reviewFields(env);
  const payload = { ...draft, workflow };
  return airtableFetch(env, config(env).reviewTable, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      records: [{
        id: record.id,
        fields: {
          [fields.requestStatus]: meta.requestStatus,
          [fields.decisionNote]: meta.decisionNote,
          [fields.payloadJson]: JSON.stringify(payload),
        },
      }],
      typecast: true,
    }),
  }, null, fetchImpl);
}

function projectReview(record, env) {
  const fields = record.fields || {};
  const rf = reviewFields(env);
  const draft = parsePayload(fields[rf.payloadJson]);
  const workflow = normalizeWorkflow(draft.workflow, {
    requestId: clean(fields[rf.requestId], 160),
    requestStatus: clean(fields[rf.requestStatus], 60),
    requestedAt: clean(fields[rf.requestedAt], 80),
    requestedBy: clean(fields[rf.requestedBy], 100),
  });
  return {
    record_id: clean(record.id, 80),
    request_id: clean(fields[rf.requestId], 160),
    request_status: clean(fields[rf.requestStatus], 60),
    requested_by: clean(fields[rf.requestedBy], 100),
    requested_at: clean(fields[rf.requestedAt], 80),
    requested_visibility: clean(fields[rf.requestedVisibility], 60),
    model_id: arrayValue(fields[rf.model])[0] || clean(draft.model_id, 80),
    model_key: clean(draft.model_key, 80),
    working_name: clean(draft.working_name, 120),
    draft,
    workflow,
    stage: workflow.stage,
    workflow_version: workflow.version,
    reviewed_at: clean(workflow.reviewed_at, 80),
    reviewed_by: clean(workflow.reviewed_by, 100),
    qa_snapshot: object(workflow.qa_snapshot),
    audit_log: Array.isArray(workflow.audit_log) ? workflow.audit_log : [],
    last_command_id: clean(workflow.last_command_id, 180),
    published_profile_id: clean(workflow.published_profile_id, 80),
    published_profile_version: positiveInteger(workflow.published_profile_version, 0) || null,
  };
}

function publicReviewItem(review) {
  return {
    request_id: review.request_id,
    record_id: review.record_id,
    request_status: review.request_status,
    requested_by: review.requested_by,
    requested_at: review.requested_at,
    requested_visibility: review.requested_visibility,
    model_id: review.model_id,
    model_key: review.model_key,
    working_name: review.working_name,
    stage: review.stage,
    workflow_version: review.workflow_version,
    reviewed_at: review.reviewed_at || null,
    reviewed_by: review.reviewed_by || null,
    qa_pass: review.qa_snapshot.pass === true,
    qa_checked_at: review.qa_snapshot.checked_at || null,
    keyword_profile_id: clean(review.draft.keyword_profile_id, 80) || null,
    expected_profile_version: review.draft.expected_profile_version ?? null,
    model_tier: clean(review.draft.model_tier, 40),
    customer_safe_info: clean(review.draft.customer_safe_info, 800),
    customer_safe_remark: clean(review.draft.customer_safe_remark, 500),
    source_ref: clean(review.draft.source_ref, 240),
    published_profile_id: review.published_profile_id || null,
    published_profile_version: review.published_profile_version || null,
    audit_count: review.audit_log.length,
  };
}

function normalizeWorkflow(input, seed) {
  const source = object(input);
  if (source.stage && Number.isInteger(Number(source.version))) {
    return {
      ...source,
      stage: normalizeStage(source.stage),
      version: positiveInteger(source.version, 1),
      audit_log: Array.isArray(source.audit_log) ? source.audit_log : [],
    };
  }
  const status = clean(seed.requestStatus, 60).toLowerCase();
  const stage = status === "published" ? "published" : status === "qa_passed" ? "qa_passed" : "review";
  const at = clean(seed.requestedAt, 80) || new Date(0).toISOString();
  return {
    stage,
    version: 1,
    reviewed_at: ["reviewed", "qa_passed", "published"].includes(status) ? at : null,
    reviewed_by: ["reviewed", "qa_passed", "published"].includes(status) ? clean(seed.requestedBy, 100) : null,
    qa_snapshot: null,
    updated_at: at,
    updated_by: clean(seed.requestedBy, 100),
    last_command_id: null,
    audit_log: [{
      event_id: `${clean(seed.requestId, 160)}:1:submit_review:${at}`,
      action: "submit_review",
      from_stage: "draft",
      to_stage: "review",
      actor_id: clean(seed.requestedBy, 100),
      actor_role: "submitter",
      at,
      version: 1,
    }],
  };
}

function auditEvent(review, actor, at, action, toStage, detail = {}) {
  return {
    event_id: `${review.request_id}:${review.workflow_version}:${action}:${at}`,
    request_id: review.request_id,
    model_key: review.model_key,
    action,
    from_stage: review.stage,
    to_stage: toStage,
    actor_id: actor.id,
    actor_role: actor.role,
    at,
    version: review.workflow_version,
    ...detail,
  };
}

async function loadReviewByRequestId(env, requestId, fetchImpl) {
  const fields = reviewFields(env);
  const params = new URLSearchParams();
  params.set("pageSize", "1");
  params.set("filterByFormula", `{${fields.requestId}}="${escapeFormulaValue(requestId)}"`);
  const result = await airtableFetch(env, config(env).reviewTable, { method: "GET" }, params, fetchImpl);
  if (!result.ok) return result;
  return { ok: true, record: result.data?.records?.[0] || null };
}

async function fetchAllRecords(env, table, fetchImpl) {
  const records = [];
  let offset = "";
  do {
    const params = new URLSearchParams({ pageSize: "100" });
    if (offset) params.set("offset", offset);
    const result = await airtableFetch(env, table, { method: "GET" }, params, fetchImpl);
    if (!result.ok) return result;
    records.push(...(Array.isArray(result.data?.records) ? result.data.records : []));
    offset = clean(result.data?.offset, 200);
  } while (offset && records.length < MAX_SCAN);
  return { ok: true, records: records.slice(0, MAX_SCAN) };
}

async function airtableGetRecord(env, table, recordId, fetchImpl) {
  if (!/^rec[A-Za-z0-9]{14,}$/.test(recordId)) return { ok: false, status: 400 };
  const cfg = config(env);
  const url = `${AIRTABLE_API}/${encodeURIComponent(cfg.baseId)}/${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`;
  let response;
  try {
    response = await fetchImpl(url, { headers: { authorization: `Bearer ${cfg.apiKey}`, accept: "application/json" } });
  } catch {
    return { ok: false, status: 503 };
  }
  const data = await response.json().catch(() => ({}));
  return response.ok ? { ok: true, status: response.status, data } : { ok: false, status: response.status, data };
}

async function airtableFetch(env, table, init = {}, query = null, fetchImpl = fetch) {
  const cfg = config(env);
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(cfg.baseId)}/${encodeURIComponent(table)}`);
  if (query) for (const [key, value] of query.entries()) url.searchParams.append(key, value);
  let response;
  try {
    response = await fetchImpl(url.toString(), {
      ...init,
      headers: { authorization: `Bearer ${cfg.apiKey}`, accept: "application/json", ...(init.headers || {}) },
    });
  } catch {
    return { ok: false, status: 503, error: "airtable_unreachable" };
  }
  const data = await response.json().catch(() => ({}));
  return response.ok ? { ok: true, status: response.status, data } : { ok: false, status: response.status, data };
}

function config(env) {
  return {
    apiKey: clean(env.AIRTABLE_API_KEY, 1200),
    baseId: clean(env.AIRTABLE_BASE_ID, 200),
    modelsTable: envName(env, ["AIRTABLE_TABLE_MODELS_ID", "AIRTABLE_TABLE_MODELS"], "Models"),
    keywordProfilesTable: envName(env, ["AIRTABLE_TABLE_MODEL_KEYWORD_PROFILES_ID", "AIRTABLE_TABLE_MODEL_KEYWORD_PROFILES"], "MMD — Model Keyword Profiles"),
    reviewTable: envName(env, ["AIRTABLE_TABLE_MODEL_REVIEW_REQUESTS_ID", "AIRTABLE_TABLE_MODEL_REVIEW_REQUESTS"], "MMD — Model Review Requests"),
  };
}

function reviewFields(env) {
  return {
    requestId: envName(env, "AT_REVIEW_REQUESTS__REQUEST_ID", "request_id"),
    model: envName(env, "AT_REVIEW_REQUESTS__MODEL", "Model"),
    requestType: envName(env, "AT_REVIEW_REQUESTS__REQUEST_TYPE", "request_type"),
    requestStatus: envName(env, "AT_REVIEW_REQUESTS__REQUEST_STATUS", "request_status"),
    requestedBy: envName(env, "AT_REVIEW_REQUESTS__REQUESTED_BY", "requested_by"),
    requestedAt: envName(env, "AT_REVIEW_REQUESTS__REQUESTED_AT", "requested_at"),
    requestedVisibility: envName(env, "AT_REVIEW_REQUESTS__REQUESTED_VISIBILITY", "requested_visibility"),
    decisionNote: envName(env, "AT_REVIEW_REQUESTS__DECISION_NOTE", "decision_note"),
    payloadJson: envName(env, "AT_REVIEW_REQUESTS__PAYLOAD_JSON", "payload_json"),
  };
}

function containsActualOperationalData(value) {
  const text = clean(value, 1600);
  if (!text) return false;
  const normalized = text
    .replace(/(?:ห้าม|ไม่ให้|อย่า|ไม่ควร|never|do\s+not|don't)\s*(?:เปิดเผย|บอก|แจ้ง|ส่ง|show|share|tell)?\s*(?:ราคา|ค่าตัว|เรท|คิว|availability|schedule|เบอร์(?:โทร)?|line|telegram|email|อีเมล)/gi, "")
    .trim();
  return Boolean(
    /(?:\b0\d{8,9}\b|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|https?:\/\/|line\s*(?:id|oa)|telegram|เบอร์(?:โทร)?|อีเมล|ไลน์ส่วนตัว)/i.test(normalized) ||
    /(?:\b(?:THB|บาท)\s*\d|\d[\d,]*(?:\.\d+)?\s*(?:THB|บาท)|(?:ราคา|ค่าตัว|เรท|rate|price)\s*[:=]?\s*\d)/i.test(normalized) ||
    /(?:availability|available\s+(?:today|tonight|tomorrow)|schedule|ตาราง(?:งาน|คิว)|ว่าง(?:วันนี้|คืนนี้|พรุ่งนี้)|(?:วันนี้|คืนนี้|พรุ่งนี้)[^.\n]{0,30}ว่าง|เช็กคิว\s*[:=]?\s*\w+)/i.test(normalized) ||
    /(?:airtable|record[_\s-]?id|admin[_\s-]?note|internal[_\s-]?token|secret|authorization|bearer|r2[_\s-]?(?:key|url))/i.test(normalized)
  );
}

async function hashDraft(draft) {
  const source = { ...draft };
  delete source.workflow;
  const encoded = new TextEncoder().encode(stableStringify(source));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function parsePayload(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return { ...value };
  try {
    const parsed = JSON.parse(clean(value, 12000) || "{}");
    return object(parsed);
  } catch {
    return {};
  }
}

async function parseJson(request) {
  try {
    const data = await request.json();
    return { ok: Boolean(data && typeof data === "object" && !Array.isArray(data)), data };
  } catch {
    return { ok: false, data: null };
  }
}

function trustedActor(request, options) {
  const explicit = object(options?.actor);
  const id = clean(explicit.id || options?.actor || request.headers.get("x-mmd-admin-actor"), 100);
  const role = clean(explicit.role || request.headers.get("x-mmd-admin-role"), 60).toLowerCase();
  return id && role ? { id, role } : null;
}

function envName(env, keys, fallback) {
  for (const key of Array.isArray(keys) ? keys : [keys]) {
    const value = clean(env?.[key], 200);
    if (value) return value;
  }
  return fallback;
}

function firstField(fields, names) {
  for (const name of names) {
    const value = fields?.[name];
    if (Array.isArray(value) && value.length) return value[0];
    if (value !== undefined && value !== null && String(value).trim()) return value;
  }
  return "";
}

function uniqueList(value, maxItems, maxLen) {
  const raw = Array.isArray(value) ? value : String(value || "").split(/[\n,]/);
  return [...new Set(raw.map((item) => clean(item?.name || item, maxLen)).filter(Boolean))].slice(0, maxItems);
}

function arrayValue(value) {
  return Array.isArray(value) ? value.map((item) => clean(item?.id || item?.name || item, 120)).filter(Boolean) : [];
}

function normalizeCompare(value) {
  if (Array.isArray(value)) return value.map((item) => clean(item?.name || item, 160));
  if (typeof value === "boolean" || typeof value === "number") return value;
  return clean(value, 1600);
}

function normalizeStage(value) {
  const stage = clean(value, 40).toLowerCase();
  return ["review", "qa_passed", "published", "rejected", "archived"].includes(stage) ? stage : "review";
}

function normalizePath(value) {
  const path = clean(value || "/", 500).replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function escapeFormulaValue(value) {
  return clean(value, 200).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function serviceStatus(status) {
  if (status === 404) return 404;
  if (status === 401 || status === 403) return 502;
  if (status === 422) return 503;
  return status >= 500 ? 503 : 502;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function clean(value, max = 500) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private" },
  });
}

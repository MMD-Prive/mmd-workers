import { readCredentialBoundAdminActor } from "./credential-bound-admin-session.js";
import { resolvePhaseALineIdentity } from "./model-onboarding-phase-a.js";

export const OWNER_BRIEFS_PATH = "/v1/admin/model/line-briefs";
export const MODEL_BRIEFS_PATH = "/v1/model/line-briefs";
const STORE_PATH = "https://model-activation.internal/line-job-briefs";
const STORE_NAME = "line-job-briefs-v1";
const BRIEF_PREFIX = "line_brief:";
const RESPONSE_PREFIX = "line_brief_response:";
const AUDIT_PREFIX = "line_brief_audit:";
const MAX_BODY_BYTES = 12000;
const BRIEF_STATUSES = new Set(["draft", "published", "closed", "cancelled"]);
const OWNER_ACTIONS = new Set(["list", "detail", "create", "update", "publish", "close", "cancel", "select", "prepare_link", "review_application"]);
const MODEL_ACTIONS = new Set(["list", "detail", "respond"]);

const clean = (value, max = 1000) => String(value ?? "").trim().slice(0, max);
const json = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store, private", "x-content-type-options": "nosniff" },
});

export function isLineJobBriefRequest(request) {
  try {
    const path = new URL(request.url).pathname.replace(/\/+$/, "");
    return path === OWNER_BRIEFS_PATH || path === MODEL_BRIEFS_PATH;
  } catch { return false; }
}

export async function handleLineJobBriefRequest(request, env = {}) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  const owner = path === OWNER_BRIEFS_PATH;
  if (!owner && path !== MODEL_BRIEFS_PATH) return json({ ok: false, error: "not_found" }, 404);
  if (!["mmdbkk.com", "www.mmdbkk.com"].includes(url.hostname)) return json({ ok: false, error: "forbidden_host" }, 403);
  if (request.method.toUpperCase() !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  // All calls are same-origin JSON POSTs. This also protects cookie-bound owner
  // actions from cross-site form and fetch requests.
  if (request.headers.get("origin") !== url.origin) return json({ ok: false, error: "forbidden_origin" }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ ok: false, error: "json_required" }, 415);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return json({ ok: false, error: "request_too_large" }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, error: "invalid_json" }, 400);
  const action = clean(body.action, 30);
  if (!(owner ? OWNER_ACTIONS : MODEL_ACTIONS).has(action)) return json({ ok: false, error: "action_invalid" }, 400);

  let command;
  if (owner) {
    const actor = await readCredentialBoundAdminActor(request, env);
    if (!actor) return json({ ok: false, error: "unauthorized" }, 401);
    if (!["owner", "admin"].includes(clean(actor.role).toLowerCase())) return json({ ok: false, error: "owner_required" }, 403);
    command = { audience: "owner", action, actor: clean(actor.id, 80), brief_id: body.brief_id, version: body.version,
      fields: body.fields, reason: body.reason, response_id: body.response_id, response_version: body.response_version, decision: body.decision,
      application_reviewed: body.application_reviewed === true };
  } else {
    if (Object.keys(body).some((key) => !["action", "brief_id", "interest", "idToken", "environment", "include_hidden"].includes(key))) {
      return json({ ok: false, error: "unsupported_field" }, 400);
    }
    const idToken = clean(body.idToken, 8000);
    if (!idToken) return json({ ok: false, error: "id_token_required" }, 401);
    const identity = await resolvePhaseALineIdentity(idToken, env, body.environment);
    if (!identity.ok) return json({ ok: false, error: identity.error || "identity_lookup_unavailable" }, identity.status || 503);
    if (identity.state === "identity_review_required") return json({ ok: false, state: identity.state, error: identity.reason }, 409);
    if (!["existing_bound", "verified_new"].includes(identity.state)) return json({ ok: false, error: "identity_unavailable" }, 503);
    if (identity.state === "existing_bound" && identity.modelActive === false) return json({ ok: false, error: "model_not_active" }, 403);
    command = { audience: "model", action, brief_id: body.brief_id, interest: body.interest,
      include_hidden: body.include_hidden === true, subject: identity.subject,
      identity_stage: identity.state === "existing_bound" ? "existing_bound" : "application_required",
      model_record_id: identity.modelRecordId || "", environment: clean(body.environment, 30) || "published" };
    if (identity.state === "verified_new") {
      const application = await inspectPhaseAApplication(env, identity.subject);
      if (!application.ok) return json({ ok: false, error: "application_status_unavailable" }, 503);
      if (application.status === "pending_review") command.identity_stage = "pending_review";
    }
  }
  const namespace = env.MODEL_ACTIVATION_COORDINATOR;
  if (!namespace?.idFromName || !namespace?.get) return json({ ok: false, error: "brief_store_unavailable" }, 503);
  try {
    const stub = namespace.get(namespace.idFromName(STORE_NAME));
    const response = await stub.fetch(STORE_PATH, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(command) });
    const payload = await response.json().catch(() => ({ ok: false, error: "brief_store_unavailable" }));
    if (owner && action === "detail" && response.ok && payload.ok === true) {
      payload.responses = await withCurrentModelFolderStatus(env, payload.responses);
      return json(payload, response.status);
    }
    if (owner && action === "review_application" && response.ok && payload.ok === true) {
      const application = await inspectPhaseAApplication(env, payload.subject);
      if (!application.ok) return json({ ok: false, error: "application_status_unavailable" }, 503);
      if (application.status !== "pending_review" || !application.application_id) return json({ ok: false, error: "application_review_required" }, 409);
      return json({ ok: true, application_id: application.application_id, application: application.application });
    }
    if (owner && action === "prepare_link" && response.ok && payload.ok === true) {
      if (payload.already_bound) return json({ ok: true, state: "already_bound" });
      // Selection is already recorded. The existing claim queue is the only
      // handoff to Folder review; a failed claim write remains retryable.
      const { upsertIdentityClaim } = await import("./model-liff-manual-review-worker.js");
      const lineHash = await sha256(payload.subject);
      const claim = await upsertIdentityClaim(env, {
        lineUserId: payload.subject, lineHash, lineDisplayName: "", environment: payload.environment || "published",
        status: "verified_unlinked", nowIso: payload.verified_at,
        safeNote: "Owner-selected LINE brief applicant; canonical Model and Drive Folder review required.",
      });
      if (!claim.ok) return json({ ok: false, error: "line_link_review_unavailable" }, claim.status || 503);
      return json({ ok: true, state: "owner_link_review_required", claim_id: clean(claim.record?.fields?.claim_id, 100) });
    }
    return json(payload, response.status);
  } catch { return json({ ok: false, error: "brief_store_unavailable" }, 503); }
}

async function inspectPhaseAApplication(env, subject) {
  const namespace = env.MODEL_ACTIVATION_COORDINATOR;
  if (!namespace?.idFromName || !namespace?.get) return { ok: false };
  const hash = await sha256(subject);
  try {
    const stub = namespace.get(namespace.idFromName(`phase-a:${hash}`));
    const response = await stub.fetch("https://model-activation.internal/phase-a", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "inspect", hash }),
    });
    const data = await response.json();
    return { ok: response.ok && data.ok === true, status: data.status || "draft",
      application_id: clean(data.application_id, 120), application: data.application || {} };
  } catch { return { ok: false }; }
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function withCurrentModelFolderStatus(env, responses) {
  if (!Array.isArray(responses)) return [];
  const ids = [...new Set(responses.map((item) => clean(item.model_record_id, 60)).filter((id) => /^rec[A-Za-z0-9]{14,30}$/.test(id)))].slice(0, 100);
  const current = new Map();
  if (ids.length && clean(env.AIRTABLE_API_KEY) && clean(env.AIRTABLE_BASE_ID)) {
    for (let offset = 0; offset < ids.length; offset += 20) {
      const group = ids.slice(offset, offset + 20);
      const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(clean(env.AIRTABLE_TABLE_MODELS || "Models"))}`);
      url.searchParams.set("pageSize", String(group.length));
      url.searchParams.set("filterByFormula", `OR(${group.map((id) => `RECORD_ID()="${id}"`).join(",")})`);
      try {
        const result = await fetch(url, { headers: { authorization: `Bearer ${env.AIRTABLE_API_KEY}` } });
        const data = await result.json().catch(() => ({}));
        if (!result.ok || !Array.isArray(data.records)) continue;
        for (const record of data.records) {
          if (!group.includes(record.id)) continue;
          const fields = record.fields || {};
          current.set(record.id, {
            working_name: clean(fields.working_name || fields.display_name || fields.nickname, 120),
            folder_status: clean(fields.drive_folder_id || fields.drive_folder_url, 180) ? "linked" : "missing",
          });
        }
      } catch { /* A failed lookup remains visibly unavailable to the owner. */ }
    }
  }
  return responses.map((item) => item.model_record_id
    ? { ...item, model_identity: current.get(item.model_record_id) || { working_name: "", folder_status: "unavailable" } }
    : item);
}

function parseBangkok(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:(?:[0-5]\d)$/.test(String(value || ""))) return "";
  const date = new Date(`${value}:00+07:00`);
  if (!Number.isFinite(date.getTime())) return "";
  const roundtrip = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(date).replace(" ", "T");
  return roundtrip === value ? date.toISOString() : "";
}

export function validateLineBriefFields(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "fields_invalid" };
  const allowed = new Set(["title", "starts_at_bangkok", "closes_at_bangkok", "area", "format", "duties", "customer_count", "hours", "model_count", "public_note", "internal_note"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) return { ok: false, error: "unsupported_field" };
  const textFields = [["title", 120], ["area", 160], ["format", 120], ["duties", 1500], ["public_note", 1000], ["internal_note", 2000]];
  for (const [key, max] of textFields) if (String(input[key] ?? "").length > max) return { ok: false, error: `${key}_too_long` };
  const startsAt = parseBangkok(input.starts_at_bangkok);
  const closesAt = input.closes_at_bangkok ? parseBangkok(input.closes_at_bangkok) : "";
  if (!startsAt || (input.closes_at_bangkok && !closesAt) || (closesAt && closesAt > startsAt)) return { ok: false, error: "schedule_invalid" };
  const numbers = {};
  for (const [key, min, max] of [["customer_count", 0, 1000], ["hours", 0.5, 72], ["model_count", 1, 1000]]) {
    const value = Number(input[key]);
    if (!Number.isFinite(value) || value < min || value > max || (key !== "hours" && !Number.isInteger(value))) return { ok: false, error: `${key}_invalid` };
    numbers[key] = value;
  }
  if (!clean(input.title, 120) || !clean(input.area, 160) || !clean(input.format, 120) || !clean(input.duties, 1500)) return { ok: false, error: "required_field_missing" };
  return { ok: true, fields: {
    title: clean(input.title, 120), starts_at: startsAt, closes_at: closesAt || null,
    area: clean(input.area, 160), format: clean(input.format, 120), duties: clean(input.duties, 1500),
    ...numbers, public_note: clean(input.public_note, 1000), internal_note: clean(input.internal_note, 2000),
  } };
}

export function effectiveBriefStatus(brief, now = Date.now()) {
  if (!BRIEF_STATUSES.has(brief?.status)) return "invalid";
  if (brief.status === "published" && (!Number.isFinite(Date.parse(brief.starts_at)) || Date.parse(brief.starts_at) <= now ||
      (brief.closes_at && (!Number.isFinite(Date.parse(brief.closes_at)) || Date.parse(brief.closes_at) <= now)))) return "expired";
  return brief.status;
}

function safeBrief(brief, now) {
  return { brief_id: brief.brief_id, title: brief.title, starts_at: brief.starts_at, timezone: "Asia/Bangkok",
    closes_at: brief.closes_at, area: brief.area, format: brief.format, duties: brief.duties,
    customer_count: brief.customer_count, hours: brief.hours, model_count: brief.model_count,
    public_note: brief.public_note, status: effectiveBriefStatus(brief, now), updated_at: brief.updated_at };
}

function responseKey(briefId, subjectHash) { return `${RESPONSE_PREFIX}${briefId}:${subjectHash}`; }
async function allValues(storage, prefix) { return [...(await storage.list({ prefix })).values()]; }
async function audit(storage, briefId, action, actor, now, detail = "") {
  const auditId = crypto.randomUUID();
  await storage.put(`${AUDIT_PREFIX}${briefId}:${now}:${auditId}`, { audit_id: auditId, brief_id: briefId, action, actor, at: now, detail });
}

async function refreshResponseIdentity(tx, response, command, nowIso) {
  if (!response || command.audience !== "model") return response;
  const rank = { application_required: 0, pending_review: 1, existing_bound: 2 };
  if ((rank[command.identity_stage] ?? -1) <= (rank[response.identity_stage] ?? -1)) return response;
  const updated = { ...response, identity_stage: command.identity_stage,
    model_record_id: command.model_record_id || response.model_record_id || null,
    updated_at: nowIso, version: (response.version || 0) + 1 };
  await tx.put(responseKey(updated.brief_id, updated.subject_hash), updated);
  await audit(tx, updated.brief_id, "identity_stage_advanced", `model:${updated.subject_hash}`, nowIso, updated.identity_stage);
  return updated;
}

export async function handleLineJobBriefDurableRequest(state, _env, request) {
  if (request.method.toUpperCase() !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const command = await request.json().catch(() => null);
  if (!command || !["owner", "model"].includes(command.audience)) return json({ ok: false, error: "invalid_command" }, 400);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const storage = state.storage;
  const briefId = clean(command.brief_id, 80);
  if (briefId && !/^brf_[a-zA-Z0-9-]{10,70}$/.test(briefId)) return json({ ok: false, error: "brief_id_invalid" }, 400);
  const isWrite = ["create", "update", "publish", "close", "cancel", "select", "respond"].includes(command.action) ||
    (command.audience === "model" && ["list", "detail"].includes(command.action));
  const run = async (tx) => {
    if (command.action === "list") {
      const briefs = await allValues(tx, BRIEF_PREFIX);
      if (command.audience === "owner") {
        const responses = await allValues(tx, RESPONSE_PREFIX);
        return json({ ok: true, items: briefs.map((brief) => ({ ...brief, status: effectiveBriefStatus(brief, now),
          interested_count: responses.filter((r) => r.brief_id === brief.brief_id && r.interest === "interested").length,
          not_interested_count: responses.filter((r) => r.brief_id === brief.brief_id && r.interest === "not_interested").length,
        })).sort((a, b) => b.created_at.localeCompare(a.created_at)) });
      }
      const hash = await sha256(command.subject);
      const items = [];
      for (const brief of briefs) {
        if (effectiveBriefStatus(brief, now) !== "published") continue;
        const response = await refreshResponseIdentity(tx, await tx.get(responseKey(brief.brief_id, hash)), command, nowIso);
        if (response?.interest === "not_interested" && !command.include_hidden) continue;
        items.push({ ...safeBrief(brief, now), my_interest: response?.interest || null, hidden: response?.interest === "not_interested",
          identity_stage: response?.identity_stage || command.identity_stage });
      }
      items.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
      return json({ ok: true, items });
    }
    if (command.action === "create") {
      if (command.audience !== "owner") return json({ ok: false, error: "forbidden" }, 403);
      const result = validateLineBriefFields(command.fields);
      if (!result.ok) return json({ ok: false, error: result.error }, 400);
      const id = `brf_${crypto.randomUUID()}`;
      const brief = { brief_id: id, ...result.fields, status: "draft", version: 1, created_at: nowIso, updated_at: nowIso, created_by: command.actor };
      await tx.put(`${BRIEF_PREFIX}${id}`, brief);
      await audit(tx, id, "create", command.actor, nowIso);
      return json({ ok: true, brief }, 201);
    }
    if (!briefId) return json({ ok: false, error: "brief_id_required" }, 400);
    const brief = await tx.get(`${BRIEF_PREFIX}${briefId}`);
    if (!brief) return json({ ok: false, error: "brief_not_found" }, 404);
    if (command.action === "detail") {
      if (command.audience === "owner") {
        const responses = (await allValues(tx, `${RESPONSE_PREFIX}${briefId}:`)).map(ownerResponse);
        return json({ ok: true, brief: { ...brief, status: effectiveBriefStatus(brief, now) }, responses });
      }
      if (brief.status === "draft") return json({ ok: false, error: "brief_not_found" }, 404);
      const hash = await sha256(command.subject);
      const response = await refreshResponseIdentity(tx, await tx.get(responseKey(briefId, hash)), command, nowIso);
      return json({ ok: true, brief: safeBrief(brief, now), my_interest: response?.interest || null,
        hidden: response?.interest === "not_interested", identity_stage: response?.identity_stage || command.identity_stage });
    }
    if (command.action === "respond") {
      if (command.audience !== "model" || !["interested", "not_interested"].includes(command.interest)) return json({ ok: false, error: "interest_invalid" }, 400);
      if (effectiveBriefStatus(brief, now) !== "published") return json({ ok: false, error: "brief_not_open" }, 409);
      const hash = await sha256(command.subject);
      const key = responseKey(briefId, hash);
      const current = await tx.get(key);
      if (current?.decision === "selected") return json({ ok: false, error: "selection_locked" }, 409);
      if (current?.interest === command.interest && current?.identity_stage === command.identity_stage) {
        return json({ ok: true, response: modelResponse(current), idempotent: true });
      }
      const response = { response_id: current?.response_id || `rsp_${crypto.randomUUID()}`, brief_id: briefId, subject: command.subject,
        subject_hash: hash, model_record_id: command.model_record_id || null, identity_stage: command.identity_stage,
        interest: command.interest, decision: current?.decision || "pending", environment: command.environment,
        created_at: current?.created_at || nowIso,
        updated_at: nowIso, version: (current?.version || 0) + 1 };
      await tx.put(key, response);
      await audit(tx, briefId, command.interest, `model:${hash}`, nowIso);
      return json({ ok: true, response: modelResponse(response), idempotent: false });
    }
    if (command.audience !== "owner") return json({ ok: false, error: "forbidden" }, 403);
    if (command.action === "prepare_link") {
      const responses = await allValues(tx, `${RESPONSE_PREFIX}${briefId}:`);
      const response = responses.find((item) => item.response_id === clean(command.response_id, 80));
      if (!response || response.decision !== "selected" || response.interest !== "interested") return json({ ok: false, error: "selection_required" }, 409);
      if (response.model_record_id) return json({ ok: true, already_bound: true });
      if (response.identity_stage !== "pending_review" || !/^U[0-9a-f]{32}$/i.test(response.subject)) return json({ ok: false, error: "identity_review_required" }, 409);
      // Private internal DO response. The public facade replaces it with a
      // claim ID and never sends the verified subject to the owner browser.
      return json({ ok: true, subject: response.subject, environment: response.environment, verified_at: response.created_at });
    }
    if (command.action === "review_application") {
      const responses = await allValues(tx, `${RESPONSE_PREFIX}${briefId}:`);
      const response = responses.find((item) => item.response_id === clean(command.response_id, 80));
      if (!response || response.interest !== "interested" || response.identity_stage !== "pending_review") return json({ ok: false, error: "application_review_required" }, 409);
      return json({ ok: true, subject: response.subject });
    }
    if (!Number.isInteger(command.version) || command.version !== brief.version) return json({ ok: false, error: "version_conflict", current_version: brief.version }, 409);
    if (command.action === "update") {
      if (!["draft", "published"].includes(brief.status) || effectiveBriefStatus(brief, now) === "expired") return json({ ok: false, error: "brief_not_editable" }, 409);
      const result = validateLineBriefFields(command.fields);
      if (!result.ok) return json({ ok: false, error: result.error }, 400);
      if (brief.status === "published" && Date.parse(result.fields.starts_at) <= now) return json({ ok: false, error: "starts_at_past" }, 409);
      Object.assign(brief, result.fields);
    } else if (command.action === "publish") {
      if (brief.status !== "draft" || Date.parse(brief.starts_at) <= now || (brief.closes_at && Date.parse(brief.closes_at) <= now)) return json({ ok: false, error: "brief_not_publishable" }, 409);
      brief.status = "published";
    } else if (["close", "cancel"].includes(command.action)) {
      if (!["draft", "published"].includes(brief.status) || !clean(command.reason, 500)) return json({ ok: false, error: "reason_or_state_invalid" }, 409);
      brief.status = command.action === "close" ? "closed" : "cancelled";
      brief.close_reason = clean(command.reason, 500);
    } else if (command.action === "select") {
      if (!["selected", "not_selected"].includes(command.decision) || !/^rsp_[a-zA-Z0-9-]{10,70}$/.test(clean(command.response_id, 80))) return json({ ok: false, error: "decision_invalid" }, 400);
      const responses = await allValues(tx, `${RESPONSE_PREFIX}${briefId}:`);
      const response = responses.find((item) => item.response_id === command.response_id);
      if (!response || response.interest !== "interested") return json({ ok: false, error: "response_not_eligible" }, 409);
      if (!Number.isInteger(command.response_version) || command.response_version !== response.version) return json({ ok: false, error: "response_version_conflict", current_version: response.version }, 409);
      if (command.decision === "selected" && response.identity_stage !== "existing_bound" && (!command.application_reviewed || response.identity_stage !== "pending_review")) {
        return json({ ok: false, error: "application_review_required" }, 409);
      }
      response.decision = command.decision;
      response.decision_by = command.actor;
      response.decision_at = nowIso;
      response.updated_at = nowIso;
      response.version = (response.version || 0) + 1;
      await tx.put(responseKey(briefId, response.subject_hash), response);
      await audit(tx, briefId, command.decision, command.actor, nowIso, response.response_id);
      return json({ ok: true, response: ownerResponse(response) });
    } else return json({ ok: false, error: "action_invalid" }, 400);
    brief.version += 1;
    brief.updated_at = nowIso;
    brief.updated_by = command.actor;
    await tx.put(`${BRIEF_PREFIX}${briefId}`, brief);
    await audit(tx, briefId, command.action, command.actor, nowIso, clean(command.reason, 500));
    return json({ ok: true, brief: { ...brief, status: effectiveBriefStatus(brief, now) } });
  };
  try { return isWrite ? await storage.transaction(run) : await run(storage); }
  catch { return json({ ok: false, error: "brief_store_unavailable" }, 503); }
}

function modelResponse(response) {
  return { response_id: response.response_id, brief_id: response.brief_id, interest: response.interest,
    identity_stage: response.identity_stage, decision: response.decision, updated_at: response.updated_at, version: response.version,
    note: "interest_only_not_booking" };
}

function ownerResponse({ subject, subject_hash, ...response }) { return response; }

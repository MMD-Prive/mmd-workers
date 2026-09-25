import test from "node:test";
import assert from "node:assert/strict";
import {
  effectiveBriefStatus, handleLineJobBriefDurableRequest, handleLineJobBriefRequest,
  validateLineBriefFields,
} from "./src/model-line-job-briefs.js";
import { createCredentialBoundAdminSession } from "./src/credential-bound-admin-session.js";

const ORIGIN = "https://mmdbkk.com";
const STORE = `${ORIGIN}/line-job-briefs`;
const SUBJECT = `U${"a".repeat(32)}`;

class MemoryStorage {
  data = new Map();
  async get(key) { return this.data.get(key); }
  async put(key, value) { this.data.set(key, structuredClone(value)); }
  async list({ prefix = "" } = {}) { return new Map([...this.data].filter(([key]) => key.startsWith(prefix))); }
  async transaction(fn) { return fn(this); }
}

function bangkokMinutesFromNow(minutes) {
  const date = new Date(Math.ceil((Date.now() + minutes * 60000) / 60000) * 60000);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date).replace(" ", "T");
}

function fields(minutes = 120) {
  return { title: "Brand event", starts_at_bangkok: bangkokMinutesFromNow(minutes), area: "Bangkok area",
    format: "Event", duties: "Greet guests", customer_count: 12, hours: 4, model_count: 2,
    public_note: "Indoor", internal_note: "Owner only" };
}

async function durable(state, command) {
  const response = await handleLineJobBriefDurableRequest(state, {}, new Request(STORE, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(command),
  }));
  return { status: response.status, body: await response.json() };
}

async function createPublished(state, minutes = 120) {
  const created = await durable(state, { audience: "owner", action: "create", actor: "per", fields: fields(minutes) });
  assert.equal(created.status, 201);
  const id = created.body.brief.brief_id;
  const published = await durable(state, { audience: "owner", action: "publish", actor: "per", brief_id: id, version: 1 });
  assert.equal(published.status, 200);
  return id;
}

test("Bangkok schedule validation rejects invalid, missing and reversed timestamps", () => {
  assert.equal(validateLineBriefFields(fields()).ok, true);
  assert.equal(validateLineBriefFields({ ...fields(), starts_at_bangkok: "2026-02-30T12:00" }).error, "schedule_invalid");
  assert.equal(validateLineBriefFields({ ...fields(), starts_at_bangkok: "" }).error, "schedule_invalid");
  assert.equal(validateLineBriefFields({ ...fields(), closes_at_bangkok: bangkokMinutesFromNow(180) }).error, "schedule_invalid");
  assert.equal(validateLineBriefFields({ ...fields(), model_count: 0 }).error, "model_count_invalid");
  const at = new Date("2026-09-25T10:00:00.000Z");
  assert.equal(effectiveBriefStatus({ status: "published", starts_at: at.toISOString() }, at.getTime() - 1), "published");
  assert.equal(effectiveBriefStatus({ status: "published", starts_at: at.toISOString() }, at.getTime()), "expired");
  assert.equal(effectiveBriefStatus({ status: "published", starts_at: "bad" }, at.getTime()), "expired");
});

test("owner edits require a version, published briefs expire on read, and close/cancel retain audit", async () => {
  const state = { storage: new MemoryStorage() };
  const draft = await durable(state, { audience: "owner", action: "create", actor: "per", fields: fields() });
  const id = draft.body.brief.brief_id;
  assert.equal((await durable(state, { audience: "model", action: "list", subject: SUBJECT, identity_stage: "existing_bound" })).body.items.length, 0);
  assert.equal((await durable(state, { audience: "owner", action: "publish", actor: "per", brief_id: id, version: 3 })).body.error, "version_conflict");
  assert.equal((await durable(state, { audience: "owner", action: "update", actor: "per", brief_id: id, version: 1, fields: fields(150) })).body.brief.version, 2);
  assert.equal((await durable(state, { audience: "owner", action: "publish", actor: "per", brief_id: id, version: 2 })).body.brief.status, "published");
  assert.equal((await durable(state, { audience: "model", action: "list", subject: SUBJECT, identity_stage: "existing_bound" })).body.items.length, 1);
  assert.equal((await durable(state, { audience: "owner", action: "close", actor: "per", brief_id: id, version: 3, reason: "Filled" })).body.brief.status, "closed");
  assert.equal((await durable(state, { audience: "model", action: "respond", brief_id: id, subject: SUBJECT, identity_stage: "existing_bound", interest: "interested" })).body.error, "brief_not_open");
  const second = await durable(state, { audience: "owner", action: "create", actor: "per", fields: fields() });
  const cancelled = await durable(state, { audience: "owner", action: "cancel", actor: "per", brief_id: second.body.brief.brief_id, version: 1, reason: "Plan changed" });
  assert.equal(cancelled.body.brief.status, "cancelled");
  assert.equal((await state.storage.list({ prefix: "line_brief_audit:" })).size, 6);
  const stored = await state.storage.get(`line_brief:${id}`);
  stored.starts_at = new Date(Date.now() - 1000).toISOString();
  stored.status = "published";
  await state.storage.put(`line_brief:${id}`, stored);
  assert.equal((await durable(state, { audience: "model", action: "list", subject: SUBJECT, identity_stage: "existing_bound" })).body.items.length, 0);
  assert.equal((await durable(state, { audience: "model", action: "respond", brief_id: id, subject: SUBJECT, identity_stage: "existing_bound", interest: "interested" })).body.error, "brief_not_open");
});

test("interest is unique per subject and brief, hidden is personal, and selection is separate", async () => {
  const state = { storage: new MemoryStorage() };
  const first = await createPublished(state);
  const second = await createPublished(state, 180);
  const one = await durable(state, { audience: "model", action: "respond", brief_id: first, subject: SUBJECT, identity_stage: "existing_bound", model_record_id: "recExisting123456", interest: "interested" });
  const repeat = await durable(state, { audience: "model", action: "respond", brief_id: first, subject: SUBJECT, identity_stage: "existing_bound", model_record_id: "recExisting123456", interest: "interested" });
  assert.equal(repeat.body.idempotent, true);
  assert.equal(repeat.body.response.response_id, one.body.response.response_id);
  assert.equal(one.body.response.decision, "pending");
  assert.equal(one.body.response.note, "interest_only_not_booking");
  assert.equal(JSON.stringify(one.body).includes(SUBJECT), false);
  assert.equal(JSON.stringify((await durable(state, { audience: "model", action: "detail", brief_id: first, subject: SUBJECT, identity_stage: "existing_bound" })).body).includes("Owner only"), false);
  await durable(state, { audience: "model", action: "respond", brief_id: second, subject: SUBJECT, identity_stage: "existing_bound", interest: "interested" });
  assert.equal((await durable(state, { audience: "owner", action: "detail", brief_id: first })).body.responses.length, 1);
  assert.equal((await durable(state, { audience: "owner", action: "list" })).body.items.find((x) => x.brief_id === first).interested_count, 1);
  await durable(state, { audience: "model", action: "respond", brief_id: first, subject: SUBJECT, identity_stage: "existing_bound", interest: "not_interested" });
  assert.equal((await durable(state, { audience: "model", action: "list", subject: SUBJECT, identity_stage: "existing_bound" })).body.items.length, 1);
  assert.equal((await durable(state, { audience: "model", action: "list", subject: SUBJECT, identity_stage: "existing_bound", include_hidden: true })).body.items.length, 2);
  assert.equal((await durable(state, { audience: "model", action: "list", subject: `U${"b".repeat(32)}`, identity_stage: "existing_bound" })).body.items.length, 2);
  await durable(state, { audience: "model", action: "respond", brief_id: first, subject: SUBJECT, identity_stage: "existing_bound", interest: "interested" });
  const selected = await durable(state, { audience: "owner", action: "select", actor: "per", brief_id: first, version: 2, response_id: one.body.response.response_id, response_version: 3, decision: "selected" });
  assert.equal(selected.body.response.decision, "selected");
  assert.equal(JSON.stringify(selected.body).includes(SUBJECT), false);
  assert.equal((await durable(state, { audience: "model", action: "respond", brief_id: first, subject: SUBJECT, identity_stage: "existing_bound", interest: "not_interested" })).body.error, "selection_locked");
});

test("new applicant intent survives Phase A stage changes and owner cannot select before review", async () => {
  const state = { storage: new MemoryStorage() };
  const id = await createPublished(state);
  const first = await durable(state, { audience: "model", action: "respond", brief_id: id, subject: SUBJECT, identity_stage: "application_required", interest: "interested" });
  assert.equal(first.body.response.identity_stage, "application_required");
  const blocked = await durable(state, { audience: "owner", action: "select", actor: "per", brief_id: id, version: 2,
    response_id: first.body.response.response_id, response_version: 1, decision: "selected", application_reviewed: true });
  assert.equal(blocked.body.error, "application_review_required");
  const resumed = await durable(state, { audience: "model", action: "list", subject: SUBJECT, identity_stage: "pending_review" });
  assert.equal(resumed.body.items[0].identity_stage, "pending_review");
  const ownerDetail = await durable(state, { audience: "owner", action: "detail", brief_id: id });
  assert.equal(ownerDetail.body.responses.length, 1);
  assert.equal(ownerDetail.body.responses[0].response_id, first.body.response.response_id);
  assert.equal(ownerDetail.body.responses[0].identity_stage, "pending_review");
  const selected = await durable(state, { audience: "owner", action: "select", actor: "per", brief_id: id, version: 2,
    response_id: first.body.response.response_id, response_version: 2, decision: "selected", application_reviewed: true });
  assert.equal(selected.body.response.decision, "selected");
  assert.equal(selected.body.response.model_record_id, null);
});

test("owner prepares existing LINE claim only after selecting a reviewed applicant; no Folder is bound", async () => {
  const state = { storage: new MemoryStorage() };
  const id = await createPublished(state);
  const interest = await durable(state, { audience: "model", action: "respond", brief_id: id, subject: SUBJECT,
    identity_stage: "pending_review", environment: "published", interest: "interested" });
  const env = { ADMIN_SESSION_SECRET: "test-secret", ADMIN_LOGIN_CREDENTIAL: "test-credential",
    AIRTABLE_API_KEY: "test-airtable", AIRTABLE_BASE_ID: "test-base",
    MODEL_ACTIVATION_COORDINATOR: { idFromName: (value) => value, get: () => ({
      fetch: (url, init) => handleLineJobBriefDurableRequest(state, env, new Request(url, init)),
    }) } };
  const token = await createCredentialBoundAdminSession(new Request(`${ORIGIN}/internal/admin/login`), { id: "per", role: "owner" }, env);
  const prepare = async () => {
    const response = await handleLineJobBriefRequest(new Request(`${ORIGIN}/v1/admin/model/line-briefs`, {
      method: "POST", headers: { origin: ORIGIN, "content-type": "application/json", cookie: `mmd_admin_gate_v1=${token}` },
      body: JSON.stringify({ action: "prepare_link", brief_id: id, response_id: interest.body.response.response_id }),
    }), env);
    return { status: response.status, body: await response.json() };
  };
  assert.equal((await prepare()).body.error, "selection_required");
  const selected = await durable(state, { audience: "owner", action: "select", actor: "per", brief_id: id, version: 2,
    response_id: interest.body.response.response_id, response_version: 1, decision: "selected", application_reviewed: true });
  assert.equal(selected.status, 200);
  const originalFetch = globalThis.fetch;
  const writes = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(new URL(url).hostname, "api.airtable.com");
    const input = JSON.parse(init.body);
    writes.push(input);
    return Response.json({ records: [{ id: "recClaim", fields: { claim_id: input.records[0].fields.claim_id } }] });
  };
  try {
    const first = await prepare();
    const retry = await prepare();
    assert.equal(first.status, 200);
    assert.equal(retry.status, 200);
    assert.equal(first.body.state, "owner_link_review_required");
    assert.equal(JSON.stringify(first.body).includes(SUBJECT), false);
    assert.equal(writes.length, 2);
    assert.deepEqual(writes[0].performUpsert.fieldsToMergeOn, ["claim_id"]);
    assert.equal("drive_folder_id" in writes[0].records[0].fields, false);
  } finally { globalThis.fetch = originalFetch; }
});

test("owner reviews the exact Phase A application linked to an interested subject", async () => {
  const state = { storage: new MemoryStorage() };
  const id = await createPublished(state);
  const interest = await durable(state, { audience: "model", action: "respond", brief_id: id,
    subject: SUBJECT, identity_stage: "pending_review", interest: "interested" });
  const env = { ADMIN_SESSION_SECRET: "test-secret", ADMIN_LOGIN_CREDENTIAL: "test-credential",
    MODEL_ACTIVATION_COORDINATOR: { idFromName: (name) => name, get: (name) => ({ fetch: (url, init) =>
      name.startsWith("phase-a:")
        ? Response.json({ ok: true, status: "pending_review", application_id: "phasea_review123",
          application: { nickname: "Applicant", province: "Bangkok" } })
        : handleLineJobBriefDurableRequest(state, env, new Request(url, init)) }) } };
  const token = await createCredentialBoundAdminSession(new Request(`${ORIGIN}/internal/admin/login`), { id: "per", role: "owner" }, env);
  const review = async (cookie) => {
    const response = await handleLineJobBriefRequest(new Request(`${ORIGIN}/v1/admin/model/line-briefs`, {
      method: "POST", headers: { origin: ORIGIN, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ action: "review_application", brief_id: id, response_id: interest.body.response.response_id }),
    }), env);
    return { status: response.status, body: await response.json() };
  };
  assert.equal((await review()).status, 401);
  const result = await review(`mmd_admin_gate_v1=${token}`);
  assert.equal(result.status, 200);
  assert.equal(result.body.application_id, "phasea_review123");
  assert.equal(result.body.application.nickname, "Applicant");
  assert.equal(JSON.stringify(result.body).includes(SUBJECT), false);
  assert.equal((await durable(state, { audience: "model", action: "review_application", brief_id: id, subject: SUBJECT })).status, 403);
});

test("public handler rejects missing admin session, wrong origin, wrong role and forged model identity fields", async () => {
  const env = { ADMIN_SESSION_SECRET: "test-secret", ADMIN_LOGIN_CREDENTIAL: "test-credential" };
  const req = (path, body, headers = {}) => new Request(`${ORIGIN}${path}`, { method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  const ownerPath = "/v1/admin/model/line-briefs";
  const modelPath = "/v1/model/line-briefs";
  assert.equal((await handleLineJobBriefRequest(req(ownerPath, { action: "list" }), env)).status, 401);
  assert.equal((await handleLineJobBriefRequest(req(ownerPath, { action: "list" }, { origin: "https://attacker.example" }), env)).status, 403);
  const token = await createCredentialBoundAdminSession(new Request(`${ORIGIN}/internal/admin/login`), { id: "partner", role: "mms_partner" }, env);
  assert.equal((await handleLineJobBriefRequest(req(ownerPath, { action: "list" }, { cookie: `mmd_admin_gate_v1=${token}` }), env)).status, 403);
  const forged = await handleLineJobBriefRequest(req(modelPath, { action: "respond", brief_id: "brf_fakefakefake", idToken: "opaque", lineUserId: SUBJECT }), env);
  assert.equal(forged.status, 400);
  assert.equal((await forged.json()).error, "unsupported_field");
});

test("credential-bound owner can create a draft through the public facade", async () => {
  const state = { storage: new MemoryStorage() };
  const env = { ADMIN_SESSION_SECRET: "test-secret", ADMIN_LOGIN_CREDENTIAL: "test-credential",
    MODEL_ACTIVATION_COORDINATOR: { idFromName: (value) => value, get: () => ({
      fetch: (url, init) => handleLineJobBriefDurableRequest(state, env, new Request(url, init)),
    }) } };
  const token = await createCredentialBoundAdminSession(new Request(`${ORIGIN}/internal/admin/login`), { id: "per", role: "owner" }, env);
  const response = await handleLineJobBriefRequest(new Request(`${ORIGIN}/v1/admin/model/line-briefs`, {
    method: "POST", headers: { origin: ORIGIN, "content-type": "application/json", cookie: `mmd_admin_gate_v1=${token}` },
    body: JSON.stringify({ action: "create", fields: fields() }),
  }), env);
  assert.equal(response.status, 201);
  assert.equal((await response.json()).brief.status, "draft");
});

test("public Model handler verifies LINE, rejects ambiguous identity, and resumes one new-applicant intent", async () => {
  const state = { storage: new MemoryStorage() };
  const id = await createPublished(state);
  let phaseStatus = "draft";
  let identity = "new";
  const env = {
    AIRTABLE_API_KEY: "test-key", AIRTABLE_BASE_ID: "test-base",
    MODEL_ACTIVATION_COORDINATOR: {
      idFromName: (name) => name,
      get: (name) => ({
        fetch: async (url, init) => name.startsWith("phase-a:")
          ? Response.json({ ok: true, status: phaseStatus })
          : handleLineJobBriefDurableRequest(state, env, new Request(url, init)),
      }),
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.hostname === "api.line.me") return Response.json({ aud: "2010864854", sub: SUBJECT, name: "New Applicant" });
    assert.equal(url.hostname, "api.airtable.com");
    const formula = url.searchParams.get("filterByFormula") || "";
    if (url.pathname.includes("tbluoZ5JiRcoUP6WT")) return Response.json({ records: identity === "ambiguous" ? [{ id: "recClaim", fields: {} }] : [] });
    if (formula.includes("LOWER(")) return Response.json({ records: [] });
    if (formula.includes(SUBJECT)) return Response.json({ records: ["bound", "inactive"].includes(identity) ? [{ id: "recCanonicalModel", fields: identity === "inactive" ? { status: "inactive" } : {} }] : [] });
    return Response.json({ records: [] });
  };
  const call = async (body) => {
    const response = await handleLineJobBriefRequest(new Request(`${ORIGIN}/v1/model/line-briefs`, {
      method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ idToken: "line-token", environment: "published", ...body }),
    }), env);
    return { status: response.status, body: await response.json() };
  };
  try {
    identity = "ambiguous";
    const ambiguous = await call({ action: "respond", brief_id: id, interest: "interested" });
    assert.equal(ambiguous.status, 409);
    assert.equal((await state.storage.list({ prefix: "line_brief_response:" })).size, 0);
    identity = "new";
    const newIntent = await call({ action: "respond", brief_id: id, interest: "interested" });
    assert.equal(newIntent.body.response.identity_stage, "application_required");
    phaseStatus = "pending_review";
    const resumed = await call({ action: "list" });
    assert.equal(resumed.body.items[0].identity_stage, "pending_review");
    assert.equal((await state.storage.list({ prefix: "line_brief_response:" })).size, 1);
    identity = "bound";
    const bound = await call({ action: "detail", brief_id: id });
    assert.equal(bound.body.identity_stage, "existing_bound");
    assert.equal((await state.storage.list({ prefix: "line_brief_response:" })).size, 1);
    identity = "inactive";
    const inactive = await call({ action: "respond", brief_id: id, interest: "interested" });
    assert.equal(inactive.status, 403);
  } finally { globalThis.fetch = originalFetch; }
});

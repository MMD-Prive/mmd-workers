const AIRTABLE_API = "https://api.airtable.com/v0";
const BASE_ID_DEFAULT = "appsV1ILPRfIjkaYg";
const CONSOLE_INBOX_TABLE_DEFAULT = "tblFHmfpB2TTrzO2e";
const STAGING_TABLE_DEFAULT = "tbl1u0foFBvgFpT9G";
const CLIENTS_TABLE_DEFAULT = "tblVv58TCbwh5j1fS";

export const LINE_OFC_CONSOLE_BACKFILL_PATH = "/v1/admin/kenji/control/line-ofc/backfill";

export function isLineOfcConsoleBackfillRequest(path, method) {
  return path === LINE_OFC_CONSOLE_BACKFILL_PATH && ["GET", "POST"].includes(String(method).toUpperCase());
}

export async function handleLineOfcConsoleBackfill(request, env, actor) {
  if (!env.LINE_OFC_BACKFILL_COORDINATOR) return json({ ok: false, error: "backfill_not_configured" }, 503);
  const id = env.LINE_OFC_BACKFILL_COORDINATOR.idFromName("console-inbox-v1");
  const url = new URL(request.url);
  const upstream = new Request("https://line-ofc-backfill.internal" + url.pathname + url.search, {
    method: request.method,
    headers: {
      "Content-Type": "application/json",
      "X-MMD-Actor-Id": clean(actor?.id || "unknown", 180),
      "X-MMD-Actor-Role": clean(actor?.role || "unknown", 80),
    },
    body: request.method === "POST" ? await request.text() : undefined,
  });
  return env.LINE_OFC_BACKFILL_COORDINATOR.get(id).fetch(upstream);
}

export class LineOfcConsoleBackfillCoordinator {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    if (request.method === "GET") return json({ ok: true, job: await this.status() });
    if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
    const body = await readJson(request);
    const action = clean(body.action).toLowerCase() || "start";
    if (!["start", "resume", "pause"].includes(action)) return json({ ok: false, error: "invalid_request" }, 400);
    const current = await this.status();
    if (action === "pause") {
      if (current.status === "running") await this.state.storage.put("status", "paused");
      return json({ ok: true, job: await this.status() });
    }
    if (current.status === "running") return json({ ok: true, duplicate: true, job: current });
    if (action === "start" && !["idle", "completed", "failed"].includes(current.status)) return json({ ok: false, error: "job_already_exists" }, 409);
    const batchSize = clampInteger(body.batch_size, 25, 1, 50);
    const next = {
      job_id: current.job_id || "line_ofc_console_" + crypto.randomUUID(),
      status: "running",
      batch_size: batchSize,
      processed: action === "start" ? 0 : current.processed,
      staged: action === "start" ? 0 : current.staged,
      review_required: action === "start" ? 0 : current.review_required,
      failed: action === "start" ? 0 : current.failed,
      cursor: action === "start" ? "" : current.cursor,
      started_at: action === "start" ? new Date().toISOString() : current.started_at,
      updated_at: new Date().toISOString(),
      actor_id: request.headers.get("X-MMD-Actor-Id") || "unknown",
      actor_role: request.headers.get("X-MMD-Actor-Role") || "unknown",
      last_error: "",
    };
    await this.write(next);
    await this.state.storage.setAlarm(Date.now());
    return json({ ok: true, job: next }, 202);
  }

  async alarm() {
    const job = await this.status();
    if (job.status !== "running") return;
    try {
      const page = await listPage(this.env, consoleInboxTable(this.env), job.cursor, job.batch_size);
      let staged = 0, reviewRequired = 0, failed = 0;
      for (const record of page.records) {
        try {
          const outcome = await stageConsoleRecord(this.env, record, job.job_id);
          staged += 1;
          if (outcome.review_required) reviewRequired += 1;
        } catch (_) {
          failed += 1;
        }
      }
      const next = {
        ...job,
        processed: job.processed + page.records.length,
        staged: job.staged + staged,
        review_required: job.review_required + reviewRequired,
        failed: job.failed + failed,
        cursor: page.offset || "",
        status: page.offset ? "running" : "completed",
        updated_at: new Date().toISOString(),
        completed_at: page.offset ? "" : new Date().toISOString(),
      };
      await this.write(next);
      if (page.offset) await this.state.storage.setAlarm(Date.now() + 1000);
    } catch (error) {
      await this.write({ ...job, status: "failed", updated_at: new Date().toISOString(), last_error: safeError(error) });
    }
  }

  async status() {
    const values = await this.state.storage.get(["job_id","status","batch_size","processed","staged","review_required","failed","cursor","started_at","updated_at","completed_at","actor_id","actor_role","last_error"]);
    return {
      job_id: values.get("job_id") || "",
      status: values.get("status") || "idle",
      batch_size: Number(values.get("batch_size") || 25),
      processed: Number(values.get("processed") || 0),
      staged: Number(values.get("staged") || 0),
      review_required: Number(values.get("review_required") || 0),
      failed: Number(values.get("failed") || 0),
      cursor: values.get("cursor") || "",
      started_at: values.get("started_at") || "",
      updated_at: values.get("updated_at") || "",
      completed_at: values.get("completed_at") || "",
      actor_id: values.get("actor_id") || "",
      actor_role: values.get("actor_role") || "",
      last_error: values.get("last_error") || "",
    };
  }

  async write(job) { await this.state.storage.put(job); }
}

async function stageConsoleRecord(env, record, jobId) {
  const f = record.fields || {};
  const inboxId = clean(f.inbox_id || record.id, 180);
  const lineUserId = clean(f.line_user_id, 180);
  const email = clean(f.member_email, 254).toLowerCase();
  const phone = clean(f.member_phone, 80);
  const renamed = clean(f.line_renamed_name || f.member_name || stripTags(f.legacy_tags), 500);
  const rawNote = clean(f.admin_note, 50000);
  const canonical = Array.isArray(f["Canonical Client"]) ? f["Canonical Client"][0] : "";
  const matched = canonical || await findClientByLineId(env, lineUserId);
  const reviewRequired = !matched || !lineUserId || !renamed;
  const importId = "line_ofc_console_" + safeToken(inboxId);
  const fields = {
    import_id: importId,
    import_batch_id: jobId,
    source_file_title: "airtable_console_inbox",
    line_user_id: lineUserId,
    line_display_name: clean(f.member_name, 160),
    line_renamed_name: renamed,
    line_tags_raw: clean(f.legacy_tags, 4000),
    email_candidate: email,
    phone_candidate: phone,
    raw_note: rawNote,
    review_status: reviewRequired ? "review_required" : "ready_to_review",
    match_type: matched ? "exact_line_user_id" : "no_match",
    match_confidence: matched ? 0.99 : 0,
    dry_run_only: true,
    blocked_fields_json: JSON.stringify(["membership_status","membership_tier","membership_package","client_level","member_since","has_purchased"]),
    proposed_entitlement_json: JSON.stringify({ source: "line_ofc_console_backfill", review_required: true, mutation: false }),
    raw_row_json: JSON.stringify({ inbox_id: inboxId, record_id: record.id, source: "console_inbox", payload_present: Boolean(f.payload_json) }),
    created_at: new Date().toISOString(),
  };
  if (matched) fields.matched_client = [matched];
  await upsertByImportId(env, stagingTable(env), importId, fields);
  return { review_required: reviewRequired };
}

async function listPage(env, table, offset, pageSize) {
  const q = new URLSearchParams({ pageSize: String(pageSize) });
  if (offset) q.set("offset", offset);
  return airtable(env, table + "?" + q.toString());
}

async function findClientByLineId(env, lineUserId) {
  if (!lineUserId) return "";
  const q = new URLSearchParams({ maxRecords: "2", filterByFormula: "{line_user_id}=\"" + escapeFormula(lineUserId) + "\"" });
  const data = await airtable(env, clientsTable(env) + "?" + q.toString());
  return data.records?.length === 1 ? data.records[0].id : "";
}

async function upsertByImportId(env, table, importId, fields) {
  const q = new URLSearchParams({ maxRecords: "1", filterByFormula: "{import_id}=\"" + escapeFormula(importId) + "\"" });
  const found = await airtable(env, table + "?" + q.toString());
  const id = found.records?.[0]?.id;
  return airtable(env, table + (id ? "/" + id : ""), { method: id ? "PATCH" : "POST", body: JSON.stringify({ fields }) });
}

async function airtable(env, path, init = {}) {
  const token = clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 2000);
  const base = clean(env.AIRTABLE_BASE_ID || BASE_ID_DEFAULT);
  if (!token || !base) throw new Error("airtable_not_configured");
  const response = await fetch(AIRTABLE_API + "/" + base + "/" + path, {
    ...init,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  if (!response.ok) throw new Error("airtable_" + response.status);
  return response.json();
}

function consoleInboxTable(env) { return clean(env.AIRTABLE_TABLE_CONSOLE_INBOX_ID) || CONSOLE_INBOX_TABLE_DEFAULT; }
function stagingTable(env) { return clean(env.AIRTABLE_LINE_OFC_CLIENT_IMPORT_STAGING_TABLE_ID) || STAGING_TABLE_DEFAULT; }
function clientsTable(env) { return clean(env.AIRTABLE_TABLE_CLIENTS_ID) || CLIENTS_TABLE_DEFAULT; }
function stripTags(value) { return clean(value).replace(/#[a-z0-9_ก-๙]+/gi, " ").replace(/\s+/g, " ").trim(); }
function safeToken(value) { return clean(value).replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "unknown"; }
function escapeFormula(value) { return String(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\""); }
function clean(value, max = 4000) { return String(value ?? "").trim().slice(0, max); }
function clampInteger(value, fallback, min, max) { const n = Number(value); return Number.isInteger(n) && n >= min && n <= max ? n : fallback; }
function safeError(error) { return clean(error instanceof Error ? error.message : String(error), 160); }
async function readJson(request) { try { const value = await request.json(); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid"); return value; } catch (_) { return {}; } }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Cache-Control": "no-store, private", "Content-Type": "application/json; charset=utf-8" } }); }

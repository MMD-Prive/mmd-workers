import { readMemberAppSession } from "./member-app-api-runtime.js";
import { resolveCanonicalClientForLine } from "./member-app-client-history.js";

const DASHBOARD_PATH = "/api/member/app/dashboard";
const CAMPAIGN_ID = "mmd_year_6_model_direct_wish";
const WISH_TABLE_DEFAULT = "tblvMJjYXy29mgDLb";
const SESSIONS_TABLE_DEFAULT = "tblC98mKWbzmPuNzX";
const MAX_NOTES = 12;
const MAX_WISH = 700;

export function isMemberModelWishDashboardRequest(request) {
  if (!(request instanceof Request) || request.method.toUpperCase() !== "GET") return false;
  try { return normalizePath(new URL(request.url).pathname) === DASHBOARD_PATH; } catch { return false; }
}

export async function augmentMemberModelWishNotes(request, response, env = {}) {
  if (!isMemberModelWishDashboardRequest(request) || !(response instanceof Response) || !response.ok) return response;
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) return response;

  const payload = await response.clone().json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || payload.ok === false) return response;

  const notes = await readPastClientModelWishNotes(request, env).catch(() => []);
  const next = { ...payload, private_model_notes: notes };
  if (payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)) {
    next.data = { ...payload.data, private_model_notes: notes };
  }
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store, private");
  headers.set("x-mmd-private-model-notes", "v1");
  return new Response(JSON.stringify(next), { status: response.status, statusText: response.statusText, headers });
}

export async function readPastClientModelWishNotes(request, env = {}) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) return [];
  const session = await readMemberAppSession(request, env);
  const lineUserId = clean(session?.lineUserId);
  if (!/^U[a-f0-9]{32}$/i.test(lineUserId)) return [];

  const client = await resolveCanonicalClientForLine(env, lineUserId);
  if (!client?.id) return [];
  const modelIds = await completedCanonicalModelIdsForClient(env, client);
  if (!modelIds.size) return [];

  const wishes = await listApprovedDirectWishes(env);
  const out = [];
  for (const record of wishes) {
    const fields = record?.fields || {};
    const detail = safeJsonObject(fields.payload_json);
    if (detail.wish_kind !== "model_direct_wish" || detail.past_clients_consent !== true) continue;
    const modelId = clean(detail.model_record_id);
    if (!modelIds.has(modelId)) continue;
    const text = clean(detail.birthday_wish).slice(0, MAX_WISH);
    if (!text) continue;
    const review = detail.review && typeof detail.review === "object" ? detail.review : {};
    const approvedAt = safeTimestamp(review.reviewed_at) || safeTimestamp(fields.updated_at) || safeTimestamp(fields.completed_at) || null;
    out.push({
      type: "model_wish",
      visibility: "past_client_private",
      model_name: clean(detail.model_display_name).slice(0, 120) || "MMD Model",
      text,
      submitted_at: safeTimestamp(fields.submitted_at) || null,
      approved_at: approvedAt,
    });
    if (out.length >= MAX_NOTES) break;
  }
  return out;
}

async function completedCanonicalModelIdsForClient(env, client) {
  const fields = client?.fields || {};
  const clientId = clean(client?.id);
  if (!/^rec[a-zA-Z0-9]{14}$/.test(clientId)) return new Set();
  const email = normalizeEmail(fields["Contact Email"] || fields.email);
  const clientName = clean(fields["Client Name"] || fields.nickname);
  const sessionsTable = clean(env.AIRTABLE_TABLE_SESSIONS || SESSIONS_TABLE_DEFAULT);
  const groups = [];
  if (email) groups.push(await airtableList(env, sessionsTable, `LOWER({email}&"")=${formulaString(email)}`));
  if (clientName) groups.push(await airtableList(env, sessionsTable, `ARRAYJOIN({Client})=${formulaString(clientName)}`));
  const seen = new Set();
  const models = new Set();
  for (const record of groups.flat()) {
    const recordId = clean(record?.id);
    if (recordId && seen.has(recordId)) continue;
    if (recordId) seen.add(recordId);
    const f = record?.fields || {};
    if (!linkedIds(f.Client).includes(clientId)) continue;
    const status = normalizeToken(f["Session Status"] || f.status);
    if (!["completed", "complete", "done"].includes(status)) continue;
    const importReview = normalizeToken(f.import_review_status);
    if (importReview && !["approved", "materialized", "verified"].includes(importReview)) continue;
    for (const modelId of linkedIds(f["Canonical Model"])) {
      if (/^rec[a-zA-Z0-9]{14}$/.test(modelId)) models.add(modelId);
    }
  }
  return models;
}

async function listApprovedDirectWishes(env) {
  const table = clean(env.AIRTABLE_TABLE_CARE_BACK_BIRTHDAY_WISHES || WISH_TABLE_DEFAULT);
  const formula = `AND({campaign_id}=${formulaString(CAMPAIGN_ID)},{wish_status}='completed')`;
  return airtableList(env, table, formula, { sortField: "submitted_at", sortDirection: "desc", maxRecords: 100 });
}

async function airtableList(env, table, filterByFormula, { sortField = "", sortDirection = "asc", maxRecords = 500 } = {}) {
  const baseId = clean(env.AIRTABLE_BASE_ID);
  const apiKey = clean(env.AIRTABLE_API_KEY);
  if (!baseId || !apiKey || !table) return [];
  const records = [];
  let offset = "";
  for (let page = 0; page < 5 && records.length < maxRecords; page += 1) {
    const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}`);
    url.searchParams.set("pageSize", String(Math.min(100, maxRecords - records.length)));
    url.searchParams.set("filterByFormula", filterByFormula);
    if (sortField) {
      url.searchParams.set("sort[0][field]", sortField);
      url.searchParams.set("sort[0][direction]", sortDirection === "desc" ? "desc" : "asc");
    }
    if (offset) url.searchParams.set("offset", offset);
    const response = await fetch(url.toString(), { headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" } });
    const body = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(body?.records)) return [];
    records.push(...body.records);
    offset = clean(body.offset);
    if (!offset) break;
  }
  return records.slice(0, maxRecords);
}

function linkedIds(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object") return item.id || item.recordId || item.record_id || "";
    return "";
  }).map(clean).filter((id) => /^rec[a-zA-Z0-9]{14}$/.test(id));
}

function safeJsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(clean(value) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

function safeTimestamp(value) {
  const text = clean(value);
  const time = Date.parse(text);
  return Number.isFinite(time) ? new Date(time).toISOString() : "";
}
function normalizeEmail(value) { const text = clean(value).toLowerCase(); return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text) ? text : ""; }
function normalizeToken(value) { return clean(value).toLowerCase().replace(/[\s-]+/g, "_"); }
function formulaString(value) { return `'${clean(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`; }
function normalizePath(pathname) { const path = String(pathname || "/").replace(/\/{2,}/g, "/"); return path.length > 1 ? path.replace(/\/+$/g, "") : path; }
function clean(value) { return String(value ?? "").trim(); }

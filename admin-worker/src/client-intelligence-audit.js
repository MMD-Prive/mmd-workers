import {
  CLIENT_INTELLIGENCE_PATH,
  handleClientIntelligenceRequest,
} from "./client-intelligence-endpoint.js";
import { KENJI_CONTINUITY_OPERATOR_DRAFT_SCHEMA } from "../../shared/kenji-continuity-operator-draft.mjs";

export const CLIENT_INTELLIGENCE_AUDIT_PATH = "/v1/admin/clients/intelligence/audit";
export const CLIENT_INTELLIGENCE_AUDIT_SCHEMA = "mmd.client_intelligence_operator_draft_audit.v1";

const ACCESS_LOG_TABLE = "System — Access Log";
const ACTIONS = Object.freeze({
  view: "client.intelligence.operator_draft.viewed",
  copy: "client.intelligence.operator_draft.copy_authorized",
});
const OWNER_ROLES = new Set(["owner", "admin"]);

export function isClientIntelligenceAuditRequest(path, method = "POST") {
  return normalizePath(path) === CLIENT_INTELLIGENCE_AUDIT_PATH
    && String(method || "POST").toUpperCase() === "POST";
}

export async function handleClientIntelligenceAuditRequest(
  request,
  env = {},
  actor = {},
  options = {},
) {
  const path = normalizePath(new URL(request.url).pathname);
  if (path !== CLIENT_INTELLIGENCE_AUDIT_PATH) return json({ ok: false, error: "not_found" }, 404);
  if (request.method.toUpperCase() !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405, { allow: "POST" });
  }

  const role = clean(actor.role, 40).toLowerCase();
  if (!clean(actor.id, 160) || !OWNER_ROLES.has(role)) {
    return json({ ok: false, error: "owner_review_required" }, 403);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ ok: false, error: "invalid_request" }, 400);
  }

  const action = clean(body.action, 20).toLowerCase();
  const clientId = clean(body.client_id, 80);
  if (!Object.hasOwn(ACTIONS, action) || !isRecordId(clientId)) {
    return json({ ok: false, error: "invalid_request" }, 400);
  }
  if (action === "copy" && body.owner_review_confirmed !== true) {
    return json({ ok: false, error: "owner_review_confirmation_required" }, 422);
  }

  let projection;
  try {
    projection = options.loadProjection
      ? await options.loadProjection(clientId)
      : await loadProjection(request, env, clientId);
  } catch (_) {
    return json({ ok: false, error: "client_intelligence_unavailable" }, 503);
  }

  const draft = projection?.ai?.suggested_reply || {};
  if (clean(projection?.client_id, 80) !== clientId || !isSafeOperatorDraft(projection, draft)) {
    return json({ ok: false, error: "operator_draft_unavailable" }, 409);
  }

  const runtime = projection?.ai?.runtime_controls || {};
  if (action === "copy" && runtime.operator_copy_allowed !== true) {
    const status = runtime.status === "live" ? 423 : 503;
    return json({
      ok: false,
      error: runtime.status === "live" ? "kill_switch_active" : "runtime_control_unavailable",
    }, status);
  }

  if (!clean(env.AIRTABLE_BASE_ID) || !clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN)) {
    return json({ ok: false, error: "audit_store_not_configured" }, 503);
  }

  const auditKey = firstText(
    env.CLIENT_INTELLIGENCE_AUDIT_SALT,
    env.ADMIN_SESSION_SECRET,
    env.SESSION_SECRET,
    env.ADMIN_LOGIN_CREDENTIAL,
    env.ADMIN_ACCESS_CODE,
    env.SIGIL_ADMIN_ACCESS_CODE,
    env.AIRTABLE_API_KEY,
    env.AIRTABLE_TOKEN,
  );
  const [clientHash, actorHash, draftHash] = await Promise.all([
    hmacSha256Hex(auditKey, `client:${clientId}`),
    hmacSha256Hex(auditKey, `actor:${clean(actor.id, 160)}`),
    hmacSha256Hex(auditKey, `draft:${clean(draft.text, 1800)}`),
  ]);
  const eventId = [
    "ci",
    action,
    clientHash.slice(0, 12),
    actorHash.slice(0, 12),
    draftHash.slice(0, 12),
    crypto.randomUUID(),
  ].join("_");
  const fields = {
    "Event ID": eventId,
    Action: ACTIONS[action],
    Result: "success",
  };

  const base = encodeURIComponent(clean(env.AIRTABLE_BASE_ID, 160));
  const table = encodeURIComponent(clean(env.AIRTABLE_TABLE_ACCESS_LOG || ACCESS_LOG_TABLE, 160));
  const airtable = env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP : { fetch };
  let response;
  try {
    response = await airtable.fetch(`https://api.airtable.com/v0/${base}/${table}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 5000)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ records: [{ fields }], typecast: false }),
    });
  } catch (_) {
    return json({ ok: false, error: "audit_write_failed" }, 502);
  }
  if (!response.ok) return json({ ok: false, error: "audit_write_failed" }, 502);
  await response.json().catch(() => ({}));

  return json({
    ok: true,
    schema: CLIENT_INTELLIGENCE_AUDIT_SCHEMA,
    action,
    audit_state: action === "copy" ? "copy_authorized" : "view_recorded",
    event_id: eventId,
    customer_delivery_attempted: false,
    business_truth_mutated: false,
  }, 201);
}

async function loadProjection(request, env, clientId) {
  const url = new URL(request.url);
  url.pathname = CLIENT_INTELLIGENCE_PATH;
  url.search = "";
  url.searchParams.set("client_id", clientId);
  const response = await handleClientIntelligenceRequest(new Request(url.toString(), {
    method: "GET",
    headers: { accept: "application/json" },
  }), env);
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.ok !== true) throw new Error("projection_unavailable");
  return payload;
}

function isSafeOperatorDraft(projection = {}, draft = {}) {
  const guardrails = draft.guardrails || {};
  const continuity = projection?.ai?.continuity_status || {};
  return projection?.identity?.status === "canonical"
    && projection?.identity?.verified === true
    && draft.schema === KENJI_CONTINUITY_OPERATOR_DRAFT_SCHEMA
    && draft.mode === "operator_draft"
    && draft.available === true
    && clean(draft.text, 1800).length > 0
    && draft.send_allowed === false
    && draft.requires_owner_review === true
    && guardrails.customer_auto_send === false
    && guardrails.business_truth_claims === false
    && guardrails.memory_is_context_only === true
    && continuity.source_status === "live"
    && continuity.freshness === "fresh"
    && continuity.context_only === true
    && continuity.live_truth_wins === true;
}

async function hmacSha256Hex(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(secret || "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(value || "")));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isRecordId(value) {
  return /^rec[A-Za-z0-9]{14}$/.test(clean(value));
}

function clean(value, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}

function firstText(...values) {
  return values.map((value) => clean(value, 5000)).find(Boolean) || "";
}

function normalizePath(pathname = "") {
  const value = String(pathname || "/").replace(/\/{2,}/g, "/");
  return value.length > 1 ? value.replace(/\/+$/g, "") : value;
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private",
      "x-content-type-options": "nosniff",
      "x-mmd-client-intelligence-audit": "operator-draft-v1",
      ...extraHeaders,
    },
  });
}

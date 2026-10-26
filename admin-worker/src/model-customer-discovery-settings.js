import { requireModelSession } from "./model-year6-wish.js";

export const MODEL_DISCOVERY_PATH = "/v1/model/settings/customer-visibility";
const BASE = "appsV1ILPRfIjkaYg";
const SESSIONS = "tblC98mKWbzmPuNzX";
const MODELS = "tblI4B0bI446vp9GX";
const MEMBERS = "tblgWc5VRon5o8Mhk";
const POLICY = "customer_discovery_policy_json";
const MODEL_LINK = "fldrXQAyOMPCvbOaY";
const SESSION_ID = "fldLTq2kZbyRv22IA";
const SESSION_MEMBER = "fldHsczyzr8axfwUC";
const SESSION_CLIENT = "fld6P6if0vDZCeV0C";
const MEMBER_CLIENTS = "fldlhDy68MDQgUihs";
const MEMBER_ID = "fld3hISS6bp1fjOQT";

export async function memberDiscoveryRef(memberId) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("mmd-discovery-member-v1:" + memberId));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
const json = (value, status = 200) => Response.json(value, { status, headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
const quote = value => '"' + String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';

export async function handleModelDiscoverySettings(request, env) {
  if (!["GET", "POST"].includes(request.method)) return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (!["https://mmdbkk.com", "https://www.mmdbkk.com"].includes(url.origin)
    || request.method === "POST" && origin !== url.origin) return json({ ok: false, error: "origin_not_allowed" }, 403);
  const auth = await requireModelSession(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
  const modelId = String(auth.payload?.model_record_id || "");
  if (!/^rec[a-zA-Z0-9]{10,}$/.test(modelId)) return json({ ok: false, error: "model_identity_required" }, 403);
  let body = {};
  if (request.method === "POST") {
    if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ ok: false, error: "json_required" }, 415);
    const text = await request.text();
    if (text.length > 2048) return json({ ok: false, error: "invalid_request" }, 400);
    try { body = JSON.parse(text); } catch { return json({ ok: false, error: "invalid_request" }, 400); }
    if (!body || Array.isArray(body) || Object.keys(body).some(key => !["action", "session_id", "revision"].includes(key))
      || !["block", "unblock"].includes(body.action) || typeof body.session_id !== "string"
      || !/^[A-Za-z0-9_.:-]{1,160}$/.test(body.session_id) || typeof body.revision !== "string") return json({ ok: false, error: "invalid_request" }, 400);
  }
  const namespace = env.MODEL_DISCOVERY_COORDINATOR;
  if (!namespace?.idFromName || !namespace?.get) return json({ ok: false, error: "privacy_controls_unavailable" }, 503);
  return namespace.get(namespace.idFromName(modelId)).fetch(new Request("https://model-discovery.internal/control", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ model_id: modelId, read_only: request.method === "GET", ...body }),
  }));
}

async function airtable(env, path, init = {}) {
  if (!env.AIRTABLE_API_KEY) throw new Error("storage_unavailable");
  const response = await fetch("https://api.airtable.com/v0/" + (env.AIRTABLE_BASE_ID || BASE) + path, {
    ...init, headers: { authorization: "Bearer " + env.AIRTABLE_API_KEY, "content-type": "application/json" },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("storage_unavailable");
  return response.json();
}
const linked = (value, id) => Array.isArray(value) && value.includes(id);

export async function applyModelDiscoverySettings(env, input) {
  try {
    const model = await airtable(env, "/" + MODELS + "/" + input.model_id);
    if (model.id !== input.model_id || /inactive|disabled|suspended|blocked|archived|retired/i.test(String(model.fields?.status || ""))) return json({ ok: false, error: "model_not_active" }, 403);
    const raw = model.fields?.[POLICY] || "";
    let policy = { schema_version: "model_customer_discovery_v1", require_verified_customer: false, blocked_member_refs: [], blocked_jobs: [] };
    if (raw) {
      try { policy = JSON.parse(raw); } catch { return json({ ok: false, error: "privacy_policy_requires_review" }, 409); }
      if (policy.schema_version !== "model_customer_discovery_v1" || !Array.isArray(policy.blocked_member_refs)
        || policy.blocked_member_refs.some(ref => !/^[a-f0-9]{64}$/.test(ref))) return json({ ok: false, error: "privacy_policy_requires_review" }, 409);
    }
    const revision = await memberDiscoveryRef(raw);
    const view = () => ({ ok: true, revision, blocked_count: policy.blocked_member_refs.length,
      blocked_session_ids: (policy.blocked_jobs || []).map(job => job.session_id) });
    if (input.read_only) return json(view());
    if (input.revision !== revision) return json({ ok: false, error: "privacy_settings_changed" }, 409);
    // The isolation flag is operator-owned. The Model cannot claim that old
    // public promotion and raw CDN assets have been withdrawn.
    if (model.fields?.discovery_asset_isolation_status !== "verified") return json({ ok: false, error: "legacy_assets_require_review" }, 409);
    const qs = new URLSearchParams({ filterByFormula: "{" + SESSION_ID + "}=" + quote(input.session_id), maxRecords: "2", returnFieldsByFieldId: "true" });
    const rows = await airtable(env, "/" + SESSIONS + "?" + qs);
    if (rows.records?.length !== 1) return json({ ok: false, error: "owned_session_required" }, 403);
    const f = rows.records[0].fields || {};
    if (!linked(f[MODEL_LINK], input.model_id) || !Array.isArray(f[SESSION_CLIENT]) || f[SESSION_CLIENT].length !== 1
      || typeof f[SESSION_MEMBER] !== "string" || !f[SESSION_MEMBER]) return json({ ok: false, error: "verified_customer_link_required" }, 409);
    const memberQuery = new URLSearchParams({ filterByFormula: "{" + MEMBER_ID + "}=" + quote(f[SESSION_MEMBER]), maxRecords: "2", returnFieldsByFieldId: "true" });
    const members = await airtable(env, "/" + MEMBERS + "?" + memberQuery);
    if (members.records?.length !== 1 || !linked(members.records[0].fields?.[MEMBER_CLIENTS], f[SESSION_CLIENT][0])) return json({ ok: false, error: "verified_customer_link_required" }, 409);
    const ref = await memberDiscoveryRef(f[SESSION_MEMBER]);
    const refs = new Set(policy.blocked_member_refs);
    if (input.action === "block") refs.add(ref); else refs.delete(ref);
    if (refs.size > 500) return json({ ok: false, error: "privacy_limit_reached" }, 409);
    const jobs = (Array.isArray(policy.blocked_jobs) ? policy.blocked_jobs : []).filter(job => job.member_ref !== ref);
    if (input.action === "block") jobs.push({ member_ref: ref, session_id: input.session_id });
    const next = JSON.stringify({ schema_version: "model_customer_discovery_v1", require_verified_customer: true,
      blocked_member_refs: [...refs], blocked_jobs: jobs, updated_at: new Date().toISOString(), updated_by: input.model_id });
    await airtable(env, "/" + MODELS + "/" + input.model_id, { method: "PATCH", body: JSON.stringify({ fields: { [POLICY]: next }, typecast: false }) });
    return json({ ok: true, revision: await memberDiscoveryRef(next), blocked_count: refs.size, blocked_session_ids: jobs.map(job => job.session_id) });
  } catch { return json({ ok: false, error: "privacy_controls_unavailable" }, 503); }
}

// One instance per canonical Model serializes source revision checks + writes.
// Airtable stays canonical; this object stores no customer or policy snapshot.
export class ModelDiscoveryCoordinator {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
  fetch(request) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const input = await request.json().catch(() => null);
      if (!input || !/^rec[a-zA-Z0-9]{10,}$/.test(input.model_id || "")) return json({ ok: false }, 400);
      return applyModelDiscoverySettings(this.env, input);
    });
  }
}

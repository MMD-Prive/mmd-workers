import { ownerGrantSubmittedFingerprint } from "./owner-private-job-grant-diagnostic.js";
import { isOwnerActor } from "./owner-my-mmd-recovery-diagnostic.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_ACCESS_LOG_TABLE = "System — Access Log";
const ACTION = "owner_private_job_grant";
const PENDING_REASON = "owner_approved_single_job_unconsumed";
const RESERVED_REASON = "owner_approved_single_job_reserved";
const CONSUMED_REASON = "owner_approved_single_job_consumed";

export const OWNER_PRIVATE_JOB_GRANT_CREATE_PATH = "/v1/admin/job/owner-grant";

function clean(value, max = 5000) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function token(value) {
  return clean(value, 200).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function formulaText(value) {
  return `"${clean(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private",
      "x-mmd-owner-job-grant": "create-v1",
    },
  });
}

function transport(env) {
  return env?.AIRTABLE_HTTP?.fetch
    ? (request, init) => env.AIRTABLE_HTTP.fetch(request, init)
    : (request, init) => fetch(request, init);
}

function airtableConfig(env = {}) {
  return {
    key: clean(env.AIRTABLE_API_KEY),
    base: clean(env.AIRTABLE_BASE_ID),
    table: clean(env.AIRTABLE_TABLE_ACCESS_LOG) || DEFAULT_ACCESS_LOG_TABLE,
  };
}

async function listExactGrants(env, target) {
  const { key, base, table } = airtableConfig(env);
  if (!key || !base || !target) return { ok: false, error: "owner_grant_store_not_ready", records: [] };

  const formula = [
    "AND(",
    `{Action}=${formulaText(ACTION)},`,
    `{Target}=${formulaText(target)},`,
    `{Result}=${formulaText("success")}`,
    ")",
  ].join("");
  const params = new URLSearchParams({ pageSize: "10", filterByFormula: formula });
  const url = `${AIRTABLE_API}/${base}/${encodeURIComponent(table)}?${params.toString()}`;
  const response = await transport(env)(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
  if (!response?.ok) return { ok: false, error: `owner_grant_store_read_${response?.status || 0}`, records: [] };
  const data = await response.json().catch(() => ({}));
  return {
    ok: true,
    records: (Array.isArray(data.records) ? data.records : []).map((record) => ({
      id: clean(record?.id, 80),
      reason: clean(record?.fields?.Reason, 160),
      target: clean(record?.fields?.Target),
    })),
  };
}

async function createGrant(env, fingerprint, body, actor) {
  const { key, base, table } = airtableConfig(env);
  if (!key || !base) return { ok: false, error: "owner_grant_store_not_ready" };

  const now = new Date().toISOString();
  const reasonCode = clean(body?.owner_grant_reason_code || body?.grant_reason_code, 120);
  const fields = {
    Action: ACTION,
    Target: fingerprint.target,
    Result: "success",
    "Created At (ISO)": now,
    "Source Ref": `create-job:owner-ui:${fingerprint.client_id}:${fingerprint.model_id}:${fingerprint.job_date}T${fingerprint.start_time}`,
    Reason: PENDING_REASON,
    Actor: clean(actor?.id, 80).toLowerCase() === "per" ? "Boss Per" : clean(actor?.id, 80) || "owner",
    "Identity Ref": `client:${fingerprint.client_id}`,
    "Before JSON": JSON.stringify({
      access_gate_error: reasonCode || null,
      grant_scope: "single_job",
      membership_mutation: false,
      entitlement_mutation: false,
    }).slice(0, 4000),
    "After JSON": JSON.stringify({
      state: "pending",
      grant_scope: "single_job",
      client_id: fingerprint.client_id,
      model_id: fingerprint.model_id,
      job_date: fingerprint.job_date,
      start_time: fingerprint.start_time,
      end_time: fingerprint.end_time,
      selected_private_folder: fingerprint.folder,
      selected_orientation: fingerprint.orientation,
      private_work: fingerprint.private_work,
      amount_thb: Number(fingerprint.amount_thb),
      model_payout_thb: Number(fingerprint.model_payout_thb),
      approved_at: now,
      approved_by: clean(actor?.id, 80) || "owner",
      membership_mutation: false,
      entitlement_mutation: false,
    }).slice(0, 4000),
  };

  const url = `${AIRTABLE_API}/${base}/${encodeURIComponent(table)}`;
  const response = await transport(env)(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.records?.[0]?.id) {
    return { ok: false, error: "owner_grant_store_write_failed", status: response.status || 503 };
  }
  return { ok: true, record_id: data.records[0].id, created_at: now };
}

export function isOwnerPrivateJobGrantCreateRequest(path, method) {
  return String(path || "").replace(/\/+$/g, "") === OWNER_PRIVATE_JOB_GRANT_CREATE_PATH
    && String(method || "").toUpperCase() === "POST";
}

export async function handleOwnerPrivateJobGrantCreate(request, env = {}, actor = null) {
  if (!isOwnerActor(actor)) return json({ ok: false, error: "owner_required" }, actor ? 403 : 401);

  const body = await request.clone().json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const visibility = token(
    body.job_visibility
    || body.visibility
    || body?.job_details?.world
    || body?.work?.job_visibility
    || body.work_type,
  );
  if (visibility && visibility !== "private") {
    return json({ ok: false, error: "owner_grant_private_only" }, 400);
  }

  const fingerprint = ownerGrantSubmittedFingerprint(body);
  if (!fingerprint.target) {
    return json({
      ok: false,
      error: "owner_grant_incomplete_job_fingerprint",
      required: [
        "client_id", "model_id", "job_date", "start_time", "end_time",
        "selected_private_folder", "selected_orientation", "private_work",
        "amount_thb", "model_payout_thb",
      ],
    }, 400);
  }
  if (!/^rec[A-Za-z0-9]{14,}$/.test(fingerprint.client_id)) {
    return json({ ok: false, error: "owner_grant_canonical_client_required" }, 400);
  }
  if (!/^rec[A-Za-z0-9]{14,}$/.test(fingerprint.model_id)) {
    return json({ ok: false, error: "owner_grant_canonical_model_required" }, 400);
  }

  const existing = await listExactGrants(env, fingerprint.target);
  if (!existing.ok) return json({ ok: false, error: existing.error }, 503);

  const pending = existing.records.find((record) => record.reason === PENDING_REASON);
  if (pending) {
    return json({
      ok: true,
      idempotent: true,
      grant_status: "pending",
      grant_record_id: pending.id,
      target: fingerprint.target,
      membership_mutation: false,
      entitlement_mutation: false,
    });
  }

  const used = existing.records.find((record) => [RESERVED_REASON, CONSUMED_REASON].includes(record.reason));
  if (used) {
    return json({
      ok: false,
      error: "owner_job_grant_already_used",
      grant_status: used.reason === CONSUMED_REASON ? "consumed" : "reserved",
    }, 409);
  }

  const created = await createGrant(env, fingerprint, body, actor);
  if (!created.ok) return json({ ok: false, error: created.error }, created.status || 503);

  return json({
    ok: true,
    idempotent: false,
    grant_status: "pending",
    grant_record_id: created.record_id,
    target: fingerprint.target,
    membership_mutation: false,
    entitlement_mutation: false,
  }, 201);
}

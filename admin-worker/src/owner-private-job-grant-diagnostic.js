const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_ACCESS_LOG_TABLE = "System — Access Log";
const ACTION = "owner_private_job_grant";
const PENDING_REASON = "owner_approved_single_job_unconsumed";

function clean(value, max = 5000) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function token(value) {
  return clean(value, 200).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function lane(value) {
  const v = token(value);
  if (v === "straight" || v === "gay" || v === "both") return v;
  if (v === "bi" || v === "all") return "both";
  return "";
}

function money(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return "";
  return String(Math.round((parsed + Number.EPSILON) * 100) / 100);
}

function formulaText(value) {
  return `"${clean(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function ownerGrantSubmittedFingerprint(body = {}) {
  const work = body?.work || {};
  const model = body?.model || {};
  const privateAccess = body?.private_access || {};
  const lineage = body?.client_lineage || {};
  const jobDetails = body?.job_details || {};
  const payment = body?.payment || {};

  const fields = {
    client_id: clean(body.client_id || lineage.client_id, 80),
    model_id: clean(model.model_id || body.model_id || body.model_record_id, 80),
    job_date: clean(body.job_date || jobDetails.job_date, 30),
    start_time: clean(body.start_time || jobDetails.start_time, 30),
    end_time: clean(body.end_time || jobDetails.end_time, 30),
    folder: token(privateAccess.selected_private_folder || work.model_folder || body.model_folder),
    orientation: lane(privateAccess.selected_orientation || model.selected_orientation || body.selected_orientation),
    private_work: token(work.job_type || work.private_work || body.job_type || jobDetails.private_work),
    amount_thb: money(body.service_amount_thb ?? body.amount_thb ?? payment.service_amount_thb ?? payment.amount_thb),
    model_payout_thb: money(body.pay_model_thb ?? body.model_payout_thb ?? body?.model_payout?.amount_thb),
  };

  const complete = Object.values(fields).every(Boolean);
  return {
    ...fields,
    target: complete
      ? [
          "jobgrant",
          "v1",
          fields.client_id,
          fields.model_id,
          fields.job_date,
          fields.start_time,
          fields.end_time,
          fields.folder,
          fields.orientation,
          fields.private_work,
          fields.amount_thb,
          fields.model_payout_thb,
        ].join(":")
      : "",
  };
}

export function parseOwnerGrantTarget(value = "") {
  const parts = clean(value).split(":");
  if (
    parts.length !== 14 ||
    parts[0] !== "jobgrant" ||
    parts[1] !== "v1" ||
    !parts[2] ||
    !parts[3]
  ) return null;

  return {
    client_id: parts[2],
    model_id: parts[3],
    job_date: parts[4],
    start_time: `${parts[5]}:${parts[6]}`,
    end_time: `${parts[7]}:${parts[8]}`,
    folder: parts[9],
    orientation: parts[10],
    private_work: parts[11],
    amount_thb: parts[12],
    model_payout_thb: parts[13],
    target: clean(value),
  };
}

function safeJobFields(fields = {}) {
  return {
    job_date: clean(fields.job_date, 30),
    start_time: clean(fields.start_time, 30),
    end_time: clean(fields.end_time, 30),
    folder: clean(fields.folder, 80),
    orientation: clean(fields.orientation, 80),
    private_work: clean(fields.private_work, 80),
    amount_thb: clean(fields.amount_thb, 80),
    model_payout_thb: clean(fields.model_payout_thb, 80),
  };
}

function mismatch(expected, received) {
  const names = [
    "job_date",
    "start_time",
    "end_time",
    "folder",
    "orientation",
    "private_work",
    "amount_thb",
    "model_payout_thb",
  ];
  return names.filter((name) => clean(expected?.[name]) !== clean(received?.[name]));
}

async function listPendingGrants(env, clientId, modelId) {
  const key = clean(env.AIRTABLE_API_KEY);
  const base = clean(env.AIRTABLE_BASE_ID);
  if (!key || !base || !clientId || !modelId) return [];

  const table = clean(env.AIRTABLE_TABLE_ACCESS_LOG) || DEFAULT_ACCESS_LOG_TABLE;
  const prefix = `jobgrant:v1:${clientId}:${modelId}:`;
  const formula = [
    "AND(",
    `{Action}=${formulaText(ACTION)},`,
    `{Result}=${formulaText("success")},`,
    `{Reason}=${formulaText(PENDING_REASON)},`,
    `SEARCH(${formulaText(prefix)},{Target}&"")=1`,
    ")",
  ].join("");

  const params = new URLSearchParams();
  params.set("pageSize", "10");
  params.set("filterByFormula", formula);
  const url = `${AIRTABLE_API}/${base}/${encodeURIComponent(table)}?${params.toString()}`;
  const transport = env.AIRTABLE_HTTP?.fetch
    ? (request, init) => env.AIRTABLE_HTTP.fetch(request, init)
    : (request, init) => fetch(request, init);

  const response = await transport(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
  if (!response?.ok) return [];
  const data = await response.json().catch(() => ({}));
  return (Array.isArray(data.records) ? data.records : [])
    .map((record) => ({
      id: clean(record?.id, 80),
      target: clean(record?.fields?.Target),
    }))
    .filter((record) => record.id && record.target.startsWith(prefix));
}

function responseJson(payload, status, sourceResponse) {
  const headers = new Headers(sourceResponse?.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store, private");
  headers.set("x-mmd-owner-job-grant-diagnostic", "v1");
  return new Response(JSON.stringify(payload), { status, headers });
}

function coreErrorCode(payload) {
  if (!payload || typeof payload !== "object") return "";
  if (typeof payload.error === "string") return clean(payload.error, 120);
  return clean(payload.error?.code || payload.error_code, 120);
}

export async function augmentOwnerJobGrantCreateError(request, response, env = {}) {
  if (!(response instanceof Response)) return response;
  if (request.method.toUpperCase() !== "POST") return response;

  let path = "";
  try {
    path = new URL(request.url).pathname.replace(/\/+$/g, "") || "/";
  } catch {
    return response;
  }
  if (path !== "/v1/admin/job/create") return response;
  if (response.ok) return response;

  const payload = await response.clone().json().catch(() => null);
  const code = coreErrorCode(payload);
  if (![
    "AUTHORITATIVE_MEMBER_NOT_FOUND",
    "private_eligibility_blocked",
    "private_folder_not_allowed",
  ].includes(code)) return response;

  const body = await request.clone().json().catch(() => null);
  if (!body || typeof body !== "object") return response;
  const submitted = ownerGrantSubmittedFingerprint(body);
  if (!submitted.client_id || !submitted.model_id) return response;

  const grants = await listPendingGrants(env, submitted.client_id, submitted.model_id);
  if (grants.length !== 1) return response;

  const expected = parseOwnerGrantTarget(grants[0].target);
  if (!expected) return response;

  if (submitted.target && submitted.target === expected.target) {
    return responseJson({
      ok: false,
      error: {
        code: "OWNER_JOB_GRANT_LOOKUP_INCONSISTENT",
        message: "The submitted job exactly matches the pending owner one-job grant, but the core entitlement gate did not consume it.",
        details: {
          expected: safeJobFields(expected),
          received: safeJobFields(submitted),
        },
      },
    }, 503, response);
  }

  const mismatchedFields = mismatch(expected, submitted);
  if (!mismatchedFields.length) return response;

  return responseJson({
    ok: false,
    error: {
      code: "OWNER_JOB_GRANT_MISMATCH",
      message: "A pending owner one-job grant exists for this Client and Model, but the submitted job does not match the approved fingerprint.",
      details: {
        mismatched_fields: mismatchedFields,
        expected: safeJobFields(expected),
        received: safeJobFields(submitted),
      },
    },
  }, 409, response);
}

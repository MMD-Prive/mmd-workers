const AIRTABLE_API = "https://api.airtable.com/v0";

export const MODEL_MONEY_POLICY_VERSION = "mmd_model_money_lane_v1_20260922";

export const ACTIVE_PUBLIC_MODEL_PACKAGE_KEYS = new Set([
  "pick_me_up",
  "airport_please",
  "wait_for_me",
  "half_day_with_him",
  "cook_with_me",
  "dinner_made_for_you",
  "market_to_table",
  "private_table",
]);

const MONEY_LANES = new Set(["public_model", "private_model", "needs_review"]);
const PRIVATE_VISIBILITY = new Set(["private", "private_model", "sigil"]);

function clean(value, max = 500) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function token(value) {
  return clean(value, 180)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function readObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function truthy(value) {
  if (value === true) return true;
  return ["true", "yes", "1", "confidential"].includes(token(value));
}

function explicitPrivateVisibility(body = {}) {
  const work = readObject(body.work);
  const details = readObject(body.job_details);
  return [
    work.job_visibility,
    body.job_visibility,
    body.booking_visibility,
    body.visibility,
    details.world,
  ].some((value) => PRIVATE_VISIBILITY.has(token(value)));
}

function confidentialHandling(body = {}) {
  const details = readObject(body.job_details);
  const disclosure = readObject(body.disclosure);
  return truthy(body.confidential) ||
    truthy(body.confidential_handling) ||
    truthy(details.confidential) ||
    token(disclosure.mode) === "confidential" ||
    token(body.visibility) === "confidential";
}

function explicitModelPackageCode(body = {}) {
  const money = readObject(body.model_money);
  const details = readObject(body.job_details);
  const publicJob = readObject(body.public_job);
  // Deliberately never read body.package_code: that field belongs to
  // Membership/access and must not become a model-service pricing authority.
  return token(
    body.model_package_code ||
    money.model_package_code ||
    money.package_code ||
    details.model_package_code ||
    publicJob.model_package_code,
  );
}

function requestUrl(value) {
  if (!value) return null;
  try {
    return value instanceof URL ? value : new URL(String(value));
  } catch {
    return null;
  }
}

export function resolveJobModelMoneyContext(body = {}, urlValue = "") {
  const input = readObject(body);
  const url = requestUrl(urlValue);
  const derivedLane = explicitPrivateVisibility(input) ? "private_model" : "public_model";
  const bodyLane = token(input.model_work_lane || readObject(input.model_money).lane);
  const queryLane = token(url?.searchParams.get("model_work_lane"));

  if (bodyLane && queryLane && bodyLane !== queryLane) {
    return { ok: false, status: 409, error: "model_work_lane_source_conflict" };
  }

  const explicitLane = bodyLane || queryLane;
  if (explicitLane && !MONEY_LANES.has(explicitLane)) {
    return { ok: false, status: 400, error: "model_work_lane_invalid" };
  }

  if (explicitLane && explicitLane !== "needs_review" && explicitLane !== derivedLane) {
    return {
      ok: false,
      status: 409,
      error: "model_work_lane_conflict",
      expected_lane: derivedLane,
    };
  }

  const modelWorkLane = explicitLane || derivedLane;
  const bodyPackageCode = explicitModelPackageCode(input);
  const queryPackageCode = token(url?.searchParams.get("model_package_code"));
  if (bodyPackageCode && queryPackageCode && bodyPackageCode !== queryPackageCode) {
    return { ok: false, status: 409, error: "model_package_source_conflict" };
  }
  const modelPackageCode = bodyPackageCode || queryPackageCode;

  if (modelWorkLane !== "public_model" && modelPackageCode) {
    return {
      ok: false,
      status: 409,
      error: "model_package_not_allowed_for_money_lane",
      money_lane: modelWorkLane,
    };
  }

  if (modelWorkLane === "public_model" && modelPackageCode && !ACTIVE_PUBLIC_MODEL_PACKAGE_KEYS.has(modelPackageCode)) {
    return {
      ok: false,
      status: 400,
      error: "public_model_package_not_active",
      model_package_code: modelPackageCode,
    };
  }

  return {
    ok: true,
    context: {
      policy_version: MODEL_MONEY_POLICY_VERSION,
      model_work_lane: modelWorkLane,
      model_package_code: modelWorkLane === "public_model" ? modelPackageCode : "",
      compensation_mode: modelWorkLane === "private_model"
        ? "case_locked"
        : modelWorkLane === "public_model" && modelPackageCode
          ? "public_package_matrix"
          : modelWorkLane === "public_model"
            ? "public_session_locked"
            : "review_required",
      confidential_handling: confidentialHandling(input) || truthy(url?.searchParams.get("confidential_handling")),
      confidential_is_money_lane: false,
    },
  };
}

function formulaValue(value) {
  return clean(value, 300).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function responseJson(response) {
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
}

export async function persistSessionModelMoneyContext(
  env = {},
  sessionId,
  context,
  { fetchImpl = globalThis.fetch } = {},
) {
  const session = clean(sessionId, 220);
  if (!session) return { ok: false, error: "session_id_missing" };
  if (!context || !MONEY_LANES.has(context.model_work_lane)) {
    return { ok: false, error: "model_money_context_invalid" };
  }

  const baseId = clean(env.AIRTABLE_BASE_ID, 100);
  const apiKey = clean(env.AIRTABLE_API_KEY, 5000);
  const table = clean(env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX", 200);
  if (!baseId || !apiKey || !table || typeof fetchImpl !== "function") {
    return { ok: false, error: "model_money_airtable_not_ready" };
  }

  const query = new URLSearchParams({
    maxRecords: "2",
    filterByFormula: `{session_id}="${formulaValue(session)}"`,
  });
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  const lookup = await fetchImpl(
    `${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}?${query.toString()}`,
    { headers },
  );
  const lookupBody = await lookup.json().catch(() => ({}));
  if (!lookup.ok) return { ok: false, error: "model_money_session_lookup_failed", status: lookup.status };

  const records = Array.isArray(lookupBody.records) ? lookupBody.records : [];
  if (records.length === 0) return { ok: false, error: "model_money_session_not_found" };
  if (records.length !== 1) return { ok: false, error: "model_money_session_ambiguous" };

  const recordId = clean(records[0]?.id, 100);
  if (!recordId) return { ok: false, error: "model_money_session_record_invalid" };

  const laneField = clean(env.AT_SESSIONS__MODEL_WORK_LANE || "model_work_lane", 160);
  const packageField = clean(env.AT_SESSIONS__MODEL_PACKAGE_CODE || "model_package_code", 160);
  const fields = {
    [laneField]: context.model_work_lane,
    // Clear a stale Public package whenever the Session is Private/review.
    [packageField]: context.model_work_lane === "public_model" ? clean(context.model_package_code, 160) : "",
  };

  const patch = await fetchImpl(
    `${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({ fields, typecast: false }),
    },
  );
  const patchBody = await patch.json().catch(() => ({}));
  if (!patch.ok) {
    return {
      ok: false,
      error: "model_money_session_patch_failed",
      status: patch.status,
      detail: clean(patchBody?.error?.message || patchBody?.error, 300),
    };
  }

  return {
    ok: true,
    record_id: patchBody.id || recordId,
    model_work_lane: context.model_work_lane,
    model_package_code: fields[packageField] || null,
    policy_version: context.policy_version,
  };
}

export function modelMoneyValidationResponse(result) {
  const status = Number(result?.status || 400);
  return new Response(JSON.stringify({
    ok: false,
    error: result?.error || "model_money_context_invalid",
    expected_lane: result?.expected_lane || undefined,
    money_lane: result?.money_lane || undefined,
    model_package_code: result?.model_package_code || undefined,
  }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private",
      "x-mmd-model-money": "validation-failed",
    },
  });
}

export async function attachModelMoneyContextToJobResponse(response, env, context) {
  if (!(response instanceof Response) || !context) return response;
  const payload = await responseJson(response);
  if (!response.ok || !payload || payload.ok !== true) return response;

  const sessionId = clean(payload.session_id || payload.sessionId, 220);
  const persistence = await persistSessionModelMoneyContext(env, sessionId, context).catch((error) => ({
    ok: false,
    error: clean(error?.message || error || "model_money_persist_failed", 200),
  }));

  const headers = new Headers(response.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store, private");
  headers.set("x-mmd-model-money-lane", context.model_work_lane);
  headers.set("x-mmd-model-money-context", persistence.ok ? "persisted" : "pending-reconciliation");

  payload.model_money = {
    policy_version: context.policy_version,
    model_work_lane: context.model_work_lane,
    model_package_code: context.model_package_code || null,
    compensation_mode: context.compensation_mode,
    confidential_handling: context.confidential_handling,
    confidential_is_money_lane: false,
    persistence_status: persistence.ok ? "persisted" : "pending_reconciliation",
    ...(persistence.ok ? {} : { reconciliation_reason: persistence.error || "unknown" }),
  };

  return new Response(JSON.stringify(payload), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

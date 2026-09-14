const LINE_API = "https://api.line.me/v2/bot";
const AIRTABLE_API = "https://api.airtable.com/v0";
const BASE_ID_DEFAULT = "appsV1ILPRfIjkaYg";
const CLIENTS_TABLE_DEFAULT = "tblVv58TCbwh5j1fS";
const SYNC_RUNS_TABLE_DEFAULT = "tbl2yGlf8XyswZ0Yw";
const SOURCE = "line_ofc_follower_sync_v1";
const REAL_LINE_USER_ID = /^U[0-9a-f]{32}$/i;
const MAX_FOLLOWERS = 100000;
const PROFILE_CONCURRENCY = 12;

const FIELDS = Object.freeze({
  clientName: "fldrHqkGQzvBLRxlP",
  username: "fldLYKquHMkgbOZ3U",
  mmdClientName: "fld7bPB3pWS2wteUU",
  nickname: "fldqPiCmuxLkXjy1P",
  lineUserId: "fld5HfSGChKFbd4uh",
  displayName: "fldb7vkM1FWswNm3l",
  source: "fldVblHUMiCnKTK42",
  channel: "fldE694L5TyVx3KSw",
  notes: "fldi31lnaFk9A9Xrp",
});

const RECEIPT_FIELDS = Object.freeze({
  runId: "fldPslfmr5YLuHeS0",
  status: "fldhRfMpXtzO9Bl69",
  startedAt: "fldTNx3KBlcRVf6Ja",
  completedAt: "fld4KQJOZTbIUJZCJ",
  supported: "fld42q3azGtqeE5fM",
  followersReturned: "fldxFTybctmJyJpln",
  pages: "fldSn6VbE4pGukL4p",
  clientsScanned: "fld9ZXM2dAqv7peCf",
  alreadyCanonical: "fldBPSFHSHvtPQ89Y",
  missingClients: "flddYCQqVq905f4zw",
  clientsCreated: "fldtUEyfkdmhT63VM",
  clientsUpdated: "fldrVfxd6E1Tpt6Ji",
  duplicateReview: "fld3EZzIntqLdBC8M",
  profilesRequested: "fldSBVnzU5TlSToHt",
  profileErrors: "fldrRKnpfEeE0S39E",
  reason: "fldbrfDSXL84FCj2W",
  source: "fldmTEC9kMdH8x5Jy",
});

function clean(value, max = 4000) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}

function lineToken(env = {}) {
  return clean(env.LINE_CHANNEL_ACCESS_TOKEN, 4096);
}

function airtableConfig(env = {}) {
  const token = clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 4096);
  const baseId = clean(env.AIRTABLE_BASE_ID || BASE_ID_DEFAULT, 80);
  const tableId = clean(env.AIRTABLE_TABLE_CLIENTS_ID || CLIENTS_TABLE_DEFAULT, 80);
  if (!token || !baseId || !tableId) throw new Error("airtable_config_missing");
  return { token, baseId, tableId };
}

function syncRunsTable(env = {}) {
  return clean(env.AIRTABLE_TABLE_LINE_OFC_SYNC_RUNS_ID || SYNC_RUNS_TABLE_DEFAULT, 80);
}

function placeholderName(lineUserId) {
  return `LINE-${clean(lineUserId, 80).slice(-8)}`;
}

function normalizeDisplayName(value, lineUserId) {
  const name = clean(value, 120).replace(/\s+/g, " ");
  return name || placeholderName(lineUserId);
}

function isBlank(value) {
  return !clean(value, 10000);
}

function chunks(items, size = 10) {
  const out = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : 0;
}

function receiptStatus(result = {}) {
  if (result.ok === false) return "failed";
  if (result.skipped) return "skipped";
  return "success";
}

function buildReceiptFields(runId, startedAt, result = {}) {
  const completedAt = clean(result.completed_at || new Date().toISOString(), 80);
  const reason = clean(result.reason || result.error, 180);
  const fields = {
    [RECEIPT_FIELDS.runId]: clean(runId, 120),
    [RECEIPT_FIELDS.status]: receiptStatus(result),
    [RECEIPT_FIELDS.startedAt]: clean(startedAt, 80),
    [RECEIPT_FIELDS.completedAt]: completedAt,
    [RECEIPT_FIELDS.supported]: result.supported === true,
    [RECEIPT_FIELDS.followersReturned]: numeric(result.followers_returned),
    [RECEIPT_FIELDS.pages]: numeric(result.pages),
    [RECEIPT_FIELDS.clientsScanned]: numeric(result.clients_scanned),
    [RECEIPT_FIELDS.alreadyCanonical]: numeric(result.already_canonical),
    [RECEIPT_FIELDS.missingClients]: numeric(result.missing_clients),
    [RECEIPT_FIELDS.clientsCreated]: numeric(result.clients_created),
    [RECEIPT_FIELDS.clientsUpdated]: numeric(result.clients_updated),
    [RECEIPT_FIELDS.duplicateReview]: numeric(result.duplicate_line_identity_review),
    [RECEIPT_FIELDS.profilesRequested]: numeric(result.profiles_requested),
    [RECEIPT_FIELDS.profileErrors]: numeric(result.profile_errors),
    [RECEIPT_FIELDS.source]: SOURCE,
  };
  if (reason) fields[RECEIPT_FIELDS.reason] = reason;
  return fields;
}

async function writeReceipt(env, fields) {
  const config = airtableConfig(env);
  const table = syncRunsTable(env);
  if (!table) throw new Error("line_ofc_sync_runs_table_missing");
  const response = await fetchWithRetry(`${AIRTABLE_API}/${config.baseId}/${table}?returnFieldsByFieldId=true`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ records: [{ fields }], typecast: false }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`airtable_sync_receipt_${response.status}:${clean(body?.error?.message || body?.error?.type || body, 180)}`);
  return body?.records?.[0]?.id || "";
}

async function finalizeResult(env, runId, startedAt, result = {}) {
  const completed = {
    ...result,
    started_at: clean(result.started_at || startedAt, 80),
    completed_at: clean(result.completed_at || new Date().toISOString(), 80),
  };
  try {
    const receiptId = await writeReceipt(env, buildReceiptFields(runId, startedAt, completed));
    return { ...completed, receipt_written: true, receipt_id_present: Boolean(receiptId) };
  } catch (error) {
    return {
      ...completed,
      receipt_written: false,
      receipt_error: clean(error?.message || error, 240),
    };
  }
}

async function fetchWithRetry(url, init = {}, { attempts = 4, allowed = [] } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response;
    try {
      response = await fetch(url, { ...init, signal: init.signal || AbortSignal.timeout(12000) });
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(Math.min(4000, 250 * 2 ** attempt));
      continue;
    }
    if (response.ok || allowed.includes(response.status)) return response;
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === attempts) return response;
    const retryAfter = Number(response.headers.get("retry-after") || 0) * 1000;
    await sleep(Math.max(retryAfter, Math.min(4000, 250 * 2 ** attempt)));
  }
  throw lastError || new Error("network_request_failed");
}

async function lineGet(env, path, search = {}, allowed = []) {
  const token = lineToken(env);
  if (!token) throw new Error("line_channel_access_token_missing");
  const url = new URL(`${LINE_API}${path}`);
  for (const [key, value] of Object.entries(search)) if (value !== "" && value != null) url.searchParams.set(key, String(value));
  const response = await fetchWithRetry(url.toString(), {
    method: "GET",
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  }, { allowed });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

export async function listLineFollowerIds(env = {}) {
  const ids = [];
  const seen = new Set();
  let start = "";
  let pages = 0;
  do {
    const { response, body } = await lineGet(env, "/followers/ids", { limit: 1000, start }, [403]);
    if (response.status === 403) {
      return {
        supported: false,
        reason: "followers_endpoint_requires_verified_or_premium_oa",
        follower_ids: [],
        pages,
      };
    }
    if (!response.ok) throw new Error(`line_followers_${response.status}:${clean(body?.message || body, 180)}`);
    pages += 1;
    const userIds = Array.isArray(body?.userIds) ? body.userIds : [];
    for (const raw of userIds) {
      const id = clean(raw, 80);
      if (!REAL_LINE_USER_ID.test(id) || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
      if (ids.length > MAX_FOLLOWERS) throw new Error("line_follower_guardrail_exceeded");
    }
    start = clean(body?.next, 1000);
    if (pages > 200) throw new Error("line_follower_pagination_guardrail_exceeded");
  } while (start);
  return { supported: true, follower_ids: ids, pages };
}

async function lineProfile(env, lineUserId) {
  const { response, body } = await lineGet(env, `/profile/${encodeURIComponent(lineUserId)}`, {}, [404]);
  if (response.status === 404) return { ok: false, status: 404, display_name: "" };
  if (!response.ok) return { ok: false, status: response.status, display_name: "" };
  return { ok: true, status: 200, display_name: clean(body?.displayName, 120) };
}

async function mapConcurrent(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      try { results[index] = await mapper(items[index], index); }
      catch (error) { results[index] = { error }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, () => worker()));
  return results;
}

async function airtableListClients(env = {}) {
  const config = airtableConfig(env);
  const records = [];
  let offset = "";
  do {
    const url = new URL(`${AIRTABLE_API}/${config.baseId}/${config.tableId}`);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("returnFieldsByFieldId", "true");
    for (const fieldId of Object.values(FIELDS)) url.searchParams.append("fields[]", fieldId);
    if (offset) url.searchParams.set("offset", offset);
    const response = await fetchWithRetry(url.toString(), {
      method: "GET",
      headers: { authorization: `Bearer ${config.token}`, accept: "application/json" },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`airtable_clients_${response.status}:${clean(body?.error?.message || body?.error?.type || body, 180)}`);
    records.push(...(Array.isArray(body?.records) ? body.records : []));
    offset = clean(body?.offset, 1000);
  } while (offset);
  return records;
}

async function airtableBatch(env, method, records) {
  if (!records.length) return [];
  const config = airtableConfig(env);
  const output = [];
  for (const batch of chunks(records, 10)) {
    const response = await fetchWithRetry(`${AIRTABLE_API}/${config.baseId}/${config.tableId}?returnFieldsByFieldId=true`, {
      method,
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ records: batch, typecast: false }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`airtable_clients_write_${response.status}:${clean(body?.error?.message || body?.error?.type || body, 180)}`);
    output.push(...(Array.isArray(body?.records) ? body.records : []));
    if (records.length > 10) await sleep(230);
  }
  return output;
}

function indexClientsByLine(records) {
  const map = new Map();
  for (const record of records) {
    const id = clean(record?.fields?.[FIELDS.lineUserId], 80);
    if (!REAL_LINE_USER_ID.test(id)) continue;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(record);
  }
  return map;
}

function newClientFields(lineUserId, displayName, profileStatus) {
  const name = normalizeDisplayName(displayName, lineUserId);
  return {
    [FIELDS.clientName]: name,
    [FIELDS.mmdClientName]: name,
    [FIELDS.nickname]: name,
    [FIELDS.lineUserId]: lineUserId,
    [FIELDS.displayName]: name,
    [FIELDS.source]: SOURCE,
    [FIELDS.channel]: "LINE OFC",
    [FIELDS.notes]: `[[LINE_OFC_FOLLOWER_SYNC_V1]] source=followers_api profile_status=${profileStatus}`,
  };
}

function existingClientPatch(record, lineUserId, displayName) {
  const current = record?.fields || {};
  const officialName = clean(displayName, 120).replace(/\s+/g, " ");
  const patch = {};
  if (officialName) {
    for (const fieldId of [FIELDS.clientName, FIELDS.mmdClientName, FIELDS.nickname, FIELDS.displayName]) {
      if (isBlank(current[fieldId])) patch[fieldId] = officialName;
    }
  }
  if (isBlank(current[FIELDS.lineUserId])) patch[FIELDS.lineUserId] = lineUserId;
  if (isBlank(current[FIELDS.source])) patch[FIELDS.source] = SOURCE;
  if (isBlank(current[FIELDS.channel])) patch[FIELDS.channel] = "LINE OFC";
  return patch;
}

export async function syncLineOfcFollowers(env = {}, options = {}) {
  const startedAt = new Date().toISOString();
  const runId = clean(options.run_id || `${SOURCE}_${startedAt}`, 120);
  if (!lineToken(env)) {
    return finalizeResult(env, runId, startedAt, {
      ok: false,
      skipped: true,
      supported: false,
      reason: "line_channel_access_token_missing",
    });
  }

  let followerSnapshot;
  try {
    followerSnapshot = await listLineFollowerIds(env);
  } catch (error) {
    return finalizeResult(env, runId, startedAt, {
      ok: false,
      supported: false,
      error: clean(error?.message || error, 240),
    });
  }

  if (!followerSnapshot.supported) {
    return finalizeResult(env, runId, startedAt, {
      ok: true,
      skipped: true,
      supported: false,
      reason: followerSnapshot.reason,
      pages: followerSnapshot.pages,
    });
  }

  try {
    const clients = await airtableListClients(env);
    const byLine = indexClientsByLine(clients);
    const duplicates = [];
    const missing = [];
    const existing = [];
    for (const lineUserId of followerSnapshot.follower_ids) {
      const matches = byLine.get(lineUserId) || [];
      if (matches.length > 1) duplicates.push(lineUserId);
      else if (matches.length === 1) existing.push({ lineUserId, record: matches[0] });
      else missing.push(lineUserId);
    }

    const profileTargets = [...missing, ...existing.filter(({ record }) => {
      const fields = record?.fields || {};
      return [FIELDS.clientName, FIELDS.mmdClientName, FIELDS.nickname, FIELDS.displayName].some((fieldId) => isBlank(fields[fieldId]));
    }).map(({ lineUserId }) => lineUserId)];
    const profileResults = await mapConcurrent([...new Set(profileTargets)], Number(options.profile_concurrency || PROFILE_CONCURRENCY), async (lineUserId) => ({
      lineUserId,
      profile: await lineProfile(env, lineUserId),
    }));
    const profiles = new Map();
    let profileErrors = 0;
    for (const item of profileResults) {
      if (!item || item.error) { profileErrors += 1; continue; }
      profiles.set(item.lineUserId, item.profile);
    }

    const creates = [];
    for (const lineUserId of missing) {
      const profile = profiles.get(lineUserId);
      const status = profile?.ok ? "ok" : profile?.status ? `http_${profile.status}` : "unavailable";
      creates.push({ fields: newClientFields(lineUserId, profile?.display_name || "", status) });
    }

    const updates = [];
    for (const { lineUserId, record } of existing) {
      const profile = profiles.get(lineUserId);
      const patch = existingClientPatch(record, lineUserId, profile?.display_name || "");
      if (Object.keys(patch).length) updates.push({ id: record.id, fields: patch });
    }

    const dryRun = options.dry_run === true;
    if (!dryRun) {
      await airtableBatch(env, "POST", creates);
      await airtableBatch(env, "PATCH", updates);
    }

    return finalizeResult(env, runId, startedAt, {
      ok: true,
      supported: true,
      dry_run: dryRun,
      followers_returned: followerSnapshot.follower_ids.length,
      pages: followerSnapshot.pages,
      clients_scanned: clients.length,
      already_canonical: existing.length,
      duplicate_line_identity_review: duplicates.length,
      missing_clients: missing.length,
      clients_created: dryRun ? 0 : creates.length,
      clients_create_planned: creates.length,
      clients_updated: dryRun ? 0 : updates.length,
      clients_update_planned: updates.length,
      profiles_requested: profileTargets.length,
      profile_errors: profileErrors,
      membership_mutation: false,
      entitlement_mutation: false,
      points_mutation: false,
      payment_mutation: false,
      job_mutation: false,
      session_mutation: false,
    });
  } catch (error) {
    return finalizeResult(env, runId, startedAt, {
      ok: false,
      supported: true,
      followers_returned: followerSnapshot.follower_ids.length,
      pages: followerSnapshot.pages,
      error: clean(error?.message || error, 240),
    });
  }
}

export const LINE_OFC_FOLLOWER_SYNC_INTERNALS = Object.freeze({
  FIELDS,
  RECEIPT_FIELDS,
  SOURCE,
  SYNC_RUNS_TABLE_DEFAULT,
  placeholderName,
  normalizeDisplayName,
  indexClientsByLine,
  newClientFields,
  existingClientPatch,
  buildReceiptFields,
  receiptStatus,
});

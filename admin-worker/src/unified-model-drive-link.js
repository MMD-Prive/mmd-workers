import { bindVerifiedModelLineClaim } from "./model-line-link-review.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
const MODELS_TABLE_DEFAULT = "Models";
const REMOTE_DRIVE_DIRECTORY = "https://member-pages-worker.malemodel-bkk.workers.dev";
const DRIVE_SEARCH_PATH = "/__internal/model-drive/search";
const DRIVE_RESOLVE_PATH = "/__internal/model-drive/resolve";

export const MODEL_LINE_LINK_MATERIALIZE_MODE = "materialize_drive_verified_claim";

export async function listUnifiedModelLineCandidates(env, url) {
  const q = clean(url?.searchParams?.get("q"), 120);
  const lane = normalizeLane(url?.searchParams?.get("lane"));
  if (!q) return { ok: true, count: 0, items: [], lane, sources: { airtable: true, drive: true } };

  const [airtable, drive] = await Promise.all([
    searchCanonicalModels(env, q, lane),
    searchDriveDirectory(env, q, lane),
  ]);

  if (!airtable.ok && !drive.ok) {
    return { ok: false, error: "model_candidate_lookup_unavailable", status: Math.max(airtable.status || 503, drive.status || 503) };
  }

  const airtableItems = airtable.ok ? airtable.items : [];
  const canonicalDriveIds = new Set(airtableItems.map((item) => item.drive_folder_id).filter(Boolean));
  const driveItems = drive.ok
    ? drive.items.filter((item) => item.drive_folder_id && !canonicalDriveIds.has(item.drive_folder_id))
    : [];
  const items = [...airtableItems, ...driveItems].slice(0, 30);

  return {
    ok: true,
    count: items.length,
    items,
    lane,
    sources: {
      airtable: airtable.ok,
      drive: drive.ok,
    },
    warning: !drive.ok ? "drive_directory_unavailable" : (!airtable.ok ? "airtable_models_unavailable" : ""),
  };
}

export async function materializeDriveAndBindVerifiedModelLineClaim(request, env, actor) {
  const body = await request.json().catch(() => null);
  if (!body || body.mode !== MODEL_LINE_LINK_MATERIALIZE_MODE) return json({ ok: false, error: "unsupported_mode" }, 400);
  if (body.confirm !== true) return json({ ok: false, error: "explicit_confirmation_required" }, 400);
  const allowedKeys = new Set(["mode", "claim_id", "drive_folder_id", "confirm"]);
  for (const key of Object.keys(body)) {
    if (!allowedKeys.has(key)) return json({ ok: false, error: "unsupported_fields" }, 400);
  }

  const claimId = clean(body.claim_id, 120);
  const driveFolderId = clean(body.drive_folder_id, 180);
  if (!/^model_line_[a-f0-9]{24}$/i.test(claimId)) return json({ ok: false, error: "claim_id_invalid" }, 400);
  if (!/^[A-Za-z0-9_-]{10,180}$/.test(driveFolderId)) return json({ ok: false, error: "drive_folder_id_invalid" }, 400);

  // Re-resolve exact folder server-side. Browser path/lane/name are never trusted.
  const drive = await resolveDriveDirectory(env, driveFolderId);
  if (!drive.ok || !drive.item) {
    return json({ ok: false, error: drive.error || "drive_folder_not_approved" }, drive.status || 409);
  }
  const folder = drive.item;
  const lane = normalizeLane(folder.lane);
  if (lane === "all") return json({ ok: false, error: "drive_folder_lane_unresolved" }, 409);

  const existing = await findCanonicalByDriveFolder(env, folder.drive_folder_id, folder.folder_scope_key);
  if (!existing.ok) return json({ ok: false, error: "canonical_model_lookup_unavailable" }, existing.status || 503);
  if (existing.records.length > 1) return json({ ok: false, error: "canonical_model_drive_conflict" }, 409);

  let modelRecordId = existing.records[0]?.id || "";
  let materialized = false;
  if (!modelRecordId) {
    const created = await createCanonicalModelFromDrive(env, folder, actor);
    if (!created.ok || !created.record?.id) {
      return json({ ok: false, error: created.error || "canonical_model_create_failed" }, created.status || 503);
    }
    modelRecordId = created.record.id;
    materialized = true;
  }

  const bindRequest = new Request(request.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mode: "bind_verified_claim",
      claim_id: claimId,
      model_record_id: modelRecordId,
      confirm: true,
    }),
  });
  const response = await bindVerifiedModelLineClaim(bindRequest, env, actor);
  if (!response.ok) return response;

  const payload = await response.clone().json().catch(() => ({}));
  return json({
    ...payload,
    ok: true,
    materialized,
    source: "drive",
    lane,
    folder_path: clean(folder.folder_path, 1200),
  }, response.status);
}

async function searchCanonicalModels(env, q, lane) {
  const escaped = escapeFormula(q);
  const formula = `OR(FIND(LOWER("${escaped}"),LOWER({working_name})),FIND(LOWER("${escaped}"),LOWER({nickname})),FIND(LOWER("${escaped}"),LOWER({folder_name})),FIND(LOWER("${escaped}"),LOWER({unique_key})))`;
  const result = await airtableList(env, modelsTable(env), formula, 40);
  if (!result.ok) return { ok: false, status: result.status || 503, items: [] };

  const items = result.records
    .map((record) => safeCanonicalModel(record))
    .filter((item) => item.working_name && laneAllows(item.lanes, lane))
    .slice(0, 24);
  return { ok: true, items };
}

function safeCanonicalModel(record) {
  const fields = record?.fields || {};
  const lanes = inferModelLanes(fields);
  const status = firstText(fields, ["status", "Status", "model_status", "Model Status"]);
  return {
    source: "airtable",
    materialized: true,
    model_record_id: clean(record?.id, 40),
    working_name: firstText(fields, ["working_name", "display_name", "Display Name", "nickname", "Nickname", "name", "Name"]),
    model_lookup_key: firstText(fields, ["model_lookup_key", "model_code", "Model Code", "unique_key"]),
    status,
    active: /^active$/i.test(status),
    lane: primaryModelLane(fields, lanes),
    lanes,
    folder_name: firstText(fields, ["folder_name"]),
    drive_folder_id: firstText(fields, ["drive_folder_id"]),
    drive_folder_url: firstText(fields, ["drive_folder_url"]),
    folder_path: firstText(fields, ["source_folder"]),
    folder_scope_key: firstText(fields, ["folder_scope_key"]),
  };
}

export function inferModelLanes(fields = {}) {
  const lanes = [];
  if (fields.can_work_public === true) lanes.push("public");
  if (fields.can_work_private === true) lanes.push("private");
  const salesLayer = firstText(fields, ["sales_layer"]).toLowerCase();
  const scope = firstText(fields, ["folder_scope_key"]).toLowerCase();
  const privateTier = firstText(fields, ["private_tier"]).toLowerCase();
  const exclusiveGroup = firstText(fields, ["exclusive_group"]).toLowerCase();
  if ((salesLayer.includes("public") || scope.startsWith("public:")) && !lanes.includes("public")) lanes.push("public");
  if ((salesLayer.includes("private") || salesLayer.includes("sigil") || scope.startsWith("private:")) && !lanes.includes("private")) lanes.push("private");
  if ((salesLayer.includes("exclusive") || scope.startsWith("exclusive:") || privateTier.includes("exclusive") || exclusiveGroup) && !lanes.includes("exclusive")) lanes.push("exclusive");
  if (scope.startsWith("exclusive:") && !lanes.includes("private")) lanes.push("private");
  if (salesLayer.includes("both")) {
    if (!lanes.includes("public")) lanes.push("public");
    if (!lanes.includes("private")) lanes.push("private");
  }
  return lanes;
}

function primaryModelLane(fields = {}, lanes = []) {
  const scope = firstText(fields, ["folder_scope_key"]).toLowerCase();
  if (scope.startsWith("exclusive:")) return "exclusive";
  if (scope.startsWith("public:")) return "public";
  if (scope.startsWith("private:")) return "private";
  if (lanes.includes("exclusive") && !lanes.includes("public")) return "exclusive";
  if (lanes.length === 1) return lanes[0];
  return lanes.length > 1 ? "both" : "";
}

async function searchDriveDirectory(env, q, lane) {
  const url = new URL(DRIVE_SEARCH_PATH, "https://model-drive-directory.internal");
  url.searchParams.set("q", q);
  url.searchParams.set("lane", lane);
  const response = await driveDirectoryFetch(env, url, { method: "GET" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) return { ok: false, status: response.status, error: clean(data.error, 120), items: [] };
  const items = Array.isArray(data.items) ? data.items.map(safeDriveCandidate).filter(Boolean) : [];
  return { ok: true, items };
}

async function resolveDriveDirectory(env, driveFolderId) {
  const url = new URL(DRIVE_RESOLVE_PATH, "https://model-drive-directory.internal");
  const body = JSON.stringify({ drive_folder_id: driveFolderId });
  const response = await driveDirectoryFetch(env, url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  const data = await response.json().catch(() => ({}));
  return response.ok && data.ok !== false
    ? { ok: true, item: safeDriveCandidate(data.item) }
    : { ok: false, status: response.status, error: clean(data.error, 120) || "drive_folder_not_approved" };
}

function safeDriveCandidate(item) {
  if (!item || !/^[A-Za-z0-9_-]{10,180}$/.test(clean(item.drive_folder_id, 180))) return null;
  const lane = normalizeLane(item.lane);
  if (lane === "all") return null;
  return {
    source: "drive",
    materialized: false,
    model_record_id: "",
    working_name: clean(item.folder_name, 240),
    model_lookup_key: clean(item.folder_scope_key, 300),
    status: "Drive only",
    active: false,
    lane,
    lanes: lane === "exclusive" ? ["exclusive", "private"] : [lane],
    folder_name: clean(item.folder_name, 240),
    drive_folder_id: clean(item.drive_folder_id, 180),
    drive_folder_url: safeHttpsUrl(item.drive_folder_url),
    folder_path: clean(item.folder_path, 1200),
    folder_scope_key: clean(item.folder_scope_key, 300),
  };
}

async function driveDirectoryFetch(env, internalUrl, init = {}) {
  if (env.MODEL_DRIVE_DIRECTORY && typeof env.MODEL_DRIVE_DIRECTORY.fetch === "function") {
    return env.MODEL_DRIVE_DIRECTORY.fetch(new Request(internalUrl.toString(), init));
  }

  const remoteUrl = new URL(`${internalUrl.pathname}${internalUrl.search}`, REMOTE_DRIVE_DIRECTORY);
  const method = String(init.method || "GET").toUpperCase();
  const body = typeof init.body === "string" ? init.body : "";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const bodyHash = await sha256Hex(body);
  const canonical = `${timestamp}\n${method}\n${remoteUrl.pathname}\n${remoteUrl.search}\n${bodyHash}`;
  const secret = clean(env.MODEL_DRIVE_DIRECTORY_SECRET || env.AIRTABLE_API_KEY, 6000);
  if (!secret) return json({ ok: false, error: "model_drive_directory_auth_unavailable" }, 503);
  const signature = await hmacHex(secret, canonical);
  const headers = new Headers(init.headers || {});
  headers.set("x-mmd-model-drive-ts", timestamp);
  headers.set("x-mmd-model-drive-signature", signature);
  headers.set("accept", "application/json");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    return await fetch(remoteUrl, { ...init, method, body: method === "GET" ? undefined : body, headers, signal: controller.signal });
  } catch {
    return json({ ok: false, error: "model_drive_directory_unavailable" }, 503);
  } finally {
    clearTimeout(timeout);
  }
}

async function findCanonicalByDriveFolder(env, driveFolderId, folderScopeKey) {
  const records = new Map();
  for (const formula of [
    `{drive_folder_id}="${escapeFormula(driveFolderId)}"`,
    folderScopeKey ? `{folder_scope_key}="${escapeFormula(folderScopeKey)}"` : "",
  ].filter(Boolean)) {
    const result = await airtableList(env, modelsTable(env), formula, 4);
    if (result.schemaError) continue;
    if (!result.ok) return { ok: false, status: result.status || 503, records: [] };
    for (const record of result.records) records.set(record.id, record);
  }
  return { ok: true, records: [...records.values()] };
}

async function createCanonicalModelFromDrive(env, folder, actor) {
  const lane = normalizeLane(folder.lane);
  const actorId = clean(actor?.id || actor?.email || "owner", 80) || "owner";
  const fields = {
    working_name: clean(folder.folder_name, 240),
    status: "Active",
    unique_key: `drive:${clean(folder.drive_folder_id, 180)}`,
    folder_name: clean(folder.folder_name, 240),
    drive_folder_id: clean(folder.drive_folder_id, 180),
    drive_folder_url: safeHttpsUrl(folder.drive_folder_url),
    source_folder: clean(folder.folder_path, 1200),
    raw_import_tag: "drive_lazy_materialized_v1",
    folder_scope_key: clean(folder.folder_scope_key, 300) || `${lane}:drive:${clean(folder.drive_folder_id, 180)}`,
    can_work_public: lane === "public",
    can_work_private: lane === "private" || lane === "exclusive",
  };

  const result = await airtableCreate(env, modelsTable(env), fields, true);
  if (!result.ok) return result;
  console.log(JSON.stringify({
    event: "model_drive_lazy_materialized",
    model_record_id: result.record?.id || "",
    drive_folder_id: fields.drive_folder_id,
    lane,
    actor: actorId,
  }));
  return result;
}

async function airtableList(env, table, formula, pageSize = 20) {
  const apiKey = clean(env.AIRTABLE_API_KEY, 6000);
  const baseId = clean(env.AIRTABLE_BASE_ID, 120);
  if (!apiKey || !baseId || !table) return { ok: false, status: 503, records: [] };
  const params = new URLSearchParams({ pageSize: String(pageSize), maxRecords: String(pageSize) });
  if (formula) params.set("filterByFormula", formula);
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}?${params}`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = JSON.stringify(data || {});
    return { ok: false, status: response.status, schemaError: response.status === 422 || /unknown field|invalid.*field/i.test(detail), records: [] };
  }
  return { ok: true, status: 200, records: Array.isArray(data.records) ? data.records : [] };
}

async function airtableCreate(env, table, fields, typecast = false) {
  const apiKey = clean(env.AIRTABLE_API_KEY, 6000);
  const baseId = clean(env.AIRTABLE_BASE_ID, 120);
  if (!apiKey || !baseId || !table) return { ok: false, status: 503 };
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ fields, typecast }),
  });
  const data = await response.json().catch(() => ({}));
  return response.ok
    ? { ok: true, status: 200, record: data }
    : { ok: false, status: response.status, error: clean(data?.error?.message || data?.error?.type || "canonical_model_create_failed", 240) };
}

function modelsTable(env) {
  return clean(env.AIRTABLE_TABLE_MODELS || MODELS_TABLE_DEFAULT, 120) || MODELS_TABLE_DEFAULT;
}

function laneAllows(lanes, lane) {
  const wanted = normalizeLane(lane);
  return wanted === "all" || (Array.isArray(lanes) && lanes.includes(wanted));
}

function normalizeLane(value) {
  const lane = clean(value, 20).toLowerCase();
  return lane === "public" || lane === "private" || lane === "exclusive" ? lane : "all";
}

function firstText(fields, names) {
  for (const name of names) {
    const value = fields?.[name];
    if (Array.isArray(value) && value.length) {
      const first = value[0];
      const text = first && typeof first === "object" ? clean(first.name || first.id || first.value) : clean(first);
      if (text) return text;
    } else if (value !== undefined && value !== null && clean(value)) return clean(value);
  }
  return "";
}

function safeHttpsUrl(value) {
  const raw = clean(value, 2048);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.href.slice(0, 2048) : "";
  } catch { return ""; }
}

function escapeFormula(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function hmacHex(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return bytesToHex(new Uint8Array(signature));
}

async function sha256Hex(data) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return bytesToHex(new Uint8Array(digest));
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function clean(value, max = 1000) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private",
    },
  });
}

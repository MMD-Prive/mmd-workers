const DRIVE_API = "https://www.googleapis.com/drive/v3";
const INTERNAL_HOST = "model-drive-directory.internal";
const SEARCH_PATH = "/__internal/model-drive/search";
const RESOLVE_PATH = "/__internal/model-drive/resolve";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const SIGNATURE_TTL_SECONDS = 90;

const DEFAULT_CATALOG_ROOT = "1RNN0aYwmvkKqACMAjRLYOJTFFFrlYycQ";
const DEFAULT_PUBLIC_ROOT = "1prgahujlFVILA1VrMKrJ327yZyOv44r6";
const DEFAULT_PRIVATE_ROOT = "1IfM1VbUygE_KNjmBoOa5QtM6teI0uu-8";

export const MODEL_DRIVE_DIRECTORY_HOST = INTERNAL_HOST;
export const MODEL_DRIVE_SEARCH_PATH = SEARCH_PATH;
export const MODEL_DRIVE_RESOLVE_PATH = RESOLVE_PATH;

export function isModelDriveDirectoryRequest(request) {
  if (!(request instanceof Request)) return false;
  let url;
  try { url = new URL(request.url); } catch { return false; }
  const routeMatches = (request.method === "GET" && url.pathname === SEARCH_PATH)
    || (request.method === "POST" && url.pathname === RESOLVE_PATH);
  if (!routeMatches) return false;
  return url.hostname === INTERNAL_HOST || url.hostname.endsWith(".workers.dev");
}

export async function handleModelDriveDirectoryRequest(request, env = {}) {
  if (!isModelDriveDirectoryRequest(request)) {
    return json({ ok: false, error: "not_found" }, 404);
  }
  const url = new URL(request.url);
  if (url.hostname !== INTERNAL_HOST && !(await verifySignedCaller(request, env))) {
    return json({ ok: false, error: "model_drive_directory_forbidden" }, 403);
  }
  if (!driveConfigured(env)) {
    return json({ ok: false, error: "model_drive_directory_not_configured" }, 503);
  }

  try {
    const accessToken = await googleDriveAccessToken(env);
    if (request.method === "GET") {
      const q = clean(url.searchParams.get("q"), 120);
      const lane = normalizeLane(url.searchParams.get("lane"));
      if (!q) return json({ ok: true, count: 0, items: [] });
      const items = await searchApprovedModelFolders(accessToken, q, lane, env);
      return json({ ok: true, count: items.length, items });
    }

    const body = await request.json().catch(() => null);
    const folderId = clean(body?.drive_folder_id, 160);
    if (!isDriveId(folderId)) return json({ ok: false, error: "drive_folder_id_invalid" }, 400);
    const resolved = await resolveApprovedModelFolder(accessToken, folderId, env);
    if (!resolved) return json({ ok: false, error: "drive_folder_not_approved" }, 404);
    return json({ ok: true, item: resolved });
  } catch (error) {
    console.error(JSON.stringify({
      event: "model_drive_directory_error",
      failure_class: failureClass(error),
    }));
    return json({ ok: false, error: "model_drive_directory_unavailable" }, 503);
  }
}

export async function searchApprovedModelFolders(accessToken, query, lane = "all", env = {}) {
  const q = clean(query, 120);
  if (!q) return [];
  const searchToken = driveSearchToken(q);
  if (!searchToken) return [];

  const url = new URL(`${DRIVE_API}/files`);
  url.searchParams.set("q", `mimeType='${FOLDER_MIME}' and trashed=false and name contains '${escapeDriveQuery(searchToken)}'`);
  url.searchParams.set("fields", "files(id,name,parents,mimeType,trashed),nextPageToken");
  url.searchParams.set("pageSize", "100");
  url.searchParams.set("spaces", "drive");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  url.searchParams.set("supportsAllDrives", "true");

  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || !Array.isArray(payload.files)) throw new Error("drive_model_search_failed");

  const wantedLane = normalizeLane(lane);
  const candidates = [];
  for (const file of payload.files.slice(0, 100)) {
    if (!file?.id || file.trashed === true || file.mimeType !== FOLDER_MIME) continue;
    const resolved = await resolveApprovedModelFolder(accessToken, file.id, env, file);
    if (!resolved) continue;
    if (wantedLane !== "all" && resolved.lane !== wantedLane) continue;
    resolved.score = modelNameScore(q, resolved.folder_name);
    candidates.push(resolved);
  }

  return candidates
    .filter((item) => item.score >= 0.28)
    .sort((a, b) => b.score - a.score || a.folder_name.localeCompare(b.folder_name))
    .slice(0, 24)
    .map(({ score, ...item }) => item);
}

export async function resolveApprovedModelFolder(accessToken, folderId, env = {}, seed = null) {
  if (!isDriveId(folderId)) return null;
  const roots = approvedRoots(env);
  const first = seed?.id === folderId ? sanitizeFile(seed) : await driveGetFolder(accessToken, folderId);
  if (!first) return null;

  const chain = [first];
  const visited = new Set([first.id]);
  let cursor = first;
  let matchedLane = "";
  let matchedRootId = "";

  for (let depth = 0; depth < 14; depth += 1) {
    const parentId = Array.isArray(cursor.parents) ? clean(cursor.parents[0], 160) : "";
    if (!parentId || visited.has(parentId)) break;
    if (parentId === roots.public) {
      matchedLane = "public";
      matchedRootId = parentId;
      const root = await driveGetFolder(accessToken, parentId);
      if (root) chain.push(root);
      break;
    }
    if (parentId === roots.private) {
      matchedLane = "private";
      matchedRootId = parentId;
      const root = await driveGetFolder(accessToken, parentId);
      if (root) chain.push(root);
      break;
    }
    if (parentId === roots.catalog) break;

    const parent = await driveGetFolder(accessToken, parentId);
    if (!parent) break;
    chain.push(parent);
    visited.add(parent.id);
    cursor = parent;
  }

  if (!matchedLane || !matchedRootId) return null;
  const path = [...chain].reverse().map((item) => item.name).filter(Boolean).join(" / ");
  return {
    source: "drive",
    materialized: false,
    lane: matchedLane,
    lanes: [matchedLane],
    drive_folder_id: first.id,
    folder_name: first.name,
    drive_folder_url: `https://drive.google.com/drive/folders/${encodeURIComponent(first.id)}`,
    folder_path: path,
    approved_root_id: matchedRootId,
    folder_scope_key: `${matchedLane}:drive:${first.id}`,
  };
}

function approvedRoots(env) {
  return {
    catalog: clean(env.DRIVE_MODEL_CATALOG_ROOT_FOLDER_ID || DEFAULT_CATALOG_ROOT, 160),
    public: clean(env.DRIVE_MODEL_PUBLIC_ROOT_FOLDER_ID || DEFAULT_PUBLIC_ROOT, 160),
    private: clean(env.DRIVE_MODEL_PRIVATE_ROOT_FOLDER_ID || DEFAULT_PRIVATE_ROOT, 160),
  };
}

async function driveGetFolder(accessToken, folderId) {
  const url = new URL(`${DRIVE_API}/files/${encodeURIComponent(folderId)}`);
  url.searchParams.set("fields", "id,name,parents,mimeType,trashed");
  url.searchParams.set("supportsAllDrives", "true");
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (response.status === 404) return null;
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) throw new Error("drive_model_folder_read_failed");
  if (payload.trashed === true || payload.mimeType !== FOLDER_MIME) return null;
  return sanitizeFile(payload);
}

function sanitizeFile(file) {
  return {
    id: clean(file?.id, 160),
    name: clean(file?.name, 240),
    parents: Array.isArray(file?.parents) ? file.parents.map((value) => clean(value, 160)).filter(Boolean).slice(0, 3) : [],
    mimeType: clean(file?.mimeType, 120),
    trashed: file?.trashed === true,
  };
}

function driveConfigured(env) {
  const roots = approvedRoots(env);
  return Boolean(
    clean(env.GOOGLE_DRIVE_CLIENT_ID, 500)
    && clean(env.GOOGLE_DRIVE_CLIENT_SECRET, 1000)
    && clean(env.GOOGLE_DRIVE_REFRESH_TOKEN, 5000)
    && roots.public
    && roots.private
  );
}

async function googleDriveAccessToken(env) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clean(env.GOOGLE_DRIVE_CLIENT_ID, 500),
      client_secret: clean(env.GOOGLE_DRIVE_CLIENT_SECRET, 1000),
      refresh_token: clean(env.GOOGLE_DRIVE_REFRESH_TOKEN, 5000),
      grant_type: "refresh_token",
    }),
  });
  const payload = await response.json().catch(() => null);
  const token = clean(payload?.access_token, 6000);
  if (!response.ok || !token) throw new Error("google_oauth_failed");
  return token;
}

async function verifySignedCaller(request, env) {
  const secret = clean(env.MODEL_DRIVE_DIRECTORY_SECRET || env.AIRTABLE_API_KEY, 6000);
  const timestamp = clean(request.headers.get("x-mmd-model-drive-ts"), 20);
  const supplied = clean(request.headers.get("x-mmd-model-drive-signature"), 200).toLowerCase();
  if (!secret || !/^\d{10,13}$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(supplied)) return false;
  const seconds = timestamp.length === 13 ? Math.floor(Number(timestamp) / 1000) : Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(Math.floor(Date.now() / 1000) - seconds) > SIGNATURE_TTL_SECONDS) return false;

  const url = new URL(request.url);
  const body = request.method === "POST" ? await request.clone().text() : "";
  const bodyHash = await sha256Hex(body);
  const canonical = `${timestamp}\n${request.method}\n${url.pathname}\n${url.search}\n${bodyHash}`;
  const expected = await hmacHex(secret, canonical);
  return timingSafeEqual(expected, supplied);
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

function timingSafeEqual(left, right) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

export function driveSearchToken(query) {
  const tokens = String(query || "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}_-]+/gu, " ")
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
  if (!tokens.length) return "";
  const meaningful = tokens.filter((value) => value.length >= 3);
  const pool = meaningful.length ? meaningful : tokens;
  return [...pool].sort((a, b) => b.length - a.length)[0].slice(0, 80);
}

export function modelNameScore(query, candidate) {
  const q = normalizeModelName(query);
  const c = normalizeModelName(candidate);
  if (!q || !c) return 0;
  if (q === c) return 1;
  if (c.includes(q) || q.includes(c)) return 0.88;
  const qTokens = q.split(" ").filter(Boolean);
  const cTokens = c.split(" ").filter(Boolean);
  if (qTokens.some((token) => token.length >= 3 && cTokens.includes(token))) return 0.74;
  const distance = levenshtein(q.replace(/ /g, ""), c.replace(/ /g, ""));
  return Math.max(0, 1 - distance / Math.max(q.length, c.length, 1));
}

function normalizeModelName(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[|]/g, "i")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  const left = Array.from(a);
  const right = Array.from(b);
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        diagonal + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return row[right.length];
}

function normalizeLane(value) {
  const lane = clean(value, 20).toLowerCase();
  return lane === "public" || lane === "private" ? lane : "all";
}

function isDriveId(value) {
  return /^[A-Za-z0-9_-]{10,180}$/.test(clean(value, 200));
}

function escapeDriveQuery(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function failureClass(error) {
  const message = clean(error?.message || error, 120);
  if (message === "google_oauth_failed") return "oauth_failed";
  if (message.startsWith("drive_")) return "drive_api_failed";
  return "unavailable";
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
      "x-mmd-model-drive-directory": "v1",
    },
  });
}

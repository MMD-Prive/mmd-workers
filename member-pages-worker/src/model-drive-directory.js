const DRIVE_API = "https://www.googleapis.com/drive/v3";
const INTERNAL_HOST = "model-drive-directory.internal";
const SEARCH_PATH = "/__internal/model-drive/search";
const RESOLVE_PATH = "/__internal/model-drive/resolve";
const PHOTO_PATH = "/__internal/model-drive/photo";
const CANONICAL_FILE_PATH = "/__internal/model-drive/canonical-file";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const SIGNATURE_TTL_SECONDS = 90;

const DEFAULT_CATALOG_ROOT = "1RNN0aYwmvkKqACMAjRLYOJTFFFrlYycQ";
const DEFAULT_PUBLIC_ROOT = "1pr8X4sk7A_5vPZxG5syp5fmgEs9fZF77";
const DEFAULT_PRIVATE_ROOT = "1IfEdWQ3hR-k1klfVJEtBgzWYRJCloRyr";
const DEFAULT_EXCLUSIVE_ROOT = "1j1NRB44PboVQR91M8-17Vb8kcCTCLS97";

export const MODEL_DRIVE_DIRECTORY_HOST = INTERNAL_HOST;
export const MODEL_DRIVE_SEARCH_PATH = SEARCH_PATH;
export const MODEL_DRIVE_RESOLVE_PATH = RESOLVE_PATH;
export const MODEL_DRIVE_PHOTO_PATH = PHOTO_PATH;
export const MODEL_DRIVE_CANONICAL_FILE_PATH = CANONICAL_FILE_PATH;
export const MODEL_DRIVE_EXCLUSIVE_ROOT_FOLDER_ID = DEFAULT_EXCLUSIVE_ROOT;

export function isModelDriveDirectoryRequest(request) {
  if (!(request instanceof Request)) return false;
  let url;
  try { url = new URL(request.url); } catch { return false; }
  const routeMatches = (request.method === "GET" && (url.pathname === SEARCH_PATH || url.pathname === PHOTO_PATH))
    || (request.method === "POST" && (url.pathname === RESOLVE_PATH || url.pathname === CANONICAL_FILE_PATH));
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
    if (request.method === "GET" && url.pathname === PHOTO_PATH) {
      const folderId = clean(url.searchParams.get("drive_folder_id"), 160);
      const fileName = clean(url.searchParams.get("file_name"), 240);
      if (!isDriveId(folderId)) return json({ ok: false, error: "drive_folder_id_invalid" }, 400);
      const resolved = await resolveApprovedModelFolder(accessToken, folderId, env);
      if (!resolved) return json({ ok: false, error: "drive_folder_not_approved" }, 404);
      return streamApprovedModelPhoto(accessToken, resolved.drive_folder_id, fileName);
    }
    if (request.method === "POST" && url.pathname === CANONICAL_FILE_PATH) {
      const body = await request.json().catch(() => null);
      const folderId = clean(body?.drive_folder_id, 160);
      const fileName = clean(body?.file_name, 240);
      if (!isDriveId(folderId)) return json({ ok: false, error: "drive_folder_id_invalid" }, 400);
      if (!fileName || /[\u0000-\u001f\u007f/\\]/.test(fileName)) return json({ ok: false, error: "drive_file_name_invalid" }, 400);
      // This path is intentionally separate from approved-root discovery. The caller
      // must already have canonical owner approval for the exact folder + filename.
      // It is only reachable through the internal service host (or a signed worker call).
      const folder = await driveGetFolder(accessToken, folderId);
      if (!folder) return json({ ok: false, error: "canonical_drive_folder_unavailable" }, 404);
      return streamApprovedModelPhoto(accessToken, folder.id, fileName, "google-drive-canonical-owner-approved");
    }
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
  // Score names before walking Drive parent chains. Broad tokens (for example
  // "Captain") can match many folders, while only the best 24 are worth resolving.
  const rankedFiles = payload.files
    .slice(0, 100)
    .filter((file) => file?.id && file.trashed !== true && file.mimeType === FOLDER_MIME)
    .map((file) => ({ file, score: modelNameScore(q, file.name) }))
    .filter((item) => item.score >= 0.28)
    .sort((a, b) => b.score - a.score || clean(a.file.name).localeCompare(clean(b.file.name)))
    .slice(0, 24);
  const resolvedRows = new Array(rankedFiles.length);
  let cursor = 0;
  const workerCount = Math.min(8, rankedFiles.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (cursor < rankedFiles.length) {
      const index = cursor++;
      const candidate = rankedFiles[index];
      const resolved = await resolveApprovedModelFolder(accessToken, candidate.file.id, env, candidate.file);
      if (!resolved || (wantedLane !== "all" && resolved.lane !== wantedLane)) continue;
      resolved.score = modelNameScore(q, resolved.folder_name);
      if (resolved.score >= 0.28) resolvedRows[index] = resolved;
    }
  }));
  const qualified = resolvedRows
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.folder_name.localeCompare(b.folder_name));

  return collapseDescendantsOfUniqueExactModelMatch(q, qualified)
    .slice(0, 24)
    .map(({ score, ...item }) => item);
}

export function collapseDescendantsOfUniqueExactModelMatch(query, candidates = []) {
  const rows = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
  const exact = rows.filter((item) => modelNameScore(query, item?.folder_name) === 1);

  let root = null;
  if (exact.length === 1) {
    root = exact[0];
  } else if (exact.length === 0) {
    // Drive folder display names may include the Model nickname while customer/admin
    // search uses only the Model code (for example query "EMs16", root "EMs16 Gohan").
    // In that case prefer a single strong, non-operational ancestor candidate, but
    // preserve fail-closed ambiguity when multiple genuine roots remain.
    const rootLike = rows.filter((item) => (
      modelNameScore(query, item?.folder_name) >= 0.74
      && !isOperationalModelChildFolderName(item?.folder_name)
    ));
    const topLevelRootLike = rootLike.filter((item) => (
      !rootLike.some((other) => other !== item && isDrivePathDescendant(item?.folder_path, other?.folder_path))
    ));
    if (topLevelRootLike.length === 1) root = topLevelRootLike[0];
  }

  if (!root) return rows;
  const rootPath = clean(root?.folder_path, 1400);
  if (!rootPath) return rows;

  return rows.filter((item) => {
    if (item === root || item?.drive_folder_id === root?.drive_folder_id) return true;
    return !isDrivePathDescendant(item?.folder_path, rootPath);
  });
}

function isDrivePathDescendant(candidatePath, ancestorPath) {
  const candidate = clean(candidatePath, 1400);
  const ancestor = clean(ancestorPath, 1400);
  return Boolean(candidate && ancestor && candidate.startsWith(`${ancestor} / `));
}

function isOperationalModelChildFolderName(value) {
  const name = normalizeModelName(value);
  if (!name) return false;
  return /^(?:review|media|archive|reference|approval|approved|pending|draft|asset|assets|private pic|private picture|private clip|private video)\b/.test(name);
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
    if (parentId === roots.exclusive) {
      matchedLane = "exclusive";
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
    exclusive: clean(env.DRIVE_MODEL_EXCLUSIVE_ROOT_FOLDER_ID || DEFAULT_EXCLUSIVE_ROOT, 160),
  };
}

async function streamApprovedModelPhoto(accessToken, folderId, exactFileName = "", sourceLabel = "google-drive-approved-root") {
  const file = exactFileName
    ? await findExactModelImage(accessToken, folderId, exactFileName)
    : await findFirstModelImage(accessToken, folderId);
  if (!file) return json({ ok: false, error: exactFileName ? "model_photo_exact_not_found" : "model_photo_not_found" }, 404);
  const url = new URL(`${DRIVE_API}/files/${encodeURIComponent(file.id)}`);
  url.searchParams.set("alt", "media");
  url.searchParams.set("supportsAllDrives", "true");
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!response.ok || !response.body) return json({ ok: false, error: "model_photo_read_failed" }, response.status || 503);
  const headers = new Headers({
    "cache-control": "no-store, private",
    "content-type": file.mimeType,
    "content-disposition": "inline",
    "x-content-type-options": "nosniff",
    "x-mmd-model-photo-source": sourceLabel,
  });
  return new Response(response.body, { status: 200, headers });
}

async function findFirstModelImage(accessToken, rootFolderId) {
  const queue = [{ id: rootFolderId, depth: 0 }];
  const visited = new Set();
  const images = [];
  while (queue.length && visited.size < 30) {
    const current = queue.shift();
    if (!current || visited.has(current.id)) continue;
    visited.add(current.id);
    const children = await driveListChildren(accessToken, current.id);
    for (const item of children) {
      if (item.mimeType === FOLDER_MIME && current.depth < 2) {
        queue.push({ id: item.id, depth: current.depth + 1 });
        continue;
      }
      if (/^image\/(?:jpeg|png|webp)$/i.test(item.mimeType || "")) images.push(item);
    }
    if (images.length) break;
  }
  return images.sort((a, b) => modelPhotoRank(a.name) - modelPhotoRank(b.name) || a.name.localeCompare(b.name))[0] || null;
}

export async function findExactModelImage(accessToken, rootFolderId, exactFileName) {
  const wanted = clean(exactFileName, 240);
  if (!wanted) return null;
  const queue = [{ id: rootFolderId, depth: 0 }];
  const visited = new Set();
  const matches = [];
  while (queue.length && visited.size < 30) {
    const current = queue.shift();
    if (!current || visited.has(current.id)) continue;
    visited.add(current.id);
    const children = await driveListChildren(accessToken, current.id);
    for (const item of children) {
      if (item.mimeType === FOLDER_MIME && current.depth < 2) {
        queue.push({ id: item.id, depth: current.depth + 1 });
        continue;
      }
      if (
        item.name === wanted &&
        /^image\/(?:jpeg|png|webp)$/i.test(item.mimeType || "")
      ) matches.push(item);
    }
  }
  if (matches.length > 1) throw new Error("drive_model_photo_exact_ambiguous");
  return matches[0] || null;
}

async function driveListChildren(accessToken, folderId) {
  const url = new URL(`${DRIVE_API}/files`);
  url.searchParams.set("q", `'${escapeDriveQuery(folderId)}' in parents and trashed=false`);
  url.searchParams.set("fields", "files(id,name,mimeType,parents,trashed)");
  url.searchParams.set("pageSize", "100");
  url.searchParams.set("spaces", "drive");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  url.searchParams.set("supportsAllDrives", "true");
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || !Array.isArray(payload.files)) throw new Error("drive_model_photo_list_failed");
  return payload.files.filter(item => item?.id && item.trashed !== true).map(sanitizeFile);
}

function modelPhotoRank(name) {
  const value = clean(name, 240).toLowerCase();
  if (/profile|cover|hero|main|primary|หน้าปก/.test(value)) return 0;
  if (/01|1\.|_1|front|face/.test(value)) return 1;
  return 5;
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
    && roots.exclusive
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
  return lane === "public" || lane === "private" || lane === "exclusive" ? lane : "all";
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

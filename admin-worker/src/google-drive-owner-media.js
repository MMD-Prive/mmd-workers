const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";
const DRIVE_READ_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const ALLOWED_MEDIA = new Map([
  ["image/jpeg", 15 * 1024 ** 2],
  ["image/png", 15 * 1024 ** 2],
  ["image/webp", 15 * 1024 ** 2],
  ["video/mp4", 25 * 1024 ** 2],
]);

function ownerDriveError(code, status = 503) {
  return Object.assign(new Error(code), { code, status });
}
function clean(value, max = 6000) {
  return String(value == null ? "" : value).trim().slice(0, max);
}
function driveId(value) {
  return /^[A-Za-z0-9_-]{10,180}$/.test(clean(value, 200));
}
function b64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function utf8B64url(value) {
  return b64url(new TextEncoder().encode(String(value)));
}
function pemToBytes(pem) {
  const raw = clean(pem, 20000)
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  if (!raw) throw ownerDriveError("owner_drive_service_account_invalid", 503);
  let binary;
  try { binary = atob(raw); } catch { throw ownerDriveError("owner_drive_service_account_invalid", 503); }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function serviceAccount(env) {
  let parsed;
  try {
    parsed = typeof env.GOOGLE_SERVICE_ACCOUNT_JSON === "string"
      ? JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON)
      : env.GOOGLE_SERVICE_ACCOUNT_JSON;
  } catch {
    throw ownerDriveError("owner_drive_service_account_invalid", 503);
  }
  const clientEmail = clean(parsed?.client_email, 1000);
  const privateKey = clean(parsed?.private_key, 20000);
  const tokenUri = clean(parsed?.token_uri || DEFAULT_TOKEN_URI, 2000);
  if (!clientEmail || !privateKey || !/^https:\/\//.test(tokenUri)) {
    throw ownerDriveError("owner_drive_service_account_missing", 503);
  }
  return { clientEmail, privateKey, tokenUri };
}

export async function ownerDriveAccessToken(env, http = fetch, nowMs = Date.now()) {
  const account = serviceAccount(env);
  const iat = Math.floor(nowMs / 1000);
  const header = utf8B64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = utf8B64url(JSON.stringify({
    iss: account.clientEmail,
    scope: DRIVE_READ_SCOPE,
    aud: account.tokenUri,
    iat,
    exp: iat + 3600,
  }));
  const unsigned = `${header}.${payload}`;
  let key;
  try {
    key = await crypto.subtle.importKey(
      "pkcs8",
      pemToBytes(account.privateKey),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } catch {
    throw ownerDriveError("owner_drive_service_account_invalid", 503);
  }
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(unsigned),
  );
  const assertion = `${unsigned}.${b64url(new Uint8Array(signature))}`;
  const response = await http(account.tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const body = await response.json().catch(() => null);
  const token = clean(body?.access_token, 10000);
  if (!response.ok || !token) throw ownerDriveError("owner_drive_oauth_failed", 503);
  return token;
}

async function listChildren(accessToken, folderId, http) {
  const rows = [];
  let pageToken = "";
  for (let page = 0; page < 20; page += 1) {
    const url = new URL(`${DRIVE_API}/files`);
    url.searchParams.set("q", `'${String(folderId).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}' in parents and trashed=false`);
    url.searchParams.set("fields", "files(id,name,mimeType,parents,trashed),nextPageToken");
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("spaces", "drive");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    url.searchParams.set("supportsAllDrives", "true");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await http(url, { headers: { authorization: `Bearer ${accessToken}` } });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body || !Array.isArray(body.files)) {
      throw ownerDriveError("owner_drive_file_list_failed", 503);
    }
    rows.push(...body.files.filter((item) => item?.id && item.trashed !== true));
    pageToken = clean(body.nextPageToken, 1000);
    if (!pageToken) break;
  }
  return rows;
}

export async function findExactOwnerApprovedDriveMedia(accessToken, folderId, fileName, http = fetch) {
  const rootId = clean(folderId, 180);
  const wanted = clean(fileName, 240);
  if (!driveId(rootId)) throw ownerDriveError("owner_drive_folder_invalid", 400);
  if (!wanted || /[\u0000-\u001f\u007f/\\]/.test(wanted)) throw ownerDriveError("owner_drive_file_name_invalid", 400);

  const queue = [{ id: rootId, depth: 0 }];
  const visited = new Set();
  const matches = [];
  while (queue.length && visited.size < 40) {
    const current = queue.shift();
    if (!current || visited.has(current.id)) continue;
    visited.add(current.id);
    const children = await listChildren(accessToken, current.id, http);
    for (const item of children) {
      if (item.mimeType === FOLDER_MIME && current.depth < 2) {
        queue.push({ id: item.id, depth: current.depth + 1 });
        continue;
      }
      if (item.name === wanted && ALLOWED_MEDIA.has(String(item.mimeType || ""))) matches.push(item);
    }
  }
  if (matches.length > 1) throw ownerDriveError("owner_drive_exact_file_ambiguous", 409);
  if (matches.length !== 1) throw ownerDriveError("owner_drive_exact_file_not_found", 404);
  return matches[0];
}

export async function readOwnerApprovedDriveMedia(env, { folderId, fileName }, http = fetch) {
  const accessToken = await ownerDriveAccessToken(env, http);
  const file = await findExactOwnerApprovedDriveMedia(accessToken, folderId, fileName, http);
  const mime = clean(file.mimeType, 120);
  const limit = ALLOWED_MEDIA.get(mime);
  if (!limit) throw ownerDriveError("owner_drive_media_type_invalid", 415);

  const url = new URL(`${DRIVE_API}/files/${encodeURIComponent(file.id)}`);
  url.searchParams.set("alt", "media");
  url.searchParams.set("supportsAllDrives", "true");
  const response = await http(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw ownerDriveError("owner_drive_media_read_failed", response.status === 404 ? 404 : 503);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > limit) throw ownerDriveError("owner_drive_media_size_invalid", 413);
  return { bytes, contentType: mime, source: "google-service-account-owner" };
}

import { readCredentialBoundAdminActor } from "./credential-bound-admin-session.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
export const CLIENT_PROFILE_PHOTO_SYNC_PATH = "/v1/admin/clients/profile-photo/sync";
const ALLOWED_ROLES = new Set(["owner", "admin", "super_admin", "superadmin"]);
const MAX_PROFILE_PHOTOS = 8;

function clean(value, max = 5000) {
  return String(value ?? "").trim().slice(0, max);
}

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private, max-age=0",
      "x-mmd-client-profile-photo": "rolling-8-v1",
    },
  });
}

function tableName(env = {}) {
  return clean(env.AIRTABLE_TABLE_CLIENTS_ID || env.AIRTABLE_TABLE_CLIENTS || "Clients", 160);
}

function attachmentUrls(value) {
  const out = [];
  const seen = new Set();
  for (const item of Array.isArray(value) ? value : []) {
    const url = clean(item?.url || item?.thumbnails?.large?.url || item?.thumbnails?.full?.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= MAX_PROFILE_PHOTOS) break;
  }
  return out;
}

function retainedAttachments(value, limit = MAX_PROFILE_PHOTOS) {
  const out = [];
  for (const item of Array.isArray(value) ? value : []) {
    if (!item || typeof item !== "object" || !clean(item.id, 160)) continue;
    // Airtable requires existing attachment objects to be passed back unchanged.
    out.push({ ...item });
    if (out.length >= limit) break;
  }
  return out;
}

async function airtableGet(env, clientId) {
  const response = await fetch(
    `${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(tableName(env))}/${encodeURIComponent(clientId)}`,
    {
      headers: {
        Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
        Accept: "application/json",
      },
    },
  );
  if (!response.ok) throw new Error(`airtable_get_${response.status}`);
  return response.json();
}

async function airtablePatch(env, clientId, fields) {
  const response = await fetch(
    `${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(tableName(env))}/${encodeURIComponent(clientId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ fields }),
    },
  );
  if (!response.ok) throw new Error(`airtable_patch_${response.status}`);
  return response.json();
}

async function readLineProfile(env, lineUserId) {
  const token = clean(env.LINE_CHANNEL_ACCESS_TOKEN, 10000);
  if (!token) return { ok: false, error: "line_profile_sync_unavailable" };
  const response = await fetch(
    `https://api.line.me/v2/bot/profile/${encodeURIComponent(lineUserId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    },
  );
  if (!response.ok) return { ok: false, error: `line_profile_http_${response.status}` };
  const body = await response.json().catch(() => ({}));
  const pictureUrl = clean(body?.pictureUrl, 3000);
  if (!/^https:\/\//i.test(pictureUrl)) return { ok: false, error: "line_profile_picture_missing" };
  return { ok: true, pictureUrl };
}

async function sha256Token(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 20);
}

export function isClientProfilePhotoSyncRequest(path, method) {
  const normalized = String(path || "/").replace(/\/+$/g, "") || "/";
  return normalized === CLIENT_PROFILE_PHOTO_SYNC_PATH && String(method || "GET").toUpperCase() === "POST";
}

export async function handleClientProfilePhotoSync(request, env = {}, actor = null) {
  const resolvedActor = actor || await readCredentialBoundAdminActor(request, env);
  if (!resolvedActor || !ALLOWED_ROLES.has(clean(resolvedActor.role, 80).toLowerCase())) {
    return json({ ok: false, error: "admin_session_required" }, 401);
  }
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
    return json({ ok: false, error: "client_photo_storage_not_ready" }, 503);
  }

  const body = await request.json().catch(() => ({}));
  const clientId = clean(body?.client_id, 160);
  if (!/^rec[A-Za-z0-9]{8,}$/.test(clientId)) {
    return json({ ok: false, error: "client_id_required" }, 400);
  }

  try {
    const record = await airtableGet(env, clientId);
    const fields = record?.fields || {};
    const existing = Array.isArray(fields["Profile Photo"]) ? fields["Profile Photo"] : [];
    const lineUserId = clean(fields.line_user_id, 160);
    if (!lineUserId) {
      return json({
        ok: true,
        synced: false,
        reason: "client_line_user_id_missing",
        client_id: clientId,
        profile_photos: attachmentUrls(existing),
      });
    }

    const line = await readLineProfile(env, lineUserId);
    if (!line.ok) {
      return json({
        ok: true,
        synced: false,
        reason: line.error,
        client_id: clientId,
        profile_photos: attachmentUrls(existing),
      });
    }

    const token = await sha256Token(line.pictureUrl);
    const filename = `line-profile-${token}.jpg`;
    const alreadyStored = existing.some((item) => clean(item?.filename, 500) === filename);

    if (alreadyStored) {
      if (existing.length > MAX_PROFILE_PHOTOS) {
        const trimmed = await airtablePatch(env, clientId, {
          "Profile Photo": retainedAttachments(existing, MAX_PROFILE_PHOTOS),
        });
        return json({
          ok: true,
          synced: true,
          added: false,
          trimmed: true,
          client_id: clientId,
          profile_photos: attachmentUrls(trimmed?.fields?.["Profile Photo"] || existing),
        });
      }
      return json({
        ok: true,
        synced: true,
        added: false,
        client_id: clientId,
        profile_photos: attachmentUrls(existing),
      });
    }

    const next = [
      { url: line.pictureUrl, filename },
      ...retainedAttachments(existing, MAX_PROFILE_PHOTOS - 1),
    ];
    const updated = await airtablePatch(env, clientId, { "Profile Photo": next });
    const updatedPhotos = updated?.fields?.["Profile Photo"] || [];

    return json({
      ok: true,
      synced: true,
      added: true,
      client_id: clientId,
      profile_photos: attachmentUrls(updatedPhotos),
      count: attachmentUrls(updatedPhotos).length,
    });
  } catch (error) {
    return json({
      ok: false,
      error: "client_profile_photo_sync_failed",
      detail: clean(error?.message || error, 180),
    }, 503);
  }
}

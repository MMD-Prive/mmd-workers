const PATH = "/__internal/member-drive/reconcile";
const ACTIVE_ROLES = new Set(["owner", "organizer", "fileOrganizer", "writer", "commenter", "reader"]);

export function isDriveReconcileRequest(request) {
  try { return request.method === "POST" && new URL(request.url).pathname === PATH; } catch { return false; }
}

export async function handleDriveReconcile(request, env = {}) {
  if (!authorized(request, env)) return json({ ok: false, error: "unauthorized" }, 401);
  const body = await request.json().catch(() => null);
  const email = normalizeEmail(body?.member_email);
  if (!email) return json({ ok: false, error: "member_email_required" }, 400);

  const actions = body?.actions && typeof body.actions === "object" ? body.actions : {};
  const source = primarySource(env);
  if (!source) return json({ ok: false, error: "drive_reconciler_not_configured" }, 503);
  const token = await accessToken(source).catch(() => "");
  if (!token) return json({ ok: false, error: "drive_oauth_failed" }, 503);

  const results = [];
  for (const layer of ["standard", "premium"]) {
    const folderId = layer === "standard" ? source.standard_folder_id : source.premium_folder_id;
    if (!folderId) {
      results.push({ layer, ok: false, action: "none", reason: "folder_not_configured" });
      continue;
    }
    const desired = actionForLayer(actions, layer);
    results.push(await reconcileFolder(token, folderId, email, desired));
  }
  const ok = results.every((item) => item.ok || item.action === "none");
  return json({ ok, authority: "my_mmd_entitlement_resolver_v1", results }, ok ? 200 : 409);
}

function actionForLayer(actions, layer) {
  if (Array.isArray(actions.grant) && actions.grant.includes(layer)) return "grant";
  if (Array.isArray(actions.retain) && actions.retain.includes(layer)) return "retain";
  if (Array.isArray(actions.revoke) && actions.revoke.includes(layer)) return "revoke";
  return "none";
}

async function reconcileFolder(token, folderId, email, action) {
  if (action === "none") return { layer: "", ok: true, action };
  const permissions = await listPermissions(token, folderId);
  const permission = permissions.find((p) => p.deleted !== true && normalizeEmail(p.emailAddress) === email && String(p.type || "").toLowerCase() === "user");
  const active = permission && ACTIVE_ROLES.has(String(permission.role || ""));

  if (action === "retain") return { ok: Boolean(active), action, permission_present: Boolean(active), folder_id: folderId };
  if (action === "grant") {
    if (active) return { ok: true, action: "retain", permission_present: true, folder_id: folderId };
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}/permissions?supportsAllDrives=true&sendNotificationEmail=false`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ type: "user", role: "reader", emailAddress: email }),
    });
    return { ok: response.ok, action, folder_id: folderId, http_status: response.status };
  }
  if (action === "revoke") {
    if (!permission?.id) return { ok: true, action, already_absent: true, folder_id: folderId };
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}/permissions/${encodeURIComponent(permission.id)}?supportsAllDrives=true`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    return { ok: response.ok || response.status === 404, action, folder_id: folderId, http_status: response.status };
  }
  return { ok: false, action, reason: "unsupported_action", folder_id: folderId };
}

async function listPermissions(token, folderId) {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}/permissions`);
  url.searchParams.set("fields", "permissions(id,type,emailAddress,role,deleted)");
  url.searchParams.set("supportsAllDrives", "true");
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(payload.permissions)) throw new Error("drive_permissions_failed");
  return payload.permissions;
}

function primarySource(env) {
  const source = {
    client_id: String(env.GOOGLE_DRIVE_CLIENT_ID || "").trim(),
    client_secret: String(env.GOOGLE_DRIVE_CLIENT_SECRET || "").trim(),
    refresh_token: String(env.GOOGLE_DRIVE_REFRESH_TOKEN || "").trim(),
    standard_folder_id: String(env.DRIVE_STANDARD_PACKAGE_FOLDER_ID || "").trim(),
    premium_folder_id: String(env.DRIVE_PREMIUM_PACKAGE_FOLDER_ID || "").trim(),
  };
  return source.client_id && source.client_secret && source.refresh_token ? source : null;
}

async function accessToken(source) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: source.client_id, client_secret: source.client_secret, refresh_token: source.refresh_token, grant_type: "refresh_token" }),
  });
  const payload = await response.json().catch(() => ({}));
  return response.ok ? String(payload.access_token || "").trim() : "";
}

function authorized(request, env) {
  const expected = String(env.AUTH_SERVICE_AUTH_TO_MEMBER_PAGES || "").trim();
  const actual = String(request.headers.get("x-mmd-auth-reconcile-secret") || "").trim();
  return Boolean(expected && actual && timingSafeEqual(expected, actual));
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}
function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

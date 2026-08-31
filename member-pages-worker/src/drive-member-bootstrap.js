const START_PATHS = new Set(["/member/api/liff/start", "/member/api/liff/start/"]);
const PURPOSE = "liff_drive_member_bootstrap";
const PREMIUM = "premium";
const STANDARD = "standard";
const ACTIVE_DRIVE_ROLES = new Set(["owner", "organizer", "fileOrganizer", "writer", "commenter", "reader"]);

export function packageAccessLayers(packageCode) {
  const normalized = String(packageCode || "").trim().toLowerCase();
  if (normalized === PREMIUM) return [STANDARD, PREMIUM];
  if (normalized === STANDARD) return [STANDARD];
  return [];
}

export function isDriveBootstrapCandidate(request, responsePayload) {
  if (!(request instanceof Request) || request.method !== "POST") return false;
  let path = "";
  try { path = new URL(request.url).pathname; } catch { return false; }
  if (!START_PATHS.has(path)) return false;
  const data = responsePayload && typeof responsePayload === "object" ? responsePayload.data : null;
  return responsePayload?.ok === true && data?.member_resolved === false && data?.pending_identity === true;
}

export async function tryDriveMemberBootstrap(request, env = {}) {
  if (!(request instanceof Request) || request.method !== "POST") return { mapped: false, reason: "not_start" };
  if (String(env.CARE_BACK_STAGING_MODE || "").toLowerCase() === "synthetic") {
    return { mapped: false, reason: "synthetic_staging" };
  }
  if (!driveBootstrapConfigured(env)) return { mapped: false, reason: "drive_not_configured" };

  const body = await request.clone().json().catch(() => null);
  const idToken = String(body?.id_token || body?.line_id_token || "").trim();
  if (!idToken) return { mapped: false, reason: "id_token_missing" };

  const verified = await verifyLineIdentityForDrive(idToken, env);
  if (!verified.ok) return { mapped: false, reason: verified.reason || "line_verify_failed" };
  if (!verified.email) {
    console.warn({ event: "drive_member_bootstrap_skipped", reason: "line_email_claim_missing" });
    return { mapped: false, reason: "line_email_claim_missing" };
  }

  let drivePackage;
  try {
    drivePackage = await resolveDrivePackageForEmail(verified.email, env);
  } catch (error) {
    console.warn({ event: "drive_member_bootstrap_failure", stage: "drive_permission_read", failure_class: safeFailureClass(error) });
    return { mapped: false, reason: "drive_unavailable" };
  }
  if (!drivePackage) return { mapped: false, reason: "drive_access_not_found" };

  const bootstrap = await callMemberBootstrap(env, {
    purpose: PURPOSE,
    line_user_id: verified.sub,
    email: verified.email,
    display_name: verified.name || "",
    package_code: drivePackage.package_code,
    drive_folder_id: drivePackage.folder_id,
    access_layers: packageAccessLayers(drivePackage.package_code),
  });
  if (!bootstrap.ok) {
    console.warn({ event: "drive_member_bootstrap_failure", stage: "member_materialization", failure_class: bootstrap.failure_class });
    return { mapped: false, reason: bootstrap.reason || "member_materialization_failed" };
  }

  return { mapped: true, package_code: drivePackage.package_code };
}

function driveBootstrapConfigured(env) {
  return Boolean(
    env.GOOGLE_DRIVE_CLIENT_ID
    && env.GOOGLE_DRIVE_CLIENT_SECRET
    && env.GOOGLE_DRIVE_REFRESH_TOKEN
    && env.DRIVE_PREMIUM_PACKAGE_FOLDER_ID
    && env.DRIVE_STANDARD_PACKAGE_FOLDER_ID
    && env.MEMBER_STATUS_RESOLVER?.fetch
    && env.MEMBER_STATUS_RESOLVER_SECRET
  );
}

async function verifyLineIdentityForDrive(idToken, env) {
  const channelIds = [env.LINE_DASHBOARD_CHANNEL_ID, env.LINE_LOGIN_CHANNEL_ID]
    .map((value) => String(value || "").trim())
    .filter((value, index, values) => value && values.indexOf(value) === index);
  if (!channelIds.length) return { ok: false, reason: "line_channel_missing" };

  for (const channelId of channelIds) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(env.LIFF_VERIFY_TIMEOUT_MS || 5000)));
    try {
      const response = await fetch(String(env.LINE_ID_TOKEN_VERIFY_URL || "https://api.line.me/oauth2/v2.1/verify"), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || typeof payload !== "object") continue;
      const sub = String(payload.sub || "").trim();
      const aud = String(payload.aud || "").trim();
      const exp = Number(payload.exp || 0);
      if (!sub || aud !== channelId || !Number.isFinite(exp) || exp * 1000 <= Date.now()) continue;
      return {
        ok: true,
        sub,
        email: normalizeEmail(payload.email),
        name: safeDisplayName(payload.name),
      };
    } catch (error) {
      if (error?.name === "AbortError") return { ok: false, reason: "line_verify_timeout" };
    } finally {
      clearTimeout(timeout);
    }
  }
  return { ok: false, reason: "line_verify_failed" };
}

export async function resolveDrivePackageForEmail(email, env = {}) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;
  const accessToken = await googleDriveAccessToken(env);
  await assertDriveAccount(accessToken, env);

  const premiumFolderId = String(env.DRIVE_PREMIUM_PACKAGE_FOLDER_ID || "").trim();
  const standardFolderId = String(env.DRIVE_STANDARD_PACKAGE_FOLDER_ID || "").trim();
  if (premiumFolderId && await folderAllowsEmail(accessToken, premiumFolderId, normalizedEmail)) {
    return { package_code: PREMIUM, folder_id: premiumFolderId };
  }
  if (standardFolderId && await folderAllowsEmail(accessToken, standardFolderId, normalizedEmail)) {
    return { package_code: STANDARD, folder_id: standardFolderId };
  }
  return null;
}

async function googleDriveAccessToken(env) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: String(env.GOOGLE_DRIVE_CLIENT_ID || ""),
      client_secret: String(env.GOOGLE_DRIVE_CLIENT_SECRET || ""),
      refresh_token: String(env.GOOGLE_DRIVE_REFRESH_TOKEN || ""),
      grant_type: "refresh_token",
    }),
  });
  const payload = await response.json().catch(() => null);
  const token = String(payload?.access_token || "").trim();
  if (!response.ok || !token) throw new Error("google_oauth_failed");
  return token;
}

async function assertDriveAccount(accessToken, env) {
  const expectedOwner = normalizeEmail(env.DRIVE_MEMBERSHIP_OWNER_EMAIL || "malemodel.bkk@gmail.com");
  const response = await fetch("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => null);
  const actual = normalizeEmail(payload?.user?.emailAddress);
  if (!response.ok || !actual) throw new Error("drive_about_failed");
  if (expectedOwner && actual !== expectedOwner) throw new Error("drive_owner_mismatch");
}

async function folderAllowsEmail(accessToken, folderId, email) {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}/permissions`);
  url.searchParams.set("fields", "permissions(type,emailAddress,role,deleted)");
  url.searchParams.set("supportsAllDrives", "true");
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || !Array.isArray(payload.permissions)) throw new Error("drive_permissions_failed");
  return payload.permissions.some((permission) => (
    permission
    && permission.deleted !== true
    && normalizeEmail(permission.emailAddress) === email
    && ACTIVE_DRIVE_ROLES.has(String(permission.role || ""))
    && String(permission.type || "").toLowerCase() === "user"
  ));
}

async function callMemberBootstrap(env, payload) {
  try {
    const response = await env.MEMBER_STATUS_RESOLVER.fetch(new Request("https://mmd-auth-worker.internal/__internal/member-drive/bootstrap", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mmd-member-resolver-secret": String(env.MEMBER_STATUS_RESOLVER_SECRET || ""),
      },
      body: JSON.stringify(payload),
    }));
    const data = await response.json().catch(() => null);
    if (response.ok && data?.ok === true) return { ok: true };
    return { ok: false, reason: String(data?.error?.code || "bootstrap_rejected"), failure_class: `upstream_${response.status}` };
  } catch {
    return { ok: false, reason: "bootstrap_unavailable", failure_class: "upstream_unavailable" };
  }
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function safeDisplayName(value) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

function safeFailureClass(error) {
  const message = String(error?.message || "");
  if (message === "drive_owner_mismatch") return "owner_mismatch";
  if (message === "google_oauth_failed") return "oauth_failed";
  if (message === "drive_permissions_failed" || message === "drive_about_failed") return "drive_api_failed";
  return "unavailable";
}

import {
  packageAccessLayers,
  resolveDrivePackageForEmail,
  resolveTrustedBootstrapEmail,
  tryDriveMemberBootstrap as tryLegacyDriveMemberBootstrap,
} from "./drive-member-bootstrap.js";

export { packageAccessLayers, resolveDrivePackageForEmail, resolveTrustedBootstrapEmail };

export function isDriveBootstrapCandidate(request, responsePayload, env = {}) {
  if (String(env.DRIVE_LEGACY_MEMBERSHIP_BOOTSTRAP_ENABLED || "").toLowerCase() !== "true") return false;
  if (!(request instanceof Request) || request.method !== "POST") return false;
  let path = "";
  try { path = new URL(request.url).pathname; } catch { return false; }
  if (path !== "/member/api/liff/start" && path !== "/member/api/liff/start/") return false;
  const data = responsePayload && typeof responsePayload === "object" ? responsePayload.data : null;
  return responsePayload?.ok === true && data?.member_resolved === false && data?.pending_identity === true;
}

export async function tryDriveMemberBootstrap(request, env = {}) {
  if (String(env.DRIVE_LEGACY_MEMBERSHIP_BOOTSTRAP_ENABLED || "").toLowerCase() !== "true") {
    return { mapped: false, reason: "drive_membership_source_disabled" };
  }
  return tryLegacyDriveMemberBootstrap(request, env);
}

import { isDriveBootstrapCandidate, tryDriveMemberBootstrap as legacyDriveBootstrap } from "./drive-member-bootstrap.js";

export { isDriveBootstrapCandidate };

export async function tryDriveMemberBootstrap(request, env = {}) {
  if (String(env.DRIVE_LEGACY_BOOTSTRAP_ENABLED || "").trim().toLowerCase() !== "true") {
    return { mapped: false, reason: "legacy_drive_source_disabled" };
  }
  return legacyDriveBootstrap(request, env);
}

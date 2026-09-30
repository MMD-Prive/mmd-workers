export const SVIP_PHOTO_REVEAL_MODE_HEADER = "x-mmd-svip-photo-reveal-mode";
export const SVIP_PHOTO_REVEAL_POLICY = "svip_exact_customer_photo_reveal_v1_20260930";

export function normalizeSvipPhotoRevealMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  return ["dry_run", "pilot", "live"].includes(mode) ? mode : "off";
}

export function svipPhotoRevealCanServe(value) {
  const mode = normalizeSvipPhotoRevealMode(value);
  return mode === "pilot" || mode === "live";
}

export function isSvipPhotoRevealGrantPayload(payload = {}) {
  return String(payload?.policy_version || "").trim() === SVIP_PHOTO_REVEAL_POLICY
    || String(payload?.authorization_basis || "").trim() === "active_svip_exact_customer_photo_reveal";
}

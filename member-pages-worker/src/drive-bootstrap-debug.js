const SAFE_BOOTSTRAP_REASONS = new Set([
  "not_start",
  "synthetic_staging",
  "drive_not_configured",
  "id_token_missing",
  "line_channel_missing",
  "line_verify_timeout",
  "line_verify_failed",
  "line_email_claim_missing",
  "drive_unavailable",
  "drive_access_not_found",
  "member_materialization_failed",
]);

export function driveBootstrapDiagnosticRef(request, bootstrap = {}) {
  if (!(request instanceof Request) || bootstrap?.mapped === true) return "";
  if (!isDebugRequest(request)) return "";

  const reason = String(bootstrap?.reason || "").trim().toLowerCase();
  if (!reason) return "DRIVE_BOOTSTRAP_OTHER";
  if (!SAFE_BOOTSTRAP_REASONS.has(reason)) return "DRIVE_BOOTSTRAP_OTHER";
  return `DRIVE_BOOTSTRAP_${reason.toUpperCase()}`;
}

function isDebugRequest(request) {
  try {
    const requestUrl = new URL(request.url);
    if (requestUrl.searchParams.get("debug") === "1") return true;

    const referer = String(request.headers.get("referer") || "").trim();
    if (!referer) return false;
    const refererUrl = new URL(referer);
    if (refererUrl.origin !== requestUrl.origin) return false;
    return refererUrl.searchParams.get("debug") === "1";
  } catch {
    return false;
  }
}

export function withDriveBootstrapDiagnostic(request, response, payload, bootstrap = {}) {
  if (!(response instanceof Response)) return response;
  const ref = driveBootstrapDiagnosticRef(request, bootstrap);
  if (!ref) return response;
  const data = payload && typeof payload === "object" && payload.data && typeof payload.data === "object"
    ? payload.data
    : null;
  if (!data) return response;

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(JSON.stringify({
    ...payload,
    data: {
      ...data,
      drive_bootstrap_diagnostic_ref: ref,
    },
  }), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

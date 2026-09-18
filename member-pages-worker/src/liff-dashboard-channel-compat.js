const LIFF_START_PATHS = new Set([
  "/member/api/liff/start",
  "/member/api/liff/start/",
]);

export function withDashboardLiffChannelCompatibility(request, env = {}) {
  if (!isLiffStartRequest(request)) return env;

  const legacyLoginChannel = String(env.LINE_LOGIN_CHANNEL_ID || "").trim();
  const dashboardChannel = String(env.LINE_DASHBOARD_CHANNEL_ID || "").trim();

  // The LIFF verifier already accepts the fixed server-owned Dashboard channel.
  // The older foundation guard still checks LINE_LOGIN_CHANNEL_ID, so alias the
  // Dashboard channel only when the legacy value is absent. This does not add a
  // new audience: approvedLineChannelIds() already includes the Dashboard id.
  if (legacyLoginChannel || !dashboardChannel) return env;

  return {
    ...env,
    LINE_LOGIN_CHANNEL_ID: dashboardChannel,
  };
}

function isLiffStartRequest(request) {
  if (!(request instanceof Request) || request.method !== "POST") return false;
  try {
    return LIFF_START_PATHS.has(new URL(request.url).pathname);
  } catch {
    return false;
  }
}

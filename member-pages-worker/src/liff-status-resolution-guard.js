const START_PATHS = new Set(["/member/api/liff/start", "/member/api/liff/start/"]);

const STATUS_UNRESOLVED_SCREEN = Object.freeze({
  key: "status_unresolved",
  copy: "ยังไม่พบข้อมูลสมาชิกที่เชื่อมกับ LINE นี้ครับ หากเคยเป็นสมาชิก กรุณาติดต่อ HYPE เพื่อเชื่อมข้อมูลก่อนใช้งาน My MMD หากยังไม่เคยเป็นสมาชิก สามารถเริ่มสมัครสมาชิกได้ด้านล่างครับ",
  actions: [
    {
      id: "signup",
      label: "ยังไม่เคยเป็นสมาชิก · สมัครสมาชิก",
      endpoint: "/member/api/liff/intent",
    },
  ],
});

export async function rewritePendingStatusStartResponse(request, response, traceId = "") {
  if (!(request instanceof Request) || !(response instanceof Response)) return response;
  if (request.method !== "POST") return response;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return response;
  }
  if (!START_PATHS.has(url.pathname)) return response;
  if (!response.ok || !String(response.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
    return response;
  }

  const payload = await response.clone().json().catch(() => null);
  const data = payload && typeof payload === "object" ? payload.data : null;
  const screen = data && typeof data === "object" && data.screen && typeof data.screen === "object"
    ? data.screen
    : null;

  if (
    payload?.ok !== true
    || data?.member_resolved !== false
    || data?.pending_identity !== true
    || (data?.next_screen_key !== "status_result" && screen?.key !== "status_result")
  ) {
    return response;
  }

  const debug = isSameOriginDiagnosticRequest(request);
  const diagnosticRef = debug ? safeDriveBootstrapDiagnosticRef(data?.drive_bootstrap_diagnostic_ref) : "";
  const safeTrace = debug ? safeLiffTraceId(traceId) : "";
  const refs = [safeTrace, diagnosticRef].filter(Boolean).join(" · ");
  const unresolvedScreen = refs
    ? { ...STATUS_UNRESOLVED_SCREEN, copy: `${STATUS_UNRESOLVED_SCREEN.copy}\nRef: ${refs}` }
    : STATUS_UNRESOLVED_SCREEN;

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(JSON.stringify({
    ...payload,
    data: {
      ...data,
      ...(safeTrace ? { liff_trace_id: safeTrace } : {}),
      next_screen_key: unresolvedScreen.key,
      screen: unresolvedScreen,
    },
  }), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isSameOriginDiagnosticRequest(request) {
  try {
    const requestUrl = new URL(request.url);
    if (requestUrl.searchParams.get("debug") === "1") return true;
    const refererValue = String(request.headers.get("referer") || "").trim();
    if (!refererValue) return false;
    const referer = new URL(refererValue);
    return referer.origin === requestUrl.origin && referer.searchParams.get("debug") === "1";
  } catch {
    return false;
  }
}

function safeDriveBootstrapDiagnosticRef(value) {
  const ref = String(value || "").trim();
  return /^DRIVE_BOOTSTRAP_[A-Z0-9_]{3,64}$/.test(ref) ? ref : "";
}

function safeLiffTraceId(value) {
  const ref = String(value || "").trim().toUpperCase();
  return /^LIFF-[A-F0-9]{12}$/.test(ref) ? ref : "";
}

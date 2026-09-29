const START_PATHS = new Set(["/member/api/liff/start", "/member/api/liff/start/"]);

const STATUS_UNRESOLVED_COPY = [
  "ยืนยัน LINE สำเร็จแล้ว",
  "กด Verify เพื่อให้ MMD ตรวจข้อมูลสมาชิกเดิมของคุณ",
].join("\n");

const STATUS_UNRESOLVED_SAFE_STATE = Object.freeze({
  line_verified: true,
  member_resolved: false,
  member_display_state: "review_required",
  entitlement_display_state: "review_required",
  points_display_state: "pending_backend",
  wallet_display_state: "pending_backend",
  history_display_state: "pending_backend",
  access_display_state: "fail_closed",
  private_access_state: "fail_closed",
  payment_truth_state: "pending_backend",
  browser_authority: "presentation_only",
  recovery_required_fields: ["email", "phone", "telegram_username", "member_id_candidate"],
  recovery_match_evidence: [
    "members_email",
    "members_member_id",
    "clients_email",
    "clients_phone",
    "clients_telegram_username",
    "pre_session_identity_seed",
    "client_access_evidence",
    "line_ofc_email_candidate",
    "line_ofc_phone_candidate",
    "line_ofc_telegram_candidate",
  ],
});

const STATUS_UNRESOLVED_SCREEN = Object.freeze({
  key: "status_unresolved",
  copy: STATUS_UNRESOLVED_COPY,
  actions: [
    {
      id: "recovery_evidence",
      label: "Verify",
      endpoint: "/member/api/liff/recovery",
      method: "POST",
      fields: ["email", "phone", "telegram_username", "member_id_candidate"],
    },
    {
      id: "signup",
      label: "สมัครสมาชิก",
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
  const safeState = unresolvedSafeState();

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(JSON.stringify({
    ...payload,
    data: {
      ...data,
      ...(safeTrace ? { liff_trace_id: safeTrace } : {}),
      next_screen_key: unresolvedScreen.key,
      screen: unresolvedScreen,
      my_mmd_safe_state: safeState,
      member_display_state: safeState.member_display_state,
      entitlement_display_state: safeState.entitlement_display_state,
      points_display_state: safeState.points_display_state,
      wallet_display_state: safeState.wallet_display_state,
      history_display_state: safeState.history_display_state,
      private_access_state: safeState.private_access_state,
      payment_truth_state: safeState.payment_truth_state,
      recovery_required_fields: safeState.recovery_required_fields,
      recovery_match_evidence: safeState.recovery_match_evidence,
    },
  }), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function unresolvedSafeState() {
  return { ...STATUS_UNRESOLVED_SAFE_STATE };
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

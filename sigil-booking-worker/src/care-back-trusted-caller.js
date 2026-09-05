const AIRTABLE_API = "https://api.airtable.com/v0";
const APPROVAL_PATH = "/__internal/care-back/approve-booking";
const SERVICE_HEADER = "x-mmd-sigil-booking-secret";
const LINE_ID_RE = /^U[0-9a-f]{32}$/i;

export async function attachCareBackApprovalToConfirmedBooking(request, env, response) {
  if (!response?.ok) return response;
  const payload = await response.clone().json().catch(() => null);
  if (payload?.ok !== true) return response;

  const body = await request.clone().json().catch(() => ({}));
  const bookingRef = clean(payload.booking_ref || body.booking_ref || body.request_id);
  const sessionId = clean(payload.session_id || body.session_id);
  const jobFormat = normalizeJobFormat(body.job_format);

  if (!jobFormat) {
    return merge(response, {
      care_back_approval: {
        status: "review_required",
        reason: "trusted_job_format_required",
        authority: "booking_confirm_server_only",
      },
    });
  }

  const row = await readBookingRequest(env, { bookingRef, sessionId }).catch(() => null);
  const fields = row?.fields || {};
  const lineUserId = clean(fields.line_or_member_id || fields.line_user_id || fields["LINE User ID"]);
  const modelLookup = clean(
    fields["Selected Model ID"] ||
    fields.resolved_model_key ||
    fields.selected_model_id ||
    fields["Selected Model Name"],
  );

  if (!LINE_ID_RE.test(lineUserId) || !modelLookup) {
    return merge(response, {
      care_back_approval: {
        status: "review_required",
        reason: !LINE_ID_RE.test(lineUserId) ? "canonical_line_identity_required" : "canonical_model_reference_required",
        authority: "booking_confirm_server_only",
      },
    });
  }

  const secret = clean(env.AUTH_SERVICE_SIGIL_BOOKING_TO_MEMBER_PAGES);
  if (secret.length < 32) {
    return merge(response, {
      care_back_approval: {
        status: "review_required",
        reason: "member_pages_service_auth_not_configured",
        authority: "booking_confirm_server_only",
      },
    });
  }

  const upstreamRequest = new Request(`https://member-pages-worker.internal${APPROVAL_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", [SERVICE_HEADER]: secret },
    body: JSON.stringify({
      booking_ref: bookingRef,
      session_id: sessionId,
      line_user_id: lineUserId,
      selected_model_id: modelLookup,
      job_format: jobFormat,
    }),
  });

  try {
    const upstream = env.MEMBER_PAGES_WORKER?.fetch
      ? await env.MEMBER_PAGES_WORKER.fetch(upstreamRequest)
      : await fetch(fallbackMemberPagesUrl(env), {
          method: "POST",
          headers: upstreamRequest.headers,
          body: await upstreamRequest.text(),
        });
    const approval = await upstream.json().catch(() => ({ ok: false, status: "unavailable", error: "invalid_member_pages_response" }));
    return merge(response, {
      care_back_approval: sanitizeApproval(approval, upstream.status),
    });
  } catch (error) {
    return merge(response, {
      care_back_approval: {
        status: "review_required",
        reason: "care_back_approval_upstream_unavailable",
        authority: "booking_confirm_server_only",
      },
    });
  }
}

async function readBookingRequest(env, { bookingRef, sessionId }) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID || (!bookingRef && !sessionId)) return null;
  const table = clean(env.AIRTABLE_TABLE_BOOKING_REQUESTS_ID || "tblQa2OK4U69eOCRF");
  const checks = [];
  if (bookingRef) checks.push(`{booking_ref}=${formulaText(bookingRef)}`, `{Request ID}=${formulaText(bookingRef)}`);
  if (sessionId) checks.push(`{session_id}=${formulaText(sessionId)}`);
  for (const formula of checks) {
    const qs = new URLSearchParams({ maxRecords: "1", pageSize: "1", filterByFormula: formula });
    const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}?${qs.toString()}`, {
      headers: { authorization: `Bearer ${env.AIRTABLE_API_KEY}`, accept: "application/json" },
    });
    if (!response.ok) continue;
    const data = await response.json().catch(() => ({}));
    if (data.records?.[0]) return data.records[0];
  }
  return null;
}

function sanitizeApproval(approval, httpStatus) {
  const status = ["approved", "not_applicable", "review_required", "unavailable"].includes(clean(approval?.status))
    ? clean(approval.status)
    : approval?.ok === true ? "approved" : "review_required";
  const result = {
    status,
    authority: clean(approval?.authority) || "care_back_backend_verified_booking_v1",
  };
  if (status === "approved") {
    result.model_level = clean(approval.model_level) || null;
    result.job_format = normalizeJobFormat(approval.job_format) || null;
    result.approved_discount_percent = Number.isFinite(Number(approval.approved_discount_percent)) ? Number(approval.approved_discount_percent) : null;
    result.activated_at = clean(approval.activated_at) || null;
    result.expires_at = clean(approval.expires_at) || null;
    result.single_use = approval.single_use === true;
  } else {
    result.reason = clean(approval?.error || approval?.reason) || `care_back_approval_http_${httpStatus}`;
  }
  return result;
}

async function merge(response, addition) {
  const payload = await response.clone().json().catch(() => ({}));
  const headers = new Headers(response.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify({ ...payload, ...addition }), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function fallbackMemberPagesUrl(env) {
  const base = clean(env.MEMBER_PAGES_WORKER_BASE_URL || "https://member-pages-worker.malemodel-bkk.workers.dev").replace(/\/+$/, "");
  return `${base}${APPROVAL_PATH}`;
}
function normalizeJobFormat(value) {
  const key = clean(value).toUpperCase();
  return key === "PN" || key === "VIP" ? key : "";
}
function formulaText(value) {
  return `"${clean(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
function clean(value) { return String(value ?? "").trim(); }

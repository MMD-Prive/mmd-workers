import { readCredentialBoundAdminActor } from "./credential-bound-admin-session.js";
import { paymentIssuerTransport, requestPaymentsConfirmLink } from "./payments-issuer-transport.js";

export const PAYMENT_ISSUER_DIAGNOSTIC_PATH = "/v1/admin/payment-issuer-diagnostic";
const ADMIN_ORIGINS = new Set(["https://mmdbkk.com", "https://www.mmdbkk.com"]);

export async function handlePaymentIssuerDiagnostic(request, env = {}) {
  const actor = await readCredentialBoundAdminActor(request, env);
  if (!actor) return json({ ok: false, stage: "admin_auth", error: "unauthorized" }, 401);
  if (!["admin", "owner"].includes(actor.role)) return json({ ok: false, stage: "admin_auth", error: "forbidden" }, 403);
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405, { Allow: "POST" });
  const origin = new URL(request.url).origin;
  if (!ADMIN_ORIGINS.has(origin) || request.headers.get("Origin") !== origin) {
    return json({ ok: false, error: "forbidden_origin" }, 403);
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 0) {
    return json({ ok: false, error: "diagnostic_empty_object_required" }, 400);
  }

  const transport = paymentIssuerTransport(env);
  let response;
  try {
    // Never forward caller fields, URLs, cookies or bearer credentials.
    // Canonical payments validation rejects this before any durable write.
    response = await requestPaymentsConfirmLink(env, {});
  } catch (error) {
    const configurationError = ["missing_AUTH_SERVICE_ADMIN_TO_PAYMENTS", "invalid_PAYMENTS_BASE_URL"].includes(error?.message);
    return json({ ok: false, transport, stage: configurationError ? "configuration" : "transport",
      error: configurationError ? error.message : "payments_worker_unreachable" }, 503);
  }
  const data = await response.json().catch(() => null);
  const status = response.status;
  if (status === 400 && data?.ok === false && data?.error === "client_name_required") {
    return json({ ok: true, transport, stage: "validation_reached", service_authenticated: true,
      upstream_status: status, upstream_error: "client_name_required", probe: "empty_confirm_link_request" });
  }

  // Project only known codes; never echo tokens, links, IDs or raw upstream data.
  const knownErrors = new Set(["service_auth_required", "airtable_not_ready", "invalid_confirm_link_request"]);
  const upstreamError = knownErrors.has(data?.error) ? data.error : "unexpected_response";
  const stage = status === 401 || status === 403 ? "service_auth"
    : status >= 300 && status < 400 ? "redirect_blocked"
    : status >= 500 ? "upstream_unavailable" : "unexpected_response";
  return json({ ok: false, transport, stage, upstream_status: status, upstream_error: upstreamError,
    error: response.ok ? "unexpected_success_for_empty_probe" : "payment_issuer_probe_failed" }, 502);
}

function json(body, status = 200, extraHeaders = {}) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...extraHeaders } });
}

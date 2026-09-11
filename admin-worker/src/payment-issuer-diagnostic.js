import { readCredentialBoundAdminActor } from "./credential-bound-admin-session.js";
import { paymentIssuerTransport, requestPaymentsConfirmLink } from "./payments-issuer-transport.js";

export const PAYMENT_ISSUER_DIAGNOSTIC_PATH = "/v1/admin/payment-issuer-diagnostic";
const ADMIN_ORIGINS = new Set(["https://mmdbkk.com", "https://www.mmdbkk.com"]);

export async function handlePaymentIssuerDiagnostic(request, env = {}) {
  const actor = await readCredentialBoundAdminActor(request, env);
  if (!actor) return json({ ok: false, stage: "admin_auth", error: "unauthorized" }, 401);
  if (!["admin", "owner"].includes(actor.role)) return json({ ok: false, stage: "admin_auth", error: "forbidden" }, 403);
  const origin = new URL(request.url).origin;
  if (!ADMIN_ORIGINS.has(origin)) return json({ ok: false, error: "forbidden_origin" }, 403);
  if (request.method === "GET") return diagnosticPage();
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405, { Allow: "GET, POST" });
  if (request.headers.get("Origin") !== origin) {
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

function diagnosticPage() {
  const nonce = crypto.randomUUID();
  return new Response(`<!doctype html><html lang="th"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Payment connection check · MMD Privé</title>
<style>body{margin:0;background:#11100e;color:#f5f1e8;font:16px/1.65 system-ui,sans-serif}main{max-width:640px;margin:10vh auto;padding:24px}h1{font-size:28px;line-height:1.3}p{color:#ccc5b9}button{padding:14px 20px;border:0;border-radius:12px;background:#dfc28c;color:#19140c;font:inherit;cursor:pointer}button:disabled{opacity:.6;cursor:default}pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:18px;border:1px solid #514737;border-radius:12px;font-size:14px}a{color:#dfc28c}</style>
<main><p>MMD PRIVÉ · PAYMENT</p><h1>ตรวจการเชื่อมต่อชำระเงิน</h1>
<p>ตรวจด้วยข้อมูลว่าง {} โดยไม่สร้างรายการชำระเงินหรือรัน Job</p>
<button id="probe" type="button">ตรวจการเชื่อมต่อ</button>
<pre id="result" role="status" aria-live="polite">พร้อมตรวจ · ยังไม่ได้ส่งคำขอ</pre>
<a href="/internal/admin/control-room">กลับ Control Room</a></main>
<script nonce="${nonce}">
document.getElementById('probe').addEventListener('click', async function () {
  this.disabled = true;
  const result = document.getElementById('result');
  result.textContent = 'กำลังตรวจ…';
  try {
    const response = await fetch('${PAYMENT_ISSUER_DIAGNOSTIC_PATH}', {
      method: 'POST', credentials: 'same-origin', redirect: 'error',
      headers: { 'Content-Type': 'application/json' }, body: '{}'
    });
    const data = await response.json();
    result.textContent = JSON.stringify({ http_status: response.status, ...data }, null, 2);
  } catch {
    result.textContent = 'ตรวจไม่สำเร็จ · ไม่ได้ส่งคำขอซ้ำ';
  }
});
</script></html>`, { headers: {
    "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  } });
}

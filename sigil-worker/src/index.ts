const OWNER_HEADER = "x-mmd-sigil-owner";
const BUILD_HEADER = "x-mmd-sigil-build";
const UPSTREAM_HEADER = "x-mmd-sigil-upstream";
const OWNER = "sigil-worker";
const DEFAULT_BUILD = "SIGIL_ROUTE_MIGRATION_V1";
const DEFAULT_UPSTREAM_BASE_URL = "https://immigrate-worker.malemodel-bkk.workers.dev";
const DEFAULT_ADMIN_NEXT = "/sigil/admin/jobs/create-session";
const SIGIL_ADMIN_LOGIN_PATH = "/sigil/admin/login";
const SIGIL_ADMIN_LOGIN_SESSION_PATH = "/sigil/admin/login/session";
const SIGIL_ADMIN_LOGIN_UI_BUILD = "SIGIL_ADMIN_LOGIN_UI_V2";
const SIGIL_APPLY_PATH = "/sigil/apply";
const SIGIL_MODEL_APPLY_PATH = "/sigil/model/apply";
const SIGIL_MODEL_APPLY_PRIVATE_PATH = "/sigil/model/apply/private-model";
const SIGIL_MODEL_APPLY_PRIVATE_RECEIVED_PATH = "/sigil/model/apply/private-model/received";
const SIGIL_PRIVATE_MODEL_APPLY_API_PATH = "/sigil/api/private-model/apply";
const SIGIL_PRIVATE_MODEL_APPLY_ENDPOINT = `https://sigil.mmdbkk.com${SIGIL_PRIVATE_MODEL_APPLY_API_PATH}`;
const SIGIL_LOGO_URL = "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a0f2cbc7e26b6735aee4cb2_SIGIL%20LOGO%20Transp.webp";
const SIGIL_LOGIN_BG_URL = "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a0802e10402165b8404527c_BPEWPRIVELogin.png";
const PRIVATE_MODEL_APPLY_ALLOWED_ORIGINS = new Set([
  "https://mmdbkk.com",
  "https://www.mmdbkk.com",
  "https://sigil.mmdbkk.com",
]);
const PRIVATE_MODEL_STANDARD_ALIASES = new Map([
  ["standard", "standard_private"],
  ["standard_private", "standard_private"],
  ["standard-private", "standard_private"],
  ["premium", "premium_private"],
  ["premium_private", "premium_private"],
  ["premium-private", "premium_private"],
  ["selective", "selective_case_by_case"],
  ["selective_case_by_case", "selective_case_by_case"],
  ["selective-case-by-case", "selective_case_by_case"],
]);

const PRIVATE_MODEL_SETUP_CSS = `#sigil-private-setup {
  --sps-ink: #fff4df;
  --sps-soft: rgba(255, 244, 223, 0.76);
  --sps-dim: rgba(255, 244, 223, 0.56);
  --sps-panel: rgba(17, 14, 10, 0.88);
  --sps-line: rgba(233, 193, 106, 0.22);
  --sps-line-strong: rgba(246, 213, 139, 0.54);
  --sps-gold: #ecc46f;
  width: 100%;
  min-height: 100vh;
  color: var(--sps-ink);
  background:
    radial-gradient(circle at 78% 14%, rgba(236, 196, 111, 0.18), transparent 30%),
    linear-gradient(135deg, #050403 0%, #0e0b08 52%, #1b1308 100%);
  font-family: "Avenir Next", Inter, "Noto Sans Thai", system-ui, sans-serif;
}
#sigil-private-setup,
#sigil-private-setup * { box-sizing: border-box; letter-spacing: 0; }
#sigil-private-setup :where(h1, h2, p, fieldset, legend) { margin: 0; }
#sigil-private-setup :where(input, textarea, button) { font: inherit; }
#sigil-private-setup .sps-shell {
  width: min(1180px, calc(100% - 28px));
  margin: 0 auto;
  padding: clamp(18px, 3vw, 34px) 0;
  display: grid;
  gap: 14px;
}
#sigil-private-setup .sps-hero,
#sigil-private-setup .sps-panel {
  border: 1px solid var(--sps-line);
  border-radius: 8px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.014)), var(--sps-panel);
  box-shadow: 0 28px 72px rgba(0, 0, 0, 0.34);
}
#sigil-private-setup .sps-hero {
  min-height: min(560px, 78vh);
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 0.36fr);
  gap: 18px;
  align-items: end;
  padding: clamp(22px, 4vw, 50px);
}
#sigil-private-setup .sps-hero-copy,
#sigil-private-setup .sps-context,
#sigil-private-setup .sps-form,
#sigil-private-setup .sps-form-head,
#sigil-private-setup .sps-field,
#sigil-private-setup .sps-fieldset,
#sigil-private-setup .sps-actions { display: grid; gap: 12px; }
#sigil-private-setup .sps-kicker,
#sigil-private-setup .sps-section-label,
#sigil-private-setup .sps-hero-note span {
  color: var(--sps-dim);
  font-size: 0.74rem;
  line-height: 1.35;
  font-weight: 850;
  text-transform: uppercase;
}
#sigil-private-setup h1 {
  max-width: 860px;
  color: var(--sps-ink);
  font-size: clamp(3rem, 8vw, 6.5rem);
  line-height: 0.94;
  font-weight: 900;
}
#sigil-private-setup h2 {
  color: var(--sps-ink);
  font-size: clamp(1.2rem, 2.5vw, 2rem);
  line-height: 1.1;
  font-weight: 850;
}
#sigil-private-setup .sps-lede,
#sigil-private-setup .sps-context p,
#sigil-private-setup .sps-hero-note p,
#sigil-private-setup .sps-field small,
#sigil-private-setup .sps-option small,
#sigil-private-setup .sps-consent,
#sigil-private-setup .sps-status {
  color: var(--sps-soft);
  font-size: clamp(0.96rem, 1.5vw, 1.12rem);
  line-height: 1.72;
}
#sigil-private-setup .sps-hero-note {
  min-height: 220px;
  display: grid;
  align-content: end;
  gap: 10px;
  padding: 20px;
  border: 1px solid var(--sps-line-strong);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.2);
}
#sigil-private-setup .sps-layout {
  display: grid;
  grid-template-columns: minmax(280px, 0.45fr) minmax(0, 0.75fr);
  gap: 14px;
  align-items: start;
}
#sigil-private-setup .sps-panel { padding: clamp(18px, 3vw, 28px); }
#sigil-private-setup .sps-context { position: sticky; top: 16px; }
#sigil-private-setup .sps-fieldset { padding: 0; border: 0; }
#sigil-private-setup label,
#sigil-private-setup legend {
  color: var(--sps-ink);
  font-size: 0.94rem;
  line-height: 1.45;
  font-weight: 800;
}
#sigil-private-setup .sps-contact-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
#sigil-private-setup input[type="text"],
#sigil-private-setup input[type="tel"],
#sigil-private-setup input[type="number"],
#sigil-private-setup textarea {
  width: 100%;
  min-height: 50px;
  border: 1px solid rgba(255, 255, 255, 0.13);
  border-radius: 8px;
  padding: 12px 14px;
  color: var(--sps-ink);
  background: rgba(0, 0, 0, 0.26);
  outline: none;
}
#sigil-private-setup textarea { min-height: 112px; resize: vertical; }
#sigil-private-setup input:focus,
#sigil-private-setup textarea:focus {
  border-color: var(--sps-line-strong);
  box-shadow: 0 0 0 3px rgba(236, 196, 111, 0.13);
}
#sigil-private-setup .sps-options { display: grid; gap: 10px; }
#sigil-private-setup .sps-option {
  min-height: 78px;
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.11);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.18);
  cursor: pointer;
}
#sigil-private-setup .sps-option:has(input:checked) {
  border-color: var(--sps-line-strong);
  background: rgba(236, 196, 111, 0.12);
}
#sigil-private-setup .sps-option input,
#sigil-private-setup .sps-consent input {
  width: 18px;
  height: 18px;
  accent-color: var(--sps-gold);
}
#sigil-private-setup .sps-option span,
#sigil-private-setup .sps-consent { display: grid; gap: 4px; }
#sigil-private-setup .sps-consent {
  grid-template-columns: 22px minmax(0, 1fr);
  align-items: start;
}
#sigil-private-setup .sps-hp {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  opacity: 0;
}
#sigil-private-setup .sps-button {
  width: 100%;
  min-height: 62px;
  border: 1px solid rgba(246, 213, 139, 0.8);
  border-radius: 8px;
  background: linear-gradient(135deg, #f5d58d, #bd8734);
  color: #171006;
  cursor: pointer;
  display: grid;
  gap: 2px;
  place-items: center;
  font-weight: 850;
}
#sigil-private-setup .sps-button small {
  color: rgba(23, 16, 6, 0.72);
  font-size: 0.78rem;
  font-weight: 750;
}
#sigil-private-setup .sps-button[disabled] { opacity: 0.55; cursor: not-allowed; }
#sigil-private-setup .sps-status.is-error { color: #ffaaa4; }
#sigil-private-setup .sps-status.is-ok { color: #a8e6ba; }
@media (max-width: 900px) {
  #sigil-private-setup .sps-hero,
  #sigil-private-setup .sps-layout { grid-template-columns: 1fr; }
  #sigil-private-setup .sps-context { position: relative; top: auto; }
}
@media (max-width: 640px) {
  #sigil-private-setup .sps-shell { width: min(100% - 16px, 1180px); }
  #sigil-private-setup h1 { font-size: clamp(2.6rem, 15vw, 4.1rem); }
  #sigil-private-setup .sps-contact-grid { grid-template-columns: 1fr; }
}`;

const PRIVATE_MODEL_SETUP_SCRIPT = `(function () {
  "use strict";
  var root = document.getElementById("sigil-private-setup");
  if (!root) return;
  var form = root.querySelector("[data-private-setup-form]");
  var status = root.querySelector("[data-private-setup-status]");
  if (!form) return;
  var endpoint = root.getAttribute("data-endpoint") || "https://sigil.mmdbkk.com/sigil/api/private-model/apply";
  var dashboardUrl = root.getAttribute("data-dashboard-url") || "/sigil/model/apply/private-model/received";
  function clean(value) { return String(value || "").trim(); }
  function field(name) { return form.elements[name]; }
  function value(name) { var input = field(name); return input ? clean(input.value) : ""; }
  function setStatus(message, tone) {
    if (!status) return;
    status.textContent = message || "";
    status.classList.toggle("is-error", tone === "error");
    status.classList.toggle("is-ok", tone === "ok");
  }
  function selectedStandard() {
    var selected = form.querySelector('input[name="private_standard"]:checked');
    return selected ? selected.value : "";
  }
  function setSubmitting(isSubmitting) {
    var button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = isSubmitting;
  }
  function payload() {
    var rate = Number(value("minimum_rate_thb"));
    var nickname = value("nickname");
    return {
      application_type: "private_model",
      source: "sigil_private_model_setup",
      handler: "TarT",
      parent_brand: "MMD PRIVÉ",
      layer: "SIGIL",
      privacy_level: "private",
      work_type: "private_model",
      nickname: nickname,
      working_name: nickname,
      age: 18,
      phone: value("phone"),
      telegram_username: value("telegram_username"),
      line_id: value("line_id"),
      private_standard: selectedStandard(),
      minimum_rate_thb: Number.isFinite(rate) ? rate : 0,
      private_note: value("private_note"),
      consent: Boolean(field("consent") && field("consent").checked),
      website: value("website"),
      page_url: window.location.href.split("?")[0],
      language: "th",
      timezone: "Asia/Bangkok",
      form_version: "sigil_private_setup_lvmax_20260523"
    };
  }
  function validate(data) {
    if (!data.nickname) return "ขอชื่อที่ให้ต้าเรียกก่อนครับ";
    if (!(data.phone || data.telegram_username || data.line_id)) return "ขอช่องทางติดต่ออย่างน้อย 1 ช่องทางครับ";
    if (!data.private_standard) return "ขอเลือก private standard ก่อนครับ";
    if (!data.minimum_rate_thb || data.minimum_rate_thb < 0) return "ขอ minimum rate ที่รับได้จริงก่อนครับ";
    if (!data.consent) return "ขอให้ยืนยัน consent ก่อนส่งข้อมูลให้ต้าอ่านต่อครับ";
    return "";
  }
  function redirectTarget(applicationId) {
    var target = new URL(dashboardUrl, window.location.origin);
    if (applicationId) target.searchParams.set("application_id", applicationId);
    target.searchParams.set("source", "private_setup");
    return target.toString();
  }
  function readJson(response) {
    return response.json().catch(function () { return {}; }).then(function (data) {
      if (!response.ok || data.ok === false) throw new Error(data.error || data.message || "submit_failed");
      return data;
    });
  }
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (value("website")) return;
    var data = payload();
    var error = validate(data);
    if (error) { setStatus(error, "error"); return; }
    setSubmitting(true);
    setStatus("ต้าได้รับข้อมูลแล้วครับ กำลังพาไปหน้ารับข้อมูล...");
    fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data)
    }).then(readJson).then(function (result) {
      setStatus("เรียบร้อยครับ ไม่ต้องส่งข้อมูลซ้ำนะครับ", "ok");
      window.location.assign(redirectTarget(result.application_id || result.id || ""));
    }).catch(function () {
      setSubmitting(false);
      setStatus("ส่งไม่สำเร็จครับ ลองเช็กข้อมูลอีกครั้ง หรือส่งให้ต้าช่วยดูได้เลย", "error");
    });
  });
}());`;

const FIRST_WAVE_ROUTES = new Set<string>([
  "GET /sigil/admin/login",
  "POST /sigil/admin/login/session",
  "DELETE /sigil/admin/login/session",
  "POST /sigil/admin/verify-access-code",
  "GET /sigil/apply",
  "GET /sigil/apply/",
  "OPTIONS /sigil/api/private-model/apply",
  "POST /sigil/api/private-model/apply",
  "GET /sigil/model/apply",
  "GET /sigil/model/apply/",
  "GET /sigil/model/apply/private-model",
  "GET /sigil/model/apply/private-model/",
  "GET /sigil/admin/control-room",
  "GET /sigil/admin/jobs/create-session",
  "GET /sigil/admin/jobs/create-job",
  "GET /sigil/api/invite/resolve",
  "POST /sigil/api/renewal/status",
  "POST /sigil/api/renewal/intake",
  "POST /sigil/api/jobs/customer-confirm",
]);

interface Env {
  IMMIGRATE_WORKER_BASE_URL?: string;
  SIGIL_ROUTE_MIGRATION_BUILD?: string;
}

type BodyParams = {
  hasToken: boolean;
  unsafeNext: string | null;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const build = env.SIGIL_ROUTE_MIGRATION_BUILD || DEFAULT_BUILD;
    const url = new URL(request.url);
    const upstreamBaseUrl = env.IMMIGRATE_WORKER_BASE_URL || DEFAULT_UPSTREAM_BASE_URL;

    if (!url.pathname.startsWith("/sigil/")) {
      return withSigilHeaders(new Response("Not found", { status: 404 }), build);
    }

    if (url.searchParams.has("token")) {
      return withSigilHeaders(
        json({ ok: false, error: "invalid_request", message: "Use t instead of token." }, 400),
        build,
      );
    }

    const nextParam = url.searchParams.get("next");
    if (nextParam !== null) {
      const safeNext = normalizeLocalNext(nextParam);
      if (!safeNext) {
        return withSigilHeaders(
          json({ ok: false, error: "invalid_next", message: "next must be a local path." }, 400),
          build,
        );
      } else if (safeNext !== nextParam) {
        url.searchParams.set("next", safeNext);
      }
    }

    const bodyParams = await inspectTokenLikeBodyParams(request);
    if (bodyParams.hasToken) {
      return withSigilHeaders(
        json({ ok: false, error: "invalid_request", message: "Use t instead of token." }, 400),
        build,
      );
    }
    if (bodyParams.unsafeNext) {
      return withSigilHeaders(
        json({ ok: false, error: "invalid_next", message: "next must be a local path." }, 400),
        build,
      );
    }

    if ((request.method === "GET" || request.method === "HEAD") && url.pathname === SIGIL_ADMIN_LOGIN_PATH) {
      const loginResponse = request.method === "HEAD"
        ? new Response(null, { status: 200, headers: adminLoginHeaders() })
        : renderAdminLoginPage(url);
      const response = withSigilHeaders(loginResponse, build);
      response.headers.set("x-mmd-sigil-migration-wave", "first");
      return response;
    }

    if ((request.method === "GET" || request.method === "HEAD") && isPrivateModelSetupRoute(url.pathname)) {
      const response = withSigilHeaders(renderPrivateModelSetupPage(request), build);
      response.headers.set("x-mmd-sigil-page-source", "inline-private-model-setup");
      response.headers.set("x-mmd-sigil-migration-wave", "first");
      return response;
    }

    if (url.pathname === SIGIL_PRIVATE_MODEL_APPLY_API_PATH) {
      const response = request.method === "OPTIONS"
        ? privateModelApplyOptions(request)
        : request.method === "POST"
          ? await handlePrivateModelApply(request)
          : withPrivateModelApplyCors(
            json({ ok: false, error: "method_not_allowed", message: "Use POST for this endpoint." }, 405),
            request,
          );
      const owned = withSigilHeaders(response, build);
      owned.headers.set("x-mmd-route-owner", OWNER);
      owned.headers.set("x-mmd-page", "sigil-private-model-apply-api");
      owned.headers.set("x-mmd-sigil-migration-wave", "first");
      return owned;
    }

    const upstreamUrl = toUpstreamUrl(url, upstreamBaseUrl);
    const upstreamRequest = new Request(upstreamUrl.toString(), request);
    const upstream = await fetch(upstreamRequest);

    const response = withSigilHeaders(upstream, build, {
      publicOrigin: url.origin,
      upstreamOrigin: new URL(upstreamBaseUrl).origin,
    });
    response.headers.set(UPSTREAM_HEADER, "immigrate-worker");

    const routeKey = `${request.method.toUpperCase()} ${url.pathname}`;
    if (FIRST_WAVE_ROUTES.has(routeKey)) {
      response.headers.set("x-mmd-sigil-migration-wave", "first");
    }

    return response;
  },
};

type PrivateModelApplyPayload = {
  nickname?: unknown;
  phone?: unknown;
  telegram_username?: unknown;
  line_id?: unknown;
  private_standard?: unknown;
  minimum_rate_thb?: unknown;
  private_note?: unknown;
  consent?: unknown;
  website?: unknown;
};

async function handlePrivateModelApply(request: Request): Promise<Response> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return withPrivateModelApplyCors(
      json({
        ok: false,
        error: "invalid_request",
        message: "Send this application as JSON.",
      }, 400),
      request,
    );
  }

  let payload: PrivateModelApplyPayload;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid payload");
    }
    payload = parsed as PrivateModelApplyPayload;
  } catch {
    return withPrivateModelApplyCors(
      json({
        ok: false,
        error: "invalid_request",
        message: "Check the application fields and try again.",
      }, 400),
      request,
    );
  }

  const normalizedStandard = normalizePrivateModelStandard(payload.private_standard);
  const validationMessage = validatePrivateModelApplyPayload(payload, normalizedStandard);
  if (validationMessage) {
    return withPrivateModelApplyCors(
      json({ ok: false, error: "invalid_request", message: validationMessage }, 400),
      request,
    );
  }

  if (cleanPayloadString(payload.website)) {
    return withPrivateModelApplyCors(
      json({
        ok: true,
        status: "received",
        application_id: "",
        received_url: SIGIL_MODEL_APPLY_PRIVATE_RECEIVED_PATH,
      }),
      request,
    );
  }

  const applicationId = `sigil_private_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
  return withPrivateModelApplyCors(
    json({
      ok: true,
      status: "received",
      application_id: applicationId,
      id: applicationId,
      private_standard: normalizedStandard,
      received_url: SIGIL_MODEL_APPLY_PRIVATE_RECEIVED_PATH,
      dashboard_url: SIGIL_MODEL_APPLY_PRIVATE_RECEIVED_PATH,
      message: "Application received.",
    }),
    request,
  );
}

function validatePrivateModelApplyPayload(payload: PrivateModelApplyPayload, normalizedStandard: string): string {
  if (!cleanPayloadString(payload.nickname)) {
    return "Please add the name TarT should use.";
  }

  if (!(
    cleanPayloadString(payload.phone) ||
    cleanPayloadString(payload.telegram_username) ||
    cleanPayloadString(payload.line_id)
  )) {
    return "Please add at least one contact channel.";
  }

  if (!normalizedStandard) {
    return "Please choose a private standard.";
  }

  const rate = Number(payload.minimum_rate_thb);
  if (!Number.isFinite(rate) || rate <= 0) {
    return "Please add a valid minimum rate.";
  }

  if (payload.consent !== true) {
    return "Please confirm consent before submitting.";
  }

  return "";
}

function normalizePrivateModelStandard(value: unknown): string {
  return PRIVATE_MODEL_STANDARD_ALIASES.get(cleanPayloadString(value).toLowerCase()) || "";
}

function cleanPayloadString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function privateModelApplyOptions(request: Request): Response {
  return withPrivateModelApplyCors(new Response(null, {
    status: 204,
    headers: {
      "cache-control": "no-store",
      "access-control-max-age": "86400",
    },
  }), request);
}

function withPrivateModelApplyCors(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  const origin = request.headers.get("origin") || "";
  if (PRIVATE_MODEL_APPLY_ALLOWED_ORIGINS.has(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-methods", "POST, OPTIONS");
    headers.set("access-control-allow-headers", request.headers.get("access-control-request-headers") || "content-type");
    headers.set("vary", appendVary(headers.get("vary"), "Origin"));
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function appendVary(current: string | null, value: string): string {
  if (!current) return value;
  const parts = current.split(",").map((part) => part.trim().toLowerCase());
  return parts.includes(value.toLowerCase()) ? current : `${current}, ${value}`;
}

function renderAdminLoginPage(url: URL): Response {
  const next = normalizeLocalNext(url.searchParams.get("next") || "") || DEFAULT_ADMIN_NEXT;
  const t = url.searchParams.get("t") || "";
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>SIGIL Admin Gate</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    html, body { min-height: 100%; margin: 0; }
    body {
      background: #050302;
      color: #f7ead0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
    }
    button, input { font: inherit; letter-spacing: 0; }
    .sag2-shell {
      min-height: 100svh;
      position: relative;
      display: grid;
      place-items: center;
      padding: clamp(18px, 4vw, 44px);
      overflow: hidden;
      isolation: isolate;
      background:
        linear-gradient(90deg, rgba(5, 3, 2, 0.92), rgba(5, 3, 2, 0.58) 48%, rgba(5, 3, 2, 0.9)),
        linear-gradient(180deg, rgba(5, 3, 2, 0.38), rgba(5, 3, 2, 0.96)),
        url("${SIGIL_LOGIN_BG_URL}") center / cover no-repeat,
        #050302;
    }
    /* TODO: Replace this with the final dark SIGIL control-room background asset if BPEWPRIVELogin.png is not the intended canonical dark BG. */
    .sag2-shell::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: -1;
      background:
        linear-gradient(120deg, rgba(3, 2, 1, 0.96), rgba(21, 12, 3, 0.64) 45%, rgba(3, 2, 1, 0.94)),
        repeating-linear-gradient(90deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 96px);
      pointer-events: none;
    }
    .sag2-frame {
      width: min(1120px, 100%);
      min-height: min(720px, calc(100svh - 36px));
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(340px, 420px);
      gap: clamp(18px, 4vw, 54px);
      align-items: center;
    }
    .sag2-copy {
      min-width: 0;
      display: grid;
      gap: 20px;
      padding: clamp(8px, 2vw, 24px) 0;
    }
    .sag2-logo {
      width: min(220px, 52vw);
      height: auto;
      display: block;
      filter: drop-shadow(0 18px 34px rgba(0, 0, 0, 0.42));
    }
    .sag2-kicker,
    .sag2-canary,
    .sag2-meta span,
    .sag2-footnote {
      margin: 0;
      color: rgba(246, 213, 150, 0.7);
      font-size: 0.72rem;
      line-height: 1.35;
      font-weight: 850;
      text-transform: uppercase;
    }
    .sag2-title {
      max-width: 760px;
      margin: 0;
      color: #fff8e8;
      font-size: clamp(3rem, 8vw, 7rem);
      line-height: 0.92;
      font-weight: 900;
      letter-spacing: 0;
      text-wrap: balance;
      text-shadow: 0 28px 80px rgba(0, 0, 0, 0.52);
    }
    .sag2-copy p:not(.sag2-kicker) {
      max-width: 620px;
      margin: 0;
      color: rgba(255, 244, 222, 0.75);
      font-size: clamp(1rem, 1.45vw, 1.16rem);
      line-height: 1.7;
    }
    .sag2-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding-top: 6px;
    }
    .sag2-meta span {
      min-height: 32px;
      display: inline-grid;
      place-items: center;
      padding: 7px 10px;
      border: 1px solid rgba(242, 196, 106, 0.24);
      border-radius: 8px;
      background: rgba(9, 6, 4, 0.42);
      color: rgba(255, 231, 184, 0.78);
    }
    .sag2-panel {
      width: 100%;
      align-self: center;
      border: 1px solid rgba(246, 201, 116, 0.26);
      border-radius: 8px;
      background: linear-gradient(180deg, rgba(33, 24, 14, 0.66), rgba(8, 6, 4, 0.78));
      box-shadow: 0 28px 80px rgba(0, 0, 0, 0.54), inset 0 1px 0 rgba(255, 255, 255, 0.08);
      backdrop-filter: blur(22px);
      -webkit-backdrop-filter: blur(22px);
      overflow: hidden;
    }
    .sag2-panel-inner {
      display: grid;
      gap: 18px;
      padding: clamp(22px, 4vw, 34px);
    }
    .sag2-canary {
      width: fit-content;
      padding: 7px 9px;
      border: 1px solid rgba(246, 201, 116, 0.28);
      border-radius: 8px;
      color: rgba(255, 226, 166, 0.86);
      background: rgba(0, 0, 0, 0.24);
    }
    .sag2-panel h2 {
      margin: 0;
      color: #fff5dc;
      font-size: clamp(1.42rem, 3vw, 2.08rem);
      line-height: 1.08;
      font-weight: 900;
      letter-spacing: 0;
    }
    .sag2-panel p {
      margin: 0;
      color: rgba(255, 241, 213, 0.68);
      font-size: 0.95rem;
      line-height: 1.58;
    }
    .sag2-form {
      display: grid;
      gap: 14px;
      padding-top: 4px;
    }
    .sag2-field {
      display: grid;
      gap: 8px;
    }
    .sag2-field span {
      color: rgba(255, 238, 203, 0.84);
      font-size: 0.82rem;
      line-height: 1.3;
      font-weight: 820;
    }
    .sag2-input {
      width: 100%;
      min-height: 52px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      padding: 13px 14px;
      color: #fff8e8;
      background: rgba(0, 0, 0, 0.32);
      outline: none;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
    }
    .sag2-input:focus {
      border-color: rgba(246, 201, 116, 0.72);
      box-shadow: 0 0 0 3px rgba(246, 201, 116, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.04);
    }
    .sag2-button {
      min-height: 56px;
      border: 1px solid rgba(255, 228, 168, 0.8);
      border-radius: 8px;
      display: grid;
      place-items: center;
      padding: 13px 16px;
      cursor: pointer;
      color: #160f06;
      background: linear-gradient(135deg, #ffe1a0, #d29a45 54%, #94601f);
      font-weight: 900;
      box-shadow: 0 16px 40px rgba(184, 119, 38, 0.24);
    }
    .sag2-button[disabled] {
      cursor: not-allowed;
      opacity: 0.62;
    }
    .sag2-status {
      min-height: 22px;
      color: rgba(255, 226, 166, 0.78);
      font-size: 0.9rem;
      line-height: 1.5;
    }
    .sag2-status[data-tone="error"] { color: #ffb5aa; }
    .sag2-status[data-tone="success"] { color: #b5e8bf; }
    .sag2-footnote {
      text-transform: none;
      color: rgba(255, 237, 202, 0.46);
      font-weight: 720;
    }
    @media (max-width: 860px) {
      .sag2-shell {
        align-items: start;
        padding: 16px;
        overflow: auto;
      }
      .sag2-frame {
        min-height: auto;
        grid-template-columns: 1fr;
        gap: 22px;
      }
      .sag2-copy {
        padding-top: 8px;
      }
      .sag2-title {
        font-size: clamp(2.6rem, 15vw, 4.4rem);
      }
      .sag2-panel {
        align-self: start;
      }
    }
    @media (max-width: 420px) {
      .sag2-shell { padding: 10px; }
      .sag2-panel-inner { padding: 18px; }
      .sag2-title { font-size: 2.5rem; }
      .sag2-input, .sag2-button { min-height: 50px; }
    }
  </style>
</head>
<body>
  <main class="sag2-shell" data-sigil-admin-gate-v2>
    <section class="sag2-frame" aria-label="SIGIL admin login">
      <div class="sag2-copy">
        <img class="sag2-logo" src="${SIGIL_LOGO_URL}" alt="SIGIL">
        <p class="sag2-kicker">Private Control Room</p>
        <h1 class="sag2-title">SIGIL Admin Gate</h1>
        <p>Secure operator entry for SIGIL sessions, renewal handling, invite review, and protected control-room work.</p>
        <div class="sag2-meta" aria-label="Route status">
          <span>sigil-worker</span>
          <span>SIGIL_ROUTE_MIGRATION_V1</span>
          <span>Admin Session Required</span>
        </div>
      </div>

      <section class="sag2-panel" aria-label="Admin authorization panel">
        <div class="sag2-panel-inner">
          <p class="sag2-canary">${SIGIL_ADMIN_LOGIN_UI_BUILD}</p>
          <div>
            <h2>Authorized operators only.</h2>
            <p>Sign in with your SIGIL admin identity. Session verification stays protected server-side.</p>
          </div>

          <form class="sag2-form" method="post" action="${SIGIL_ADMIN_LOGIN_SESSION_PATH}" data-sigil-admin-login-form>
            <input type="hidden" name="next" value="${escapeHtml(next)}">
            <input type="hidden" name="t" value="${escapeHtml(t)}">
            <label class="sag2-field">
              <span>Admin identity</span>
              <input class="sag2-input" name="identity" type="text" autocomplete="username" required autofocus>
            </label>
            <label class="sag2-field">
              <span>Password</span>
              <input class="sag2-input" name="password" type="password" autocomplete="current-password" required>
            </label>
            <button class="sag2-button" type="submit">Enter Control Room</button>
            <div class="sag2-status" role="status" aria-live="polite" data-sigil-admin-status></div>
          </form>

          <p class="sag2-footnote">Credential verification is handled server-side.</p>
        </div>
      </section>
    </section>
  </main>

  <script>
    (() => {
      const form = document.querySelector("[data-sigil-admin-login-form]");
      const status = document.querySelector("[data-sigil-admin-status]");
      const button = form?.querySelector("button[type='submit']");
      if (!form || !status || !button) return;

      const setStatus = (message, tone = "") => {
        status.textContent = message;
        status.dataset.tone = tone;
      };

      const localNext = (value) => {
        try {
          const parsed = new URL(value || ${JSON.stringify(DEFAULT_ADMIN_NEXT)}, location.origin);
          if (parsed.origin !== location.origin) return ${JSON.stringify(DEFAULT_ADMIN_NEXT)};
          if (!parsed.pathname.startsWith("/")) return ${JSON.stringify(DEFAULT_ADMIN_NEXT)};
          return parsed.pathname + parsed.search + parsed.hash;
        } catch {
          return ${JSON.stringify(DEFAULT_ADMIN_NEXT)};
        }
      };

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const identity = String(data.get("identity") || "").trim();
        const password = String(data.get("password") || "");
        const next = localNext(String(data.get("next") || ""));
        if (!identity || !password) {
          setStatus("Enter your identity and password.", "error");
          return;
        }

        button.disabled = true;
        button.textContent = "Checking...";
        setStatus("Verifying secure session...");

        try {
          const response = await fetch(form.action, {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ identity, password, accessCode: password, next }),
          });

          if (response.redirected) {
            const responseUrl = new URL(response.url, location.origin);
            if (responseUrl.pathname === ${JSON.stringify(SIGIL_ADMIN_LOGIN_PATH)}) {
              setStatus("Access denied. Check your credentials and try again.", "error");
              return;
            }
            setStatus("Authorized. Opening control room.", "success");
            location.replace(response.url);
            return;
          }

          if (response.ok) {
            const payload = await response.clone().json().catch(() => null);
            if (!payload?.ok) {
              setStatus("Access denied. Check your credentials and try again.", "error");
              return;
            }
            const redirectTo = localNext(payload?.data?.redirect_to || next);
            setStatus("Authorized. Opening control room.", "success");
            location.replace(redirectTo);
            return;
          }

          setStatus("Access denied. Check your credentials and try again.", "error");
        } catch {
          setStatus("Unable to reach the admin gate right now.", "error");
        } finally {
          button.disabled = false;
          button.textContent = "Enter Control Room";
        }
      });
    })();
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: adminLoginHeaders(),
  });
}

function isPrivateModelSetupRoute(pathname: string): boolean {
  return pathname === SIGIL_APPLY_PATH ||
    pathname === `${SIGIL_APPLY_PATH}/` ||
    pathname === SIGIL_MODEL_APPLY_PATH ||
    pathname === `${SIGIL_MODEL_APPLY_PATH}/` ||
    pathname === SIGIL_MODEL_APPLY_PRIVATE_PATH ||
    pathname === `${SIGIL_MODEL_APPLY_PRIVATE_PATH}/`;
}

function renderPrivateModelSetupPage(request: Request): Response {
  const html = `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>SIGIL Private Model Setup | MMD Privé</title>
  <style>${PRIVATE_MODEL_SETUP_CSS}</style>
</head>
<body>
  <section
    id="sigil-private-setup"
    class="sps sps-private-apply"
    data-endpoint="${SIGIL_PRIVATE_MODEL_APPLY_ENDPOINT}"
    data-dashboard-url="${SIGIL_MODEL_APPLY_PRIVATE_RECEIVED_PATH}"
    data-received-url="${SIGIL_MODEL_APPLY_PRIVATE_RECEIVED_PATH}"
  >
    <div class="sps-shell">
      <header class="sps-hero" aria-labelledby="sps-title">
        <div class="sps-hero-copy">
          <p class="sps-kicker">MMD PRIVÉ / SIGIL ACCESS</p>
          <h1 id="sps-title">ถ้าจะเข้าชั้น private ให้ตั้งขอบเขตก่อน</h1>
          <p class="sps-lede">
            ต้าอยู่ตรงนี้เพื่อรับข้อมูลเบื้องต้นของพี่น้องครับ ตอบเฉพาะสิ่งที่จำเป็นก่อน: ชื่อที่ใช้ทำงาน, ช่องทางติดต่อ, standard ที่รับได้, และ rate ขั้นต่ำที่สบายใจจริง.
          </p>
        </div>
        <aside class="sps-hero-note" aria-label="Private apply note">
          <span>Private Apply</span>
          <p>ข้อมูลนี้ไม่ใช่ public profile. พี่เปอร์จะได้อ่านโปรไฟล์แบบส่วนตัว และพิจารณาความเหมาะสมก่อนมีการติดต่อกลับครับ.</p>
        </aside>
      </header>

      <main class="sps-layout">
        <section class="sps-panel sps-context">
          <p class="sps-section-label">Per Voice</p>
          <h2>ไม่ต้องรับทุกอย่าง แค่บอกเส้นที่คุณถือได้จริง</h2>
          <p>
            SIGIL อยู่ใต้ MMD Privé ในฐานะ private access layer. ต้าได้รับข้อมูลไว้ก่อน แล้วพี่เปอร์จะอ่านความเหมาะสมของงาน ลูกค้า และจังหวะการดูแลแบบส่วนตัวครับ.
          </p>
        </section>

        <form class="sps-panel sps-form" data-private-setup-form novalidate>
          <div class="sps-form-head">
            <p class="sps-section-label">Setup</p>
            <h2>เปิดทางสมัครแบบมีขอบเขต</h2>
          </div>

          <label class="sps-field" for="sps-nickname">
            <span>ชื่อที่ให้ TarT เรียก</span>
            <input id="sps-nickname" name="nickname" type="text" autocomplete="nickname" maxlength="100" required>
          </label>

          <fieldset class="sps-fieldset">
            <legend>ช่องทางติดต่ออย่างน้อย 1 ช่องทาง</legend>
            <div class="sps-contact-grid">
              <label class="sps-field" for="sps-phone">
                <span>Phone</span>
                <input id="sps-phone" name="phone" type="tel" autocomplete="tel" maxlength="40">
              </label>
              <label class="sps-field" for="sps-telegram">
                <span>Telegram</span>
                <input id="sps-telegram" name="telegram_username" type="text" maxlength="80" placeholder="@username">
              </label>
              <label class="sps-field" for="sps-line">
                <span>LINE ID</span>
                <input id="sps-line" name="line_id" type="text" maxlength="80">
              </label>
            </div>
          </fieldset>

          <fieldset class="sps-fieldset">
            <legend>Private Standard</legend>
            <div class="sps-options">
              <label class="sps-option">
                <input type="radio" name="private_standard" value="standard_private" required>
                <span><strong>Standard Private</strong><small>ขอบเขตชัด รับเฉพาะงานที่อ่านแล้วสบายใจ</small></span>
              </label>
              <label class="sps-option">
                <input type="radio" name="private_standard" value="premium_private">
                <span><strong>Premium Private</strong><small>เลือกงานน้อยลง แต่ต้องเหมาะกับบุคลิกและ rate สูงขึ้น</small></span>
              </label>
              <label class="sps-option">
                <input type="radio" name="private_standard" value="selective_case_by_case">
                <span><strong>Selective</strong><small>ให้พี่เปอร์อ่านความเหมาะสมเป็นเคสก่อนทุกครั้ง</small></span>
              </label>
            </div>
          </fieldset>

          <label class="sps-field" for="sps-rate">
            <span>Minimum Rate (THB)</span>
            <input id="sps-rate" name="minimum_rate_thb" type="number" inputmode="numeric" min="0" step="500" placeholder="8000" required>
            <small>ใส่ตัวเลขที่คุณรับได้จริง ไม่ต้องกดตัวเองให้ต่ำเพื่อผ่านหน้าแรก</small>
          </label>

          <label class="sps-field" for="sps-note">
            <span>Private Note</span>
            <textarea id="sps-note" name="private_note" rows="4" maxlength="700" placeholder="มีขอบเขต เวลา โซน หรือเรื่องที่อยากให้ TarT รู้ก่อน บอกไว้ตรงนี้ได้ครับ"></textarea>
          </label>

          <label class="sps-consent">
            <input name="consent" type="checkbox" required>
            <span>ผมเข้าใจว่า SIGIL เป็น private access layer ใต้ MMD Privé และข้อมูลนี้เป็นข้อมูลเบื้องต้นให้พี่เปอร์อ่านแบบส่วนตัวก่อนเท่านั้น</span>
          </label>

          <input class="sps-hp" name="website" type="text" tabindex="-1" autocomplete="off" aria-hidden="true">

          <div class="sps-actions">
            <button class="sps-button" type="submit">
              <span>ส่งให้ TarT อ่านต่อ</span>
              <small>Continue private apply</small>
            </button>
            <p class="sps-status" data-private-setup-status role="status" aria-live="polite"></p>
          </div>
        </form>
      </main>
    </div>
  </section>
  <script>${PRIVATE_MODEL_SETUP_SCRIPT}</script>
</body>
</html>`;

  return new Response(request.method === "HEAD" ? null : html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-mmd-route-owner": OWNER,
      "x-mmd-page": "sigil-private-model-setup",
      "x-mmd-sigil-webflow-package": "inline-private-model-setup",
    },
  });
}

function adminLoginHeaders(): Headers {
  return new Headers({
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-mmd-sigil-login-ui": SIGIL_ADMIN_LOGIN_UI_BUILD,
  });
}

function toUpstreamUrl(publicUrl: URL, upstreamBaseUrl: string): URL {
  const upstreamUrl = new URL(publicUrl.pathname + publicUrl.search, upstreamBaseUrl);
  return upstreamUrl;
}

function withSigilHeaders(
  response: Response,
  build: string,
  rewrite?: { publicOrigin: string; upstreamOrigin: string },
): Response {
  const headers = new Headers(response.headers);
  if (rewrite) {
    rewriteLocationHeader(headers, rewrite.upstreamOrigin, rewrite.publicOrigin);
  }
  headers.set(OWNER_HEADER, OWNER);
  headers.set(BUILD_HEADER, build);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function rewriteLocationHeader(headers: Headers, upstreamOrigin: string, publicOrigin: string): void {
  const location = headers.get("location");
  if (!location) return;

  try {
    const parsed = new URL(location, upstreamOrigin);
    if (parsed.origin !== upstreamOrigin) return;
    headers.set("location", `${publicOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`);
  } catch {
    return;
  }
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function normalizeLocalNext(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("//")) return null;

  try {
    const parsed = new URL(trimmed, "https://sigil.mmdbkk.com");
    if (parsed.origin !== "https://sigil.mmdbkk.com") return null;
    if (!parsed.pathname.startsWith("/")) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function inspectTokenLikeBodyParams(request: Request): Promise<BodyParams> {
  if (request.method === "GET" || request.method === "HEAD") {
    return { hasToken: false, unsafeNext: null };
  }

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = new URLSearchParams(await request.clone().text());
    return inspectParamEntries(form.entries());
  }

  if (contentType.includes("multipart/form-data")) {
    const form = await request.clone().formData().catch(() => null);
    if (!form) return { hasToken: false, unsafeNext: null };
    return inspectParamEntries(form.entries());
  }

  if (contentType.includes("application/json")) {
    const data = await request.clone().json().catch(() => null);
    return inspectBodyValue(data);
  }

  return { hasToken: false, unsafeNext: null };
}

function inspectParamEntries(entries: Iterable<[string, unknown]>): BodyParams {
  let hasToken = false;
  let unsafeNext: string | null = null;

  for (const [key, rawValue] of entries) {
    if (key === "token") {
      hasToken = true;
    }
    if (key === "next" && typeof rawValue === "string" && !normalizeLocalNext(rawValue)) {
      unsafeNext = rawValue;
    }
  }

  return { hasToken, unsafeNext };
}

function inspectBodyValue(value: unknown): BodyParams {
  if (!value || typeof value !== "object") {
    return { hasToken: false, unsafeNext: null };
  }

  if (Array.isArray(value)) {
    return value.reduce<BodyParams>(
      (params, item) => mergeBodyParams(params, inspectBodyValue(item)),
      { hasToken: false, unsafeNext: null },
    );
  }

  const ownParams = inspectParamEntries(Object.entries(value as Record<string, unknown>));
  const nestedParams = Object.values(value as Record<string, unknown>).reduce<BodyParams>(
    (params, item) => mergeBodyParams(params, inspectBodyValue(item)),
    { hasToken: false, unsafeNext: null },
  );

  return mergeBodyParams(ownParams, nestedParams);
}

function mergeBodyParams(left: BodyParams, right: BodyParams): BodyParams {
  return {
    hasToken: left.hasToken || right.hasToken,
    unsafeNext: left.unsafeNext || right.unsafeNext,
  };
}

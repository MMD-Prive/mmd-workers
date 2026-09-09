import currentWorker from "./my-mmd-bounded-status-front-gate.js";
import { handleMmsLineRequest, isMmsLineRequest } from "./mms-line-runtime.mjs";
import { MMS_LINE_EVIDENCE_INTERNALS, observeMmsLineEvidence } from "./mms-line-evidence-observer.mjs";
import {
  handleMmdRichMenuScheduledRequest,
  handleMmdRichMenuScheduled,
  isMmdRichMenuScheduledRequest,
} from "./mmd-rich-menu-scheduled-runtime.mjs";
import {
  handleKenjiSeedLineRequestWithRedeliveryRecovery,
  isKenjiSeedLineRequest,
} from "./kenji-line-redelivery-recovery.mjs";
import {
  handleKenjiLineTransportHealth,
  isKenjiLineTransportHealthRequest,
} from "./kenji-line-transport-health.mjs";
import { handleKenjiLineWithIngressTrace } from "./kenji-line-ingress-trace.mjs";

export { KenjiModelIdempotency } from "./my-mmd-bounded-status-front-gate.js";

const KENJI_RUNTIME_STATUS_RPC_PATH = "/v1/internal/kenji/control/runtime/status";
const KENJI_RUNTIME_TABLE_FALLBACK = "tblPRUGp6AxWMM5gQ";
const KENJI_RUNTIME_SCOPES = Object.freeze([
  "line_oa_auto_reply",
  "model_keyword_auto_reply",
  "all_kenji_mutations",
]);
const RUNTIME_STATUS_SENTINEL = "service-binding-runtime-status";

// MY MMS Therapist work app is a separate, approval-gated private surface.
// Lovable owns only the presentation bytes. All session/access/job authority
// remains in mms-worker and every browser call stays on mmdbkk.com.
const MY_MMS_THERAPIST_APP_PATH = "/male-massage/therapists/app";
const MY_MMS_THERAPIST_APP_API_PREFIX = "/male-massage/therapists/api/app/";
const MY_MMS_THERAPIST_ACCESS_PATH = `${MY_MMS_THERAPIST_APP_API_PREFIX}access`;
const MY_MMS_THERAPIST_ME_PATH = "/male-massage/therapists/me";
const MY_MMS_THERAPIST_LOGIN_PATH = "/male-massage/therapists/login";
const MY_MMS_THERAPIST_PRESENTATION_URL = "https://my-mms-therapist.lovable.app/my-mms-work-shell.html";
const MY_MMS_THERAPIST_SHELL_MARKER = 'data-mms-shell="lovable-single-file-v1"';

function text(value) {
  return value == null ? "" : String(value).trim();
}

function normalizedPath(request) {
  try {
    return new URL(request.url).pathname.toLowerCase().replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
  } catch (_) {
    return "/";
  }
}

function isMyMmsTherapistAppUiRequest(request) {
  return normalizedPath(request) === MY_MMS_THERAPIST_APP_PATH;
}

function isMyMmsTherapistAppApiRequest(request) {
  const path = normalizedPath(request);
  return path === MY_MMS_THERAPIST_APP_API_PREFIX.slice(0, -1) || path.startsWith(MY_MMS_THERAPIST_APP_API_PREFIX);
}

function escapeFormulaValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function runtimeStatusRequest(request) {
  if (!request || String(request.method || "GET").toUpperCase() !== "POST") return false;
  try {
    const url = new URL(request.url);
    return url.hostname === "admin-worker.local" && url.pathname === KENJI_RUNTIME_STATUS_RPC_PATH;
  } catch (_) {
    return false;
  }
}

function runtimeJson(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private",
      "x-mmd-runtime-status-source": status === 200 ? "airtable-fallback" : "fail-closed",
    },
  });
}

function myMmsJson(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private, max-age=0",
      "x-content-type-options": "nosniff",
      "x-mmd-route-owner": "member-dashboard-chat-worker",
      "x-mmd-upstream-service": "mms-worker",
    },
  });
}

function myMmsRedirect(request, pathname, status = 302) {
  const target = new URL(request.url);
  target.pathname = pathname;
  target.search = "";
  target.hash = "";
  return new Response(null, {
    status,
    headers: {
      location: target.toString(),
      "cache-control": "no-store, private, max-age=0",
      "x-mmd-route-owner": "member-dashboard-chat-worker",
      "x-robots-tag": "noindex, nofollow, noarchive",
    },
  });
}

function myMmsRecoveryHtml() {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>MY MMS · Therapist</title><style>html,body{margin:0;min-height:100%;background:#f7f6f1;color:#1f2a22;font-family:system-ui,-apple-system,"Noto Sans Thai",sans-serif}main{min-height:100svh;display:grid;place-items:center;padding:24px;box-sizing:border-box}.card{width:min(100%,420px);padding:24px;border:1px solid #e4e6dd;border-radius:24px;background:#fff;box-sizing:border-box}.k{font-size:11px;font-weight:700;letter-spacing:.16em;color:#2f5d43}.t{font-size:21px;font-weight:650;margin:10px 0 8px}.copy{font-size:14px;line-height:1.7;color:#6d7a70}.btn{min-height:48px;margin-top:16px;border-radius:999px;display:flex;align-items:center;justify-content:center;text-decoration:none;font-size:14px;background:#24503a;color:#f7f6f1}.btn.alt{background:#fff;color:#24503a;border:1px solid #dfe4db}</style></head><body><main><section class="card"><div class="k">MY MMS · THERAPIST</div><div class="t">ยังเปิดพื้นที่รับงานไม่ได้ครับ</div><div class="copy">ระบบยังยืนยันสิทธิ์หรือหน้าแอปไม่สำเร็จ จึงยังไม่แสดงข้อมูลงานใด ๆ ลองอีกครั้งได้เลย หรือกลับไปที่โปรไฟล์ Therapist ก่อนครับ</div><a class="btn" href="${MY_MMS_THERAPIST_APP_PATH}">ลองอีกครั้ง</a><a class="btn alt" href="${MY_MMS_THERAPIST_ME_PATH}">กลับโปรไฟล์ Therapist</a></section></main></body></html>`;
}

function myMmsRecovery(status = 503) {
  return new Response(myMmsRecoveryHtml(), {
    status,
    headers: myMmsPresentationHeaders(new Headers(), { html: true }),
  });
}

function myMmsPresentationHeaders(upstreamHeaders = new Headers(), { html = false, rewritten = false } = {}) {
  const headers = new Headers(upstreamHeaders);
  for (const name of [
    "content-length", "set-cookie", "content-security-policy", "content-security-policy-report-only",
    "reporting-endpoints", "report-to", "nel", "server", "x-powered-by",
  ]) headers.delete(name);
  if (rewritten) {
    for (const name of ["content-encoding", "etag", "last-modified", "content-md5"]) headers.delete(name);
  }
  headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("pragma", "no-cache");
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "no-referrer");
  headers.set("x-frame-options", "DENY");
  headers.set("x-robots-tag", "noindex, nofollow, noarchive");
  headers.set("x-mmd-worker", "member-dashboard-chat-worker");
  headers.set("x-mmd-route-owner", "member-dashboard-chat-worker");
  headers.set("x-mmd-ui-source", "lovable-single-file-proxy");
  headers.set("x-mmd-presentation-owner", "lovable");
  headers.set("x-mmd-behavior-owner", "mms-worker");
  headers.set(
    "content-security-policy",
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  );
  if (html) headers.set("content-type", "text/html; charset=utf-8");
  return headers;
}

function mmsServiceHeaders(request) {
  const headers = new Headers();
  for (const name of ["accept", "accept-language", "content-type", "cookie", "origin", "user-agent", "x-request-id"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

async function forwardMyMmsTherapistAppApi(request, env) {
  if (!env.MMS_WORKER?.fetch) {
    return myMmsJson({ ok: false, error: { code: "MMS_APP_UPSTREAM_NOT_CONFIGURED" } }, 503);
  }
  const upstream = await env.MMS_WORKER.fetch(new Request(request.url, request));
  const headers = new Headers(upstream.headers);
  headers.set("cache-control", "no-store, private, max-age=0");
  headers.set("x-mmd-worker", "member-dashboard-chat-worker");
  headers.set("x-mmd-route-owner", "member-dashboard-chat-worker");
  headers.set("x-mmd-upstream-service", "mms-worker");
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

async function readMyMmsTherapistAccess(request, env) {
  if (!env.MMS_WORKER?.fetch) return { status: 503, data: null };
  const url = new URL(request.url);
  url.pathname = MY_MMS_THERAPIST_ACCESS_PATH;
  url.search = "";
  const response = await env.MMS_WORKER.fetch(new Request(url.toString(), {
    method: "GET",
    headers: mmsServiceHeaders(request),
    redirect: "manual",
  }));
  const payload = await response.clone().json().catch(() => null);
  return { status: response.status, data: payload?.data || null };
}

function presentationRequestHeaders(request) {
  const headers = new Headers({ accept: "text/html,application/xhtml+xml" });
  // Deliberately exclude Cookie, Authorization, Origin and every private session
  // header. Lovable receives only ordinary anonymous presentation headers.
  for (const name of ["accept-language", "user-agent"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function sanitizeMyMmsPresentation(html) {
  let output = String(html || "");
  output = output.replace(/<aside\b[^>]*id=["']lovable-badge["'][\s\S]*?<\/aside>/gi, "");
  output = output.replace(/<script\b[^>]*src=["']\/~flock\.js["'][\s\S]*?<\/script>/gi, "");
  return output;
}

async function handleMyMmsTherapistAppUi(request, env) {
  if (!new Set(["GET", "HEAD"]).has(request.method)) {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { allow: "GET, HEAD", "cache-control": "no-store" },
    });
  }

  let access;
  try {
    access = await readMyMmsTherapistAccess(request, env);
  } catch (_) {
    return myMmsRecovery(503);
  }

  if (access.status === 401) return myMmsRedirect(request, MY_MMS_THERAPIST_LOGIN_PATH);
  if (access.status === 403) return myMmsRedirect(request, MY_MMS_THERAPIST_ME_PATH);
  if (access.status !== 200) return myMmsRecovery(503);
  if (access.data?.access !== "approved" || access.data?.can_open !== true) {
    return myMmsRedirect(request, MY_MMS_THERAPIST_ME_PATH);
  }

  let upstream;
  try {
    upstream = await globalThis.fetch(new Request(MY_MMS_THERAPIST_PRESENTATION_URL, {
      method: request.method,
      headers: presentationRequestHeaders(request),
      redirect: "follow",
    }));
  } catch (_) {
    return myMmsRecovery(502);
  }

  const type = String(upstream.headers.get("content-type") || "").toLowerCase();
  if (!upstream.ok || !type.includes("text/html")) return myMmsRecovery(502);
  const headers = myMmsPresentationHeaders(upstream.headers, { html: true, rewritten: request.method !== "HEAD" });
  if (request.method === "HEAD") return new Response(null, { status: 200, headers });

  const html = sanitizeMyMmsPresentation(await upstream.text());
  if (!html.includes(MY_MMS_THERAPIST_SHELL_MARKER)) return myMmsRecovery(502);
  return new Response(html, { status: 200, headers });
}

async function readRuntimeScopeFromAirtable(env = {}, scope = "") {
  const apiKey = text(env.AIRTABLE_API_KEY);
  const baseId = text(env.AIRTABLE_BASE_ID);
  const table = text(env.AIRTABLE_TABLE_KENJI_RUNTIME_CONTROLS_ID || KENJI_RUNTIME_TABLE_FALLBACK);
  if (!apiKey || !baseId || !table || !scope) throw new Error("runtime_control_config_missing");

  const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`);
  url.searchParams.set("pageSize", "1");
  url.searchParams.set("maxRecords", "1");
  url.searchParams.set("filterByFormula", `{scope}=\"${escapeFormulaValue(scope)}\"`);
  url.searchParams.set("sort[0][field]", "version");
  url.searchParams.set("sort[0][direction]", "desc");
  url.searchParams.append("fields[]", "enabled_state");
  url.searchParams.append("fields[]", "version");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) throw new Error(`runtime_control_airtable_${response.status}`);
  const payload = await response.json().catch(() => ({}));
  const record = Array.isArray(payload?.records) ? payload.records[0] : null;
  return text(record?.fields?.enabled_state).toLowerCase() === "enabled";
}

export async function readKenjiRuntimeControlsFallback(env = {}) {
  const pairs = await Promise.all(
    KENJI_RUNTIME_SCOPES.map(async (scope) => [scope, await readRuntimeScopeFromAirtable(env, scope)]),
  );
  return Object.fromEntries(pairs);
}

export function buildKenjiSeedRuntimeEnv(env = {}) {
  const sourceEnv = env || {};
  const upstream = Reflect.get(sourceEnv, "ADMIN_WORKER", sourceEnv);
  const originalInternalToken = text(Reflect.get(sourceEnv, "INTERNAL_TOKEN", sourceEnv));

  const adminProxy = {
    async fetch(request) {
      if (runtimeStatusRequest(request)) {
        if (upstream?.fetch && originalInternalToken) {
          try {
            const primary = await upstream.fetch(request);
            if (primary?.ok) return primary;
          } catch (_) {
            // Fall through to the same canonical Runtime Controls table.
          }
        }

        try {
          const controls = await readKenjiRuntimeControlsFallback(sourceEnv);
          return runtimeJson({
            ok: true,
            controls,
            authority: "kenji_runtime_controls_airtable_fallback",
          });
        } catch (_) {
          // Preserve the existing fail-closed behavior if both the service RPC
          // and canonical Runtime Controls table are unavailable.
          return runtimeJson({ ok: false, error: "runtime_control_unavailable" }, 503);
        }
      }

      if (upstream?.fetch && originalInternalToken) return upstream.fetch(request);
      return runtimeJson({ ok: false, error: "service_binding_unavailable" }, 503);
    },
  };

  return new Proxy(sourceEnv, {
    get(target, property) {
      if (property === "ADMIN_WORKER") return adminProxy;
      if (property === "INTERNAL_TOKEN") return originalInternalToken || RUNTIME_STATUS_SENTINEL;
      return Reflect.get(target, property, target);
    },
    has(target, property) {
      if (property === "ADMIN_WORKER" || property === "INTERNAL_TOKEN") return true;
      return Reflect.has(target, property);
    },
  });
}

function seedSmokeRequest(request) {
  if (request.method !== "GET" || request.headers.get("x-mmd-kenji-seed-smoke") !== "1") return request;
  const url = new URL(request.url);
  url.searchParams.set("kenji_seed_smoke", "1");
  const intent = String(request.headers.get("x-mmd-kenji-seed-intent") || "").trim();
  if (intent) url.searchParams.set("intent", intent);
  return new Request(url.toString(), request);
}

export default {
  async fetch(request, env = {}, ctx) {
    if (isMyMmsTherapistAppApiRequest(request)) return forwardMyMmsTherapistAppApi(request, env);
    if (isMyMmsTherapistAppUiRequest(request)) return handleMyMmsTherapistAppUi(request, env);
    if (isKenjiLineTransportHealthRequest(request)) {
      return handleKenjiLineTransportHealth(request, env);
    }
    if (isMmsLineRequest(request)) return handleMmsLineRequest(request, env, ctx);
    if (isMmdRichMenuScheduledRequest(request)) {
      return handleMmdRichMenuScheduledRequest(request, env, ctx);
    }
    if (isKenjiSeedLineRequest(request)) {
      const runtimeEnv = buildKenjiSeedRuntimeEnv(env);
      const tracedRequest = seedSmokeRequest(request);
      return handleKenjiLineWithIngressTrace({
        request: tracedRequest,
        env: runtimeEnv,
        ctx,
        handler: (lineRequest, lineEnv, lineCtx) => handleKenjiSeedLineRequestWithRedeliveryRecovery(
          lineRequest,
          lineEnv,
          lineCtx,
          currentWorker,
        ),
      });
    }
    return currentWorker.fetch(request, env, ctx);
  },
  async scheduled(event, env = {}, ctx) {
    return handleMmdRichMenuScheduled(event, env, ctx);
  },
};

import baseWorker from "./index.js";

const CLIENT_PATH = "/v1/admin/ai-ops/client.js";
const CONTEXT_PATH = "/v1/admin/ai-ops/context";
const CEO_ROOT = "/internal/ceo";

const AUTHORITY = Object.freeze({
  money: "payments-worker",
  entitlement: "my_mmd_entitlement_resolver_v1",
  telegram_drive: "observed_state_only",
  private_model_access: "backend_eligibility_authority",
});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);

    if (request.method === "GET" && path === CLIENT_PATH) {
      const response = await baseWorker.fetch(request, env, ctx);
      if (!response.ok) return response;
      const source = await response.text();
      const patched = source
        .replace(
          "if(!p.startsWith('/internal/admin/'))return;",
          "if(!(p.startsWith('/internal/admin/')||p==='/internal/ceo'||p.startsWith('/internal/ceo/')))return;",
        )
        .replace(
          "if(document.querySelector('[data-mmd-ai-ops]'))return;",
          "if(document.querySelector('[data-mmd-ai-ops-ui]'))return;",
        )
        .replace("h.dataset.mmdAiOps='v1';", "h.dataset.mmdAiOpsUi='v2';");
      const headers = new Headers(response.headers);
      headers.set("cache-control", "public, max-age=30");
      headers.set("x-mmd-ai-ops-client", "v2-ceo-bridge");
      return new Response(patched, { status: response.status, headers });
    }

    if (request.method === "GET" && path === CONTEXT_PATH) {
      const requested = normalizePath(url.searchParams.get("path") || "");
      if (requested === CEO_ROOT) return renderCeoContext(request);
    }

    return baseWorker.fetch(request, env, ctx);
  },
};

async function renderCeoContext(request) {
  const dashboard = await readAdminJson(request, "/v1/admin/dashboard");
  const verified = [];
  const anomalies = [];
  const nextActions = [
    { priority: 1, action: "review_payments", label: "Review Payments", href: "/internal/admin/payments" },
    { priority: 2, action: "review_models", label: "Review Models", href: "/internal/ceo/models" },
    { priority: 3, action: "review_access", label: "Review Membership Access", href: "/internal/admin/membership-access" },
  ];

  if (dashboard.ok) verified.push("Admin dashboard worker responded with authenticated live data.");
  else anomalies.push({
    code: "dashboard_source_unavailable",
    level: "warning",
    text: `Read source unavailable: /v1/admin/dashboard · HTTP ${dashboard.status}`,
  });

  const data = dashboard.data || {};
  const focus = data.focus || {};
  const brief = [];
  if (focus.title || focus.text) brief.push([focus.title, focus.text].filter(Boolean).join(" · "));
  if (!brief.length) brief.push("CEO view reads verified operational state from admin-worker and keeps final authority with Boss Per.");

  return json({
    ok: true,
    schema_version: "mmd_ai_ops_layer_v1",
    page: { path: CEO_ROOT, surface: "ceo", canonical: true },
    context: {},
    verified,
    brief,
    anomalies,
    next_actions: nextActions,
    sources: [{ route: "/v1/admin/dashboard", ok: dashboard.ok, status: dashboard.status }],
    authority: AUTHORITY,
    generated_at: new Date().toISOString(),
  });
}

async function readAdminJson(request, route) {
  const base = new URL(request.url);
  const target = new URL(route, `${base.protocol}//${base.host}`);
  const headers = new Headers({ accept: "application/json" });
  for (const key of ["cookie", "origin", "user-agent"]) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  try {
    const response = await fetch(target.toString(), { method: "GET", headers, redirect: "manual" });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    return { ok: response.ok && data !== null, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

function normalizePath(value = "") {
  const text = String(value || "").split("?")[0].split("#")[0].replace(/\/{2,}/g, "/");
  if (!text) return "/";
  const path = text.startsWith("/") ? text : `/${text}`;
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

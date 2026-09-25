import canonicalWorker from "./control-room-dashboard-ingress-wrapper";
import { CUSTOMER_360_LIVE_CLIENT } from "./customer-360-live-client";
import { CUSTOMER_IDENTITY_ALIGNMENT_CLIENT } from "./customer-identity-alignment-client";
import { CUSTOMER_IDENTITY_EVIDENCE_PROTOCOL_CLIENT } from "./customer-identity-evidence-protocol-client";
import { augmentClientIntelligenceWithIdentityAlignment } from "./customer-identity-alignment";
import type { Env } from "./types";

const CUSTOMER_PAGE = "/internal/admin/customer-data";
const CUSTOMER_QUEUE = "/v1/admin/customer-data/queue";
const CLIENT_INTELLIGENCE = "/v1/admin/clients/intelligence";
const CANONICAL_PUBLIC_ORIGIN = "https://mmdbkk.com";
const WORKERS_DEV_SUFFIX = ".workers.dev";
const SAFE_MEMBERSHIP_CONTEXT_KEYS = ["plan", "package", "tier", "code", "promo", "src", "campaign", "from"];

export function resolveRequestedClientId(searchParams: URLSearchParams): string {
  const clientIds = searchParams.getAll("client_id");
  return clientIds.length === 1 ? String(clientIds[0] || "").trim() : "";
}

function normalizePath(value: string): string {
  const path = String(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function workersDevCanonicalHandoff(url: URL, path: string): Response | null {
  if (!url.hostname.endsWith(WORKERS_DEV_SUFFIX)) return null;

  const directPublicPaths = new Set([
    "/member/dashboard",
    "/sigil/member/membership",
    "/member/payments",
  ]);
  if (directPublicPaths.has(path)) {
    const target = new URL(path, CANONICAL_PUBLIC_ORIGIN);
    target.search = url.search;
    target.hash = url.hash;
    return Response.redirect(target.toString(), 308);
  }

  if (path === "/sigil/pay/renew") {
    const target = new URL("/sigil/pay/renewal", CANONICAL_PUBLIC_ORIGIN);
    target.search = url.search;
    target.hash = url.hash;
    return Response.redirect(target.toString(), 308);
  }

  const token = String(url.searchParams.get("t") || "").trim();
  if (path === "/sigil/pay/membership" || path === "/pay/membership") {
    if (token) {
      const target = new URL("/sigil/pay", CANONICAL_PUBLIC_ORIGIN);
      target.searchParams.set("t", token);
      return Response.redirect(target.toString(), 308);
    }
    const target = new URL("/sigil/member/membership", CANONICAL_PUBLIC_ORIGIN);
    for (const key of SAFE_MEMBERSHIP_CONTEXT_KEYS) {
      const value = url.searchParams.get(key);
      if (value) target.searchParams.set(key, value);
    }
    target.hash = url.hash;
    return Response.redirect(target.toString(), 308);
  }

  if (path === "/sigil/pay/payment") {
    if (token) {
      const target = new URL("/sigil/pay", CANONICAL_PUBLIC_ORIGIN);
      target.searchParams.set("t", token);
      return Response.redirect(target.toString(), 308);
    }
    return Response.redirect(`${CANONICAL_PUBLIC_ORIGIN}/member/payments`, 308);
  }

  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const method = request.method.toUpperCase();
    const publicHandoff = method === "GET" || method === "HEAD"
      ? workersDevCanonicalHandoff(url, path)
      : null;
    if (publicHandoff) return publicHandoff;

    const response = await canonicalWorker.fetch(request, env);
    if (method === "GET" && path === CUSTOMER_PAGE) {
      return decorateCustomer360Page(response, resolveRequestedClientId(url.searchParams));
    }
    if (method === "GET" && path === CUSTOMER_QUEUE) {
      return redactCustomerQueueResponse(response);
    }
    if (method === "GET" && path === CLIENT_INTELLIGENCE) {
      const clientId = resolveRequestedClientId(url.searchParams) || "";
      const augmented = await augmentClientIntelligenceWithIdentityAlignment(
        response,
        env,
        clientId,
      );
      return enforceExactCanonicalClientScope(augmented, clientId);
    }
    return response;
  },
};

export async function decorateCustomer360Page(response: Response, requestedClientId: string | null = null): Promise<Response> {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) return response;
  let html = await response.text();
  if (requestedClientId !== null) {
    const defaultBoot = "load('review_required');summary()})();";
    const scopedBoot = "var requestedParams=new URLSearchParams(location.search),requestedIds=requestedParams.getAll('client_id'),requestedClientId=requestedIds.length===1?String(requestedIds[0]||'').trim():'',validClientScope=/^rec[A-Za-z0-9]{6,32}$/.test(requestedClientId);var queuePanel=q('.work aside'),summaryPanel=q('.summary'),guide=q('.memory-guide'),decision=q('.decision');if(queuePanel)queuePanel.hidden=true;if(summaryPanel)summaryPanel.hidden=true;if(guide)guide.hidden=true;if(decision)decision.hidden=true;if(q('[data-backfill]'))q('[data-backfill]').disabled=true;if(q('[data-refresh]'))q('[data-refresh]').disabled=true;q('[data-state]').textContent=validClientScope?'CANONICAL CLIENT':'CLIENT SCOPE LOCKED';if(!validClientScope){q('[data-empty]').hidden=false;q('[data-empty]').textContent='client_id ไม่ถูกต้องหรือไม่ชัดเจน · หยุดแบบ fail-closed และไม่เปิดคิวลูกค้ารายอื่น'}else{q('[data-list]').innerHTML='<div class=\"empty\">เปิดเฉพาะ Canonical Client ที่เลือก · กำลังตรวจ source scope</div>'}})();";
    if (!html.includes(defaultBoot)) return new Response("customer_scope_contract_unavailable", { status: 503, headers: { "cache-control": "no-store" } });
    html = html.replace(defaultBoot, scopedBoot).replace("</head>", "<style>[hidden]{display:none!important}</style></head>");
  }
  const liveScript = `<script data-mmd-customer-360-live-client="v1">${CUSTOMER_360_LIVE_CLIENT}</script>`;
  const alignmentScript = `<script data-mmd-customer-identity-alignment-client="v1">${CUSTOMER_IDENTITY_ALIGNMENT_CLIENT}</script>`;
  const protocolScript = `<script data-mmd-customer-identity-evidence-protocol-client="v1">${CUSTOMER_IDENTITY_EVIDENCE_PROTOCOL_CLIENT}</script>`;
  const scripts = `${liveScript}${alignmentScript}${protocolScript}`;
  const body = html.includes("</body>") ? html.replace("</body>", `${scripts}</body>`) : `${html}${scripts}`;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("cache-control", "no-store, private");
  headers.set("x-mmd-customer-360", "live-v1");
  headers.set("x-mmd-customer-intelligence", "read-only-v1");
  headers.set("x-mmd-customer-identity-alignment", "read-only-v1");
  headers.set("x-mmd-verified-identity-readiness", "read-only-v1");
  headers.set("x-mmd-identity-evidence-recovery", "read-only-v1");
  headers.set("x-mmd-identity-evidence-owner-review", "read-only-v1");
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

export async function enforceExactCanonicalClientScope(response: Response, requestedClientId: string): Promise<Response> {
  if (!/^rec[A-Za-z0-9]{6,32}$/.test(requestedClientId)) {
    return Response.json({ ok: false, error: "invalid_client_scope" }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) return response;
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  const identity = payload?.identity && typeof payload.identity === "object"
    ? payload.identity as Record<string, unknown>
    : null;
  if (!payload || String(payload.client_id || "").trim() !== requestedClientId || String(identity?.status || "").trim() !== "canonical") {
    return Response.json({ ok: false, error: "client_scope_unresolved" }, { status: 409, headers: { "cache-control": "no-store" } });
  }
  return new Response(JSON.stringify(payload), { status: response.status, statusText: response.statusText, headers: response.headers });
}

export async function redactCustomerQueueResponse(response: Response): Promise<Response> {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) return response;
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!payload || payload.ok === false) return response;
  const cleanRecord = (value: unknown) => {
    if (!value || typeof value !== "object") return value;
    const record = { ...(value as Record<string, unknown>) };
    delete record.summary;
    delete record.raw_note;
    delete record.raw_notes;
    delete record.raw_line_notes;
    return record;
  };
  if (Array.isArray(payload.records)) payload.records = payload.records.map(cleanRecord);
  if (Array.isArray(payload.items)) payload.items = payload.items.map(cleanRecord);
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("cache-control", "no-store, private");
  headers.set("x-mmd-customer-queue-redaction", "raw-summary-removed-v1");
  return new Response(JSON.stringify(payload), { status: response.status, statusText: response.statusText, headers });
}

export { augmentClientIntelligenceWithIdentityAlignment } from "./customer-identity-alignment";

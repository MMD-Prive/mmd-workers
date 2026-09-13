import canonicalWorker from "./control-room-dashboard-ingress-wrapper";
import { CUSTOMER_360_LIVE_CLIENT } from "./customer-360-live-client";
import { CUSTOMER_IDENTITY_ALIGNMENT_CLIENT } from "./customer-identity-alignment-client";
import { augmentClientIntelligenceWithIdentityAlignment } from "./customer-identity-alignment";
import type { Env } from "./types";

const CUSTOMER_PAGE = "/internal/admin/customer-data";
const CUSTOMER_QUEUE = "/v1/admin/customer-data/queue";
const CLIENT_INTELLIGENCE = "/v1/admin/clients/intelligence";

function normalizePath(value: string): string {
  const path = String(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const response = await canonicalWorker.fetch(request, env);
    if (request.method.toUpperCase() === "GET" && path === CUSTOMER_PAGE) {
      return decorateCustomer360Page(response);
    }
    if (request.method.toUpperCase() === "GET" && path === CUSTOMER_QUEUE) {
      return redactCustomerQueueResponse(response);
    }
    if (request.method.toUpperCase() === "GET" && path === CLIENT_INTELLIGENCE) {
      return augmentClientIntelligenceWithIdentityAlignment(
        response,
        env,
        String(url.searchParams.get("client_id") || "").trim(),
      );
    }
    return response;
  },
};

export async function decorateCustomer360Page(response: Response): Promise<Response> {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) return response;
  const html = await response.text();
  const liveScript = `<script data-mmd-customer-360-live-client="v1">${CUSTOMER_360_LIVE_CLIENT}</script>`;
  const alignmentScript = `<script data-mmd-customer-identity-alignment-client="v1">${CUSTOMER_IDENTITY_ALIGNMENT_CLIENT}</script>`;
  const scripts = `${liveScript}${alignmentScript}`;
  const body = html.includes("</body>") ? html.replace("</body>", `${scripts}</body>`) : `${html}${scripts}`;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("cache-control", "no-store, private");
  headers.set("x-mmd-customer-360", "live-v1");
  headers.set("x-mmd-customer-intelligence", "read-only-v1");
  headers.set("x-mmd-customer-identity-alignment", "read-only-v1");
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
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

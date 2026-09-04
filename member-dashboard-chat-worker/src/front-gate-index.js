import worker from "./index.js";
import { observeKenjiLineWebhook } from "./kenji-ai-worker-line-bridge.mjs";
export { KenjiModelIdempotency } from "./index.js";

const WORKER_NAME = "member-dashboard-chat-worker";
const MEMBER_APP_API_PREFIX = "/api/member/app/";
const PUBLIC_CARE_BACK_PATHS = new Set([
  "/member/api/care-back/public-wish",
  "/member/api/care-back/public-wish/",
  "/member/api/care-back/link-wish",
  "/member/api/care-back/link-wish/",
]);
const LINE_WEBHOOK_PATHS = new Set(["/webhooks/line", "/webhooks/line/", "/webhook/line", "/webhook/line/"]);

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-mmd-worker": WORKER_NAME,
    },
  });
}

async function forwardMemberPages(request, env) {
  if (!env.MEMBER_PAGES_WORKER?.fetch) {
    return json({ ok: false, error: { code: "MEMBER_PAGES_UPSTREAM_NOT_CONFIGURED", message: "Member service is unavailable." } }, 503);
  }

  const upstreamResponse = await env.MEMBER_PAGES_WORKER.fetch(new Request(request.url, request));
  const headers = new Headers(upstreamResponse.headers);
  headers.set("x-mmd-worker", WORKER_NAME);
  headers.set("x-mmd-route-owner", WORKER_NAME);
  headers.set("x-mmd-upstream-service", "member-pages-worker");
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers,
  });
}

function recordBridgeTelemetry(result = {}) {
  console.log(JSON.stringify({
    kenji_ai_worker_bridge: "line_observation",
    enabled: result.enabled === true,
    events: Number(result.events) || 0,
    observed: Number(result.observed) || 0,
    succeeded: Number(result.succeeded) || 0,
    evidence_incomplete: Number(result.evidence_incomplete) || 0,
    ok: result.ok === true,
  }));
}

export default {
  async fetch(request, env = {}, ctx) {
    const path = new URL(request.url).pathname.toLowerCase().replace(/\/{2,}/g, "/");
    if (PUBLIC_CARE_BACK_PATHS.has(path) || path.startsWith(MEMBER_APP_API_PREFIX)) {
      return forwardMemberPages(request, env);
    }

    const shouldObserveLine = request.method === "POST" && LINE_WEBHOOK_PATHS.has(path);
    const observerRequest = shouldObserveLine ? request.clone() : null;
    const response = await worker.fetch(request, env, ctx);

    // The core LINE handler owns signature verification. Observe only after it
    // accepts the signed webhook. This is a read-only shadow call and never
    // changes customer replies, payment truth, membership, points, or access.
    if (observerRequest && response.ok) {
      const observation = observeKenjiLineWebhook({ request: observerRequest, env })
        .then((result) => {
          recordBridgeTelemetry(result);
          return result;
        })
        .catch(() => {
          recordBridgeTelemetry({ ok: false, enabled: true, events: 0, observed: 0, succeeded: 0, evidence_incomplete: 0 });
        });
      if (typeof ctx?.waitUntil === "function") ctx.waitUntil(observation);
      else await observation;
    }

    return response;
  },
};

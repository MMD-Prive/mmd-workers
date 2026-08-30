import worker from "./index.js";

const WORKER_NAME = "member-dashboard-chat-worker";
const PUBLIC_CARE_BACK_PATHS = new Set([
  "/member/api/care-back/public-wish",
  "/member/api/care-back/public-wish/",
  "/member/api/care-back/link-wish",
  "/member/api/care-back/link-wish/",
]);

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

export default {
  async fetch(request, env = {}, ctx) {
    const path = new URL(request.url).pathname.toLowerCase().replace(/\/{2,}/g, "/");
    if (PUBLIC_CARE_BACK_PATHS.has(path)) return forwardMemberPages(request, env);
    return worker.fetch(request, env, ctx);
  },
};

import { isTmibAct001ContentPath, handleTmibAct001Content } from "./tmib-act001-content.js";
import { isTmibStoryAccessPath, handleTmibStoryAccess } from "./tmib-story-access.js";

// Preserve the origin policy of the approved production reader.
const WEB_ORIGINS = new Set([
  "https://mmdprive.canvas.webflow.com", "https://www.mmdbkk.com", "https://mmdbkk.com",
]);

export function isTmibPublicReaderRequest(request) {
  return new URL(request.url).pathname.startsWith("/member/api/liff/tmib/episodes/");
}

export async function handleTmibPublicReader(request, env = {}) {
  const url = new URL(request.url);
  let response;
  if (request.method === "OPTIONS") {
    response = new Response(null, { status: 204, headers: { "access-control-allow-methods": "GET, OPTIONS" } });
  } else if (isTmibAct001ContentPath(url)) {
    response = await handleTmibAct001Content(request, env);
  } else if (isTmibStoryAccessPath(url)) {
    response = await handleTmibStoryAccess(request, env);
  } else {
    response = Response.json({ ok: false, error: { code: "TMIB_ROUTE_NOT_FOUND" } }, {
      status: 404, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  }
  const headers = new Headers(response.headers);
  headers.set("vary", "Origin");
  const origin = request.headers.get("origin") || "";
  if (WEB_ORIGINS.has(origin)) headers.set("access-control-allow-origin", origin);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

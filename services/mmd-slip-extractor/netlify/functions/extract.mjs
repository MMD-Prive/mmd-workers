import { randomUUID } from "node:crypto";

import { extractOcr, extractQr, normalizedResponse, readImageRequest, safeBearerMatch } from "../../lib/extractor.mjs";

const json = (body, status = 200, requestId = randomUUID()) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-request-id": requestId },
});

export default async function handler(request) {
  const requestId = request.headers.get("x-request-id") || randomUUID();
  const pathname = new URL(request.url).pathname;
  if (pathname === "/health") return request.method === "GET" ? json({ ok: true, service: "mmd-slip-extractor" }, 200, requestId) : json({ error: "method_not_allowed" }, 405, requestId);
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, requestId);
  if (!safeBearerMatch(request.headers.get("authorization"), Netlify.env.get("MMD_SLIP_EXTRACTOR_TOKEN"))) return json({ error: "unauthorized" }, 401, requestId);
  try {
    const image = await readImageRequest(request, Netlify.env.get("MMD_SLIP_EXTRACTOR_MAX_BYTES"));
    const result = pathname === "/v1/extract/qr"
      ? await extractQr(image.bytes)
      : pathname === "/v1/extract/ocr"
        ? await extractOcr(image.bytes)
        : null;
    return result ? json(normalizedResponse(result), 200, requestId) : json({ error: "not_found" }, 404, requestId);
  } catch (error) {
    return json({ error: error?.status ? error.message : "extraction_failed" }, Number(error?.status) || 500, requestId);
  }
}

export const config = {
  path: ["/health", "/v1/extract/qr", "/v1/extract/ocr"],
  memory: 1024,
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ["ip", "domain"] },
};

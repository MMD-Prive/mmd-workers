import legacyWorker from "./index.js";

const WEBFLOW_PATH = "/v1/private-care/submit";
const LEGACY_PATH = "/member/api/recovery/complaint-evidence";
const PRIVATE_CASE_KEY_PREFIX = "mmd:private-care:webflow:v2:";
const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }), request, env);
    }

    if (url.pathname !== WEBFLOW_PATH) {
      return legacyWorker.fetch(request, env, ctx);
    }

    if (request.method !== "POST") {
      return withCors(json({ ok: false, error: "method_not_allowed" }, 405), request, env);
    }

    try {
      const contentType = request.headers.get("content-type") || "";
      if (!/multipart\/form-data/i.test(contentType)) {
        return withCors(json({ ok: false, error: "invalid
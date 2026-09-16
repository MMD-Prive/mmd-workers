const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;
const EXTRACTION_PATHS = new Set(["/v1/extract/qr", "/v1/extract/ocr"]);
const ALLOWED_PRODUCTION_CALLERS = new Set(["member-dashboard-chat-worker", "admin-worker"]);

function clean(value) {
  return String(value ?? "").trim();
}

function runtimeScope(env = {}) {
  const scope = clean(env.MMD_RUNTIME_SCOPE).toLowerCase();
  return scope === "production" ? "production" : scope === "staging" ? "staging" : "invalid";
}

function workerName(env = {}) {
  return runtimeScope(env) === "production" ? "mmd-slip-extractor" : "mmd-slip-extractor-staging";
}

function requestId(value) {
  const candidate = clean(value);
  return /^[A-Za-z0-9._-]{1,64}$/.test(candidate) ? candidate : crypto.randomUUID();
}

function json(payload, status, id, env = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-request-id": id,
      "x-mmd-worker": workerName(env),
    },
  });
}

function maxBytes(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_MAX_BYTES;
  return Math.min(Math.floor(parsed), DEFAULT_MAX_BYTES);
}

async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

export async function safeBearerMatch(header, expected) {
  const supplied = clean(header).replace(/^Bearer\s+/i, "");
  const wanted = clean(expected);
  if (!supplied || !wanted) return false;
  const [left, right] = await Promise.all([sha256(supplied), sha256(wanted)]);
  let diff = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return diff === 0;
}

function productionServiceBindingAuthorized(request) {
  const internal = clean(request.headers.get("x-mmd-internal-call")).toLowerCase() === "true";
  const caller = clean(request.headers.get("x-mmd-service-binding"));
  return internal && ALLOWED_PRODUCTION_CALLERS.has(caller);
}

async function extractionAuthorized(request, env) {
  const scope = runtimeScope(env);
  if (scope === "production") return productionServiceBindingAuthorized(request);
  if (scope === "staging") return safeBearerMatch(request.headers.get("authorization"), env.MMD_SLIP_EXTRACTOR_TOKEN);
  return false;
}

function forwardedRequest(request, id, env = {}) {
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  const contentLength = request.headers.get("content-length");
  if (contentType) headers.set("content-type", contentType);
  if (contentLength) headers.set("content-length", contentLength);
  headers.set("x-request-id", id);
  headers.set("x-mmd-internal-edge", `${workerName(env)}-edge`);
  return new Request(request, { headers });
}

function safeContainerResponse(response, id, env = {}) {
  const headers = new Headers({
    "content-type": response.headers.get("content-type") || "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-request-id": response.headers.get("x-request-id") || id,
    "x-mmd-worker": workerName(env),
  });
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export async function handleExtractorRequest(request, env, dependencies) {
  const id = requestId(request.headers.get("x-request-id"));
  const scope = runtimeScope(env);
  if (scope === "invalid") return json({ error: "runtime_scope_invalid" }, 503, id, env);

  const url = new URL(request.url);
  const isHealth = url.pathname === "/health";
  const isExtraction = EXTRACTION_PATHS.has(url.pathname);
  if ((!isHealth && !isExtraction) || (isHealth && request.method !== "GET") || (isExtraction && request.method !== "POST")) {
    return json({ error: "not_found" }, 404, id, env);
  }

  // Production has no public route. Even /health is visible only through an
  // approved private service binding so this never becomes payment authority.
  if (scope === "production" && !productionServiceBindingAuthorized(request)) {
    return json({ error: "not_found" }, 404, id, env);
  }

  if (isExtraction) {
    if (!(await extractionAuthorized(request, env))) return json({ error: "unauthorized" }, 401, id, env);
    const declared = Number(request.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes(env.MMD_SLIP_EXTRACTOR_MAX_BYTES)) {
      return json({ error: "image_too_large" }, 413, id, env);
    }
  }

  if (!env.SLIP_EXTRACTOR || typeof dependencies?.getContainer !== "function") {
    return json({ error: "extractor_unavailable" }, 503, id, env);
  }

  try {
    const container = dependencies.getContainer(env.SLIP_EXTRACTOR, `${scope}-singleton`);
    const response = await container.fetch(forwardedRequest(request, id, env));
    return safeContainerResponse(response, id, env);
  } catch {
    console.error(JSON.stringify({ event: "mmd_slip_extractor_container_error", request_id: id, scope, path: url.pathname, status: 503 }));
    return json({ error: "extractor_unavailable" }, 503, id, env);
  }
}

export const EXTRACTOR_INTERNALS = Object.freeze({
  ALLOWED_PRODUCTION_CALLERS,
  extractionAuthorized,
  productionServiceBindingAuthorized,
  runtimeScope,
  workerName,
});

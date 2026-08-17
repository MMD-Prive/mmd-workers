const WORKER_NAME = "mmd-slip-extractor-staging";
const INTERNAL_EDGE_MARKER = "mmd-slip-extractor-staging-edge";
const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;
const EXTRACTION_PATHS = new Set(["/v1/extract/qr", "/v1/extract/ocr"]);

function clean(value) {
  return String(value ?? "").trim();
}

function requestId(value) {
  const candidate = clean(value);
  return /^[A-Za-z0-9._-]{1,64}$/.test(candidate) ? candidate : crypto.randomUUID();
}

function json(payload, status, id) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-request-id": id,
      "x-mmd-worker": WORKER_NAME
    }
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

function forwardedRequest(request, id) {
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  const contentLength = request.headers.get("content-length");
  if (contentType) headers.set("content-type", contentType);
  if (contentLength) headers.set("content-length", contentLength);
  headers.set("x-request-id", id);
  headers.set("x-mmd-internal-edge", INTERNAL_EDGE_MARKER);
  return new Request(request, { headers });
}

function safeContainerResponse(response, id) {
  const headers = new Headers({
    "content-type": response.headers.get("content-type") || "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-request-id": response.headers.get("x-request-id") || id,
    "x-mmd-worker": WORKER_NAME
  });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export async function handleExtractorRequest(request, env, dependencies) {
  const id = requestId(request.headers.get("x-request-id"));
  if (clean(env.MMD_RUNTIME_SCOPE) !== "staging") {
    return json({ error: "staging_scope_required" }, 503, id);
  }

  const url = new URL(request.url);
  const isHealth = url.pathname === "/health";
  const isExtraction = EXTRACTION_PATHS.has(url.pathname);
  if ((!isHealth && !isExtraction) || (isHealth && request.method !== "GET") || (isExtraction && request.method !== "POST")) {
    return json({ error: "not_found" }, 404, id);
  }

  if (isExtraction) {
    const authorized = await safeBearerMatch(
      request.headers.get("authorization"),
      env.MMD_SLIP_EXTRACTOR_TOKEN
    );
    if (!authorized) return json({ error: "unauthorized" }, 401, id);

    const declared = Number(request.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes(env.MMD_SLIP_EXTRACTOR_MAX_BYTES)) {
      return json({ error: "image_too_large" }, 413, id);
    }
  }

  if (!env.SLIP_EXTRACTOR || typeof dependencies?.getContainer !== "function") {
    return json({ error: "extractor_unavailable" }, 503, id);
  }

  try {
    const container = dependencies.getContainer(env.SLIP_EXTRACTOR, "staging-singleton");
    const response = await container.fetch(forwardedRequest(request, id));
    return safeContainerResponse(response, id);
  } catch {
    console.error(JSON.stringify({
      event: "mmd_slip_extractor_container_error",
      request_id: id,
      path: url.pathname,
      status: 503
    }));
    return json({ error: "extractor_unavailable" }, 503, id);
  }
}

export const INTERNAL_EDGE_HEADER_VALUE = INTERNAL_EDGE_MARKER;

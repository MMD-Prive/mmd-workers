import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

import {
  extractOcr,
  extractQr,
  normalizedResponse,
  readImageRequest
} from "../lib/extractor.mjs";

const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;
const INTERNAL_EDGE_MARKER = "mmd-slip-extractor-staging-edge";
const EXTRACTION_PATHS = new Set(["/v1/extract/qr", "/v1/extract/ocr"]);

function clean(value) {
  return String(value ?? "").trim();
}

function maxBytes() {
  const parsed = Number(process.env.MMD_SLIP_EXTRACTOR_MAX_BYTES);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_MAX_BYTES;
  return Math.min(Math.floor(parsed), DEFAULT_MAX_BYTES);
}

function requestId(value) {
  const candidate = clean(value);
  return /^[A-Za-z0-9._-]{1,64}$/.test(candidate) ? candidate : randomUUID();
}

function writeJson(response, body, status, id) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-request-id": id
  });
  response.end(JSON.stringify(body));
}

async function readBody(request, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) {
      throw Object.assign(new Error("image_too_large"), { status: 413 });
    }
    chunks.push(chunk);
  }
  if (!size) throw Object.assign(new Error("image_empty"), { status: 400 });
  return Buffer.concat(chunks, size);
}

const server = createServer(async (request, response) => {
  const id = requestId(request.headers["x-request-id"]);
  const url = new URL(request.url || "/", "http://localhost");

  if (url.pathname === "/health") {
    if (request.method !== "GET") return writeJson(response, { error: "not_found" }, 404, id);
    return writeJson(response, { ok: true, service: "mmd-slip-extractor", runtime: "cloudflare-container-staging" }, 200, id);
  }

  if (request.method !== "POST" || !EXTRACTION_PATHS.has(url.pathname)) {
    return writeJson(response, { error: "not_found" }, 404, id);
  }

  if (request.headers["x-mmd-internal-edge"] !== INTERNAL_EDGE_MARKER) {
    return writeJson(response, { error: "internal_edge_required" }, 401, id);
  }

  try {
    const limit = maxBytes();
    const declared = Number(request.headers["content-length"]);
    if (Number.isFinite(declared) && declared > limit) {
      throw Object.assign(new Error("image_too_large"), { status: 413 });
    }

    const bytes = await readBody(request, limit);
    const imageRequest = new Request("http://container.local" + url.pathname, {
      method: "POST",
      headers: { "content-type": clean(request.headers["content-type"]) },
      body: bytes
    });
    const image = await readImageRequest(imageRequest, limit);
    const result = url.pathname === "/v1/extract/qr"
      ? await extractQr(image.bytes)
      : await extractOcr(image.bytes);
    return writeJson(response, normalizedResponse(result), 200, id);
  } catch (error) {
    const status = Number(error?.status) || 500;
    if (status >= 500) {
      console.error(JSON.stringify({
        event: "mmd_slip_extractor_failed",
        request_id: id,
        path: url.pathname,
        status
      }));
    }
    return writeJson(response, { error: status >= 500 ? "extraction_failed" : error.message }, status, id);
  }
});

const parsedPort = Number.parseInt(process.env.PORT || "8080", 10);
const port = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535 ? parsedPort : 8080;

server.on("error", (error) => {
  console.error(JSON.stringify({
    event: "mmd_slip_extractor_server_error",
    message: error instanceof Error ? error.message : String(error),
    port
  }));
  process.exitCode = 1;
});

server.listen(port, "0.0.0.0", () => {
  console.log(JSON.stringify({
    event: "mmd_slip_extractor_server_listening",
    host: "0.0.0.0",
    port
  }));
});

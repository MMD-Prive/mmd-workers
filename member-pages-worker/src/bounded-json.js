export const PUBLIC_JSON_BODY_MAX_BYTES = 16 * 1024;
export const INTERNAL_JSON_BODY_MAX_BYTES = 8 * 1024;

export async function readBoundedJsonObject(request, maxBytes) {
  if (!Number.isInteger(maxBytes) || maxBytes < 1) {
    throw new TypeError("maxBytes must be a positive integer");
  }
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") || "")) {
    return invalidJson();
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);
    if (!Number.isInteger(declaredBytes) || declaredBytes < 0) return invalidJson();
    if (declaredBytes > maxBytes) return oversizedJson();
  }

  const reader = request.body?.getReader();
  if (!reader) return invalidJson();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytesRead = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        await reader.cancel("request body exceeds limit").catch(() => undefined);
        return oversizedJson();
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) return invalidJson();
    return { ok: true, value };
  } catch {
    return invalidJson();
  } finally {
    reader.releaseLock();
  }
}

function invalidJson() {
  return { ok: false, status: 400, code: "INVALID_INPUT", message: "A valid JSON object is required." };
}

function oversizedJson() {
  return { ok: false, status: 413, code: "REQUEST_BODY_TOO_LARGE", message: "The JSON request body is too large." };
}

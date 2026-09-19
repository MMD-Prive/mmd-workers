export async function isPrivatePromotionRequest(request, env) {
  const url = new URL(request.url);
  if (url.hostname !== "payments-worker.local") return false;
  if (request.headers.get("x-mmd-service-binding") !== "promotion-worker") return false;
  const expected = String(env.INTERNAL_SERVICE_SECRET || "");
  const supplied = String(request.headers.get("x-mmd-internal-secret") || "");
  if (expected.length < 24) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
    crypto.subtle.digest("SHA-256", encoder.encode(supplied)),
  ]);
  const a = new Uint8Array(left); const b = new Uint8Array(right); let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

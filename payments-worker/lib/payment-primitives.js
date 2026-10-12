// Shared, behaviour-identical primitives for payments-worker modules.
// These were previously copy-pasted into ~15 modules. Only definitions that were
// byte-for-byte equivalent (ignoring whitespace) were replaced by these exports.

/** Escape a value for use inside a single-quoted Airtable formula string. */
export function formulaValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Error carrying an HTTP status, caught by route handlers. */
export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/** Constant-time string comparison via SHA-256 digests (inputs trimmed). */
export async function constantTimeEqual(left, right) {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(String(left ?? "").trim())),
    crypto.subtle.digest("SHA-256", encoder.encode(String(right ?? "").trim())),
  ]);
  const aa = new Uint8Array(a);
  const bb = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < aa.length; i += 1) difference |= aa[i] ^ bb[i];
  return difference === 0;
}

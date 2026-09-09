import { serviceUnavailable } from "../lib/errors.js";

// Deprecated compatibility shim. ai-worker must consume reviewed canonical context instead of inventing admin truth.
export async function fetchAdminSignals() {
  throw serviceUnavailable("Direct admin signal connector is not configured; use the canonical context contract");
}

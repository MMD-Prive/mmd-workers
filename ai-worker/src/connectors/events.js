import { serviceUnavailable } from "../lib/errors.js";

// Event truth belongs to the canonical event owner; ai-worker is read-only intelligence.
export async function fetchEventSignals() {
  throw serviceUnavailable("Direct event connector is disabled; use canonical context");
}

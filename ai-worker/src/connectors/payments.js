import { serviceUnavailable } from "../lib/errors.js";

// Payment truth belongs to the canonical payment-verification owner, never ai-worker.
export async function fetchPaymentSignals() {
  throw serviceUnavailable("Direct payment connector is disabled; use verified canonical context");
}

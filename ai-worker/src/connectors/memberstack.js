import { serviceUnavailable } from "../lib/errors.js";

// Memberstack is not a membership or entitlement authority for Kenji.
export async function getMemberstackProfile() {
  throw serviceUnavailable("Memberstack compatibility connector is disabled; use canonical member context");
}

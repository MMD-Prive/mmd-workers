const COMMANDS = new Set([
  "checkpts", "check point", "check points", "checkpoint", "เช็คสิทธิ์", "เช็กสิทธิ์",
]);

// Only the signed Seed handler can request lightweight canonical intake.
// A webhook body/header cannot set this request-scoped, in-process marker.
export const CHECKPTS_INTAKE = Symbol("checkpts_intake");

export function isCheckptsShortcut(event = {}) {
  if (event.type !== "message" || event.message?.type !== "text" || event.source?.type !== "user") return false;
  const command = String(event.message.text || "").normalize("NFKC")
    .replace(/[\u200B\uFEFF]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
  return COMMANDS.has(command);
}

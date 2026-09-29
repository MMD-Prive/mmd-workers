import fs from "node:fs";
import path from "node:path";

const manifestPath = path.resolve("ops/release-gates/app-sigil-always-on.json");
const gate = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const required = [
  "production_route_smoke",
  "real_line_liff_session_chain",
  "my_mmd_history_points_customer_requests",
  "mmd_app_job_handoff",
  "sigil_search_approved_public_media",
  "sigil_search_no_private_media_leak",
  "campaign_destination_smoke",
];

if (gate.schema !== "mmd.app_sigil_always_on_release_gate.v1") {
  throw new Error("unexpected release-gate schema");
}
for (const key of required) {
  if (!gate.gates?.[key]) throw new Error("missing release gate: " + key);
  const item = gate.gates[key];
  if (!["pending", "pass"].includes(item.status)) throw new Error("invalid status for " + key);
  if (item.status === "pass" && !String(item.evidence || "").trim()) {
    throw new Error("pass requires evidence for " + key);
  }
}
const allPass = required.every((key) => gate.gates[key].status === "pass");
if (gate.decision === "ready") {
  if (!allPass) throw new Error("decision ready requires every gate to pass");
  if (gate.campaign_enabled !== true) throw new Error("ready requires campaign_enabled=true");
}
if (gate.campaign_enabled === true && !allPass) {
  throw new Error("campaign cannot be enabled before every gate passes");
}
console.log(JSON.stringify({ ok: true, decision: gate.decision, campaign_enabled: gate.campaign_enabled, all_pass: allPass }));

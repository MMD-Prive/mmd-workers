import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL("./src/per-rename-client-search.js", import.meta.url),
  "utf8",
);

const required = [
  [/remembered_name:\s*perName/, "remembered_name must expose the authoritative Per Rename"],
  [/current_line_rename:\s*perName/, "current_line_rename must stay aligned to the authoritative Per Rename"],
  [/per_rename:\s*perName/, "per_rename must be present for current UI clients"],
  [/canonical_name:\s*canonicalName/, "canonical_name must remain available as the stable client label"],
  [/client_name:\s*perName\s*\|\|\s*canonicalName\s*\|\|\s*query/, "client_name must prefer Per Rename before canonical fallback"],
  [/matched_on:\s*"per_rename"/, "matched_on must identify the Per Rename resolution path"],
  [/lookup_chain:\s*\["pre_session_client_index",\s*"per_rename",\s*"canonical_client"\]/, "lookup_chain must show Per Rename to canonical Client resolution"],
  [/identity_status:\s*"canonical_client_linked"/, "identity_status must expose canonical linkage"],
  [/per_rename_authoritative:\s*true/, "backend must explicitly mark authoritative Per Rename results"],
];

for (const [pattern, message] of required) {
  assert.match(source, pattern, message);
}

console.log("Per Rename cross-surface contract guard passed.");

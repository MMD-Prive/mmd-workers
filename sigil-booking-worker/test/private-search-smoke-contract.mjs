import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function isPrivateSearchFailClosed(body) {
  return body !== null
    && typeof body === "object"
    && !Array.isArray(body)
    && body.ok === true
    && body.matched === false
    && body.blocked === true
    && body.reason === "private_requires_active_member"
    && body.access_scope === "public_only"
    && body.visibility_enforced === true
    && Array.isArray(body.allowed_model_folders)
    && body.allowed_model_folders.length === 0
    && Array.isArray(body.items)
    && body.items.length === 0
    && (!Object.hasOwn(body, "model") || body.model === null);
}

export function assertPrivateSearchFailClosed(body) {
  if (!isPrivateSearchFailClosed(body)) {
    throw new Error("Private-search fail-closed smoke contract failed");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    assertPrivateSearchFailClosed(JSON.parse(readFileSync(process.argv[2], "utf8")));
  } catch {
    console.error("Private-search fail-closed smoke contract failed");
    process.exitCode = 1;
  }
}

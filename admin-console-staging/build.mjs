import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sha = "217a23730c4c70a7f2cb68e550bf7a74227ae424";
const directory = fileURLToPath(new URL("./", import.meta.url));
const output = fileURLToPath(new URL("./.build/", import.meta.url));
mkdirSync(output, { recursive: true });
const archive = execFileSync("git", ["archive", sha,
  "admin-worker", "auth-worker", "events-worker", "immigrate-worker",
  "member-dashboard-chat-worker", "member-pages-worker", "partners-worker",
  "payments-worker", "shared", "sigil-booking-worker", "webflow/global",
], { cwd: fileURLToPath(new URL("..", import.meta.url)), maxBuffer: 100 * 1024 * 1024 });
execFileSync("tar", ["-xf", "-", "-C", output], { input: archive });
copyFileSync(directory + "staging.mjs", output + "staging.mjs");

const origin = "https://mmd-admin-console-3143-staging.malemodel-bkk.workers.dev";
function edit(path, from, to) {
  const file = output + path;
  const source = readFileSync(file, "utf8");
  if (source.split(from).length !== 2) throw new Error("Pinned source mismatch: " + path);
  writeFileSync(file, source.replace(from, () => to));
}

edit("admin-worker/src/credential-bound-admin-session.js",
  "const ALLOWED_ORIGINS = new Set([\n", "const ALLOWED_ORIGINS = new Set([\n  " + JSON.stringify(origin) + ",\n");
edit("webflow/global/admin-console-views.mjs", '["https://mmdbkk.com", "https://www.mmdbkk.com"]',
  JSON.stringify([origin]));

edit("admin-worker/src/admin-login-hero-worker-core.js",
  'const ADMIN_GATE_ALLOWED_BASE_URLS = new Set([\n  "https://mmdbkk.com",\n  "https://www.mmdbkk.com",\n]);',
  "const ADMIN_GATE_ALLOWED_BASE_URLS = new Set([" + JSON.stringify(origin) + "]);");

edit("admin-worker/src/admin-login-hero-worker-core.js",
  'new URL(raw, "https://mmdbkk.com")', "new URL(raw, " + JSON.stringify(origin) + ")");
const resolver = "admin-worker/src/per-rename-client-search.js";
edit(resolver, 'import { parsePerRenameDateSuffix }', 'import { readFixture } from "../../staging.mjs";\nimport { parsePerRenameDateSuffix }');
edit(resolver, "await fetch(url, {", "await readFixture(url, {");
edit(resolver, 'await fetch(`${AIRTABLE_API}', 'await readFixture(`${AIRTABLE_API}');

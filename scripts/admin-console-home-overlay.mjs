// Pure Console-home overlay. Importing this module never accesses production.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const BASELINE_VERSION = '51ae638f-55b5-40f2-a0fb-2a0f7e40c8f5';
export const BASELINE_DEPLOYMENT = '8eb1667c-28d0-4410-896d-9357f979b8a4';
export const BASELINE_SOURCE = '4339243b286e2c4844abd49172a828f25c4f5c1e';
export const SOURCE_PARENT = '01d3c05a1b3943a4d1fbf812094cf8090799f572';
export const LIVE_SHA256 = 'ae3509889e56ea7756be7a913f706461c9cfa5a37b223c45c40b7345904457e5';
export const digest = value => createHash('sha256').update(value).digest('hex');
export const RUNTIME_PATHS = Object.freeze([
  "admin-worker/src/admin-login-hero-worker-core.js",
  "admin-worker/src/admin-login-hero-worker.js",
  "admin-worker/src/admin-login-page.js",
  "admin-worker/src/admin-console-page.js"
]);
export const SOURCE_HASHES = Object.freeze({
  "admin-worker/src/admin-login-hero-worker-core.js": "6a6c5201bbcba65b09b0b3dc467a28320dc621f0f1979686dcb66b3c1f8256ed",
  "admin-worker/src/admin-login-hero-worker.js": "9391490a76c814c06836ed92db3a5ee71fd768a174067e7598cf14fa735ae667",
  "admin-worker/src/admin-login-page.js": "90abc32380c9e2c38a0e7aea56266b07c297701d021a90ee1e3bcccc298aad79",
  "admin-worker/src/admin-console-page.js": "0bb533adeb4010d94c8b7b976713c35b3ba05d4cccf67186dd5e3bb684cf8478"
});

// Each edit is unique in the reviewed deployed module. Reverse every edit
// before accepting the candidate; all other runtime bytes must remain exact.
const HOME_PATCHES = Object.freeze([
  {
    "name": "owner-home",
    "path": "admin-worker/src/admin-login-hero-worker-core.js",
    "before": "var ADMIN_OWNER_DASHBOARD_PATH = \"/internal/admin/dashboard\";\n",
    "after": "var ADMIN_OWNER_DASHBOARD_PATH = \"/internal/admin/console\";\n"
  },
  {
    "name": "core-home-alias",
    "path": "admin-worker/src/admin-login-hero-worker-core.js",
    "before": "      const target2 = new URL(\"/internal/admin/control-room\", request.url);\n",
    "after": "      const target2 = new URL(\"/internal/admin/console\", request.url);\n"
  },
  {
    "name": "home-entry-marker",
    "path": "admin-worker/src/admin-login-hero-worker-core.js",
    "before": "          \"x-mmd-admin-entry\": \"control-room\"\n",
    "after": "          \"x-mmd-admin-entry\": \"console\"\n"
  },
  {
    "name": "safe-return-fallback",
    "path": "admin-worker/src/admin-login-hero-worker-core.js",
    "before": "function sanitizeNextPath(value3) {\n  const fallback = \"/internal/admin/control-room\";",
    "after": "function sanitizeNextPath(value3) {\n  const fallback = \"/internal/admin/console\";"
  },
  {
    "name": "login-renderer-default",
    "path": "admin-worker/src/admin-login-page.js",
    "before": "function renderApprovedAdminLogin(request, { status = 200, error = \"\", next = \"/internal/admin/control-room\" } = {}) {\n",
    "after": "function renderApprovedAdminLogin(request, { status = 200, error = \"\", next = \"/internal/admin/console\" } = {}) {\n"
  },
  {
    "name": "login-submit-fallback",
    "path": "admin-worker/src/admin-login-page.js",
    "before": "document.getElementById('adminNext').value||'/internal/admin/control-room'",
    "after": "document.getElementById('adminNext').value||'/internal/admin/console'"
  },
  {
    "name": "login-success-fallback",
    "path": "admin-worker/src/admin-login-page.js",
    "before": "payload.next||'/internal/admin/control-room'",
    "after": "payload.next||'/internal/admin/console'"
  },
  {
    "name": "desktop-home-link",
    "path": "admin-worker/src/admin-console-page.js",
    "before": "      <a class=\"ac-brand\" href=\"/internal/admin/control-room\" aria-label=\"S\\u012AGIL System \\xB7 Control Room\">${SYSTEM_LIGHT}</a>\n",
    "after": "      <a class=\"ac-brand\" href=\"${ADMIN_CONSOLE_PATH}\" aria-label=\"S\\u012AGIL System \\xB7 Console\">${SYSTEM_LIGHT}</a>\n"
  },
  {
    "name": "mobile-home-link",
    "path": "admin-worker/src/admin-console-page.js",
    "before": "        <a class=\"ac-mobile-brand\" href=\"/internal/admin/control-room\" aria-label=\"S\\u012AGIL System \\xB7 Control Room\">${SYSTEM_LIGHT}</a>\n",
    "after": "        <a class=\"ac-mobile-brand\" href=\"${ADMIN_CONSOLE_PATH}\" aria-label=\"S\\u012AGIL System \\xB7 Console\">${SYSTEM_LIGHT}</a>\n"
  },
  {
    "name": "workspace-home-link",
    "path": "admin-worker/src/admin-console-page.js",
    "before": "translated(\"workspace\", \"a\", 'href=\"/internal/admin/control-room\"')",
    "after": "translated(\"workspace\", \"a\", 'href=\"/internal/admin/console\"')"
  },
  {
    "name": "sanitize-owner-destination",
    "path": "admin-worker/src/admin-login-hero-worker.js",
    "before": "  const requestedNext = String(response.headers.get(\"x-mmd-admin-next\") || \"\").trim();\n",
    "after": "  const requestedNext = normalizeNext(response.headers.get(\"x-mmd-admin-next\") || \"\");\n"
  },
  {
    "name": "resume-selected-task",
    "path": "admin-worker/src/admin-login-hero-worker.js",
    "before": "  const postLoginTarget = preserveRefundNext || preserveConsoleNext ? requestedNext : ADMIN_OWNER_DASHBOARD_PATH;\n",
    "after": "  const postLoginTarget = requestedNext || ADMIN_OWNER_DASHBOARD_PATH;\n"
  },
  {
    "name": "post-login-home-marker",
    "path": "admin-worker/src/admin-login-hero-worker.js",
    "before": "  headers9.set(\"x-mmd-admin-post-login\", preserveRefundNext ? \"resume-refund-ops\" : preserveConsoleNext ? \"resume-admin-console\" : \"dashboard-first\");\n",
    "after": "  headers9.set(\"x-mmd-admin-post-login\", postLoginTarget === ADMIN_OWNER_DASHBOARD_PATH ? \"console-first\" : preserveRefundNext ? \"resume-refund-ops\" : preserveConsoleNext ? \"resume-admin-console\" : \"resume-admin-task\");\n"
  },
  {
    "name": "read-only-home-methods",
    "path": "admin-worker/src/admin-login-hero-worker.js",
    "before": "    if (consolePath === ADMIN_CONSOLE_PATH) {\n",
    "after": "    const isConsoleHome = consolePath === \"/internal/admin\" && [\"GET\", \"HEAD\"].includes(request.method.toUpperCase());\n    if (consolePath === ADMIN_CONSOLE_PATH || isConsoleHome) {\n"
  },
  {
    "name": "gated-home-redirect",
    "path": "admin-worker/src/admin-login-hero-worker.js",
    "before": "      return renderAdminConsolePage(gate.request || request);\n",
    "after": "      if (isConsoleHome) {\n        return new Response(null, { status: 303, headers: {\n          location: new URL(ADMIN_CONSOLE_PATH, request.url).toString(),\n          \"cache-control\": \"no-store, private\",\n          \"x-mmd-admin-gate-version\": \"credential-bound-v1\",\n          \"x-mmd-admin-entry\": \"console\",\n        } });\n      }\n      return renderAdminConsolePage(gate.request || request);\n"
  }
]);

export function validateSources(read = path => readFileSync(path, 'utf8')) {
  for (const [path, sha] of Object.entries(SOURCE_HASHES)) {
    assert.equal(digest(read(path)), sha, 'reviewed Console-home source drift: ' + path);
  }
}
export function validateBaseline(version, deployment) {
  assert.equal(version?.id, BASELINE_VERSION, 'Console-home baseline version drift');
  assert.equal(version?.annotations?.['workers/commit_sha'], BASELINE_SOURCE, 'Console-home baseline source drift');
  assert.equal(deployment?.id, BASELINE_DEPLOYMENT, 'Console-home baseline deployment drift');
  assert.equal(deployment?.strategy, 'percentage', 'Console-home baseline strategy drift');
  assert.deepEqual(deployment?.versions, [{ version_id: BASELINE_VERSION, percentage: 100 }], 'Console-home baseline traffic drift');
}
function replaceOne(code, before, after, name) {
  assert.equal(code.split(before).length, 2, 'Console-home anchor missing or ambiguous: ' + name);
  return code.replace(before, after);
}
export function patchConsoleHome(live) {
  assert.equal(typeof live, 'string', 'live Worker module must be text');
  assert.equal(digest(live), LIVE_SHA256, 'unreviewed live Worker bytes');
  let candidate = live;
  for (const patch of HOME_PATCHES) candidate = replaceOne(candidate, patch.before, patch.after, patch.name);
  let restored = candidate;
  for (const patch of [...HOME_PATCHES].reverse()) restored = replaceOne(restored, patch.after, patch.before, patch.name);
  assert.equal(restored, live, 'unrelated Worker bytes changed');
  return { code: candidate, preservation: {
    baseline_sha256: digest(live), candidate_sha256: digest(candidate),
    unrelated_runtime_bytes_unchanged: true, reverse_patch_equals_baseline: true,
    runtime_paths: [...RUNTIME_PATHS], source_hashes: SOURCE_HASHES,
    edits: HOME_PATCHES.map(({ name, path, before, after }) => ({
      name, path, before_sha256: digest(before), after_sha256: digest(after),
    })),
    routes_unchanged: true, no_dependency_or_compiler_changes: true,
  } };
}

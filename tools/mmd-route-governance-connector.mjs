#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const dirtyPatchPath = process.env.MMD_ROUTE_LOCK_DIRTY_PATCH
  || "/Users/Hiright_1/.mmd-secrets/codexmin-backups/mmd-workers-dirty-before-clean-worktree-route-lock.patch";

const testFiles = [
  "member-pages-worker/test/liff-identity.test.mjs",
  "member-pages-worker/test/membership.test.mjs",
  "mmd-redirect-worker/test/hard-disabled.test.mjs",
  "member-dashboard-chat-worker/test/renewal-route.test.mjs",
  "webflow/payment/legacy-payment-route-bridge-v1.test.mjs",
  "telegram-worker/test/webhook-secret-token.test.mjs",
];

const routeChecks = [
  { name: "membership selection", url: "https://mmdbkk.com/sigil/member/membership", kind: "membership-selection" },
  { name: "legacy sigil membership alias", url: "https://mmdbkk.com/sigil/pay/membership", kind: "membership-alias" },
  { name: "legacy sigil membership signed alias", url: "https://mmdbkk.com/sigil/pay/membership?t=route-lock-placeholder", kind: "membership-alias-signed" },
  { name: "legacy pay membership alias", url: "https://mmdbkk.com/pay/membership", kind: "membership-alias" },
  { name: "legacy pay membership signed alias", url: "https://mmdbkk.com/pay/membership?t=route-lock-placeholder", kind: "membership-alias-signed" },
  { name: "sigil renewal", url: "https://mmdbkk.com/sigil/pay/renewal", kind: "manual-renewal" },
  { name: "pay renewal", url: "https://mmdbkk.com/pay/renewal", kind: "manual-renewal" },
  { name: "legacy renew alias", url: "https://mmdbkk.com/sigil/pay/renew", kind: "renew-alias" },
  { name: "legacy generic payment alias", url: "https://mmdbkk.com/sigil/pay/payment", kind: "payment-alias" },
  { name: "unknown route", url: "https://mmdbkk.com/unknown-test-route-mmd", kind: "unknown" },
];

const dirtyPatchFiles = [
  "events-worker/src/index.js",
  "mmd-redirect-worker/src/index.js",
  "mmd-redirect-worker/test/redirect.test.mjs",
];

const results = {
  tests: [],
  routes: [],
  liff: [],
  dirtyPatch: [],
};

let failed = false;

function markFailed(message) {
  failed = true;
  console.error(`FAIL ${message}`);
}

function pass(message) {
  console.log(`PASS ${message}`);
}

function runNodeTest(file) {
  const result = spawnSync(process.execPath, ["--test", file], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const ok = result.status === 0;
  results.tests.push({ file, ok });
  if (ok) {
    pass(`test ${file}`);
    return;
  }

  markFailed(`test ${file}`);
  const combinedOutput = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
  if (combinedOutput) console.error(redact(combinedOutput));
}

async function checkRoute(check) {
  const response = await fetch(check.url, { method: "GET", redirect: "manual" });
  const location = response.headers.get("location") || "";
  const page = response.headers.get("x-mmd-page") || "";
  const gate = response.headers.get("x-mmd-front-gate") || "";
  const source = response.headers.get("x-mmd-route-source") || "";
  const status = response.status;
  const locationUrl = location ? new URL(location, check.url) : null;
  const locationPath = locationUrl?.pathname || "";

  let ok = !containsGloballyForbiddenRoute(location);

  if (check.kind === "membership-selection") {
    ok = ok && status === 200 && locationPath !== "/pay/membership" && locationPath !== "/sigil/pay/membership";
  }

  if (check.kind === "membership-alias") {
    ok = ok
      && (status === 200 || [301, 302, 307, 308].includes(status))
      && locationPath !== "/sigil/pay/renewal";
    if ([301, 302, 307, 308].includes(status)) {
      ok = ok && locationPath === "/sigil/member/membership";
    }
  }

  if (check.kind === "membership-alias-signed") {
    ok = ok
      && (status === 200 || [301, 302, 307, 308].includes(status))
      && locationPath !== "/sigil/pay/renewal";
    if ([301, 302, 307, 308].includes(status)) {
      ok = ok
        && locationPath === "/sigil/pay"
        && Boolean(locationUrl?.searchParams.get("t"))
        && [...locationUrl.searchParams.keys()].every((key) => key === "t");
    }
  }

  if (check.kind === "manual-renewal") {
    ok = ok && status === 200
      && (source.includes("single-renewal-renderer") || page.includes("renewal"));
  }

  if (check.kind === "renew-alias") {
    ok = ok && (status === 200 || [301, 302, 307, 308].includes(status));
    if ([301, 302, 307, 308].includes(status)) {
      ok = ok && locationPath === "/sigil/pay/renewal";
    }
  }

  if (check.kind === "payment-alias") {
    ok = ok && (status === 200 || [301, 302, 307, 308].includes(status));
    if ([301, 302, 307, 308].includes(status)) {
      ok = ok && locationPath === "/member/payments";
    }
  }

  if (check.kind === "unknown") {
    ok = ok && ![301, 302, 307, 308].includes(status);
  }

  const summary = {
    name: check.name,
    url: check.url,
    status,
    location: location || null,
    page: page || null,
    gate: gate || null,
    source: source || null,
    ok,
  };
  results.routes.push(summary);

  if (ok) pass(`route ${check.name}`);
  else markFailed(`route ${check.name}: ${JSON.stringify(summary)}`);
}

async function checkLegacyLiffIdentityDisabled() {
  const response = await fetch("https://mmdbkk.com/member/api/liff/identify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ line_user_id: "Uroute-lock-spoof", member_id: "MMD-route-lock-spoof" }),
  });
  const json = await response.json().catch(() => null);
  const bodyText = JSON.stringify(json || {});
  const ok = response.status === 410
    && json?.error?.code === "LEGACY_LIFF_IDENTITY_DISABLED"
    && !bodyText.includes("Uroute-lock-spoof")
    && !bodyText.includes("MMD-route-lock-spoof");

  const summary = {
    name: "legacy_identity_disabled",
    status: response.status,
    error_code: json?.error?.code || null,
    ok,
  };
  results.liff.push(summary);

  if (ok) pass("liff legacy identity disabled");
  else markFailed(`liff legacy identity disabled: ${JSON.stringify(summary)}`);
}

function scanDirtyPatch() {
  if (!existsSync(dirtyPatchPath)) {
    results.dirtyPatch.push({
      patch: dirtyPatchPath,
      present: false,
      route_lock_conflict: "unknown",
      recommendation: "patch not found",
    });
    console.log(`INFO dirty patch not found: ${dirtyPatchPath}`);
    return;
  }

  const patch = readFileSync(dirtyPatchPath, "utf8");
  for (const file of dirtyPatchFiles) {
    const body = extractPatchForFile(patch, file);
    const mentions = {
      sigil_pay_membership: body.includes("/sigil/pay/membership"),
      sigil_pay_renewal: body.includes("/sigil/pay/renewal"),
      default: body.includes("/default"),
      autodirect: body.includes("/autodirect"),
    };
    const routeLockConflict = Boolean(
      (mentions.sigil_pay_membership && mentions.sigil_pay_renewal)
        || mentions.default
        || mentions.autodirect,
    );
    const recommendation = routeLockConflict
      ? "unsafe to reapply as-is"
      : file.startsWith("events-worker/")
        ? "unrelated"
        : "safe for later review";

    results.dirtyPatch.push({
      file,
      present: Boolean(body),
      mentions,
      route_lock_conflict: routeLockConflict,
      recommendation,
    });

    const conflict = routeLockConflict ? "yes" : "no";
    console.log(`INFO dirty patch ${file}: route-lock conflict ${conflict}; ${recommendation}`);
  }
}

function extractPatchForFile(patch, file) {
  const escaped = escapeRegExp(file);
  const pattern = new RegExp(`diff --git a/${escaped} b/${escaped}([\\s\\S]*?)(?=\\ndiff --git |$)`);
  return patch.match(pattern)?.[1] || "";
}

function containsGloballyForbiddenRoute(value) {
  return value.includes("/default") || value.includes("/autodirect");
}

function redact(value) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/pat[A-Za-z0-9._-]+/g, "[REDACTED_PAT]")
    .replace(/gho_[A-Za-z0-9_]+/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED_SECRET]");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

console.log("MMD canonical payment route governance connector");
console.log("Read-only smoke only. No deploy, route mutation, Cloudflare secret mutation, Airtable mutation, Webflow mutation, Memberstack mutation, or DNS mutation is performed.");

for (const file of testFiles) runNodeTest(file);
for (const check of routeChecks) await checkRoute(check);
await checkLegacyLiffIdentityDisabled();
scanDirtyPatch();

console.log(JSON.stringify(results, null, 2));

if (failed) process.exit(1);

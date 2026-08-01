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
  "mmd-redirect-worker/test/redirect.test.mjs",
  "member-dashboard-chat-worker/test/renewal-route.test.mjs",
];

const routeChecks = [
  { name: "sigil membership", url: "https://mmdbkk.com/sigil/pay/membership", kind: "membership" },
  { name: "sigil membership code", url: "https://mmdbkk.com/sigil/pay/membership?code=TEST", kind: "membership-query" },
  { name: "sigil membership package", url: "https://mmdbkk.com/sigil/pay/membership?package=premium", kind: "membership-query" },
  { name: "sigil membership plan", url: "https://mmdbkk.com/sigil/pay/membership?plan=standard", kind: "membership-query" },
  { name: "www sigil membership", url: "https://www.mmdbkk.com/sigil/pay/membership", kind: "membership" },
  { name: "pay membership", url: "https://mmdbkk.com/pay/membership", kind: "pay-membership" },
  { name: "sigil renewal", url: "https://mmdbkk.com/sigil/pay/renewal", kind: "manual-renewal" },
  { name: "pay renewal", url: "https://mmdbkk.com/pay/renewal", kind: "manual-renewal" },
  { name: "unknown route", url: "https://mmdbkk.com/unknown-test-route-mmd", kind: "unknown" },
];

const liffChecks = [
  {
    name: "renewal",
    body: { line_user_id: "Ucodexmin_route_lock_check", entry_route: "renewal", t: "tok" },
    expectedIntent: "membership_review",
    expectedNextRoute: "/sigil/member/membership?t=tok",
  },
  {
    name: "pay_membership",
    body: { line_user_id: "Ucodexmin_route_lock_check", entry_route: "pay_membership", t: "tok" },
    expectedIntent: "pay_membership",
    expectedNextRoute: "/pay/membership?t=tok",
  },
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
  const forbiddenLocation = containsForbiddenRoute(location);

  let ok = !forbiddenLocation;
  if (check.kind === "membership" || check.kind === "membership-query") {
    ok = ok && !location.includes("/sigil/pay/renewal");
  }
  if (check.kind === "membership-query") {
    ok = ok && response.url === check.url;
  }
  if (check.kind === "pay-membership") {
    ok = ok && !location.includes("/sigil/pay/renewal") && response.status === 200;
  }
  if (check.kind === "manual-renewal") {
    ok = ok && response.status === 200
      && (source.includes("single-renewal-renderer") || page.includes("renewal"));
  }
  if (check.kind === "unknown") {
    ok = ok && ![301, 302, 307, 308].includes(response.status);
  }

  const summary = {
    name: check.name,
    url: check.url,
    status: response.status,
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

async function checkLiff(check) {
  const response = await fetch("https://mmdbkk.com/member/api/liff/identify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(check.body),
  });
  const json = await response.json();
  const data = json.data || {};
  const bodyText = JSON.stringify(json);
  const sigilPayment = data.safe_next?.sigil_payment || "";
  const ok = response.status === 200
    && json.ok === true
    && data.intent === check.expectedIntent
    && data.next_route === check.expectedNextRoute
    && data.safe_next?.renewal === null
    && sigilPayment.startsWith("/sigil/pay/membership")
    && data.auto_renewal_route_disabled === true
    && !bodyText.includes("/sigil/pay/renewal");

  const summary = {
    name: check.name,
    status: response.status,
    ok,
    intent: data.intent || null,
    next_route: data.next_route || null,
    safe_next_renewal: data.safe_next?.renewal ?? null,
    safe_next_sigil_payment_path: sigilPayment.split("?")[0] || null,
  };
  results.liff.push(summary);

  if (ok) pass(`liff ${check.name}`);
  else markFailed(`liff ${check.name}: ${JSON.stringify(summary)}`);
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

function containsForbiddenRoute(value) {
  return value.includes("/sigil/pay/renewal")
    || value.includes("/default")
    || value.includes("/autodirect");
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

console.log("MMD route governance connector");
console.log("No deploy, route mutation, Cloudflare secret mutation, Airtable mutation, Webflow mutation, Memberstack mutation, or DNS mutation is performed.");

for (const file of testFiles) runNodeTest(file);
for (const check of routeChecks) await checkRoute(check);
for (const check of liffChecks) await checkLiff(check);
scanDirtyPatch();

console.log(JSON.stringify(results, null, 2));

if (failed) process.exit(1);

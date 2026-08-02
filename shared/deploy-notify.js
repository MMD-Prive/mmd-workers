#!/usr/bin/env node

const { execFileSync } = require("node:child_process");

const WORKERS = Object.freeze({
  "mmd-redirect-worker": {
    config: "mmd-redirect-worker/wrangler.toml",
    test: "npm --prefix mmd-redirect-worker test",
    lint: "npm --prefix mmd-redirect-worker run check",
    smokeUrl: "https://mmdbkk.com/",
    smokeStatuses: [200, 301, 302, 307, 308],
    routes: ["mmdbkk.com/*", "www.mmdbkk.com/*"],
  },
  "payments-worker": {
    config: "payments-worker/wrangler.merged.toml",
    test: "node --check payments-worker/index.with-slip-evidence.js",
    lint: "node --check payments-worker/index.with-slip-evidence.js",
    smokeUrl: "https://sigil.mmdbkk.com/v1/pay/health",
    smokeStatuses: [200, 401, 404],
    routes: ["sigil.mmdbkk.com/v1/pay/*", "sigil.mmdbkk.com/v1/payments/*", "sigil.mmdbkk.com/v1/confirm/*"],
  },
  "member-pages-worker": {
    config: "member-pages-worker/wrangler.toml",
    test: "node --test member-pages-worker/test/*.test.mjs",
    lint: "node --check member-pages-worker/src/index.js",
    smokeUrl: "https://member-pages-worker.malemodel-bkk.workers.dev/",
    smokeStatuses: [200, 301, 302, 401, 404],
    routes: ["member-pages-worker.malemodel-bkk.workers.dev/*"],
  },
  "member-api-worker": {
    unavailable: "member-api-worker is not present on origin/main; add its real Wrangler config before enabling deployment",
  },
  "sigil-worker": {
    config: "sigil-worker/wrangler.toml",
    test: "node --test sigil-worker/test/*.test.mjs",
    lint: "node --check sigil-worker/src/index.js",
    smokeUrl: "https://sigil-worker.malemodel-bkk.workers.dev/",
    smokeStatuses: [200, 401, 404],
    routes: ["sigil-worker.malemodel-bkk.workers.dev/*"],
  },
  "telegram-worker": {
    config: "telegram-worker/wrangler.toml",
    test: "node --test telegram-worker/test/*.test.mjs",
    lint: "node --check telegram-worker/src/index.js",
    smokeUrl: "https://telegram-worker.malemodel-bkk.workers.dev/",
    smokeStatuses: [200, 401, 404, 405],
    routes: ["telegram-worker.malemodel-bkk.workers.dev/*"],
  },
  "chat-worker": {
    config: "chat-worker/wrangler 2.toml",
    test: "node --test chat-worker/test/*.test.mjs",
    lint: "node --check chat-worker/src/index.js",
    smokeUrl: "https://chat-worker-ai-integration.malemodel-bkk.workers.dev/",
    smokeStatuses: [200, 401, 404, 405],
    routes: ["chat-worker-ai-integration.malemodel-bkk.workers.dev/*"],
  },
  "admin-worker": {
    config: "admin-worker/wrangler.toml",
    test: "npm run test:admin-login",
    lint: "node --check admin-worker/src/admin-login-hero-worker.js",
    smokeUrl: "https://mmdbkk.com/internal/admin/login",
    smokeStatuses: [200, 301, 302, 307, 308],
    routes: ["mmdbkk.com/internal/admin*", "www.mmdbkk.com/internal/admin*", "mmdbkk.com/v1/admin/*"],
  },
});

const REQUIRED_ENV = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_DEPLOY_CHAT_ID"];

function value(value, fallback = "Unavailable") {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

function section(label, body) {
  return `${label}:\n${value(body)}`;
}

function routeLines(routes = []) {
  return routes.length ? routes.map((route) => `✓ ${route}`).join("\n") : "No route changes";
}

function tailLines(log, count = 12) {
  return value(log, "No log output captured").split(/\r?\n/).filter(Boolean).slice(-count).join("\n");
}

function formatSuccess(details) {
  return [
    "✅ MMD Deployment Success",
    section("Worker", details.worker),
    section("Environment", details.environment),
    section("Commit", details.gitSha),
    section("Version", details.versionId),
    section("Deploy timestamp", details.timestamp),
    section("Deploy user", details.deployUser),
    section("Branch", details.branch),
    section("Routes", routeLines(details.routes)),
    section("Smoke Test", details.smokeResult),
    section("Rollback version", details.rollbackVersion),
  ].join("\n\n");
}

function formatFailure(details) {
  return [
    "❌ MMD Deployment Failure",
    section("Worker", details.worker),
    section("Command", details.command),
    section("Exit code", details.exitCode),
    section("Git SHA", details.gitSha),
    section("Last log lines", tailLines(details.log)),
  ].join("\n\n");
}

function formatRollback(details) {
  return [
    "↩️ MMD Deployment Rollback",
    section("Worker", details.worker),
    section("Previous Version", details.previousVersion),
    section("New Active Version", details.newActiveVersion),
    section("Reason", details.reason),
  ].join("\n\n");
}

function assertNotificationEnvironment(env = process.env) {
  const missing = REQUIRED_ENV.filter((name) => !env[name]);
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

async function sendTelegram(text, env = process.env, fetchImpl = fetch) {
  assertNotificationEnvironment(env);
  const response = await fetchImpl(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_DEPLOY_CHAT_ID, text, disable_web_page_preview: true }),
  });
  if (!response.ok) throw new Error(`Telegram API returned HTTP ${response.status}: ${tailLines(await response.text(), 4)}`);
  return response.json();
}

function getWorkerConfig(worker) {
  const config = WORKERS[worker];
  if (!config) throw new Error(`Unknown worker: ${worker}. Supported: ${Object.keys(WORKERS).join(", ")}`);
  if (config.unavailable) throw new Error(config.unavailable);
  return config;
}

async function runSmokeTest(worker, overrideUrl, fetchImpl = fetch) {
  const config = getWorkerConfig(worker);
  const url = overrideUrl || config.smokeUrl;
  const response = await fetchImpl(url, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
  if (!config.smokeStatuses.includes(response.status)) {
    throw new Error(`Smoke test ${url} returned HTTP ${response.status}; expected ${config.smokeStatuses.join(", ")}`);
  }
  return `PASS (HTTP ${response.status}: ${url})`;
}

function extractVersionId(output) {
  const patterns = [
    /"version_id"\s*:\s*"([0-9a-f-]{36})"/i,
    /"id"\s*:\s*"([0-9a-f-]{36})"/i,
    /(?:Current\s+)?Version ID:\s*([0-9a-f-]{36})/i,
    /Deployment ID:\s*([0-9a-f-]{36})/i,
  ];
  for (const pattern of patterns) {
    const match = value(output, "").match(pattern);
    if (match) return match[1];
  }
  return "";
}

function git(...args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function deploymentMetadata(env = process.env) {
  return {
    environment: env.DEPLOY_ENVIRONMENT || "Production",
    gitSha: env.GITHUB_SHA || git("rev-parse", "HEAD"),
    branch: env.GITHUB_REF_NAME || git("branch", "--show-current"),
    deployUser: env.DEPLOY_USER || env.GITHUB_ACTOR || git("config", "user.name") || env.USER,
    timestamp: new Date().toISOString(),
  };
}

function argument(name, args) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : "";
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks.map((chunk) => Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))).toString("utf8");
}

async function main(args) {
  const [command, worker] = args;
  if (command === "config") {
    const config = getWorkerConfig(worker);
    const field = args[2];
    if (!(field in config)) throw new Error(`Unknown config field: ${field}`);
    process.stdout.write(Array.isArray(config[field]) ? config[field].join("\n") : String(config[field]));
    return;
  }
  if (command === "preflight") {
    getWorkerConfig(worker);
    assertNotificationEnvironment();
    return;
  }
  if (command === "extract-version") {
    process.stdout.write(extractVersionId(await readStdin()));
    return;
  }
  if (command === "smoke") {
    process.stdout.write(await runSmokeTest(worker, process.env.DEPLOY_SMOKE_URL));
    return;
  }
  if (command === "success") {
    const config = getWorkerConfig(worker);
    const message = formatSuccess({
      worker,
      ...deploymentMetadata(),
      versionId: argument("version", args),
      smokeResult: argument("smoke", args),
      rollbackVersion: argument("rollback-version", args),
      routes: config.routes,
    });
    await sendTelegram(message);
    process.stdout.write(message);
    return;
  }
  if (command === "failure") {
    const message = formatFailure({
      worker,
      ...deploymentMetadata(),
      command: argument("command", args),
      exitCode: argument("exit-code", args),
      log: await readStdin(),
    });
    await sendTelegram(message);
    process.stdout.write(message);
    return;
  }
  if (command === "rollback") {
    const message = formatRollback({
      worker,
      previousVersion: argument("previous-version", args),
      newActiveVersion: argument("new-active-version", args),
      reason: argument("reason", args),
    });
    await sendTelegram(message);
    process.stdout.write(message);
    return;
  }
  throw new Error("Usage: deploy-notify.js <config|preflight|extract-version|smoke|success|failure|rollback> <worker> [options]");
}

module.exports = {
  assertNotificationEnvironment,
  deploymentMetadata,
  extractVersionId,
  formatFailure,
  formatRollback,
  formatSuccess,
  getWorkerConfig,
  runSmokeTest,
  sendTelegram,
};

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

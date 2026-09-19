#!/usr/bin/env node

const { readFile } = require("node:fs/promises");

const WORKERS = Object.freeze({
  "mmd-redirect-worker": worker("mmd-redirect-worker/wrangler.toml", {
    test: "npm --prefix mmd-redirect-worker test",
    lint: "npm --prefix mmd-redirect-worker run check",
  }),
  "payments-worker": worker("payments-worker/wrangler.merged.toml", {
    test: "bash payments-worker/checks/run-checks.sh",
    lint: "node --check payments-worker/index.js",
  }),
  "member-pages-worker": worker("member-pages-worker/wrangler.toml", {
    test: "node --test member-pages-worker/test/*.test.mjs",
    lint: "node --check member-pages-worker/src/index.js",
  }),
  "member-api-worker": worker("member-api-worker/wrangler.toml"),
  "sigil-worker": worker("sigil-worker/wrangler.toml", {
    test: "npm --prefix sigil-worker test",
    lint: "npm --prefix sigil-worker run check",
  }),
  "telegram-worker": worker("telegram-worker/wrangler.toml", {
    test: "node --test telegram-worker/test/*.test.mjs",
    lint: "node --check telegram-worker/src/index.js",
  }),
  "chat-worker": worker("chat-worker/wrangler 2.toml", {
    test: "node --test chat-worker/test/*.test.mjs",
    lint: "node --check chat-worker/src/index.js",
    smoke: "node scripts/smoke-chat-worker.js",
  }),
  "admin-worker": worker("admin-worker/wrangler.toml", {
    test: "npm run test:admin-login && npm run test:studio-real-worker",
    lint: "node --check admin-worker/src/dashboard-worker.js",
  }),
  "events-worker": worker("events-worker/wrangler.toml"),
  "sigil-booking-worker": worker("sigil-booking-worker/wrangler.toml"),
  "sigil-board-worker": worker("workers/sigil-board-worker/wrangler.toml", {
    lint: "npm run check:sigil-board",
  }),
  "sigil-booking-proxy-worker": worker("workers/sigil-booking-proxy-worker/wrangler.toml", {
    test: "npm run test:sigil-booking-proxy",
    lint: "npm run check:sigil-booking-proxy",
  }),
});

function worker(config, commands = {}) {
  return Object.freeze({
    config,
    test: commands.test || "",
    lint: commands.lint || "",
    smoke: commands.smoke || "",
  });
}

function formatSuccess(details) {
  return formatMessage("✅ MMD Deployment Success", [
    ["Worker", details.worker],
    ["Environment", details.environment],
    ["Commit", details.gitSha],
    ["Version", details.versionId],
    ["Deploy Timestamp", details.timestamp],
    ["Deploy User", details.deployUser],
    ["Branch", details.branch],
    ["Changed Routes", list(details.routes)],
    ["Smoke Test", details.smokeResult],
    ["Rollback Version", details.rollbackVersion || "Not available"],
  ]);
}

function formatFailure(details) {
  return formatMessage("❌ MMD Deployment Failure", [
    ["Worker", details.worker],
    ["Command", details.command],
    ["Exit Code", details.exitCode],
    ["Git SHA", details.gitSha],
    ["Last Log Lines", details.lastLogLines || "No log output"],
  ]);
}

function formatRollback(details) {
  return formatMessage("↩️ MMD Deployment Rollback", [
    ["Worker", details.worker],
    ["Previous Version", details.previousVersion],
    ["New Active Version", details.newActiveVersion],
    ["Reason", details.reason],
  ]);
}

async function sendTelegram(message, env = process.env) {
  if (env.DEPLOY_NOTIFY_DRY_RUN === "1") {
    process.stdout.write(`${message}\n`);
    return { ok: true, dryRun: true };
  }

  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_DEPLOY_CHAT_ID;
  if (!token || !chatId) {
    throw new Error("TELEGRAM_BOT_TOKEN and TELEGRAM_DEPLOY_CHAT_ID are required");
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message.slice(0, 4096), disable_web_page_preview: true }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok !== true) {
    throw new Error(`Telegram sendMessage failed with HTTP ${response.status}`);
  }
  return result;
}

async function configuredRoutes(configPath) {
  const source = await readFile(configPath, "utf8");
  const routes = [];
  for (const match of source.matchAll(/^\s*(?:pattern|route)\s*=\s*["']([^"']+)["']/gm)) {
    routes.push(match[1]);
  }
  for (const match of source.matchAll(/^\s*routes\s*=\s*\[([\s\S]*?)\]/gm)) {
    for (const value of match[1].matchAll(/(?:pattern\s*=\s*)?["']([^"']+)["']/g)) routes.push(value[1]);
  }
  return [...new Set(routes)];
}

function formatMessage(title, fields) {
  return [title, ...fields.flatMap(([label, value]) => ["", `${label}:`, safe(value)])].join("\n");
}

function list(values = []) {
  return values.length ? values.map((value) => `✓ ${value}`).join("\n") : "No route changes declared";
}

function safe(value) {
  return String(value ?? "Unknown").slice(0, 3500);
}

async function cli(argv) {
  const [action, ...args] = argv;
  if (action === "config") {
    const [name, field] = args;
    const config = WORKERS[name];
    if (!config) throw new Error(`Unknown worker: ${name}`);
    if (!(field in config)) throw new Error(`Unknown config field: ${field}`);
    process.stdout.write(String(config[field]));
    return;
  }
  if (action === "routes") {
    const routes = await configuredRoutes(args[0]);
    process.stdout.write(routes.join("\n"));
    return;
  }
  if (["success", "failure", "rollback"].includes(action)) {
    const payload = JSON.parse(await readFile(args[0], "utf8"));
    const format = { success: formatSuccess, failure: formatFailure, rollback: formatRollback }[action];
    await sendTelegram(format(payload));
    return;
  }
  throw new Error("Usage: deploy-notify.js <config|routes|success|failure|rollback> ...");
}

module.exports = {
  WORKERS,
  configuredRoutes,
  formatFailure,
  formatRollback,
  formatSuccess,
  sendTelegram,
};

if (require.main === module) {
  cli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`deploy-notify: ${error.message}\n`);
    process.exitCode = 1;
  });
}

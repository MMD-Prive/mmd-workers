import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { telegramRoutePatterns } from "../scripts/telegram-workflow-operations.mjs";

const root = new URL("../", import.meta.url);
const source = async (path) => readFile(new URL(path, root), "utf8");

test("legacy mmd-redirect-worker remains hard disabled", async () => {
  const config = await source("mmd-redirect-worker/wrangler.toml");
  assert.doesNotMatch(config, /\[\[routes\]\]/);
  assert.match(config, /HARD DISABLED/);
});

test("Member Dashboard API has one front-gate route owner and one member truth upstream", async () => {
  const config = await source("member-dashboard-chat-worker/wrangler.toml");
  const runtime = await source("member-dashboard-chat-worker/src/index.js");
  const member = await source("member-pages-worker/src/liff-identity-foundation.js");
  assert.match(config, /mmdbkk\.com\/api\/member\/dashboard\*/);
  assert.match(config, /www\.mmdbkk\.com\/api\/member\/dashboard\*/);
  assert.match(runtime, /MEMBER_DASHBOARD_API_PATHS/);
  assert.match(member, /\/api\/member\/dashboard/);
});

test("Renewal aliases remain bounded to member-dashboard-chat-worker", async () => {
  const config = await source("member-dashboard-chat-worker/wrangler.toml");
  for (const marker of [
    "mmdbkk.com/pay/renewal*",
    "www.mmdbkk.com/pay/renewal*",
    "mmdbkk.com/sigil/pay/renewal*",
    "www.mmdbkk.com/sigil/pay/renewal*",
  ]) assert.ok(config.includes(marker), marker);
});

test("SIGIL booking API has exact custom-host routes", async () => {
  const config = await source("sigil-booking-worker/wrangler.toml");
  for (const marker of [
    "sigil.mmdbkk.com/sigil/api/client/resolve*",
    "sigil.mmdbkk.com/sigil/api/models/search*",
    "sigil.mmdbkk.com/sigil/api/booking/intake*",
  ]) assert.ok(config.includes(marker), marker);
});

test("Partner API namespace is owned by partners-worker", async () => {
  const config = await source("partners-worker/wrangler.toml");
  assert.match(config, /mmdbkk\.com\/v1\/partner\/\*/);
  assert.match(config, /www\.mmdbkk\.com\/v1\/partner\/\*/);
});

test("Realtime production namespace is synchronized by the dedicated zone Routes API", async () => {
  const config = await source("realtime-worker/wrangler.toml");
  const runtime = await source("realtime-worker/src/index.js");
  const workflow = await source(".github/workflows/deploy-realtime-worker.yml");
  assert.doesNotMatch(config, /\[\[routes\]\]/);
  assert.match(workflow, /Sync canonical realtime routes through zone API/);
  assert.match(workflow, /mmdbkk\.com\/v1\/rt\/\*/);
  assert.match(workflow, /www\.mmdbkk\.com\/v1\/rt\/\*/);
  assert.match(runtime, /\/v1\/rt\/health/);
  assert.match(runtime, /X-MMD-Route-Owner/);
});

test("Member Webflow pages bypass the legacy catch-all with no-script routes", async () => {
  const workflow = await source(".github/workflows/phase1-webflow-route-exclusions.yml");
  assert.match(workflow, /mmdbkk\.com\/member\/login\*/);
  assert.match(workflow, /www\.mmdbkk\.com\/member\/login\*/);
  assert.match(workflow, /mmdbkk\.com\/member\/dashboard\*/);
  assert.match(workflow, /www\.mmdbkk\.com\/member\/dashboard\*/);
  assert.match(workflow, /JSON\.stringify\(\{ pattern \}\)/);
  assert.match(workflow, /legacy global catch-all: retired; no-script exclusions remain guardrails/);
});

test("Private Model handler exists and production workflow refuses route takeover", async () => {
  const runtime = await source("sigil-worker/src/private-model.js");
  const wrapper = await source("sigil-worker/src/index-with-public-model-notify.js");
  const config = await source("sigil-worker/wrangler.toml");
  const workflow = await source(".github/workflows/deploy-sigil-worker.yml");
  assert.match(runtime, /PRIVATE_MODEL_PAGE_PATH = "\/sigil\/apply"/);
  assert.match(runtime, /PRIVATE_MODEL_APPLY_PATH = "\/sigil\/api\/private-model\/apply"/);
  assert.match(wrapper, /handlePrivateModelRequest/);
  assert.match(config, /PRIVATE_MODEL_PUBLIC_API_BASE = "https:\/\/www\.mmdbkk\.com"/);
  assert.match(workflow, /Sync Private Model canonical routes without takeover/);
  assert.match(workflow, /refusing route takeover/);
  assert.match(workflow, /mmdbkk\.com\/sigil\/api\/private-model\/\*/);
});


test("mmd-redirect-worker production retirement is rollback-safe", async () => {
  const legacy = await source("mmd-redirect-worker/src/index.js");
  const config = await source("mmd-redirect-worker/wrangler.toml");
  const workflow = await source(".github/workflows/retire-mmd-redirect-worker-production.yml");
  assert.match(legacy, /REDIRECT_WORKER_DISABLED = true/);
  assert.match(legacy, /return fetch\(request\)/);
  assert.doesNotMatch(config, /\[\[routes\]\]/);
  assert.match(workflow, /Snapshot and retire exact approved mmd-redirect-worker routes/);
  assert.match(workflow, /Roll back only confirmed deletions if acceptance fails/);
  assert.match(workflow, /remaining mmd-redirect-worker routes: 0/);
  assert.match(workflow, /selectRetirementRoutes\(scope, routes\)/);
  assert.match(workflow, /mmd-redirect-routes\.deleted\.json/);
  assert.match(workflow, /mmd-redirect-routes\.pending\.json/);
  assert.match(workflow, /selectRollbackRoutes\(scope, snapshot, routes\)/);
  assert.match(workflow, /automatic rollback blocked/);
  assert.match(workflow, /node --input-type=module <<'NODE'/);
  assert.doesNotMatch(workflow, /const fs = require\("node:fs"\)/);
});


test("Phase 1 production smoke fails closed if the retired front gate regains any route", async () => {
  const workflow = await source(".github/workflows/phase1-route-owner-production-smoke.yml");
  assert.match(workflow, /retired mmd-redirect-worker regained production routes/);
  assert.match(workflow, /mmd_redirect_worker_routes: 0/);
  assert.match(workflow, /phase1_route_ownership: "closed"/);
  assert.match(workflow, /Phase 1 route ownership: CLOSED/);
});


test("Telegram core routes remain exact and canonical", async () => {
  const config = await source("telegram-worker/wrangler.toml");
  const deploy = await source(".github/workflows/deploy-telegram-worker.yml");
  const routes = await source(".github/workflows/sync-telegram-worker-routes.yml");
  const maintenance = await source(".github/workflows/telegram-worker-maintenance.yml");
  const expected = [
    "mmdbkk.com/telegram/webhook",
    "www.mmdbkk.com/telegram/webhook",
    "mmdbkk.com/v1/webhook",
    "www.mmdbkk.com/v1/webhook",
    "mmdbkk.com/telegram/internal/send",
    "www.mmdbkk.com/telegram/internal/send",
    "mmdbkk.com/v1/internal/send",
    "www.mmdbkk.com/v1/internal/send",
    "mmdbkk.com/v1/send",
    "www.mmdbkk.com/v1/send",
  ];
  for (const marker of expected) assert.ok(config.includes(`pattern = "${marker}"\n`), marker);
  assert.equal((config.match(/^\[\[routes\]\]$/gm) || []).length, expected.length);
  assert.deepEqual([...telegramRoutePatterns].sort(), [...expected].sort());
  assert.match(routes, /run: node scripts\/telegram-workflow-operations.mjs sync-routes/);
  assert.match(routes, /APPROVED_MISSING_PATTERNS: \$\{\{ inputs.approved_missing_patterns \}\}/);
  assert.match(maintenance, /if: inputs.operation == 'webhook'/);
  assert.match(maintenance, /run: node scripts\/telegram-workflow-operations.mjs webhook/);
  for (const workflow of [deploy, routes, maintenance]) {
    assert.match(workflow, /uses: \.\/\.github\/workflows\/admin-production-approval.yml/);
    assert.match(workflow, /needs: \[production-approval\]/);
    assert.match(workflow, /inputs.approved_sha == github.sha/);
    assert.doesNotMatch(workflow.split("\njobs:")[0], /^  (push|workflow_run|schedule):/m);
  }
  assert.doesNotMatch(deploy, /telegram-workflow-operations|ensure-canonical|setChatMenuButton|premium-room|topics\/smoke/);
});

test("Telegram auth boundaries remain closed without production smoke requests", async (t) => {
  const { default: worker } = await import("../telegram-worker/src/access-runtime.js");
  const network = t.mock.method(globalThis, "fetch", async () => Response.json({ success: false }, { status: 403 }));
  const env = { INTERNAL_API_TOKEN: "fixture-internal", TELEGRAM_WEBHOOK_SECRET_TOKEN: "fixture-webhook" };
  for (const path of ["/telegram/internal/send", "/v1/internal/send", "/v1/send", "/telegram/internal/webhook/ensure-canonical"]) {
    for (const authorization of [undefined, "Bearer fixture-invalid"]) {
      const response = await worker.fetch(new Request(`https://telegram.example${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(authorization ? { authorization } : {}) },
        body: JSON.stringify({ chat_id: "123456789", text: "fixture", confirm: "ENSURE_CANONICAL_TELEGRAM_WEBHOOK_V1" }),
      }), env);
      assert.equal(response.status, 403, path);
      assert.equal((await response.json()).error, "internal_token_required", path);
    }
  }
  for (const path of ["/telegram/webhook", "/v1/webhook"]) {
    for (const secret of [undefined, "fixture-invalid"]) {
      const response = await worker.fetch(new Request(`https://telegram.example${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(secret ? { "X-Telegram-Bot-Api-Secret-Token": secret } : {}) },
        body: JSON.stringify({ update_id: 1 }),
      }), env);
      assert.equal(response.status, 401, path);
    }
  }
  // The repair endpoint verifies a supplied bearer with Cloudflare before denying it.
  assert.equal(network.mock.callCount(), 1);
  const [url, options] = network.mock.calls[0].arguments;
  assert.equal(new URL(url).hostname, "api.cloudflare.com");
  assert.ok(new URL(url).pathname.endsWith("/workers/scripts/telegram-worker/settings"));
  assert.equal(options.method || "GET", "GET");
});

test("LINE webhook routes remain bounded to member-dashboard-chat-worker", async () => {
  const config = await source("member-dashboard-chat-worker/wrangler.toml");
  for (const marker of [
    "mmdbkk.com/webhooks/line",
    "www.mmdbkk.com/webhooks/line",
    "mmdbkk.com/webhooks/line/mms",
    "www.mmdbkk.com/webhooks/line/mms",
  ]) assert.ok(config.includes(marker), marker);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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
  assert.match(workflow, /legacy global catch-all: intentionally retained for Phase 1-B/);
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
  assert.match(workflow, /Snapshot and retire every mmd-redirect-worker route/);
  assert.match(workflow, /Roll back legacy routes if acceptance fails/);
  assert.match(workflow, /remaining mmd-redirect-worker routes: 0/);
});

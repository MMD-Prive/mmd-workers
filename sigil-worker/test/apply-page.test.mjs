import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const forbiddenTelegramBrief = /Briefing HYPE TELEGRAMBOT|TELEGRAMBOT|CEO TELEGRAM BRIEF/i;

const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
});
const workerModule = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`);
const worker = workerModule.default;

async function runWorker(request) {
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    throw new Error("unexpected upstream fallback");
  };

  try {
    const response = await worker.fetch(request, { SIGIL_ROUTE_MIGRATION_BUILD: "TEST_BUILD" });
    return { response, upstreamCalls };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function validPayload() {
  return {
    nickname: "Test Private Model",
    phone: "0812345678",
    telegram_username: "@sigiltest",
    line_id: "sigiltest",
    private_standard: "standard_private",
    minimum_rate_thb: 12000,
    private_note: "Available for private review.",
    consent: true,
    website: "",
  };
}

test("sigil apply page keeps polished private apply package", async () => {
  assert.match(source, /SIGIL_APPLY_PATH = "\/sigil\/apply"/);
  assert.match(source, /function renderPrivateModelSetupPage/);
  assert.match(source, /x-mmd-page": "sigil-private-model-setup"/);
  assert.match(source, /SIGIL Private Model Setup \| MMD Privé/);
  assert.match(source, /id="sigil-private-setup"/);
  assert.match(source, /class="sps sps-private-apply"/);
  assert.match(source, /#sigil-private-setup \{/);
  assert.match(source, /data-private-setup-form/);
  assert.match(source, /data-endpoint="\$\{SIGIL_PRIVATE_MODEL_APPLY_ENDPOINT\}"/);
  assert.match(source, /https:\/\/sigil\.mmdbkk\.com\/sigil\/api\/private-model\/apply/);
  assert.match(source, /name="nickname"/);
  assert.match(source, /name="phone"/);
  assert.match(source, /name="telegram_username"/);
  assert.match(source, /name="line_id"/);
  assert.match(source, /name="private_standard"/);
  assert.match(source, /name="private_standard" value="standard_private"/);
  assert.match(source, /name="private_standard" value="premium_private"/);
  assert.match(source, /name="private_standard" value="selective_case_by_case"/);
  assert.match(source, /name="minimum_rate_thb"/);
  assert.match(source, /name="private_note"/);
  assert.match(source, /name="consent"/);
  assert.match(source, /name="website"/);
  assert.doesNotMatch(source, /Rollback:/);
  assert.doesNotMatch(source, forbiddenTelegramBrief);

  const { response, upstreamCalls } = await runWorker(
    new Request("https://sigil.mmdbkk.com/sigil/apply?t=abc&code=x&promo=y"),
  );
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-route-owner"), "sigil-worker");
  assert.equal(response.headers.get("x-mmd-page"), "sigil-private-model-setup");
  assert.equal(upstreamCalls, 0);
  assert.match(html, /id="sigil-private-setup"/);
  assert.match(html, /class="sps sps-private-apply"/);
  assert.match(html, /data-private-setup-form/);
  assert.match(html, /data-endpoint="https:\/\/sigil\.mmdbkk\.com\/sigil\/api\/private-model\/apply"/);
  assert.doesNotMatch(html, /Rollback:/);
  assert.doesNotMatch(html, forbiddenTelegramBrief);
});

test("private model apply API accepts valid POSTs from apex and www pages", async () => {
  for (const origin of ["https://mmdbkk.com", "https://www.mmdbkk.com"]) {
    const { response, upstreamCalls } = await runWorker(
      new Request("https://sigil.mmdbkk.com/sigil/api/private-model/apply", {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
        },
        body: JSON.stringify(validPayload()),
      }),
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
    assert.equal(response.headers.get("x-mmd-sigil-owner"), "sigil-worker");
    assert.equal(response.headers.get("x-mmd-route-owner"), "sigil-worker");
    assert.equal(response.headers.get("x-mmd-page"), "sigil-private-model-apply-api");
    assert.equal(response.headers.has("x-mmd-sigil-upstream"), false);
    assert.equal(upstreamCalls, 0);
    assert.equal(body.ok, true);
    assert.equal(body.status, "received");
    assert.match(body.application_id, /^sigil_private_/);
    assert.equal(body.private_standard, "standard_private");
    assert.equal(body.received_url, "/sigil/model/apply/private-model/received");
  }
});

test("private model apply API accepts safe standard aliases and normalizes them", async () => {
  const payload = validPayload();
  payload.private_standard = "standard";

  const { response, upstreamCalls } = await runWorker(
    new Request("https://sigil.mmdbkk.com/sigil/api/private-model/apply", {
      method: "POST",
      headers: {
        origin: "https://www.mmdbkk.com",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-page"), "sigil-private-model-apply-api");
  assert.equal(response.headers.has("x-mmd-sigil-upstream"), false);
  assert.equal(upstreamCalls, 0);
  assert.equal(body.ok, true);
  assert.equal(body.private_standard, "standard_private");
});

test("private model apply API returns a user-safe validation error", async () => {
  const invalid = validPayload();
  invalid.nickname = "";

  const { response, upstreamCalls } = await runWorker(
    new Request("https://sigil.mmdbkk.com/sigil/api/private-model/apply", {
      method: "POST",
      headers: {
        origin: "https://www.mmdbkk.com",
        "content-type": "application/json",
      },
      body: JSON.stringify(invalid),
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://www.mmdbkk.com");
  assert.equal(response.headers.get("x-mmd-sigil-owner"), "sigil-worker");
  assert.equal(response.headers.get("x-mmd-route-owner"), "sigil-worker");
  assert.equal(response.headers.get("x-mmd-page"), "sigil-private-model-apply-api");
  assert.equal(response.headers.has("x-mmd-sigil-upstream"), false);
  assert.equal(upstreamCalls, 0);
  assert.equal(body.ok, false);
  assert.equal(body.error, "invalid_request");
  assert.match(body.message, /name TarT/);
  assert.doesNotMatch(JSON.stringify(body), forbiddenTelegramBrief);
});

test("private model apply API keeps validation failure for missing standard", async () => {
  const invalid = validPayload();
  invalid.private_standard = "";

  const { response, upstreamCalls } = await runWorker(
    new Request("https://sigil.mmdbkk.com/sigil/api/private-model/apply", {
      method: "POST",
      headers: {
        origin: "https://www.mmdbkk.com",
        "content-type": "application/json",
      },
      body: JSON.stringify(invalid),
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(response.headers.get("x-mmd-page"), "sigil-private-model-apply-api");
  assert.equal(response.headers.has("x-mmd-sigil-upstream"), false);
  assert.equal(upstreamCalls, 0);
  assert.equal(body.ok, false);
  assert.equal(body.error, "invalid_request");
  assert.match(body.message, /private standard/);
});

test("private model apply API handles CORS preflight without fallback", async () => {
  const { response, upstreamCalls } = await runWorker(
    new Request("https://sigil.mmdbkk.com/sigil/api/private-model/apply", {
      method: "OPTIONS",
      headers: {
        origin: "https://www.mmdbkk.com",
        "access-control-request-headers": "content-type",
      },
    }),
  );

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://www.mmdbkk.com");
  assert.equal(response.headers.get("access-control-allow-methods"), "POST, OPTIONS");
  assert.equal(response.headers.get("access-control-allow-headers"), "content-type");
  assert.equal(response.headers.get("x-mmd-sigil-owner"), "sigil-worker");
  assert.equal(response.headers.get("x-mmd-route-owner"), "sigil-worker");
  assert.equal(response.headers.get("x-mmd-page"), "sigil-private-model-apply-api");
  assert.equal(response.headers.has("x-mmd-sigil-upstream"), false);
  assert.equal(upstreamCalls, 0);
});

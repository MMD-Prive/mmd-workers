import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "esbuild";

const tmp = await mkdtemp(join(tmpdir(), "internal-admin-gate-bridge-"));
const outfile = join(tmp, "internal-routes.mjs");
const workerRoot = dirname(dirname(fileURLToPath(import.meta.url)));

await build({
  entryPoints: [join(workerRoot, "src/internal-routes.ts")],
  outfile,
  bundle: true,
  format: "esm",
  platform: "browser",
  conditions: ["worker", "browser"],
  target: "es2022",
});

const { handleInternalRoutes } = await import(pathToFileURL(outfile).href);

test.after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

function request(path, host = "mmdbkk.com", init = {}) {
  return new Request(`https://${host}${path}`, {
    headers: {
      authorization: "Bearer should-not-forward",
      cookie: "mmd_admin_gate_v1=safe-test-cookie",
      "user-agent": "bridge-test-agent",
      "x-forwarded-host": "evil.example",
      "x-mmd-public-host": "evil.example",
      ...(init.headers || {}),
    },
    ...init,
  });
}

function adminWorkerBinding(calls, status = 200) {
  return {
    fetch: async (input) => {
      calls.push(input);
      return Response.json({ ok: status >= 200 && status < 300, authenticated: status === 200 }, { status });
    },
  };
}

function signedAdminWorkerBinding(calls, status = 200) {
  return {
    fetch: async (input) => {
      calls.push(input);
      return Response.json(status === 200 ? {
        ok: true,
        authenticated: true,
        actor: { id: "per" },
        session: { id: "adm_signed_session_001" },
      } : { ok: false, authenticated: false }, { status });
    },
  };
}

function promotionWorkerBinding(calls, responseBody = null) {
  return {
    fetch: async (input) => {
      calls.push(input);
      if (responseBody) return Response.json(responseBody);
      return Response.json({
        ok: true,
        claim: {
          claimId: "MMD6-2026-ABCDEF123456",
          claimStatus: "matched",
          status: "current_member",
          audits: [],
        },
      });
    },
  };
}

async function withPublicFetchTrap(run) {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("public fetch must not be used");
  };
  try {
    const result = await run();
    return { result, calls };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("protected apex admin page verifies auth/me through admin-worker binding with apex public host", async () => {
  const calls = [];
  const { result: response, calls: publicCalls } = await withPublicFetchTrap(() => handleInternalRoutes(request("/internal/admin/control-room"), {
    ADMIN_WORKER: adminWorkerBinding(calls),
    ADMIN_WORKER_BASE_URL: "https://admin-worker.malemodel-bkk.workers.dev",
  }));

  assert.equal(response.status, 200);
  assert.equal(publicCalls, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://mmdbkk.com/v1/admin/auth/me");
  assert.equal(calls[0].headers.get("accept"), "application/json");
  assert.equal(calls[0].headers.get("cookie"), "mmd_admin_gate_v1=safe-test-cookie");
  assert.equal(calls[0].headers.get("user-agent"), "bridge-test-agent");
  assert.equal(calls[0].headers.get("x-mmd-auth-bridge"), "immigrate-internal-admin-gate");
  assert.equal(calls[0].headers.get("x-mmd-public-host"), "mmdbkk.com");
  assert.equal(calls[0].headers.get("authorization"), null);
  assert.equal(calls[0].headers.get("x-forwarded-host"), null);
});

test("protected www admin page verifies auth/me through admin-worker binding with www public host", async () => {
  const calls = [];
  const { result: response, calls: publicCalls } = await withPublicFetchTrap(() => handleInternalRoutes(request("/internal/admin/jobs/create-session", "www.mmdbkk.com"), {
    ADMIN_WORKER: adminWorkerBinding(calls),
    ADMIN_WORKER_BASE_URL: "https://admin-worker.malemodel-bkk.workers.dev",
  }));

  assert.equal(response.status, 200);
  assert.equal(publicCalls, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://www.mmdbkk.com/v1/admin/auth/me");
  assert.equal(calls[0].headers.get("x-mmd-public-host"), "www.mmdbkk.com");
});

test("create-session page loads an existing bundled create-session asset", async () => {
  const calls = [];
  const { result: response } = await withPublicFetchTrap(() => handleInternalRoutes(request("/internal/admin/jobs/create-session"), {
    ADMIN_WORKER: adminWorkerBinding(calls),
    ADMIN_WORKER_BASE_URL: "https://admin-worker.malemodel-bkk.workers.dev",
  }));
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /<script src="\/a\/create-session\.js"><\/script>/);
  assert.match(html, /adminBase:location\.origin/);
  assert.match(html, /authMe:"\/v1\/admin\/auth\/me"/);
  assert.match(html, /createSession:"\/v1\/admin\/create-session"/);
  assert.doesNotMatch(html, /create-session-v4\.js/);
  assert.doesNotMatch(html, /admin-worker\.malemodel-bkk\.workers\.dev/);
  assert.doesNotMatch(html, /immigrate-worker\.malemodel-bkk\.workers\.dev/);
});

test("create-job page renders a required positive amount_thb input and payload field", async () => {
  const calls = [];
  const { result: response, calls: publicCalls } = await withPublicFetchTrap(() => handleInternalRoutes(request("/internal/jobs/create-job"), {
    ADMIN_WORKER: adminWorkerBinding(calls),
    ADMIN_WORKER_BASE_URL: "https://admin-worker.malemodel-bkk.workers.dev",
  }));
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.equal(publicCalls, 0);
  assert.equal(calls.length, 1);
  assert.match(html, /<span>Amount THB<\/span><input class="mmdop__input" id="amount_thb" name="amount_thb" type="number" min="1" step="1" required \/>/);
  assert.match(html, /const amount=Number\(\$\("amount_thb"\)\?\.value\|\|""\);/);
  assert.match(html, /amount_thb:amount/);
  assert.match(html, /Number\.isFinite\(payload\.amount_thb\)\|\|payload\.amount_thb<=0/);
  assert.doesNotMatch(html, /amount_thb\s*:\s*1/);
  assert.doesNotMatch(html, /amount_thb\s*(?:\|\||\?\?)\s*1/);
});

test("anniversary Control Room page is protected and loads the same-origin UI asset", async () => {
  const authCalls = [];
  const { result: response, calls: publicCalls } = await withPublicFetchTrap(() => handleInternalRoutes(request("/internal/admin/control-room/campaigns/anniversary"), {
    ADMIN_WORKER: signedAdminWorkerBinding(authCalls),
  }));
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.equal(publicCalls, 0);
  assert.equal(authCalls.length, 1);
  assert.match(html, /data-mmd-anniversary-control/);
  assert.match(html, /\/a\/anniversary-control-room\.js/);
  assert.match(html, /Care Back/);
  assert.doesNotMatch(html, /ADMIN_BEARER|INTERNAL_SERVICE_SECRET|x-mmd-internal-secret/);
});

test("anniversary claim read requires a signed Admin session and forwards only internal service authority", async () => {
  const authCalls = [];
  const promotionCalls = [];
  const response = await handleInternalRoutes(request("/v1/admin/campaigns/anniversary/claims/MMD6-2026-ABCDEF123456"), {
    ADMIN_WORKER: signedAdminWorkerBinding(authCalls),
    PROMOTION_WORKER: promotionWorkerBinding(promotionCalls),
    INTERNAL_SERVICE_SECRET: "s".repeat(32),
  });

  assert.equal(response.status, 200);
  assert.equal(authCalls.length, 1);
  assert.equal(authCalls[0].headers.get("authorization"), null);
  assert.equal(authCalls[0].headers.get("x-mmd-auth-bridge"), "immigrate-anniversary-admin-authority");
  assert.equal(promotionCalls.length, 1);
  assert.equal(promotionCalls[0].url, "https://promotion-worker.local/v1/internal/promotions/claims/MMD6-2026-ABCDEF123456");
  assert.equal(promotionCalls[0].headers.get("x-mmd-service-binding"), "immigrate-worker");
  assert.equal(promotionCalls[0].headers.get("x-mmd-internal-secret"), "s".repeat(32));
  assert.equal(promotionCalls[0].headers.get("cookie"), null);
});

test("anniversary decision ignores browser actor and creates server-side audit context", async () => {
  const authCalls = [];
  const promotionCalls = [];
  const response = await handleInternalRoutes(request("/v1/admin/campaigns/anniversary/claims/MMD6-2026-ABCDEF123456/decision", "mmdbkk.com", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "approve",
      reason: "payment and history verified",
      approvedMonths: 6,
      paymentReference: "pay_membership_001",
      actor: { id: "attacker", sessionId: "fake" },
      requestId: "browser-controlled",
    }),
  }), {
    ADMIN_WORKER: signedAdminWorkerBinding(authCalls),
    PROMOTION_WORKER: promotionWorkerBinding(promotionCalls),
    INTERNAL_SERVICE_SECRET: "s".repeat(32),
  });

  assert.equal(response.status, 200);
  assert.equal(promotionCalls.length, 1);
  const forwarded = JSON.parse(await promotionCalls[0].text());
  assert.deepEqual(forwarded.actor, { id: "per", sessionId: "adm_signed_session_001" });
  assert.match(forwarded.requestId, /^cr_[0-9a-f-]{36}$/i);
  assert.notEqual(forwarded.requestId, "browser-controlled");
  assert.equal(forwarded.reason, "payment and history verified");
  assert.equal(forwarded.paymentReference, "pay_membership_001");
});

test("anniversary apply is fail-closed without real session context", async () => {
  const authCalls = [];
  const promotionCalls = [];
  const response = await handleInternalRoutes(request("/v1/admin/campaigns/anniversary/apply", "mmdbkk.com", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ claimId: "MMD6-2026-ABCDEF123456", reason: "approved" }),
  }), {
    ADMIN_WORKER: signedAdminWorkerBinding(authCalls, 401),
    PROMOTION_WORKER: promotionWorkerBinding(promotionCalls),
    INTERNAL_SERVICE_SECRET: "s".repeat(32),
  });

  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "admin_session_required");
  assert.equal(authCalls.length, 1);
  assert.equal(promotionCalls.length, 0);
});

test("anniversary apply forwards claim and signed context without browser credentials", async () => {
  const authCalls = [];
  const promotionCalls = [];
  const response = await handleInternalRoutes(request("/v1/admin/campaigns/anniversary/apply", "mmdbkk.com", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ claimId: "MMD6-2026-ABCDEF123456", reason: "final apply", actor: { id: "fake" } }),
  }), {
    ADMIN_WORKER: signedAdminWorkerBinding(authCalls),
    PROMOTION_WORKER: promotionWorkerBinding(promotionCalls, { ok: true, status: "benefit_applied" }),
    INTERNAL_SERVICE_SECRET: "s".repeat(32),
  });

  assert.equal(response.status, 200);
  const forwarded = JSON.parse(await promotionCalls[0].text());
  assert.equal(forwarded.claimId, "MMD6-2026-ABCDEF123456");
  assert.equal(forwarded.reason, "final apply");
  assert.deepEqual(forwarded.actor, { id: "per", sessionId: "adm_signed_session_001" });
});

test("workers.dev and unknown hosts do not verify a public-host cookie", async () => {
  for (const host of ["immigrate-worker.malemodel-bkk.workers.dev", "evil.example"]) {
    const calls = [];
    const { result: response, calls: publicCalls } = await withPublicFetchTrap(() => handleInternalRoutes(request("/internal/admin/control-room", host), {
      ADMIN_WORKER: adminWorkerBinding(calls),
      ADMIN_WORKER_BASE_URL: "https://admin-worker.malemodel-bkk.workers.dev",
    }));

    assert.equal(calls.length, 0, host);
    assert.equal(publicCalls, 0, host);
    assert.equal(response.status, 302, host);
    assert.equal(response.headers.get("location"), "/internal/admin/login?next=%2Finternal%2Fadmin%2Fcontrol-room", host);
  }
});

test("apex and www remain independently host-bound by the binding verification URL", async () => {
  const cases = [
    ["mmdbkk.com", "https://mmdbkk.com/v1/admin/auth/me"],
    ["www.mmdbkk.com", "https://www.mmdbkk.com/v1/admin/auth/me"],
  ];

  for (const [host, expectedUrl] of cases) {
    const calls = [];
    const { result: response } = await withPublicFetchTrap(() => handleInternalRoutes(request("/internal/admin/control-room", host), {
      ADMIN_WORKER: adminWorkerBinding(calls, 401),
      ADMIN_WORKER_BASE_URL: "https://admin-worker.malemodel-bkk.workers.dev",
    }));

    assert.equal(calls.length, 1, host);
    assert.equal(calls[0].url, expectedUrl, host);
    assert.equal(response.status, 302, host);
  }
});

test("missing admin-worker binding fails closed without direct public fetch fallback", async () => {
  const { result: response, calls: publicCalls } = await withPublicFetchTrap(() => handleInternalRoutes(request("/internal/admin/control-room"), {
    ADMIN_WORKER_BASE_URL: "https://admin-worker.malemodel-bkk.workers.dev",
  }));

  assert.equal(publicCalls, 0);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/internal/admin/login?next=%2Finternal%2Fadmin%2Fcontrol-room");
});

test("admin API proxy uses admin-worker binding with original public host", async () => {
  const calls = [];
  const { result: response, calls: publicCalls } = await withPublicFetchTrap(() => handleInternalRoutes(request("/v1/admin/models/search?query=test"), {
    ADMIN_WORKER: adminWorkerBinding(calls),
    ADMIN_WORKER_BASE_URL: "https://admin-worker.malemodel-bkk.workers.dev",
  }));

  assert.equal(response.status, 200);
  assert.equal(publicCalls, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://mmdbkk.com/v1/admin/models/search?query=test");
  assert.equal(calls[0].headers.get("authorization"), null);
  assert.equal(calls[0].headers.get("x-mmd-auth-bridge"), "immigrate-internal-admin-api");
});

test("create-job API POST without positive amount is rejected before admin-worker binding", async () => {
  const calls = [];
  const payload = JSON.stringify({ session_id: "sess_public_safe", note: "bridge only" });
  const { result: response, calls: publicCalls } = await withPublicFetchTrap(() => handleInternalRoutes(request("/v1/admin/create-job?source=worker-page", "mmdbkk.com", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: "mmd_admin_gate_v1=safe-test-cookie",
      authorization: "Bearer should-not-forward",
    },
    body: payload,
  }), {
    ADMIN_WORKER: {
      fetch: async (input) => {
        calls.push(input);
        return Response.json({
          ok: true,
          echoed: await input.text(),
          content_type: input.headers.get("content-type"),
        });
      },
    },
    ADMIN_WORKER_BASE_URL: "https://admin-worker.malemodel-bkk.workers.dev",
  }));
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(publicCalls, 0);
  assert.equal(calls.length, 0);
  assert.equal(body.ok, false);
  assert.equal(body.error, "invalid_amount_thb");
});

test("create-job API POST with valid amount forwards through admin-worker binding", async () => {
  const calls = [];
  const payload = JSON.stringify({ session_id: "sess_public_safe", amount_thb: 15000, note: "bridge only" });
  const { result: response, calls: publicCalls } = await withPublicFetchTrap(() => handleInternalRoutes(request("/v1/admin/create-job?source=worker-page", "mmdbkk.com", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: "mmd_admin_gate_v1=safe-test-cookie",
      authorization: "Bearer should-not-forward",
    },
    body: payload,
  }), {
    ADMIN_WORKER: {
      fetch: async (input) => {
        calls.push(input);
        return Response.json({
          ok: true,
          echoed: await input.text(),
          content_type: input.headers.get("content-type"),
        });
      },
    },
    ADMIN_WORKER_BASE_URL: "https://admin-worker.malemodel-bkk.workers.dev",
  }));
  const body = await response.json();
  const forwardedPayload = JSON.parse(body.echoed);

  assert.equal(response.status, 200);
  assert.equal(publicCalls, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://mmdbkk.com/v1/admin/job/create?source=worker-page");
  assert.equal(calls[0].headers.get("authorization"), null);
  assert.equal(forwardedPayload.amount_thb, 15000);
  assert.equal(forwardedPayload.session_id, "sess_public_safe");
});

test("create-job API POST rejects invalid, zero, and negative amount values", async () => {
  for (const amount_thb of ["not-a-number", 0, -100]) {
    const calls = [];
    const payload = JSON.stringify({ session_id: "sess_public_safe", amount_thb });
    const { result: response } = await withPublicFetchTrap(() => handleInternalRoutes(request("/v1/admin/create-job", "mmdbkk.com", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "mmd_admin_gate_v1=safe-test-cookie",
      },
      body: payload,
    }), {
      ADMIN_WORKER: adminWorkerBinding(calls),
      ADMIN_WORKER_BASE_URL: "https://admin-worker.malemodel-bkk.workers.dev",
    }));
    const body = await response.json();

    assert.equal(response.status, 400, String(amount_thb));
    assert.equal(calls.length, 0, String(amount_thb));
    assert.equal(body.error, "invalid_amount_thb", String(amount_thb));
  }
});

test("browser admin API aliases are rewritten to implemented admin-worker endpoints", async () => {
  for (const path of ["/v1/admin/create-session", "/v1/admin/jobs/create-session", "/v1/admin/create-job"]) {
    const calls = [];
    const payload = JSON.stringify({
      session_id: "sess_alias_safe",
      client_lineage: { client_name: "Client Alias" },
      model: { model_name: "Model Alias" },
      work: { job_lane: "public_work" },
      job_details: {
        job_date: "2026-07-24",
        start_time: "18:00",
        end_time: "20:00",
        location_name: "Bridge Desk",
      },
      payment: { amount_thb: 12000 },
      notes: { operation_note: "bridge-alias-test" },
      source: "bridge-alias-test",
    });
    const { result: response, calls: publicCalls } = await withPublicFetchTrap(() => handleInternalRoutes(request(`${path}?source=worker-page`, "www.mmdbkk.com", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "mmd_admin_gate_v1=safe-test-cookie",
        authorization: "Bearer should-not-forward",
      },
      body: payload,
    }), {
      ADMIN_WORKER: {
        fetch: async (input) => {
          calls.push(input);
          return Response.json({ ok: true, echoed: await input.text() });
        },
      },
      ADMIN_WORKER_BASE_URL: "https://admin-worker.malemodel-bkk.workers.dev",
    }));
    const body = await response.json();
    const forwardedPayload = JSON.parse(body.echoed);

    assert.equal(response.status, 200, path);
    assert.equal(publicCalls, 0, path);
    assert.equal(calls.length, 1, path);
    assert.equal(calls[0].url, "https://www.mmdbkk.com/v1/admin/job/create?source=worker-page", path);
    assert.equal(calls[0].headers.get("authorization"), null, path);
    assert.equal(calls[0].headers.get("x-mmd-auth-bridge"), "immigrate-internal-admin-api", path);
    assert.equal(forwardedPayload.client_name, "Client Alias", path);
    assert.equal(forwardedPayload.model_name, "Model Alias", path);
    assert.equal(forwardedPayload.job_type, "public_work", path);
    assert.equal(forwardedPayload.job_date, "2026-07-24", path);
    assert.equal(forwardedPayload.start_time, "18:00", path);
    assert.equal(forwardedPayload.end_time, "20:00", path);
    assert.equal(forwardedPayload.location_name, "Bridge Desk", path);
    assert.equal(forwardedPayload.amount_thb, 12000, path);
  }
});

test("admin API proxy fails closed without admin-worker binding", async () => {
  const { result: response, calls: publicCalls } = await withPublicFetchTrap(() => handleInternalRoutes(request("/v1/admin/models/search?query=test"), {
    ADMIN_WORKER_BASE_URL: "https://admin-worker.malemodel-bkk.workers.dev",
  }));

  assert.equal(publicCalls, 0);
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, "admin_worker_binding_required");
});

test("wrangler routes only expose exact immigrate bridge surfaces", async () => {
  const wrangler = await readFile(join(workerRoot, "wrangler.toml"), "utf8");
  const requiredPatterns = [
    "mmdbkk.com/internal/admin/control-room*",
    "www.mmdbkk.com/internal/admin/control-room*",
    "mmdbkk.com/v1/admin/campaigns/anniversary*",
    "www.mmdbkk.com/v1/admin/campaigns/anniversary*",
    "mmdbkk.com/internal/admin/create-session*",
    "www.mmdbkk.com/internal/admin/create-session*",
    "mmdbkk.com/internal/admin/jobs/create-session*",
    "www.mmdbkk.com/internal/admin/jobs/create-session*",
    "mmdbkk.com/internal/jobs/create-job*",
    "www.mmdbkk.com/internal/jobs/create-job*",
    "mmdbkk.com/a/create-session.js",
    "www.mmdbkk.com/a/create-session.js",
    "mmdbkk.com/v1/admin/ping*",
    "www.mmdbkk.com/v1/admin/ping*",
    "mmdbkk.com/v1/admin/clients/recent*",
    "www.mmdbkk.com/v1/admin/clients/recent*",
    "mmdbkk.com/v1/admin/models/search*",
    "www.mmdbkk.com/v1/admin/models/search*",
    "mmdbkk.com/v1/admin/job/draft*",
    "www.mmdbkk.com/v1/admin/job/draft*",
    "mmdbkk.com/v1/admin/create-session*",
    "www.mmdbkk.com/v1/admin/create-session*",
    "mmdbkk.com/v1/admin/jobs/create-session*",
    "www.mmdbkk.com/v1/admin/jobs/create-session*",
    "mmdbkk.com/v1/admin/create-job*",
    "www.mmdbkk.com/v1/admin/create-job*",
    "mmdbkk.com/v1/admin/line/push*",
    "www.mmdbkk.com/v1/admin/line/push*",
  ];

  for (const pattern of requiredPatterns) {
    assert.match(wrangler, new RegExp(`pattern = "${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  }

  assert.doesNotMatch(wrangler, /pattern = "mmdbkk\.com\/internal\/admin\/\*"/);
  assert.doesNotMatch(wrangler, /pattern = "www\.mmdbkk\.com\/internal\/admin\/\*"/);
  assert.doesNotMatch(wrangler, /pattern = "mmdbkk\.com\/v1\/admin\/clients\/lineage-lookup\*"/);
  assert.doesNotMatch(wrangler, /pattern = "www\.mmdbkk\.com\/v1\/admin\/clients\/lineage-lookup\*"/);
  assert.match(wrangler, /binding = "ADMIN_WORKER"/);
  assert.match(wrangler, /binding = "PROMOTION_WORKER"/);
});

test("protected-page login redirects preserve only same-origin internal next paths", async () => {
  const cases = [
    ["/internal/admin/control-room?tab=line-inbox", "/internal/admin/login?next=%2Finternal%2Fadmin%2Fcontrol-room%3Ftab%3Dline-inbox"],
    ["/internal/admin/jobs/create-session?source=bridge", "/internal/admin/login?next=%2Finternal%2Fadmin%2Fjobs%2Fcreate-session%3Fsource%3Dbridge"],
    ["/internal/jobs/create-job?session=sess_public_safe", "/internal/admin/login?next=%2Finternal%2Fjobs%2Fcreate-job%3Fsession%3Dsess_public_safe"],
  ];

  for (const [path, location] of cases) {
    const calls = [];
    const { result: response, calls: publicCalls } = await withPublicFetchTrap(() => handleInternalRoutes(request(path), {
      ADMIN_WORKER: adminWorkerBinding(calls, 401),
    }));

    assert.equal(calls.length, 1, path);
    assert.equal(publicCalls, 0, path);
    assert.equal(response.status, 302, path);
    assert.equal(response.headers.get("location"), location, path);
    assert.equal(response.headers.get("location").includes("evil.example"), false, path);
  }
});

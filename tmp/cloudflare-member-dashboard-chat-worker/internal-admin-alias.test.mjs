import assert from "node:assert/strict";
import test from "node:test";
import worker from "./index.js";

const env = {};
const ctx = {};

const cases = [
  ["/internal/admin/login", "/sigil/admin/login", null],
  ["/internal/admin/login/", "/sigil/admin/login", null],
  ["/internal/admin/login?t=test123", "/sigil/admin/login?t=test123", null],
  ["/internal/admin/console", "/sigil/admin/login?next=%2Fsigil%2Fadmin%2Fconsole", "/sigil/admin/console"],
  ["/internal/admin/console/", "/sigil/admin/login?next=%2Fsigil%2Fadmin%2Fconsole", "/sigil/admin/console"],
  [
    "/internal/admin/console?t=test123",
    "/sigil/admin/login?next=%2Fsigil%2Fadmin%2Fconsole%3Ft%3Dtest123",
    "/sigil/admin/console?t=test123"
  ],
  ["/internal/admin/dashboard", "/sigil/admin/login?next=%2Fsigil%2Fadmin%2Fconsole", "/sigil/admin/console"],
  ["/internal/admin/dashboard/", "/sigil/admin/login?next=%2Fsigil%2Fadmin%2Fconsole", "/sigil/admin/console"],
  [
    "/internal/admin/dashboard?t=test123",
    "/sigil/admin/login?next=%2Fsigil%2Fadmin%2Fconsole%3Ft%3Dtest123",
    "/sigil/admin/console?t=test123"
  ],
  [
    "/internal/admin/jobs/create-session",
    "/sigil/admin/login?next=%2Fsigil%2Fadmin%2Fjobs%2Fcreate-session",
    "/sigil/admin/jobs/create-session"
  ],
  [
    "/internal/admin/jobs/create-session/",
    "/sigil/admin/login?next=%2Fsigil%2Fadmin%2Fjobs%2Fcreate-session",
    "/sigil/admin/jobs/create-session"
  ],
  [
    "/internal/admin/jobs/create-session?t=test123",
    "/sigil/admin/login?next=%2Fsigil%2Fadmin%2Fjobs%2Fcreate-session%3Ft%3Dtest123",
    "/sigil/admin/jobs/create-session?t=test123"
  ],
  [
    "/internal/admin/jobs/create-job",
    "/sigil/admin/login?next=%2Fsigil%2Fadmin%2Fjobs%2Fcreate-job",
    "/sigil/admin/jobs/create-job"
  ],
  [
    "/internal/admin/jobs/create-job/",
    "/sigil/admin/login?next=%2Fsigil%2Fadmin%2Fjobs%2Fcreate-job",
    "/sigil/admin/jobs/create-job"
  ],
  [
    "/internal/admin/jobs/create-job?t=test123",
    "/sigil/admin/login?next=%2Fsigil%2Fadmin%2Fjobs%2Fcreate-job%3Ft%3Dtest123",
    "/sigil/admin/jobs/create-job?t=test123"
  ]
];

test("GET legacy internal admin aliases redirect to canonical protected admin gate", async () => {
  for (const [path, expectedPathAndSearch, expectedNext] of cases) {
    const response = await worker.fetch(new Request(`https://sigil.mmdbkk.com${path}`), env, ctx);
    assert.equal(response.status, 302, `${path} should redirect with 302`);

    const location = response.headers.get("Location");
    assert.ok(location, `${path} should include Location`);

    const destination = new URL(location);
    assert.equal(destination.origin, "https://sigil.mmdbkk.com", `${path} should stay on sigil host`);
    assert.equal(destination.pathname + destination.search, expectedPathAndSearch, `${path} redirect target`);
    assert.equal(destination.pathname, "/sigil/admin/login", `${path} should land on canonical login gate`);
    assert.equal(destination.searchParams.get("next"), expectedNext, `${path} decoded next target`);
    assert.notEqual(response.headers.get("Content-Type"), "application/json", `${path} should not expose raw JSON`);

    const body = await response.text();
    assert.equal(body, "", `${path} should not expose an admin UI shell`);
  }
});

test("non-GET legacy internal admin aliases keep using protected upstream behavior", async () => {
  const originalFetch = globalThis.fetch;
  let upstreamUrl = "";
  try {
    globalThis.fetch = async (request) => {
      upstreamUrl = request.url;
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    };

    const response = await worker.fetch(
      new Request("https://sigil.mmdbkk.com/internal/admin/console?t=test123", { method: "POST" }),
      env,
      ctx
    );

    assert.equal(response.status, 401);
    assert.equal(upstreamUrl, "https://immigrate-worker.malemodel-bkk.workers.dev/internal/admin/console?t=test123");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

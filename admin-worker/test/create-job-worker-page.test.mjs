import test from "node:test";
import assert from "node:assert/strict";
import {
  CREATE_JOB_WORKER_PATH,
  handleCreateJobWorkerPage,
  isCreateJobWorkerPageRequest,
} from "../src/create-job-worker-page.js";

test("Create Job route and its own assets stay scoped to the existing wildcard route", () => {
  assert.equal(isCreateJobWorkerPageRequest(CREATE_JOB_WORKER_PATH, "GET"), true);
  assert.equal(isCreateJobWorkerPageRequest(CREATE_JOB_WORKER_PATH + "/", "HEAD"), true);
  assert.equal(isCreateJobWorkerPageRequest(CREATE_JOB_WORKER_PATH, "POST"), false);
  assert.equal(isCreateJobWorkerPageRequest(CREATE_JOB_WORKER_PATH + "/assets/index-BxWrA1mH.js", "GET"), true);
  assert.equal(isCreateJobWorkerPageRequest("/internal/admin/jobs/job-board", "GET"), false);
});

test("the owner-gated Create Job page renders locally and retains its query", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Create Job must not fetch an external presentation host"); };
  try {
    const response = await handleCreateJobWorkerPage(new Request("https://mmdbkk.com/internal/admin/jobs/create-job?mode=broadcast&view=list"));
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-mmd-route-owner"), "admin-worker-api-create-job");
    assert.equal(response.headers.get("set-cookie"), null);
    assert.match(html, /Create Job/);
    assert.match(html, /\/internal\/admin\/jobs\/create-job\/assets\//);
    assert.doesNotMatch(html, /mmd-os\.lovable\.app/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("serves only vendored hashed assets with no network fetch", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("asset must be local"); };
  try {
    const js = await handleCreateJobWorkerPage(new Request("https://mmdbkk.com/internal/admin/jobs/create-job/assets/index-BxWrA1mH.js"));
    assert.equal(js.status, 200);
    assert.match(js.headers.get("content-type") || "", /javascript/);
    assert.ok((await js.arrayBuffer()).byteLength > 100_000);

    const css = await handleCreateJobWorkerPage(new Request("https://mmdbkk.com/internal/admin/jobs/create-job/assets/styles-DZIiclOT.css", { method: "HEAD" }));
    assert.equal(css.status, 200);
    assert.match(css.headers.get("content-type") || "", /text\/css/);
    assert.equal(await css.text(), "");

    const missing = await handleCreateJobWorkerPage(new Request("https://mmdbkk.com/internal/admin/jobs/create-job/assets/missing.js"));
    const traversal = await handleCreateJobWorkerPage(new Request("https://mmdbkk.com/internal/admin/jobs/create-job/assets/%2e%2e/private.js"));
    assert.equal(missing.status, 404);
    assert.equal(traversal.status, 404);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HEAD serves no page body", async () => {
  const response = await handleCreateJobWorkerPage(new Request("https://mmdbkk.com/internal/admin/jobs/create-job", { method: "HEAD" }));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "");
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  CREATE_JOB_WORKER_PATH,
  handleCreateJobWorkerPage,
  isCreateJobWorkerPageRequest,
} from "../src/create-job-worker-page.js";

test("Create Job is served by the Worker only at its exact page route", () => {
  assert.equal(isCreateJobWorkerPageRequest(CREATE_JOB_WORKER_PATH, "GET"), true);
  assert.equal(isCreateJobWorkerPageRequest(CREATE_JOB_WORKER_PATH + "/", "HEAD"), true);
  assert.equal(isCreateJobWorkerPageRequest(CREATE_JOB_WORKER_PATH, "POST"), false);
  assert.equal(isCreateJobWorkerPageRequest(CREATE_JOB_WORKER_PATH + "/assets/app.js", "GET"), false);
});

test("Worker-owned page calls canonical APIs and never loads Lovable assets", async () => {
  const response = handleCreateJobWorkerPage(new Request("https://mmdbkk.com/internal/admin/jobs/create-job"));
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store, private");
  assert.equal(response.headers.get("x-mmd-route-owner"), "admin-worker-api-create-job");
  assert.match(html, /\/v1\/admin\/clients\/lineage-lookup/);
  assert.match(html, /\/v1\/admin\/models\/search/);
  assert.match(html, /\/v1\/admin\/job\/create/);
  assert.match(html, /\/v1\/admin\/job\/owner-grant/);
  assert.doesNotMatch(html, /lovable\.app|\/assets\//i);
});

test("Worker-owned page supports HEAD without returning the HTML body", async () => {
  const response = handleCreateJobWorkerPage(new Request("https://mmdbkk.com/internal/admin/jobs/create-job", { method: "HEAD" }));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "");
});

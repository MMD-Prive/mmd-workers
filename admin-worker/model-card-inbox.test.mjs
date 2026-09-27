import test from "node:test";
import assert from "node:assert/strict";
import { ModelCardCoordinator, handleStudioCards, safeCardJob } from "./src/model-card-automation.js";

const legacyPrefix = "studio-card-drafts/index/";
const orderedPrefix = "studio-card-drafts/index-by-created/";
const route = "/studio/api/model-cards/list";
function draft(n, time = n) {
  return {
    model_record_id: `rec${String(n).padStart(14, "0")}`,
    job_id: `card_${n.toString(16).padStart(32, "0")}`,
    created_at: new Date(Date.UTC(2026, 8, 27) + time * 1000).toISOString(),
    state: "waiting_profile", stage: "prepare", design: { title: `Model ${n}` },
  };
}
function inbox(listBatch = 1000) {
  const objects = new Map(), stored = new Map();
  const calls = { get: [], list: [], put: [], delete: [], alarms: [] };
  const bucket = {
    async put(key, value) { calls.put.push(key); objects.set(key, JSON.parse(value)); },
    async delete(key) { calls.delete.push(key); objects.delete(key); },
    async get(key) {
      calls.get.push(key);
      const value = objects.get(key);
      return value ? { json: async () => structuredClone(value) } : null;
    },
    async list({ prefix, limit, cursor }) {
      calls.list.push({ prefix, limit, cursor });
      assert.ok(!cursor || cursor.startsWith("r2:"), "only R2's cursor may be passed to R2");
      const keys = [...objects.keys()].filter((key) => key.startsWith(prefix) && (!cursor || key > cursor.slice(3))).sort();
      const page = keys.slice(0, Math.min(limit, listBatch));
      const truncated = page.length < keys.length;
      return { objects: page.map((key) => ({ key })), truncated, cursor: truncated ? `r2:${page.at(-1)}` : undefined };
    },
  };
  const env = { MMD_MODEL_ASSETS: bucket, MODEL_CARD_AUTO_ENABLED: "false" };
  const coordinator = new ModelCardCoordinator({ storage: {
    async put(key, value) { stored.set(key, structuredClone(value)); },
    async get(key) { return structuredClone(stored.get(key)); },
    async setAlarm(at) { calls.alarms.push(at); },
  } }, env);
  return { env, bucket, objects, calls, coordinator, stored,
    legacy: async (job) => bucket.put(`${legacyPrefix}${job.model_record_id}.json`, JSON.stringify(safeCardJob(job, true))),
    save: async (job) => coordinator.save(job),
    async page(cursor) {
      const response = await handleStudioCards(env, route, cursor ? { cursor } : {});
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      return response.json();
    },
  };
}
const expectedIds = (jobs) => [...jobs].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) ||
  (a.model_record_id < b.model_record_id ? -1 : a.model_record_id > b.model_record_id ? 1 :
    a.job_id < b.job_id ? -1 : a.job_id > b.job_id ? 1 : 0)).map((job) => job.job_id);
async function allPages(h, cursor) {
  const jobs = [], sizes = [], cursors = new Set();
  do {
    const page = await h.page(cursor);
    jobs.push(...page.jobs); sizes.push(page.jobs.length); cursor = page.cursor;
    assert.ok(!cursor || !cursors.has(cursor), "pagination must advance");
    cursors.add(cursor);
  } while (cursor);
  return { ids: jobs.map((job) => job.job_id), sizes };
}

test("51 legacy drafts: the newest model is on page one, not page two", async () => {
  const h = inbox(), jobs = Array.from({ length: 51 }, (_, i) => draft(i + 1));
  for (const job of jobs) await h.legacy(job);
  const writes = h.calls.put.length;
  const first = await h.page();
  assert.equal(first.jobs[0].job_id, jobs.at(-1).job_id);
  assert.deepEqual(first.jobs.map((job) => job.job_id), expectedIds(jobs).slice(0, 50));
  const second = await h.page(first.cursor);
  assert.deepEqual(second.jobs.map((job) => job.job_id), [jobs[0].job_id]);
  assert.equal(second.cursor, null);
  assert.equal(h.calls.put.length, writes, "listing must not migrate or delete drafts");
  assert.equal(h.calls.delete.length, 0);
});

test("151 ordered drafts paginate globally with deterministic ties and short R2 batches", async () => {
  const h = inbox(13), jobs = Array.from({ length: 151 }, (_, i) => draft(i + 1, Math.floor(i / 3)));
  for (const job of [...jobs].reverse()) await h.save(job);
  const pages = await allPages(h);
  assert.deepEqual(pages.ids, expectedIds(jobs));
  assert.deepEqual(pages.sizes, [50, 50, 50, 1]);
  assert.equal(new Set(pages.ids).size, jobs.length);
});

test("legacy and ordered drafts merge before pagination without duplicates", async () => {
  const h = inbox(19), jobs = Array.from({ length: 126 }, (_, i) => draft(i + 1));
  for (const [i, job] of jobs.entries()) {
    if (i % 2) await h.legacy(job); else await h.save(job);
    if (i % 5 === 0) await h.legacy(job); // old metadata left by an interrupted cleanup
  }
  const pages = await allPages(h);
  assert.deepEqual(pages.ids, expectedIds(jobs));
  assert.deepEqual(pages.sizes, [50, 50, 26]);
});

test("new arrivals and a removed boundary do not shift or repeat subsequent pages", async () => {
  const h = inbox(17), jobs = Array.from({ length: 120 }, (_, i) => draft(i + 1));
  for (const job of jobs) await h.save(job);
  const first = await h.page();
  await h.save(draft(121));
  await h.legacy(draft(122));
  const boundary = first.jobs.at(-1).job_id;
  for (const [key, value] of h.objects) if (value.job_id === boundary) h.objects.delete(key);
  assert.deepEqual((await allPages(h, first.cursor)).ids, expectedIds(jobs).slice(50));
  const refreshed = await h.page();
  assert.deepEqual(refreshed.jobs.slice(0, 2).map((job) => job.job_id), [draft(122).job_id, draft(121).job_id]);
});

test("ordered pages fetch only a page plus lookahead, not every draft body", async () => {
  const h = inbox(), jobs = Array.from({ length: 150 }, (_, i) => draft(i + 1));
  for (const job of jobs) await h.save(job);
  const first = await h.page();
  assert.equal(h.calls.get.length, 51);
  h.calls.get.length = 0;
  await h.page(first.cursor);
  assert.equal(h.calls.get.length, 51);
  assert.ok(h.calls.get.every((key) => !first.jobs.some((job) => key.includes(job.job_id))));
});

test("objects deleted between list and get do not create short or skipped pages", async () => {
  const h = inbox(17), jobs = Array.from({ length: 60 }, (_, i) => draft(i + 1));
  for (const job of jobs) await h.save(job);
  const get = h.bucket.get.bind(h.bucket);
  h.bucket.get = async (key) => {
    if (key.includes(jobs.at(-1).job_id)) h.objects.delete(key);
    return get(key);
  };
  const pages = await allPages(h);
  assert.deepEqual(pages.ids, expectedIds(jobs.slice(0, -1)));
  assert.deepEqual(pages.sizes, [50, 9]);
});

test("migration during a legacy read cannot hide the draft", async () => {
  const h = inbox(17), jobs = Array.from({ length: 60 }, (_, i) => draft(i + 1));
  for (const job of jobs) await h.legacy(job);
  const get = h.bucket.get.bind(h.bucket);
  h.bucket.get = async (key) => {
    const job = jobs.find((job) => key === `${legacyPrefix}${job.model_record_id}.json`);
    if (job && h.objects.has(key)) await h.save(job);
    return get(key);
  };
  assert.deepEqual((await allPages(h)).ids, expectedIds(jobs));
});

test("failed index writes retain legacy metadata; successful saves replace only metadata", async () => {
  const h = inbox(), job = draft(1);
  await h.legacy(job);
  const portrait = `studio-card-drafts/${job.model_record_id}/${job.job_id}/card.png`;
  h.objects.set(portrait, { image: "fixture" });
  const put = h.bucket.put.bind(h.bucket);
  h.bucket.put = async () => { throw new Error("storage unavailable"); };
  await h.save(job);
  assert.equal(h.calls.delete.length, 0);
  assert.equal((await h.page()).jobs.length, 1);
  assert.equal(h.stored.get("job").index_retries, 1);
  assert.equal(h.calls.alarms.length, 1);
  h.bucket.put = put;
  await h.save(job);
  job.state = "awaiting_owner_review";
  await h.save(job);
  assert.equal((await h.page()).jobs[0].state, "awaiting_owner_review");
  assert.equal([...h.objects.keys()].filter((key) => key.startsWith(orderedPrefix)).length, 1);
  assert.equal(h.objects.has(`${legacyPrefix}${job.model_record_id}.json`), false);
  assert.equal(h.objects.has(portrait), true);
  assert.equal(h.stored.get("job").index_retries, undefined);
});

test("failed legacy cleanup does not duplicate a draft or override its latest state", async () => {
  const h = inbox(), job = draft(1);
  await h.legacy(job);
  const remove = h.bucket.delete.bind(h.bucket);
  h.bucket.delete = async () => { throw new Error("delete unavailable"); };
  job.state = "awaiting_owner_review";
  await h.save(job);
  const page = await h.page();
  assert.equal(page.jobs.length, 1);
  assert.equal(page.jobs[0].state, "awaiting_owner_review");
  assert.equal(h.stored.get("job").index_retries, 1);
  h.bucket.delete = remove;
  await h.save(job);
  assert.equal(h.objects.has(`${legacyPrefix}${job.model_record_id}.json`), false);
});

test("empty inbox and full final pages return no cursor; invalid cursors never reach R2", async () => {
  const h = inbox();
  assert.deepEqual(await h.page(), { ok: true, enabled: false, jobs: [], cursor: null });
  for (let n = 1; n <= 50; n++) await h.save(draft(n));
  const full = await h.page();
  assert.equal(full.jobs.length, 50); assert.equal(full.cursor, null);
  const reads = h.calls.list.length;
  for (const cursor of ["old-r2-cursor", "v1:../../private", "x".repeat(2049), "v2:unknown"]) {
    const response = await handleStudioCards(h.env, route, { cursor });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "invalid_cursor");
  }
  assert.equal(h.calls.list.length, reads);
});

import test from "node:test";
import assert from "node:assert/strict";
import { handleAdminJobBoardPublish, handleAdminBroadcastRead } from "../src/job-board-owner-publish.js";
import { handlePublicJobBoardV2Request, PUBLIC_JOB_BOARD_V2_INTERNALS } from "../../public-access-worker/src/public-job-board-v2.js";
import adminWorker from "../src/admin-login-hero-worker.js";
import { createCredentialBoundAdminSession } from "../src/credential-bound-admin-session.js";

class R2Fixture {
  rows = new Map();
  failRead = false;
  crashAt = "";
  async put(key, body, options = {}) {
    if (options.onlyIf?.etagDoesNotMatch === "*" && this.rows.has(key)) return null;
    this.rows.set(key, body);
    if (this.crashAt && key.includes(this.crashAt)) { this.crashAt = ""; throw Error("simulated lost write response"); }
    return { key };
  }
  async get(key) {
    if (this.failRead) throw Error("simulated read failure");
    const body = this.rows.get(key);
    return body === undefined ? null : { text: async () => body };
  }
  async list({ prefix, limit, cursor }) {
    if (this.failRead) throw Error("simulated list failure");
    const all = [...this.rows.keys()].filter(k => k.startsWith(prefix)).sort();
    const offset = Number(cursor || 0);
    return { objects: all.slice(offset, offset + limit).map(key => ({ key })), truncated: offset + limit < all.length, cursor: String(offset + limit) };
  }
}
const owner = { id: "per", role: "owner" };
const body = { world: "private", board_text: "Fixture brief", title: "Fixture title", compensation: "8000", owner_note: "OWNER SECRET", budget_disclosure_approved: false };
function setup() {
  const bucket = new R2Fixture();
  const publicEnv = { PUBLIC_ACCESS_EVIDENCE: bucket };
  const env = { PUBLIC_JOB_BOARD_WORKER: { fetch: r => handlePublicJobBoardV2Request(r, publicEnv) } };
  return { bucket, env, publicEnv };
}
function publish(env, payload = body, key = "fixture-key-00000001", actor = owner) {
  return handleAdminJobBoardPublish(new Request("https://www.mmdbkk.com/v1/admin/job-board/publish", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify(payload) }), env, actor);
}
function read(env, suffix = "/status?idempotency_key=fixture-key-00000001", actor = owner) {
  return handleAdminBroadcastRead(new Request(`https://www.mmdbkk.com/v1/admin/jobs/broadcast${suffix}`), env, actor);
}
function count(bucket, part) { return [...bucket.rows.keys()].filter(k => k.includes(part)).length; }

test("concurrent same-key requests create exactly one reservation, job and short alias", async () => {
  const { env, bucket } = setup();
  const results = await Promise.all(Array.from({ length: 16 }, () => publish(env).then(r => r.json())));
  assert.equal(new Set(results.map(r => r.job_id)).size, 1);
  assert.ok(results.every(r => r.ok && r.broadcast_url === results[0].broadcast_url));
  assert.equal(count(bucket, "/jobs/"), 1);
  assert.equal(count(bucket, "/short/"), 1);
  assert.equal(count(bucket, "/publish/"), 1);
});
test("same key with different normalized payload rejects; owner scope is stable across sessions and distinct between actors", async () => {
  const { env, bucket } = setup();
  const first = await (await publish(env)).json();
  assert.equal((await publish(env, { ...body, title: "Different" })).status, 409);
  const replay = await (await publish(env, body, "fixture-key-00000001", { ...owner, nonce: "another-session" })).json();
  assert.equal(replay.job_id, first.job_id);
  assert.equal((await read(env, undefined, { id: "different", role: "admin" })).status, 200);
  assert.equal((await (await read(env, undefined, { id: "different", role: "admin" })).json()).state, "not_found");
  assert.equal(count(bucket, "/jobs/"), 1);
});
for (const crashAt of ["/publish/", "/short/", "/jobs/"]) {
  test(`crash after committed ${crashAt} is recovered without deletion or new job`, async () => {
    const { env, bucket } = setup();
    bucket.crashAt = crashAt;
    assert.equal((await publish(env)).status, 500);
    const status = await (await read(env)).json();
    assert.ok(["pending", "published"].includes(status.state));
    const result = await (await publish(env)).json();
    assert.equal(result.ok, true);
    const recovered = await (await read(env)).json();
    assert.equal(recovered.job_id, result.job_id);
    assert.equal(recovered.broadcast_url, result.broadcast_url);
    assert.equal(count(bucket, "/jobs/"), 1);
    assert.equal(count(bucket, "/short/"), 1);
  });
}
test("lost client response can read original receipt; unavailable/corrupt storage never becomes not_found", async () => {
  const { env, bucket } = setup();
  const receipt = await (await publish(env)).json();
  const recovered = await (await read(env)).json();
  assert.equal(recovered.job_id, receipt.job_id);
  bucket.failRead = true;
  assert.ok((await read(env)).status >= 500);
  assert.ok((await read(env, "?limit=20")).status >= 500);
  bucket.failRead = false;
  const key = [...bucket.rows.keys()].find(k => k.includes("/publish/"));
  bucket.rows.set(key, "invalid json");
  assert.ok((await read(env)).status >= 500);
});
test("owner list/detail paginates authoritative records and rejects unauthorized reads", async () => {
  const { env } = setup();
  const one = await (await publish(env)).json();
  await publish(env, { ...body, world: "public" }, "fixture-key-00000002");
  const page = await (await read(env, "?limit=1")).json();
  assert.equal(page.jobs.length, 1);
  assert.ok(page.next_cursor);
  const next = await (await read(env, `?limit=1&cursor=${page.next_cursor}`)).json();
  assert.equal(next.jobs.length, 1);
  assert.notEqual(next.jobs[0].id, page.jobs[0].id);
  assert.equal(next.next_cursor, null);
  const detail = await (await read(env, `/${one.job_id}`)).json();
  assert.equal(detail.job.protected.owner_note, body.owner_note);
  assert.equal((await read(env, "/JOB-missing")).status, 404);
  assert.equal((await read(env, "?limit=51")).status, 400);
  assert.equal((await read(env, "", null)).status, 401);
  assert.equal((await publish(env, body, "fixture-key-00000001", { id: "model", role: "model" })).status, 401);
});
test("canonical short alias collision has deterministic fallback across concurrent retries", async () => {
  const { env, bucket } = setup();
  bucket.crashAt = "/publish/";
  await publish(env);
  const reservation = JSON.parse([...bucket.rows.entries()].find(([k]) => k.includes("/publish/"))[1]);
  const code = reservation.job.id.split("-").at(-1);
  bucket.rows.set(`public-job-board/v2/short/${code}.json`, JSON.stringify({ schema: "mmd_public_job_board_v2.short", job_id: "OTHER" }));
  const results = await Promise.all(Array.from({ length: 8 }, () => publish(env).then(r => r.json())));
  assert.ok(results.every(r => r.ok && r.broadcast_url === results[0].broadcast_url));
  assert.equal(count(bucket, "/jobs/"), 1);
  assert.equal(count(bucket, "/short/"), 2);
});
test("private projection hides owner note, teaser and hidden budget including structured brief lines", async () => {
  const { env, bucket } = setup();
  const result = await (await publish(env, { ...body, board_text: "Fixture brief\n💰 8000 บาท" })).json();
  const job = JSON.parse(bucket.rows.get(`public-job-board/v2/jobs/${result.job_id}.json`));
  const teaser = PUBLIC_JOB_BOARD_V2_INTERNALS.publicJobView(job);
  assert.equal(teaser.title, "PRIVATE JOB");
  assert.equal(teaser.compensation, "");
  const detail = PUBLIC_JOB_BOARD_V2_INTERNALS.publicJobView(job, { detail: true });
  assert.ok(!JSON.stringify(detail).includes("8000"));
  assert.ok(!JSON.stringify(detail).includes("OWNER SECRET"));
  job.public.budget_disclosure_approved = true;
  assert.equal(PUBLIC_JOB_BOARD_V2_INTERNALS.publicJobView(job, { detail: true }).compensation, "8000");
});

test("actual admin ingress uses credential-bound cookie and ignores supplied owner-scope headers", async () => {
  const { env } = setup();
  const runtime = { ...env, ADMIN_LOGIN_CREDENTIAL: "local-fixture-admin-credential", ADMIN_SESSION_SECRET: "local-fixture-session-secret" };
  const url = "https://www.mmdbkk.com/v1/admin/jobs/broadcast/status?idempotency_key=fixture-key-00000001";
  const unauthorized = await adminWorker.fetch(new Request(url, { headers: { "x-mmd-owner-scope": "a".repeat(64) } }), runtime, { waitUntil() {} });
  assert.equal(unauthorized.status, 401);
  const cookie = await createCredentialBoundAdminSession(new Request(url), owner, runtime);
  const authorized = await adminWorker.fetch(new Request(url, { headers: { cookie: `mmd_admin_gate_v1=${cookie}` } }), runtime, { waitUntil() {} });
  assert.equal(authorized.status, 200);
  assert.equal((await authorized.json()).state, "not_found");
  assert.match(authorized.headers.get("cache-control"), /no-store/);
});

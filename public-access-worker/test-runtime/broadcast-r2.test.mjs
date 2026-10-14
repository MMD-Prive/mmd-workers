import { Miniflare } from "miniflare";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { createJobRecord } from "../src/public-job-board-v2.js";
import { createHash } from "node:crypto";

test("workerd R2 conditional writes deduplicate concurrent publish and resume a durable reservation", async () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const files = ["public-access-worker/src/public-job-board-v2.js", "public-access-worker/src/broadcast-owner-store.js", "shared/model-job-board-links.mjs"];
  const modules = await Promise.all(files.map(async path => ({ type: "ESModule", path, contents: await readFile(root + path, "utf8") })));
  const mf = new Miniflare({ modulesRoot: root, modules: [{ type: "ESModule", path: "public-access-worker/test-runtime/entry.js", contents: `import { handlePublicJobBoardV2Request } from '../src/public-job-board-v2.js'; export default { fetch: handlePublicJobBoardV2Request };` }, ...modules], compatibilityDate: "2026-07-18", r2Buckets: ["PUBLIC_ACCESS_EVIDENCE"] });
  try {
    const headers = { "content-type": "application/json", "idempotency-key": "runtime-fixture-key-0001", "x-mmd-owner-scope": "a".repeat(64) };
    const payload = { brief: "Local R2 runtime fixture", world: "private", status: "published" };
    const send = () => mf.dispatchFetch("https://public-job-board.internal/__internal/job-board/publish", { method: "POST", headers, body: JSON.stringify(payload) }).then(r => r.json());
    const results = await Promise.all(Array.from({ length: 12 }, send));
    assert.ok(results.every(r => r.ok), JSON.stringify(results));
    assert.equal(new Set(results.map(r => r.job.id)).size, 1);
    const bucket = await mf.getR2Bucket("PUBLIC_ACCESS_EVIDENCE");
    for (const part of ["jobs", "short", "publish"]) assert.equal((await bucket.list({ prefix: `public-job-board/v2/${part}/` })).objects.length, 1);
    const conflict = await mf.dispatchFetch("https://public-job-board.internal/__internal/job-board/publish", { method: "POST", headers, body: JSON.stringify({ ...payload, brief: "Different" }) });
    assert.equal(conflict.status, 409);
    const published = await mf.dispatchFetch("https://public-job-board.internal/__internal/job-board/status?idempotency_key=runtime-fixture-key-0001", { headers }).then(r => r.json());
    assert.equal(published.job_id, results[0].job.id);
    assert.equal(published.broadcast_url, results[0].job.broadcast_url);
    // Seed only the committed reservation to simulate a process crash before
    // alias/job writes, then let the real Worker resume it.
    const digest = value => createHash("sha256").update(value).digest("hex");
    const recoveryKey = "runtime-fixture-key-0002";
    const path = `public-job-board/v2/publish/${"a".repeat(64)}/${digest(recoveryKey)}.json`;
    const reservedJob = { ...createJobRecord(payload), broadcast_operation: digest(path) };
    const reservation = { schema: "mmd_broadcast_publish_v1", fingerprint: digest(JSON.stringify({ brief: payload.brief, status: payload.status, world: payload.world })), job: reservedJob };
    await bucket.put(path, JSON.stringify(reservation), { onlyIf: { etagDoesNotMatch: "*" } });
    const pending = await mf.dispatchFetch(`https://public-job-board.internal/__internal/job-board/status?idempotency_key=${recoveryKey}`, { headers }).then(r => r.json());
    assert.equal(pending.state, "pending");
    const replay = await mf.dispatchFetch("https://public-job-board.internal/__internal/job-board/publish", { method: "POST", headers: { ...headers, "idempotency-key": recoveryKey }, body: JSON.stringify(payload) }).then(r => r.json());
    assert.equal(replay.ok, true, JSON.stringify(replay));
    assert.equal(replay.job.id, reservedJob.id);
    assert.equal((await bucket.list({ prefix: "public-job-board/v2/jobs/" })).objects.length, 2);

  } finally { await mf.dispose(); }
});

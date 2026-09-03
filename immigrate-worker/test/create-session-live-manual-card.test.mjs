import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";

const tmp = await mkdtemp(join(tmpdir(), "create-session-live-manual-card-"));
const outfile = join(tmp, "simple-start-live.mjs");
const workerRoot = dirname(dirname(fileURLToPath(import.meta.url)));

await build({
  entryPoints: [join(workerRoot, "src/create-session-simple-start.ts")],
  outfile,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
});

const { applyCreateSessionSimpleStart } = await import(pathToFileURL(outfile).href);
const ownerHtml = await readFile(join(workerRoot, "public/a/create-sessions-owner-v14.html"), "utf8");
const page = `<!doctype html><html><head></head><body>${ownerHtml.replace('data-admin-base="https://mmdbkk.com"', 'data-admin-base=""')}<script src="/a/create-session.js"></script></body></html>`;

test.after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

test("owner create-session keeps API on the same-origin bridge and fixes picked-card grid", () => {
  const body = applyCreateSessionSimpleStart(page);

  assert.match(body, /data-admin-base="\/"/);
  assert.doesNotMatch(body, /data-admin-base=""/);
  assert.match(body, /data-live-manual-card-fix="v1"/);
  assert.match(body, /\.mmd-cs-v14__pickedCard > \[data-op-lineage-badge\]/);
  assert.match(body, /position: absolute/);
  assert.match(body, /Public Ready/);
  assert.match(body, /manual_name_pending_reconcile/);

  const twice = applyCreateSessionSimpleStart(body);
  assert.equal((twice.match(/data-live-manual-card-fix="v1"/g) || []).length, 1);
  assert.equal(twice, body);
});

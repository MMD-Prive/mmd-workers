import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { BASE_HASH, BASE_BYTES, NAMESPACE, SOURCE_PINS, build, getFunction, reviewedFunction, sha, verifyPreservation } from "./member-builder.mjs";

const root = path.resolve(process.env.MEMBER_SOURCE_ROOT || ".");
const baselinePath = process.env.MEMBER_BASELINE;
const candidatePath = process.env.MEMBER_CANDIDATE;
assert.ok(baselinePath, "MEMBER_BASELINE must identify the exact downloaded live module");
assert.ok(candidatePath, "MEMBER_CANDIDATE must identify the actual release candidate");
const baseline = fs.readFileSync(baselinePath);
const candidate = fs.readFileSync(candidatePath);
const output = fs.mkdtempSync(path.join(os.tmpdir(), "member-binding-build-test-"));
const built = build(baseline, { sourceRoot: root, outputDir: output });

test("downloaded baseline is the independently approved module and byte count", () => {
  assert.equal(baseline.length, BASE_BYTES);
  assert.equal(sha(baseline), BASE_HASH);
});

test("source mapping uses only confirmed live dependencies and one isolated fresh helper", () => {
  const source = reviewedFunction(root);
  assert.match(source, /cookieValue3\(request,/);
  assert.match(source, /readSession = readMemberAppSession/);
  assert.match(source, /__publicBookingIdentityPatch\.resolveBookingPerRename\(env,/);
  assert.ok(source.includes(NAMESPACE + ".verifyBookingMemberBinding(env,"));
  assert.match(source, /identity_binding_verified: true/);
  const compiled = candidate.toString("utf8");
  const node = getFunction(compiled, "handleDiscoveryViewer");
  assert.equal(compiled.slice(node.start, node.end), source);
});

test("the actual candidate is byte-identical to an independent pinned rebuild", () => {
  assert.ok(candidate.equals(built.candidate));
  assert.equal(sha(candidate), built.manifest.candidate_sha256);
  assert.equal(built.manifest.edits.length, 2);
  assert.deepEqual(built.manifest.edits.map(edit => edit.label), ["handleDiscoveryViewer", "isolated booking binding helper"]);
});

test("inverse reconstruction preserves all unrelated live overlays and exports", () => {
  verifyPreservation(baseline, candidate, built.edits);
  assert.equal(built.manifest.exports_unchanged, true);
  assert.ok(baseline.toString().startsWith("// Nightline skin-only overlay;"));
  assert.ok(candidate.subarray(0, 100000).equals(baseline.subarray(0, 100000)), "Nightline skin prefix retained");
  assert.ok(candidate.subarray(-10000).equals(baseline.subarray(-10000)), "wallet-credits suffix retained");
  assert.deepEqual(Object.keys(built.manifest.preserved_dependencies).sort(), ["__publicBookingIdentityPatch", "attachDiscoverySession", "cookieValue3", "loadMemberAppSessionState", "readMemberAppSession"].sort());
});

test("inverse proof detects an unrelated one-byte edit", () => {
  const corrupted = Buffer.from(candidate);
  corrupted[3] ^= 1;
  assert.throws(() => verifyPreservation(baseline, corrupted, built.edits), /unrelated live module bytes changed/);
});

test("baseline byte drift is rejected before transformation", () => {
  assert.throws(() => build(Buffer.from("wrong"), { sourceRoot: root, outputDir: output }), /baseline length drift/);
  const corrupted = Buffer.from(baseline);
  corrupted[0] ^= 1;
  assert.throws(() => build(corrupted, { sourceRoot: root, outputDir: output }), /baseline drift/);
});

test("either reviewed source changing invalidates the build", () => {
  for (const name of Object.keys(SOURCE_PINS)) {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "member-source-drift-"));
    const directory = path.join(temp, "member-pages-worker/src");
    fs.mkdirSync(directory, { recursive: true });
    for (const file of Object.keys(SOURCE_PINS)) fs.copyFileSync(path.join(root, "member-pages-worker/src", file), path.join(directory, file));
    fs.appendFileSync(path.join(directory, name), "\n// unreviewed drift\n");
    assert.throws(() => build(baseline, { sourceRoot: temp, outputDir: output }), new RegExp("reviewed source drift " + name));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("manifest carries source identity and declares no settings or migrations", () => {
  assert.equal(built.manifest.source_sha, execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim());
  assert.equal(built.manifest.source_tree, execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: root, encoding: "utf8" }).trim());
  assert.deepEqual(built.manifest.source_hashes, SOURCE_PINS);
  assert.deepEqual(built.manifest.migrations, []);
  assert.deepEqual(built.manifest.settings_changes, []);
  assert.equal(built.manifest.worker, "member-pages-worker");
  assert.equal(built.manifest.module, "worker.js");
});

test.after(() => { fs.rmSync(output, { recursive: true, force: true }); });

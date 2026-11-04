import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { parse } = require(require.resolve("acorn", {
  paths: process.env.BUILD_TOOLS_DIR ? [process.env.BUILD_TOOLS_DIR] : undefined,
}));
export const BASE_HASH = "e8924a29d90b47c254eba84ffae85256b574569443be9a37ad748deebb5d87f5";
export const BASE_BYTES = 3358531;
export const NAMESPACE = "__bookingMemberBindingPatch20261103";
export const SOURCE_PINS = Object.freeze({
  "booking-discovery-viewer.js": "d67692f94b5a2e3c2ebb2f520c5ff2169f24282648c66ffe15b5f59ec77709ce",
  "booking-member-binding.js": "c1fa3afd2203cf5c897e68b8818384e64aa43533207f8ad90c16ab7eda9185a1",
});
export const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const ast = source => parse(source, { ecmaVersion: "latest", sourceType: "module" });
const scriptDir = dirname(fileURLToPath(import.meta.url));

function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === "start" || key === "end") continue;
    if (Array.isArray(value)) value.forEach(child => walk(child, visit));
    else if (value && typeof value === "object") walk(value, visit);
  }
}

export function getFunction(source, name, tree = ast(source)) {
  const matches = tree.body.map(node => node.type === "ExportNamedDeclaration" ? node.declaration : node)
    .filter(node => node?.type === "FunctionDeclaration" && node.id.name === name);
  assert.equal(matches.length, 1, "unique top-level function " + name);
  return matches[0];
}

function variable(source, name, tree) {
  const matches = tree.body.filter(node => node.type === "VariableDeclaration" && node.declarations.some(item => item.id?.name === name));
  assert.equal(matches.length, 1, "unique top-level variable " + name);
  return source.slice(matches[0].start, matches[0].end);
}

function verifySources(root) {
  for (const [file, expected] of Object.entries(SOURCE_PINS)) {
    assert.equal(sha(fs.readFileSync(resolve(root, "member-pages-worker/src", file))), expected, "reviewed source drift " + file);
  }
}

export function reviewedFunction(root) {
  verifySources(root);
  const source = fs.readFileSync(resolve(root, "member-pages-worker/src/booking-discovery-viewer.js"), "utf8");
  const node = getFunction(source, "handleDiscoveryViewer");
  let part = source.slice(node.start, node.end);
  const edits = [];
  const mappings = {
    cookieValue: "cookieValue3",
    resolveBookingPerRename: "__publicBookingIdentityPatch.resolveBookingPerRename",
    verifyBookingMemberBinding: NAMESPACE + ".verifyBookingMemberBinding",
  };
  const counts = Object.fromEntries(Object.keys(mappings).map(name => [name, 0]));
  walk(ast(part), child => {
    if (child.type === "CallExpression" && child.callee.type === "Identifier" && Object.hasOwn(mappings, child.callee.name)) {
      counts[child.callee.name]++;
      edits.push({ start: child.callee.start, end: child.callee.end, after: mappings[child.callee.name] });
    }
  });
  for (const [name, count] of Object.entries(counts)) assert.equal(count, 1, "reviewed call mapping " + name);
  for (const edit of edits.sort((a, b) => b.start - a.start)) part = part.slice(0, edit.start) + edit.after + part.slice(edit.end);
  ast(part);
  return part;
}

export function verifyPreservation(baseline, candidate, edits) {
  let inverse = candidate.toString("utf8");
  for (const edit of [...edits].reverse()) {
    assert.equal(inverse.split(edit.after).length, 2, "unique inverse anchor: " + edit.label);
    inverse = inverse.replace(edit.after, () => edit.before);
  }
  assert.ok(Buffer.from(inverse).equals(baseline), "unrelated live module bytes changed");
}

export function build(baseline, options = {}) {
  const root = resolve(options.sourceRoot || process.env.MEMBER_SOURCE_ROOT || ".");
  const out = resolve(options.outputDir || scriptDir);
  const esbuild = options.esbuild || process.env.ESBUILD_BIN || "esbuild";
  assert.equal(baseline.length, BASE_BYTES, "live module baseline length drift");
  assert.equal(sha(baseline), BASE_HASH, "live module baseline drift");
  verifySources(root);
  const source = baseline.toString("utf8");
  assert.ok(Buffer.from(source).equals(baseline), "baseline must be exact UTF-8");
  assert.ok(!source.includes(NAMESPACE), "helper namespace already exists");
  const tree = ast(source);
  const target = getFunction(source, "handleDiscoveryViewer", tree);
  const before = source.slice(target.start, target.end);
  assert.match(before, /cookieValue3\(request,/);
  assert.match(before, /readSession = readMemberAppSession/);
  assert.match(before, /__publicBookingIdentityPatch\.resolveBookingPerRename\(env,/);
  assert.ok(!before.includes("identity_binding_verified"), "baseline is already guarded");
  walk(tree, node => {
    if (node.type === "AssignmentExpression" && node.left.type === "Identifier") assert.notEqual(node.left.name, "handleDiscoveryViewer", "target function rebound");
    if (node.type === "VariableDeclarator" && node.id.type === "Identifier") assert.notEqual(node.id.name, "handleDiscoveryViewer", "target function redeclared");
  });

  const preserved = Object.fromEntries(["cookieValue3", "readMemberAppSession", "loadMemberAppSessionState", "attachDiscoverySession"].map(name => {
    const node = getFunction(source, name, tree);
    return [name, source.slice(node.start, node.end)];
  }));
  preserved.__publicBookingIdentityPatch = variable(source, "__publicBookingIdentityPatch", tree);
  assert.match(preserved.__publicBookingIdentityPatch, /resolveBookingPerRename/);

  assert.equal(execFileSync(esbuild, ["--version"], { encoding: "utf8" }).trim(), "0.27.3", "pinned bundler version");
  fs.mkdirSync(out, { recursive: true });
  const helperPath = resolve(out, "member-binding-bundle.js");
  execFileSync(esbuild, ["--sourcefile=booking-member-binding.js", "--bundle", "--format=iife", "--platform=neutral", "--target=es2022", "--global-name=" + NAMESPACE, "--outfile=" + helperPath, "--log-level=error"], {
    cwd: out,
    input: fs.readFileSync(resolve(root, "member-pages-worker/src/booking-member-binding.js")),
  });
  const helper = fs.readFileSync(helperPath, "utf8");
  const helperTree = ast(helper);
  assert.equal(helperTree.body.length, 1, "one isolated helper namespace");
  assert.equal(helperTree.body[0].type, "VariableDeclaration");
  assert.equal(helperTree.body[0].declarations[0].id.name, NAMESPACE);
  walk(helperTree, node => {
    assert.notEqual(node.type, "ImportDeclaration", "no external helper imports");
    assert.notEqual(node.type, "ImportExpression", "no dynamic helper imports");
  });
  const exportsBefore = tree.body.filter(node => node.type.startsWith("Export"));
  assert.ok(exportsBefore.length > 0, "module export anchor required");
  const anchor = exportsBefore[0];
  const exportText = source.slice(anchor.start, anchor.end);
  const edits = [
    { label: "handleDiscoveryViewer", start: target.start, end: target.end, before, after: reviewedFunction(root) },
    { label: "isolated booking binding helper", start: anchor.start, end: anchor.end, before: exportText, after: helper + "\n" + exportText },
  ];
  let cursor = 0;
  const chunks = [];
  for (const edit of [...edits].sort((a, b) => a.start - b.start)) {
    assert.ok(edit.start >= cursor, "overlapping patch spans");
    assert.equal(source.slice(edit.start, edit.end), edit.before, "exact reviewed span");
    chunks.push(source.slice(cursor, edit.start), edit.after);
    cursor = edit.end;
  }
  chunks.push(source.slice(cursor));
  const candidate = Buffer.from(chunks.join(""));
  verifyPreservation(baseline, candidate, edits);
  const nextSource = candidate.toString("utf8"), nextTree = ast(nextSource);
  const exportsAfter = nextTree.body.filter(node => node.type.startsWith("Export"));
  assert.deepEqual(exportsAfter.map(node => nextSource.slice(node.start, node.end)), exportsBefore.map(node => source.slice(node.start, node.end)), "exports preserved exactly");
  for (const [name, original] of Object.entries(preserved)) {
    const current = name === "__publicBookingIdentityPatch" ? variable(nextSource, name, nextTree) : (() => {
      const node = getFunction(nextSource, name, nextTree); return nextSource.slice(node.start, node.end);
    })();
    assert.equal(current, original, "existing dependency preserved: " + name);
  }
  const manifest = {
    worker: "member-pages-worker", module: "worker.js",
    baseline_sha256: BASE_HASH, baseline_bytes: baseline.length,
    candidate_sha256: sha(candidate), candidate_bytes: candidate.length,
    source_sha: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    source_tree: execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: root, encoding: "utf8" }).trim(),
    method: "one-ast-function-span-and-isolated-booking-binding-helper",
    preservation: "inverse-exact-byte-reconstruction", exports_unchanged: true,
    migrations: [], settings_changes: [],
    helper_namespace: NAMESPACE, helper_sha256: sha(helper), source_hashes: SOURCE_PINS,
    preserved_dependencies: Object.fromEntries(Object.entries(preserved).map(([name, text]) => [name, sha(text)])),
    edits: edits.map(edit => ({ label: edit.label, before_sha256: sha(edit.before), after_sha256: sha(edit.after), before_bytes: Buffer.byteLength(edit.before), after_bytes: Buffer.byteLength(edit.after) })),
  };
  return { candidate, manifest, edits };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((items, value, index, all) => {
    if (value.startsWith("--")) items.push([value.slice(2), all[index + 1]]); return items;
  }, []));
  const outputDir = resolve(args["output-dir"] || scriptDir);
  const baselinePath = resolve(args.baseline || outputDir + "/member-baseline.js");
  const { candidate, manifest } = build(fs.readFileSync(baselinePath), { sourceRoot: args["source-root"], outputDir, esbuild: args.esbuild });
  fs.writeFileSync(resolve(outputDir, "member-candidate.js"), candidate);
  fs.writeFileSync(resolve(outputDir, "member-candidate-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(JSON.stringify(manifest, null, 2));
}

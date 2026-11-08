// Deterministic source isolation and credential-free local compilation only.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync,
  rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { validateBundleFiles } from './admin-current-session-code-only.mjs';

export const BASELINE = '12591f4a85677535b08ed547adfc0ce7bc993327';
export const CONSOLE_PARENT = '616ad8ed7658c352fb3d877b2d0b1b8c8276ef72';
export const CONSOLE_HEAD = 'bf78217a115995fa82bba0b57f01f326c25ac82b';
export const CONSOLE_MERGED = '86d68328a86c39a12b089566fc64efb5646a362a';
export const RUNTIME_PATHS = Object.freeze([
  'admin-worker/src/admin-console-client.js',
  'admin-worker/src/admin-console-page.js',
  'admin-worker/src/admin-console-style.js',
  'admin-worker/src/admin-dashboard-jobs.js',
  'admin-worker/src/admin-login-hero-worker-core.js',
  'admin-worker/src/admin-login-hero-worker.js',
]);
const HERO = RUNTIME_PATHS[5];
const NEW_FILES = RUNTIME_PATHS.slice(0, 3);
const PRIOR_KENJI_PIN = '0caeb7176f642fb4866e9bf7687777271fc49f6a';
export const UNRELATED_INTAKE = Object.freeze([
  'import { isStandardJoinIntakeRpcRequest, handleStandardJoinIntakeRpc } from "./premium-group-cleanup/standard-join-intake.js";\n',
  '    // Trusted Telegram -> Admin Worker service-binding-only Standard group intake (#2141).\n'
    + '    // Do not let the public admin controller or its generic proxy handle this path.\n'
    + '    if (isStandardJoinIntakeRpcRequest(new URL(request.url).pathname)) {\n'
    + '      return handleStandardJoinIntakeRpc(request, runtimeEnv);\n'
    + '    }\n',
]);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const blobSha = value => createHash('sha1').update('blob ' + value.byteLength + '\0').update(value).digest('hex');
const run = (command, args, options = {}) => execFileSync(command, args,
  { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 32 * 1024 * 1024, ...options });
const git = (repo, ...args) => run('git', args, { cwd: repo });

export function removeUnreleasedIntake(source) {
  let next = source;
  for (const literal of UNRELATED_INTAKE) {
    assert.equal(next.split(literal).length, 2, 'unreviewed Standard Join Intake source');
    next = next.replace(literal, '');
  }
  assert.ok(!next.includes('handleStandardJoinIntakeRpc') && !next.includes('isStandardJoinIntakeRpcRequest'),
    'unreleased intake survived source isolation');
  return next;
}

function entriesAt(repo, revision) {
  return git(repo, 'ls-tree', '-r', '-z', '--full-tree', revision).toString('utf8').split('\0').filter(Boolean).map(line => {
    const match = /^(100644|100755|120000) blob ([a-f0-9]{40})\t(.+)$/.exec(line);
    assert.ok(match, 'unsupported baseline tree entry');
    assert.ok(!match[3].startsWith('/') && !match[3].split('/').includes('..'), 'invalid baseline path');
    return { mode: match[1], blob_sha: match[2], path: match[3] };
  });
}
function listedFiles(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const name = prefix + entry.name;
    return entry.isDirectory() ? listedFiles(join(directory, entry.name), name + '/') : [name];
  }).sort();
}
function entryBytes(directory, entry) {
  const path = join(directory, entry.path);
  const stat = lstatSync(path);
  if (entry.mode === '120000') {
    assert.ok(stat.isSymbolicLink(), 'baseline symlink type changed');
    return Buffer.from(readlinkSync(path));
  }
  assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'baseline file type changed');
  assert.equal(Boolean(stat.mode & 0o111), entry.mode === '100755', 'baseline executable mode changed');
  return readFileSync(path);
}

export function prepareConsoleSource({ directory, repository = process.cwd() }) {
  const repo = resolve(repository), target = resolve(directory);
  const rel = relative(repo, target);
  assert.ok(rel.startsWith('..' + '/') || rel === '..', 'isolated source must be outside the approved checkout');
  assert.ok(!existsSync(target), 'isolated source destination already exists');
  const show = (revision, path) => git(repo, 'show', revision + ':' + path).toString('utf8');
  const baselineEntries = entriesAt(repo, BASELINE);
  const baselineByPath = new Map(baselineEntries.map(entry => [entry.path, entry]));
  assert.equal(git(repo, 'rev-parse', CONSOLE_HEAD + '^{tree}').toString().trim(),
    git(repo, 'rev-parse', CONSOLE_MERGED + '^{tree}').toString().trim(), 'Console squash merge tree differs');
  const parentHero = show(CONSOLE_PARENT, HERO), baselineHero = show(BASELINE, HERO);
  assert.equal(removeUnreleasedIntake(parentHero), baselineHero, 'unreviewed changes between live and Console parent entrypoint');
  for (const path of RUNTIME_PATHS.slice(3, 5)) {
    assert.equal(show(CONSOLE_PARENT, path), show(BASELINE, path), 'shared module differs from reviewed production baseline');
  }
  for (const path of NEW_FILES) assert.ok(!baselineByPath.has(path), 'new Console module already exists in baseline');
  const consoleDiff = git(repo, 'diff', '--name-only', CONSOLE_PARENT, CONSOLE_HEAD, '--', ...RUNTIME_PATHS)
    .toString().trim().split('\n').filter(Boolean).sort();
  assert.deepEqual(consoleDiff, [...RUNTIME_PATHS].sort(), 'Console source paths differ from review');
  mkdirSync(target, { recursive: true });
  const archive = target + '.tar';
  assert.ok(!existsSync(archive), 'baseline archive destination already exists');
  run('git', ['archive', '--format=tar', '--output=' + archive, BASELINE], { cwd: repo });
  try { run('tar', ['-xf', archive, '--no-same-owner', '-C', target]); }
  finally { rmSync(archive); }
  const before = listedFiles(target);
  assert.deepEqual(before, baselineEntries.map(entry => entry.path).sort(), 'archive omitted or added baseline files');
  for (const entry of baselineEntries) {
    assert.equal(blobSha(entryBytes(target, entry)), entry.blob_sha, 'archived baseline bytes changed: ' + entry.path);
  }
  const runtime = [];
  for (const path of RUNTIME_PATHS) {
    const reviewed = show(CONSOLE_HEAD, path);
    const source = path === HERO ? removeUnreleasedIntake(reviewed) : reviewed;
    mkdirSync(dirname(join(target, path)), { recursive: true });
    writeFileSync(join(target, path), source, { mode: 0o644 });
    runtime.push({ path, reviewed_blob_sha: blobSha(Buffer.from(reviewed)), candidate_blob_sha: blobSha(Buffer.from(source)) });
  }
  assert.deepEqual(listedFiles(target), [...before, ...NEW_FILES].sort(), 'unexpected isolated source files');
  for (const entry of baselineEntries.filter(entry => !RUNTIME_PATHS.includes(entry.path))) {
    assert.equal(blobSha(entryBytes(target, entry)), entry.blob_sha, 'unrelated baseline file changed: ' + entry.path);
  }
  const manifest = { baseline_source_sha: BASELINE, console_source_sha: CONSOLE_HEAD,
    console_parent_sha: CONSOLE_PARENT, console_merged_sha: CONSOLE_MERGED,
    runtime_paths: [...RUNTIME_PATHS], runtime_modules: runtime,
    baseline_tree_sha: git(repo, 'rev-parse', BASELINE + '^{tree}').toString().trim(),
    baseline_file_count: baselineEntries.length,
    baseline_manifest_sha256: sha256(JSON.stringify(baselineEntries)),
    all_other_baseline_files_unchanged: true, source_configuration_unchanged: true,
    unrelated_standard_join_intake_excluded: true };
  return { directory: target, manifest };
}

// The original production workflow prepended its source SHA to an already
// versioned URL. Reproduce those exact live bytes, including the older tail.
// This release must not incidentally repair or repin Kenji's separate shell.
export function preserveBaselineKenjiUrls(input) {
  assert.ok(input instanceof Uint8Array && input.byteLength > 0, 'compiled module required');
  const original = Buffer.from(input).toString('utf8');
  assert.ok(Buffer.from(original).equals(Buffer.from(input)), 'compiled module must be UTF-8');
  let code = original;
  const urls = [];
  for (const extension of ['css', 'js']) {
    const stable = 'https://models.mmdbkk.com/webflow/internal/admin/kenji/kenji-admin-v1.' + extension;
    const before = stable + '?v=' + PRIOR_KENJI_PIN;
    const after = stable + '?v=' + BASELINE + '?v=' + PRIOR_KENJI_PIN;
    assert.equal(code.split(stable).length, 2, 'ambiguous baseline Kenji asset URL');
    assert.equal(code.split(before).length, 2, 'unreviewed baseline Kenji version tail');
    code = code.replace(before, after);
    urls.push({ before, after });
  }
  let restored = code;
  for (const { before, after } of urls) restored = restored.replace(after, before);
  assert.equal(restored, original, 'unrelated compiled bytes changed during baseline pin preservation');
  return { code: Buffer.from(code), urls: urls.map(({ after }) => after),
    before_sha256: sha256(input), after_sha256: sha256(Buffer.from(code)) };
}

export function buildConsoleBundle({ prepared, directory, runtime, wrangler = process.env.ADMIN_CONSOLE_WRANGLER || 'wrangler' }) {
  assert.equal(prepared?.manifest?.baseline_source_sha, BASELINE, 'unprepared baseline');
  assert.equal(prepared?.manifest?.console_source_sha, CONSOLE_HEAD, 'unreviewed Console source');
  assert.equal(prepared?.manifest?.all_other_baseline_files_unchanged, true, 'baseline preservation not established');
  assert.equal(runtime?.compatibility_date, '2026-01-01', 'unreviewed runtime date');
  assert.deepEqual(runtime.compatibility_flags || [], [], 'unreviewed runtime flags');
  const dir = resolve(directory);
  assert.ok(!existsSync(dir), 'build destination already exists');
  mkdirSync(dir, { recursive: true });
  const environment = { ...process.env, CLOUDFLARE_API_TOKEN: '', CLOUDFLARE_API_KEY: '',
    CLOUDFLARE_EMAIL: '', CLOUDFLARE_ACCOUNT_ID: '', CLOUDFLARE_ROUTES_API_TOKEN: '', GH_TOKEN: '', GITHUB_TOKEN: '',
    WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: join(dir, 'wrangler.log') };
  const versionOutput = run(wrangler, ['--version'], { encoding: 'utf8', env: environment });
  const versions = versionOutput.replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/)
    .map(line => line.trim().match(/^(?:(?:⛅️?|☁️?)\s*wrangler\s+)?(\d+\.\d+\.\d+)$/))
    .filter(Boolean).map(match => match[1]);
  assert.deepEqual(versions, ['4.158.0'], 'reviewed Wrangler compiler required');
  const config = { name: 'admin-worker', main: join(prepared.directory, HERO),
    compatibility_date: runtime.compatibility_date, compatibility_flags: runtime.compatibility_flags || [], send_metrics: false };
  const configPath = join(dir, 'config.json');
  writeFileSync(configPath, JSON.stringify(config), { mode: 0o600 });
  const output = join(dir, 'bundle');
  run(wrangler, ['versions', 'upload', '--dry-run', '--config', configPath, '--outdir', output],
    { cwd: prepared.directory, env: environment, timeout: 120000 });
  validateBundleFiles(readdirSync(output));
  const preserved = preserveBaselineKenjiUrls(readFileSync(join(output, 'admin-login-hero-worker.js')));
  const artifact = join(dir, 'console-candidate.mjs');
  writeFileSync(artifact, preserved.code, { mode: 0o600 });
  run(process.execPath, ['--check', artifact], { env: environment, timeout: 60000 });
  return { code: preserved.code, wranglerVersion: '4.158.0', config, artifact,
    preservation: { kenji_asset_urls: preserved.urls, baseline_asset_transform: 'reproduce-original-prepend-preserving-existing-tail',
      compiled_before_asset_transform_sha256: preserved.before_sha256, compiled_after_asset_transform_sha256: preserved.after_sha256 } };
}

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const root = new URL('../', import.meta.url);
let build = readFileSync(new URL('build.mjs', root), 'utf8');
build = build.replace('217a23730c4c70a7f2cb68e550bf7a74227ae424', '022cdf2bd5d05bab6382ab7c8f57ad07e05effd6');
writeFileSync(new URL('build-qa-generated.mjs', root), build);
try { execFileSync(process.execPath, [new URL('build-qa-generated.mjs', root).pathname], { stdio: 'inherit' }); }
finally { unlinkSync(new URL('build-qa-generated.mjs', root)); }
const fixture = new URL('.build/admin-worker/test/fixtures/create-job-form-runtime.mjs', root);
let source = readFileSync(fixture, 'utf8');
source = source.replace("'rec' + String(++serial).padStart(14, '0')", "'rec' + crypto.randomUUID().replaceAll('-', '').slice(0, 14)");
writeFileSync(fixture, source);
const stagingFile = new URL('.build/staging.mjs', root);
source = readFileSync(stagingFile, 'utf8')
  .replaceAll('217a23730c4c70a7f2cb68e550bf7a74227ae424', '022cdf2bd5d05bab6382ab7c8f57ad07e05effd6')
  .replaceAll('recFixtureClient001', 'recCLIENT00000001')
  .replaceAll('recFixtureModel001', 'recMODEL000000001')
  .replace('[1, 2, 3, 4, 5, 6]', '[1, 2, 3, 4, 5]');
source = source.replace('const matched = p.get("client_id") === clientId && p.get("q") === "Fixture Model" && (privateMatch || publicMatch);', 'const matched = p.get("q")?.toLowerCase().includes("fixture") && (!p.has("client_id") || privateMatch || publicMatch);');
source = source.replace('display_name: "Fixture Model"', 'display_name: "Fixture Model", model_name: "Fixture Model", model_lookup_key: "private/standard/Mira", visibility: "private", access_folder: "standard", profile_photos: memberPhotos');
writeFileSync(stagingFile, source);

// Overlay only the reviewed editor and its fixture on the existing Create Job bundle.
const captainPin = '9abc9915b1d5e9a348bf24d5fa9a7abca8a56f90';
for (const path of ['admin-worker/src/owner-job-edit.js', 'admin-worker/src/owner-job-edit-page.js',
  'admin-worker/src/owner-job-edit-captain.js', 'admin-worker/src/owner-job-edit-coordinator.js',
  'admin-worker/src/verified-payment-balance.js', 'shared/session-balance-view.mjs']) {
  const code = execFileSync('git', ['show', captainPin + ':' + path], {encoding:'utf8'});
  let fixtureCode = code.replaceAll('sess_mw4pp2cg_d5788ca38716eab1', 'sess_fixture_captain_zero');
  if (path.endsWith('/owner-job-edit-page.js')) {
    const initialSession = "get('session_id')||''";
    if (!fixtureCode.includes(initialSession)) throw new Error('Captain editor session default changed');
    fixtureCode = fixtureCode.replace(initialSession, "get('session_id')||'sess_fixture_captain_zero'");
  }
  writeFileSync(new URL('.build/' + path, root), fixtureCode);
}
const captainFixture = readFileSync(new URL('../../admin-worker/owner-job-edit-captain-fixture.mjs', import.meta.url), 'utf8');
writeFileSync(new URL('.build/admin-worker/owner-job-edit-captain-fixture.mjs', root), captainFixture);

execFileSync('npm', ['exec', '--yes', '--package=esbuild@0.25.12', '--', 'esbuild',
  'admin-console-staging/qa/entry.mjs', '--bundle', '--format=esm', '--platform=node',
  '--inject:admin-console-staging/qa/context.mjs', '--outfile=admin-console-staging/.build/qa-bundle.mjs'],
  { cwd: new URL('../../', import.meta.url), stdio: 'inherit' });

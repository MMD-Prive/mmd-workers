import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

function release(overrides={}) {
  const root = mkdtempSync(join(tmpdir(), 'deploy-wrapper-test-'));
  for (const dir of ['scripts','shared','admin-worker','bin']) mkdirSync(join(root,dir));
  copyFileSync(new URL('./deploy-worker.sh',import.meta.url),join(root,'scripts/deploy-worker.sh'));
  let notifier = readFileSync(new URL('../shared/deploy-notify.js',import.meta.url),'utf8');
  notifier = notifier.replace(/test: "npm run test:admin-login[^"\n]*"/, 'test: "node gate.cjs tests"')
    .replace('lint: "node --check admin-worker/src/dashboard-worker.js"','lint: "node gate.cjs lint"');
  writeFileSync(join(root,'shared/deploy-notify.js'),notifier);
  writeFileSync(join(root,'admin-worker/wrangler.toml'),'name = "admin-worker"\n');
  writeFileSync(join(root,'gate.cjs'),`require('node:fs').appendFileSync('calls',process.argv[2]+'\\n'); process.exit(process.env.FAIL_STAGE === process.argv[2] ? 7 : 0);`);
  writeFileSync(join(root,'bin/npx'),`#!/usr/bin/env node
require('node:fs').appendFileSync('calls','deploy\\n');
if(process.env.FAIL_STAGE==='deploy') process.exit(8);
if(process.env.FAIL_STAGE!=='version') console.log('Current Version ID: e0e9f103-6678-4269-a1cd-7e95314484c0');
`,{mode:0o755});
  writeFileSync(join(root,'fetch.cjs'),`global.fetch=async (url,opts)=>{require('node:fs').appendFileSync('notifications',opts.body+'\\n'); return new Response(JSON.stringify({ok:process.env.FAIL_STAGE!=='notification'}),{status:process.env.FAIL_STAGE==='notification'?503:200});};`);
  const env = {...process.env, PATH:join(root,'bin')+':'+process.env.PATH,
    NODE_OPTIONS:'--require '+join(root,'fetch.cjs'), TELEGRAM_BOT_TOKEN:'fixture-secret',
    TELEGRAM_DEPLOY_CHAT_ID:'fixture-chat', DEPLOY_SMOKE_COMMAND:'node gate.cjs smoke',
    DEPLOY_RECEIPT_DIR:join(root,'receipts'), DEPLOY_NOTIFY_DRY_RUN:'', ...overrides};
  const result = spawnSync('bash',['scripts/deploy-worker.sh','admin-worker'],{cwd:root,env,encoding:'utf8'});
  const read = p => {try {return readFileSync(join(root,p),'utf8');} catch {return '';}};
  let receipt;
  try {receipt=JSON.parse(read('receipts/'+readdirSync(join(root,'receipts'))[0]));} catch {}
  const outcome={...result, calls:read('calls').trim().split('\n').filter(Boolean), notifications:read('notifications'),receipt};
  rmSync(root,{recursive:true,force:true});
  return outcome;
}

test('successful release records version, smoke and delivery separately',()=>{
  const r=release(); assert.equal(r.status,0,r.stderr); assert.deepEqual(r.calls,['tests','lint','deploy','smoke']);
  assert.equal(r.receipt.deployState,'DEPLOYED'); assert.equal(r.receipt.smokeResult,'PASS'); assert.equal(r.receipt.notificationState,'SENT');
});
for (const env of [{DEPLOY_SMOKE_COMMAND:''},{TELEGRAM_BOT_TOKEN:''},{DEPLOY_NOTIFY_DRY_RUN:'1'}]) {
  test('invalid preflight never invokes tests or deploy '+JSON.stringify(env),()=>{
    const r=release(env); assert.equal(r.status,64); assert.deepEqual(r.calls,[]);
  });
}
for (const stage of ['tests','lint']) test(stage+' failure prevents Cloudflare mutation',()=>{
  const r=release({FAIL_STAGE:stage}); assert.equal(r.status,7); assert.ok(!r.calls.includes('deploy')); assert.equal(r.receipt.deployState,'NOT_DEPLOYED');
});
test('Wrangler failure preserves ambiguous activation instead of asserting no deploy',()=>{
  const r=release({FAIL_STAGE:'deploy'}); assert.equal(r.status,8); assert.equal(r.receipt.deployState,'ACTIVATION_UNKNOWN'); assert.ok(!r.calls.includes('smoke'));
});
test('missing version fails acceptance but records successful activation',()=>{
  const r=release({FAIL_STAGE:'version'}); assert.equal(r.status,65); assert.equal(r.receipt.deployState,'DEPLOYED'); assert.equal(r.receipt.versionId,'');
});
test('smoke failure retains deployed version and never reports rollback',()=>{
  const r=release({FAIL_STAGE:'smoke'}); assert.equal(r.status,7); assert.equal(r.receipt.smokeResult,'FAIL'); assert.equal(r.receipt.deployState,'DEPLOYED');
  assert.match(r.notifications,/DEPLOYED/); assert.ok(!r.notifications.includes('fixture-secret'));
});
test('Telegram failure after accepted deployment exits successfully and persists warning',()=>{
  const r=release({FAIL_STAGE:'notification'}); assert.equal(r.status,0,r.stderr); assert.equal(r.receipt.notificationState,'FAILED'); assert.equal(r.receipt.smokeResult,'PASS');
  assert.match(r.stderr,/Do not redeploy/); assert.equal(r.notifications.trim().split('\n').length,1);
});

test('real package scripts and CI run guarded entrypoints and notification tests',()=>{
  const rootPackage=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  for(const worker of ['admin','events','telegram','sigil-booking','sigil-board','sigil-booking-proxy','chat']) {
    assert.equal(rootPackage.scripts['deploy:'+worker],`bash scripts/deploy-worker.sh ${worker}-worker`);
  }
  for(const worker of ['admin-worker','chat-worker']) {
    const pkg=JSON.parse(readFileSync(new URL(`../${worker}/package.json`,import.meta.url),'utf8'));
    assert.equal(pkg.scripts.deploy,`bash ../scripts/deploy-worker.sh ${worker}`);
  }
  const workflow=readFileSync(new URL('../.github/workflows/node.js.yml',import.meta.url),'utf8');
  assert.match(workflow,/run: npm run test:deploy-notify/);
});

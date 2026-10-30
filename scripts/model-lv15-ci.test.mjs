import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('LV15 CI covers its source, fixtures, fonts and tests without release authority',()=>{
 const workflow=fs.readFileSync(new URL('../.github/workflows/my-model-lv15-ci.yml',import.meta.url),'utf8');
 for(const file of ['webflow/sigil/model/model-lv15-presentation.test.mjs','scripts/model-lv15-fixtures.test.mjs','scripts/model-lv15-ci.test.mjs'])assert.ok(workflow.includes(file));
 for(const trigger of ['webflow/sigil/model/**','model-dashboard-presentation-worker/**','scripts/*model*.mjs','scripts/fixtures/model-lv15/**'])assert.equal(workflow.split(trigger).length-1,2,trigger);
 assert.match(workflow,/node scripts\/build-model-lv15-skin\.mjs/);
 assert.match(workflow,/contents: read/);
 assert.doesNotMatch(workflow,/secrets\.|workflow_dispatch|wrangler|deploy:|publish|contents: write|id-token:/);
});

test('default Console shell is repository-owned static markup without execution or fixture data',()=>{
 const shell=fs.readFileSync(new URL('./fixtures/model-lv15/console-shell.html',import.meta.url),'utf8');
 assert.match(shell,/id="sigil-model-console-v3"/);
 assert.doesNotMatch(shell,/<script\b|\bonclick=|sess_[a-z0-9]|\/Users\/|\/private\/tmp\//i);
});

const releaseWorkflow = fs.readFileSync(new URL('../.github/workflows/deploy-model-dashboard-presentation.yml', import.meta.url), 'utf8');

test('Dashboard deployment requires manual dispatch on main and owner-approved environment', () => {
 const deploy = releaseWorkflow.split('\n  deploy:\n')[1];
 assert.ok(deploy, 'deployment job must be identifiable');
 const condition = deploy.match(/^    if: (.+)$/m)?.[1];
 assert.equal(condition, "github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'");
 assert.match(deploy, /^    environment: owner-approved$/m);
 assert.match(deploy, /^    needs: test$/m);
 // Evaluate the actual workflow expression against event/ref combinations.
 const allowed = (event, ref) => Function('github', `return (${condition});`)({event_name:event, ref});
 for (const event of ['push','pull_request','pull_request_target','workflow_run','schedule']) {
  assert.equal(allowed(event, 'refs/heads/main'), false, event);
 }
 assert.equal(allowed('workflow_dispatch', 'refs/heads/main'), true);
 assert.equal(allowed('workflow_dispatch', 'refs/heads/feature'), false);
 assert.equal(allowed('workflow_dispatch', 'refs/tags/release'), false);
});

test('push and PR retain validation and release gate regression runs before deployment', () => {
 const validation = releaseWorkflow.split('\n  deploy:\n')[0];
 assert.match(validation, /  workflow_dispatch:/);
 assert.match(validation, /  pull_request:/);
 assert.match(validation, /  push:\n    branches:\n      - main/);
 assert.match(validation, /run: node --test scripts\/model-lv15-ci.test.mjs/);
 assert.doesNotMatch(validation, /secrets\.|wrangler@4 deploy/);
});

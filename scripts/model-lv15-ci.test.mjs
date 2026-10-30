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

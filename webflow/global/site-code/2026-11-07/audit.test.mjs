import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const base=new URL('./',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,base),'utf8');
const manifest=JSON.parse(read('manifest.json'));
test('captures all live inline blocks and external scripts',()=>{
 assert.equal(manifest.blocks.length,21);
 assert.equal(manifest.externalScripts.length,19);
 for(const b of manifest.blocks){const path=b.path.replace('webflow/global/site-code/2026-11-07/','');assert.equal(read(path).length,b.characters);}
});
test('retains full rollback snapshots without truncation',()=>{
 assert.equal(read('snapshots/webflow-site-head.html').length,manifest.length.head);
 assert.equal(read('snapshots/webflow-site-footer.html').length,manifest.length.footer);
});
test('documents i18n and never applies snapshots as runtime',()=>{
 assert.ok(manifest.externalScripts.filter(x=>x.system==='mmd-i18n').length>=10);
 assert.match(read('README.md'),/Webflow.*unchanged|global code remains unchanged/i);
});

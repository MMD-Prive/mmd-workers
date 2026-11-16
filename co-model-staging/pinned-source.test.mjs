import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPinnedSource} from './pinned-source.mjs';

test('snapshot uses committed pin even when merge checkout and working files differ',async t=>{
 const root=await mkdtemp(join(tmpdir(),'co-model-pin-test-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 git('init','-q');
 for(const name of ['admin-worker','partners-worker','shared','webflow','auth-worker','payments-worker','member-pages-worker']){
  await mkdir(join(root,name));await writeFile(join(root,name,'source.js'),'approved');
 }
 git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','approved');
 const pin=git('rev-parse','HEAD');
 await writeFile(join(root,'admin-worker/source.js'),'merged source');
 git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','later');
 await writeFile(join(root,'admin-worker/source.js'),'dirty source');
 const snapshot=await createPinnedSource(root,pin);
 t.after(()=>rm(snapshot,{recursive:true,force:true}));
 assert.equal(await readFile(join(snapshot,'admin-worker/source.js'),'utf8'),'approved');
 assert.equal(await readFile(join(root,'admin-worker/source.js'),'utf8'),'dirty source');
 await assert.rejects(createPinnedSource(root,pin.slice(0,7)),/full_source_sha_required/);
 await assert.rejects(createPinnedSource(root,'0'.repeat(40)));
});

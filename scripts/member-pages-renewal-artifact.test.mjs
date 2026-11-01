import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {RENEWAL,decodeRenewalBaseline,buildReviewedRenewalModules,verifyUploadedRenewalModules} from './member-pages-renewal-artifact.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
test('Renewal contract retains exact reviewed production base and only two edit spans',()=>{
 assert.equal(RENEWAL.edits.length,2);
 assert.equal(RENEWAL.sourceSha,'66b80721b5377b973df31d8aa50f0ac5d196c0d1');
 for(const e of RENEWAL.edits){assert.equal(hash(Buffer.from(e.before,'base64')),e.beforeHash);assert.equal(hash(Buffer.from(e.after,'base64')),e.afterHash);}
 assert.throws(()=>decodeRenewalBaseline({id:'other'}),/version drift/);
 assert.throws(()=>decodeRenewalBaseline({id:RENEWAL.baselineVersion,main_module:RENEWAL.mainModule,modules:[]}),/inventory drift/);
 assert.throws(()=>verifyUploadedRenewalModules({id:'other'},'expected'),/version drift/);
});
const dir=process.env.RENEWAL_ARTIFACT_DIRECTORY;
test('actual version 548 artifact preserves every byte outside Renewal spans and wrapper', {skip:!dir},async()=>{
 const baseline=readFileSync(dir+'/baseline-runtime-index.mjs');
 const wrapper=readFileSync(dir+'/tmib-release-entry.mjs');
 const v={id:RENEWAL.baselineVersion,main_module:RENEWAL.mainModule,modules:[{name:'runtime-index.js',content_base64:baseline.toString('base64')},{name:RENEWAL.mainModule,content_base64:wrapper.toString('base64')}]};
 const mods=await buildReviewedRenewalModules(decodeRenewalBaseline(v));
 const candidate=mods.find(m=>m.name==='runtime-index.js').bytes;
 assert.deepEqual(candidate,readFileSync(dir+'/runtime-index.mjs'));
 assert.deepEqual(mods.find(m=>m.name===RENEWAL.mainModule).bytes,wrapper);
 // Reverse only approved spans; exact baseline reconstruction proves History/Checkpts and all other code are unchanged.
 let reversed=candidate;
 for(const e of [...RENEWAL.edits].reverse()){
  const after=Buffer.from(e.after,'base64'),before=Buffer.from(e.before,'base64');
  assert.equal(reversed.indexOf(after),reversed.lastIndexOf(after));
  const at=reversed.indexOf(after);assert.ok(at>=0);
  reversed=Buffer.concat([reversed.subarray(0,at),before,reversed.subarray(at+after.length)]);
 }
 assert.deepEqual(reversed,baseline);
 for(const modules of [v.modules.slice(0,1),[...v.modules,v.modules[0]],v.modules.map(m=>({...m,name:m.name==='runtime-index.js'?'renamed.js':m.name})),v.modules.map(m=>({...m,content_base64:Buffer.from('changed').toString('base64')}))])assert.throws(()=>decodeRenewalBaseline({...v,modules}));
 await assert.rejects(buildReviewedRenewalModules([{name:'runtime-index.js',bytes:Buffer.from('wrong')},{name:RENEWAL.mainModule,bytes:wrapper}]),/artifact drift/);
});

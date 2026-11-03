import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2);
const arg=name=>{const at=args.indexOf(name);return at<0?null:args[at+1];};
if(!arg('--source-root')||!arg('--artifact-root'))throw Error('Provide --source-root and --artifact-root');
const repo=path.resolve(arg('--source-root')),artifacts=path.resolve(arg('--artifact-root'));
const output=path.resolve(arg('--output-dir')||path.join(artifacts,'compiled-tests'));
const artifactUrl=name=>pathToFileURL(path.join(artifacts,name)).href;
for(const name of ['sigil-candidate.mjs','sigil-baseline.js','sigil-overlay-edits.json'])await fs.access(path.join(artifacts,name));
await fs.mkdir(output,{recursive:true});
const manifest=[];
for(const name of ['customer-intake-current-access.test.mjs','public-booking-membership.test.mjs','public-booking-owner.test.mjs','public-booking-telegram-intake.test.mjs']){
 const origin=path.join(repo,'sigil-booking-worker',name),source=await fs.readFile(origin,'utf8');let replaced=0;
 const transformed=source.replace(/(from\s+)(['"])([^'"]+)\2/g,(whole,prefix,q,specifier)=>{
  if(specifier==='./src/runtime-index.js'){replaced++;return prefix+JSON.stringify(artifactUrl('sigil-candidate.mjs'));}
  if(specifier.startsWith('.'))return prefix+JSON.stringify(pathToFileURL(path.resolve(path.dirname(origin),specifier)).href);
  return whole;
 });
 if(replaced!==1)throw Error('Expected exactly one runtime import '+name);
 await fs.writeFile(path.join(output,name),`// Generated only by import rewiring; assertions unchanged from ${origin}\n${transformed}`);
 manifest.push({name,origin,source_sha256:createHash('sha256').update(source).digest('hex'),runtime_imports_replaced:replaced});
}
// Preservation/budget assertions remain identical to the reviewed compiled-artifact tests.
const preservationTemplate=String.raw`import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {createHash} from 'node:crypto';import * as candidate from '../sigil-candidate.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
test('candidate reverses exactly to production baseline and leaves live routing byte-identical',async()=>{
 const base=await fs.readFile(new URL('../sigil-baseline.js',import.meta.url),'utf8'),built=await fs.readFile(new URL('../sigil-candidate.mjs',import.meta.url),'utf8'),edits=JSON.parse(await fs.readFile(new URL('../sigil-overlay-edits.json',import.meta.url),'utf8'));
 let inverse=built;for(const edit of [...edits].reverse()){assert.equal(inverse.slice(edit.at,edit.at+edit.after.length),edit.after);inverse=inverse.slice(0,edit.at)+edit.before+inverse.slice(edit.at+edit.after.length);}
 assert.equal(inverse,base);assert.equal(hash(inverse),'19b6d5329bb4a41e9728f3903becad25e73bfb480cd058fe999155d80a134b96');
 assert.deepEqual(Object.keys(candidate).sort(),['default','requestedScope']);
 assert.doesNotMatch(built,/__internal\/member-booking|class MemberBookingCoordinator|function currentPrivateContext/);
 assert.ok(built.endsWith(base.slice(base.indexOf('// src/runtime-index.js')).replace('//# sourceMappingURL=runtime-index.js.map','// Source map omitted: deterministic reviewed live overlay.')));
});
test('compiled runtime enforces 4499 floor and accepts 4500 and new band without sending a notification',async t=>{
 const calls=[];t.mock.method(globalThis,'fetch',async(input,init={})=>{const url=new URL(typeof input==='string'?input:input.url);assert.equal(url.hostname,'api.airtable.com');assert.equal(init.method||'GET','GET');calls.push(url);return Response.json({records:[]});});
 const env={AIRTABLE_API_KEY:'fixture',AIRTABLE_BASE_ID:'fixture'};
 for(const [query,below] of [['budget_thb=4499',true],['budget_thb=4500',false],['budget_band=4500_10000',false]]){
  const res=await candidate.default.fetch(new Request('https://sigil.mmdbkk.com/sigil/api/models/search?scope=public&search_mode=search&'+query),env,{});assert.equal(res.status,200);const data=await res.json();
  if(below){assert.deepEqual(data.errors,['public_budget_below_minimum']);assert.equal(calls.length,0);}else assert.notEqual(data.validation_error,true,JSON.stringify(data));
 }
});
`;
let preservation=preservationTemplate.replace("from '../sigil-candidate.mjs'",'from '+JSON.stringify(artifactUrl('sigil-candidate.mjs')));
for(const name of ['sigil-baseline.js','sigil-candidate.mjs','sigil-overlay-edits.json']){
 preservation=preservation.replace(`new URL('../${name}',import.meta.url)`, `new URL(${JSON.stringify(artifactUrl(name))})`);
}
await fs.writeFile(path.join(output,'artifact-preservation.test.mjs'),preservation);
await fs.writeFile(path.join(output,'compiled-test-manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({source_root:repo,artifact_root:artifacts,test_directory:output,test_files:5}));

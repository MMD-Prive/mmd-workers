import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyModuleInventory,buildReviewedCompanionArtifact,decodeBaselineModule,applyReviewedArtifactDelta} from './member-pages-artifact-delta.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
test('artifact delta preserves every byte outside approved spans and rejects drift',()=>{
 const base=Buffer.from('prefix OLD suffix');
 const edit={before:Buffer.from('OLD'),after:Buffer.from('NEW'),beforeHash:hash('OLD'),afterHash:hash('NEW')};
 assert.equal(applyReviewedArtifactDelta(base,[edit],hash(base)).toString(),'prefix NEW suffix');
 assert.throws(()=>applyReviewedArtifactDelta(base,[edit]));
 assert.throws(()=>applyReviewedArtifactDelta(base,[{...edit,after:Buffer.from('OTHER')}],hash(base)));
 assert.throws(()=>applyReviewedArtifactDelta(base,[edit,edit],hash(base)));
 const repeated=Buffer.from('OLD OLD');
 assert.throws(()=>applyReviewedArtifactDelta(repeated,[edit],hash(repeated)));
});

test('reviewed manifest loads but rejects an unverified baseline',()=>{
 assert.throws(()=>buildReviewedCompanionArtifact(Buffer.from('unverified')),/active artifact drift/);
 assert.throws(()=>decodeBaselineModule({id:'wrong'}),/version drift/);
});

test('two-module inventory accepts exact bytes and rejects missing extra duplicate renamed or changed modules',()=>{
 const mods=[{name:'runtime-index.js',content_base64:Buffer.from('runtime').toString('base64')},{name:'tmib-release-entry.mjs',content_base64:Buffer.from('wrapper').toString('base64')}];
 const v={id:'fixture',main_module:'tmib-release-entry.mjs',modules:mods};
 const hashes={'runtime-index.js':hash('runtime'),'tmib-release-entry.mjs':hash('wrapper')};
 const verify=x=>verifyModuleInventory(x,'fixture',v.main_module,hashes);
 const decoded=verify(v);assert.equal(decoded[1].bytes.toString(),'wrapper');
 for(const modules of [mods.slice(0,1),[...mods,mods[0]],[mods[0],{...mods[1],name:'other.mjs'}],mods.map(m=>({...m,content_base64:Buffer.from('changed').toString('base64')}))])assert.throws(()=>verify({...v,modules}));
 assert.throws(()=>verify({...v,main_module:'runtime-index.js'}));
 assert.throws(()=>verify({...v,id:'wrong'}));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildReviewedCompanionArtifact,decodeBaselineModule,applyReviewedArtifactDelta} from './member-pages-artifact-delta.mjs';
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

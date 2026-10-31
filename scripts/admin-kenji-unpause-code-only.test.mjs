import test from 'node:test';
import assert from 'node:assert/strict';
import { patchOwner, START, END, validateLiveParts } from './admin-kenji-unpause-code-only.mjs';
import { digest } from './admin-held-viewer-code-only.mjs';
test('overlay preserves all bytes outside reviewed owner section', () => {
 const old=START+'old\n', replacement=START+'new\n';
 const r=patchOwner('prefix\n'+old+END+'suffix',replacement,digest(old));
 assert.equal(r.code,'prefix\n'+replacement+END+'suffix');
 assert.equal(r.preservation.unrelated_runtime_bytes_unchanged,true);
});
test('drift, missing/duplicate markers and replacement caller refuse overlay', () => {
 const old=START+'old\n', code='prefix\n'+old+END+'suffix';
 for(const [input,replacement,hash] of [[code,START+'new\n','0'.repeat(64)],['missing',START,digest(old)],[code+START,START,digest(old)],[code+END,START,digest(old)],[code,START+END,digest(old)]])
 assert.throws(()=>patchOwner(input,replacement,hash));
});

test('live download accepts only reviewed worker.js module and refuses extras', () => {
 const file={size:128};
 assert.equal(validateLiveParts([['worker.js',file]]),file);
 for(const parts of [[],[['admin-login-hero-worker.js',file]],[['worker.js','text']],[['worker.js',{size:0}]],[['worker.js',file],['other.js',file]]]) assert.throws(()=>validateLiveParts(parts));
});

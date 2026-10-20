import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {buildConsoleInstallBlocks} from '../../../scripts/build-model-console-atelier-embed.mjs';
test('ordered blocks retain existing tail exactly, each fits budget and parses',()=>{
 const tail='\n<script id="rules">void 0;</script>\n<script id="payout">void 1;</script>';
 const saved='<!-- MY MODEL LV9 travel + Console V3 -->\n<script>oldRuntime()</script>'+tail;
 const blocks=buildConsoleInstallBlocks(saved);
 assert.equal(blocks.length,3);
 assert.equal(blocks[2].content,tail);
 assert.match(blocks[0].content,/MMDConsoleDecline/);
 assert.ok(blocks.every(b=>b.bytes<50000&&b.sha256.length===64));
 assert.doesNotMatch(blocks.map(b=>b.content).join(''),/oldRuntime/);
 for(const b of blocks) for(const m of b.content.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
});
test('unknown footer and unexpected tail fail closed',()=>{
 assert.throws(()=>buildConsoleInstallBlocks('<script>anything()</script>'));
 assert.throws(()=>buildConsoleInstallBlocks('<!-- MY MODEL LV9 travel + Console V3 -->\n<script>old()</script>'));
});

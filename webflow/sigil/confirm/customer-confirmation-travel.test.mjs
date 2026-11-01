import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {buildConfirmationInstallBlocks} from '../../../scripts/build-customer-confirmation-travel.mjs';
test('confirmation installation includes actual signed travel client before the updated tracker and both scripts fit the embed limit',()=>{
  const blocks=buildConfirmationInstallBlocks();assert.equal(blocks.length,2);
  for(const block of blocks){assert.ok(Buffer.byteLength(block.content)<50000);for(const match of block.content.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);}
  assert.match(blocks[0].content,/MMDMountConfirmationTravel/);assert.match(blocks[1].content,/confirmationToken:token/);
});

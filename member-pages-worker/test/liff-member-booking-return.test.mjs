import test from 'node:test';
import assert from 'node:assert/strict';
import {handleLiffMemberShell} from '../src/liff-member-shell.js';
const shell=async(query='')=>handleLiffMemberShell(new Request('https://mmdbkk.com/member/liff?'+query),{LINE_LIFF_ID:'fixture'}).text();
test('LINE return preserves safe appointments model selector, never foreign URL or private authority',async()=>{
 for(const value of ['recEligible0000001','https://evil.test/model','EMs04','']){
  const html=await shell('view=jobs&booking_model='+encodeURIComponent(value));
  const config=JSON.parse(html.match(/const CONFIG = (.*);/)[1]);
  assert.equal(config.view,'jobs');assert.equal(config.bookingModel,value==='recEligible0000001'?value:'');assert.equal(config.world,'public');
 }
 const state=encodeURIComponent('?intent=status&view=jobs&booking_model=recEligible0000001');
 const html=await shell('liff.state='+state);const config=JSON.parse(html.match(/const CONFIG = (.*);/)[1]);assert.equal(config.view,'jobs');assert.equal(config.bookingModel,'recEligible0000001');
});

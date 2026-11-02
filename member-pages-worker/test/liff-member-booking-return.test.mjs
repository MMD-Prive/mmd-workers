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

import {runInNewContext} from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/liff-member-shell.js',import.meta.url),'utf8');
const lane=source.slice(source.indexOf('  function memberApiFetch('),source.indexOf('  async function readOwnHistoryPreview('));
for(const reason of ['leave','account-reset'])test('real serialized API lane blocks queued Booking POST after '+reason,async()=>{
 let release,active=true;const calls=[];
 const api=runInNewContext(lane+'\nmemberApiFetch',{
  memberApiChain:Promise.resolve(),AbortController,Response,Uint8Array,Error,setTimeout,clearTimeout,
  fetch:async(url,init)=>{calls.push([url,init.method]);if(url==='/blocking')await new Promise(r=>release=r);return Response.json({ok:true});}
 });
 const blocker=api('/blocking');await new Promise(r=>setImmediate(r));
 const pending=api('/member/api/liff/booking/requests',{method:'POST',body:'previous-account-payload'},()=>active);
 active=false;release();await blocker;await assert.rejects(pending,/member_request_stale/);
 assert.deepEqual(calls,[['/blocking',undefined]]);
 // A stale rejection releases the lane for a new, explicitly valid request.
 await api('/next',{method:'GET'});assert.equal(calls.length,2);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import worker, {isPartnerLinePrimaryRequest} from './src/index.js';

const primary='https://mmdbkk.com/sigil/model/dashboard';
const login=primary+'/partner-login';

test('Partner callback is handled before the shared Model/Webflow bootstrap without upstream fetch',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Partner callback must not enter Model flow')};
 try{
  const r=await worker.fetch(new Request(primary+'?liff.state=%2Fpartner-login&code=fixture&state=fixture',{headers:{Cookie:'model_session=fixture-model-session',Authorization:'Bearer fixture-model-token'}}));
  assert.equal(r.status,200);assert.equal(r.headers.get('x-mmd-model-entry'),'partner-liff-primary');
  assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.equal(r.headers.get('set-cookie'),null);
  const html=await r.text();assert.doesNotMatch(html,/\/v1\/model\/|localStorage|sessionStorage|fixture/);
  const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
  let finish;const replaced=[];let initCalls=0;const state={};
  runInNewContext(script,{Promise,liff:{init:()=>{initCalls++;return new Promise(resolve=>{finish=resolve})}},location:{replace:u=>replaced.push(u)},document:{getElementById:()=>state}});
  await new Promise(setImmediate);assert.equal(initCalls,1);assert.deepEqual(replaced,[]);
  finish();await new Promise(setImmediate);assert.deepEqual(replaced,[login]);
 }finally{globalThis.fetch=original}
});

test('SDK failure stays on a recoverable page and does not forward callback credentials',async()=>{
 const r=await worker.fetch(new Request(primary+'?liff.state=%2Fpartner-login'));
 const html=await r.text();const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];const state={};let navigations=0;
 runInNewContext(script,{Promise,liff:{init:async()=>{throw Error('fixture')}},location:{replace:()=>navigations++},document:{getElementById:()=>state}});
 await new Promise(setImmediate);assert.equal(navigations,0);assert.match(state.textContent,/ไม่สำเร็จ/);
});

test('only the exact apex Partner LIFF state selects the Partner bootstrap',async()=>{
 for(const suffix of ['?liff.state=%2Fpartner-login','?liff_state=%2Fpartner-login','?liff.state=%2Fpartner-login%3Fexample%3D1'])assert.equal(isPartnerLinePrimaryRequest(new Request(primary+suffix)),true);
 for(const suffix of ['', '?liff.state=%2Fprofile','?liff.state=%2Fpartner-login-evil','?liff.state=https%3A%2F%2Fevil.example%2Fpartner-login','?liff.state=%2Fpartner-login&liff.state=%2Fprofile','?liff.state=%2Fpartner-login&liff_state=%2Fprofile','?code=fixture&state=fixture'])assert.equal(isPartnerLinePrimaryRequest(new Request(primary+suffix)),false);
 assert.equal(isPartnerLinePrimaryRequest(new Request(primary+'?liff.state=%2Fpartner-login',{method:'POST'})),false);
 assert.equal(isPartnerLinePrimaryRequest(new Request(primary.replace('mmdbkk.com','www.mmdbkk.com')+'?liff.state=%2Fpartner-login')),false);
 assert.equal(isPartnerLinePrimaryRequest(new Request(primary+'/profile?liff.state=%2Fpartner-login')),false);
 const r=await worker.fetch(new Request(primary+'?liff.state=%2Fpartner-login',{method:'HEAD'}));assert.equal(r.status,200);assert.equal(await r.text(),'');
});

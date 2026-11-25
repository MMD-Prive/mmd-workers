import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startQaAccountSwitch,patchQaAccountSwitch} from './candidate/account-switch.mjs';

test('QA switch signs out LIFF and starts a fresh login with callback marker',()=>{
  const calls=[];
  startQaAccountSwitch({
    logout:()=>calls.push('logout'),
    login:args=>calls.push(args),
  },{setItem:(key,value)=>calls.push({key,value})},'https://mmd-isolated-qa-staging.malemodel-bkk.workers.dev/member/liff');
  assert.deepEqual(calls,[
    'logout',{key:'mmd-qa-liff-return',value:'1'},
    {redirectUri:'https://mmd-isolated-qa-staging.malemodel-bkk.workers.dev/member/liff'},
  ]);
});
test('UI patch is scoped to the explicit account-switch query and refuses a different revision',()=>{
  const source='sdkReady.then(() => {\nreturn 1;\n});';
  const candidate=patchQaAccountSwitch(source);
  assert.ok(candidate.includes('get("switch_line")==="1"'));
  new Function(candidate);
  assert.throws(()=>patchQaAccountSwitch('unknown'));
  assert.throws(()=>patchQaAccountSwitch(source+source));
});

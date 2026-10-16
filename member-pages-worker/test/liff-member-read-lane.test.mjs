import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const source=readFileSync(new URL('../src/liff-member-shell.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('  let memberApiChain ='),source.indexOf('  async function readOwnHistoryPreview()'));
function lane(fetcher){const timers=[];const context=vm.createContext({fetch:fetcher,AbortController,Response,Uint8Array,setTimeout:(fn,ms)=>{const t={fn,ms};timers.push(t);return t},clearTimeout:t=>{t.cleared=true}});return {...vm.runInContext(code+'\n({memberApiFetch})',context),timers}}
const tick=()=>new Promise(r=>setImmediate(r));
test('slow canonical read cannot overlap another cookie-bound request after the former 3s escape',async()=>{
 let endBody;const calls=[];const firstBody=new ReadableStream({start(c){endBody=()=>{c.enqueue(new TextEncoder().encode('{"ok":true}'));c.close()}}});
 const l=lane(async url=>{calls.push(url);return calls.length===1?new Response(firstBody):Response.json({points:5})});
 const a=l.memberApiFetch('membership'),b=l.memberApiFetch('profile');await tick();assert.deepEqual(calls,['membership']);assert.equal(l.timers[0].ms,10000);assert.ok(!l.timers.some(t=>t.ms===3000));
 endBody();assert.equal((await(await a).json()).ok,true);assert.equal((await(await b).json()).points,5);assert.deepEqual(calls,['membership','profile']);assert.ok(l.timers.every(t=>t.cleared));
});
test('deadline aborts the stalled request before releasing the queue; next read still succeeds',async()=>{
 const order=[];const l=lane((url,init)=>{order.push(url);if(url==='stalled')return new Promise((_,reject)=>init.signal.addEventListener('abort',()=>{order.push('aborted');reject(new Error('aborted'))}));return Promise.resolve(Response.json({ok:true}))});
 const first=l.memberApiFetch('stalled');const rejected=assert.rejects(first,/aborted/);const second=l.memberApiFetch('next');await tick();assert.deepEqual(order,['stalled']);l.timers[0].fn();await rejected;assert.equal((await(await second).json()).ok,true);assert.deepEqual(order,['stalled','aborted','next']);
});
test('history preview is queued after profile rendering so archive work cannot delay first member readback',()=>{
 const s=source.slice(source.indexOf('  async function readProfile('),source.indexOf('  function requestId()'));
 assert.ok(s.indexOf('renderProfile(')<s.indexOf('void readOwnHistoryPreview()'));assert.ok(s.indexOf('memberApiFetch(CONFIG.profileEndpoint')<s.indexOf('void readOwnHistoryPreview()'));
});

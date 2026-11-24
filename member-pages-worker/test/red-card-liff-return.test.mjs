import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { applyRedCardLiffReturn, isRedCardLiffReturn } from '../src/red-card-liff-return.js';

const destination='/pay/membership?package=red_card';
const query = new URLSearchParams({intent:'status',return_to:destination}).toString();
const url = path => new Request('https://mmdbkk.com' + path);
const good = url('/member/liff?' + query);

test('Red Card navigation recognizes exact direct and nested LIFF state only', () => {
  assert.equal(isRedCardLiffReturn(good),true);
  assert.equal(isRedCardLiffReturn(url('/member/liff?' + new URLSearchParams({'liff.state':'/?'+query}))),true);
  for (const path of [
    '/member/liff?intent=status&return_to=albums_ems',
    '/member/liff?' + query + '&view=ems_albums',
    '/member/liff?' + query + '&return_to=albums_ems',
    '/member/liff?' + query + '&campaign=double_moment',
    '/member/liff?' + query.replace('red_card','elite'),
    '/member/liff?' + query.replace('intent=status','intent=signup'),
    '/member/liff?' + query + '&' + new URLSearchParams({'liff.state':'/?return_to=albums_ems'}),
    '/member/liff?intent=status&return_to='+encodeURIComponent('https://other.example'+destination),
    '/member/liff/extra?' + query,
  ]) assert.equal(isRedCardLiffReturn(url(path)),false,path);
});

test('live profile render marker re-enters only when linked, and never starts a purchase', async () => {
  const baseline=fs.readFileSync(new URL('../live-baseline/member-pages-worker.js',import.meta.url),'utf8');
  for(const anchor of ['profileReady = true;','currentMemberRef = /^[a-f0-9]{64}$/']) assert.equal(baseline.split(anchor).length,2);
  const script='let currentMemberRef = /^[a-f0-9]{64}$/.test(binding) ? binding : ""; let profileReady = false; function render(){ profileReady = true; } render();';
  const response=() => new Response(script,{headers:{'content-type':'text/html','etag':'before'}});
  const changed=await applyRedCardLiffReturn(good,response());
  const source=await changed.text();
  assert.equal(changed.headers.get('etag'),null);
  for (const [binding,expected] of [['',[]],['x'.repeat(64),[]],['a'.repeat(64),[destination]]]){
    const moves=[];
    vm.runInNewContext(source,{binding,window:{location:{replace:value=>moves.push(value)}}});
    assert.deepEqual(moves,expected);
  }
  assert.equal(await (await applyRedCardLiffReturn(url('/member/liff?intent=status&return_to=albums_ems'),response())).text(),script);
  assert.equal((await applyRedCardLiffReturn(good,new Response('failure',{status:503}))).status,503);
});

test('configured Member Pages entrypoint renders gated navigation for exact Red Card return', async () => {
  const { register } = await import('node:module');
  register('data:text/javascript,'+encodeURIComponent(`
    export async function resolve(specifier,context,nextResolve) {
      if (specifier==='cloudflare:workers') return {url:'data:text/javascript,export class WorkerEntrypoint {};export class DurableObject {}',shortCircuit:true};
      return nextResolve(specifier,context);
    }
  `));
  const {default: worker} = await import('../src/model-console-live-entrypoint.js');
  const needle = 'if (/^[a-f0-9]{64}$/.test(currentMemberRef)) { window.location.replace("/pay/membership?package=red_card"); return; }';
  const response = await worker.fetch(good,{},{});
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-type'),/text\/html/);
  assert.ok((await response.text()).includes(needle));
  const normal = await worker.fetch(url('/member/liff?intent=status'),{},{});
  assert.ok(!(await normal.text()).includes(needle));
});

test('Compact checkout does not auto-purchase on return and handles linked-account denial with verify CTA', async () => {
  const source=fs.readFileSync(new URL('../../webflow/pay/membership/membership.js',import.meta.url),'utf8');
  let click;
  const calls=[], moves=[], links=[];
  let memberChoice='red_card', denial=409, termDays=365;
  const button={setAttribute(){},getAttribute(){return memberChoice;},addEventListener(_event,callback){click=callback;}};
  const card={scrollIntoView(){}};
  const status={setAttribute(){},removeAttribute(){},append(_space,link){links.push(link);}};
  const ui={querySelector:(sel)=>sel==='[data-public-status]'?status:sel.includes('data-package=')?card:null,querySelectorAll:(sel)=>sel==='[data-buy]'?[button]:[]};
  const document={getElementById:()=>({dataset:{},querySelector:()=>ui}),createElement:()=>({}),createTextNode:v=>v};
  const fetch=async (endpoint,options)=>{
    calls.push([endpoint,options]);
    if(endpoint.endsWith('/catalog'))return Response.json({ok:true,packages:[{package_code:'red_card',amount_thb:11499,duration_days:730}]});
    if(!denial)return Response.json({ok:true,package:{package_code:'red_card',amount_thb:11499,duration_days:termDays},redirect_to:'https://mmdbkk.com/pay/checkout?t=offline-placeholder'});
    return Response.json({ok:false,error:{code:denial===409?'RED_CARD_ACCOUNT_VERIFICATION_REQUIRED':'LINE_SESSION_REQUIRED'}},{status:denial});
  };
  const location={origin:'https://mmdbkk.com',href:'https://mmdbkk.com/pay/membership?package=red_card',pathname:'/pay/membership',search:'?package=red_card&ignored=1',assign:uri=>moves.push(uri)};
  vm.runInNewContext(source,{URL,URLSearchParams,document,fetch,location,window:{},setTimeout,clearTimeout});
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  await flush();
  assert.equal(calls.length,1);
  click(); await flush();
  assert.equal(calls.length,2);
  assert.deepEqual(JSON.parse(calls[1][1].body),{package_code:'red_card'});
  assert.equal(links.length,1);
  assert.equal(new URL(links[0].href).searchParams.get('return_to'),destination);
  assert.deepEqual(moves,[]);
  memberChoice='elite'; denial=401; click(); await flush();
  assert.equal(links.length,1);
  assert.equal(new URL(moves[0]).searchParams.get('return_to'),'/pay/membership?package=elite&ignored=1');
  memberChoice='red_card'; denial=0;
  button.disabled=false; click(); await flush();
  assert.equal(moves.length,1); // A legacy 365-day response must not open checkout.
  termDays=730; click(); await flush();
  assert.equal(moves[1],'https://mmdbkk.com/pay/checkout?t=offline-placeholder');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';

const dir = await mkdtemp(join(tmpdir(), 'mmd-admin-launcher-'));
const file = join(dir, 'page.mjs');
await build({entryPoints:[new URL('../src/control-room-owner-ui.ts',import.meta.url).pathname],outfile:file,bundle:true,format:'esm',platform:'browser'});
const { renderOwnerControlRoomPage } = await import(pathToFileURL(file).href);
const html = await renderOwnerControlRoomPage().text();
const script = html.match(/<script data-mmd-admin-launcher-script>([\s\S]*?)<\/script>/)[1];
const panel = html.match(/<section class="mmd-launcher"[\s\S]*?<\/section>/)[0];

function fixture(){
  const cards=[...panel.matchAll(/<a href="([^"]+)" data-admin-module data-module-keywords="([^"]+)"><strong>([^<]+)<\/strong><span>([^<]+)<\/span><\/a>/g)].map(([,href,keywords,label,description])=>({href,hidden:false,dataset:{moduleKeywords:keywords},querySelector:selector=>({textContent:selector==='strong'?label:description})}));
  const events={},input={value:'',addEventListener:(key,handler)=>events[key]=handler},count={},empty={};
  const root={querySelector:selector=>selector==='input'?input:selector==='[data-module-count]'?count:empty,querySelectorAll:()=>cards};
  runInNewContext(script,{document:{querySelector:()=>root}});
  const filter=query=>{input.value=query;events.input();return cards.filter(card=>!card.hidden)};
  return {cards,input,count,empty,filter,events};
}

test('actual rendered browser script filters Thai and English without network access',()=>{
  const f=fixture();assert.equal(f.cards.length,11);assert.equal(f.count.textContent,'11 เครื่องมือ');
  assert.deepEqual(f.filter('สลิป').map(x=>x.href),['/internal/ceo/payment-slip-inbox']);
  assert.deepEqual(f.filter('  MEMORY   LINE ').map(x=>x.href),['/internal/admin/member-intelligence']);
  assert.equal(f.filter('คอนเฟิร์ม').length,2);
  assert.deepEqual(f.filter('CEO').map(x=>x.href),['/internal/ceo','/internal/ceo/kenji-control']);
  assert.deepEqual(f.filter('Kenji').map(x=>x.href),['/internal/admin/kenji','/internal/ceo/kenji-control']);
  assert.equal(f.filter('<script>alert(1)</script>').length,0);assert.equal(f.empty.hidden,false);
  assert.equal(f.filter(' ').length,11);assert.equal(f.empty.hidden,true);
  f.input.value='';f.events.search();assert.equal(f.count.textContent,'11 เครื่องมือ');
});

test('launcher is accessible and separates references from gated operational destinations',()=>{
  assert.match(panel,/type="search"/);assert.match(panel,/role="status" aria-live="polite"/);
  assert.match(panel,/aria-labelledby="admin-launcher-title"/);
  assert.equal((panel.match(/target="_blank" rel="noopener noreferrer"/g)||[]).length,4);
  assert.doesNotMatch(panel,/session_id=|client_id=|payment_ref=|ready|verified/i);
  assert.doesNotMatch(script,/fetch\(|localStorage|sessionStorage|innerHTML|location\./);
  assert.equal((html.match(/data-mmd-admin-launcher aria-labelledby/g)||[]).length,1);
  assert.match(html,/data-mmd-owner-actions="v1"/);
  assert.match(html,/data-mmd-workflow="20260922"/);
});

 test('flow keeps client and job context ahead of evidence and owner handoff',()=>{
  const flow=panel.match(/<nav class="mmd-launcher__flow"[\s\S]*?<\/nav>/)[0];
  assert.deepEqual([...flow.matchAll(/href="([^"]+)"/g)].map(x=>x[1]),[
    '/internal/ceo','/internal/admin/member-intelligence','/internal/admin/jobs/all',
    '/internal/ceo/payment-slip-inbox','/internal/ceo/kenji-control'
  ]);
  assert.match(flow,/aria-label="ลำดับการทำงานหลังบ้าน"/);
  assert.doesNotMatch(flow,/href="\/(ceo|kenji)"|client_id=|session_id=/);
 });

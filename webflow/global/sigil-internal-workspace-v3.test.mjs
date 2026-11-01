import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { internalWorkspaceLoader, DAILY_INTERNAL_PAGES, INTERNAL_MENU_OMISSIONS } from './sigil-internal-workspace-v3.mjs';
const source=readFileSync(new URL('../internal/admin/dashboard/dashboard-simple.html',import.meta.url),'utf8');
function browser(path='/internal/admin/dashboard',extra=''){
 const dom=new JSDOM('<html><head></head><body>'+extra+source+'</body></html>',{url:'https://www.mmdbkk.com'+path,runScripts:'outside-only',pretendToBeVisual:true});
 dom.window.matchMedia=()=>({matches:false});
 return dom;
}
test('daily desk preserves urgent focus, queue nodes and runtime hooks; secondary tools are folded',()=>{
 const dom=browser(),w=dom.window,d=w.document;
 const queue=d.querySelector('[data-todo-list]'),jobs=d.querySelector('[data-job-list]');
 w.eval(internalWorkspaceLoader());
 const main=d.querySelector('.adm27-main'),desk=d.getElementById('sigil-daily-desk');
 assert.equal(main.firstElementChild.className,'adm27-brief');
 assert.equal(desk.previousElementSibling.className,'adm27-summary');
 assert.equal(d.querySelector('[data-todo-list]'),queue);assert.equal(d.querySelector('[data-job-list]'),jobs);
 assert.ok(d.querySelector('.adm27-brief [data-focus-next]'));
 assert.equal(desk.querySelectorAll('a').length,8);
 for(const node of d.querySelectorAll('.adm27-owner,.adm27-daily'))assert.ok(node.closest('.adm27-more'));
 assert.equal(d.querySelector('.adm27-more').open,false);
 w.eval(internalWorkspaceLoader());assert.equal(d.querySelectorAll('#sigil-daily-desk').length,1);assert.equal(d.querySelectorAll('#sigil-workspace-directory').length,1);
 dom.window.close();
});
test('directory deduplicates routes, retains current page and searches closed groups; test/docs links are omitted',()=>{
 const dom=browser('/internal/admin/studio'),w=dom.window,d=w.document;w.eval(internalWorkspaceLoader());
 const nav=d.querySelector('#sigil-workspace-directory nav'),links=[...nav.querySelectorAll('a')];
 assert.equal(new Set(links.map(a=>a.pathname)).size,links.length);
 for(const path of INTERNAL_MENU_OMISSIONS)assert.ok(!links.some(a=>a.pathname===path));
 assert.equal(nav.querySelector('[aria-current="page"]').pathname,'/internal/admin/studio');
 const input=d.querySelector('#sigil-workspace-directory input');input.value='points';input.dispatchEvent(new w.Event('input'));
 assert.deepEqual([...nav.querySelectorAll('a:not([hidden])')].map(a=>a.pathname),['/internal/admin/my-mmd/recovery']);
 input.value='';input.dispatchEvent(new w.Event('input'));assert.equal(nav.querySelectorAll('a[hidden]').length,0);
 assert.ok(links.some(a=>a.pathname==='/internal/ceo/line-notes-import'));
 dom.window.close();
});
test('older Worker directory upgrades once; MMS existing directory remains byte-identical',()=>{
 const old='<details id="sigil-workspace-directory"><summary>Old menu</summary></details>';
 const dom=browser('/internal/admin/dashboard',old);dom.window.eval(internalWorkspaceLoader());assert.equal(dom.window.document.querySelectorAll('#sigil-workspace-directory').length,1);assert.equal(dom.window.document.getElementById('sigil-workspace-directory').dataset.directoryLayout,'daily-v1');dom.window.close();
 const mms=browser('/internal/admin/mms',old),before=mms.window.document.documentElement.outerHTML;mms.window.eval(internalWorkspaceLoader());assert.equal(mms.window.document.documentElement.outerHTML,before);mms.window.close();
});
test('points shortcut uses the existing owner diagnostic and never invents a points API',()=>{
 const item=DAILY_INTERNAL_PAGES.find(p=>/Points/.test(p.title));assert.equal(item.path,'/internal/admin/my-mmd/recovery');assert.equal(item.ownerOnly,true);
 const module=readFileSync(new URL('./sigil-internal-workspace-v3.mjs',import.meta.url),'utf8');assert.doesNotMatch(module,/fetch\(|localStorage|method:\s*['"](?:POST|DELETE)/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
const source=readFileSync(new URL('./mmd-member-header-compact-v1.js',import.meta.url),'utf8');
test('Webflow inline release fits 2000 characters and parses',()=>{
 assert.ok(source.length<=2000); assert.doesNotThrow(()=>new Function(source));
});
test('release only adds one style and is idempotent',()=>{
 const nodes=new Map();const appended=[];
 const document={getElementById:id=>nodes.get(id),createElement:tag=>{assert.equal(tag,'style');return {};},head:{appendChild:node=>{appended.push(node);nodes.set(node.id,node);}}};
 runInNewContext(source,{document});runInNewContext(source,{document});
 assert.equal(appended.length,1);assert.equal(appended[0].id,'mmd-member-header-compact-v1');
 assert.match(appended[0].textContent,/data-mmdh-header/);assert.match(appended[0].textContent,/mmdg-inner/);
});
test('does not introduce widgets, identity requests or route mutations',()=>{
 assert.doesNotMatch(source,/fetch\s*\(|localStorage|sessionStorage|document\.cookie|location\.|innerHTML|createElement\(['"]a['"]\)/);
 assert.doesNotMatch(source,/payment-intent|package_code|membership\.tier/);
});
test('mobile keeps booking and MY MMD; membership remains in existing menu',()=>{
 assert.match(source,/>a:nth-child\(3\)\{display:none!important\}/);
 assert.doesNotMatch(source,/>a:nth-child\([124]\)\{display:none/);
 assert.match(source,/min-height:44px/);assert.match(source,/min-height:54px/);
 assert.match(source,/flex-flow:row nowrap!important/);
});

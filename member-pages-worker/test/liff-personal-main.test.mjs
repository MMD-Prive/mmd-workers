import test from 'node:test';
import assert from 'node:assert/strict';
import {createPersonalMainUI} from '../src/liff-personal-main.js';
function fixture(request){
 const elements=new Map();const node=()=>({hidden:false,disabled:false,textContent:'',value:'',dataset:{},events:{},children:[],addEventListener(e,f){this.events[e]=f},setAttribute(){},focus(){},replaceChildren(){this.children=[]},appendChild(n){this.children.push(n)}});
 const get=s=>{if(!elements.has(s))elements.set(s,node());return elements.get(s)};
 const buttons=['hito','hiei','hiro','hima'].map(id=>({...node(),dataset:{pmChoice:id},querySelector:()=>({textContent:id})}));
 const root={...node(),querySelector:get,querySelectorAll:s=>s==='[data-pm-choice]'?buttons:[...buttons,...elements.values()],ownerDocument:{createElement:node}};
 return {root,get,buttons,ui:createPersonalMainUI(root,request)};
}
const ok=selected=>Response.json({ok:true,authority:'member-pages-worker',selected});
test('choice waits for backend persistence, then opens assistant inside app',async()=>{
 let release;const calls=[];const f=fixture(async(url,init)=>{calls.push({url,init});if(init.method==='GET')return ok(null);return new Promise(r=>{release=r})});
 await f.ui.load();assert.equal(f.get('[data-pm-choices]').hidden,false);
 f.buttons[0].events.click();assert.equal(f.get('[data-pm-assistant]').hidden,true);
 release(ok({id:'hito'}));await new Promise(r=>setImmediate(r));
 assert.equal(f.get('[data-pm-assistant]').hidden,false);assert.match(f.get('[data-pm-name]').textContent,/hito/);assert.deepEqual(JSON.parse(calls[1].init.body),{id:'hito'});
 f.get('[data-pm-open]').events.click();assert.equal(f.get('[data-pm-chat]').hidden,false);
});
test('reset invalidates late account response and clears chat',async()=>{
 let release;const f=fixture(()=>new Promise(r=>{release=r}));const pending=f.ui.load();f.ui.reset();release(ok({id:'hiro'}));await pending;
 assert.equal(f.root.hidden,true);assert.equal(f.get('[data-pm-assistant]').hidden,true);assert.equal(f.get('[data-pm-input]').value,'');
});
test('storage or AI failures do not fabricate selection, replies, or retry',async()=>{
 let calls=0;const f=fixture(async()=>{calls++;return Response.json({ok:false},{status:503})});await f.ui.load();assert.equal(f.get('[data-pm-retry]').hidden,false);assert.equal(f.get('[data-pm-assistant]').hidden,true);assert.equal(calls,1);
 const g=fixture(async url=>url.includes('/kenji/')?Response.json({ok:false},{status:503}):ok({id:'hima'}));await g.ui.load();g.get('[data-pm-input]').value='ช่วยดูสมาชิก';await g.get('[data-pm-form]').events.submit({preventDefault(){}});assert.equal(g.get('[data-pm-input]').value,'ช่วยดูสมาชิก');assert.equal(g.get('[data-pm-messages]').children.length,0);
});
test('chat uses server-selected name, plain text and clears on expired session',async()=>{
 let expired=false;const f=fixture(async url=>url.includes('/kenji/')?expired?Response.json({ok:false},{status:401}):Response.json({ok:true,authority:'ai-worker',personal_main:{id:'hiei'},reply:'<img onerror=alert(1)>'}):ok({id:'hiei'}));
 await f.ui.load();f.get('[data-pm-input]').value='สวัสดี';await f.get('[data-pm-form]').events.submit({preventDefault(){}});
 assert.match(f.get('[data-pm-messages]').children[1].textContent,/<img/);assert.equal(f.get('[data-pm-messages]').children[1].innerHTML,undefined);
 expired=true;f.get('[data-pm-input]').value='อีกครั้ง';await f.get('[data-pm-form]').events.submit({preventDefault(){}});assert.equal(f.root.hidden,true);assert.equal(f.get('[data-pm-messages]').children.length,0);
});
test('late chat from previous account cannot populate a new account',async()=>{
 let release;let persona='hito';
 const f=fixture(async url=>url.includes('/kenji/')?new Promise(r=>{release=r}):ok({id:persona}));
 await f.ui.load();f.get('[data-pm-input]').value='old account';
 const pending=f.get('[data-pm-form]').events.submit({preventDefault(){}});
 f.ui.reset();persona='hiro';await f.ui.load();
 release(Response.json({ok:true,authority:'ai-worker',personal_main:{id:'hito'},reply:'old account private response'}));await pending;
 assert.equal(f.get('[data-pm-messages]').children.length,0);
 assert.match(f.get('[data-pm-name]').textContent,/hiro/);
 assert.equal(f.get('[data-pm-input]').value,'');
});
test('mismatched saved persona is rejected and empty root supports dock safely',async()=>{
 const f=fixture(async()=>ok({id:'hiro'}));await f.ui.load();f.buttons[0].events.click();await new Promise(r=>setImmediate(r));
 assert.equal(f.get('[data-pm-assistant]').hidden,true);
 assert.equal(f.get('[data-pm-retry]').hidden,false);
 assert.doesNotThrow(()=>createPersonalMainUI(null,()=>{}).open());
});

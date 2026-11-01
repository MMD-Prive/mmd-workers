import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {myMmdMembershipWorlds} from '../src/my-mmd-membership-worlds.js';
const tick=()=>new Promise(r=>setTimeout(r,20));
test('one session can select both worlds, expired SIGIL remains expired and 401 clears the view',async()=>{
 let unauthorized=false;const requests=[];
 const worlds={schema:'member_worlds_v1',public:{state:'active',tier:'Red Card',expiresAt:'2029-01-01'},sigil:{state:'expired',tier:'Premium',expiresAt:'2026-01-01'}};
 const dom=new JSDOM('<body>'+myMmdMembershipWorlds()+'</body>',{url:'https://www.mmdbkk.com/my-mmd/',runScripts:'dangerously',beforeParse(w){w.AbortController=AbortController;w.fetch=async(url,init)=>{requests.push({url,init});return Response.json(unauthorized?{ok:false}:{ok:true,...{worlds}},{status:unauthorized?401:200})}}});
 await tick();const d=dom.window.document;assert.equal(d.querySelector('#mmd-membership-worlds').hidden,false);assert.equal(d.querySelector('[data-tier]').textContent,'Red Card');
 d.querySelector('[data-world=sigil]').click();assert.equal(d.querySelector('[data-tier]').textContent,'Premium');assert.match(d.querySelector('[data-state]').textContent,/หมดอายุ/);assert.equal(d.body.dataset.mmdWorld,'private');assert.equal(requests.every(x=>x.url==='/api/member/app/membership'&&!x.init.method),true);
 unauthorized=true;dom.window.dispatchEvent(new dom.window.Event('pageshow'));await tick();assert.equal(d.querySelector('#mmd-membership-worlds').hidden,true);assert.equal(d.querySelector('[data-tier]').textContent,'');dom.window.close();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {mountModelNightline} from './model-nightline.mjs';
import {buildModelNightlineSkin} from '../../../scripts/build-model-nightline-skin.mjs';
for(const [id,header] of [['mmd-model-home-v4','mm-lv-header'],['sigil-model-console-v3','smcv3-head']]){
 test(`${id}: skin keeps original nodes, permissions and listeners`,()=>{
  const dom=new JSDOM(`<main id="${id}" data-current-endpoint="/v1/model/session/current"><header class="${header}"></header><section hidden data-auth-locked>locked</section><button disabled data-action="start_travel">เดินทาง</button><button data-ack>รับทราบ</button></main>`);
  const doc=dom.window.document,root=doc.querySelector('main'),action=doc.querySelector('[data-action]'),ack=doc.querySelector('[data-ack]');
  let calls=0;ack.addEventListener('click',()=>calls++);
  const a=mountModelNightline(doc,'data:image/webp;base64,fixture'),b=mountModelNightline(doc,'data:image/webp;base64,fixture');
  assert.equal(root.dataset.currentEndpoint,'/v1/model/session/current');assert.equal(doc.querySelector('[data-action]'),action);assert.equal(action.disabled,true);
  assert.equal(doc.querySelector('[data-auth-locked]').hidden,true);assert.equal(root.querySelectorAll('.model-nightline-logo').length,1);
  ack.click();assert.equal(calls,1);a.destroy();b.destroy();dom.window.close();
 });
}
test('does not mount on customer or owner pages',()=>{
 const dom=new JSDOM('<main id="customer"></main>');assert.equal(mountModelNightline(dom.window.document),undefined);dom.window.close();
});
test('current phase follows canonical state; post-work is not falsely closed; actions stay intact',async()=>{
 const dom=new JSDOM('<main id="sigil-model-console-v3" data-console-state="en_route"><header class="smcv3-head"></header><section data-view="work"><section class="smcv3-state"><h2 data-stage-title></h2><p data-stage-copy></p><button disabled data-action="start_work">start</button></section><details data-travel-actions><summary>Chat and camera</summary><input type="file" capture="environment"></details></section></main>');
 const doc=dom.window.document,root=doc.querySelector('main'),button=doc.querySelector('button'),camera=doc.querySelector('input');let calls=0;button.addEventListener('click',()=>calls++);
 const mounted=mountModelNightline(doc);
 assert.equal(root.querySelector('[aria-current=step]').textContent,'3เดินทาง');assert.equal(doc.querySelector('details').open,true);
 doc.querySelector('details').open=false;root.append(doc.createElement('hr'));await new Promise(resolve=>setImmediate(resolve));
 assert.equal(doc.querySelector('details').open,false,'do not undo user collapse');
 for(const [state,copy]of [['separated','รอลูกค้าอนุมัติ'],['under_review','รอตรวจจบงาน'],['payout_pending','รอโอนค่าตัว'],['closed','งานปิดแล้ว']]){
  root.dataset.consoleState=state;await new Promise(resolve=>setImmediate(resolve));assert.match(doc.querySelector('[data-stage-title]').textContent,new RegExp(copy));
 }
 assert.equal(doc.querySelector('button'),button);assert.equal(button.disabled,true);button.click();assert.equal(calls,0);
 assert.equal(doc.querySelector('input'),camera);assert.equal(camera.getAttribute('capture'),'environment');
 assert.equal(root.querySelectorAll('.model-flow-index').length,1);
 mounted.destroy();dom.window.close();
});
test('Tart Room decorates once without changing job actions or authority',()=>{
 const dom=new JSDOM('<main id="sigil-model-console-v3"><header class="smcv3-head"></header><img class="smcv3-hero__image" src="old.png" srcset="old.png 2x"><section data-view="work"><button disabled data-action="start_work">start</button></section><section hidden data-auth-locked>locked</section></main>');
 const doc=dom.window.document,button=doc.querySelector('button');
 const a=mountModelNightline(doc),b=mountModelNightline(doc);
 assert.match(doc.querySelector('img.smcv3-hero__image').src,/tart-room.png$/);
 assert.equal(doc.querySelector('.smcv3-hero__image').hasAttribute('srcset'),false);
 assert.equal(doc.querySelectorAll('.model-flow-index').length,1);
 assert.equal(doc.querySelectorAll('.model-flow-index span').length,5);
 assert.equal(doc.querySelector('button'),button);assert.equal(button.disabled,true);
 assert.equal(doc.querySelector('[data-auth-locked]').hidden,true);
 assert.doesNotMatch(doc.body.textContent,/15 นาที|24\/7|ไม่รั่วไหล/);
 a.destroy();b.destroy();dom.window.close();
});
test('embed preserves original embedded fonts and keeps individual blocks within 50KB',()=>{
 const html=buildModelNightlineSkin(),fonts=fs.readFileSync(new URL('./nightline/font-faces.css',import.meta.url),'utf8');
 for(const [face]of fonts.matchAll(/@font-face\{[^}]+\}/g))assert.ok(html.includes(face));
 const blocks=html.match(/<(style|script)>[\s\S]*?<\/\1>/g);assert.equal(blocks.length,6);
 for(const block of blocks)assert.ok(Buffer.byteLength(block)<50000);
 assert.doesNotMatch(html,/fetch\s*\(|localStorage|sessionStorage|\.disabled\s*=|\.hidden\s*=|innerHTML\s*=/);
});
test('CSS is scoped, preserves hidden states and avoids viewport-scaled fonts',()=>{
 const css=fs.readFileSync(new URL('./model-nightline.css',import.meta.url),'utf8');
 assert.match(css,/\[hidden\]\{display:none!important/);assert.doesNotMatch(css,/font-size:[^;}]*vw|letter-spacing:-/);
 assert.match(css,/safe-area-inset-bottom/);
});
test('locked workspace cannot be exposed by the new flex layout',()=>{
 const css=fs.readFileSync(new URL('./model-nightline.css',import.meta.url),'utf8');
 const dom=new JSDOM('<style>'+css+'</style><main id="mmd-model-home-v4" data-model-nightline="6.1"><section data-mm-workspace hidden><button disabled>locked</button></section></main>');
 const workspace=dom.window.document.querySelector('[data-mm-workspace]');
 assert.equal(dom.window.getComputedStyle(workspace).display,'none');assert.equal(workspace.hidden,true);
 dom.window.close();
});

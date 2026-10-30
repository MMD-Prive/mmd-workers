import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {installModelLv15,LV15_CSS} from './model-lv15-presentation.mjs';
import {LV15_FONT_CSS,LV15_FONT_FACES} from './model-lv15-fonts.mjs';
import {buildLv15Embed} from '../../../scripts/build-model-lv15-skin.mjs';
const docFor=html=>new JSDOM(html,{url:'https://local.invalid/sigil/model/dashboard?lane=private'});
const tick=()=>new Promise(r=>setTimeout(r,0));
test('moves original controls intact and preserves listeners, file picker, disabled and hidden states',()=>{
 const dom=docFor('<main id="mmd-model-home-v4" data-mm-lv-lane="public"><div class="mmhome-shell"><header class="mm-lv-header"><button id="lang">TH</button></header><div data-mm-workspace><section class="mm-lv-work"><button id="action" disabled>Save</button><input id="picker" type="file"><input id="private" hidden></section></div></div></main>');
 const d=dom.window.document,lang=d.querySelector('#lang'),picker=d.querySelector('#picker'),button=d.querySelector('#action');let clicks=0;lang.addEventListener('click',()=>clicks++);
 dom.window.fetch=()=>{throw Error('presentation must never fetch')};installModelLv15(d);lang.click();installModelLv15(d);
 assert.equal(clicks,1);assert.equal(d.querySelector('.lv15-controls #lang'),lang);assert.equal(d.querySelector('#picker'),picker);assert.equal(picker.type,'file');assert.equal(button.disabled,true);assert.equal(d.querySelector('#private').hidden,true);assert.equal(d.querySelectorAll('.lv15-masthead').length,1);dom.window.close();
});
test('Console follows owner lane and returns neutral when work locks, without changing actions or payout',async()=>{
 const dom=docFor('<section id="sigil-model-console-v3" data-console-lane="private"><div class="smcv3-shell"><header class="smcv3-head"><button data-lang="th">TH</button></header><main data-view="work"><div class="smcv3-summary"></div><button data-action="start_work" disabled>Start</button><details><span data-model-payout>own amount</span></details></main></div></section>');
 const d=dom.window.document,root=d.querySelector('section'),action=d.querySelector('[data-action]'),payout=d.querySelector('[data-model-payout]');installModelLv15(d);assert.equal(root.dataset.lv15World,'private');
 d.querySelector('[data-view]').hidden=true;await tick();assert.equal(root.dataset.lv15World,'neutral');assert.equal(d.querySelector('[data-action]'),action);assert.equal(action.disabled,true);assert.equal(d.querySelector('[data-model-payout]'),payout);assert.equal(payout.textContent,'own amount');dom.window.close();
});
test('URL cannot select Private; absent or inconsistent backend lane remains neutral',async()=>{
 const dom=docFor('<div class="app" data-mmd-app-digital><div class="shell"><header class="top"></header><span id="identity">LINE · VERIFIED</span><section id="active"></section></div></div>');
 const d=dom.window.document,api=installModelLv15(d),root=d.querySelector('.app');assert.equal(root.dataset.lv15World,'neutral');
 for(const s of [null,{}, {model_work_lane:'private_model'},{session_id:'fixture',model_work_lane:'private_model',payout_terms:{money_lane:'public_model'}}]){api.update(s);assert.equal(root.dataset.lv15World,'neutral');}
 api.update({session_id:'fixture',model_work_lane:'private_model',payout_terms:{money_lane:'private_model'}});assert.equal(root.dataset.lv15World,'private');
 d.querySelector('#active').hidden=true;await tick();assert.equal(root.dataset.lv15World,'neutral');dom.window.close();
});
test('fresh Webflow home is neutral until its existing owner supplies a verified lane',async()=>{
 const dom=docFor('<main id="mmd-model-home-v4" data-mm-lv-lane="neutral"><div class="mmhome-shell"><header class="mm-lv-header"></header><div data-mm-workspace hidden></div></div></main>');
 const d=dom.window.document,r=d.querySelector('main');installModelLv15(d);r.dataset.mmLvLane='private';await tick();assert.equal(r.dataset.lv15World,'neutral');d.querySelector('[data-mm-workspace]').hidden=false;await tick();assert.equal(r.dataset.lv15World,'private');r.dataset.mmLvLane='public';await tick();assert.equal(r.dataset.lv15World,'public');assert.equal(d.querySelector('.lv15-parent-logo').alt,'MMD Privé');dom.window.close();
});
test('new separate skin embed parses and remains within its own 50KB budget',()=>{
 const html=buildLv15Embed();assert.ok(Buffer.byteLength(html)<50000);new vm.Script(html.match(/<script>([\s\S]*)<\/script>/)[1]);
});

test('shared fonts have explicit hosted faces in both unminified and built skin',()=>{
 const embed=buildLv15Embed();
 assert.ok(LV15_CSS.startsWith(LV15_FONT_CSS));
 for(const [family,weight,url] of LV15_FONT_FACES){
  assert.ok(LV15_FONT_CSS.includes(`font-family:"${family}";font-style:normal;font-weight:${weight}`));
  assert.ok(embed.includes(url));
  assert.ok(['cdn.prod.website-files.com','fonts.gstatic.com'].includes(new URL(url).hostname));
 }
 assert.doesNotMatch(LV15_FONT_CSS,/local\(|data:|\/Users\/|\/__lv15\//);
 for(const family of ['Canela','Playfair Display','Outfit','Noto Sans Thai'])assert.ok(LV15_FONT_FACES.some(face=>face[0]===family));
});

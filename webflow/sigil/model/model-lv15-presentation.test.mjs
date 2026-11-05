import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {installModelLv15,LV15_CSS} from './model-lv15-presentation.mjs';
import {LV15_FONT_CSS,LV15_FONT_FACES} from './model-lv15-fonts.mjs';
import {buildLv15Embed} from '../../../scripts/build-model-lv15-skin.mjs';
const docFor=html=>new JSDOM(html,{url:'https://local.invalid/sigil/model/dashboard?lane=private'});
const tick=()=>new Promise(r=>setTimeout(r,0));
test('served Console uses responsive Tart Room images without changing actions',()=>{
 const dom=docFor('<section id="sigil-model-console-v3"><div class="smcv3-hero"><img class="smcv3-hero__image"></div><div class="smcv3-shell"><button disabled>Start</button></div></section>');
 const d=dom.window.document,button=d.querySelector('button');
 installModelLv15(d,{consoleOnly:true,reviewSkin:true,tartRoomUrl:'/sigil/model/dashboard-assets/tart-review.png'});
 const img=d.querySelector('.smcv3-hero__image'),source=img.parentElement.querySelector('source');
 assert.equal(source.media,'(max-width: 600px)');assert.match(source.srcset,/6a35f70ba2c1ec636a446949/);
 assert.match(img.src,/6a357b94de86294947105b58/);assert.equal(d.querySelector('button'),button);assert.equal(button.disabled,true);
 dom.window.close();
});
test('review skin preserves API-owned actions and payment locks without making requests',async()=>{
 const dom=new JSDOM('<section id="sigil-model-console-v3" data-console-lane="private"><div class="smcv3-hero"><img class="smcv3-hero__image"></div><div class="smcv3-shell"><main data-view="work"><div data-primary-actions><button data-action="start_work" disabled>Payment pending</button></div><div data-model-payout>Not paid</div></main></div></section>',{url:'http://127.0.0.1/console'});
 const d=dom.window.document,button=d.querySelector('button'),actions=d.querySelector('[data-primary-actions]');
 dom.window.fetch=()=>{throw Error('Skin must not call API')};
 installModelLv15(d,{consoleOnly:true,localTartRoom:true,reviewSkin:true});
 d.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
 assert.equal(d.querySelector('[data-lv15-review]').dataset.lv15World,'private');
 assert.equal(d.querySelector('.smcv3-hero__image').getAttribute('src'),'/model-nightline-assets/tart-review.png');
 assert.equal(d.querySelector('[data-primary-actions]'),actions);
 assert.equal(actions.children.length,1);assert.equal(actions.firstChild,button);assert.equal(button.disabled,true);
 const next=d.createElement('button');next.dataset.action='mark_arrived';actions.replaceChildren(next);await tick();
 assert.equal(actions.firstChild,next);assert.equal(d.querySelector('[data-model-payout]').textContent,'Not paid');
 dom.window.close();
});
test('review home reuses original controls, adds one local hero and never forces Private',()=>{
 const dom=new JSDOM('<main id="mmd-model-home-v4"><div class="mmhome-shell"><header class="mm-lv-header"><button>Language</button></header><div data-mm-workspace hidden></div></div></main>',{url:'http://127.0.0.1/sigil/model/dashboard'});
 const d=dom.window.document,button=d.querySelector('button');
 installModelLv15(d,{reviewSkin:true,localTartRoom:true});installModelLv15(d,{reviewSkin:true,localTartRoom:true});
 assert.equal(d.querySelector('button'),button);assert.equal(d.querySelectorAll('.lv15-review-hero').length,1);
 assert.equal(d.querySelector('main').dataset.lv15World,'neutral');
 assert.equal(d.querySelector('[data-mm-workspace]').hidden,true);dom.window.close();
 assert.ok(Buffer.byteLength(buildLv15Embed({reviewSkin:true,localTartRoom:true}))<50000);
});
test('Tart Room is opt-in, loopback-only and keeps the existing action node and disabled state',()=>{
 for(const url of ['http://127.0.0.1/console','https://mmdbkk.com/sigil/model/console']){
  const dom=new JSDOM('<section id="sigil-model-console-v3"><div class="smcv3-hero"><img class="smcv3-hero__image" src="https://example.invalid/original.webp"></div><div class="smcv3-shell"><button data-action="start_work" disabled>Start</button></div></section>',{url});
  const d=dom.window.document,button=d.querySelector('button');installModelLv15(d,{consoleOnly:true,localTartRoom:true});
  assert.equal(d.querySelector('button'),button);assert.equal(button.disabled,true);
  assert.equal(d.querySelector('img.smcv3-hero__image').getAttribute('src'),url.startsWith('http://127.')?'/model-nightline-assets/tart-room.png':'https://example.invalid/original.webp');dom.window.close();
 }
});
test('local Tart Room attaches when the owner creates the Hero at DOM ready',()=>{
 const dom=new JSDOM('<section id="sigil-model-console-v3"><div class="smcv3-shell"></div></section>',{url:'http://127.0.0.1/console'}),d=dom.window.document;
 installModelLv15(d,{consoleOnly:true,localTartRoom:true});
 const hero=d.createElement('div');hero.className='smcv3-hero';hero.innerHTML='<img class="smcv3-hero__image">';d.querySelector('section').append(hero);
 d.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
 assert.equal(hero.querySelector('img').getAttribute('src'),'/model-nightline-assets/tart-room.png');dom.window.close();
});
test('restored Console-only skin never changes MY MODEL or customer app roots',()=>{
 const dom=docFor('<main id="mmd-model-home-v4"></main><div class="app" data-mmd-app-digital></div><section id="sigil-model-console-v3"><div class="smcv3-shell"><header class="smcv3-head"><button disabled>Action</button></header></div></section>');
 const d=dom.window.document,button=d.querySelector('button');
 installModelLv15(d,{consoleOnly:true});installModelLv15(d,{consoleOnly:true});
 assert.ok(d.querySelector('#sigil-model-console-v3').hasAttribute('data-lv15-world'));
 for(const selector of ['#mmd-model-home-v4','.app'])assert.equal(d.querySelector(selector).hasAttribute('data-lv15-world'),false);
 assert.equal(d.querySelectorAll('.lv15-masthead').length,1);assert.equal(d.querySelector('button'),button);assert.equal(button.disabled,true);
 dom.window.close();
});
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

test('Console recovery buttons use matching opaque theme tokens in empty and error views only', () => {
  const rule = LV15_CSS.match(/#sigil-model-console-v3\[data-lv15-world\] :is\(\[data-view="empty"\],\[data-view="error"\]\) \[data-refresh\]\{([^}]+)\}/);
  assert.ok(rule);
  assert.match(rule[1], /background:var\(--v15-accent\)!important/);
  assert.match(rule[1], /color:var\(--v15-button-ink\)!important/);
  assert.match(rule[1], /-webkit-text-fill-color:var\(--v15-button-ink\)!important/);
  const luminance = hex => hex.match(/../g).map(v => parseInt(v,16)/255).map(v => v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
  for(const [bg,ink] of [['b41332','fff8ed'],['d9bd77','171b17']]) {
    const a=luminance(bg),b=luminance(ink);
    assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5);
  }
});

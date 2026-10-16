import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('./dashboard-public-private-20261015.html',import.meta.url),'utf8');
const script=html.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
function mount(){
 const events={},nodes=new Map(),listeners=[];
 const buttons=['public','private'].map(lane=>({dataset:{laneView:lane},attrs:{},setAttribute(k,v){this.attrs[k]=v},addEventListener(k,f){this.click=f}}));
 const links=[0,1].map(()=>({href:'',querySelector(s){return this[s]||(this[s]={textContent:''})}}));
 const tabs={setAttribute(){},querySelectorAll(){return buttons},innerHTML:''};
 const root={dataset:{},querySelector(s){if(!nodes.has(s))nodes.set(s,{textContent:'',before(){}});return nodes.get(s)},querySelectorAll(){return links}};
 const document={getElementById(){return root},createElement(){return tabs}};
 const window={document,addEventListener(k,f){events[k]=f}};
 vm.runInNewContext(script,{window,document,module:{exports:{}}});
 return {root,nodes,buttons,links,events};
}
test('Public starts with MMD branding and public profile/support links',()=>{
 const x=mount();assert.equal(x.root.dataset.modelBrandLane,'public');
 assert.equal(x.nodes.get('.mdhome__eyebrow').textContent,'MMD · PUBLIC MODEL');
 assert.equal(x.links[0].href,'#mmd-model-self-service');
 assert.equal(x.links[1].href,'https://t.me/mmdprivebot');
 assert.equal(x.buttons[0].attrs['aria-pressed'],'true');
});
test('Private switch changes branding and job-day guide, and can switch back',()=>{
 const x=mount();x.buttons[1].click();assert.equal(x.root.dataset.modelBrandLane,'private');
 assert.equal(x.nodes.get('.mdhome__eyebrow').textContent,'SĪGIL · PRIVATE MODEL');
 assert.equal(x.links[0].href,'/rules/model/private/job-day');assert.equal(x.links[1].href,'/rules/model');
 assert.equal(x.buttons[1].attrs['aria-pressed'],'true');x.buttons[0].click();
 assert.equal(x.root.dataset.modelBrandLane,'public');assert.equal(x.buttons[1].attrs['aria-pressed'],'false');
});
test('trusted account event chooses initial lane but does not override a manual view',()=>{
 const x=mount();const detail={welcome_context:{authority:'admin-worker',resolved:true,subject_bound:true,version:'model_welcome_v2',model_lane:'private'}};
 x.events['mmd:model-session-ready']({detail});assert.equal(x.root.dataset.modelBrandLane,'private');
 x.buttons[0].click();x.events['mmd:model-session-ready']({detail});assert.equal(x.root.dataset.modelBrandLane,'public');
});
test('unresolved account context does not change the default view',()=>{
 const x=mount();x.events['mmd:model-session-ready']({detail:{welcome_context:{model_lane:'private'}}});assert.equal(x.root.dataset.modelBrandLane,'public');
});
test('all four approved images are responsive and presentation has no network writes',()=>{
 for(const name of ['6aa1695b9172e0ef05688e67','6a43e57014aeed32f7db357e','6a35aa646f6c76556523d7fe','6a35f70ba2c1ec636a446949'])assert.ok(html.includes(name));
 assert.ok(html.includes('@media(min-width:768px)'));assert.doesNotMatch(script,/fetch\(|liff\.login|location\.(assign|replace)|localStorage|sessionStorage/);
});

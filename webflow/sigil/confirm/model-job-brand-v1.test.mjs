import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('./model-job-brand-v1.html',import.meta.url),'utf8');
const script=html.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
function setup(neutral=false){
  const events={};
  const brand={children:[],textContent:'',replaceChildren(){this.children=[];this.textContent='';},appendChild(x){this.children.push(x);}};
  const document={readyState:'complete',documentElement:{dataset:{},hasAttribute:()=>neutral},querySelector:()=>brand,createElement:()=>({}),createTextNode:text=>({text})};
  vm.runInNewContext(script,{window:{addEventListener:(key,fn)=>events[key]=fn},document});
  return {brand,document,send:data=>events['mmd:model-job-brand']({detail:{ok:true,schema:'model_job_day_rules_ack_v1',...data}})};
}
test('one model can switch from Public MMD to Private SIGIL per job',()=>{
  const x=setup();x.send({model_work_lane:'public_model'});
  assert.match(x.brand.children[0].src,/04-compact-symbol/);assert.equal(x.brand.children[0].alt,'MMD');
  x.send({model_work_lane:'private_model'});
  assert.match(x.brand.children[0].src,/SIGIL-System-Light-Transparent/);assert.equal(x.brand.children[0].alt,'SĪGIL System');
});
test('unknown, review and failed responses never imply Public',()=>{
  const x=setup();x.send({reason:'not_private_model'});assert.equal(x.brand.children.length,0);
  x.send({model_work_lane:'needs_review',applies:true});assert.equal(x.brand.children.length,0);
  x.send({ok:false,model_work_lane:'private_model'});assert.equal(x.brand.children.length,0);
});
test('old explicit Private response works and partner neutral stays neutral',()=>{
  const x=setup();x.send({applies:true});assert.equal(x.brand.children[0].alt,'SĪGIL System');
  const neutral=setup(true);neutral.send({model_work_lane:'private_model'});assert.equal(neutral.brand.children.length,0);
});

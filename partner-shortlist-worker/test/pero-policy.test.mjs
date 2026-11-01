import test from 'node:test';import assert from 'node:assert/strict';
import {filters,matches,BENZ_T} from '../src/pero-policy.js';
const m=(id,height,weight)=>({id,canonicalModelId:id,historyReviewedAt:'2026-01-01',qualification:{category:'standard',pn:true,straight:true,accepting:true},display:{name:id,code:'',height,weight,status:'pending'}});
test('exact first then nearby; unknown measurements never fabricated',()=>{
 const value={models:[m('near',181,84),m('exact',178,75),m('far',190,100),m('unknown',null,null)]};
 const f=filters(new URLSearchParams('search=1&heightMin=175&heightMax=180&weightMin=70&weightMax=80'));
 assert.deepEqual(matches(value,f).map(x=>[x.id,x.match]),[['exact','exact'],['near','near']]);
 assert.equal(matches(value,filters(new URLSearchParams())).length,4);
});
test('Standard, PN, accepting, verified and Benz restrictions are independent',()=>{
 const models=[m('yes',180,75),m(BENZ_T,180,75),m('premium',180,75),m('stopped',180,75),m('unverified',180,75),m('noPN',180,75)];
 models[2].qualification.category='premium';models[3].qualification.accepting=false;models[4].qualification.straight=false;models[5].qualification.pn=false;
 assert.deepEqual(matches({models},filters(new URLSearchParams('search=1'))).map(x=>x.id),['yes']);
});
test('reject widening, duplicates, reversed ranges and malformed numbers',()=>{
 for(const query of ['category=premium','search=1&search=1','heightMin=190&heightMax=180','weightMin=abc','heightMin=999'])assert.throws(()=>filters(new URLSearchParams(query)));
});

const model=(id,height,weight,extra={})=>({canonicalModelId:id,qualification:{category:'standard',straight:true},display:{name:id,height,weight,status:'pending'},...extra});
const value={models:[model('ice',176,83),model('earth',175,63),model('bank',173,60),model('film',183,79)]};
test('initial discovery needs no payout, quote, or completed-job evidence',()=>assert.equal(matches(value,filters(new URLSearchParams())).length,4));
test('height and weight rank exact before nearby',()=>{const found=matches(value,filters(new URLSearchParams('search=1&heightMin=175&heightMax=176&weightMax=70')));assert.equal(found[0].canonicalModelId,'earth');assert.equal(found[1].canonicalModelId,'bank');assert.equal(found[1].match,'near');});
test('scope and explicit exclusions remain enforced',()=>{const v={ownerOnly:{excludedCanonicalModelIds:['simba']},models:[model(BENZ_T,175,70),model('simba',175,70),model('other-tier',175,70,{qualification:{category:'premium',straight:true}}),model('unclassified',175,70,{qualification:{category:'standard'}}),model('off',175,70,{display:{name:'off',height:175,weight:70,status:'unavailable'}})]};assert.deepEqual(matches(v,filters(new URLSearchParams())),[]);});
test('blank dimensions do not become zero; invalid reversed ranges fail',()=>{assert.equal(matches(value,filters(new URLSearchParams('search=1&heightMin=&weightMax='))).length,4);assert.throws(()=>filters(new URLSearchParams('heightMin=190&heightMax=170')));});

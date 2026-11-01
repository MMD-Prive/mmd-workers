import test from 'node:test';import assert from 'node:assert/strict';
import {filters,matches,BENZ_T} from '../src/pero-policy.js';
const m=(id,height,weight)=>({id,canonicalModelId:id,historyReviewedAt:'2026-01-01',qualification:{category:'standard',pn:true,straight:true,accepting:true},display:{name:id,code:'',height,weight,status:'pending'}});
test('exact first then nearby; unknown measurements never fabricated',()=>{
 const value={models:[m('near',181,84),m('exact',178,75),m('far',190,100),m('unknown',null,null)]};
 const f=filters(new URLSearchParams('search=1&heightMin=175&heightMax=180&weightMin=70&weightMax=80'));
 assert.deepEqual(matches(value,f).map(x=>[x.id,x.match]),[['exact','exact'],['near','near']]);
 assert.equal(matches(value,filters(new URLSearchParams())).length,0);
});
test('Standard, PN, accepting, verified and Benz restrictions are independent',()=>{
 const models=[m('yes',180,75),m(BENZ_T,180,75),m('premium',180,75),m('stopped',180,75),m('unverified',180,75),m('noPN',180,75)];
 models[2].qualification.category='premium';models[3].qualification.accepting=false;models[4].qualification.straight=false;models[5].qualification.pn=false;
 assert.deepEqual(matches({models},filters(new URLSearchParams('search=1'))).map(x=>x.id),['yes']);
});
test('reject widening, duplicates, reversed ranges and malformed numbers',()=>{
 for(const query of ['category=premium','search=1&search=1','heightMin=190&heightMax=180','weightMin=abc','heightMin=999'])assert.throws(()=>filters(new URLSearchParams(query)));
});

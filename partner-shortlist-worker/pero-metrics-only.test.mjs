import test from 'node:test';
import assert from 'node:assert/strict';
import {matches,filters,BENZ_T} from './src/pero-policy.js';
const model=(id,height,weight,extra={})=>({canonicalModelId:id,qualification:{category:'standard',straight:true},display:{name:id,height,weight,status:'pending'},...extra});
const value={models:[model('ice',176,83),model('earth',175,63),model('bank',173,60),model('film',183,79)]};
test('initial discovery needs no payout, quote, or completed-job evidence',()=>assert.equal(matches(value,filters(new URLSearchParams())).length,4));
test('height and weight rank exact before nearby',()=>{const found=matches(value,filters(new URLSearchParams('search=1&heightMin=175&heightMax=176&weightMax=70')));assert.equal(found[0].canonicalModelId,'earth');assert.equal(found[1].canonicalModelId,'bank');assert.equal(found[1].match,'near');});
test('scope and explicit exclusions remain enforced',()=>{const v={ownerOnly:{excludedCanonicalModelIds:['simba']},models:[model(BENZ_T,175,70),model('simba',175,70),model('other-tier',175,70,{qualification:{category:'premium',straight:true}}),model('unclassified',175,70,{qualification:{category:'standard'}}),model('off',175,70,{display:{name:'off',height:175,weight:70,status:'unavailable'}})]};assert.deepEqual(matches(v,filters(new URLSearchParams())),[]);});
test('blank dimensions do not become zero; invalid reversed ranges fail',()=>{assert.equal(matches(value,filters(new URLSearchParams('search=1&heightMin=&weightMax='))).length,4);assert.throws(()=>filters(new URLSearchParams('heightMin=190&heightMax=170')));});

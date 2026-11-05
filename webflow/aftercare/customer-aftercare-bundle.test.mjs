import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
import {buildCustomerAftercareEmbed} from '../../scripts/build-customer-aftercare-embed.mjs';

const css=readFileSync(new URL('./customer-aftercare-v2.css',import.meta.url),'utf8');
test('Aftercare ships complete scoped styling, verified font assets and the official SIGIL logo in one embed',()=>{
  const embed=buildCustomerAftercareEmbed();
  assert.ok(Buffer.byteLength(embed)<50000);
  assert.match(embed,/mmd-aftercare-base-v2-styles/);
  for(const family of ['Noto Sans Thai','Playfair Display','Outfit'])assert.ok(embed.includes(family));
  assert.doesNotMatch(embed,/Canela-Regular-Trial|localhost|preview-only\.css|MMD_AFTERCARE_BRAND/);
  assert.match(css,/#sigil-aftercare-room\.sac/);
  assert.doesNotMatch(css,/font-size:[^;}]*vw|letter-spacing:\s*-/);
  assert.match(css,/font-synthesis:none/);
  for(const match of embed.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
});

test('built Aftercare renders its own logo and typography without any Webflow or preview stylesheet',async()=>{
  const dom=new JSDOM('<!doctype html><html><head></head><body>'+buildCustomerAftercareEmbed()+'</body></html>',{
    url:'https://mmdbkk.com/aftercare?t=fixture-customer',runScripts:'dangerously',
    beforeParse(window){window.matchMedia=()=>({matches:true});window.fetch=async()=>Response.json({ok:true,role:'customer',session_id:'fixture-session',model_name:'Fixture Model',job_date:'2026-11-01',customer_session:{schema:'customer_session_v2',source_available:true,lifecycle_state:'separated',aftercare:{available:true,customer_approved:false,review_submitted:false}}});},
  });
  try{
    for(let n=0;n<10;n++)await new Promise(setImmediate);
    const {document}=dom.window,root=document.getElementById('sigil-aftercare-room');
    assert.equal(document.querySelectorAll('#sigil-aftercare-room').length,1);
    assert.ok(root.querySelector('.sac-brand svg title').textContent.includes('SĪGIL System'));
    const style=document.getElementById('mmd-aftercare-base-v2-styles').textContent;
    assert.match(style,/--display:"Playfair Display"/);
    assert.match(style,/--thai:"Noto Sans Thai"/);
    assert.ok(root.querySelector('h1[lang=en]'));
    assert.equal(root.querySelector('[data-approve-completion]').disabled,false);
    assert.equal(root.querySelector('[data-form-fields]').disabled,true);
    assert.equal(document.querySelectorAll('link[rel=stylesheet]').length,0);
  }finally{dom.window.close();}
});

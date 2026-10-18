import fs from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBundle} from '../../../scripts/build-my-model-workspace-bundle.mjs';
import {buildLovableSkinEmbed,validateAtelierAssets} from '../../../scripts/build-my-model-lovable-skin-embed.mjs';
const source=fs.readFileSync(new URL('./my-model-lovable-vnext-skin-20261017.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('./my-model-lovable-vnext-skin-20261017.css',import.meta.url),'utf8');
const bundle=buildBundle(), skin=buildLovableSkinEmbed();
test('V3 build rejects oversized UTF-8 vectors, wrong dimensions and embedded content',()=>{
 const assets=Object.fromEntries(['current-job-etching','no-current-job','media-review-motif','icons'].map(name=>[name,fs.readFileSync(new URL('./atelier/'+name+'.svg',import.meta.url),'utf8').trim()]));
 assert.doesNotThrow(()=>validateAtelierAssets(assets));
 assert.throws(()=>validateAtelierAssets({...assets,'current-job-etching':assets['current-job-etching'].replace('</svg>','<!--'+ 'ก'.repeat(3000)+'--></svg>')}),/byte budget/);
 assert.throws(()=>validateAtelierAssets({...assets,'no-current-job':assets['no-current-job'].replace('240 112','240 144')}),/viewBox/);
 for(const payload of ['<image href="x"/>','<script/>','<foreignObject/>','<path onload = "x"/>']){
  assert.throws(()=>validateAtelierAssets({...assets,'media-review-motif':assets['media-review-motif'].replace('</svg>',payload+'</svg>')}),/Non-geometric/);
 }
 assert.throws(()=>validateAtelierAssets({...assets,icons:assets.icons.replace('id="support"','id="missing"')}),/Missing or oversized icon/);
});
test('exact Lovable design provenance and safe compact design',()=>{
 assert.match(css,/bedd3eba6645ae088b37e225dea441780ad4bc61/);
 assert.match(css,/oklch\(\.1384 \.0055 128\.3\)/);
 assert.match(css,/oklch\(\.82 \.078 82\)/);
 assert.match(css,/min\(100%,520px\)/);
 assert.match(css,/safe-area-inset-bottom/);
 assert.match(css,/\.mm-lv-atmosphere\{[^}]*opacity:\.10;filter:brightness\(1\.10\);/);
 assert.match(source,/Midnight%20Bangkok%20Through%20Rainy%20Glass\.webp/);
});
test('four canonical tabs and locale controls stay presentation-only',()=>{
 for(const key of ['home','jobs','console','you'])assert.ok(source.includes('data-mm-lv-nav="'+key+'"'),key);
 for(const key of ['th','en','zh'])assert.ok(source.includes('data-mm-lv-lang="'+key+'"'),key);
 assert.match(source,/\/sigil\/model\/dashboard\/jobs/);
 assert.match(source,/\/sigil\/model\/console/);
 assert.match(source,/mm-lv-you/);
 assert.doesNotMatch(source,/fetch\s*\(|XMLHttpRequest|localStorage|supabase|\.getIDToken\(/);
});
test('no inferred public or private lane: only signed current-session event',()=>{
 assert.match(source,/root\.dataset\.mmLvLane='neutral'/);
 assert.match(source,/mmd:model-session-ready/);
 assert.match(source,/p\?\.ok!==true\|\|!s\?\.session_id/);
 assert.match(source,/s\.model_work_lane,s\.payout_terms\?\.money_lane/);
 assert.match(source,/lanes\.every\(x=>x==='private_model'\)/);
 assert.match(source,/lanes\.every\(x=>x==='public_model'\)/);
 assert.match(source,/mmd:model-workspace-locked/);
 assert.doesNotMatch(source,/params\.get\('world'\)|model_record_id=|customer_sell_price/);
});
test('real workspace, media and signed Console handlers are never replaced',()=>{
 for(const token of ['[data-mm-workspace]','[data-mm-gallery]','[data-mm-media-host]','#mmd-model-self-service','[data-mm-console]'])assert.ok(source.includes(token),token);
 for(const token of ['data-mss-profile-form','/v1/model/liff/exchange','/v1/model/profile','mmu-native-picker'])assert.ok(bundle.includes(token),token);
 assert.doesNotMatch(source,/location\.replace\(|location\.assign\(|\.innerHTML\s*=\s*profile/);
 assert.match(source,/root\.dataset\.mmLovableSkin=source/);
});
test('both Webflow embeds parse and stay below 50KB',()=>{
 assert.ok(Buffer.byteLength(skin,'utf8')<50000);
 assert.ok(Buffer.byteLength(bundle,'utf8')<50000);
 assert.equal((skin.match(/<script id="my-model-lovable-vnext-skin-20261017">/g)||[]).length,1);
 new vm.Script(source);
 for(const m of skin.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
});


test('premium atelier v2 is restrained, accessible and preserves both verified lanes',()=>{
 assert.match(css,/PREMIUM ATELIER v2/);
 assert.match(css,/--lv-bg:#0b0e10/);
 assert.match(css,/--lv-text:#f3f0e8/);
 assert.match(css,/--lv-gold:#c9b38b/);
 assert.match(css,/\[data-mm-lv-lane="public"\]\{/);
 assert.match(css,/--lv-bg:#f8f7f3/);
 assert.match(css,/\.mm-lv-work\{/);
 assert.match(css,/\.mm-lv-work\s+\.mmprimary\{/);
 assert.match(css,/\.mm-lv-guides\[open\]>/);
 assert.match(css,/min-height:52px/);
 assert.match(css,/min-width:44px/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/opacity:\.10;filter:brightness\(1\.10\)/);
 assert.doesNotMatch(css,/\.mm-lv-atmosphere\{[^}]*opacity:\.2/);
});
test('guides are accessible, localized and do not steal operational authority',()=>{
 assert.match(source,/root\.dataset\.mmPremiumSkin='atelier-v2'/);
 assert.match(source,/guideLinks=shell\.querySelector\('\.mmshortcuts'\)/);
 assert.match(source,/doc\.createElement\('details'\)/);
 assert.match(source,/summary\.dataset\.mmLvText='guides'/);
 assert.match(source,/guides:'คู่มือและกติกา'/);
 assert.match(source,/guides:'Guides & policies'/);
 assert.match(source,/guides:'指南与规定'/);
 assert.match(source,/guideLinks\.before\(guides\);guides\.append\(summary,guideLinks\)/);
 assert.doesNotMatch(source,/\b(?:fetch|XMLHttpRequest|localStorage|indexedDB|supabase)\b/);
 assert.match(source,/mmd:model-session-ready/);
 assert.match(source,/mmd:model-workspace-locked/);
 assert.match(source,/mm-lv-dock/);
 assert.ok(Buffer.byteLength(skin,'utf8')<50000);
});

test('compact vectors are small, local, decorative, single-family and embedded without requests',()=>{
 const manifest=JSON.parse(fs.readFileSync(new URL('./atelier/manifest.json',import.meta.url),'utf8'));
 for(const name of ['current-job-etching','no-current-job','media-review-motif','icons']){
  const svg=fs.readFileSync(new URL('./atelier/'+name+'.svg',import.meta.url),'utf8').trim();
  assert.ok(Buffer.byteLength(svg)<2400,name);
  assert.match(svg,/^<svg\b/);
  assert.doesNotMatch(svg,/<(?:script|image|foreignObject|text)\b|\bon\w+=|\b(?:href|src)=/i);
  assert.ok(skin.includes(svg.replaceAll('"','\\"')),name+' in built JS');
  const bytes=fs.readFileSync(new URL('./atelier/'+name+'.svg',import.meta.url));
  const entry=manifest.files.find(x=>x.file===name+'.svg');assert.equal(entry.bytes,bytes.length);assert.equal(entry.sha256,createHash('sha256').update(bytes).digest('hex'));
 }
 for(const key of ['home','jobs','console','you','profile','media','availability','support'])assert.ok(fs.readFileSync(new URL('./atelier/icons.svg',import.meta.url),'utf8').includes('id="'+key+'"'));
 assert.match(source,/setAttribute\('aria-hidden','true'\)/);
 assert.match(source,/setAttribute\('focusable','false'\)/);
 assert.match(css,/\.mm-lv-art \*\{pointer-events:none\}/);
 assert.ok(Buffer.byteLength(skin)<50000);
 assert.doesNotMatch(skin,/MY_MODEL_ATELIER_ASSETS \*\/\{\}/);
});

test('only the exact confirmed empty projection displays empty art; unresolved state resets stale lane',()=>{
 const body=source.match(/function syncWork\(\)\{([\s\S]*?)\n  \}/)[1];
 const run=new Function('workspace','work','empty','root',body);
 for(const [label,hidden,emptyExpected] of [
  ['ยังไม่มีงานที่กำลังใช้งาน',false,true],['ยังไม่มีงานที่กำลังใช้งาน',true,false],
  ['กำลังตรวจงานของคุณ',false,false],['ยังตรวจงานไม่สำเร็จ',false,false],
  ['MMD กำลังตรวจข้อมูลงาน',false,false],['401',false,false],['403',false,false],['pending_review',false,false],['timeout',false,false],
 ]){
  const root={dataset:{mmLvLane:'private'}},empty={},work={dataset:{},querySelector:()=>({textContent:label})};
  run({hidden},work,empty,root);assert.equal(!empty.hidden,emptyExpected,label);assert.equal(root.dataset.mmLvLane,'neutral',label);
 }
 const root={dataset:{mmLvLane:'private'}},empty={},work={dataset:{},querySelector:()=>({textContent:'มีงานของคุณใน Console'})};
 run({hidden:false},work,empty,root);assert.equal(empty.hidden,true);assert.equal(root.dataset.mmLvLane,'private');
});

test('compact disclosures move original identity controls and retain native media and availability inputs',()=>{
 assert.match(source,/Array\.from\(identity.children\).*el\.matches\('dl,button,\.mmhint,a'\)/);
 assert.match(source,/panel\.append\(summary,verification\)/);
 assert.match(source,/panel\.open=workspace.hidden/);
 assert.match(source,/data-mm-lv-focus="availability_status"/);
 assert.match(source,/media\.append\(mediaTitle,graphic\('media-review-motif'/);
 assert.match(source,/mmCompactGraphics='atelier-v1'/);
 assert.doesNotMatch(source,/cloneNode|\.click\(\)|\.disabled\s*=|\.checked\s*=|\.required\s*=/);
 assert.match(css,/FINAL MMD CONTRAST SAFETY/);
 assert.match(css,/repeat\(4,minmax\(0,1fr\)\)/);
});

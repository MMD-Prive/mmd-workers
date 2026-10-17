import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBundle} from '../../../scripts/build-my-model-workspace-bundle.mjs';
import {buildLovableSkinEmbed} from '../../../scripts/build-my-model-lovable-skin-embed.mjs';
const source=fs.readFileSync(new URL('./my-model-lovable-vnext-skin-20261017.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('./my-model-lovable-vnext-skin-20261017.css',import.meta.url),'utf8');
const bundle=buildBundle(), skin=buildLovableSkinEmbed();
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

// Isolated source fixture, not an authenticated production-page snapshot.
// PLAYWRIGHT_MODULE_PATH and CHROMIUM_EXECUTABLE may point to an existing runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { decorateInternalSilverTheme, SILVER_WORKSPACE_CSS } from './sigil-internal-theme-v1.mjs';
import { STUDIO_READABLE_CSS } from './sigil-studio-readable-v1.mjs';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const url='https://studio.test/internal/admin/studio';
const source=await readFile(new URL('../internal/admin/studio/studio-launchpad.html',import.meta.url),'utf8');
// Reconstruct the reported conflict: gradient anchor cards survive the generic
// light-section rules, and old sidebar glyph colors arrive after the new theme.
const legacyCss=`body{margin:0}#mmdStudioR5 .se-step{display:block;min-height:220px;background:linear-gradient(135deg,#19120b,#0b0907);color:#f3f0e8}#mmdStudioR5 .se-primary,#mmdStudioR5 .se-chip{background:#100c07;color:#fff}#mmdK{position:fixed;bottom:16px;right:16px;width:440px;padding:12px;background:#fff}.mmd-aiops-btn{position:fixed;right:16px;bottom:16px;padding:14px;z-index:10000}`;
const dock='<div id="mmdK"><strong>KENJI · INTERNAL</strong><a href="/internal/admin/kenji">Kenji</a><a href="/internal/admin/control-room">Control</a><a href="/internal/admin/jobs/create-job">Create Job</a><a href="/internal/ceo/models">Models</a></div><button class="mmd-aiops-btn">PER · AI OPS</button>';
const raw=`<!doctype html><html lang="th"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${legacyCss}</style></head><body>${source}${dock}</body></html>`;
const rendered=await (await decorateInternalSilverTheme(new Request(url),new Response(raw,{headers:{'content-type':'text/html'}}))).text();
const expected=['/internal/admin/control-room','/internal/ceo/models','/internal/admin/studio/upload','/internal/admin/studio/upload','/internal/admin/studio/review','/internal/admin/studio/model-preview'];

test('Studio remains readable and every CTA stays reachable after a legacy theme reload',async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
  try {
    const page=await browser.newPage({reducedMotion:'reduce'});
    await page.route('**/*',route=>route.request().url()===url?route.fulfill({contentType:'text/html',body:rendered}):route.abort());
    for(const width of [360,390,768,1440]) {
      await page.setViewportSize({width,height:844});
      await page.goto(url);
      await page.mouse.move(0,0);
      await page.evaluate(css=>{
        document.getElementById('sigil-internal-silver-v1').textContent=css;
        const late=document.createElement('style');
        late.textContent='#sigil-workspace-directory{background:#252c34!important}#sigil-workspace-directory :is(summary,a){color:#f7f8fa!important;-webkit-text-fill-color:#f7f8fa!important}';
        document.head.append(late);
        document.querySelector('#mmdStudioR5').addEventListener('click',event=>{
          const a=event.target.closest('a');if(!a)return;event.preventDefault();window.clickedStudioPath=new URL(a.href).pathname;
        });
      },SILVER_WORKSPACE_CSS.replace(STUDIO_READABLE_CSS,''));
      assert.deepEqual(await page.locator('#mmdStudioR5 a').evaluateAll(nodes=>nodes.map(a=>new URL(a.href).pathname)),expected);
      const info=await page.evaluate(()=>{
        const rgb=value=>value.match(/[\d.]+/g).map(Number);
        const lum=c=>c.slice(0,3).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
        const ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
        const contrast=el=>{
          let bg=[255,255,255],chain=[];for(let n=el;n;n=n.parentElement)chain.push(n);
          for(const node of chain.reverse()){const c=rgb(getComputedStyle(node).backgroundColor),alpha=c[3]??1;bg=c.slice(0,3).map((x,i)=>x*alpha+bg[i]*(1-alpha));}
          const s=getComputedStyle(el);return ratio(rgb(s.webkitTextFillColor || s.color),bg);
        };
        const nodes=[...document.querySelectorAll('#mmdStudioR5 :is(h1,h3,p,small,em,b,strong,.se-primary,.se-chip,.se-go,.se-kicker,.se-status),#sigil-workspace-directory :is(summary,a),#mmdK a')].filter(el=>el.getClientRects().length);
        return {width:document.documentElement.scrollWidth,minContrast:Math.min(...nodes.map(contrast)),failures:nodes.filter(el=>contrast(el)<4.5).map(el=>({text:el.textContent,contrast:contrast(el)})),cards:[...document.querySelectorAll('.se-step')].map(el=>({background:getComputedStyle(el).backgroundColor,image:getComputedStyle(el).backgroundImage})),dock:getComputedStyle(document.querySelector('#mmdK')).position};
      });
      assert.ok(info.width<=width,`${width}px overflow to ${info.width}px`);
      assert.ok(info.minContrast>=4.5,`${width}px low contrast: ${JSON.stringify(info.failures)}`);
      assert.deepEqual(info.cards,Array(3).fill({background:'rgb(255, 255, 255)',image:'none'}));
      assert.equal(info.dock,'static');
      for(let i=0;i<expected.length;i++) {
        const link=page.locator('#mmdStudioR5 a').nth(i);
        await link.scrollIntoViewIfNeeded();
        const box=await link.boundingBox();assert.ok(box.height>=44,`${width}px CTA ${i} hit target`);
        await link.click();
        assert.equal(await page.evaluate(()=>window.clickedStudioPath),expected[i]);
        await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
        const focus=await link.evaluate(el=>({focused:document.activeElement===el,width:getComputedStyle(el).outlineWidth,style:getComputedStyle(el).outlineStyle}));
        assert.ok(focus.focused && focus.width==='3px' && focus.style==='solid',`${width}px CTA ${i} keyboard focus ${JSON.stringify(focus)}`);
        await page.keyboard.press('Enter');
        assert.equal(await page.evaluate(()=>window.clickedStudioPath),expected[i]);
      }
      const primary=page.locator('.se-primary');await primary.hover();
      assert.equal(await primary.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(253, 186, 116)');
      if(process.env.STUDIO_SCREENSHOTS && [390,1440].includes(width)) {
        await mkdir(process.env.STUDIO_SCREENSHOTS,{recursive:true});
        await page.mouse.move(0,0);await page.evaluate(()=>window.scrollTo(0,0));
        await page.screenshot({path:resolve(process.env.STUDIO_SCREENSHOTS,`studio-${width}.png`),fullPage:true});
      }
      console.log(`Studio ${width}px: six CTA click/keyboard targets, no overflow, minimum text contrast ${info.minContrast.toFixed(2)}:1`);
    }
  } finally {await browser.close();}
});

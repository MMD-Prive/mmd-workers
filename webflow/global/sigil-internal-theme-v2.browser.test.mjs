// Run with Playwright installed: node --test webflow/global/sigil-internal-theme-v2.browser.test.mjs
// Optional PLAYWRIGHT_MODULE_PATH / CHROMIUM_EXECUTABLE for an existing local browser runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SILVER_WORKSPACE_CSS } from './sigil-internal-theme-v1.mjs';
import { MMS_WORKSPACE_CSS } from './mms-workspace-theme-v1.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root=new URL('../../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
const staticHtml=html=>html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'').replace(/\son\w+="[^"]*"/gi,'');
const shell=(body,css='')=>`<!doctype html><html lang="th" data-sigil-internal-theme="silver-orange-v1"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}\n${SILVER_WORKSPACE_CSS}</style></head><body>${body}</body></html>`;
const control='<div id="theme-probe"><button>ค้นหาลูกค้า</button><button disabled><span>ยังไม่พร้อม</span></button><button aria-disabled="true">รอข้อมูล</button><input placeholder="ชื่อ / LINE / เบอร์"><button aria-pressed="true">เลือกแล้ว</button></div>';
const rgb={white:'rgb(255, 255, 255)',ink:'rgb(39, 43, 48)',orange:'rgb(254, 215, 170)',hover:'rgb(253, 186, 116)',active:'rgb(251, 146, 60)',disabled:'rgb(237, 240, 243)'};

test('mobile theme adapters, interaction states and MMS isolation in Chromium',async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
 try {
  const page=await browser.newPage();
  // Static source rendering only; never execute business scripts or call production APIs.
  await page.route('**/*',route=>route.abort());
  const fixtures=[
   ['dashboard','webflow/internal/admin/dashboard/dashboard-simple.html','webflow/internal/admin/dashboard/dashboard-simple.css'],
   ['control-room','webflow/internal/admin/control-room/control-room-desktop-v2.html','webflow/internal/admin/control-room/control-room-desktop-v2.css'],
   ['all-jobs','webflow/internal/admin/jobs/all/all-jobs.html',null],
   ['create-session','immigrate-worker/public/a/create-sessions-owner-v14.html','immigrate-worker/public/a/create-sessions-owner-v14.css'],
   ['create-job-legacy-reconstruction','webflow/internal/admin/jobs/create-job/v11-reconstruction/template.html','webflow/internal/admin/jobs/create-job/lv11-owner-composer-v1.css'],
   ['money-control','webflow/internal/admin/payments/money-control-v3.html',null],
   ['payment-review','webflow/internal/admin/payments/payment-review-simple.html',null],
   ['review','webflow/internal/admin/mmd-review/review.html','webflow/internal/admin/mmd-review/review.css'],
   ['studio-launchpad','webflow/internal/admin/studio/studio-launchpad.html',null],
   ['shop-inventory','webflow/internal-admin-shop/inventory/inventory.html','webflow/internal-admin-shop/inventory/head.html'],
   ['shop-products','webflow/internal-admin-shop/products/products.html','webflow/internal-admin-shop/products/products.css'],
   ['telegram-brief','webflow/internal/admin/telegram-brief/telegram-brief.html',null],
   ['bank-design','webflow/internal/admin/payments/kbank-payment-design.html',null],
   ['auto-card','webflow/internal/admin/studio/auto-card-inbox.html','webflow/internal/admin/studio/auto-card-inbox.css'],
   ['audience','webflow/internal/ceo/audience/audience-demographic.html',null],
  ];
  const {renderCreateJobPage,renderJobBoardPage}=await import('../../immigrate-worker/src/internal-pages.ts');
  const generated={ 'worker-create-job':await renderCreateJobPage().text(), 'worker-job-board':await renderJobBoardPage().text() };
  fixtures.push(...Object.keys(generated).map(name=>[name,null,null]));
  if(process.env.SESSION_CREATOR_HTML && process.env.SESSION_CREATOR_CSS) {
    generated['session-creator-external']=await readFile(process.env.SESSION_CREATOR_HTML,'utf8');
    fixtures.push(['session-creator-external',null,null]);
    for(const alias of ['create-job','job-board']) {
      const fixtureName='session-creator-'+alias;
      generated[fixtureName]=await readFile(resolve(process.env.SESSION_CREATOR_HTML,'../session-creator-'+alias+'.html'),'utf8');
      fixtures.push([fixtureName,null,null]);
    }
  }
  const results=[];
  for(const [name,htmlPath,cssPath] of fixtures){
   const source=staticHtml(htmlPath?await read(htmlPath):generated[name]);const css=name.startsWith('session-creator-')?await readFile(process.env.SESSION_CREATOR_CSS,'utf8'):(cssPath?await read(cssPath):'');
   const body=source.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || source;
   for(const width of [360,390,768,1440]){
    await page.setViewportSize({width,height:844});
    await page.setContent(shell(body+control,css.includes('<style')?[...css.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m=>m[1]).join('\n'):css));
    const info=await page.evaluate(()=>({background:getComputedStyle(document.body).backgroundColor,
      darkSurfaces:[...document.querySelectorAll('main,section,article,header,aside,nav,.mmd-cs-v14__dock,.mmd-cs-v14__thumb')].filter(el=>{const r=el.getBoundingClientRect();const c=getComputedStyle(el).backgroundColor.match(/rgba?\(([^)]+)/);return r.width>0&&r.height>0&&c&&c[1].split(',').slice(0,3).map(Number).every(x=>x<80)&&!c[1].endsWith(', 0')}).map(el=>el.className || el.tagName),overflow:[...document.querySelectorAll('body *')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&r.right>innerWidth+1&&getComputedStyle(el).opacity!=='0'}).slice(-8).map(el=>({tag:el.tagName,cls:el.className,right:el.getBoundingClientRect().right,text:el.textContent.slice(0,40)})),scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth}));
    assert.equal(info.background,rgb.white,`${name} ${width} background`);
    if(name==='dashboard') assert.equal(await page.locator('.adm27-focus .adm27-btn.is-primary').evaluate(el=>getComputedStyle(el).backgroundColor),rgb.orange,'dashboard Create Job CTA');
    if(name==='shop-inventory' || name==='shop-products') assert.equal(await page.locator('.shopops-nav a.is-active').evaluate(el=>getComputedStyle(el).backgroundColor),rgb.orange,'shop active nav');
    if(name==='telegram-brief') assert.equal(await page.locator('a.tb-btn').first().evaluate(el=>getComputedStyle(el).backgroundColor),rgb.orange,'Telegram handoff link');
    const probe=page.locator('#theme-probe button').first();
    assert.equal(await probe.evaluate(el=>getComputedStyle(el).backgroundColor),rgb.orange,`${name} ${width} button`);
    assert.deepEqual(info.darkSurfaces,[],`${name} ${width} dark surfaces`);
    assert.ok(info.scrollWidth<=width+1,`${name} ${width}: page overflows to ${info.scrollWidth}px: ${JSON.stringify(info.overflow)}`);
    results.push({name,width,...info});
    if(process.env.THEME_SCREENSHOTS && width===390){await mkdir(process.env.THEME_SCREENSHOTS,{recursive:true});await page.locator('#theme-probe').evaluate(el=>el.remove());await page.screenshot({path:resolve(process.env.THEME_SCREENSHOTS,`${name}-390.png`),fullPage:true});}
   }
  }
  console.log('SOURCE_RENDER_RESULTS '+JSON.stringify(results));
  await page.setContent(shell(control));
  const button=page.locator('#theme-probe button').first();
  await button.hover();assert.equal(await button.evaluate(el=>getComputedStyle(el).backgroundColor),rgb.hover);
  await page.mouse.down();assert.equal(await button.evaluate(el=>getComputedStyle(el).backgroundColor),rgb.active);await page.mouse.up();
  const disabled=page.locator('#theme-probe button:disabled');await disabled.hover();
  assert.equal(await disabled.evaluate(el=>getComputedStyle(el).backgroundColor),rgb.disabled);
  assert.equal(await page.locator('[aria-disabled="true"]').evaluate(el=>getComputedStyle(el).backgroundColor),rgb.disabled);
  assert.equal(await page.locator('[aria-pressed="true"]').evaluate(el=>getComputedStyle(el).backgroundColor),rgb.active);
  await button.focus();assert.equal(await button.evaluate(el=>getComputedStyle(el).outlineWidth),'3px');
  assert.equal(await page.locator('input').evaluate(el=>getComputedStyle(el).fontSize),'16px');
  await page.setContent(`<html data-mms-theme="white-green-v1"><head><style>${MMS_WORKSPACE_CSS}\n${SILVER_WORKSPACE_CSS}</style></head><body><button class="primary">MMS</button></body></html>`);
  assert.equal(await page.locator('button').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(47, 107, 75)');
 } finally {await browser.close();}
});

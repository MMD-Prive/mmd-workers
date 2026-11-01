// Offline visual verification of the exact Worker-generated member shell.
// No LINE SDK, member APIs, cookies, real account data or customer writes.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {handleLiffMemberShell} from '../member-pages-worker/src/liff-member-shell.js';
import {MY_MMD_LIFF_LV15_CSS} from '../member-pages-worker/src/liff-member-lv15-style.js';
const out='artifacts/my-mmd-lv15-release';
await mkdir(out,{recursive:true});
const html=await handleLiffMemberShell(new Request('https://mmdbkk.com/member/liff?intent=status'),{LINE_LIFF_ID:'2010862595-yT4DCEMc'}).text();
const strip=s=>s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
const clean=strip(html),rows=[],failures=[];
await writeFile(out+'/worker-rendered-inert.html',clean);
await writeFile(out+'/lv15-style.txt',MY_MMD_LIFF_LV15_CSS);
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
async function makePage(width,skin,{signup=false,baseline=false,entered=true}={}){
 const page=await browser.newPage({viewport:{width,height:width===320?740:844},deviceScaleFactor:1,reducedMotion:'reduce'});
 let blocked=0;
 await page.route('**/*',async route=>{blocked++;await route.abort();});
 const markup=signup?strip(await handleLiffMemberShell(new Request('https://mmdbkk.com/member/liff?intent=signup'),{LINE_LIFF_ID:'2010862595-yT4DCEMc'}).text()):clean;
 await page.setContent(baseline?markup.replace(MY_MMD_LIFF_LV15_CSS,''):markup,{waitUntil:'domcontentloaded'});
 if(!signup&&entered)await page.evaluate(skin=>{
  document.body.className='app-entered world-public';
  document.body.dataset.brandAudience=skin;
  const p=document.querySelector('#profile');p?.classList.remove('hidden');if(p)p.hidden=false;
  const brand=document.querySelector('#customer-brand-v6');if(brand)brand.dataset.audience=skin;
  document.querySelectorAll('[data-brand-panel]').forEach(n=>n.hidden=n.dataset.brandPanel!==(skin==='unresolved'?'neutral':skin));
  document.querySelectorAll('.panel').forEach(n=>n.dataset.active=String(n.id==='home'));
  const loader=document.getElementById('hype-loader');if(loader)loader.remove();
  const greeting=document.getElementById('digital-greeting');if(greeting)greeting.textContent='พื้นที่สมาชิกของคุณ';
  const verified=document.getElementById('digital-session');if(verified)verified.textContent='DESIGN QA';
 },skin);
 await page.evaluate(()=>document.fonts.ready);
 await page.waitForTimeout(120);
 const metrics=await page.evaluate(()=>{
  const style=sel=>{const n=document.querySelector(sel);return n?getComputedStyle(n):null;};
  const rect=sel=>{const n=document.querySelector(sel);const r=n?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height}:null;};
  return {width:innerWidth,overflow:Math.max(0,document.documentElement.scrollWidth-innerWidth),bodyBackground:style('body')?.backgroundColor,mainBackground:style('main')?.backgroundColor,quickColumns:style('.digital-quick-grid')?.gridTemplateColumns,dockColumns:style('.digital-dock')?.gridTemplateColumns,dockCount:document.querySelector('.digital-dock')?.children.length,dockButtonHeight:rect('.digital-dock button')?.height,homeDisplay:style('#home')?.display,profileDisplay:style('#profile')?.display,bodyFont:style('body')?.fontFamily,subtitleSize:style('.digital-sub')?.fontSize,top:rect('.digital-top'),brand:rect('#customer-brand-v6'),identity:rect('.digital-top>div:last-child')};
 });
 return {page,metrics,blocked};
}
try{
 for(const width of [320,390,430,1280])for(const skin of ['public','private']){
  const {page,metrics,blocked}=await makePage(width,skin);const issues=[];
  if(metrics.overflow>1)issues.push('horizontal overflow');
  if(metrics.homeDisplay==='none')issues.push('Home missing');
  if(metrics.quickColumns?.split(' ').length!==2)issues.push('LV15 action grid not two columns');
  if(metrics.dockCount!==4)issues.push('dock changed');
  if(metrics.dockButtonHeight<64)issues.push('dock target too small');
  if(metrics.mainBackground!==(skin==='public'?'rgb(246, 241, 232)':'rgb(11, 10, 8)'))issues.push('wrong resolved palette');
  if(metrics.brand&&metrics.identity&&metrics.brand.x+metrics.brand.width>metrics.identity.x+1)issues.push('brand overlaps identity controls');
  await page.screenshot({path:out+'/'+skin+'-'+width+'.png',fullPage:true});
  rows.push({width,skin,metrics,blockedExternalRequests:blocked,issues});if(issues.length)failures.push(rows.at(-1));await page.close();
 }
 for(const spec of [{name:'unresolved',skin:'unresolved',entered:true},{name:'entry',skin:'unresolved',entered:false},{name:'signup',skin:'unresolved',signup:true}]){
  const a=await makePage(390,spec.skin,spec),b=await makePage(390,spec.skin,{...spec,baseline:true});
  for(const key of ['bodyBackground','mainBackground','profileDisplay','bodyFont'])assert.equal(a.metrics[key],b.metrics[key],spec.name+' changed '+key);
  await a.page.screenshot({path:out+'/'+spec.name+'-390.png',fullPage:true});
  rows.push({state:spec.name,unchangedFromBaseline:true,metrics:a.metrics});await a.page.close();await b.page.close();
 }
}finally{
 await browser.close();
 await writeFile(out+'/report.json',JSON.stringify({source:process.env.GITHUB_SHA||'local',cssSha256:createHash('sha256').update(MY_MMD_LIFF_LV15_CSS).digest('hex'),checked:rows.length,failures,rows,fixtureOnly:true,productionWrites:0,physicalLineVerified:false},null,2));
}
assert.equal(failures.length,0,JSON.stringify(failures));
console.log('MY MMD LV15: '+rows.length+' visual/scope checks passed; no production requests.');

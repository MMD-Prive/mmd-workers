import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const out=new URL('./',import.meta.url).pathname,{origin}=JSON.parse(fs.readFileSync(out+'report-outage-browser-server.json'));
const evidence=out+'playwright/report-request-races';fs.mkdirSync(evidence,{recursive:true});
const browser=await chromium.launch({channel:process.env.MMD_BROWSER_CHANNEL||'chrome',headless:true});
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  const original=window.fetch.bind(window);window.fixtureFault={mode:'normal',held:false,aborted:false,delivered:false};
  window.fetch=(url,options={})=>{
   if(!String(url).startsWith('/v1/admin/double-moment/context?'))return original(url,options);
   const f=window.fixtureFault;
   if(f.mode==='timeout')return new Promise((_resolve,reject)=>{options.signal.addEventListener('abort',()=>{f.aborted=true;reject(new DOMException('Synthetic timeout','AbortError'));},{once:true});});
   if(f.mode==='late'){
    f.mode='normal';
    return original(url,{...options,signal:undefined}).then(response=>new Promise(resolve=>{f.held=true;f.release=()=>{f.delivered=true;resolve(response);};}));
   }
   return original(url,options);
  };
 });
 await page.goto(origin);await page.getByRole('button',{name:'เปิดรายงานเปอร์',exact:true}).click();
 const input=page.getByRole('textbox',{name:'รหัสงาน',exact:true}),button=page.getByRole('button',{name:'ตรวจยอด',exact:true});
 const panel=page.locator('section').filter({has:page.getByRole('heading',{name:'ยอดงานล่าสุด',exact:true})});
 await input.fill('sess_dm_checkout');await button.click();await panel.getByText('ตรวจยอดล่าสุดแล้ว',{exact:true}).waitFor();assert.equal(await panel.locator('dd').count(),6);
 await page.evaluate(()=>{window.fixtureFault.mode='timeout';});await button.click();
 assert.equal(await panel.locator('dd').count(),0,'clear old amounts before awaiting response');
 await page.waitForFunction(()=>window.fixtureFault.aborted,{},{timeout:18000});
 await panel.getByText('ยังยืนยันยอดไม่ได้',{exact:true}).waitFor();assert.equal(await button.isEnabled(),true);assert.equal(await panel.locator('dd').count(),0);
 await page.screenshot({path:evidence+'/timeout.png',fullPage:true});
 await page.evaluate(()=>{window.fixtureFault.mode='normal';});await button.click();await panel.getByText('ตรวจยอดล่าสุดแล้ว',{exact:true}).waitFor();
 await page.evaluate(()=>{window.fixtureFault.mode='late';});await button.click();await page.waitForFunction(()=>window.fixtureFault.held);
 await input.fill('sess_other');await button.click();await panel.getByText('ยังยืนยันยอดไม่ได้',{exact:true}).waitFor();
 await page.evaluate(async()=>{window.fixtureFault.release();await new Promise(r=>setTimeout(r,100));});
 assert.equal(await input.inputValue(),'sess_other');assert.equal(await panel.locator('dd').count(),0);assert.equal(await panel.getByRole('status').innerText(),'ยังยืนยันยอดไม่ได้');
 assert.equal(await page.evaluate(()=>window.fixtureFault.delivered),true);assert.equal(await button.isEnabled(),true);
 await page.screenshot({path:evidence+'/late-old-session.png',fullPage:true});
 await input.fill('sess_dm_checkout');await button.click();await panel.getByText('ตรวจยอดล่าสุดแล้ว',{exact:true}).waitFor();assert.match(await panel.innerText(),/6,500/);assert.deepEqual(errors,[]);
 await context.clearCookies();
 const denied=page.waitForResponse(r=>r.url().includes('/v1/admin/double-moment/context?'));
 await button.click();const denial=await denied;assert.equal(denial.status(),401);
 await panel.getByText('ยังยืนยันยอดไม่ได้',{exact:true}).waitFor();assert.equal(await panel.locator('dd').count(),0);
 await page.screenshot({path:evidence+'/session-lost.png',fullPage:true});
 await page.goto(origin);await page.getByRole('button',{name:'เปิดรายงานเปอร์',exact:true}).click();
 await input.fill('sess_dm_checkout');await button.click();await panel.getByText('ตรวจยอดล่าสุดแล้ว',{exact:true}).waitFor();assert.match(await panel.innerText(),/6,500/);
 const result={result:'PASS',cases:['actual 12-second client timeout clears previous money and reenables button','real old Session response delivered despite abort after switching Session is ignored','correct Session can recover afterward','removed owner cookie causes real 401 and clears old DOM amounts','real owner relogin recovers a freshly read balance'],runtime_changes:0,simulation:'Browser transport only; delayed response is from actual local Admin/Payments runtime. No synthetic success body or identity grant. Cookie removal tests missing credentials, not time-based expiry.',production_writes:0};
 fs.writeFileSync(evidence+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}

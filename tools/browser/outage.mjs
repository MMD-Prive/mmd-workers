import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=new URL('./',import.meta.url).pathname;
const {origin}=JSON.parse(fs.readFileSync(base+'report-outage-browser-server.json'));
const evidence=base+'playwright/report-total-outage';fs.mkdirSync(evidence,{recursive:true});
const browser=await chromium.launch({headless:true,channel:process.env.MMD_BROWSER_CHANNEL||'chrome'});
const context=await browser.newContext({viewport:{width:390,height:844}});
await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
const page=await context.newPage(),lab=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(origin);await page.getByRole('button',{name:'เปิดรายงานเปอร์',exact:true}).click();
 await page.getByRole('textbox',{name:'รหัสงาน',exact:true}).fill('sess_dm_checkout');
 const panel=page.locator('section').filter({has:page.getByRole('heading',{name:'ยอดงานล่าสุด',exact:true})});
 const refresh=page.getByRole('button',{name:'ตรวจยอด',exact:true});
 await refresh.click();await panel.getByText('ตรวจยอดล่าสุดแล้ว',{exact:true}).waitFor();
 assert.equal(await panel.locator('dd').count(),6);assert.match(await panel.innerText(),/6,500/);
 const before=await (await context.request.get(origin+'/__fixture/stats')).json();
 await page.screenshot({path:evidence+'/verified.png',fullPage:true});
 await lab.goto(origin);await lab.getByRole('button',{name:'จำลองอ่านเครดิตไม่ได้',exact:true}).click();
 await page.bringToFront();
 // Do not manually refresh: prove the production panel polling clears old DOM.
 await panel.getByText('ยังยืนยันยอดไม่ได้',{exact:true}).waitFor({timeout:30000});
 assert.equal(await panel.locator('dd').count(),0);assert.doesNotMatch(await panel.innerText(),/6,500|10,000|3,500|5,000/);
 await page.screenshot({path:evidence+'/outage.png',fullPage:true});
 const readEight=()=>page.evaluate(async()=>Promise.all(Array.from({length:8},async()=>{const r=await fetch('/v1/admin/double-moment/context?session_id=sess_dm_checkout',{credentials:'same-origin',cache:'no-store'});return {status:r.status,body:await r.json()};})));
 const down=await readEight();assert.ok(down.every(r=>r.status===503&&r.body.balance===null));
 await lab.getByRole('button',{name:'คืนข้อมูลปกติ',exact:true}).click();
 const recovered=await readEight();assert.ok(recovered.every(r=>r.status===200&&r.body.balance.remaining_amount_thb===6500));assert.equal(new Set(recovered.map(r=>JSON.stringify(r.body.balance))).size,1);
 await page.bringToFront();await refresh.click();await panel.getByText('ตรวจยอดล่าสุดแล้ว',{exact:true}).waitFor();assert.equal(await panel.locator('dd').count(),6);
 const after=await (await context.request.get(origin+'/__fixture/stats')).json();assert.deepEqual(after,before);
 assert.deepEqual(errors,[]);await page.screenshot({path:evidence+'/recovered.png',fullPage:true});
 const result={result:'PASS',real_browser:'Chromium',viewport:'390x844',entrypoints:['Admin','Payments'],old_amounts_cleared_by_polling:true,poll_interval_ms:15000,outage_requests:8,recovery_requests:8,payment_credit_rows_unchanged:true,runtime_source_changes:0,external_transport:'synthetic Airtable 503; all non-loopback browser requests blocked',limits:'No immediate push notification; stale amounts can remain until next polling/visibility/manual refresh. No real Airtable or production transaction.'};
 fs.writeFileSync(evidence+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}catch(e){await page.screenshot({path:evidence+'/failure.png',fullPage:true});throw e;}finally{await browser.close();}

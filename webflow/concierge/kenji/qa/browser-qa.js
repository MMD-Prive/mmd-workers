async (page) => {
  const capture=async options=>{await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot(options)};
  const checks=[];const check=(value,label)=>{if(!value)throw new Error(label);checks.push(label)};
  const liffProfile=(points=1234,fields={})=>({ok:true,data:{display_name:'QA Member',tier:'Premium',membership_status:'active',membership_expires_at:'2027-01-01',...fields,points,points_policy:'lot_365d_from_entry',customer_360:{points:{status:points===null?'checking':'verified',active_points:points,expiry_policy:'lot_365d_from_entry'}}}});
  const profileBody=liffProfile();
  let profile={status:200,body:profileBody},chat={status:200,body:{ok:true,reply:'Legacy balance 61,320 แต้ม',intent:'points_status',action:{label:'เปิด Points',url:'/my-mmd/points'}}},posts=[];
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/member/api/liff/profile',async route=>{const current=profile;if(current.delay)await page.waitForTimeout(current.delay);await route.fulfill({status:current.status,contentType:'application/json',body:JSON.stringify(current.body)})});
  await page.route('**/api/member/kenji/chat',async route=>{posts.push(route.request().postDataJSON());const current=chat;if(current.delay)await page.waitForTimeout(current.delay);if(current.abort)return route.abort();await route.fulfill({status:current.status,contentType:'application/json',body:current.raw??JSON.stringify(current.body)})});
  const root=page.locator('#kenji-concierge-v3'),input=page.locator('#kj3-input'),send=root.locator('[data-kj3-send]'),feedback=root.locator('[data-kj3-chat-status]');
  const ready=async()=>{await page.waitForFunction(()=>document.querySelector('#kenji-concierge-v3').dataset.memberMode==='active')};
  for(const width of [320,375,390,430,1440]){
    await page.setViewportSize({width,height:width===1440?1000:844});await page.goto('http://127.0.0.1:8765/concierge/kenji?t=QA_ONLY#kj3-overview');await ready();
    check((await root.locator('[data-kj3-tier]').textContent())==='Premium',`flat LIFF tier at ${width}`);
    check((await root.locator('[data-kj3-expiry]').textContent())!=='—',`flat LIFF expiry at ${width}`);
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`no horizontal overflow at ${width}`);
    check(await input.evaluate(el=>getComputedStyle(el).fontSize)==='16px',`16px input at ${width}`);
    const targets=await root.locator('button,a,summary').evaluateAll(nodes=>nodes.filter(el=>el.getBoundingClientRect().width>0&&!el.classList.contains('kj3-skip')).map(el=>el.getBoundingClientRect().height));check(targets.every(h=>h>=44),`44px targets at ${width}`);
    check(await root.evaluate(el=>el.getBoundingClientRect().height)<(width===1440?950:1100),`compact page height at ${width}`);
    if(width===1440)await root.locator('.kj3-portrait').waitFor();
    await capture({path:`output/playwright/kenji-${width}.png`,fullPage:true});
  }
  await page.setViewportSize({width:390,height:844});await page.goto('http://127.0.0.1:8765/concierge/kenji?t=QA_ONLY');await ready();
  await page.getByRole('button',{name:'ดูโปรโมชั่น'}).click();check((await input.inputValue()).includes('โปรโมชั่นทั่วไปที่ระบบยืนยันแล้ว'),'confirmed general promo prompt only');
  await page.getByRole('button',{name:'ต่ออายุสมาชิก'}).click();check((await input.inputValue()).includes('วันหมดอายุ'),'expiry and renewal prompt');
  await page.getByRole('button',{name:'เช็ก Points'}).click();check(posts.length===0,'quick prompt prepares text without sending');
  check((await input.inputValue()).includes('Points'),'points prompt');
  chat.delay=400;await send.dblclick();await page.waitForFunction(()=>!document.querySelector('[data-kj3-send]').disabled);
  check(posts.length===1,'duplicate clicks send exactly once');check(Object.keys(posts[0]).join(',')==='message','request is existing message contract only');
  check((await root.locator('[data-kj3-messages]').textContent()).includes('1,234'),'guarded1234 replaces raw61320 reply');check((await input.inputValue())==='','success clears submitted input');
  check((await root.locator('.kj3-message a').getAttribute('href'))==='/my-mmd/points','backend action preserved');
  await capture({path:'output/playwright/kenji-chat-390.png',fullPage:true});
  await input.fill('อยากคุยต่อครับ');await input.press('Enter');check(posts.length===1,'Enter adds newline, no implicit send');
  await input.press('Tab');check((await page.evaluate(()=>document.activeElement.textContent)).includes('ส่งข้อความ'),'keyboard reaches send');
  chat={status:503,body:{ok:false}};await send.click();await page.waitForFunction(()=>!document.querySelector('[data-kj3-send]').disabled);check((await input.inputValue()).includes('คุยต่อ'),'failed response retains draft');check((await feedback.textContent()).includes('ยังรับคำตอบไม่ได้'),'503 honest error');
  chat={status:200,raw:'not json'};await send.click();await page.waitForFunction(()=>!document.querySelector('[data-kj3-send]').disabled);check((await feedback.textContent()).includes('ยังรับคำตอบไม่ได้'),'malformed reply never success');
  chat={abort:true};await send.click();await page.waitForFunction(()=>!document.querySelector('[data-kj3-send]').disabled);check((await feedback.textContent()).includes('ยังไม่ยืนยันการรับ'),'network error no sent claim');
  await capture({path:'output/playwright/kenji-chat-error.png',fullPage:true});
  chat={status:409,body:{ok:false,error:'conflict'}};await send.click();await page.waitForFunction(()=>!document.querySelector('[data-kj3-send]').disabled);check((await feedback.textContent()).includes('รายการซ้ำ'),'409 no automatic retry');
  chat={status:423,body:{ok:false,error:'owner_takeover'}};await send.click();await page.waitForFunction(()=>document.querySelector('[data-kj3-chat-status]').textContent.includes('MMD กำลังดูแล'));
  check(await send.isDisabled(),'server takeover stops sends');const count=posts.length;await root.locator('[data-kj3-form]').evaluate(form=>form.requestSubmit());check(posts.length===count,'takeover cannot be bypassed by form submit');
  await capture({path:'output/playwright/kenji-takeover.png',fullPage:true});
  await page.reload();await ready();chat={status:401,body:{ok:false,error:'member_session_required'}};await input.fill('QA session expiry');await send.click();await page.waitForFunction(()=>document.querySelector('#kenji-concierge-v3').dataset.memberMode==='guest');
  check(await send.isDisabled(),'expired session blocks sends');check((await input.inputValue())==='','expiry clears private draft');check((await root.locator('[data-kj3-messages]').textContent()).includes('ยังไม่มีบทสนทนา'),'expiry clears transcript');check((await root.locator('[data-kj3-points]').textContent())==='ยังไม่ยืนยัน','expiry clears balance');
  check((await root.locator('[data-kj3-login]').getAttribute('href'))==='/member/my-mmd?t=QA_ONLY','existing verification token handoff');
  for(const [mode,status,body] of [['guest',401,{ok:false}],['error',503,{ok:false}],['pending',200,liffProfile(null,{actual_access:'pending'})],['blocked',200,liffProfile(null,{actual_access:'blocked'})],['expired',200,liffProfile(null,{membership_status:'expired',membership_expires_at:'2026-01-01'})],['unknown',200,{ok:true}],['active',200,liffProfile(null)]]){
    profile={status,body};await root.locator('[data-kj3-retry]').click();await page.waitForFunction(mode=>document.querySelector('#kenji-concierge-v3').dataset.memberMode===mode,mode);
    check((await root.locator('[data-kj3-points]').textContent())==='ยังไม่ยืนยัน',`${mode} unknown points`);await capture({path:`output/playwright/kenji-state-${mode}.png`,fullPage:true});
  }
  chat={status:200,body:{ok:true,reply:'Points 0 แต้ม',intent:'points_status'}};await input.fill('เช็ก Points');await send.click();await page.waitForFunction(()=>!document.querySelector('[data-kj3-send]').disabled);check((await root.locator('.kj3-message[data-role=kenji]').last().textContent()).includes('ยังยืนยันยอด Points ไม่ได้'),'unknown points cannot become a zero in reply');
  profile={status:200,delay:300,body:liffProfile(0)};await root.locator('[data-kj3-retry]').click();check(await root.locator('[data-kj3-status-card]').getAttribute('aria-busy')==='true','loading busy state');check((await root.locator('[data-kj3-points]').textContent())==='ยังไม่ยืนยัน','loading clears prior balance');await ready();check((await root.locator('[data-kj3-points]').textContent())==='0','verified zero is zero');
  await input.fill('ก'.repeat(800));check((await root.locator('[data-kj3-count]').textContent())==='800 / 800','800-char Thai input');await page.setViewportSize({width:320,height:440});await input.focus();check((await input.boundingBox()).width<=288,'keyboard-size viewport input fits');
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));check(await root.locator('[data-kj3-status-card]').evaluate(el=>Math.abs(el.getBoundingClientRect().top)<1),'status persists while scrolling');
  await page.setViewportSize({width:390,height:844});profile={status:200,body:profileBody};await page.goto('http://127.0.0.1:8765/concierge/kenji?t=QA_ONLY#kj3-faq');await ready();check(page.url().includes('t=QA_ONLY#kj3-faq'),'query and historical anchor preserved');await page.goto('http://127.0.0.1:8765/concierge/kenji?t=QA_ONLY#kj3-care');await page.goBack();check(page.url().endsWith('#kj3-faq'),'back anchor');await page.goForward();check(page.url().endsWith('#kj3-care'),'forward anchor');
  await page.reload();await ready();check((await root.locator('[data-kj3-messages]').textContent()).includes('ยังไม่มีบทสนทนา'),'reload no fabricated history');
  for(const balance of [2222,null,0,-5]){
    profile={status:200,body:profileBody};await page.reload();await ready();
    profile={status:200,body:liffProfile(balance)};
    chat={status:200,body:{ok:true,reply:'QA Member · Points 61,320 แต้ม',intent:'points_status'}};
    await input.fill('เช็ก Points');await send.click();await page.waitForFunction(()=>!document.querySelector('[data-kj3-send]').disabled);
    const shown=await root.locator('.kj3-message[data-role=kenji]').last().textContent();
    check(!shown.includes('61,320'),'raw reply discarded for fresh '+balance);
    check(balance===null||balance<0?shown.includes('ยังยืนยันยอด Points ไม่ได้'):shown.includes(balance===0?'0 แต้ม':'2,222 แต้ม'),'fresh guarded reply '+balance);
    check((await root.locator('[data-kj3-points]').textContent())===(balance===null||balance<0?'ยังไม่ยืนยัน':balance===0?'0':'2,222'),'status and reply same authority '+balance);
    if(balance===2222)await capture({path:'output/playwright/kenji-points-authority.png',fullPage:true});
  }
  profile={status:200,body:profileBody};await page.reload();await ready();profile={status:401,body:{ok:false}};
  await input.fill('เช็ก Points');await send.click();await page.waitForFunction(()=>document.querySelector('#kenji-concierge-v3').dataset.memberMode==='guest');
  check(!(await root.locator('[data-kj3-messages]').textContent()).includes('61,320'),'lost session during fresh Points read discards reply');
  check((await root.locator('[data-kj3-points]').textContent())==='ยังไม่ยืนยัน','fresh401 clears guarded points');
  await page.emulateMedia({reducedMotion:'reduce'});check(await input.evaluate(el=>getComputedStyle(el).transitionDuration)==='0s','reduced motion');
  check(errors.length===0,'no JavaScript errors');return {checks:checks.length,passed:checks,chatRequests:posts.length,errors};
}

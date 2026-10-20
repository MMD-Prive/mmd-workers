import { ROOT, LIFF, VERIFY_RUNTIME } from './mms-partner-line-verification.mjs';
// Function.toString() crosses the Worker/browser boundary. keepNames builds
// insert __name calls into nested functions; the browser needs its own helper.
// Keep this as source text so the build cannot hoist it back into Worker scope.
const BROWSER_HELPERS='const __name=(fn,name)=>Object.defineProperty(fn,"name",{value:name,configurable:true});';

export const CSS = `#mms-partner-verify{display:block!important;min-height:100svh;background:#0b1812;color:#f6f7f0;padding:20px 16px;font-family:"LINE Seed Sans TH","Noto Sans Thai",sans-serif}#mms-partner-verify *{box-sizing:border-box}#mms-partner-verify .mms-v-card{max-width:500px;margin:0 auto;padding:20px;border:1px solid #344c3b;border-radius:24px;background:#15251b}#mms-partner-verify h1{font-size:28px;line-height:1.4;color:#fff;margin:16px 0 8px}#mms-partner-verify h2{font-size:19px;color:#fff}#mms-partner-verify p{line-height:1.7;color:#c6d4c8}#mms-partner-verify label{display:block;margin-top:16px;color:#fff}#mms-partner-verify select,#mms-partner-verify button{width:100%;min-height:48px;font:inherit;border-radius:12px;padding:12px;margin-top:10px}#mms-partner-verify select{background:#22372a;color:#fff;border:1px solid #68826b}#mms-partner-verify button{background:#c4ea67;color:#17251a;border:0;font-weight:700;cursor:pointer}#mms-partner-verify button:disabled{opacity:.5;cursor:default}#mms-partner-verify input{width:20px;height:20px;vertical-align:middle;margin-right:8px}#mms-partner-verify details{margin-top:20px;color:#c6d4c8;line-height:1.7}#mms-partner-verify a{color:#d7ed9d}#mms-partner-verify [role=status]{padding:12px;border-radius:12px;background:#263b2a;white-space:pre-wrap}#mms-partner-verify img{width:130px;height:48px;object-fit:contain}#mms-partner-verify .request{border-top:1px solid #52644f;margin-top:16px;padding-top:12px}#mms-partner-verify .steps{font-size:13px;color:#d7ed9d;margin:16px 0}`;
const LOGO='https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a8605ce469f1080c3c57ebe_mms-logo-horizontal-light.svg';
export const SHOP_BRANDS = Object.freeze({
  kalima: {name:'Kalima Massage',logo:'https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6ad731cd4240202ece7d89ec_mms-partner-kalima-approved-logo.png',background:'#fff'},
  relax: {name:'Relax Spa by 9',logo:'https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6ad731cffb651231fddc2300_mms-partner-relax-spa-by-9-approved-logo.png',background:'#efe5d0'},
});
const SHOP_CSS = '#mms-partner-verify .shop-brand{display:flex;align-items:center;gap:14px;margin:16px 0;padding:14px;border:1px solid rgba(217,189,120,.36);border-radius:20px;background:linear-gradient(120deg,rgba(217,189,120,.1),rgba(20,35,28,.9))}#mms-partner-verify .shop-brand img{width:78px;height:78px;flex:none;object-fit:contain;border-radius:15px;padding:4px}#mms-partner-verify .shop-brand p{margin:0 0 4px;color:#d9bd78!important;font-size:10px}#mms-partner-verify .shop-brand strong{display:block;color:#f6f8f2!important;font-size:19px;line-height:1.35}#mms-partner-verify .shop-brand small{display:block;margin-top:5px;font-size:11px;color:#a9b7ac!important}';
export function partnerApp() {
  const root=document.getElementById('mms-partner-verify');if(!root)return;
  const api='/v1/admin/mms/partner-line';
  // Match the Published endpoint exactly; do not derive a LINE callback from
  // the incoming host, callback parameters, or another app's return URL.
  const verifyEndpoint='https://www.mmdbkk.com/male-massage/partner/verify';
  root.dataset.verifyRuntime=RUNTIME_VERSION;
  const style=document.createElement('style');style.textContent=STYLE;document.head.append(style);
  root.innerHTML='<div class="mms-v-card"><img alt="MMS · Male Massage"><p>MMS PARTNER</p><h1>ยืนยันบัญชีร้าน</h1><p>เลือกร้านที่คุณดูแล แล้วยืนยันด้วย LINE เปอร์จะตรวจคำขอให้ก่อนเปิดสิทธิ์ของร้านนั้น</p><div class="steps">1 เลือกร้าน → 2 ยืนยัน LINE → 3 รออนุมัติ</div><label for="mms-shop">ร้านที่ขอเชื่อมบัญชี</label><select id="mms-shop"><option value="kalima">Kalima Massage</option><option value="relax">Relax Spa by 9</option></select><label><input id="mms-consent" type="checkbox">ยินยอมให้ใช้ตัวตน LINE เพื่อขอเชื่อมบัญชีกับร้านที่เลือก</label><button id="mms-line-button" disabled>กำลังเตรียม LINE…</button><button id="mms-status-button" hidden>เช็กผลอนุมัติ</button><p role="status" id="mms-line-status">กำลังเชื่อมต่อ…</p><details><summary>ข้อมูลและสิทธิ์ของคุณ</summary><p>เก็บรหัสอ้างอิงตัวตนแบบแฮช ไม่เก็บรหัสผ่านหรือ LINE ID ที่พิมพ์เอง การยืนยัน LINE ยังไม่ให้สิทธิ์ร้าน การอนุมัติ Kalima และ Relax Spa แยกจากกัน หากดูแลสองร้าน ให้ส่งคำขอทีละร้าน</p></details></div>';
  root.querySelector('img').src=LOGO_URL;
  const shop=root.querySelector('#mms-shop'),consent=root.querySelector('#mms-consent'),button=root.querySelector('#mms-line-button'),statusButton=root.querySelector('#mms-status-button'),status=root.querySelector('#mms-line-status');
  const query=new URLSearchParams(location.search),state=query.get('liff.state');let preferred=query.get('shop');if(!preferred&&state){try{preferred=new URL(state,location.origin).searchParams.get('shop');}catch{}}
  // Observe only fixed route/phase flags, never store or log callback contents.
  let stateShop=null;try{if(state)stateShop=new URL(state,location.origin).searchParams.get('shop');}catch{}
  let shopConflict=Boolean((query.has('shop')&&!['kalima','relax'].includes(query.get('shop')))||(stateShop&&!['kalima','relax'].includes(stateShop))||(query.get('shop')&&stateShop&&query.get('shop')!==stateShop));
  const returned=Boolean(state||query.has('liffClientId')||query.has('liffRedirectUri')||query.has('code'));
  if(['kalima','relax'].includes(preferred))shop.value=preferred;
  const shopCard=document.createElement('section');shopCard.className='shop-brand';
  shopCard.innerHTML='<img width="78" height="78"><div><p>ร้านที่คุณดูแล</p><strong></strong><small>ยืนยันสิทธิ์เฉพาะร้านนี้ผ่าน MMS</small></div>';
  root.querySelector('h1').before(shopCard);
  function updateShopBrand(){
    const brand=SHOP_BRANDS_UI[shop.value];
    if(!Object.hasOwn(SHOP_BRANDS_UI,shop.value)){shopCard.hidden=true;return;}
    const image=shopCard.querySelector('img');image.src=brand.logo;image.alt=brand.name;image.style.background=brand.background;
    shopCard.querySelector('strong').textContent=brand.name;shopCard.setAttribute('aria-label','ร้าน '+brand.name);shopCard.dataset.shop=shop.value;shopCard.hidden=false;
  }
  updateShopBrand();
  // Remember only the user's explicit submit intent across LINE login. Never
  // persist a token, LINE identity, account ID or an authorization decision.
  const intentKey='mms_partner_submit_intent_v1';
  function clearIntent(){try{sessionStorage.removeItem(intentKey);}catch{}}
  function rememberIntent(){try{sessionStorage.setItem(intentKey,JSON.stringify({shop_key:shop.value,at:Date.now()}));}catch{}}
  function pendingIntent(){try{const value=JSON.parse(sessionStorage.getItem(intentKey)||'null');if(value&&value.shop_key===shop.value&&Number.isFinite(value.at)&&value.at<=Date.now()&&Date.now()-value.at<15*60*1000)return value;}catch{}clearIntent();return null;}
  let ready=false,busy=false,outdated=false,identityBlocked=false;
  function enable(){button.disabled=!ready||busy||outdated||identityBlocked;shop.disabled=busy;consent.disabled=busy||outdated||identityBlocked;statusButton.disabled=busy||outdated||identityBlocked;}
  const reloadButton=document.createElement('button');reloadButton.textContent='โหลดหน้า Verify ใหม่';reloadButton.hidden=true;
  reloadButton.onclick=()=>{clearIntent();location.href=verifyEndpoint+'?shop='+shop.value+'&verify_version='+RUNTIME_VERSION;};
  root.querySelector('.mms-v-card').append(reloadButton);
  const versionLabel=document.createElement('small');versionLabel.textContent='Verify · '+RUNTIME_VERSION;root.querySelector('.mms-v-card').append(versionLabel);
  const errors={LINE_OPENID_SCOPE_MISSING:'LINE ของหน้านี้ยังไม่ได้เปิดสิทธิ์ยืนยันตัวตน ยังไม่ได้ส่งคำขอ กรุณารอเปอร์ตั้งค่าให้เรียบร้อยครับ',LINE_OPENID_CONSENT_REQUIRED:'LINE ยังไม่ได้รับความยินยอมให้ยืนยันตัวตน ยังไม่ได้ส่งคำขอ กรุณาติดต่อเปอร์ครับ',LINE_SESSION_INCOMPLETE:'เข้า LINE แล้ว แต่ยังไม่ได้หลักฐานยืนยันตัวตน ยังไม่ได้ส่งคำขอ กรุณาติดต่อเปอร์ครับ',VERIFY_UPDATE_REQUIRED:'หน้านี้เป็นรุ่นเก่า กดโหลดหน้า Verify ใหม่ แล้วติ๊กยินยอมอีกครั้งครับ',VERIFY_VERSION_UNAVAILABLE:'ยังตรวจรุ่นหน้าไม่ได้ ยังไม่ได้ส่งคำขอ ลองใหม่ภายหลังครับ',SHOP_SCOPE_DENIED:'ข้อมูลร้านจากลิงก์ไม่ตรงกัน เลือกร้านที่ต้องการอีกครั้งก่อนส่งคำขอครับ',CONSENT_REQUIRED:'กรุณาติ๊กยินยอมก่อนส่งคำขอ',LINE_TOKEN_INVALID:'LINE หมดอายุแล้ว กรุณาเปิดหน้านี้ผ่าน LINE ใหม่',LINE_TOKEN_REQUIRED:'กรุณาเปิดผ่าน LINE แล้วยืนยันอีกครั้ง',REGISTRY_WRITE_UNAVAILABLE:'บันทึกยังไม่สำเร็จ ลองใหม่ได้โดยไม่ต้องสมัครซ้ำ',ACCOUNT_DENIED:'บัญชีนี้ยังใช้งานไม่ได้ ติดต่อเปอร์เพื่อตรวจสอบ',SHOP_BLOCKED:'ร้านนี้หยุดรับคำขอชั่วคราว'};
  // Fixed vocabulary only. Never send exception text, URLs or LINE identity.
  const diagnosticStatus=document.createElement('p');diagnosticStatus.id='mms-diagnostic-status';diagnosticStatus.setAttribute('role','status');root.querySelector('.mms-v-card').append(diagnosticStatus);
  let diagnosticSequence=0;
  async function note(stage,code='OK'){
    const sequence=++diagnosticSequence,key=shop.value;
    if(shopConflict){diagnosticStatus.textContent='ข้อมูลร้านจากลิงก์ไม่ตรงกัน · ยังไม่บันทึกจุดตรวจ';return false;}
    const allowed=['LINE_OPENID_SCOPE_MISSING','LINE_OPENID_CONSENT_REQUIRED','LINE_SESSION_INCOMPLETE','OK','NETWORK_ERROR','SDK_ERROR','LINE_TOKEN_REQUIRED','LINE_TOKEN_INVALID','REGISTRY_WRITE_UNAVAILABLE','REGISTRY_UNAVAILABLE','REGISTRY_CONFLICT','REGISTRY_INCOMPLETE','SHOP_IDENTITY_CONFLICT','SHOP_BLOCKED','PARTNER_STORE_UNAVAILABLE','ACCOUNT_DENIED','CLAIM_CONFLICT'];
    diagnosticStatus.textContent='กำลังบันทึกจุดตรวจ · '+stage;
    try{
      const r=await fetch(api+'/event',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({shop_key:key,stage,code:code==='VERIFY_RUNTIME_V5'||allowed.includes(code)?code:'UNEXPECTED'}),credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',keepalive:true,signal:AbortSignal.timeout(4000)});
      const p=await r.json();
      if(!r.ok||p.ok!==true||p.shop_key!==key||p.stage!==stage)throw Error('DIAGNOSTICS_UNAVAILABLE');
      if(sequence===diagnosticSequence&&key===shop.value)diagnosticStatus.textContent='บันทึกจุดตรวจแล้ว · '+(key==='kalima'?'Kalima':'Relax Spa')+' · '+stage+' · ไม่ใช่การส่งคำขอ';
      return true;
    }catch{
      if(sequence===diagnosticSequence&&key===shop.value)diagnosticStatus.textContent='ยังยืนยันการบันทึกจุดตรวจไม่ได้ · '+stage+' · ไม่ได้หมายความว่าส่งคำขอแล้ว';
      return false;
    }
  }
  void note('client_ready','VERIFY_RUNTIME_V5');
  if(returned)note('client_return_detected');
  if(shopConflict){clearIntent();note('client_return_shop_conflict');}
  async function currentVersion(){
    let p;try{const r=await fetch(api+'/config',{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});p=await r.json();if(!r.ok||!p.ok)throw Error();}catch{note('client_version_unavailable','NETWORK_ERROR');throw Error('VERIFY_VERSION_UNAVAILABLE');}
    if(p.verify_runtime!==RUNTIME_VERSION||p.liff_id!==LIFF_ID){outdated=true;clearIntent();reloadButton.hidden=false;enable();note('client_update_required');throw Error('VERIFY_UPDATE_REQUIRED');}
  }
  async function requireOpenId({beforeLogin=false}={}){
    let permission;
    // Read scope only. Never retain or log the context object or user profile.
    try{const scopes=window.liff.getContext?.()?.scope;if(Array.isArray(scopes)&&!scopes.includes('openid'))permission='unavailable';}catch{}
    if(!permission&&typeof window.liff.permission?.query==='function'){try{permission=(await window.liff.permission.query('openid'))?.state;}catch{}}
    // "prompt" is not a missing channel scope. A signed-out person must be
    // able to reach LINE's own consent screen after their explicit click.
    // This never permits status/request calls without a verified ID token.
    if(permission==='prompt'&&beforeLogin&&!window.liff.isLoggedIn())return permission;
    if(permission==='unavailable'||permission==='prompt'){
      identityBlocked=true;clearIntent();
      const missing=permission==='unavailable',code=missing?'LINE_OPENID_SCOPE_MISSING':'LINE_OPENID_CONSENT_REQUIRED';
      note(missing?'client_openid_unavailable':'client_openid_consent_required',code);throw Error(code);
    }
    return permission;
  }
  async function send(path){try{const permission=await requireOpenId(),idToken=window.liff.getIDToken();if(!idToken){const code=permission==='granted'?'LINE_SESSION_INCOMPLETE':'LINE_TOKEN_REQUIRED';note('client_token_missing',code);throw new Error(code);}const r=await fetch(api+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id_token:idToken,shop_key:shop.value,consent:consent.checked}),cache:'no-store'});const p=await r.json();if(!r.ok||!p.ok)throw new Error(p.error||'VERIFICATION_UNAVAILABLE');if(path==='/request')note('client_claim_saved');return p;}catch(e){note(path==='/request'?'client_request_failed':'client_status_failed',e instanceof TypeError?'NETWORK_ERROR':e.message);throw e;}}
  function show(p){const c=p.claim;if(!c){status.textContent='ยังไม่ได้ส่งคำขอสำหรับร้านนี้';return;}if(c.shop_key!==shop.value)throw new Error('SHOP_SCOPE_DENIED');const label=c.status==='Approved'?'อนุมัติบัญชีสำหรับร้านนี้แล้ว':c.status==='Rejected'?'คำขอนี้ยังไม่ผ่าน ติดต่อเปอร์เพื่อตรวจสอบ':'ยืนยัน LINE แล้ว · รอเปอร์ตรวจคำขอ';status.textContent=c.shop_name+'\n'+label+'\nเลขคำขอ '+c.claim_id;statusButton.hidden=false;}
  async function run(fn){busy=true;enable();try{await fn();}catch(e){status.textContent=errors[e.message]||'ยังทำรายการไม่สำเร็จ กรุณาลองใหม่ หรือติดต่อเปอร์';}finally{busy=false;enable();}}
  button.addEventListener('click',()=>run(async()=>{if(shopConflict)throw Error('SHOP_SCOPE_DENIED');if(!consent.checked)throw new Error('CONSENT_REQUIRED');await currentVersion();await requireOpenId({beforeLogin:true});if(!window.liff.isLoggedIn()){rememberIntent();status.textContent='กำลังเปิด LINE หลังยืนยันแล้วจะส่งคำขอเฉพาะร้านที่เลือกไว้';await note('client_login_redirect');window.liff.login({redirectUri:verifyEndpoint+'?shop='+shop.value+'&verify_version='+RUNTIME_VERSION});return;}clearIntent();status.textContent='กำลังบันทึกคำขอของร้านนี้ ยังไม่ต้องปิดหน้านี้';show(await send('/request'));}));
  statusButton.addEventListener('click',()=>run(async()=>{await currentVersion();show(await send('/status'));}));
  shop.addEventListener('change',()=>{clearIntent();shopConflict=false;diagnosticSequence++;diagnosticStatus.textContent='เลือกร้านใหม่แล้ว · ยังไม่ได้บันทึกจุดตรวจของร้านนี้';consent.checked=false;updateShopBrand();status.textContent='กำลังเลือก '+shop.options[shop.selectedIndex].text+' · สิทธิ์แต่ละร้านอนุมัติแยกกัน';statusButton.hidden=true;});
  window.addEventListener('pageshow',event=>{if(event.persisted){clearIntent();consent.checked=false;note('client_restored_page');if(!busy)run(async()=>{await currentVersion();status.textContent='กลับมาที่หน้านี้แล้ว ยังไม่ได้ส่งคำขอใหม่ · เลือกร้านและติ๊กยินยอมก่อนครับ';});}});
  async function init(){if(window.mmsVerifyPageCheck)await window.mmsVerifyPageCheck;if(!window.liff){await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://static.line-scdn.net/liff/edge/2/sdk.js';s.onload=resolve;s.onerror=reject;document.head.append(s);});}await window.liff.init({liffId:LIFF_ID});ready=true;button.textContent=window.liff.isLoggedIn()?'ส่งคำขอเชื่อมร้านนี้':'ยืนยัน LINE และส่งคำขอร้านนี้';status.textContent='เลือกร้านและติ๊กยินยอมก่อนส่งคำขอครับ';enable();await run(async()=>{
    await requireOpenId({beforeLogin:true});if(!window.liff.isLoggedIn())return;
    await currentVersion();if(shopConflict)throw Error('SHOP_SCOPE_DENIED');
    note('client_logged_in');const resume=pendingIntent();
    // Consume once before any network call. Reloads cannot replay a submission.
    clearIntent();
    if(resume)consent.checked=true;
    const existing=await send('/status');
    if(existing.claim){show(existing);return;}
    if(resume){status.textContent='ยืนยัน LINE แล้ว กำลังบันทึกคำขอของร้านนี้';show(await send('/request'));}
    else {if(returned)note('client_return_no_intent');status.textContent='เข้า LINE แล้ว แต่ยังไม่ได้ส่งคำขอร้านนี้ · ติ๊กยินยอมแล้วกดส่งคำขอเชื่อมร้านนี้ครับ';}
  });}
  init().catch(()=>{note('client_sdk_failed','SDK_ERROR');status.textContent='เปิดผ่านลิงก์ MMS Partner ใน LINE เพื่อเริ่มยืนยัน';button.textContent='เปิด MMS Partner ใน LINE';button.disabled=false;button.onclick=()=>{location.href='https://miniapp.line.me/'+LIFF_ID+'?shop='+shop.value;};});
}
export const APP_JS=`(()=>{${BROWSER_HELPERS}const STYLE=${JSON.stringify(CSS+SHOP_CSS)},LOGO_URL=${JSON.stringify(LOGO)},LIFF_ID=${JSON.stringify(LIFF)},RUNTIME_VERSION=${JSON.stringify(VERIFY_RUNTIME)},SHOP_BRANDS_UI=${JSON.stringify(SHOP_BRANDS)};(${partnerApp.toString()})();})();`;
export function ownerApp(){
  const api='/v1/admin/mms/partner-line',root=document.getElementById('mms-partner-verify'),list=document.getElementById('requests'),select=document.getElementById('shop'),status=document.getElementById('owner-status');let busy=false;
  async function load(){if(busy)return;busy=true;select.disabled=true;list.replaceChildren();try{const r=await fetch(api+'/requests?shop='+select.value,{cache:'no-store'}),p=await r.json();if(!r.ok||!p.ok||p.shop_key!==select.value)throw Error(p.error||'UNAVAILABLE');status.textContent=p.shop_name+(p.identity_verified?' · ข้อมูลร้านผ่านการตรวจแล้ว':' · รหัสร้านและตัวตนร้านยังรอ Owner ยืนยันในทะเบียน ก่อนอนุมัติบัญชี');for(const c of p.claims){const card=document.createElement('div');card.className='request';const text=document.createElement('p');text.textContent=c.account_key+'\n'+c.claim_id+'\n'+c.status;card.append(text);if(c.status==='Pending Owner Review')for(const decision of ['approve','reject']){const btn=document.createElement('button');btn.textContent=decision==='approve'?'อนุมัติเฉพาะร้านนี้':'ไม่อนุมัติ';btn.disabled=decision==='approve'&&!p.identity_verified;btn.onclick=async()=>{if(busy)return;busy=true;select.disabled=true;root.querySelectorAll('button').forEach(b=>b.disabled=true);try{const res=await fetch(api+'/review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({shop_key:select.value,claim_id:c.claim_id,decision})}),body=await res.json();if(!res.ok||!body.ok)throw Error(body.error||'UNAVAILABLE');}catch(e){status.textContent='ยังบันทึกไม่ได้: '+e.message;return;}finally{busy=false;select.disabled=false;}await load();};card.append(btn);}list.append(card);}if(!p.claims.length){const empty=document.createElement('p');empty.textContent='ยังไม่มีคำขอสำหรับร้านนี้';list.append(empty);}}catch(e){status.textContent='เปิดด้วยบัญชี Owner เพื่อดูคำขอ: '+e.message;}finally{busy=false;select.disabled=false;}}
  const diagnosticList=document.getElementById('diagnostic-events'),diagnosticStatus=document.getElementById('diagnostic-status'),refresh=document.getElementById('diagnostic-refresh'),check=document.getElementById('diagnostic-check');let checking=false;
  async function diagnostics(selfTest=false){if(checking||busy)return;checking=true;const key=select.value;refresh.disabled=true;check.disabled=true;select.disabled=true;diagnosticList.replaceChildren();try{
    if(selfTest){const r=await fetch(api+'/diagnostics/check',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({shop_key:key}),cache:'no-store'});if(!r.ok||!(await r.json()).ok)throw Error();}
    const r=await fetch(api+'/diagnostics?shop='+key,{cache:'no-store'}),p=await r.json();if(!r.ok||!p.ok||p.shop_key!==key)throw Error();
    diagnosticStatus.textContent=(key==='kalima'?'Kalima Massage':'Relax Spa by 9')+' · '+p.events.length+' จุดตรวจ · แสดงย้อนหลังไม่เกิน 24 ชั่วโมง';
    for(const event of p.events.slice().reverse()){const line=document.createElement('p');line.textContent=new Date(event.at).toLocaleString('th-TH')+' · '+(event.stage.startsWith('client_')?'เบราว์เซอร์รายงาน':'เซิร์ฟเวอร์')+' · '+event.stage+' · '+event.code;diagnosticList.append(line);}
    if(!p.events.length)diagnosticStatus.textContent+=' · ยังไม่มีบันทึก';
  }catch{diagnosticStatus.textContent='ยังอ่านบันทึกไม่ได้ กรุณาตรวจด้วยบัญชี Owner';}finally{checking=false;refresh.disabled=false;check.disabled=false;select.disabled=busy;}}
  refresh.onclick=()=>diagnostics();check.onclick=()=>diagnostics(true);
  select.onchange=()=>{if(checking)return;diagnosticList.replaceChildren();diagnosticStatus.textContent='กดอ่านจุดตรวจของร้านที่เลือก';load();};load();
}
export const OWNER_HTML=`<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>MMS · อนุมัติบัญชีร้าน</title><style>${CSS}</style><main id="mms-partner-verify"><div class="mms-v-card"><img src="${LOGO}" alt="MMS"><h1>อนุมัติบัญชีร้าน</h1><p>ตรวจทีละร้าน การอนุมัติร้านหนึ่งไม่เปิดสิทธิ์ให้อีกร้าน</p><label for="shop">ร้านที่ต้องการตรวจ</label><select id="shop"><option value="kalima">Kalima Massage</option><option value="relax">Relax Spa by 9</option></select><p id="owner-status" role="status">กำลังอ่านคำขอ…</p><div id="requests"></div><details id="verify-diagnostics"><summary>จุดตรวจ Verify · Owner เท่านั้น</summary><p>บันทึกเฉพาะเวลา ร้าน ขั้นตอน และรหัสผลลัพธ์ ไม่เก็บ token หรือข้อมูลส่วนตัว แยกแต่ละร้าน สูงสุด 200 รายการ บันทึกเกิน 24 ชั่วโมงจะไม่แสดงและตัดออกเมื่อมีบันทึกใหม่</p><p>รายการ “เบราว์เซอร์รายงาน” ยังไม่ใช่หลักฐานว่า LINE ผ่านหรือ Airtable บันทึกแล้ว</p><button id="diagnostic-refresh">อ่านจุดตรวจร้านนี้</button><button id="diagnostic-check">ทดสอบที่เก็บบันทึกเท่านั้น</button><p id="diagnostic-status" role="status">การทดสอบไม่ส่งคำขอ ไม่อนุมัติบัญชี และไม่เขียน Airtable</p><div id="diagnostic-events"></div></details><details><summary>ยืนยันข้อมูลร้านก่อนอนุมัติ</summary><p>กรอก Canonical Shop ID ที่มีหลักฐานรับรองและตั้ง Identity Status เป็น Verified ในแถวร้านเดิมก่อนเปิดสิทธิ์ ห้ามใช้รหัสของอีกร้าน ห้ามเดาจากชื่อร้านหรือเส้นทางหน้าเว็บ</p><a href="https://airtable.com/appsV1ILPRfIjkaYg/tbl09N5ug8rmEQCyi" target="_blank" rel="noreferrer">เปิดทะเบียนร้านเดิมใน Airtable</a></details></div></main><script>(()=>{${BROWSER_HELPERS}(${ownerApp.toString()})();})();</script></html>`;

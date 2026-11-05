import {renderCustomerBrand,CUSTOMER_V6_CSS,createCustomerBrand} from './liff-customer-brand-v6.js';
export function doubleMomentCheckoutClient(createBrand){
 const $=id=>document.getElementById(id),root='/member/api/liff/promotions/double-moment/';
 let sid=new URL(location.href).searchParams.get('session_id')||'',state=null,busy=false,pending=null;
 const brand=createBrand($('customer-brand-v6'));
 const key='mmd.double-moment.checkout.v1';try{pending=JSON.parse(sessionStorage.getItem(key)||'null');if(pending&&/^[-\w]{1,220}$/.test(pending.session_id||'')&&/^dm(?:2)?_[a-f0-9]{24}$/.test(pending.claim_id||'')&&(!sid||pending.session_id===sid)){pending={session_id:pending.session_id,claim_id:pending.claim_id};sid=pending.session_id;}else pending=null;}catch{}
 const money=n=>new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB'}).format(n);
 const fail=e=>({job_link_required:'เปิดหน้านี้จากงานที่ต้องการใช้สิทธิ์',customer_login_required:'กรุณาเข้าสู่ MY MMD ด้วย LINE ของเจ้าของงาน',credit_owner_mismatch:'บัญชีนี้ไม่ตรงกับเจ้าของงาน',legacy_terms_preserved:'สิทธิ์เดิมคงเงื่อนไขเดิม กรุณาให้เปอร์ตรวจสอบ',final_payment_amount_mismatch:'มียอดชำระเดิมไม่ตรงกับเครดิต กรุณาให้เปอร์ตรวจสอบก่อน',credit_on_hold_or_changed:'เครดิตอยู่ระหว่างตรวจสอบ ยังใช้ไม่ได้'})[e.message]||'ยังยืนยันยอดไม่ได้ กรุณาตรวจใหม่ โดยใช้ชุดสิทธิ์เดิม';
 const sync=()=>{$('refresh').disabled=busy;$('submit').disabled=busy||(!pending&&(!state||!$('claims').value));$('claims').disabled=busy||!!pending;$('submit').textContent=pending?'ตรวจและส่งคำขอเดิม':'ใช้สิทธิ์และออกยอดชำระ';};
 async function api(path,body){const r=await fetch(root+path,{credentials:'same-origin',cache:'no-store',...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});const d=await r.json();if(!r.ok||d.ok!==true)throw Error(d.error||'unavailable');return d;}
 function render(d){
  brand.render(d.brand_audience==='sigil'?'private':d.brand_audience==='public'?'public':null);
  state=d;sid=d.session_id;$('claims').replaceChildren();
  for(const item of d.items){const o=document.createElement('option');o.value=item.claim_id;o.textContent=(item.round_id||'ชุดสิทธิ์เดิม')+' · '+(item.remaining_moments===null?'เงื่อนไขเดิม':item.remaining_moments+' ครั้งคงเหลือ')+' · '+(item.expires_at?new Date(item.expires_at).toLocaleDateString('th-TH-u-ca-gregory'):'ยังไม่ยืนยันวันหมดอายุ');o.disabled=!item.eligible&&!item.selected;$('claims').append(o);}
  if(pending)$('claims').value=pending.claim_id;else if(d.selected_claim_id)$('claims').value=d.selected_claim_id;else $('claims').value=d.items.find(x=>x.eligible)?.claim_id||'';
  const b=d.balance;for(const [id,value] of [['total',b.total_amount_thb],['cash',b.verified_paid_thb],['paid-credit',b.paid_credit_thb],['bonus',b.bonus_credit_thb],['due',b.remaining_amount_thb]]){if(typeof value!=='number'||!Number.isFinite(value))throw Error('invalid_balance');$(id).textContent=money(value);}
  $('balance').hidden=false;sync();
 }
 async function load(){if(busy)return;busy=true;state=null;$('pay').hidden=true;sync();$('status').textContent='กำลังตรวจสิทธิ์และยอดชำระ';try{render(await api('context'+(sid?'?session_id='+encodeURIComponent(sid):'')));$('status').textContent='ยอดก่อนใช้ชุดสิทธิ์ที่เลือก';}catch(e){$('balance').hidden=true;$('status').textContent=fail(e);}finally{busy=false;sync();}}
 async function submit(){if(busy||(!state&&!pending))return;const selected=pending||{session_id:sid,claim_id:$('claims').value};if(!selected.claim_id)return;
  if(!pending&&!window.confirm('ยืนยันใช้ชุดสิทธิ์ที่เลือกสำหรับงานนี้ และออกยอดชำระที่เหลือ?'))return;
  try{sessionStorage.setItem(key,JSON.stringify(selected));}catch{$('status').textContent='ยังเก็บคำขอไม่ได้ จึงยังไม่ส่งรายการ';return;}
  pending=selected;busy=true;$('pay').hidden=true;sync();
  try{const d=await api('checkout',selected);const u=new URL(d.customer_payment_url);if(u.origin!=='https://mmdbkk.com'||!['/pay/checkout','/sigil/pay'].includes(u.pathname))throw Error('invalid_payment_link');
   const current=await api('context?session_id='+encodeURIComponent(selected.session_id));if(current.selected_claim_id!==selected.claim_id||current.balance.remaining_amount_thb!==d.amount_due_thb)throw Error('balance_changed');render(current);
   for(const [id,v] of [['total',d.balance.total_amount_thb],['cash',d.balance.verified_paid_thb],['paid-credit',d.balance.paid_credit_thb],['bonus',d.balance.bonus_credit_thb],['due',d.balance.remaining_amount_thb]])$(id).textContent=money(v);
   $('balance').hidden=false;$('pay').href=u.href;$('pay').hidden=false;$('status').textContent='ยืนยันยอดหลังใช้เครดิตแล้ว · ยังไม่ใช่การยืนยันชำระ';pending=null;sessionStorage.removeItem(key);state=null;
  }catch(e){state=null;$('balance').hidden=true;$('status').textContent=fail(e);}finally{busy=false;sync();}
 }
 $('refresh').onclick=load;$('submit').onclick=submit;$('claims').onchange=sync;load();
}
const CHECKOUT_THEME=`
body[data-mmd-graphics="v6"] select{background:var(--digital-surface,#202629);color:var(--digital-text,#f3f0e8)}
body[data-mmd-graphics="v6"] #refresh{background:var(--digital-surface,#202629);color:var(--digital-text,#f3f0e8)}
body[data-mmd-graphics="v6"] #status{color:var(--digital-muted,#c6cbca)}
body[data-mmd-graphics="v6"] #due,body[data-mmd-graphics="v6"] header>a{color:var(--digital-gold,#d7c098)}
body[data-mmd-graphics="v6"] #pay{color:#fff}
body[data-mmd-graphics="v6"] .customer-brand-v6 [data-brand-panel="neutral"]{letter-spacing:0}
`;
export function renderDoubleMomentCheckout(){return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Double Moment · MY MMD</title><style>${CUSTOMER_V6_CSS}${CHECKOUT_THEME}
*{box-sizing:border-box}body{margin:0;background:#0b0e10;color:#f3f0e8;font:16px/1.65 MmdV6Thai,system-ui,sans-serif;letter-spacing:0}main{max-width:620px;margin:auto;padding:24px 20px 64px}header{display:flex;justify-content:space-between;align-items:center;gap:16px;border-bottom:1px solid #62696c;padding-bottom:18px}h1{font-size:28px;margin:24px 0 6px}a{color:#d2bd92}label{display:grid;gap:8px;margin:20px 0}button,select,a.action{font:inherit;min-height:48px;border:1px solid #8d9696;border-radius:6px;padding:10px 12px;color:inherit;background:#202629;max-width:100%}button{cursor:pointer}button:disabled{opacity:.5;cursor:not-allowed}select{width:100%}section{border-top:1px solid #62696c;padding:20px 0}dl{display:grid;grid-template-columns:1fr auto;gap:12px;margin:0}dd{margin:0;text-align:right}dt,dd{overflow-wrap:anywhere}#due{font-weight:700;color:#d7c098}.actions{display:grid;gap:12px}#submit{background:#d2bd92;color:#161a1c}#status{min-height:54px;color:#c6cbca}a.action{text-align:center;text-decoration:none;background:#254c3b}button:focus-visible,select:focus-visible,a:focus-visible{outline:3px solid #d2bd92;outline-offset:3px}[hidden]{display:none!important}</style></head><body data-mmd-graphics="v6"><main><header>${renderCustomerBrand()}<a href="/member/liff">MY MMD</a></header><h1>Double Moment</h1><p>ใช้สิทธิ์กับงานนี้</p><label>ชุดสิทธิ์<select id="claims" aria-label="ชุดสิทธิ์"></select></label><p id="status" role="status" aria-live="polite"></p><section id="balance" hidden><dl><dt>ค่าบริการ</dt><dd id="total"></dd><dt>เงินที่ยืนยันรับแล้ว</dt><dd id="cash"></dd><dt>เครดิตที่ใช้แล้ว</dt><dd id="paid-credit"></dd><dt>โบนัสที่ใช้แล้ว</dt><dd id="bonus"></dd><dt>คงเหลือชำระ</dt><dd id="due"></dd></dl></section><div class="actions"><button id="submit" disabled>ใช้สิทธิ์และออกยอดชำระ</button><button id="refresh">ตรวจยอดล่าสุด</button><a id="pay" class="action" hidden>ไปชำระยอดคงเหลือ</a></div></main><script>(${doubleMomentCheckoutClient.toString()})(${createCustomerBrand.toString()});</script></body></html>`;}

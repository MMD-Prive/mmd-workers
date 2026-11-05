export function sessionReportPanel(){
 const section=document.createElement('section'),title=document.createElement('h2'),form=document.createElement('form'),label=document.createElement('label'),input=document.createElement('input'),button=document.createElement('button'),status=document.createElement('p'),values=document.createElement('dl');
 title.textContent='ยอดงานล่าสุด';label.textContent='รหัสงาน';input.required=true;input.name='session_id';input.autocomplete='off';button.textContent='ตรวจยอด';button.type='submit';label.append(input);form.append(label,button);status.setAttribute('role','status');section.append(title,form,status,values);document.querySelector('main').append(section);
 const names={total_amount_thb:'ยอดงาน',verified_paid_thb:'เงินสดยืนยันแล้ว',paid_credit_thb:'เครดิตที่ใช้',bonus_credit_thb:'โบนัสที่ใช้',remaining_amount_thb:'เงินสดคงเหลือ',overpaid_amount_thb:'ยอดเกิน'};
 let run=0,active='',controller;
 const clear=()=>{values.replaceChildren();status.textContent='ยังยืนยันยอดไม่ได้';};
 async function refresh(){
  const id=active,version=++run;controller?.abort();controller=new AbortController();clear();if(!id||document.hidden)return;
  const current=controller;button.disabled=true;status.textContent='กำลังตรวจยอดล่าสุด';const timer=setTimeout(()=>current.abort(),12000);
  try{
   const r=await fetch('/v1/admin/double-moment/context?'+new URLSearchParams({session_id:id}),{credentials:'same-origin',cache:'no-store',signal:current.signal});const d=await r.json();
   if(version!==run)return;if(!r.ok||d.ok!==true||d.balance?.session_id!==id)throw Error();
   const entries=Object.entries(names).map(([key,name])=>{const value=d.balance[key];if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw Error();return [name,value];});
   for(const [name,value]of entries){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=name;dd.textContent=new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB'}).format(value);values.append(dt,dd);}status.textContent='ตรวจยอดล่าสุดแล้ว';
  }catch{if(version===run)clear();}finally{clearTimeout(timer);if(version===run)button.disabled=false;}
 }
 form.onsubmit=e=>{e.preventDefault();active=input.value.trim();refresh();};
 input.addEventListener('input',()=>{active='';run++;controller?.abort();button.disabled=false;clear();});
 document.addEventListener('visibilitychange',()=>{run++;controller?.abort();clear();if(!document.hidden)refresh();});
 setInterval(()=>{if(active)refresh();},15000);clear();
}
export function appendSessionReportPanel(html){return html.replace('</body>',`<script>(${sessionReportPanel.toString()})();</script></body>`);}

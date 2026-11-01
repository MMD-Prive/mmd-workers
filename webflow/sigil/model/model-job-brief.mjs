// A read-only projection of the authenticated session, never customer billing totals.
export function renderModelJobBrief(root,session){
 if(!root)return;
 let panel=root.querySelector('[data-model-job-brief]');
 if(!session?.session_id){panel?.remove();return;}
 const doc=root.ownerDocument;
 if(!panel){
  const host=root.querySelector('[data-view="work"] > .smcv3-state,[data-mm-reconfirm]')||root.querySelector('.smcv3-summary,[data-mm-job-copy]');
  if(!host)return;
  panel=doc.createElement('section');panel.dataset.modelJobBrief='';panel.className='model-job-brief';
  host.insertAdjacentElement('afterend',panel);
 }
 const clean=v=>typeof v==='string'&&v.trim()?v.trim():'ยังไม่ระบุ';
 const state=session.normalized_state||session.state;
 const lane=session.model_work_lane,money=session.payout_terms?.money_lane;
 const brand=money&&money!==lane?'':lane==='public_model'?'MMD':lane==='private_model'?'SĪGIL':'';
 const cp=session.customer_payment;
 const unknown='ยังยืนยันสถานะชำระไม่ได้';
 const trusted=cp?.source==='payments_verified_ledger'&&cp.schema==='model_customer_payment_v1'&&cp.session_id===session.session_id;
 const confirmed=' · '+brand+' ตรวจยืนยันแล้ว';
 const customer=!trusted||!brand?unknown:cp.status==='fully_paid'?'ลูกค้าชำระครบแล้ว'+confirmed:cp.status==='deposit_paid'?'ลูกค้าโอนมัดจำแล้ว'+confirmed+' · รอยอดคงเหลือ':cp.status==='pending'?'รอยืนยันการชำระ':unknown;
 const proof=session.payout;
 const paid=proof?.status==='paid'&&proof.verified===true&&proof.source==='owner_verified_transfer'&&
  typeof proof.amount_thb==='number'&&proof.amount_thb>0&&proof.amount_thb===session.pay_model_thb&&Number.isFinite(Date.parse(proof.paid_at))&&state==='closed';
 const status=paid?(brand?brand+' โอนค่าตัวให้คุณแล้ว':'โอนแล้ว · ยังยืนยันฝั่งงานไม่ได้'):proof?.status==='hold'?'พักการจ่าย · รอตรวจสอบ':state==='payout_pending'?(brand?'รอ '+brand+' โอนค่าตัว':'รอโอน · ตามสถานะงาน'):
  ['separated','under_review'].includes(state)?'รอตรวจจบงาน':
  state==='closed'?'ปิดงานแล้ว · ยังยืนยันการโอนไม่ได้':'ยังไม่ถึงขั้นตอนจ่าย';
 const amount=session.pay_model_thb;
 const end=clean(session.end_time);
 const endDate=end.includes('T')?new Date(end):null;
 const endText=endDate&&Number.isFinite(endDate.getTime())?new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit'}).format(endDate)+' น.':/^\d{2}:\d{2}$/.test(end)?end+' น.':'ยังไม่ระบุ';
 const rate=typeof amount==='number'&&Number.isFinite(amount)&&amount>0?
  new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB',maximumFractionDigits:0}).format(amount):'ยังยืนยันยอดไม่ได้';
 const fragment=doc.createDocumentFragment();
 const title=doc.createElement('h3');title.textContent='ข้อมูลงาน';fragment.append(title);
 const list=doc.createElement('dl');
 for(const [label,value] of [['ลูกค้า',clean(session.client_name)],['รหัสงาน',session.session_id],['เวลาสิ้นสุด',endText],['การชำระของลูกค้า',customer],['ค่าตัวตามงาน',rate],['ค่าตัวของคุณ',status]]){
  const row=doc.createElement('div'),dt=doc.createElement('dt'),dd=doc.createElement('dd');
  dt.textContent=label;dd.textContent=value;row.append(dt,dd);list.append(row);
 }
 fragment.append(list);
 if(paid){
  const receipt=doc.createElement('p');receipt.textContent='โอนค่าตัว '+rate+' · '+new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'medium',timeStyle:'short'}).format(new Date(proof.paid_at));fragment.append(receipt);
 }
 panel.replaceChildren(fragment);
}

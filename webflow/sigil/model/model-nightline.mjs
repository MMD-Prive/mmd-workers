// Presentation only: preserve all existing nodes, listeners, authority and actions.
export function mountModelNightline(doc=document,logoSrc=''){
 const root=doc.querySelector('#mmd-model-home-v4,#sigil-model-console-v3');
 if(!root)return;
 root.dataset.modelNightline='6.1';
 let expandedState='';
 function decorate(){
  const consoleHero=root.querySelector('.smcv3-hero__image');
  if(consoleHero&&!consoleHero.hasAttribute('data-tart-room')){
   consoleHero.src='/model-nightline-assets/tart-room.png';
   consoleHero.removeAttribute('srcset');consoleHero.alt='Tart ในห้องทำงานส่วนตัวใต้ดิน';consoleHero.dataset.tartRoom='';
  }
  const homeHero=root.querySelector('.mmhome-hero');
  if(homeHero&&!homeHero.querySelector('.model-room-photo')){
   const photo=doc.createElement('img');photo.className='model-room-photo';photo.src='/model-nightline-assets/tart-room.png';
   photo.alt='Tart ในห้องทำงานส่วนตัวใต้ดิน';photo.width=941;photo.height=1672;homeHero.prepend(photo);
  }
  const work=root.querySelector('[data-view="work"]');
  if(work&&!work.querySelector('.model-flow-index')){
   const flow=doc.createElement('nav');flow.className='model-flow-index';flow.setAttribute('aria-label','ขั้นตอนงาน');
   for(const [i,label] of ['รับงาน','เตรียมตัว','เดินทาง','ทำงาน','จบงาน'].entries()){
    const step=doc.createElement('span');const number=doc.createElement('b');number.textContent=String(i+1);
    step.append(number,doc.createTextNode(label));flow.append(step);
   }
   work.prepend(flow);
  }
  if(work){
   const state=root.dataset.consoleState||'';
   const phase=({offered:0,confirmed:1,en_route:2,nearby:2,arrived:2,met_customer:3,final_payment_pending:3,final_payment_confirmed:3,work_started:3,work_finished:4,separated:4,under_review:4,payout_pending:4,closed:4})[state];
   work.querySelectorAll('.model-flow-index span').forEach((step,i)=>{
    if(i===phase){if(step.getAttribute('aria-current')!=='step')step.setAttribute('aria-current','step');}
    else if(step.hasAttribute('aria-current'))step.removeAttribute('aria-current');
   });
   const stage=work.querySelector(':scope > .smcv3-state');
   if(stage&&!stage.classList.contains('model-next-action'))stage.classList.add('model-next-action');
   const lang=doc.documentElement.lang.startsWith('en')?'en':doc.documentElement.lang.startsWith('zh')?'zh':'th';
   const copy={
    th:{separated:['แยกย้ายแล้ว · รอลูกค้าอนุมัติ','ยังไม่ใช่การปิดงานหรือยืนยันโอนค่าตัว'],under_review:['รอตรวจจบงาน','สถานะชำระและค่าตัวแสดงแยกกันด้านล่าง'],payout_pending:['รอโอนค่าตัว','จะแสดงว่าโอนแล้วเมื่อมีหลักฐานยืนยัน'],closed:['งานปิดแล้ว','ตรวจสถานะการชำระของลูกค้าและค่าตัวแยกกันด้านล่าง']},
    en:{separated:['Separated · awaiting customer approval','This does not confirm job closure or payout.'],under_review:['Completion review pending','Customer payment and your payout are shown separately below.'],payout_pending:['Awaiting your payout','Paid is shown only with verified transfer evidence.'],closed:['Job closed','Check customer payment and your payout separately below.']},
    zh:{separated:['已分别 · 等待客户确认','此状态不代表工作已关闭或报酬已支付。'],under_review:['等待完工审核','客户付款与您的报酬分别显示在下方。'],payout_pending:['等待报酬转账','仅在转账凭证已核实后显示已支付。'],closed:['工作已关闭','请分别查看客户付款与您的报酬。']}
   }[lang][state];
   if(copy)for(const [i,selector]of ['[data-stage-title]','[data-stage-copy]'].entries()){
    const node=work.querySelector(selector);if(node&&node.textContent!==copy[i])node.textContent=copy[i];
   }
   if(copy){
    const badge=state==='separated'?{th:'รอลูกค้าอนุมัติ',en:'Awaiting approval',zh:'等待客户确认'}[lang]:copy[0];
    for(const node of root.querySelectorAll('[data-chip],[data-stage-pill]'))if(node.textContent!==badge)node.textContent=badge;
   }
   if(expandedState!==state){
    const travel=work.querySelector('[data-travel-actions]');
    if(travel&&!travel.hidden&&['en_route','nearby','arrived'].includes(state)){travel.open=true;expandedState=state;}
   }
  }
  const header=root.querySelector('.mm-lv-header,.smcv3-head');
  if(!header||header.querySelector('.model-nightline-logo'))return;
  const logo=doc.createElement('img');logo.className='model-nightline-logo';
  logo.src=logoSrc;logo.alt='SĪGIL System';logo.width=76;logo.height=50;
  header.prepend(logo);
 }
 decorate();
 const observer=new doc.defaultView.MutationObserver(decorate);
 observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['data-console-state']});
 observer.observe(doc.documentElement,{attributes:true,attributeFilter:['lang']});
 return {destroy(){observer.disconnect();}};
}

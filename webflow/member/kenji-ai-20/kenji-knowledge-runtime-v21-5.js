/* MMD Kenji AI 2.0 knowledge runtime v21.5 */
(()=> {
  const root=document.querySelector('[data-mmd-kenji-v21]');
  if(!root||root.dataset.knowledgeRuntime==='v21.5') return;
  root.dataset.knowledgeRuntime='v21.5';
  const $=s=>root.querySelector(s), $$=s=>Array.from(root.querySelectorAll(s));
  const q=new URLSearchParams(location.search), token=(q.get('t')||'').trim();
  const nodes={ai:$('[data-k21-ai-text]'),input:$('[data-k21-input]'),toast:$('[data-k21-toast]')};
  const staticCards=[
    ['kenji_20_001_role','ผมช่วยดูเส้นทางที่เหมาะกับ request ของคุณก่อนนะครับ บาง request ต้องให้ MMD พิจารณาความเหมาะสมก่อน โดยเฉพาะ access ที่มีรายละเอียดเฉพาะ'],
    ['kenji_20_002_route_map','ผมช่วยแยกเส้นทางให้ครับ: MMD Companion, MMS Wellness หรือ Partner Venue เช่น Relax Spa by 9 ตามบริบท ทั้งหมดต้องให้ MMD ตรวจความเหมาะสมก่อนครับ'],
    ['kenji_20_008_membership_intake_catalog','ถ้าคุณสนใจ Membership Access ผมช่วยรับความสนใจและแยกเส้นทางให้ MMD review ก่อนครับ ขั้นตอนนี้เป็น intake และ review เท่านั้น ยังไม่ใช่การยืนยัน membership, ราคา, booking หรือ access ครับ'],
    ['kenji_20_007_drop_690_guard','ผมจะไม่พาไปเส้น Public Access 690 แบบเดิมแล้วครับ ถ้าเป็น request ใหม่ ผมจะพาไป Reviewed Access / Membership Intake หรือ Payment Proof ตามบริบท และให้ MMD ตรวจความเหมาะสมก่อนเสมอ'],
    ['kenji_20_006_payment_proof','ถ้าต้องส่งหลักฐาน ผมจะพาไปหน้า Payment Proof ครับ: https://mmdbkk.com/confirm/payment-proof\n\nMMD จะรับหลักฐานไว้ตรวจยอดจริงก่อนอัปเดตขั้นตอนถัดไป หลักฐานอย่างเดียวยังไม่ถือว่ายืนยันยอดหรืออนุมัติ request ครับ'],
    ['kenji_20_009_web_forbidden_terms','ผมจะใช้ถ้อยคำที่ปลอดภัยและให้ MMD ตรวจสอบก่อนเสมอครับ ถ้ามีเรื่องชำระเงินหรือ access ผมจะพาไปหน้าที่ถูกต้องและใช้คำว่า รับหลักฐานแล้ว / รอตรวจยอดจริง / MMD ตรวจยอดจริง เท่านั้น']
  ].map(([id,answer])=>({id,knowledge_id:id,answer,customer_answer:answer}));
  let cards=staticCards.slice(), source='static_route_map';
  const textOf=c=>String(c&&(c.customer_answer||c.answer||'')||'').trim();
  const idOf=c=>String(c&&(c.knowledge_id||c.id)||'');
  function setAI(t){ if(nodes.ai&&t){nodes.ai.dataset.knowledgeTouched='true';nodes.ai.textContent=t;} }
  function toast(t){ if(!nodes.toast)return; clearTimeout(root._mmdKK); nodes.toast.textContent=t; nodes.toast.dataset.open='true'; root._mmdKK=setTimeout(()=>nodes.toast.dataset.open='false',2200); }
  function route(path){ if(!path)return; const u=new URL(path,location.origin); if(token)u.searchParams.set('t',token); setTimeout(()=>location.assign(u.pathname+u.search+u.hash),620); }
  function intent(x){ x=String(x||'').toLowerCase(); if(/690|public access/.test(x))return'drop'; if(/หลักฐาน|สลิป|ชำระ|payment|proof|โอน/.test(x))return'proof'; if(/membership|member|สมาชิก|สมัคร|ต่ออายุ|renew|package|access/.test(x))return'member'; if(/mms|massage|wellness|recovery|spa|relax/.test(x))return'wellness'; if(/จอง|booking|book|นัด|companion|dining|event|appearance|social/.test(x))return'booking'; if(/แต้ม|point/.test(x))return'points'; if(/black/.test(x))return'black'; if(/ห้าม|forbidden|term|copy|paid|verified|approved|successful/.test(x))return'terms'; return'role'; }
  function cardFor(i){ const map={drop:'kenji_20_007_drop_690_guard',proof:'kenji_20_006_payment_proof',member:'kenji_20_008_membership_intake_catalog',wellness:'kenji_20_002_route_map',booking:'kenji_20_002_route_map',terms:'kenji_20_009_web_forbidden_terms',role:'kenji_20_001_role'}; const id=map[i]||map.role; return cards.find(c=>idOf(c)===id)||staticCards.find(c=>idOf(c)===id)||staticCards[0]; }
  function ask(x,nav=false){ const i=intent(x); let answer=textOf(cardFor(i)); if(i==='points')answer='ผมดูเรื่องแต้มให้ได้ครับ แต่แต้มและสิทธิ์ต้องอิงข้อมูลสมาชิกที่ MMD ตรวจได้เท่านั้น'; if(i==='black')answer='Exclusive Black Card เป็นสิทธิ์ระดับ private access การเปิดสิทธิ์จะอิงสถานะบัญชีและการพิจารณาส่วนตัว'; setAI(answer); toast(source==='published_runtime'?'ใช้ Knowledge ที่ MMD approve แล้วครับ':'ใช้ fallback route map ที่ล็อกไว้ก่อนครับ'); if(nav){ const routes={proof:'/confirm/payment-proof',member:'/member/membership',wellness:'/sigil/booking?from=kenji-ai-20',booking:'/sigil/booking?from=kenji-ai-20',drop:'/member/membership',black:'/blackcard/black-card'}; route(routes[i]||''); } return true; }
  async function reload(){ try{ const r=await fetch('/v1/internal/kenji/knowledge/published',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}}); const j=await r.json().catch(()=>({})); if(r.ok&&Array.isArray(j.cards)&&j.cards.length){cards=j.cards;source='published_runtime';root.dataset.knowledgeSource='published_runtime';return true;} throw new Error('empty'); }catch(e){cards=staticCards.slice();source='static_route_map';root.dataset.knowledgeSource='static_route_map';return false;} }
  const form=$('[data-k21-form]');
  if(form){ const old=form.onsubmit; form.onsubmit=e=>{ const v=String(nodes.input&&nodes.input.value||'').trim(); if(v){e.preventDefault(); if(nodes.input)nodes.input.value=''; return ask(v,true);} return typeof old==='function'?old.call(form,e):undefined; }; }
  $$('[data-intent]').forEach(b=>{ const old=b.onclick; b.onclick=ev=>{ const v=b.dataset.intent||b.textContent||''; if(ask(v,true)){ ev.preventDefault(); return false;} return typeof old==='function'?old.call(b,ev):undefined; }; });
  const prev=window.MMDKenjiMemberConciergeV214||{};
  window.MMDKenjiMemberConciergeV214=Object.freeze(Object.assign({},prev,{knowledgeReload:reload,knowledgeAsk:x=>ask(x,false),routeAsk:x=>ask(x,true),ask:x=>ask(x,false)}));
  window.MMDKenjiKnowledgeRuntimeV215=Object.freeze({reload,ask:x=>ask(x,false),routeAsk:x=>ask(x,true),get source(){return source},get cards(){return cards.slice()}});
  reload();
})();

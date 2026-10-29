import {PERSONAL_MAINS} from '../../shared/personal-main-catalog.mjs';
import {PUBLIC_PERSONAL_MAIN_IMAGES} from './liff-personal-main-public-images.js';
export function renderPersonalMain(){return `<section id="personal-main" class="pm" hidden aria-label="Personal Main"><div class="pm-heading"><div><small>PERSONAL MAIN · AI ASSISTANT</small><h2 data-pm-title>เลือกคนที่คุยกันรู้เรื่อง</h2></div><button type="button" data-pm-change hidden>เปลี่ยน</button></div><p data-pm-status role="status" aria-live="polite"></p><progress data-pm-progress aria-label="กำลังตรวจสอบ" hidden></progress><div data-pm-choices class="pm-choices">${PERSONAL_MAINS.map(x=>`<button type="button" data-pm-choice="${x.id}" aria-pressed="false"><img data-pm-public-src="${PUBLIC_PERSONAL_MAIN_IMAGES[x.id]}" data-pm-private-src="${x.image}" alt="${x.name}" loading="lazy" referrerpolicy="no-referrer"><strong>${x.name}</strong><small>${x.role}</small><span>${x.tone}</span></button>`).join('')}</div><button type="button" data-pm-skip>ไว้ก่อน</button><button type="button" data-pm-retry hidden>ลองตรวจสอบอีกครั้ง</button><section data-pm-assistant hidden><img data-pm-avatar alt="" width="56" height="56" referrerpolicy="no-referrer"><h3 data-pm-name></h3><p>ผู้ช่วย AI ในแอป · ไม่ใช่การจองผู้ให้บริการ</p><button type="button" data-pm-open>คุยกับผู้ช่วย</button><div data-pm-chat hidden><div data-pm-messages role="log" aria-live="polite"></div><form data-pm-form><label>เรื่องที่อยากให้ช่วย<textarea data-pm-input maxlength="800" rows="2" required></textarea></label><button type="submit">ส่ง</button></form></div></section></section>`;}
export const PERSONAL_MAIN_CSS=`
.pm{margin:12px 0;padding:14px;border:1px solid var(--digital-line);border-radius:14px;color:var(--digital-cream);background:var(--digital-surface)}
.pm[hidden],.pm [hidden]{display:none!important}.pm-heading{display:flex;justify-content:space-between;align-items:center;gap:8px}.pm h2{font-size:17px;margin:5px 0}.pm [data-pm-avatar]{width:56px;height:56px;object-fit:cover;border-radius:50%;float:left;margin-right:12px}.pm h3{font-size:16px}.pm small{font-size:10px}.pm p{font-size:12px;line-height:1.6}.pm button{min-height:44px;cursor:pointer;font:inherit}.pm-choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.pm-choices button{display:flex;flex-direction:column;align-items:flex-start;gap:5px;overflow:hidden;padding:8px;background:transparent;color:inherit;border:1px solid var(--digital-line);border-radius:10px;text-align:left}.pm-choices img{width:100%;height:104px;object-fit:cover;object-position:center 25%;border-radius:6px}.pm-choices span{font-size:10px;line-height:1.5}.pm button[aria-pressed=true]{outline:2px solid var(--digital-gold)}.pm button:focus-visible,.pm textarea:focus-visible{outline:2px solid var(--digital-gold);outline-offset:3px}.pm textarea{box-sizing:border-box;width:100%;font:inherit}.pm [data-pm-messages]{max-height:240px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}.pm progress{width:100%}.pm button:disabled{opacity:.6;cursor:wait}@media(min-width:600px){.pm-choices{grid-template-columns:repeat(4,minmax(0,1fr))}}
`;
// Browser controller: no identity storage, tier inference or model/provider call.
export function createPersonalMainUI(root,request){
  if(!root)return {load(){},reset(){},setAudience(){},open(){}};
  const get=s=>root.querySelector(s), buttons=[...root.querySelectorAll('[data-pm-choice]')];
  const known=id=>buttons.some(b=>b.dataset.pmChoice===id);
  let generation=0,selected=null,busy=false;
  function setAudience(audience){
    const key=audience==='public'?'pmPublicSrc':audience==='private'?'pmPrivateSrc':null;
    for(const button of buttons){const image=button.querySelector('img');if(!image)continue;if(key)image.src=image.dataset[key];else image.removeAttribute('src');}
    const avatar=get('[data-pm-avatar]');
    const chosen=selected&&buttons.find(button=>button.dataset.pmChoice===selected.id)?.querySelector('img');
    if(chosen?.hasAttribute('src'))avatar.src=chosen.src;else avatar.removeAttribute('src');
  }
  const message=text=>{get('[data-pm-status]').textContent=text;};
  function loading(value){busy=value;get('[data-pm-progress]').hidden=!value;for(const b of root.querySelectorAll('button'))b.disabled=value;}
  function showChoice(value){get('[data-pm-choices]').hidden=!value;get('[data-pm-skip]').hidden=!value;}
  function apply(value){get('[data-pm-title]').textContent=value?'ผู้ช่วยของคุณ':'เลือกคนที่คุยกันรู้เรื่อง';const choice=value&&buttons.find(b=>b.dataset.pmChoice===value.id)?.querySelector('img');const avatar=get('[data-pm-avatar]');if(choice?.hasAttribute('src'))avatar.src=choice.src;else avatar.removeAttribute('src');selected=known(value?.id)?value:null;showChoice(!selected);get('[data-pm-assistant]').hidden=!selected;get('[data-pm-change]').hidden=!selected;for(const b of buttons)b.setAttribute('aria-pressed',String(b.dataset.pmChoice===selected?.id));get('[data-pm-name]').textContent=selected?buttons.find(b=>b.dataset.pmChoice===selected.id).querySelector('strong').textContent+' · ผู้ช่วย AI':'';}
  function reset(){generation++;selected=null;root.hidden=true;loading(false);apply(null);setAudience('unresolved');get('[data-pm-messages]').replaceChildren();get('[data-pm-input]').value='';get('[data-pm-chat]').hidden=true;}
  async function preference(id){
    if(busy)return;const turn=++generation;root.hidden=false;loading(true);get('[data-pm-retry]').hidden=true;message(id?'กำลังบันทึกคนที่คุณเลือกครับ':'กำลังตรวจสอบผู้ช่วยของคุณครับ');
    try{
      const response=await request('/api/member/app/personal-main',{method:id?'PUT':'GET',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json',accept:'application/json'},...(id?{body:JSON.stringify({id})}:{})});
      const data=await response.json();if(turn!==generation)return;
      if(response.status===401){reset();return;}
      if(!response.ok||data.ok!==true||data.authority!=='member-pages-worker'||(data.selected && !known(data.selected.id)) || (id && data.selected?.id!==id))throw Error('unavailable');
      apply(data.selected);message(selected?'เลือกแล้วครับ เปลี่ยนได้ทุกเมื่อ':'เลือกคนที่คุณอยากให้ช่วยดูแลในแอปครับ');
    }catch{if(turn===generation){apply(null);showChoice(false);message('ยังตรวจสอบผู้ช่วยไม่ได้ครับ ข้อมูลสมาชิกส่วนอื่นยังเปิดดูได้');get('[data-pm-retry]').hidden=false;}}
    finally{if(turn===generation)loading(false);}
  }
  for(const button of buttons)button.addEventListener('click',()=>{if(!busy)void preference(button.dataset.pmChoice);});
  get('[data-pm-change]').addEventListener('click',()=>{showChoice(true);get('[data-pm-chat]').hidden=true;get('[data-pm-messages]').replaceChildren();});
  get('[data-pm-skip]').addEventListener('click',()=>{showChoice(false);get('[data-pm-change]').hidden=false;message('กลับมาเลือกผู้ช่วยได้ทุกเมื่อครับ');});
  get('[data-pm-retry]').addEventListener('click',()=>void preference());
  get('[data-pm-open]').addEventListener('click',()=>{get('[data-pm-chat]').hidden=false;get('[data-pm-input]').focus();});
  get('[data-pm-form]').addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!selected)return;
    const input=get('[data-pm-input]'),text=input.value.trim();if(!text||text.length>800)return;
    const turn=generation,id=selected.id;loading(true);message('กำลังตรวจข้อมูลเพื่อช่วยตอบครับ');
    try{
      const response=await request('/api/member/kenji/chat',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({message:text})});
      const data=await response.json();if(turn!==generation)return;
      if(response.status===401){reset();return;}
      if(!response.ok||data.ok!==true||data.authority!=='ai-worker'||data.personal_main?.id!==id||typeof data.reply!=='string')throw Error('unavailable');
      for(const line of ['คุณ: '+text, get('[data-pm-name]').textContent+': '+data.reply]){const p=root.ownerDocument.createElement('p');p.textContent=line;get('[data-pm-messages]').appendChild(p);}
      input.value='';message('คำตอบอ้างอิงข้อมูลที่ระบบตรวจสอบครับ');
    }catch{if(turn===generation)message('ยังตอบไม่ได้ครับ ข้อความยังอยู่ในช่องพิมพ์ ไม่มีการส่งซ้ำอัตโนมัติ');}
    finally{if(turn===generation)loading(false);}
  });
  return {load:()=>preference(),reset,setAudience,open(){if(root.hidden)return;if(selected)get('[data-pm-chat]').hidden=false;else showChoice(true);root.scrollIntoView?.({block:'center',behavior:'auto'});}};
}

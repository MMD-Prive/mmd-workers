export function mountNotificationReview(root){
  const api='/v1/admin/jobs/notification-review';
  let cursor='',busy=false;
  const el=(tag,value)=>{const node=document.createElement(tag);if(value)node.textContent=value;return node;};
  root.append(el('h2','ตรวจผลการส่ง Telegram'));
  const lanes=el('select');lanes.setAttribute('aria-label','ประเภทการแจ้งเตือน');
  for(const [value,label] of [['model-payout-instructions','ข้อมูลบัญชี'],['model-travel-owner','แจ้งไปผิดที่'],['customer-aftercare-owner','อนุมัติจบงาน / รีวิว'],['model-reconfirm-overdue-owner','ยังไม่รับทราบงาน · เตือนเปอร์ 19:00']]){
    const option=el('option',label);option.value=value;lanes.append(option);
  }
  const refresh=el('button','รีเฟรช'),status=el('p'),rows=el('div'),next=el('button','หน้าถัดไป');
  status.setAttribute('role','status');root.append(lanes,refresh,status,rows,next);
  async function load(){
    if(busy)return;busy=true;lanes.disabled=true;refresh.disabled=true;next.disabled=true;rows.replaceChildren();
    try{
      const response=await fetch(api+'?'+new URLSearchParams({lane:lanes.value,cursor}),{credentials:'same-origin',cache:'no-store'}),data=await response.json();
      if(!response.ok||!data.ok)throw Error(data.error||'โหลดรายการไม่ได้');
      status.textContent='';
      for(const item of data.items){
        const row=el('article');row.append(el('h3',item.session_id));
        if(item.created_at)row.append(el('p','รายการ '+item.id.slice(-8)+' · '+new Date(item.created_at).toLocaleString('th-TH')));
        row.append(el('p','สถานะงาน: '+(item.state||'ยังยืนยันไม่ได้')+' · ผู้รับลงท้าย '+(item.recipient_last4||'—')+(item.account_last4?' · บัญชีลงท้าย '+item.account_last4:'')));
        row.append(el('p',item.resolution?'ผลตรวจ: '+(item.resolution==='received'?'พบข้อความแล้ว':'ตรวจแล้วไม่พบข้อความ'):'ไม่ทราบผลการส่ง · '+(item.error||'manual_review')));
        if(item.review_note)row.append(el('p','บันทึกตรวจ: '+item.review_note));
        if(item.delivery_status)row.append(el('p','ผลคำขอส่งใหม่: '+({delivered:'ส่งสำเร็จ',manual_review:'ไม่ทราบผล · รอตรวจ',pending:'รอส่งใหม่',delivering:'กำลังดำเนินการ'}[item.delivery_status]||item.delivery_status)));
        if(item.blocked_reason)row.append(el('p','หยุดส่ง: '+({model_already_acknowledged:'นายแบบรับทราบงานแล้ว',owner_job_not_pending_reconfirm:'สถานะงานไม่อยู่ในช่วงรอรับทราบ',owner_recipient_changed:'ผู้รับหรือช่องทางส่งเปลี่ยนแล้ว',owner_job_revision_changed:'รายละเอียดงานเปลี่ยนแล้ว',owner_reconfirm_expired_or_changed:'เวลานัดหรือกำหนดแจ้งเตือนเปลี่ยนแล้ว',review_source_unavailable:'ยังตรวจข้อมูลล่าสุดไม่ได้'}[item.blocked_reason]||item.blocked_reason)));
        const note=el('input');note.maxLength=500;note.placeholder='หลักฐานตรวจ Telegram / เวลาที่ตรวจ';note.setAttribute('aria-label','หลักฐานตรวจการส่ง');
        const label=el('label'),verified=el('input');verified.type='checkbox';label.append(verified,document.createTextNode('ตรวจแชต Telegram ของผู้รับและข้อความรายการนี้แล้ว'));
        const actions=el('div');actions.className='actions';
        const received=el('button','พบข้อความแล้ว'),resend=el('button',item.resolution==='not_received'?'ดำเนินคำขอส่งใหม่เดิมต่อ':'ตรวจแล้วไม่พบ · อนุญาตส่งใหม่');
        const update=()=>{received.disabled=!!item.resolution||!verified.checked||note.value.trim().length<5;resend.disabled=!item.can_resend||!verified.checked||note.value.trim().length<5;};
        verified.onchange=update;note.oninput=update;update();
        for(const [button,decision] of [[received,'received'],[resend,'not_received']])button.onclick=async()=>{
          if(busy)return;
          if(!confirm(decision==='received'?'ยืนยันว่าพบข้อความนี้แล้ว โดยไม่ส่งซ้ำ?':'ตรวจแล้วไม่พบข้อความ และอนุญาตส่งใหม่หนึ่งครั้ง?'))return;
          busy=true;received.disabled=true;resend.disabled=true;
          try{
            const r=await fetch(api,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({lane:item.lane,id:item.id,decision,note:note.value,snapshot:item.snapshot,inspection_confirmed:verified.checked})}),d=await r.json();
            if(!r.ok||!d.ok)throw Error(d.error||'บันทึกไม่สำเร็จ');
            item.resolution=decision;item.can_resend=false;
            status.textContent=d.delivery_status?'ผลส่ง: '+({delivered:'ส่งสำเร็จ',manual_review:'ไม่ทราบผล · รอตรวจ',pending:'รอส่งใหม่'}[d.delivery_status]||d.delivery_status):'บันทึกว่าพบข้อความแล้ว · ไม่ส่งซ้ำ';
          }catch(error){status.textContent=error.message;}
          finally{busy=false;received.disabled=true;resend.disabled=true;}
        };
        actions.append(note,label,received,resend);row.append(actions);rows.append(row);
      }
      if(!data.items.length)rows.append(el('p','ไม่มีรายการในหน้านี้'));
      next.dataset.cursor=data.next_cursor||'';next.disabled=!data.next_cursor;
    }catch(error){status.textContent=error.message;}
    finally{busy=false;lanes.disabled=false;refresh.disabled=false;}
  }
  refresh.onclick=()=>{cursor='';load();};lanes.onchange=refresh.onclick;
  next.onclick=()=>{cursor=next.dataset.cursor;load();};
  load();
  return {refresh:()=>{cursor='';return load();}};
}

// Read-only projection. Communications adapters are not yet proven; never infer zero.
export function coModelView({role, sessionId, modelName, lifecycle, partnerId, actorPartnerId, evidence}) {
  if (!['owner', 'partner'].includes(role) || !sessionId ||
      (role === 'partner' && (!partnerId || partnerId !== actorPartnerId))) {
    throw Object.assign(new Error('co_model_forbidden'), {status:403});
  }
  return {session_id:sessionId, model_name:typeof modelName==='string'?modelName:'',
    lifecycle:typeof lifecycle==='string'?lifecycle:'unknown', read_only:true,
    channels:['LINE','Telegram'].map(channel=>({channel,status:'unavailable',messages:null,images:null,calls:null})),
    evidence:evidence || {status:"unavailable",timeline:[]}, timeline:[], history_complete:false, coordinator:{status:'unavailable'},
    handoff:{status:'unavailable'}, role};
}
export function renderCoModel(view) {
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return '<section aria-label="MY CO MODEL"><h2>MY CO MODEL</h2><p>อ่านอย่างเดียว · '+esc(view.model_name)+'</p><p>รหัสงาน '+esc(view.session_id)+'</p><p>สถานะในระบบ '+esc(view.lifecycle)+'</p><ul>'+view.channels.map(c=>'<li>'+esc(c.channel)+' · ยังไม่มีประวัติที่ตรวจสอบได้ · จำนวนข้อความ รูป และสาย: ยังยืนยันไม่ได้</li>').join('')+'</ul>'+renderEvidence(view.evidence)+'<p>ผู้ประสานงานปัจจุบัน / ผู้รับช่วง: ยังไม่มีหลักฐานยืนยัน</p><p>ไทม์ไลน์ยังไม่ครบ ไม่ได้หมายความว่าไม่มีการติดต่อ</p></section>';
}

function renderEvidence(e) {
  if(e?.status!=='available')return '<p>หลักฐาน MY MMD: ยังยืนยันไม่ได้</p>';
  const esc=v=>String(v).replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
  const labels={provider_accepted:'ระบบบันทึกว่า LINE รับคำขอแล้ว · ไม่ยืนยันการอ่าน',pending:'รอผลส่ง',manual_review:'ต้องตรวจผลส่ง',not_recorded:'ไม่พบบันทึกแจ้งเตือน',unknown:'ผลส่งยังไม่ชัดเจน',unavailable:'อ่านผลส่งไม่ได้'};
  return '<h3>หลักฐาน MY MMD</h3><p>เฉพาะรายการบันทึกสำเร็จในขอบเขตที่อ่านได้: '+e.submissions+' ครั้ง · '+e.images+' รูป · ไฟล์ไม่ซ้ำ '+e.unique_images+' รูป</p><ol>'+e.timeline.map(t=>'<li>'+esc(t.saved_at)+' · '+esc(t.sender_role)+' · '+t.images+' รูป · '+esc(labels[t.line_notice]||labels.unavailable)+'</li>').join('')+'</ol><p>ไม่ใช่จำนวนรูปใน LINE/Telegram · ไม่แสดงเนื้อหาแชตหรือไฟล์ส่วนตัว</p>';
}

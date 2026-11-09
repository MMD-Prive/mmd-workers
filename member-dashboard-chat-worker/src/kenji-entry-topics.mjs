// Exact current-turn navigation only; no inference from old booking drafts.
const commands = new Map([
  ['คนในรูปคือใคร', 'model_request_clarify'],
  ['คนในรูปคือใครครับ', 'model_request_clarify'],
  ['คนในรูปเป็นโมเดล mmd ไหม', 'model_request_clarify'],
  ['ช่วยหาคนในรูป', 'model_request_external'],
  ['อยากให้ช่วยหาคนนี้', 'model_request_external'],
  ['เปิด booking', 'model_request_booking'],
  ['พร้อมส่งคำขอจอง'.normalize('NFKC'), 'model_request_booking'],
  ['my status', 'checkpts'],
  ['promotion', 'promotion'],
  ['find model', 'models'],
  ['apply job', 'jobs'],
  ['รู้จัก mmd / สมาชิก','membership_intro'], ['สมาชิก mmd privé','membership_intro'],
  ['ดูแพ็กเกจสมาชิก','package'], ['สมัครสมาชิก','regis'],
  ['เช็กสมาชิกของฉัน','checkpts'], ['เช็กสิทธิ์โปรของฉัน','checkpts'], ['เปิด my mmd','checkpts'],
  ['โปรเดือนนี้','promotion'], ['โปรสมาชิก','member_promotion'],
  ['ดูรายละเอียดโปรสมาชิก','member_promotion'], ['ดูรายละเอียดโปร','promotion'],
  ['ดูโปรสมาชิกใหม่','promotion'], ['ยังไม่เป็นสมาชิก — ดูโปรเริ่มต้น','promotion'],
  ['ดูโปรสมาชิกปัจจุบัน','promotion'], ['ดูโปรกลับมาเป็นสมาชิก','promotion'],
  ['น้องมาใหม่','models'], ['ดูโปรไฟล์','models'],
  ['สนใจสมัครงาน','jobs'], ['ดูรายละเอียดการสมัคร','jobs'], ['สมัครเป็นนายแบบ','apply'],
]);
export function entryTopicCommand(event = {}) {
  if(event.type !== 'message' || event.message?.type !== 'text' || event.source?.type !== 'user') return '';
  return commands.get(String(event.message.text || '').normalize('NFKC').trim().toLowerCase()) || '';
}
const status='https://miniapp.line.me/2010862595-yT4DCEMc/?intent=status&view=overview';
const signup='https://miniapp.line.me/2010862595-yT4DCEMc/?intent=signup&view=signup&world=private';
const profiles='https://mmdbkk.com/profiles';
const booking='https://miniapp.line.me/2010862595-yT4DCEMc/?intent=status&view=jobs';
const yourRequest='https://miniapp.line.me/2010862595-yT4DCEMc/?intent=status&view=my-requests';
export function entryTopicReply(command) {
  const text={
    model_request_clarify:`คนในรูปเป็นน้อง MMD หรืออยากให้เปอร์ช่วยหาคนนี้ให้ครับ? 🖤
ถ้ารู้ชื่อน้อง ส่งมาได้เลยครับ หรือส่งคำขอจองที่ Booking → ${booking}
ถ้าอยากให้ช่วยหา แนบรูปหรือลิงก์ไว้ตรงนี้ได้เลยครับ → ${yourRequest}`,
    model_request_external:`ส่งรูปหรือลิงก์ที่ By Your Request ได้เลยครับ เดี๋ยวเปอร์ช่วยหาให้ 🖤
${yourRequest}`,
    model_request_booking:`พร้อมจองแล้ว ส่งคำขอตรงนี้ได้เลยครับ เดี๋ยวเปอร์เช็กคิวให้ 🖤
${booking}`,
    membership_intro:`MMD Privé รวม Curated Models และข้อมูลบริการไว้ให้เลือกดู ก่อนให้ทีมช่วยดูรายละเอียดที่เหมาะกับความต้องการครับ 🖤\nยังไม่เป็นสมาชิกก็ดูข้อมูลและโปรไฟล์ที่เปิดให้ชมได้ ไม่ต้องสมัครก่อนครับ\n\nสำหรับคนใหม่: พิมพ์ “ดูแพ็กเกจสมาชิก” หรือ “ดูโปรไฟล์”\nสมัครสมาชิก → ${signup}\nสำหรับสมาชิกเดิม: พิมพ์ “เช็กสมาชิกของฉัน”\nเปิด My MMD → ${status}`,
    models:`เลือกดู Curated Models ที่ MMD อนุมัติให้แสดงต่อสาธารณะได้ครับ ✨ ไม่ต้องเป็นสมาชิกก่อน\nตอนนี้ยังไม่ได้ยืนยันรายชื่อที่เพิ่งเข้ามาใหม่ จึงแนะนำหน้าโปรไฟล์ให้เลือกดูก่อนครับ\nการแสดงโปรไฟล์ไม่ใช่การยืนยันคิว ราคาเฉพาะเคส หรือความพร้อมรับงาน\nดูโปรไฟล์ → ${profiles}\nทั้งคนใหม่และสมาชิกเดิม ฝากชื่อที่สนใจไว้ให้เปอร์ดูแลต่อในแชตนี้ได้ครับ`,
    jobs:'ขอบคุณที่สนใจร่วมงานกับ MMD Privé ครับ ✍️\nสมัครเป็นนายแบบได้โดยไม่ต้องเป็นสมาชิกครับ\nดูรายละเอียด / เริ่มสมัคร: พิมพ์ “สมัครเป็นนายแบบ” เพื่อเข้าสู่ขั้นตอนรับข้อมูลในแชตเดิม\nหากสนใจงานประเภทอื่น ฝากประเภทงานไว้ให้เปอร์ตรวจต่อได้ครับ\nการส่งข้อมูลยังไม่ใช่การยืนยันรับเข้าร่วมหรือรับประกันงานครับ',
  }[command];
  return text ? {text,intent:'approved_command',reply_source:`category_${command}`,model_attempted:false} : null;
}
export function entryPromotionReply(reply, memberAd) {
  if(!reply?.text) return null;
  return {...reply,text:(memberAd ? 'มาดูโปรสมาชิก MMD Privé ต่อได้ตรงนี้ครับ 🖤\n\n' : '')+reply.text+
    `\n\nสำหรับคนใหม่: ดูโปรสมาชิกใหม่ / สมัครสมาชิก → ${signup}\nสำหรับสมาชิกเดิม: เช็กข้อมูลบัญชีและเงื่อนไขก่อนดำเนินการ → ${status}\nพิมพ์ “เช็กสิทธิ์โปรของฉัน” เพื่อตรวจสถานะสมาชิก การยืนยันว่าใช้โปรได้ต้องผ่านเงื่อนไขแคมเปญอีกครั้ง ไม่ใช่จากคำที่พิมพ์ครับ\nหากเคยสมัครแต่ตรวจไม่พบหรือข้อมูลไม่ตรง ฝากเรื่องให้เปอร์ตรวจต่อ ยังไม่ต้องสมัครหรือชำระซ้ำครับ`};
}

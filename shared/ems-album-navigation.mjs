export const EMS_ALBUM_PATH = '/my-mmd/albums/ems';
export const EMS_ALBUM_URL = 'https://mmdbkk.com'+EMS_ALBUM_PATH;

// Navigation hint only: this never proves session, identity or album access.
export function resolveEmsAlbumReturnTarget(query, state=new URLSearchParams()){
  const direct=query.getAll('return_to'),nested=state.getAll('return_to');
  if(direct.length>1||nested.length>1)return '';
  if(direct.length&&nested.length&&direct[0]!==nested[0])return '';
  return (direct[0]??nested[0])==='albums_ems'?EMS_ALBUM_PATH:'';
}

export function isEmsAlbumCommand(value=''){
  const text=String(value).normalize('NFKC').trim().replace(/(?:ครับ|ค่ะ|คะ|หน่อย|ได้ไหม|[.!?])+$/g,'').trim();
  return /^(?:(?:ขอ|ช่วย)?(?:ดู|เปิด)(?:อัลบั้ม|รูป)?\s*)?ems(?:\s*(?:albums?|อัลบั้ม))?$/i.test(text);
}
export function emsAlbumNavigationReply(){
  return {text:'เปิดอัลบั้ม EMs ใน MY MMD ได้จากปุ่ม “ดูอัลบั้ม EMs” ครับ ระบบจะแสดงเฉพาะนายแบบและรูปที่บัญชีของคุณได้รับสิทธิ์แล้ว',intent:'model_browse',reply_source:'ems_album_navigation_v1',handoff_required:false,model_attempted:false};
}
export function emsAlbumQuickReply(){
  return {items:[{type:'action',action:{type:'uri',label:'ดูอัลบั้ม EMs',uri:EMS_ALBUM_URL}}]};
}

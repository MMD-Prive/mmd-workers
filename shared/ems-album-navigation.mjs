// Temporary owner direction: use the existing verified VIP/SVIP/Black Card album lane.
// Navigation only; the active Worker continues to decide access on every read.
export const EMS_ALBUM_PATH = '/my-mmd/ems';
export const EMS_ALBUM_URL = 'https://mmdbkk.com'+EMS_ALBUM_PATH;

// Navigation hint only: this never proves session, identity or album access.
export function resolveEmsAlbumReturnTarget(query, state=new URLSearchParams()){
  const read=key=>{
    const direct=query.getAll(key), nested=state.getAll(key);
    if(direct.length>1 || nested.length>1 || direct.length&&nested.length&&direct[0]!==nested[0])return null;
    return direct[0]??nested[0]??'';
  };
  const hint=read('return_to'),view=read('view'),album=read('album');
  if(hint===null||view===null||album===null)return '';
  if(hint!=='albums_ems'&&view!=='ems_albums')return '';
  if(hint&&hint!=='albums_ems'||view&&view!=='ems_albums')return '';
  if(album && (album.length>100 || !/^ems\d+-[a-f0-9]{12}$/.test(album)))return '';
  return EMS_ALBUM_PATH+(album?'/'+album:'');
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

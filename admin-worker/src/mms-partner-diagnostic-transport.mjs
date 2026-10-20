// Source text crosses the Worker/browser boundary without build-time helper references.
// Fixed local outcomes only: no response bodies, URLs, exceptions or identities retained.
export const DIAGNOSTIC_TRANSPORT = String.raw`async function diagnosticEvent(endpoint, body) {
  if(typeof fetch!=='function'||typeof setTimeout!=='function'||typeof clearTimeout!=='function')return {ok:false,reason:'BROWSER_UNSUPPORTED'};
  let controller=null,timer,expired=false;
  try{if(typeof AbortController==='function')controller=new AbortController();}catch{}
  const deadline=new Promise(resolve=>{timer=setTimeout(()=>{expired=true;try{if(controller)controller.abort();}catch{}resolve({ok:false,reason:'TIMEOUT'});},4000);});
  const attempt=async()=>{
    try{
      const options={method:'POST',headers:{'content-type':'application/json'},credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',keepalive:true,body:JSON.stringify(body)};
      if(controller)options.signal=controller.signal;
      const r=await fetch(endpoint,options);
      if(!r.ok)return {ok:false,reason:r.status===401||r.status===403?'DENIED':r.status===429?'RATE_LIMITED':r.status===503?'STORE_UNAVAILABLE':'HTTP_REJECTED'};
      let p;try{p=await r.json();}catch{return {ok:false,reason:'INVALID_ACK'};}
      if(!p||typeof p!=='object'||typeof p.ok!=='boolean')return {ok:false,reason:'INVALID_ACK'};
      if(!p.ok)return {ok:false,reason:'NOT_SAVED'};
      if(p.shop_key!==body.shop_key||p.stage!==body.stage)return {ok:false,reason:'ACK_MISMATCH'};
      return {ok:true,reason:'OK'};
    }catch{return {ok:false,reason:expired?'TIMEOUT':'NETWORK_ERROR'};}
  };
  try{return await Promise.race([attempt(),deadline]);}finally{clearTimeout(timer);}
}
function diagnosticFailureText(reason) {
  const labels={BROWSER_UNSUPPORTED:'เบราว์เซอร์นี้ยังเปิดจุดตรวจไม่ได้',TIMEOUT:'รอคำยืนยันเกิน 4 วินาที อาจบันทึกแล้วแต่ยังไม่ได้รับคำตอบ',DENIED:'ตัวรับจุดตรวจไม่อนุญาตให้บันทึก',RATE_LIMITED:'ส่งจุดตรวจถี่เกินไป ตัวรับจึงปฏิเสธชั่วคราว',STORE_UNAVAILABLE:'ตัวรับจุดตรวจแจ้งว่ายังไม่พร้อมบันทึก',HTTP_REJECTED:'ตัวรับจุดตรวจปฏิเสธการบันทึก',INVALID_ACK:'คำตอบจากตัวรับจุดตรวจอ่านไม่ได้หรือไม่ครบ',NOT_SAVED:'ตัวรับจุดตรวจแจ้งว่ายังบันทึกไม่ได้',ACK_MISMATCH:'คำยืนยันไม่ตรงกับร้านหรือขั้นตอนนี้',NETWORK_ERROR:'ติดต่อจุดรับบันทึกไม่ได้ อาจเป็นเครือข่ายหรือเบราว์เซอร์บล็อก'};
  return labels[reason]||'ยังตรวจสาเหตุการบันทึกไม่ได้';
}`;

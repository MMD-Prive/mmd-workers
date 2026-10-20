const ID=/^[a-f0-9]{32}$/;
export function guideTelegramPayload(env,event){
 const opened=event?.kind==='opened';
 if(opened){if(!ID.test(event?.request_id||'')||typeof event.name!=='string'||!event.name.trim()||event.name.length>120||!Number.isFinite(event.created_at))throw Error('invalid_guide_notification');}
 else {if(event?.kind&&event.kind!=='requested')throw Error('invalid_guide_notification');if(!ID.test(event?.request_id||'')||typeof event.name!=='string'||!event.name.trim()||event.name.length>80||!Number.isFinite(event.created_at))throw Error('invalid_guide_notification');}
 const chat=String(env.TELEGRAM_OPS_CHAT_ID||'');const topic=Number(env.TELEGRAM_ALERTS_THREAD_ID||env.TG_THREAD_ALERTS);
 if(!/^-?[0-9]+$/.test(chat)||!Number.isSafeInteger(topic)||topic<=0)throw Error('telegram_alert_not_configured');
 if(opened)return {chat_id:chat,message_thread_id:topic,text:'MY MODEL · มีผู้เปิดอ่านคู่มือแล้ว\nผู้รับลิงก์: '+event.name+'\nเปิดเมื่อ: '+new Date(event.created_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'long',timeStyle:'medium'})+' น. (ประเทศไทย)\n\nใช้สิทธิ์เปิดคู่มือครั้งแรกแล้ว',disable_notification:false,reply_markup:{inline_keyboard:[[{text:'ตรวจสถานะคู่มือ',url:'https://www.mmdbkk.com/docs/manage'}]]}};
 return {chat_id:chat,message_thread_id:topic,text:'MY MODEL · มีคำขออ่านคู่มือใหม่\nชื่อ: '+event.name+'\nเวลา: '+new Date(event.created_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})+'\n\nรอเปอร์พิจารณาอนุมัติ',disable_notification:false,link_preview_options:{is_disabled:true},reply_markup:{inline_keyboard:[[{text:'เปิดคำขอเพื่ออนุมัติ',url:'https://www.mmdbkk.com/docs/manage?request='+event.request_id}]]}};
}
export async function sendGuideOwnerTelegram(env,event,fetcher){
 let payload;try{payload=guideTelegramPayload(env,event);}catch{return {ok:false,error:'telegram_alert_not_configured',can_retry:false};}
 const token=String(env.AUTH_SERVICE_LINE_TO_TELEGRAM||'').trim();
 if(!token||!env.TELEGRAM_WORKER?.fetch&&!fetcher)return {ok:false,error:'telegram_bridge_not_configured',can_retry:false};
 // The existing bridge uses HTML by default. Escape the applicant's name as data.
 payload.text=payload.text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');payload.parse_mode='HTML';payload.disable_web_page_preview=true;payload.flow='alert';
 try{
  const request=new Request('https://telegram-worker/telegram/internal/send',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
  const r=await (fetcher?fetcher(request):env.TELEGRAM_WORKER.fetch(request));
  const d=await r.json().catch(()=>null),message=d?.telegram?.result;
  if(r.ok&&d?.ok===true&&d?.telegram?.ok===true&&Number.isSafeInteger(message?.message_id)&&String(message.chat?.id)===payload.chat_id&&message.message_thread_id===payload.message_thread_id){
   const button=message.reply_markup?.inline_keyboard?.[0]?.[0];
   return {ok:true,accepted:true,channel:'telegram',provider_request_id:String(message.message_id),chat_title:typeof message.chat.title==='string'?message.chat.title.slice(0,120):null,thread_id:message.message_thread_id,button_verified:button?.url===payload.reply_markup.inline_keyboard[0][0].url};
  }
  // The bridge may have sent before returning an error. Never duplicate uncertain sends.
  return {ok:false,error:'telegram_bridge_send_unconfirmed',http_status:r.status,can_retry:false};
 }catch{return {ok:false,error:'telegram_send_unconfirmed',can_retry:false};}
}

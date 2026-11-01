import {WorkerEntrypoint} from 'cloudflare:workers';
import {sendGuideOwnerTelegram} from './guide-telegram-notify.mjs';
export class GuideOwnerNotifications extends WorkerEntrypoint{
 async notifyGuideRequest(event){
  if(event?.channel!=='telegram')return {ok:false,error:'channel_changed',can_retry:false};
  const result=await sendGuideOwnerTelegram(this.env,event);
  console.log(JSON.stringify({event:'guide_telegram_delivery',kind:event.kind||'requested',request_id:event.request_id,...result}));
  return result;
 }
 async ownerProfile(){
  const env=this.env,chat=String(env.TELEGRAM_OPS_CHAT_ID||''),topic=Number(env.TELEGRAM_ALERTS_THREAD_ID||env.TG_THREAD_ALERTS),token=String(env.AUTH_SERVICE_LINE_TO_TELEGRAM||'').trim();
  if(!token||!env.TELEGRAM_WORKER?.fetch||! /^-?[0-9]+$/.test(chat)||!Number.isSafeInteger(topic)||topic<=0)return {ok:false,error:'telegram_alert_not_configured'};
  try{
   const r=await env.TELEGRAM_WORKER.fetch(new Request('https://telegram-worker/telegram/internal/router/health?probe=1',{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)}));
   const d=await r.json();if(![200,503].includes(r.status)||d.canonical_owner!=='telegram-worker'||d.transport?.live_probe?.bot_api_ok!==true)return {ok:false,error:'telegram_bridge_unavailable'};
   return {ok:true,oa_name:'Telegram Alert',recipient_name:'ห้องแจ้งเตือน MMD · Alert #'+topic,channel:'telegram'};
  }catch{return {ok:false,error:'telegram_bridge_unconfirmed'};}
 }
}


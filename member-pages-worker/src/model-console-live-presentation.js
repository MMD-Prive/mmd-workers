import {loadDoubleMomentCard} from './liff-promotion-client.js';
import {resolveDoubleMomentJobReturn} from '../../shared/double-moment-navigation.mjs';

function replaceOnce(html,anchor,replacement) {
  const index=html.indexOf(anchor);
  if(index<0||html.indexOf(anchor,index+anchor.length)>=0)throw Error('live_presentation_changed');
  return html.slice(0,index)+replacement+html.slice(index+anchor.length);
}

export async function applyConsolePresentation(request,response) {
  if(request.method!=='GET'||!response.headers.get('content-type')?.includes('text/html'))return response;
  const copy=response.clone(),html=await copy.text();
  if(!html.includes('id="credit-wallet"'))return response;
  try {
    const start='const loadDoubleMomentCard = ',end=';\n  const CANONICAL_POINTS_PATH = ';
    const index=html.indexOf(start),last=html.indexOf(end,index+start.length);
    if(index<0||last<0||html.indexOf(start,index+start.length)>=0)throw Error('live_presentation_changed');
    let updated=html.slice(0,index)+start+loadDoubleMomentCard.toString()+html.slice(last);
    const anchor='if (!items.length) return appendEmpty(container, copy.creditEmpty || copy.empty || "");';
    updated=replaceOnce(updated,anchor,anchor+"\n    const useCredits=document.createElement('a');useCredits.href='/member/double-moment';useCredits.textContent='เลือกชุดสิทธิ์สำหรับงานนี้';container.append(useCredits);");
    const url=new URL(request.url),raw=url.searchParams.get('liff.state')||url.searchParams.get('liff_state')||'';
    const state=new URLSearchParams(raw.includes('?')?raw.slice(raw.indexOf('?')+1):raw);
    const target=resolveDoubleMomentJobReturn(url.searchParams,state);
    if(target)updated=replaceOnce(updated,'profileReady = true;','profileReady = true;\n    window.location.replace('+JSON.stringify(target)+'); return;');
    const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('etag');headers.set('cache-control','no-store, private');
    return new Response(updated,{status:response.status,headers});
  }catch{
    return Response.json({ok:false,error:'console_presentation_unavailable'},{status:503,headers:{'cache-control':'no-store, private'}});
  }
}

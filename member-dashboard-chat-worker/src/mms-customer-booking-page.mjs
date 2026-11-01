const PAGE='/male-massage/member/mms-booking';
export function isMmsCustomerBookingPage(request){
  return new URL(request.url).pathname.replace(/\/$/,'')===PAGE;
}
// Static presentation only. Session and booking authority remain in existing APIs.
export async function handleMmsCustomerBookingPage(request,env){
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{allow:'GET, HEAD','cache-control':'no-store'}});
  try{
    if(!env.MMS_CUSTOMER_UI?.fetch)throw Error('unavailable');
    const upstream=await env.MMS_CUSTOMER_UI.fetch(new Request('https://mms-customer-ui.internal/booking/index.html',{method:request.method,headers:{accept:'text/html'},signal:AbortSignal.timeout(10000)}));
    if(!upstream.ok||!upstream.headers.get('content-type')?.includes('text/html'))throw Error('unavailable');
    const headers=new Headers(upstream.headers);
    headers.delete('set-cookie');
    headers.set('cache-control','no-store');
    headers.set('x-mmd-route-owner','member-dashboard-chat-worker');
    headers.set('x-mms-presentation','cloudflare-booking');
    headers.set('x-content-type-options','nosniff');
    return new Response(request.method==='HEAD'?null:upstream.body,{status:200,headers});
  }catch{
    return new Response('<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MY MMS</title><main><h1>ยังเปิดฟอร์มจองไม่ได้ครับ</h1><p>กรุณาลองใหม่อีกครั้ง ข้อมูลยังไม่ได้ส่ง</p><a href="'+PAGE+'">ลองใหม่</a></main></html>',{status:503,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
  }
}

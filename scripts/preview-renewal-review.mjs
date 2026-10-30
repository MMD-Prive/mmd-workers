// Local, synthetic acceptance only. No production requests or business writes.
import { createServer } from 'node:http';
import { createRenewalView, renewalViewHtml, RENEWAL_VIEW_CSS } from '../member-pages-worker/src/liff-renewal-view.js';
const server=createServer((request,response)=>{
  const html=`<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Renewal review · synthetic fixture</title><style>body{background:#101719;color:#fff;margin:0;font-family:system-ui}.fixture{padding:12px;background:#382e19;text-align:center}${RENEWAL_VIEW_CSS}</style><body><div class="fixture">LOCAL FIXTURE · ไม่มีข้อมูลลูกค้า / ไม่ส่งคำขอไป production</div>${renewalViewHtml()}<script>
  const ui=(${createRenewalView.toString()})({document,fetcher:async(path,init)=>{
    if(init?.method==='POST') throw new Error('fixture forbids purchases');
    return Response.json({ok:true,status:'contact_owner',reason:'renewal_expired_over_90_days_review_required',payment_available:false});
  },navigate:()=>{throw new Error('fixture forbids navigation')},showView:()=>{document.getElementById('renewal-card').hidden=false},checkoutUrl:()=>'',getBusy:()=>false,setBusy:()=>{}}); void ui.lookup();
  </script></body></html>`;
  response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}); response.end(html);
});
server.listen(8789,'127.0.0.1',()=>console.log('Synthetic Renewal review preview: http://127.0.0.1:8789'));

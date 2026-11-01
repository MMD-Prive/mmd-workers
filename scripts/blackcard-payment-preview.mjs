// Local UI fixture only: never connects to payment providers or Airtable.
import { createServer } from 'node:http';
import { myMmdBlackCardPaymentPage } from '../member-dashboard-chat-worker/src/my-mmd-blackcard-payment.js';
import { PERSONAL_MAINS } from '../shared/personal-main-catalog.mjs';
const states=new Map();
const base={ok:true,package_code:'black_card',amount_thb:35000,entitlement_granted:false,companions:PERSONAL_MAINS,companion:null,status:'not_started'};
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:4178');
  const key='fixture'; let state=states.get(key)||{...base};
  if(url.pathname==='/fixture/pending'){states.set(key,{...base,status:'pending_verification',can_choose_companion:true});res.writeHead(302,{location:'/my-mmd/payments/blackcard'});res.end();return;}
  if(url.pathname.startsWith('/member/api/liff/blackcard/')){
    let body='';for await(const chunk of req)body+=chunk;
    const action=url.pathname.split('/').pop();
    if(action==='purchase'){state={...state,status:'awaiting_payment'};states.set(key,state);}
    if(action==='companion'){const id=JSON.parse(body).companion_id;state={...state,companion:PERSONAL_MAINS.find(item=>item.id===id)};states.set(key,state);}
    const payload=action==='instructions'?{...state,instructions:{promptpay:{enabled:false},bank_transfer:{enabled:true,bank_name_th:'บัญชีทดสอบ — ห้ามโอนจริง',account_name_th:'ข้อมูลจำลองสำหรับตรวจหน้าจอ',account_number:'TEST-ONLY'}}}:state;
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(payload));return;
  }
  const response=myMmdBlackCardPaymentPage(new Request('http://127.0.0.1:4178/my-mmd/payments/blackcard'));
  res.writeHead(200,{'content-type':'text/html'});res.end((await response.text()).replace('<main>','<main><small>LOCAL TEST FIXTURE · ห้ามชำระเงินจริง</small>'));
});
server.listen(4178,'0.0.0.0',()=>console.log('Black Card local fixture http://127.0.0.1:4178/my-mmd/payments/blackcard'));

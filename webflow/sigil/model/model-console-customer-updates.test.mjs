import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {travelClientBundle} from '../../../shared/model-travel-client-source.mjs';
import {installConsoleCustomerUpdates} from './model-console-customer-updates.mjs';
const settle=async()=>{for(let n=0;n<12;n++)await new Promise(setImmediate);};

async function fixture({canSend=true,delivered=true}={}){
  const dom=new JSDOM('<!doctype html><html lang="th"><body><section id="sigil-model-console-v3"><main data-view="work"><a data-support="urgent">ขอความช่วยเหลือ</a><details class="smcv3-card"><summary>ติดต่อเปอร์</summary><textarea data-note></textarea><a data-support="update">ส่งผ่าน HYPE</a></details></main></section></body></html>',{url:'https://mmdbkk.com/sigil/model/console',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,writes=[],submissions=[];
  w.fetch=async(url,options={})=>{
    assert.ok(String(url).startsWith('/v1/model/session/travel'));
    if(options.method==='POST'){
      const body=JSON.parse(options.body);writes.push(body);
      if(body.action==='prepare')return Response.json({ok:true,id:'fixture-receipt'});
      assert.equal(body.action,'commit');submissions.push({id:body.id,state:'saved',text:writes[0].text,photos:[],delivery:{delivered}});
      return Response.json({ok:true,delivery:{delivered}});
    }
    return Response.json({ok:true,session_id:'fixture-session',state:'en_route',binding:'fixture-binding',revision:1,server_now:new Date().toISOString(),can_send:canSend,messages_remaining:3-submissions.length,photos_remaining:3,submissions,eta:{status:'missing'}});
  };
  w.eval(travelClientBundle()+'window.mountFixture=mountTravelPanel;');
  const controller=installConsoleCustomerUpdates(w.document),host=w.document.querySelector('main');
  w.mountFixture(host,{role:'model',sessionId:'fixture-session',state:'en_route',locale:'th'});await settle();
  return {dom,w,writes,host,controller,close(){host._mmdTravel.destroy();controller.destroy();w.close();}};
}
test('routine Console text uses the existing customer composer while urgent support stays separate',async()=>{
  const f=await fixture();try{
    assert.equal(f.w.document.querySelector('[data-note]'),null);
    assert.equal(f.w.document.querySelector('[data-support="update"]'),null);
    assert.ok(f.w.document.querySelector('[data-support="urgent"]'));
    const panel=f.w.document.querySelector('[data-console-customer-updates]');
    assert.equal(panel.querySelector('h3').textContent,'คุยกับลูกค้า');
    assert.match(panel.querySelector('textarea').placeholder,/15 นาที/);
    assert.equal(installConsoleCustomerUpdates(f.w.document),f.controller);
    assert.equal(f.w.document.querySelectorAll('[data-mmd-travel="model"]').length,1);
  }finally{f.close();}
});
test('traffic update prepares and commits directly to the authenticated customer transport, without Per approval',async()=>{
  const f=await fixture();try{
    const input=f.w.document.querySelector('[data-console-customer-updates] textarea');
    input.value='รถติด น่าจะถึงช้าประมาณ 15 นาทีครับ';
    input.closest('form').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await settle();
    assert.deepEqual(f.writes.map(x=>x.action),['prepare','commit']);
    assert.equal(f.writes[0].session_id,'fixture-session');assert.match(f.writes[0].text,/15 นาที/);
    assert.equal(input.value,'');
    assert.match(f.w.document.querySelector('[data-console-customer-updates]').textContent,/LINE รับการแจ้งเตือนแล้ว/);
  }finally{f.close();}
});
test('unavailable delivery never claims LINE success and a denied send capability stays locked',async()=>{
  const f=await fixture({delivered:false});try{
    const input=f.w.document.querySelector('[data-console-customer-updates] textarea');input.value='Fixture update';
    input.closest('form').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await settle();
    assert.doesNotMatch(f.host.textContent,/LINE รับการแจ้งเตือนแล้ว/);
    assert.match(f.host.textContent,/ยังยืนยันการแจ้ง LINE ไม่ได้/);
  }finally{f.close();}
  const denied=await fixture({canSend:false});try{
    assert.equal(denied.w.document.querySelector('[data-console-customer-updates] textarea').disabled,true);
    assert.equal(denied.writes.length,0);
  }finally{denied.close();}
});

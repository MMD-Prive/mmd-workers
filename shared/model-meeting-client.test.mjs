import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {webcrypto} from 'node:crypto';
import {mountMeetingDetails} from './model-meeting-client.mjs';

const settle=async()=>{for(let n=0;n<16;n++)await new Promise(setImmediate);};
function ui(role='customer',action=async()=>({ok:true,session:{normalized_state:'en_route'}})) {
  const dom=new JSDOM('<main></main>',{url:'https://mmdbkk.com/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,writes=[];
  Object.defineProperty(w,'crypto',{value:webcrypto});w.TextEncoder=TextEncoder;
  const mount=w.eval('('+mountMeetingDetails.toString()+')');
  const snapshot={session_id:'sess_fixture',binding:'binding',context_binding:'context-1',appointment_location:'Agreed venue',can_edit_meeting:role==='customer',can_edit_transport:role==='model',can_report_wrong_location:role==='model'};
  let controller;
  controller=mount(w.document.querySelector('main'),{role,post:async body=>{writes.push(body);if(body.details?.venue_type)snapshot.meeting_details=body.details;else snapshot.transport_details=body.details;return {ok:true};},
    action:async body=>{writes.push(body);return action(body);},refresh:async()=>controller.update(snapshot)});
  controller.update(snapshot);
  const field=name=>[...controller.element.querySelectorAll('label')].find(label=>label.querySelector('span')?.textContent===name)?.querySelector('input,select');
  const submit=form=>form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  return {w,dom,controller,snapshot,writes,field,submit,close:()=>w.close()};
}

test('condo and hotel capture lobby, room, security, pickup and drop-off; house uses a string house number instead',async()=>{
  const f=ui();try{
    const form=f.controller.element.querySelector('[data-meeting-details]');
    f.field('ประเภทสถานที่').value='condo';f.field('ประเภทสถานที่').dispatchEvent(new f.w.Event('change'));
    assert.equal(f.field('จุดนัดพบ').value,'Lobby');
    f.field('เจ้าหน้าที่ต้องใช้เลขห้อง').checked=true;form.dispatchEvent(new f.w.Event('input'));
    f.submit(form);await settle();assert.equal(f.writes.length,0,'room is required for security');
    f.field('เลขห้อง').value='0012';f.field('ชั้น').value='12A';f.field('อาคาร / ตึก').value='A';
    f.field('ลูกค้าต้องลงมารับ').checked=true;f.field('จุดลงรถ / ที่จอดรถ / การติดต่อเจ้าหน้าที่').value='East lobby drop-off';
    f.submit(form);await settle();
    assert.equal(f.writes[0].details.room_number,'0012');assert.equal(f.writes[0].details.pickup_required,true);
    assert.equal(f.writes[0].context_binding,'context-1');assert.equal(Object.hasOwn(f.writes[0].details,'location_name'),false);
    f.field('ประเภทสถานที่').value='home';form.dispatchEvent(new f.w.Event('input'));
    assert.equal(f.field('เลขห้อง').closest('label').hidden,true);assert.equal(f.field('เลขที่บ้าน').type,'text');
    f.field('เลขที่บ้าน').value='0012/3';f.field('จุดนัดพบ').value='Front gate';f.submit(form);await settle();
    assert.equal(f.writes[1].details.house_number,'0012/3');assert.equal(f.writes[1].details.room_number,'');
    assert.equal(f.writes[1].details.security_requires_room,false);
    f.field('ประเภทสถานที่').value='hotel';form.dispatchEvent(new f.w.Event('input'));f.field('จุดนัดพบ').value='Hotel lobby';f.submit(form);await settle();
    assert.equal(f.writes[2].details.venue_type,'hotel');
  }finally{f.close();}
});

test('model wrong-location report requires current place, transport and whole minutes, and reuses a key after an unknown result',async()=>{
  let lost=true;const f=ui('model',async()=>{if(lost){lost=false;throw Error('response lost');}return {ok:true,session:{normalized_state:'en_route'}};});
  try{
    f.controller.openWrongLocation();const form=f.controller.element.querySelector('[data-wrong-location]');
    f.submit(form);await settle();assert.equal(f.writes.length,0);
    f.field('ตอนนี้ไปอยู่ที่ไหน').value='Wrong hotel';f.field('จากจุดนี้ถึงสถานที่นัดเดิมอีกกี่นาที').value='18';
    const transport=form.querySelector('select');transport.value='grab_taxi';f.submit(form);await settle();
    f.submit(form);await settle();assert.equal(f.writes.length,2);
    assert.equal(f.writes[0].report.report_id,f.writes[1].report.report_id);assert.equal(f.writes[1].report.eta_minutes,18);
    assert.equal(f.writes[1].context_binding,'context-1');
    assert.equal(f.controller.element.textContent.includes('Agreed venue'),true);
    for(let n=0;n<f.w.sessionStorage.length;n++)assert.doesNotMatch(f.w.sessionStorage.getItem(f.w.sessionStorage.key(n)),/Wrong hotel/);
  }finally{f.close();}
});

test('polling cannot unlock an in-flight report, and a changed appointment clears old room and report drafts',async()=>{
  let finish;const f=ui('model',()=>new Promise(resolve=>finish=resolve));
  try{
    f.field('ตอนนี้ไปอยู่ที่ไหน').value='Wrong place';f.field('จากจุดนี้ถึงสถานที่นัดเดิมอีกกี่นาที').value='12';
    const form=f.controller.element.querySelector('[data-wrong-location]');form.querySelector('select').value='private_car';f.submit(form);await settle();
    f.controller.update(f.snapshot,false);assert.equal(form.querySelector('button').disabled,true);
    finish({ok:true,session:{normalized_state:'en_route'}});await settle();
    f.field('ตอนนี้ไปอยู่ที่ไหน').value='Old private location';f.snapshot.context_binding='context-2';f.controller.update(f.snapshot);
    assert.equal(f.field('ตอนนี้ไปอยู่ที่ไหน').value,'');
  }finally{f.close();}
  const customer=ui();try{
    customer.field('เลขห้อง').value='Old room';customer.field('เลขห้อง').focus();
    customer.snapshot.context_binding='context-2';customer.controller.update(customer.snapshot);
    assert.equal(customer.field('เลขห้อง').value,'');
  }finally{customer.close();}
});

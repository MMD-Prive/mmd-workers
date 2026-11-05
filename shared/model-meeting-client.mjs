export function mountMeetingDetails(host, options) {
  const role=options.role, make=(tag,label,parent)=>{const node=document.createElement(tag);if(label)node.textContent=label;parent?.append(node);return node;};
  let data,locale='th',dirty=false,locked=false,writing=false,binding='';
  if(!document.getElementById('mmd-meeting-details-css')){const style=document.createElement('style');style.id='mmd-meeting-details-css';style.textContent='.mt9-meeting select{display:block;width:100%;min-height:44px;margin-top:6px;border:1px solid currentColor;border-radius:6px;background:transparent;color:inherit;padding:10px;font:inherit}.mt9-meeting input[type=checkbox]{display:inline-block;width:20px;min-height:20px;margin:0 8px;vertical-align:middle}.mt9-meeting label:has(input[type=checkbox]){display:flex;align-items:center;justify-content:space-between;gap:8px}';document.head.append(style);}
  const copy=()=>({
    th:['สถานที่นัดเดิม','รายละเอียดเข้าพบ','ประเภทสถานที่','เลือกประเภทสถานที่','บ้าน','คอนโด','โรงแรม','จุดนัดพบ','เลขที่บ้าน','อาคาร / ตึก','ชั้น','เลขห้อง','เจ้าหน้าที่ต้องใช้เลขห้อง','ลูกค้าต้องลงมารับ','จุดลงรถ / ที่จอดรถ / การติดต่อเจ้าหน้าที่','บันทึกรายละเอียดเข้าพบ','วิธีเดินทาง','เลือกวิธีเดินทาง','Grab / Taxi','รถส่วนตัว','อื่น ๆ','บันทึกวิธีเดินทาง','แจ้งไปผิดสถานที่','ตอนนี้ไปอยู่ที่ไหน','จากจุดนี้ถึงสถานที่นัดเดิมอีกกี่นาที','แจ้งจุดที่ไปผิดและเวลาถึงใหม่','บันทึกแล้ว','ยังยืนยันการบันทึกไม่ได้ กรุณาลองอีกครั้ง','ต้องลงมารับ','ไม่ต้องลงมารับ','ไปผิดสถานที่','กำลังไปสถานที่นัดเดิม'],
    en:['Agreed venue','Meeting details','Venue type','Choose venue type','House','Condo','Hotel','Meeting point','House number','Building / tower','Floor','Room number','Security needs the room number','Customer must come down to meet','Drop-off / parking / security instructions','Save meeting details','Transport','Choose transport','Grab / Taxi','Private car','Other','Save transport','Report wrong location','Where are you now?','Minutes from here to the agreed venue','Report wrong location and new ETA','Saved','Save not confirmed. Please try again.','Customer will come down','No pickup required','Wrong location reported','Travelling to the agreed venue'],
    zh:['原定地点','会合详情','地点类型','选择地点类型','住宅','公寓','酒店','会合地点','门牌号','楼栋','楼层','房号','保安需要房号','客户需要下楼接人','下车 / 停车 / 保安说明','保存会合详情','交通方式','选择交通方式','Grab / 出租车','私家车','其他','保存交通方式','报告走错地点','现在在哪里','从这里到原定地点还需几分钟','报告位置和新的预计时间','已保存','尚未确认保存，请重试','客户下楼接人','无需接人','已报告走错地点','正在前往原定地点'],
  }[locale] || []);
  const element=make('div','',host);element.className='mt9-meeting';
  const venue=make('p','',element),saved=make('p','',element),incident=make('p','',element),status=make('p','',element);status.setAttribute('role','status');
  const editor=make('details','',element),editorTitle=make('summary','',editor),form=make('form','',editor);
  form.dataset.meetingDetails='1';
  const labels=[];
  function field(parent,index,type='text') {const label=make('label','',parent),caption=make('span','',label),input=make('input','',label);input.type=type;labels.push([caption,index]);return input;}
  function select(parent,index,values,indices) {const label=make('label','',parent),caption=make('span','',label),input=make('select','',label);labels.push([caption,index]);for(let n=0;n<values.length;n++){const option=make('option','',input);option.value=values[n];labels.push([option,indices[n]]);}return input;}
  const type=select(form,2,['','home','condo','hotel'],[3,4,5,6]);type.required=true;
  const point=field(form,7);point.required=true;point.maxLength=180;
  const house=field(form,8);house.maxLength=40;house.inputMode='text';house.placeholder='12/3';
  const building=field(form,9);building.maxLength=100;
  const floor=field(form,10);floor.maxLength=20;floor.inputMode='text';
  const room=field(form,11);room.maxLength=40;room.inputMode='text';room.placeholder='0012 / A1205';
  const security=field(form,12,'checkbox'),pickup=field(form,13,'checkbox'),access=field(form,14);access.maxLength=240;
  const save=make('button','',form);save.type='submit';
  const transportEditor=make('details','',element),transportTitle=make('summary','',transportEditor),transportForm=make('form','',transportEditor);
  const modes=['','grab_taxi','private_car','other'],modeNames=[17,18,19,20];
  const transport=select(transportForm,16,modes,modeNames);transport.required=true;
  const transportSave=make('button','',transportForm);transportSave.type='submit';
  const reportEditor=make('details','',element),reportTitle=make('summary','',reportEditor),reportForm=make('form','',reportEditor);
  reportForm.dataset.wrongLocation='1';
  const place=field(reportForm,23);place.required=true;place.maxLength=240;
  const minutes=field(reportForm,24,'number');minutes.required=true;minutes.min='1';minutes.max='240';minutes.step='1';minutes.inputMode='numeric';
  const reportTransport=select(reportForm,16,modes,modeNames);reportTransport.required=true;
  const reportSave=make('button','',reportForm);reportSave.type='submit';
  function conditional() {const home=type.value==='home';house.closest('label').hidden=!home;house.required=home;
    for(const input of [building,floor,room,security])input.closest('label').hidden=home;
    room.required=!home&&security.checked;}
  form.addEventListener('input',()=>{dirty=true;conditional();});
  type.addEventListener('change',()=>{if(!point.value.trim()&&['condo','hotel'].includes(type.value))point.value='Lobby';conditional();});
  function setLocked(value) {locked=value;for(const node of element.querySelectorAll('input,select,button'))node.disabled=value;}
  async function submit(formNode,body,onSuccess=()=>{}) {
    if(locked||!formNode.reportValidity())return;
    writing=true;setLocked(true);try {await options.post({...body(),context_binding:data.context_binding});status.textContent=copy()[26];onSuccess();await options.refresh();}
    catch {status.textContent=copy()[27];}finally {writing=false;update(data,false,locale);}
  }
  form.onsubmit=event=>{event.preventDefault();if(!data?.can_edit_meeting)return;submit(form,()=>({action:'save_meeting_details',details:{venue_type:type.value,meeting_point:point.value,
    house_number:type.value==='home'?house.value:'',building:type.value==='home'?'':building.value,floor:type.value==='home'?'':floor.value,
    room_number:type.value==='home'?'':room.value,security_requires_room:type.value!=='home'&&security.checked,pickup_required:pickup.checked,vehicle_access_note:access.value}}),()=>{dirty=false;editor.open=false;});};
  transportForm.onsubmit=event=>{event.preventDefault();if(!data?.can_edit_transport)return;submit(transportForm,()=>({action:'save_transport',details:{mode:transport.value}}));};
  reportForm.onsubmit=async event=>{
    event.preventDefault();if(locked||!data?.can_report_wrong_location||!reportForm.reportValidity())return;
    writing=true;setLocked(true);
    try {
      const report={current_place:place.value.trim(),eta_minutes:Number(minutes.value),transport_mode:reportTransport.value},sessionId=data.session_id,contextBinding=data.context_binding;
      const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([contextBinding,report])))),n=>n.toString(16).padStart(2,'0')).join('');
      const key='mmd-location-report:'+sessionId;let pending;try {pending=JSON.parse(sessionStorage.getItem(key)||'null');}catch{}
      if(pending?.digest!==digest)pending={digest,key:crypto.randomUUID()};
      try {sessionStorage.setItem(key,JSON.stringify(pending));}catch{}
      const result=await options.action({action:'report_wrong_location',session_id:sessionId,context_binding:contextBinding,report:{...report,report_id:pending.key}});
      if(result?.ok!==true||result.session?.normalized_state!=='en_route')throw Error('unconfirmed');
      try {sessionStorage.removeItem(key);}catch{}
      status.textContent=copy()[26];place.value='';minutes.value='';reportEditor.open=false;
      await options.refresh();options.onReportSaved?.();
    } catch {status.textContent=copy()[27];}finally {writing=false;update(data,false,locale);}
  };
  function update(next,busy=false,lang='th') {
    data=next;locale=lang;
    const words=copy(),details=data?.meeting_details;
    const changed=binding!==data?.context_binding;
    if(changed){binding=data?.context_binding;dirty=false;place.value='';minutes.value='';reportTransport.value='';reportEditor.open=false;status.textContent='';}
    for(const [node,index] of labels)node.textContent=words[index];
    editorTitle.textContent=words[1];transportTitle.textContent=words[16];reportTitle.textContent=words[22];
    save.textContent=words[15];transportSave.textContent=words[21];reportSave.textContent=words[25];
    venue.textContent=data?.appointment_location?words[0]+': '+data.appointment_location:'';
    const mode=data?.transport_details?.mode,modeLabel=modeNames[modes.indexOf(mode)];
    saved.textContent=details?[words[{home:4,condo:5,hotel:6}[details.venue_type]],details.meeting_point,
      ...[[8,'house_number'],[9,'building'],[10,'floor'],[11,'room_number'],[14,'vehicle_access_note']].filter(([,key])=>details[key]).map(([index,key])=>words[index]+': '+details[key]),
      words[details.pickup_required?28:29],details.security_requires_room?words[12]:'',mode?words[16]+': '+words[modeLabel]:''].filter(Boolean).join('\n'):mode?words[16]+': '+words[modeLabel]:'';
    saved.hidden=!saved.textContent;
    const issue=data?.eta?.location_report;
    incident.textContent=issue?[words[30]+': '+issue.current_place,words[31]+': '+issue.agreed_location,words[16]+': '+words[modeNames[modes.indexOf(issue.transport_mode)]]].join('\n'):'';incident.hidden=!issue;
    editor.hidden=role!=='customer'||data?.can_edit_meeting!==true;
    transportEditor.hidden=role!=='model'||data?.can_edit_transport!==true;
    reportEditor.hidden=role!=='model'||data?.can_report_wrong_location!==true;
    if(!dirty&&(changed||document.activeElement?.closest('form')!==form)){type.value=details?.venue_type||'';point.value=details?.meeting_point||'';
      for(const [input,key] of [[house,'house_number'],[building,'building'],[floor,'floor'],[room,'room_number'],[access,'vehicle_access_note']])input.value=details?.[key]||'';
      security.checked=details?.security_requires_room===true;pickup.checked=details?.pickup_required===true;conditional();}
    if(document.activeElement!==transport)transport.value=mode||'';
    if(!reportTransport.value)reportTransport.value=mode||'';
    setLocked(busy||writing);
    for(const container of [editor,transportEditor,reportEditor])for(const input of container.querySelectorAll('input,select,button'))input.disabled=busy||writing||container.hidden;
  }
  update(null);
  return {element,update,openWrongLocation(){if(role==='model'&&data?.can_report_wrong_location){reportEditor.open=true;place.focus();}},destroy(){element.remove();}};
}

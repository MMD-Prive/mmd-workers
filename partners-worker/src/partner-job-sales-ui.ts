export const PARTNER_JOB_SALES_JS = String.raw`
  function mountJobSales(host, sessionId) {
    var section=document.createElement('section');section.className='pcr-job-sales';
    section.innerHTML='<h4>วิธีขายของงานนี้</h4><p data-sales-status role="status">กำลังโหลดข้อเสนอ</p><div data-sales-editor></div>';
    host.append(section);
    var current=null, busy=false, savedInput=null;
    var status=section.querySelector('[data-sales-status]'),editor=section.querySelector('[data-sales-editor]');
    function active(){return section.isConnected&&!state.authBlocked;}
    function fields(form){return {system:form.elements.system.value,source_rate_thb:form.elements.source_rate_thb.value,customer_sell_rate_thb:form.elements.customer_sell_rate_thb.value,commission_percent:form.elements.commission_percent.value,partner_share_percent:form.elements.partner_share_percent.value,note:form.elements.note.value};}
    function render(keep) {
      var value=keep||current.proposal||{};
      editor.innerHTML='<form data-job-sales-form class="pcr-form"><fieldset><legend>เลือกวิธีขาย</legend><label>ระบบขาย<select name="system" required><option value="">เลือกวิธีขาย</option><option value="bridge">Bridge</option><option value="co_partner">รวมโม</option><option value="profit_share">หารกำไร</option></select></label></fieldset><div class="pcr-form-grid"><label>ยอดถึงนายแบบ (THB)<input name="source_rate_thb" type="number" min="0" max="1000000" step="any" required></label><label>ราคาขาย (THB)<input name="customer_sell_rate_thb" type="number" min="0" max="1000000" step="any" required></label><label data-bridge-field>ค่าแนะนำ Bridge (%)<input name="commission_percent" type="number" min="5" max="10" step="any"></label><label data-profit-field>ส่วนแบ่ง Partner (%)<input name="partner_share_percent" type="number" min="0.01" max="99.99" step="any"></label><label class="wide">หมายเหตุข้อตกลง<textarea name="note" maxlength="1200"></textarea></label></div><p>บันทึกเป็นข้อเสนอของงานนี้ รอเปอร์ตรวจข้อตกลงและยอด ส่วนแบ่งจะยึดฐานเงินรับจริงและค่าใช้จ่ายที่ยืนยัน</p><label class="pcr-consent"><input name="share_with_mmd" type="checkbox" required>ยืนยันส่งข้อเสนอของงานนี้ให้ MMD ตรวจ</label><div class="pcr-job-sales-actions"><button type="submit">บันทึกข้อเสนอของงานนี้</button><button type="button" class="ghost" data-sales-reload>โหลดข้อเสนอล่าสุด</button></div></form>';
      var form=editor.querySelector('form');
      Object.keys(value).forEach(function(key){if(form.elements[key])form.elements[key].value=value[key]==null?'':String(value[key]);});
      function toggle(){var bridge=form.elements.system.value==='bridge',profit=form.elements.system.value==='profit_share';form.querySelector('[data-bridge-field]').hidden=!bridge;form.querySelector('[data-profit-field]').hidden=!profit;form.elements.commission_percent.required=bridge;form.elements.partner_share_percent.required=profit;}
      toggle();form.oninput=function(){savedInput=fields(form);};form.elements.system.onchange=toggle;
      form.querySelector('[data-sales-reload]').onclick=function(){if(busy)return;savedInput=fields(form);load(savedInput);};
      if(!current.editable){Array.from(form.elements).forEach(function(el){el.disabled=true;});status.textContent='งานเริ่มแล้วหรือปิดยอดแล้ว · ติดต่อเปอร์เพื่อตรวจข้อตกลง';return;}
      form.onsubmit=async function(event){
        event.preventDefault();if(busy||state.stale||state.authBlocked||!form.reportValidity())return;
        savedInput=fields(form);
        var payload=Object.assign({},savedInput,{session_record_id:sessionId,revision:current.revision,job_revision:current.job_revision,share_with_mmd:form.elements.share_with_mmd.checked});
        ['source_rate_thb','customer_sell_rate_thb','commission_percent','partner_share_percent'].forEach(function(key){payload[key]=payload[key]===''?null:Number(payload[key]);});
        busy=true;Array.from(form.elements).forEach(function(el){el.disabled=true;});status.textContent='กำลังบันทึกข้อเสนอ';
        try {
          var response=await api('/v1/partner/jobs/sales-proposal',{method:'POST',headers:{'content-type':'application/json','Idempotency-Key':stableSubmissionKey('job-sales',payload)},body:JSON.stringify(payload)});
          if(!active())return;completedSubmission('job-sales',payload);current=response;savedInput=null;render(null);status.textContent='บันทึกข้อเสนอของงานนี้แล้ว · รอเปอร์ตรวจ';
        } catch(error){if(active()){status.textContent=error.message+' · ข้อมูลที่กรอกยังอยู่ กรุณาโหลดข้อเสนอล่าสุดและตรวจรายละเอียดงานก่อนส่งอีกครั้ง';}}
        finally {busy=false;if(active()){var latest=editor.querySelector('form');if(latest&&current.editable)Array.from(latest.elements).forEach(function(el){el.disabled=false;});}}
      };
    }
    async function load(keep){
      busy=true;
      try {var response=await api('/v1/partner/jobs/sales-proposal?session_record_id='+encodeURIComponent(sessionId));if(!active())return;current=response;render(keep);status.textContent=response.proposal?(response.proposal.status==='job_changed'?'รายละเอียดงานเปลี่ยน · ตรวจงานและข้อเสนอใหม่':'ข้อเสนอที่บันทึกไว้ · รอเปอร์ตรวจ'):'ยังไม่มีข้อเสนอสำหรับงานนี้';}
      catch(error){if(active()){status.textContent='โหลดข้อเสนอไม่ได้ · '+error.message;if(!current){editor.innerHTML='<button type="button" class="ghost" data-sales-retry>ลองอีกครั้ง</button>';editor.querySelector('button').onclick=function(){load(keep);};}}}
      finally{busy=false;}
    }
    load(null);
  }
`;
export const PARTNER_JOB_SALES_CSS = `
[data-partner-control-room] .pcr-job-sales{margin-top:20px;padding:16px;border:1px solid var(--pcr-line,#b9a58d);border-radius:12px;min-width:0}
[data-partner-control-room] .pcr-job-sales form,[data-partner-control-room] .pcr-job-sales fieldset{min-width:0}
[data-partner-control-room] .pcr-job-sales input,[data-partner-control-room] .pcr-job-sales select,[data-partner-control-room] .pcr-job-sales textarea{box-sizing:border-box;width:100%;min-width:0;min-height:44px;font:inherit}
[data-partner-control-room] .pcr-job-sales input[type=checkbox]{width:22px;min-height:22px;flex-shrink:0}
[data-partner-control-room] .pcr-job-sales-actions{display:flex;gap:10px;flex-wrap:wrap}
[data-partner-control-room] .pcr-job-sales button{min-height:44px;white-space:normal}
@media(max-width:430px){[data-partner-control-room] .pcr-job-sales .pcr-form-grid{grid-template-columns:minmax(0,1fr)}}
`;

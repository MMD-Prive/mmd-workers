(()=>{'use strict';
if(location.pathname.replace(/\/+$/,'')!=='/internal/admin/jobs/create-job')return;
const boot=()=>{
  const root=document.getElementById('mmd-cj-split-v1');
  if(!root||root.dataset.dropdownFix==='v4')return;
  root.dataset.dropdownFix='v4';

  const scopeSelect=(target)=>target instanceof HTMLSelectElement&&['folder','gender','privateWork'].includes(target.dataset.cj||'');

  // The split-page runtime has a generic bubbling `input` listener that calls
  // update() for every field. Native <select> emits `input` before `change`.
  // That update rebuilt the Folder options and restored the previous state value
  // before the change handler could persist the newly selected value.
  // Stop only these select-input events; their existing `change` handler remains
  // the single writer for state.folder/state.gender/state.privateWork.
  root.addEventListener('input',(event)=>{
    if(scopeSelect(event.target))event.stopImmediatePropagation();
  },true);

  const chips=root.querySelector('.mmd-cj__chips');
  if(chips){
    chips.setAttribute('aria-label','ตัวเลือกเพิ่มเติม ไม่บังคับ');
    chips.dataset.optional='true';
    if(!root.querySelector('[data-cj-optional-hint]')){
      const hint=document.createElement('p');
      hint.dataset.cjOptionalHint='1';
      hint.className='mmd-cj__optionalHint';
      hint.textContent='ตัวเลือกเพิ่มเติม · ไม่บังคับ — MK / Burn / Kiss / Live เลือกเฉพาะเมื่อใช้กับงานนี้';
      chips.before(hint);
    }
  }

  if(!document.getElementById('mmd-create-job-dropdown-fix-v4-css')){
    const style=document.createElement('style');
    style.id='mmd-create-job-dropdown-fix-v4-css';
    style.textContent='#mmd-cj-split-v1 .mmd-cj__optionalHint{margin:2px 16px 8px;color:var(--meta);font-size:11px;line-height:1.5}#mmd-cj-split-v1 .mmd-cj__chips[data-optional="true"]{padding-top:0}';
    document.head.appendChild(style);
  }
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

// Create Job LV5 patch
// Production page: /internal/admin/jobs/create-job
// Adds a working right-panel Draft resume control and Kenji visual asset to all 5 flow stages.
// Webflow asset: "Kenji sigil start.webp" (asset id 6ab030ae56be7bcca053d2cd)

<script id="mmd-create-job-lv5-draft-kenji">
(()=>{'use strict';
const root=document.getElementById('mmd-cj-split-v1');if(!root||root.dataset.lv5DraftKenji==='1')return;root.dataset.lv5DraftKenji='1';
const K='https://s3.amazonaws.com/webflow-prod-assets/68f879d546d2f4e2ab186e90/6ab030ae56be7bcca053d2cd_Kenji%20sigil%20start.webp';
const D='mmd.create-job.draft.v1',q=k=>root.querySelector('[data-cj="'+k+'"]'),qa=s=>Array.from(root.querySelectorAll(s));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const waitFor=async(fn,ms=9000)=>{const end=Date.now()+ms;while(Date.now()<end){try{const v=fn();if(v)return v}catch{}await sleep(100)}return null};
function injectStyle(){if(document.getElementById('mmd-cj-lv5-patch-style'))return;const s=document.createElement('style');s.id='mmd-cj-lv5-patch-style';s.textContent=`
.mmd-cj__cardHead{position:relative;padding-right:96px!important}
.mmd-cj__kenjiAsset{position:absolute;right:18px;top:18px;width:64px;height:64px;border-radius:18px;overflow:hidden;border:1px solid rgba(224,190,105,.55);box-shadow:0 12px 30px rgba(0,0,0,.22);background:#111713}
.mmd-cj__kenjiAsset img{width:100%;height:100%;display:block;object-fit:cover;object-position:center top}
.mmd-cj__draftPanel{margin:14px 0 18px;padding:14px;border:1px solid rgba(224,190,105,.3);border-radius:16px;background:rgba(224,190,105,.055)}
.mmd-cj__draftPanelHead{display:flex;align-items:center;gap:10px;margin-bottom:10px}.mmd-cj__draftPanelHead img{width:40px;height:40px;border-radius:12px;object-fit:cover;object-position:center top;border:1px solid rgba(224,190,105,.45)}
.mmd-cj__draftPanelHead span{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#dbbd76}.mmd-cj__draftPanel b{display:block;font-size:14px;line-height:1.4;color:#f7f2e8}.mmd-cj__draftPanel small{display:block;margin-top:5px;line-height:1.45;color:#aaa59c}
.mmd-cj__draftOpen{width:100%;margin-top:12px;padding:11px 12px;border:0;border-radius:12px;background:#dfbf72;color:#17140d;font-weight:900;cursor:pointer}.mmd-cj__draftOpen:disabled{opacity:.35;cursor:not-allowed}
.mmd-cj__draftPanel[data-busy="1"] .mmd-cj__draftOpen{opacity:.55;pointer-events:none}
@media(max-width:767px){.mmd-cj__cardHead{padding-right:76px!important}.mmd-cj__kenjiAsset{right:12px;top:14px;width:50px;height:50px;border-radius:15px}}
`;document.head.appendChild(s)}
function addKenji(){qa('.mmd-cj__card[data-step] .mmd-cj__cardHead').forEach(h=>{if(h.querySelector('.mmd-cj__kenjiAsset'))return;const w=document.createElement('span');w.className='mmd-cj__kenjiAsset';w.setAttribute('aria-hidden','true');w.innerHTML='<img src="'+K+'" alt="" loading="lazy" decoding="async">';h.appendChild(w)})}
function readDraft(){try{const d=JSON.parse(localStorage.getItem(D)||'null');return d&&d.version===1&&d.fields?d:null}catch{return null}}
function dt(v){try{return new Intl.DateTimeFormat('th-TH',{dateStyle:'short',timeStyle:'short'}).format(new Date(v))}catch{return''}}
function ensurePanel(){const side=root.querySelector('.mmd-cj__side');if(!side)return null;let p=q('draftResumePanel');if(!p){p=document.createElement('section');p.className='mmd-cj__draftPanel';p.setAttribute('data-cj','draftResumePanel');p.innerHTML='<div class="mmd-cj__draftPanelHead"><img src="'+K+'" alt="" aria-hidden="true"><span>Kenji · Draft</span></div><b data-cj="draftResumeTitle">ยังไม่มี Draft</b><small data-cj="draftResumeMeta">ระบบจะเก็บงานที่ยังทำไม่เสร็จให้อัตโนมัติ</small><button type="button" class="mmd-cj__draftOpen" data-cj="draftResumeOpen" disabled>เปิด Draft</button>';const top=side.querySelector('.mmd-cj__sideTop');top?top.insertAdjacentElement('afterend',p):side.prepend(p)}return p}
function renderPanel(){const p=ensurePanel(),d=readDraft();if(!p)return;const b=q('draftResumeOpen'),t=q('draftResumeTitle'),m=q('draftResumeMeta');b.disabled=!d;if(!d){t.textContent='ยังไม่มี Draft';m.textContent='ระบบจะเก็บงานที่ยังทำไม่เสร็จให้อัตโนมัติ';return}const names=[d.client_hint&&d.client_hint.client_name,d.model_hint&&d.model_hint.model_name].filter(Boolean);t.textContent=names.length?names.join(' · '):'งานที่ยังทำไม่เสร็จ';m.textContent=[d.world==='public'?'Public':d.world==='private'?'Private':'',d.saved_at?'บันทึก '+dt(d.saved_at):''].filter(Boolean).join(' · ')||'พร้อมเปิดต่อ'}
function setNotice(txt,tone='ok'){const n=q('notice');if(!n)return;n.textContent=txt;n.className='mmd-cj__alert is-'+tone}
function setField(k,v){const n=q(k);if(!n||v==null)return;if(n.type==='checkbox')n.checked=!!v;else n.value=String(v);n.dispatchEvent(new Event('change',{bubbles:true}));if(!(n instanceof HTMLSelectElement))n.dispatchEvent(new Event('input',{bubbles:true}))}
function pick(selector,name,id){const rows=qa(selector);if(!rows.length)return null;const key=String(name||'').trim().toLowerCase(),ik=String(id||'').trim().toLowerCase();let exact=rows.find(x=>{const b=(x.querySelector('b')?.textContent||'').trim().toLowerCase(),txt=(x.textContent||'').toLowerCase();return key&&b===key||ik&&txt.includes(ik)});return exact||(rows.length===1?rows[0]:null)}
async function selectClient(d){if(!d.client_hint)return true;const search=q('clientQuery'),btn=q('clientSearch');if(!search||!btn)return false;search.value=d.client_hint.client_id||d.client_hint.client_name||'';search.dispatchEvent(new Event('input',{bubbles:true}));btn.click();const rows=await waitFor(()=>qa('[data-cj-client-index]').length?qa('[data-cj-client-index]'):null);if(!rows)return false;await sleep(180);const choice=pick('[data-cj-client-index]',d.client_hint.client_name,d.client_hint.client_id);if(!choice)return false;choice.click();return !!(await waitFor(()=>{const x=q('clientSelected');return x&&!x.hidden?x:null},4500))}
function applyScopeAndFields(d){if(d.world){const w=root.querySelector('[data-cj-world="'+d.world+'"]');if(w)w.click()}const fields=d.fields||{};['folder','gender','privateWork'].forEach(k=>setField(k,d[k]||fields[k]||''));for(const [k,v] of Object.entries(fields)){if(['clientQuery','modelQuery','folder','gender','privateWork'].includes(k))continue;setField(k,v)}}
async function selectModel(d){if(!d.model_hint)return true;const search=q('modelQuery'),btn=q('modelSearch');if(!search||!btn)return false;search.value=d.model_hint.model_id||d.model_hint.model_name||'';search.dispatchEvent(new Event('input',{bubbles:true}));btn.click();const rows=await waitFor(()=>qa('[data-cj-model-index]').length?qa('[data-cj-model-index]'):null,12000);if(!rows)return false;await sleep(180);const choice=pick('[data-cj-model-index]',d.model_hint.model_name,d.model_hint.model_id);if(!choice)return false;choice.click();return !!(await waitFor(()=>{const x=q('modelSelected');return x&&!x.hidden?x:null},4500))}
async function openDraft(){const d=readDraft(),p=ensurePanel();if(!d||!p)return;p.dataset.busy='1';q('draftResumeMeta').textContent='กำลังเปิด Draft…';setNotice('กำลังเปิด Draft…','warn');try{const clientOk=await selectClient(d);if(!clientOk){(q('clientQuery')||{}).value=d.client_hint?.client_id||d.client_hint?.client_name||'';setNotice('เปิดรายละเอียด Draft แล้ว · เลือกลูกค้าจากผลค้นหาเพื่อทำต่อ','warn');return}applyScopeAndFields(d);await sleep(180);const modelOk=await selectModel(d);applyScopeAndFields(d);await sleep(120);const steps=qa('[data-cj-step]').filter(x=>!x.disabled);steps.at(-1)?.click();q('lv8SummaryClose')?.click();setNotice(modelOk?'เปิด Draft แล้ว · ทำต่อจากข้อมูลเดิมได้เลย':'เปิด Draft แล้ว · เลือกนายแบบจากผลค้นหาเพื่อทำต่อ',modelOk?'ok':'warn')}finally{p.dataset.busy='0';renderPanel()}}
injectStyle();addKenji();ensurePanel();renderPanel();
root.addEventListener('click',e=>{const b=e.target.closest('[data-cj="draftResumeOpen"]');if(b&&root.contains(b)){e.preventDefault();openDraft()}});
window.addEventListener('storage',e=>{if(e.key===D)renderPanel()});
const obs=new MutationObserver(()=>{addKenji();renderPanel()});obs.observe(root,{childList:true,subtree:true});
})();
</script>

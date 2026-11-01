import { rebuildMmsAdminLv7 } from './mms-admin-lv7.js';

export function renderMmsAdminShell(source) {
  if (!source || source.includes('data-mms-lv16')) return source;
  let html = rebuildMmsAdminLv7(source).replace('<html ', '<html data-mms-lv16 ');
  // Subscribe before boot, including when a cached snapshot resolves immediately.
  html = html.replace('</head>', `<style>${CSS}</style><script>window.addEventListener('mms-admin:snapshot',function(e){window.mmsShellSnapshot=e.detail;window.mmsShellReadAt=Date.now()});</script></head>`);
  html = html.replace('<main id="adminContent"', SEARCH + '<main id="adminContent"');
  for (const [id, tab] of [['sApps','applications'], ['sTher','therapists'], ['sPre','prebookings']]) {
    html = html.replace(new RegExp('<article class="stat">(?=[\\s\\S]*?id="'+id+'")([\\s\\S]*?)</article>'), (match, body) => {
      // Match the exact card; an earlier card must never acquire another route.
      return body.includes('id="'+id+'"') ? '<button class="stat" type="button" data-go="'+tab+'">'+body+'</button>' : match;
    });
  }
  return html.replace('</body>', '<script>'+CLIENT+PAGING+'</script></body>');
}

const SEARCH = `<section class="mms-command" aria-label="ค้นหาข้อมูล MMS">
<div class="mms-command-input"><span aria-hidden="true">⌕</span><label class="mms-sr-only" for="mmsQuickSearch">ค้นหาใบสมัคร ผู้ให้บริการ หรือการจอง</label><input id="mmsQuickSearch" type="search" autocomplete="off" placeholder="ค้นหาชื่อ หรือเลขรายการ…" aria-controls="mmsQuickResults"><button type="button" id="mmsQuickClear" aria-label="ล้างคำค้นหา">×</button></div>
<div id="mmsQuickResults" class="mms-quick-results" hidden></div><p id="mmsQuickStatus" class="mms-sr-only" role="status"></p>
<div class="mms-search-scopes" role="group" aria-label="เลือกประเภทที่ค้นหา"><button type="button" data-search-scope="all" aria-pressed="true">ทั้งหมด</button><button type="button" data-search-scope="applications" aria-pressed="false">ใบสมัคร</button><button type="button" data-search-scope="therapists" aria-pressed="false">ผู้ให้บริการ</button><button type="button" data-search-scope="prebookings" aria-pressed="false">การจอง</button></div><span id="mmsReadAt" class="mms-read-at">รอข้อมูลหลัก</span></section>`;

const CLIENT = String.raw`
(function(){
'use strict';
var input=document.getElementById('mmsQuickSearch'),results=document.getElementById('mmsQuickResults'),status=document.getElementById('mmsQuickStatus');
var snapshot=window.mmsShellSnapshot||{},index=[],category='all';
function normal(v){return String(v||'').normalize('NFKC').toLocaleLowerCase('th-TH').replace(/\s+/g,' ').trim()}
function rebuild(data){snapshot=data||{};index=[];[
 ['applications','application_id','nickname','applicant_name','ใบสมัคร','data-app-card','app'],
 ['therapists','therapist_id','display_name','display_name','ผู้ให้บริการ','data-ther-card','ther'],
 ['prebookings','prebooking_id','member_ref','service_date','การจอง','data-pre-card','pre']
].forEach(function(group){(Array.isArray(snapshot[group[0]])?snapshot[group[0]]:[]).forEach(function(row){if(!row[group[1]])return;var name=row[group[2]]||row[group[3]]||row[group[1]];index.push({id:String(row[group[1]]),name:String(name),label:group[4],tab:group[0],attribute:group[5],prefix:group[6],text:normal([name,row[group[3]],row[group[1]],row.status].join(' '))})});});if(document.activeElement===input)search()}
function close(){results.hidden=true;results.replaceChildren()}
function open(item){close();input.value='';var filter=document.getElementById(item.prefix+'Filter'),localSearch=document.getElementById(item.prefix+'Search');if(filter){filter.selectedIndex=0;filter.dispatchEvent(new Event('change',{bubbles:true}))}if(localSearch){localSearch.value='';localSearch.dispatchEvent(new Event('input',{bubbles:true}))}var tab=document.querySelector('.desktop-tab[data-tab="'+item.tab+'"]');if(tab)tab.click();requestAnimationFrame(function(){var card=Array.from(document.querySelectorAll('['+item.attribute+']')).find(function(n){return n.getAttribute(item.attribute)===item.id});if(!card){status.textContent='รายการนี้ไม่อยู่ในข้อมูลล่าสุด กรุณารีเฟรช';return}document.dispatchEvent(new CustomEvent('mms-admin:reveal-record',{detail:{card:card}}));var details=card.querySelector('details');if(details)details.open=true;card.tabIndex=-1;card.focus({preventScroll:true});card.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});card.classList.add('mms-found');setTimeout(function(){card.classList.remove('mms-found')},2500)})}
function search(){var q=normal(input.value);close();if(!q){status.textContent='';return}var matches=index.filter(function(item){return (category==='all'||item.tab===category)&&item.text.includes(q)}).sort(function(a,b){return Number(normal(b.name)===q)-Number(normal(a.name)===q)});results.hidden=false;status.textContent='พบ '+matches.length+' รายการ';if(!matches.length){var empty=document.createElement('p');empty.textContent=index.length?'ไม่พบในข้อมูลที่โหลด ลองชื่อหรือเลขรายการอื่น':'ข้อมูลยังไม่พร้อม กรุณารอหรือรีเฟรช';results.append(empty);return}matches.slice(0,12).forEach(function(item){var button=document.createElement('button');button.type='button';var name=document.createElement('strong'),meta=document.createElement('small');name.textContent=item.name;meta.textContent=item.label+' · '+item.id;button.append(name,meta);button.onclick=function(){open(item)};results.append(button)});if(matches.length>12){var more=document.createElement('p');more.textContent='แสดง 12 จาก '+matches.length+' รายการ · พิมพ์เพิ่มเพื่อค้นหาให้แคบลง';results.append(more)}}
input.addEventListener('input',search);input.addEventListener('focus',function(){if(input.value)search()});
input.addEventListener('keydown',function(e){if(e.key==='Escape'){input.value='';close();status.textContent=''}if(e.key==='ArrowDown'){var first=results.querySelector('button');if(first){e.preventDefault();first.focus()}}});
results.addEventListener('keydown',function(e){if(e.key==='Escape'){input.value='';close();status.textContent='';input.focus();return}if(e.key==='ArrowDown'||e.key==='ArrowUp'){var buttons=Array.from(results.querySelectorAll('button')),at=buttons.indexOf(document.activeElement);if(at<0)return;e.preventDefault();var next=at+(e.key==='ArrowDown'?1:-1);if(next<0)input.focus();else buttons[Math.min(next,buttons.length-1)].focus()}});
document.addEventListener('keydown',function(e){if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.target.closest('input,textarea,select,[contenteditable]')){e.preventDefault();input.focus()}});
document.querySelectorAll('[data-search-scope]').forEach(function(button){button.addEventListener('click',function(){category=button.dataset.searchScope;document.querySelectorAll('[data-search-scope]').forEach(function(b){b.setAttribute('aria-pressed',String(b===button))});search();input.focus()})});
document.getElementById('mmsQuickClear').onclick=function(){input.value='';close();status.textContent='';input.focus()};
document.addEventListener('click',function(e){if(!e.target.closest('.mms-command'))close()});
window.addEventListener('mms-admin:snapshot',function(e){rebuild(e.detail);stampReadTime()});rebuild(snapshot);
function stampReadTime(){var label=document.getElementById('mmsReadAt');if(label&&window.mmsShellReadAt)label.textContent='ข้อมูลหลักอ่านเมื่อ '+new Date(window.mmsShellReadAt).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Bangkok'})+' น.'}stampReadTime();
function syncNav(){document.querySelectorAll('.desktop-tab').forEach(function(button){if(button.classList.contains('active'))button.setAttribute('aria-current','page');else button.removeAttribute('aria-current')})}
var nav=document.querySelector('.desktop-nav');if(nav)new MutationObserver(syncNav).observe(nav,{subtree:true,attributes:true,attributeFilter:['class'],childList:true});syncNav();
})();`;

const PAGING = String.raw`
(function(){
'use strict';
var groups=[];
['applicationsList','therapistsList','prebookingsList'].forEach(function(id){
 var list=document.getElementById(id);if(!list)return;
 var page=0,nav=document.createElement('nav'),prev=document.createElement('button'),next=document.createElement('button'),label=document.createElement('span');
 nav.className='mms-pager';nav.setAttribute('aria-label','แบ่งหน้ารายการ');prev.type=next.type='button';prev.textContent='ก่อนหน้า';next.textContent='ถัดไป';label.setAttribute('aria-live','polite');nav.append(prev,label,next);list.after(nav);
 function cards(){return Array.from(list.children).filter(function(el){return el.matches('[data-app-card],[data-ther-card],[data-pre-card]')})}
 function render(){var rows=cards(),pages=Math.ceil(rows.length/8);page=Math.max(0,Math.min(page,pages-1));rows.forEach(function(row,i){row.classList.toggle('mms-page-hidden',Math.floor(i/8)!==page)});nav.hidden=pages<=1;label.textContent='หน้า '+(page+1)+' / '+Math.max(1,pages)+' · '+rows.length+' รายการ';prev.disabled=page===0;next.disabled=page>=pages-1}
 function reveal(card){var at=cards().indexOf(card);if(at<0)return;page=Math.floor(at/8);render()}
 groups.push({list:list,reveal:reveal});
 prev.onclick=function(){page--;render();list.scrollIntoView({block:'start'})};next.onclick=function(){page++;render();list.scrollIntoView({block:'start'})};
 new MutationObserver(function(){page=0;render();var opened=list.querySelector('details[open]');if(opened)reveal(opened.closest('.record-card'))}).observe(list,{childList:true});
 list.addEventListener('toggle',function(e){if(e.target.matches('details')&&e.target.open){var card=e.target.closest('.record-card');if(card&&card.classList.contains('mms-page-hidden')){reveal(card);card.scrollIntoView({block:'start'})}}},true);
 render();
});
document.addEventListener('mms-admin:reveal-record',function(e){groups.forEach(function(group){if(group.list.contains(e.detail.card))group.reveal(e.detail.card)})});
})();`;

const CSS = `
.mms-command{flex-wrap:wrap}.mms-command>.mms-command-input{flex:1 0 100%;width:100%;box-sizing:border-box}.mms-search-scopes{display:flex;gap:5px;flex-wrap:wrap}
html[data-mms-lv16]:root .mms-search-scopes button{padding:6px 10px;border-radius:20px;border:1px solid #dce7e0;background:#fff!important;color:#405c4c!important;font-size:12px}
html[data-mms-lv16]:root .mms-search-scopes button[aria-pressed="true"]{background:#e3efe7!important;border-color:#145c45;color:#145c45!important}
.mms-read-at{font-size:11px;color:#5b7063;margin-left:auto}.record-card{scroll-margin-top:100px}.mms-page-hidden{display:none!important}.mms-pager{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:16px 0}.mms-pager[hidden]{display:none}.mms-pager span{font-size:12px}.mms-pager button{padding:8px 12px;border:1px solid #dce7e0;border-radius:10px;background:#fff}.mms-pager button:disabled{opacity:.45}

html[data-mms-lv16]:root{--mms-accent:#145c45;--mms-border:#dce7e0}
html[data-mms-lv16]:root .mms-admin .shell{max-width:1440px;padding:24px 24px 40px}
html[data-mms-lv16]:root .mms-admin{padding:0!important;background:#f7f9f7!important}
html[data-mms-lv16]:root .mast{padding:0}.mms-sr-only{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
html[data-mms-lv16]:root .hero{padding:0!important;background:#fff!important;border:1px solid var(--mms-border);border-left:4px solid #145c45;border-radius:16px}
html[data-mms-lv16]:root .hero-copy{padding:18px 22px}
html[data-mms-lv16]:root .hero h1{font-size:30px!important;letter-spacing:-.03em}
html[data-mms-lv16]:root .hero-note{font-size:12px}
html[data-mms-lv16]:root .stats{gap:10px;margin:14px 0}
html[data-mms-lv16]:root .stat{text-align:left;cursor:pointer;min-height:100px;padding:16px!important;border:1px solid var(--mms-border)!important;background:#fff!important;color:#20372c!important;-webkit-text-fill-color:#20372c!important}
html[data-mms-lv16]:root .stat:hover{border-color:#145c45!important}.stat b{font-variant-numeric:tabular-nums}
html[data-mms-lv16]:root :is(.mobile-branch,.mms-mb-topbar,.mms-mb-rail,.mms-mb-swipe-hint){display:none!important}
html[data-mms-lv16]:root #overview>.action-grid,html[data-mms-lv16]:root #overview>.ops-note,html[data-mms-lv16]:root #attentionList{display:none}
html[data-mms-lv16]:root #overview>.section-head{display:none}
html[data-mms-lv16]:root .mms-ops-home{padding:0;border:0;border-radius:0;background:transparent;box-shadow:none;margin-bottom:20px}
html[data-mms-lv16]:root .mms-ops-head{padding:16px 18px;background:#edf4ef;border:1px solid var(--mms-border);border-radius:14px;align-items:center}
html[data-mms-lv16]:root .mms-ops-head h3{font-size:22px}.mms-ops-head p{margin-bottom:0}
html[data-mms-lv16]:root .mms-ops-lanes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0;padding:0;overflow:visible}
html[data-mms-lv16]:root .mms-ops-lane{min-width:0;border:1px solid var(--mms-border);background:#fff;border-radius:16px;padding:14px}
html[data-mms-lv16]:root .mms-ops-lane-head h4{font-size:18px}.mms-ops-item-button{width:100%;text-align:left}
html[data-mms-lv16]:root .mms-ops-item-button{background:#fff!important;border:1px solid #e2eae4!important;border-radius:12px;box-shadow:none!important;color:#20372c!important;-webkit-text-fill-color:#20372c!important}
html[data-mms-lv16]:root .mms-ops-item-button :is(strong,p,small,span){color:inherit!important;-webkit-text-fill-color:inherit!important}
html[data-mms-lv16]:root .mms-ops-item-button:hover{background:#f1f7f3!important}
html[data-mms-lv16]:root .desktop-nav{border:1px solid var(--mms-border);background:#fff!important;border-radius:16px;gap:6px;padding:10px;box-shadow:0 6px 22px #20372c06}
html[data-mms-lv16]:root .desktop-tab{border:0;background:#fff!important;color:#405c4c!important;-webkit-text-fill-color:#405c4c!important;text-align:left;white-space:nowrap;box-shadow:none!important}
html[data-mms-lv16]:root .desktop-tab.active{background:#145c45!important;color:#fff!important;-webkit-text-fill-color:#fff!important}
html[data-mms-lv16]:root .desktop-tab.active span{color:#fff!important;-webkit-text-fill-color:#fff!important}
.mms-command{position:relative;z-index:40;display:flex;align-items:center;gap:12px;margin-bottom:18px;min-width:0}
.mms-command-input{display:flex;align-items:center;gap:10px;flex:1;min-width:0;background:#fff;border:1px solid var(--mms-border);border-radius:14px;padding:0 8px 0 14px}
.mms-command-input>span{font-size:28px;color:#145c45}
html[data-mms-lv16]:root .mms-command input{border:0!important;box-shadow:none;min-width:0;background:transparent!important;padding-left:0}
html[data-mms-lv16]:root #mmsQuickClear{border:0;background:transparent!important;color:#405c4c!important;-webkit-text-fill-color:#405c4c!important;width:44px;padding:0;font-size:24px}
.mms-command-hint{font-size:12px;color:#5b7063}.mms-quick-results{position:absolute;top:calc(100% + 6px);left:0;right:0;max-height:340px;overflow:auto;background:#fff;border:1px solid #c8dbcf;border-radius:16px;box-shadow:0 18px 45px #183d2724;padding:6px}
.mms-quick-results[hidden]{display:none}.mms-quick-results button{display:grid!important;gap:4px;width:100%;text-align:left;border:0;border-bottom:1px solid #edf1ee;background:#fff!important;padding:12px!important;border-radius:8px}
.mms-quick-results button:hover,.mms-quick-results button:focus{background:#eff6f1!important}.mms-quick-results small{font-size:12px;overflow-wrap:anywhere}.mms-quick-results p{padding:10px;font-size:13px}
html[data-mms-lv16]:root .filter-bar{box-shadow:none;border-radius:14px}.mms-found{outline:3px solid #145c45;outline-offset:3px}
html[data-mms-lv16]:root .lv7-tool{border-radius:14px;box-shadow:none}.lv7-tool>summary{padding:16px 18px}
html[data-mms-lv16]:root .mms-admin .btn{border-radius:10px;font-weight:650}
@media(min-width:1050px){html[data-mms-lv16]:root .shell{display:grid;grid-template-columns:210px minmax(0,1fr);gap:0 24px;align-items:start}html[data-mms-lv16]:root .mast{grid-column:1/-1}html[data-mms-lv16]:root .desktop-nav{grid-column:1;grid-row:2/4;display:flex;flex-direction:column;position:sticky;top:24px;margin:0}html[data-mms-lv16]:root .desktop-tab{width:100%}.mms-command{grid-column:2}#adminContent{grid-column:2;min-width:0}html[data-mms-lv16]:root .panel{padding-top:0}.mms-ops-head h3{font-size:21px}}
@media(max-width:1049px){html[data-mms-lv16]:root .mms-admin .shell{padding:14px 14px 32px}html[data-mms-lv16]:root .desktop-nav{position:sticky;top:0!important;z-index:60;margin:6px -2px 14px;overflow-x:auto;flex-wrap:nowrap;scrollbar-width:thin}.mms-command-hint{display:none}html[data-mms-lv16]:root .panel{scroll-margin-top:80px}html[data-mms-lv16]:root .mms-ops-lanes{grid-template-columns:1fr}.mms-ops-lane{width:100%}html[data-mms-lv16]:root .mms-ops-head{flex-wrap:wrap}html[data-mms-lv16]:root .hero-copy{padding:16px}html[data-mms-lv16]:root .hero h1{font-size:26px!important}html[data-mms-lv16]:root .stat{padding:12px!important;min-height:96px}html[data-mms-lv16]:root .stat b{font-size:27px}.mms-command{margin-bottom:12px}html[data-mms-lv16]:root .brand-row{flex-wrap:wrap}}
`;

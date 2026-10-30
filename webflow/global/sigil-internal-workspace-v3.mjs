// Shared presentation only: no API, authentication, or business mutations.
export const INTERNAL_PAGES = [
  {title:'Booking Models',path:'/internal/admin/booking-models'},
  {title:'MMD MEMORY · จัดการคู่มือ MY MODEL',path:'/internal/ceo/documents/my-model'},
  {title:'MMD MEMORY · จัดการเอกสาร',path:'/docs/manage'},
  {title:'Model LINE Link',path:'/internal/admin/model-link'},
  {title:'Broadcast',path:'/internal/admin/jobs/job-board'},
  {title:'MMS Workspace',path:'/internal/admin/mms'},
  {
    "title": "Kenji Knowledge",
    "path": "/internal/admin/kenji-knowledge"
  },
  {
    "title": "คิวงาน Admin",
    "path": "/internal/admin/control-room"
  },
  {
    "title": "Payment Slip Inbox",
    "path": "/internal/ceo/payment-slip-inbox"
  },
  {
    "title": "Relink Review",
    "path": "/internal/ceo/relink-review"
  },
  {
    "title": "Audience Intelligence",
    "path": "/internal/ceo/audience"
  },
  {
    "title": "Model Supply Intelligence",
    "path": "/internal/ceo/models"
  },
  {
    "title": "Upload New Model",
    "path": "/internal/admin/studio/upload"
  },
  {
    "title": "Model From Drive",
    "path": "/internal/admin/drive"
  },
  {
    "title": "Studio Review",
    "path": "/internal/admin/studio/review"
  },
  {
    "title": "Line to Telegram Migration",
    "path": "/internal/ceo/line-to-telegram-migration"
  },
  {
    "title": "Telegram Alias",
    "path": "/internal/ceo/telegram-alias"
  },
  {
    "title": "Telegram Preview",
    "path": "/internal/ceo/telegram-preview"
  },
  {
    "title": "LINE Notes Import · Legacy Bridge",
    "path": "/internal/ceo/line-notes-import"
  },
  {
    "title": "Model Preview",
    "path": "/internal/admin/studio/model-preview"
  },
  {
    "title": "HYPE + HENNA",
    "path": "/internal/admin/telegram-brief"
  },
  {
    "title": "สร้างงาน",
    "path": "/internal/admin/jobs/create-job"
  },
  {
    "title": "MMD Shop Products",
    "path": "/internal/admin/shop/products"
  },
  {
    "title": "MMD Shop Inventory",
    "path": "/internal/admin/shop/inventory"
  },
  {
    "title": "MMD Shop Orders",
    "path": "/internal/admin/shop/orders"
  },
  {
    "title": "MMD Review",
    "path": "/internal/admin/mmd-review"
  },
  {
    "title": "MMD Calendar",
    "path": "/internal/admin/calendar"
  },
  {
    "title": "Applications",
    "path": "/internal/admin/applications"
  },
  {
    "title": "All Jobs",
    "path": "/internal/admin/jobs/all"
  },
  {
    "title": "Customer 360",
    "path": "/internal/admin/customer-data"
  },
  {
    "title": "MMD Historical Slip Backfill",
    "path": "/internal/admin/payments/historical-backfill"
  },
  {
    "title": "Kenji Client Intake",
    "path": "/internal/admin/kenji/client-intake"
  },
  {
    "title": "Kenji Control",
    "path": "/internal/ceo/kenji-control"
  },
  {
    "title": "Care Back",
    "path": "/internal/admin/studio/care-back"
  },
  {
    "title": "Studio",
    "path": "/internal/admin/studio"
  },
  {
    "title": "Entitlement Intelligence",
    "path": "/internal/admin/membership-access"
  },
  {
    "title": "Operations Dashboard",
    "path": "/internal/admin/dashboard"
  },
  {
    "title": "เช็กข้อมูลสมาชิก",
    "path": "/internal/admin/member-intelligence"
  },
  {
    "title": "MMD Operating System",
    "path": "/internal/admin/control-room"
  },
  {
    "title": "Dashboard",
    "path": "/internal/ceo/dashboard"
  },
  {
    "title": "Console · งานจริง",
    "path": "/internal/admin/jobs/all"
  },
  {
    "title": "LEGACY · Kenji-AI",
    "path": "/internal/ceo/kenji-ai"
  },
  {
    "title": "CEO Dashboard",
    "path": "/internal/ceo"
  },
  {
    "title": "Session Creator Pro",
    "path": "/internal/admin/jobs/create-session"
  },
  {
    "title": "Money Control",
    "path": "/internal/admin/payments"
  },
  {
    "title": "Sitemap",
    "path": "/internal/admin/sitemap"
  }
];
// Existing destinations only; these shortcuts never fetch or modify customer data.
export const DAILY_INTERNAL_PAGES = [
  {title:'เช็กสมาชิก · Points',path:'/internal/admin/my-mmd/recovery',description:'ค้นสมาชิก · ประวัติ · ยอด Points',ownerOnly:true},
  {title:'ค้นลูกค้า · Customer 360',path:'/internal/admin/customer-data',description:'ตัวตน · LINE · ประวัติลูกค้า'},
  {title:'สถานะข้อมูลสมาชิก',path:'/internal/admin/member-intelligence',description:'ข้อมูลที่ขาด · รายการต้องตรวจ'},
  {title:'สิทธิ์เข้าใช้งาน',path:'/internal/admin/membership-access',description:'สมาชิก · Telegram · Drive'},
  {title:'งานทั้งหมด',path:'/internal/admin/jobs/all',description:'สถานะงาน · รายละเอียด · การชำระ'},
  {title:'ตรวจรับเงิน',path:'/internal/admin/payments',description:'สลิป · ยอดรับ · รอตรวจ'},
  {title:'ปฏิทินงาน',path:'/internal/admin/calendar',description:'งานวันนี้ · คิวถัดไป'},
  {title:'สร้างงาน',path:'/internal/admin/jobs/create-job',description:'เริ่มงานใหม่'}
];
export const INTERNAL_MENU_OMISSIONS = [
  '/docs/manage',
  '/internal/ceo/documents/my-model',
  '/internal/ceo/telegram-preview',
  '/internal/ceo/kenji-ai'
];
export function installInternalWorkspace(pages = INTERNAL_PAGES, dailyPages = DAILY_INTERNAL_PAGES, omittedPaths = INTERNAL_MENU_OMISSIONS) {
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const dailyLayout = !/^\/internal\/admin\/mms(?:\/|$)/.test(path);
  const previous=document.getElementById('sigil-workspace-directory');
  if (!/^\/internal(?:\/|$)/.test(path) || /\/(?:login|setup|invite)$/.test(path) || previous?.dataset.directoryLayout==='daily-v1' || (!dailyLayout&&previous)) return;
  if(previous){previous.remove();document.getElementById('sigil-workspace-readable-v3')?.remove();}
  const style = document.createElement('style');
  style.id = 'sigil-workspace-readable-v3';
  style.textContent = `
  #sigil-workspace-directory{box-sizing:border-box;background:#20262e!important;color:#f8fafc!important;font:14px/1.6 -apple-system,BlinkMacSystemFont,"LINE Seed Sans TH","Noto Sans Thai",sans-serif!important;padding:18px!important;border:1px solid #495563!important;border-radius:12px;max-width:100%;text-align:left}
  #sigil-workspace-directory *{box-sizing:border-box;-webkit-text-fill-color:currentColor!important;text-shadow:none!important}
  #sigil-workspace-directory summary{cursor:pointer;color:#fff!important;font-weight:700;font-size:15px}
  #sigil-workspace-directory input{width:100%;margin:12px 0;background:#fff!important;color:#17212e!important;border:1px solid #94a3b8!important;border-radius:8px;padding:10px;font:inherit}
  #sigil-workspace-directory input::placeholder{color:#526070!important;opacity:1}
  #sigil-workspace-directory nav{display:block!important;max-height:55vh;overflow:auto}
  #sigil-workspace-directory h3{color:#b9c8d8!important;font-size:11px!important;letter-spacing:.12em;margin:16px 8px 6px!important}
  #sigil-workspace-directory a{display:block!important;padding:9px 10px!important;color:#f1f5f9!important;text-decoration:none!important;border-radius:6px;font-size:13px!important;line-height:1.5!important;white-space:normal!important}
  #sigil-workspace-directory a:hover{background:#344252!important}
  #sigil-workspace-directory a[aria-current="page"]{background:#a83d0a!important;color:#fff!important;font-weight:700}
  #sigil-workspace-directory a:focus-visible,#sigil-workspace-directory summary:focus-visible{outline:3px solid #ffb783;outline-offset:2px}
  #sigil-workspace-directory [hidden]{display:none!important}
  #sigil-workspace-directory.sigil-floating{position:fixed;top:14px;left:14px;z-index:9990;width:248px;max-height:calc(100dvh - 28px);overflow:auto;box-shadow:0 8px 30px #0003}
  body.sigil-directory-offset{padding-left:276px!important}
  html[data-sigil-readable] body{font-family:-apple-system,BlinkMacSystemFont,"LINE Seed Sans TH","Noto Sans Thai",sans-serif}
  html[data-sigil-readable] .aud27{--ink:#202a36;--text:#202a36;--muted:#526070;--line:#c2cbd5;background:#e6eaf0!important;color:#202a36!important}
  html[data-sigil-readable] .aud27 :is(.aud27-app,.aud27-main){background:#e6eaf0!important;color:#202a36!important}
  html[data-sigil-readable] .aud27 :is(.aud27-card,.aud27-brief,.aud27-now,.aud27-decision,.aud27-history,.aud27-historygrid article,.aud27-signals article,.aud27-footpanel){background:#f8fafc!important;color:#202a36!important;border-color:#c2cbd5!important}
  html[data-sigil-readable] .aud27 :is(h1,h2,h3,h4,p,small,summary,strong,td,th){-webkit-text-fill-color:currentColor!important;text-shadow:none!important}
  html[data-sigil-readable] :is(input,textarea)::placeholder{opacity:1}
  html[data-sigil-readable] :is(button,input,select,textarea):disabled{opacity:1!important;cursor:not-allowed}
  html[data-sigil-readable] :focus-visible{outline:3px solid #a83d0a;outline-offset:3px}
  /* Shared silver and charcoal workspace palette. */
  html[data-sigil-readable]{color-scheme:light;--bg:#e7eaee;--paper:#f8fafc;--panel:#f8fafc;--ink:#27313b;--text:#27313b;--muted:#5b6672;--line:#c7cfd7}
  html[data-sigil-readable] body,html[data-sigil-readable] .aud27,html[data-sigil-readable] .aud27 :is(.aud27-app,.aud27-main){background:#e7eaee!important;color:#27313b!important}
  html[data-sigil-readable] :is(.aud27-side,.adm27-side,.adm27-sidebar,.cr4__rail,.sigil-navigation-rail){background:#252c34!important;color:#f7f8fa!important;border-color:#46515d!important}
  html[data-sigil-readable] :is(.aud27-side,.adm27-side,.adm27-sidebar,.cr4__rail,.sigil-navigation-rail) :is(a,button,span,small,strong,b){color:#e4e9ee!important;-webkit-text-fill-color:#e4e9ee!important;text-shadow:none!important}
  html[data-sigil-readable] .aud27 :is(.aud27-card,.aud27-brief,.aud27-now,.aud27-decision,.aud27-history,.aud27-historygrid article,.aud27-signals article,.aud27-footpanel,.aud27-top){background:#f8fafc!important;color:#27313b!important;border-color:#c7cfd7!important}
  html[data-sigil-readable] .aud27 :is(h1,h2,h3,h4,strong,summary,td,th){color:#27313b!important;-webkit-text-fill-color:#27313b!important;background-image:none!important}
  html[data-sigil-readable] .aud27 :is(p,small,.aud27-sub,.aud27-kicker){color:#5b6672!important;-webkit-text-fill-color:#5b6672!important}
  html[data-sigil-readable] .aud27 :is(.aud27-btn,.aud27-chip,.aud27-status){background:#e9edf1!important;color:#27313b!important;-webkit-text-fill-color:#27313b!important;border:1px solid #c7cfd7!important}
  html[data-sigil-readable] .aud27 .aud27-btn.is-primary{background:#ba5423!important;color:#fff!important;-webkit-text-fill-color:#fff!important}
  #sigil-workspace-directory{background:#252c34!important;color:#f7f8fa!important;border-color:#46515d!important;box-shadow:0 12px 32px #17202b30!important}
  #sigil-workspace-directory :is(summary,a){color:#f7f8fa!important;-webkit-text-fill-color:#f7f8fa!important}
  #sigil-workspace-directory h3{color:#aebbc8!important}
  #sigil-workspace-directory a:hover{background:#3b4753!important}
  #sigil-workspace-directory a[aria-current="page"]{background:#ba5423!important;color:#fff!important;-webkit-text-fill-color:#fff!important}
  #sigil-workspace-directory input{background:#f8fafc!important;border-color:#aab5c0!important}
  @media(max-width:991px){body.sigil-directory-offset{padding-left:0!important;padding-top:72px!important}#sigil-workspace-directory.sigil-floating{width:min(320px,calc(100vw - 28px))}#sigil-workspace-directory nav{max-height:60dvh}}
  `;

  // Isolate the directory on every internal page from page-wide themes.
  style.textContent += `
  html[data-sigil-readable] body #sigil-workspace-directory,
  html[data-sigil-readable] body #sigil-workspace-directory :is(nav,section){background:#fff!important;color:#27313b!important;border-color:#c7cfd7!important}
  html[data-sigil-readable] body #sigil-workspace-directory :is(summary,h3,a,input){color:#27313b!important;-webkit-text-fill-color:#27313b!important;opacity:1!important}
  html[data-sigil-readable] body #sigil-workspace-directory a{background:transparent!important}
  html[data-sigil-readable] body #sigil-workspace-directory a:hover,
  html[data-sigil-readable] body #sigil-workspace-directory a[aria-current="page"]{background:#ffdfc7!important;color:#78350f!important;-webkit-text-fill-color:#78350f!important}
  html[data-sigil-readable] body #sigil-workspace-directory :is(a,summary,input):focus-visible{outline:3px solid #9a3412!important;outline-offset:2px}
  `;
  if (dailyLayout) style.textContent += `
  #sigil-workspace-directory{padding:12px!important;font-size:13px!important}
  #sigil-workspace-directory>summary{font-size:14px!important;min-height:24px;line-height:24px}
  #sigil-workspace-directory input{margin:10px 0;padding:8px 10px;min-height:36px}
  #sigil-workspace-directory nav{max-height:65dvh}
  #sigil-workspace-directory nav>details{border-top:1px solid #d9dfe5;padding:6px 0}
  #sigil-workspace-directory nav>details>summary{min-height:36px;padding:6px 8px;font-size:12px!important;color:#526070!important}
  #sigil-workspace-directory nav a{padding:7px 9px!important;min-height:36px}
  #sigil-workspace-directory nav h3{margin:8px!important;letter-spacing:0;font-size:12px!important}
  #sigil-workspace-directory.sigil-floating{top:10px;left:14px;width:248px}
  body.sigil-directory-offset{padding-left:0!important;padding-top:64px!important}
  #adm27 #sigil-daily-desk{background:#fff!important;border:1px solid #d8dce1!important;border-radius:16px;padding:18px;color:#27313b!important}
  #adm27 #sigil-daily-desk h2{margin:0;font-size:20px;color:#27313b!important;-webkit-text-fill-color:#27313b!important}
  #adm27 #sigil-daily-desk p{margin:4px 0 14px;font-size:14px;color:#56616b!important;-webkit-text-fill-color:#56616b!important}
  #adm27 #sigil-daily-desk nav{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
  #adm27 #sigil-daily-desk a{display:flex;flex-direction:column;gap:4px;min-width:0;padding:12px;border:1px solid #d8dce1;border-radius:10px;background:#f8fafb!important;color:#27313b!important;text-decoration:none;overflow-wrap:anywhere}
  #adm27 #sigil-daily-desk a:nth-child(-n+4){background:#f7f2e8!important;border-color:#d7c8a9}
  #adm27 #sigil-daily-desk a strong{font-size:14px;line-height:1.5;color:#27313b!important;-webkit-text-fill-color:#27313b!important}
  #adm27 #sigil-daily-desk a span{font-size:12px;line-height:1.5;color:#56616b!important;-webkit-text-fill-color:#56616b!important}
  #adm27 #sigil-daily-desk a:hover{background:#eceff3!important;border-color:#9ca8b3}
  #adm27 #sigil-daily-desk a:active{background:#e1e7ec!important}
  #adm27 #sigil-daily-desk a:focus-visible{outline:3px solid #8d692e;outline-offset:2px}
  @media(max-width:900px){#adm27 #sigil-daily-desk nav{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:991px){#sigil-workspace-directory nav a,#sigil-workspace-directory nav>details>summary{min-height:44px}#sigil-workspace-directory.sigil-floating{width:min(300px,calc(100vw - 28px))}}
  @media(max-width:440px){#adm27 #sigil-daily-desk{padding:14px}#adm27 #sigil-daily-desk a{padding:10px}#adm27 #sigil-daily-desk a strong{font-size:13px}}
  `;
  document.head.appendChild(style);
  document.documentElement.dataset.sigilReadable='v3';
  const directory=document.createElement('details');directory.id='sigil-workspace-directory';if(dailyLayout)directory.dataset.directoryLayout='daily-v1';
  directory.open=!dailyLayout && matchMedia('(min-width:992px)').matches;
  const summary=document.createElement('summary');summary.textContent=dailyLayout?'SĪGIL · เมนูทำงาน':'SĪGIL · เมนูทุกหน้า';directory.append(summary);
  const search=document.createElement('input');search.type='search';search.placeholder='ค้นหาหน้า / Search pages';search.setAttribute('aria-label','ค้นหาหน้าภายใน');directory.append(search);
  const nav=document.createElement('nav');nav.setAttribute('aria-label','หน้าภายในทั้งหมด');directory.append(nav);
  if (dailyLayout) {
    const unique=new Map([['/internal/admin/dashboard',{title:'หน้าหลัก · งานของ Per',path:'/internal/admin/dashboard'}]]);
    for(const page of [...dailyPages,...pages]) if(!omittedPaths.includes(page.path)&&!unique.has(page.path)) unique.set(page.path,page);
    const all=[...unique.values()];
    const dailyPaths=new Set(['/internal/admin/dashboard',...dailyPages.map(page=>page.path)]);
    const buckets=[
      ['ใช้ประจำ',page=>dailyPaths.has(page.path)],
      ['ลูกค้าและสมาชิก',page=>/customer|member|relink|client-intake|my-mmd/.test(page.path)],
      ['งานและคิว',page=>/jobs|calendar|control-room|applications/.test(page.path)],
      ['การเงินและหลักฐาน',page=>/payment|slip|backfill/.test(page.path)],
      ['โมเดลและสื่อ',page=>/models|studio|model-link|drive/.test(page.path)],
      ['ภาพธุรกิจ',page=>/audience|ceo\/dashboard/.test(page.path)||page.path==='/internal/ceo'],
      ['ระบบและเครื่องมืออื่น',()=>true]
    ];
    const assigned=new Set();
    for(const [index,[name,filter]] of buckets.entries()){
      const items=all.filter(page=>!assigned.has(page.path)&&filter(page));
      if(!items.length)continue;
      const group=document.createElement(index===0?'section':'details');
      const heading=document.createElement(index===0?'h3':'summary');heading.textContent=name;group.append(heading);
      if(index>0)group.open=items.some(page=>page.path===path);
      for(const page of items){
        assigned.add(page.path);
        const a=document.createElement('a');a.href=page.path;a.textContent=page.title+(page.ownerOnly?' · Owner':'');a.dataset.search=(page.title+' '+page.path+' '+(page.description||'')).toLowerCase();
        if(page.path===path)a.setAttribute('aria-current','page');group.append(a);
      }nav.append(group);
    }
    const main=path==='/internal/admin/dashboard'&&document.querySelector('#adm27 .adm27-main');
    if(main&&!document.getElementById('sigil-daily-desk')){
      const desk=document.createElement('section');desk.id='sigil-daily-desk';desk.setAttribute('aria-label','เช็กลูกค้าและงานประจำ');
      const title=document.createElement('h2');title.textContent='เช็กลูกค้า แล้วไปทำงานต่อ';
      const hint=document.createElement('p');hint.textContent='สมาชิก · Points · สิทธิ์ · สถานะงาน ในจุดเดียว';
      const links=document.createElement('nav');links.setAttribute('aria-label','เครื่องมือที่ใช้ประจำ');
      for(const page of dailyPages){const a=document.createElement('a');a.href=page.path;const label=document.createElement('strong');label.textContent=page.title;const detail=document.createElement('span');detail.textContent=page.description+(page.ownerOnly?' · สำหรับ Owner':'');a.append(label,detail);links.append(a);}
      desk.append(title,hint,links);
      const focus=main.querySelector('.adm27-brief');
      if(focus)focus.after(desk);else main.prepend(desk);
      const summary=main.querySelector('.adm27-summary');if(summary)desk.before(summary);
      const actions=focus?.querySelector('.adm27-actions');
      if(actions&&!actions.querySelector('[data-focus-next]')){const next=document.createElement('a');next.className='adm27-btn';next.href='/internal/admin/control-room';next.dataset.focusNext='';next.textContent='เปิดเรื่องที่ต้องจัดการ →';actions.prepend(next);}
      const more=main.querySelector('.adm27-more');
      if(more){for(const extra of main.querySelectorAll(':scope>.adm27-owner,:scope>.adm27-daily'))more.append(extra);}

    }
    search.addEventListener('input',()=>{const query=search.value.trim().toLowerCase();for(const group of nav.children){let found=false;for(const a of group.querySelectorAll('a')){a.hidden=!a.dataset.search.includes(query);if(!a.hidden)found=true;}group.hidden=!found;if(group.tagName==='DETAILS')group.open=!!query||!!group.querySelector('[aria-current="page"]');}});
  } else {
  for(const [name,filter] of [['CEO',p=>p.path.startsWith('/internal/ceo')],['OPERATIONS',p=>!p.path.startsWith('/internal/ceo')]]){
    const group=document.createElement('section'),heading=document.createElement('h3');heading.textContent=name;group.append(heading);
    for(const page of pages.filter(filter).sort((a,b)=>a.title.localeCompare(b.title))){
      const a=document.createElement('a');a.href=page.path;a.textContent=page.title;a.dataset.search=(page.title+' '+page.path).toLowerCase();if(page.path===path)a.setAttribute('aria-current','page');group.append(a);
    }nav.append(group);
  }
  search.addEventListener('input',()=>{for(const group of nav.children){let found=false;for(const a of group.querySelectorAll('a')){a.hidden=!a.dataset.search.includes(search.value.toLowerCase());if(!a.hidden)found=true;}group.hidden=!found;}});
  }
  // Reuse page rails so in-page controls and their event handlers remain intact.
  const rail=document.querySelector('.aud27-side,.adm27-side,.adm27-sidebar,.cr4__rail,.sigil-navigation-rail,.access-card[aria-label="เมนูระบบภายใน"]');
  if(rail && matchMedia('(min-width:992px)').matches){rail.prepend(directory);directory.open=true;}else{directory.classList.add('sigil-floating');document.body.prepend(directory);document.body.classList.add('sigil-directory-offset');}
  const rgba=value=>{const m=value.match(/[\d.]+/g);return m&&m.length>=3?[+m[0],+m[1],+m[2],m.length>3?+m[3]:1]:null};
  const lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  const ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
  function improve(root){
    const nodes=[...(root.matches?.('h1,h2,h3,h4,h5,h6,p,span,small,label,a,button,summary,td,th,input,textarea,select,strong,b,li')?[root]:[]),...root.querySelectorAll('h1,h2,h3,h4,h5,h6,p,span,small,label,a,button,summary,td,th,input,textarea,select,strong,b,li')];
    for(const el of nodes){
      if(el.closest('#sigil-workspace-directory,svg,canvas,[data-contrast-preserve]')||!el.getClientRects().length)continue;
      const cs=getComputedStyle(el);let fg=rgba(cs.webkitTextFillColor)||rgba(cs.color);if(!fg)continue;
      let bg=[255,255,255,1],chain=[];for(let n=el;n;n=n.parentElement)chain.push(n);
      // Image-backed text needs its own deliberate overlay; preserve that treatment.
      if(chain.some(n=>getComputedStyle(n).backgroundImage!=='none'))continue;
      for(const n of chain.reverse()){const c=rgba(getComputedStyle(n).backgroundColor);if(c)bg=c.slice(0,3).map((v,i)=>v*c[3]+bg[i]*(1-c[3])).concat(1);}
      fg=fg.slice(0,3).map((v,i)=>v*fg[3]+bg[i]*(1-fg[3])).concat(1);
      if(ratio(fg,bg)>=4.5&&Number(cs.opacity)>=.7)continue;
      const dark=[31,41,55,1],light=[248,250,252,1],color=ratio(dark,bg)>ratio(light,bg)?'#1f2937':'#f8fafc';
      el.style.setProperty('color',color,'important');el.style.setProperty('-webkit-text-fill-color',color,'important');el.style.setProperty('opacity','1','important');el.style.setProperty('text-shadow','none','important');
    }
  }
  improve(document.body);
  window.addEventListener('load',()=>improve(document.body),{once:true});
  document.addEventListener('toggle',event=>{if(event.target.open)improve(event.target)},true);
  setTimeout(()=>improve(document.body),1500);
  let frame=0;const pending=new Set();
  new MutationObserver(records=>{for(const record of records)if(record.target.nodeType===1&&!directory.contains(record.target))pending.add(record.target);if(!frame)frame=requestAnimationFrame(()=>{frame=0;for(const root of pending)if(root.isConnected)improve(root);pending.clear();});}).observe(document.body,{childList:true,subtree:true});
}
export function internalWorkspaceLoader(){
  // esbuild annotates nested callbacks in the serialized function with __name.
  // Define the helper outside that function so bundling cannot turn its own
  // declaration into a temporal-dead-zone reference in the browser payload.
  return '(()=>{const __name=(target,value)=>{Object.defineProperty(target,"name",{value,configurable:true});return target;};return ('+installInternalWorkspace.toString()+')('+JSON.stringify(INTERNAL_PAGES)+','+JSON.stringify(DAILY_INTERNAL_PAGES)+','+JSON.stringify(INTERNAL_MENU_OMISSIONS)+');})()';
}


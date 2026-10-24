// Presentation only. Existing IDs, listeners, auth and API contracts stay owned
// by the MMS runtime. Apply after the feature modules have assembled their UI.
export function rebuildMmsAdminLv7(page) {
  if (!page || page.includes('data-mms-lv7')) return page;
  let html = page.replace(/<style data-mms-dashboard-rebuilt>[\s\S]*?<\/style>/, '');
  html = html.replace(/<html\b/, '<html data-mms-lv7');
  html = html.replace(/<img class="mms-hero-photo"[^>]*>/, '');
  html = html.replace(/<div class="mms-city-band">[\s\S]*?<\/div><\/div>/, '');
  html = html.replace('MMS Jobs Today', 'ดูแลงาน MMS');
  html = html.replace('ใบสมัคร ทีม Therapist และงานวันนี้<br>ดูสถานะจริง แล้วเลือกเรื่องที่ต้องจัดการต่อ', 'ใบสมัคร · ผู้ให้บริการ · งานวันนี้');
  html = html.replace('เลือกจากสิ่งที่ต้องจัดการก่อน ไม่ต้องไล่เปิดหลายระบบครับ', 'เลือกเรื่องที่ต้องจัดการ แล้วทำต่อได้เลย');
  html = html.replace('<div class="stats"', '<div class="lv7-loading"><label id="mmsLoadLabel" for="mmsLoadProgress" role="status">กำลังอ่านข้อมูลหลัก 0%</label><progress id="mmsLoadProgress" max="100" value="0"></progress></div><div class="stats"');
  // Count settled requests, including failures; never invent a timed percentage.
  html = html.replace('async function boot(){', `async function boot(){var lv7Done=0,lv7Failed=0;function lv7Track(task){function finish(failed){lv7Done++;if(failed)lv7Failed++;var meter=q('#mmsLoadProgress'),label=q('#mmsLoadLabel');if(meter)meter.value=lv7Done*50;if(label)label.textContent=(lv7Done===2?'ตรวจข้อมูลหลักครบ ':'กำลังอ่านข้อมูลหลัก ')+(lv7Done*50)+'%'+(lv7Failed?' · บางข้อมูลยังโหลดไม่ได้':'')}return task.then(function(value){finish(false);return value},function(error){finish(true);throw error})}`);
  html = html.replace("var snapshotTask=call('/snapshot');", "var snapshotTask=lv7Track(call('/snapshot'));");
  html = html.replace("var catalogTask=call('/catalog').then", "var catalogTask=lv7Track(call('/catalog')).then");
  const tools = [];
  for (const [marker, title, hint] of [
    ['data-mms-workspace-admin-v1', 'ความพร้อมและงานในแอป', 'ผูก LINE · ตรวจสิทธิ์ · งานทดสอบ'],
    ['data-mms-ai-ops-v1', 'Kenji AI + HENNA', 'สถานะการทำงานและข้อความสำหรับตอบลูกค้า'],
  ]) {
    const pattern = new RegExp('<section[^>]*' + marker + '[\\s\\S]*?</section>');
    html = html.replace(pattern, section => {
      tools.push('<details class="lv7-tool"><summary><span><strong>' + title + '</strong><small>' + hint + '</small></span><span aria-hidden="true">＋</span></summary>' + section + '</details>');
      return '';
    });
  }
  html = html.replace(/<\/section>\s*<section class="panel" id="intake"/, tools.join('') + '</section>\n<section class="panel" id="intake"');
  return html.replace('</head>', '<style data-mms-lv7-style>' + LV7_CSS + '</style></head>');
}

const LV7_CSS = `
html[data-mms-lv7]:root body,html[data-mms-lv7]:root .mms-admin{background:#fff!important;color:#20372c!important}
html[data-mms-lv7]:root .mms-admin .shell{max-width:1200px;padding:16px 16px 104px}
html[data-mms-lv7]:root .mast{padding:0 0 12px}.mms-header-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
html[data-mms-lv7]:root .brand-row{gap:12px;margin-bottom:12px}.runtime{white-space:normal;text-align:left}
html[data-mms-lv7]:root .hero{display:block;min-height:0;border-radius:18px;background:#f0f6f2!important;border-color:#d6e4da;box-shadow:none}
html[data-mms-lv7]:root .hero-copy{max-width:none;padding:20px 22px}
html[data-mms-lv7]:root .hero h1{font-size:clamp(26px,5vw,36px);margin:0;line-height:1.3}
html[data-mms-lv7]:root .hero .eyebrow{font-size:10px;margin:0 0 6px;letter-spacing:.1em}
html[data-mms-lv7]:root .hero .hero-lead{font-size:14px;margin:8px 0 0;line-height:1.6}
html[data-mms-lv7]:root .hero .hero-note{margin:10px 0 0;padding:0;border:0;background:transparent!important;font-size:12px}
html[data-mms-lv7]:root .stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0 0;padding:0;overflow:visible}
html[data-mms-lv7]:root .stat{min-width:0;min-height:0;padding:12px;border-radius:14px;box-shadow:none!important}
html[data-mms-lv7]:root .stat b{font-size:28px;margin:4px 0;line-height:1.2;font-variant-numeric:tabular-nums}.stat small{line-height:1.5}
html[data-mms-lv7]:root .desktop-nav{display:flex;overflow-x:auto;gap:6px;padding:8px;margin:8px 0 16px;background:#fff!important;border:1px solid #dce3df;border-radius:14px;position:sticky;top:8px;z-index:30}
html[data-mms-lv7]:root .desktop-tab{flex:0 0 auto;min-height:44px;padding:10px 14px;border-radius:10px;font-size:14px}
html[data-mms-lv7]:root .section-head{align-items:center;flex-wrap:wrap;margin:12px 0}.section-head>div{min-width:0}
html[data-mms-lv7]:root .section-head h2{font-size:24px;line-height:1.4}
html[data-mms-lv7]:root .action-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
html[data-mms-lv7]:root .action-card{padding:16px;border-radius:16px;box-shadow:none!important}
html[data-mms-lv7]:root .action-card h3{font-size:18px;margin:10px 0 6px}.action-card p{line-height:1.65}
html[data-mms-lv7]:root .mms-admin :is(input,select,textarea){font-size:16px!important;min-height:46px}
html[data-mms-lv7]:root .mms-admin :is(.field label,.field-label,.editor .field label){font-size:13px}
html[data-mms-lv7]:root .mms-admin :is(.btn,button:not(.action-card)){min-height:44px;font-size:14px}
html[data-mms-lv7]:root .record-card{border-radius:16px;box-shadow:none!important}.record-title-row{flex-wrap:wrap}
html[data-mms-lv7]:root .record-main p{font-size:13px}.record-card .actions{gap:8px}.record-card .actions .btn{flex:1 0 auto}
html[data-mms-lv7]:root .mms-admin :is(.tag,.status-pill){font-size:12px}
.lv7-tool{margin:12px 0;border:1px solid #dce3df;border-radius:16px;background:#fff;overflow:hidden}
.lv7-loading{display:flex;align-items:center;gap:12px;margin-top:12px}.lv7-loading label{font-size:12px;flex:1}.lv7-loading progress{width:100px;height:6px;accent-color:#145c45}
.lv7-tool>summary{display:flex;justify-content:space-between;align-items:center;gap:12px;cursor:pointer;padding:16px;min-height:64px;list-style:none}
.lv7-tool>summary::-webkit-details-marker{display:none}.lv7-tool>summary strong{display:block;font-size:16px}.lv7-tool>summary small{display:block;font-size:12px;margin-top:3px}
.lv7-tool[open]>summary{border-bottom:1px solid #dce3df}.lv7-tool[open]>summary>span:last-child{transform:rotate(45deg)}
html[data-mms-lv7]:root .lv7-tool>.form-card{border:0;margin:0;border-radius:0;background:#fff!important;box-shadow:none!important;padding:16px}
html[data-mms-lv7]:root .lv7-tool .section-head h2{font-size:21px}
html[data-mms-lv7]:root .mms-admin :focus-visible{outline:3px solid #145c45!important;outline-offset:3px}
html[data-mms-lv7]:root .panel{scroll-margin-top:90px}
@media(max-width:767px){
 html[data-mms-lv7]:root .desktop-nav{top:calc(58px + env(safe-area-inset-top));margin-bottom:12px}
 html[data-mms-lv7]:root .hero-copy{padding:16px}
 html[data-mms-lv7]:root .mms-admin .shell{padding:10px 12px 104px}
 html[data-mms-lv7]:root .action-grid{grid-template-columns:1fr}
 html[data-mms-lv7]:root .action-card{display:grid;grid-template-columns:40px 1fr;column-gap:12px;padding:14px}
 html[data-mms-lv7]:root .action-card>span{grid-row:1/3;align-self:center}
 html[data-mms-lv7]:root .action-card h3{margin:0 0 4px;font-size:17px}
 html[data-mms-lv7]:root .action-card p{font-size:12px}
 html[data-mms-lv7]:root .stat span,html[data-mms-lv7]:root .stat small{font-size:11px}
 html[data-mms-lv7]:root .brand{max-width:32vw}
 html[data-mms-lv7]:root .panel{scroll-margin-top:125px}
}
@media(prefers-reduced-motion:reduce){html[data-mms-lv7]{scroll-behavior:auto}html[data-mms-lv7] *,html[data-mms-lv7] *:after{animation:none!important;transition:none!important}}
`;

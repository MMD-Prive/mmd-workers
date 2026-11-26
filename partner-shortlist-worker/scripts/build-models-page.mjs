import fs from 'node:fs/promises';

// Reuse the existing job-scoped search, media, expiry and submission client.
let html = await fs.readFile(new URL('../../webflow/partner/model-selection/index.html', import.meta.url), 'utf8');
html = html.replaceAll('ค่ะ', '').replaceAll('ครับ', '')
  .replaceAll('คัดไว้สำหรับงานนี้', 'ค้นหาโมเดลสำหรับงาน')
  .replaceAll('เปิดลิงก์เฉพาะงาน', 'Partner Models')
  .replaceAll('ใช้ลิงก์ฉบับเต็มที่เปอร์ส่งให้ เพื่อดูรูปและรายละเอียดของงานนี้', 'เปิดลิงก์งานที่เปอร์ส่งให้ แล้วเลือกคนที่ตรงบรีฟไว้ได้เลย');
// These are the same dictionary keys/fallback used by the existing client.
// Local page copy takes precedence over the older remotely pinned copy.
html = html.replace('window.I18N_DICT&&window.I18N_DICT.th&&window.I18N_DICT.th[full]||COPY[full]', 'COPY[full]||window.I18N_DICT&&window.I18N_DICT.th&&window.I18N_DICT.th[full]');
// Static page labels also use this reviewed fallback; do not let an older remote
// initializer replace the Partner wording. Keep the canonical keys in the source.
html = html.replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/gh\/MMD-Prive\/mmd-i18n@[^"\n]+"><\/script>/g, '');
html = html.replace('</header>', '</header><nav class="wrap" aria-label="Partner navigation" style="padding-top:12px"><a href="/partner/dashboard" style="font-size:14px">← MY Partner</a></nav>');
html = html.replaceAll('ดูรูป เลือกคนที่สนใจ แล้วส่งตัวเลือกให้เปอร์เช็กคิว', 'เลือกคนที่ตรงบรีฟไว้ได้เลย เดี๋ยวเปอร์เช็กคิวให้')
  .replaceAll('เติมข้อมูลให้เปอร์เช็กคนได้ตรงบรีฟ', 'เติมรายละเอียดอีกนิด เปอร์จะได้หาคนให้ตรงบรีฟ')
  .replaceAll('ส่งให้เปอร์', 'ให้เปอร์เช็กคิว')
  .replaceAll('ฝากข้อความถึงเปอร์', 'มีอะไรให้เปอร์ดูเพิ่มไหม');
const identityScript = `<script data-partner-identity>
(function(){
var p=new URLSearchParams(location.hash.slice(1)),incoming=p.get('p');
try{if(incoming&&incoming.length<=4096){sessionStorage.setItem('mmd-partner-models-account',incoming);p.delete('p');history.replaceState(null,'',location.pathname+location.search+(p.size?'#'+p.toString():''));}}catch{}
document.addEventListener('DOMContentLoaded',async function(){
 var name=document.getElementById('partnerAccountName'),status=document.getElementById('partnerAccountStatus'),link=document.getElementById('partnerAccountLogin'),token;
 try{token=sessionStorage.getItem('mmd-partner-models-account');}catch{}
 if(!token)return;
 status.textContent='กำลังเปิดบัญชีของคุณ…';
 try{var r=await fetch('/v1/partner/verify?t='+encodeURIComponent(token),{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'}),d=await r.json();
 if(!r.ok||d.ok!==true||typeof d.partner_name!=='string'||!d.partner_id)throw Error();
 name.textContent=d.partner_name.slice(0,100);status.textContent='Partner · พร้อมใช้งาน';link.textContent='เปลี่ยนบัญชี';
 }catch{try{sessionStorage.removeItem('mmd-partner-models-account');}catch{}name.textContent='ยังไม่ได้เข้าสู่บัญชี';status.textContent='เข้า LINE ด้วยบัญชีเดิมได้เลย';}
});
})();</script>`;
html=html.replace('<script data-shortlist-capture>',identityScript+'<script data-shortlist-capture>');
html=html.replace('<main', '<section class="wrap" aria-label="บัญชีที่กำลังใช้งาน" style="margin-top:16px;padding:14px 16px;border:1px solid var(--line);border-radius:14px;background:var(--card)"><span class="label">บัญชีของคุณ</span><strong id="partnerAccountName">ยังไม่ได้เข้าสู่บัญชี</strong><p id="partnerAccountStatus" style="margin:2px 0 8px;font-size:14px">เข้า LINE ด้วยบัญชีเดิมได้เลย</p><a id="partnerAccountLogin" href="/sigil/model/dashboard/partner-login" style="font-size:14px">เข้าด้วย LINE ↗</a></section><main');

const hero = '<section class="models-hero wrap" aria-labelledby="modelsHeroTitle"><div class="models-hero-copy"><span class="eyebrow">YOUR NEXT SELECTION</span><h1 id="modelsHeroTitle">คนที่ใช่<br>สำหรับงานนี้</h1><p>ดูรูป เลือกคนที่สนใจ<br>เดี๋ยวเปอร์ช่วยเช็กคิวให้</p></div><picture><source media="(min-width:768px)" srcset="https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6b07b12c5fbc6dff9f3bb006_BossPer-Yuki-Your-Next-Selection-Desktop.webp"><img src="https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6b07b12c0abbf49d9bfe04b6_BossPer-Yuki-Your-Next-Selection-Mobile.webp" width="1200" height="1500" alt="BossPer และ Yuki พร้อมอัลบั้มโมเดลที่คัดไว้ให้" fetchpriority="high" decoding="async"></picture></section>';
const heroStyle = '<style>.models-hero{position:relative;overflow:hidden;border-radius:22px;background:#e9dfd2;margin-top:16px;margin-bottom:16px}.models-hero picture,.models-hero img{display:block;width:100%}.models-hero img{height:auto;aspect-ratio:4/5;object-fit:contain}.models-hero-copy{padding:22px 22px 18px}.models-hero-copy h1{font-size:32px;line-height:1.35;letter-spacing:-.04em;margin:7px 0 9px;font-weight:600}.models-hero-copy p{margin:0;font-size:16px;line-height:1.6;color:var(--muted)}.models-hero-copy .eyebrow{font-size:10px;letter-spacing:.13em}.gate{margin-top:18px!important;padding:24px!important}.models-hero~section[aria-label="บัญชีที่กำลังใช้งาน"]{margin-top:0!important}@media(min-width:768px){.models-hero{min-height:320px;aspect-ratio:16/7}.models-hero picture{position:absolute;inset:0;height:100%}.models-hero img{width:100%;height:100%;aspect-ratio:auto;object-fit:contain}.models-hero-copy{position:relative;z-index:1;width:38%;padding:clamp(28px,4vw,48px)}.models-hero-copy h1{font-size:clamp(32px,3.5vw,48px)}.models-hero-copy p{color:#51483f}}@media(max-width:767px){.models-hero{display:grid;grid-template-columns:1fr}.models-hero-copy{padding:20px}.models-hero-copy h1 br{display:none}.models-hero-copy p br{display:none}}@media(prefers-reduced-motion:reduce){.models-hero{scroll-behavior:auto}}</style>';
html=html.replace('</head>',heroStyle+'</head>');
html=html.replace('<section class="wrap" aria-label="บัญชีที่กำลังใช้งาน"',hero+'<section class="wrap" aria-label="บัญชีที่กำลังใช้งาน"');
html=html.replace(/<div class="partner-art" aria-hidden="true">[\s\S]*?<\/div>/,'');


await fs.writeFile(new URL('../src/partner-models-page.js', import.meta.url), '// Generated by scripts/build-models-page.mjs.\nexport const partnerModelsPage = ' + JSON.stringify(html) + ';\n');

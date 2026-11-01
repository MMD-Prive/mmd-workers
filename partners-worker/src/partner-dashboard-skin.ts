// Presentation only. Images are approved public Webflow artwork, never Partner data.
const asset = "https://s3.amazonaws.com/webflow-prod-assets/68f879d546d2f4e2ab186e90/";
const office = asset + "6aafacd73ae8f604b01ab51e_Partner%2001.webp";
const yuki = asset + "6aafacd62571b68a1a5c1737_Yuki%20Partner%2001.webp";
const portrait = asset + "6aafacd69860715ea7ff4eb0_Yuki%20Partner%2003.webp";
export const PARTNER_HERO_VIEWS = {
  home: { title: "Home & Jobs", image: yuki, position: "72% 15%", index: "01" },
  models: { title: "Models", image: portrait, position: "70% 12%", index: "02" },
  agreements: { title: "Agreements", image: office, position: "center", index: "03" },
  earnings: { title: "Earnings", image: office, position: "center", index: "04" },
  performance: { title: "Performance", image: yuki, position: "72% 15%", index: "05" },
  console: { title: "Partner Console", image: portrait, position: "70% 12%", index: "06" },
  activity: { title: "ประวัติ / แจ้งเตือน", image: office, position: "center", index: "07" },
  privacy: { title: "Private Vault", image: office, position: "center", index: "08" }
} as const;

export function renderPartnerDashboardHero(): string {
  const hero = PARTNER_HERO_VIEWS.home;
  return '<header class="pcr-photo-hero" data-partner-hero data-hero-view="home">' +
    '<img data-hero-image src="' + hero.image + '" alt="" width="1200" height="640" fetchpriority="high" decoding="async" referrerpolicy="no-referrer" style="object-position:' + hero.position + '">' +
    '<div class="pcr-hero-rail" aria-hidden="true"><span>PARTNER / PRIVATE WORKSPACE</span><span><b data-hero-index>' + hero.index + '</b> / 08</span></div>' +
    '<div class="pcr-hero-copy"><p>SĪGIL · PARTNER DIVISION</p><h1 data-hero-title>' + hero.title + '</h1><span>พื้นที่ทำงานของ Partner</span></div>' +
    '<div class="pcr-hero-foot" aria-hidden="true"><span>BANGKOK · UTC+07</span><span>WORKSPACE / MMD</span></div></header>';
}

// Runs in the existing authenticated closure; this map contains no private fields.
export const PARTNER_HERO_JS = String.raw`
  var partnerHeroViews = ${JSON.stringify(PARTNER_HERO_VIEWS)};
  function updatePartnerHero(name) {
    var config = partnerHeroViews[name], hero = $('[data-partner-hero]', root);
    if (!config || !hero) return;
    hero.dataset.heroView = name;
    var image = $('[data-hero-image]', hero);
    if (!image) return;
    if (image.getAttribute('src') !== config.image) image.setAttribute('src', config.image);
    image.style.objectPosition = config.position;
    var title = $('[data-hero-title]', hero), index = $('[data-hero-index]', hero);
    if (title) title.textContent = config.title;
    if (index) index.textContent = config.index;
  }
`;

// Mobile first, scoped to the MMD Partner Dashboard (not the MMS spa app).
export const PARTNER_DASHBOARD_SKIN_CSS = String.raw`
body[data-mmd-partner-page="partner-dashboard"]{--pcr-bg:#0a0908;--pcr-panel:#12100e;--pcr-line:#332b22;--pcr-gold:#d7af67;--pcr-copy:#fff9f0;background:var(--pcr-bg);color:var(--pcr-copy);font-family:Anuphan,system-ui,sans-serif}
body[data-mmd-partner-page="partner-dashboard"] .mmd-partner-system{width:100%;max-width:1440px;padding:16px 16px 36px;margin:auto}
body[data-mmd-partner-page="partner-dashboard"] .mmdp-nav{margin:0 0 18px;padding:0 0 16px;border-bottom:1px solid var(--pcr-line);gap:14px}
body[data-mmd-partner-page="partner-dashboard"] .mmdp-nav>div{display:none}
body[data-mmd-partner-page="partner-dashboard"] .mmdp-brand b{font-size:25px;letter-spacing:.16em}
body[data-mmd-partner-page="partner-dashboard"] .mmdp-brand span{font-size:10px;letter-spacing:.14em;color:#b9b0a5}
body[data-mmd-partner-page="partner-dashboard"] [data-partner-control-room]{margin-top:0}
body[data-mmd-partner-page="partner-dashboard"] .pcr-privacy{background:#12100e;border:1px solid var(--pcr-line);border-radius:12px;padding:12px;margin:0 0 16px;font-size:12px}
body[data-mmd-partner-page="partner-dashboard"] .pcr-privacy p{margin:4px 0 0;color:#b9b0a5;line-height:1.65}
body[data-mmd-partner-page="partner-dashboard"] .pcr-shell{display:grid;grid-template-columns:minmax(0,1fr);gap:16px}
body[data-mmd-partner-page="partner-dashboard"] .pcr-side{position:static;display:flex;flex-direction:row;gap:6px;overflow-x:auto;max-width:100%;margin:0;padding:4px 0 12px;border:0;background:transparent;border-radius:0;scrollbar-width:thin}
body[data-mmd-partner-page="partner-dashboard"] .pcr-side small{display:none}
body[data-mmd-partner-page="partner-dashboard"] .pcr-side button{flex:0 0 auto;min-height:44px;width:auto;white-space:nowrap;border-radius:9px;padding:10px 14px;background:#161310;color:#d9d1c7;border:1px solid var(--pcr-line);font-size:13px}
body[data-mmd-partner-page="partner-dashboard"] .pcr-side button[aria-current="page"]{background:#d7af67;color:#17120b;border-color:#d7af67}
body[data-mmd-partner-page="partner-dashboard"] .pcr-main{min-width:0}
body[data-mmd-partner-page="partner-dashboard"] [data-loading]:empty{display:none}
body[data-mmd-partner-page="partner-dashboard"] .pcr-form{padding:16px 0 0}
body[data-mmd-partner-page="partner-dashboard"] .pcr-form :is(fieldset,label,.pcr-form-grid)>*{min-width:0}
body[data-mmd-partner-page="partner-dashboard"] .pcr-form fieldset{min-width:0;margin:0}
body[data-mmd-partner-page="partner-dashboard"] .pcr-form input[type="file"]{width:100%}
body[data-mmd-partner-page="partner-dashboard"] .pcr-vault-actions{flex-wrap:wrap}
body[data-mmd-partner-page="partner-dashboard"] .pcr-photo-hero{position:relative;isolation:isolate;overflow:hidden;min-height:224px;border:1px solid var(--pcr-line);border-radius:16px;background:#211b14;margin:0 0 24px}
body[data-mmd-partner-page="partner-dashboard"] .pcr-photo-hero img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2}
body[data-mmd-partner-page="partner-dashboard"] .pcr-photo-hero:after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,rgba(7,6,5,.96),rgba(7,6,5,.38) 65%,rgba(7,6,5,.06));z-index:-1}
body[data-mmd-partner-page="partner-dashboard"] .pcr-hero-copy{padding:76px 22px 24px}
body[data-mmd-partner-page="partner-dashboard"] .pcr-hero-copy p{color:#e8cd9b;font-size:10px;letter-spacing:.16em;margin:0 0 10px}
body[data-mmd-partner-page="partner-dashboard"] .pcr-hero-copy h1{font-size:clamp(27px,6vw,42px);line-height:1.2;letter-spacing:-.025em;margin:0 0 8px;color:#fff9f0}
body[data-mmd-partner-page="partner-dashboard"] .pcr-hero-copy span{font-size:13px;color:#d9d1c7}
body[data-mmd-partner-page="partner-dashboard"] .pcr-top{gap:14px;flex-wrap:wrap;margin-bottom:18px}
body[data-mmd-partner-page="partner-dashboard"] .pcr-top h2{font-size:24px;line-height:1.35;margin:4px 0 8px}
body[data-mmd-partner-page="partner-dashboard"] .pcr-top p{font-size:13px;line-height:1.8;color:#b9b0a5}
body[data-mmd-partner-page="partner-dashboard"] .pcr-metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
body[data-mmd-partner-page="partner-dashboard"] .pcr-metrics article,body[data-mmd-partner-page="partner-dashboard"] .pcr-section,body[data-mmd-partner-page="partner-dashboard"] .pcr-job,body[data-mmd-partner-page="partner-dashboard"] .pcr-model,body[data-mmd-partner-page="partner-dashboard"] .pcr-vault-card{background:#12100e;border:1px solid var(--pcr-line);border-radius:14px;padding:16px;min-width:0}
body[data-mmd-partner-page="partner-dashboard"] .pcr-metrics strong{font-size:23px;color:#fff9f0;overflow-wrap:anywhere}
body[data-mmd-partner-page="partner-dashboard"] .pcr-models,body[data-mmd-partner-page="partner-dashboard"] .pcr-form-grid{grid-template-columns:minmax(0,1fr)}
body[data-mmd-partner-page="partner-dashboard"] .pcr-toolbar{display:flex;flex-wrap:wrap;gap:10px}
body[data-mmd-partner-page="partner-dashboard"] .pcr-toolbar label{flex:1 1 140px;min-width:0}
body[data-mmd-partner-page="partner-dashboard"] :is(input,select,textarea){max-width:100%;min-height:44px;font-size:16px;border-radius:9px;background:#0c0b09;border-color:#42382c;color:#fff9f0;box-sizing:border-box}
body[data-mmd-partner-page="partner-dashboard"] :is(button,.mmdp-btn){min-height:44px;border-radius:9px;background:#d7af67;color:#17120b;box-shadow:none}
body[data-mmd-partner-page="partner-dashboard"] button.ghost{background:transparent;color:#d7af67;border:1px solid #51432f}
body[data-mmd-partner-page="partner-dashboard"] button.danger{background:#361b18;color:#ffc6bc}
body[data-mmd-partner-page="partner-dashboard"] :is(button,a,input,select,textarea):focus-visible{outline:2px solid #f4d9a9;outline-offset:3px}
body[data-mmd-partner-page="partner-dashboard"] .pcr-dialog{width:calc(100% - 24px);max-width:880px;max-height:90dvh;padding:18px;border:1px solid #51432f;border-radius:16px;background:#12100e;color:#fff9f0;box-sizing:border-box}
body[data-mmd-partner-page="partner-dashboard"] .pcr-dialog::backdrop{background:rgba(0,0,0,.78)}
body[data-mmd-partner-page="partner-dashboard"] .pcr-section-head{flex-wrap:wrap;gap:10px}
body[data-mmd-partner-page="partner-dashboard"] .pcr-main :is(p,a,output){overflow-wrap:anywhere}
body[data-mmd-partner-page="partner-dashboard"] .pcr-main table{display:block;overflow-x:auto;max-width:100%}
body[data-mmd-partner-page="partner-dashboard"] .pcr-dashboard-links{display:flex;gap:16px;flex-wrap:wrap;font-size:12px;margin:24px 0;color:#b9b0a5}
body[data-mmd-partner-page="partner-dashboard"] [hidden]{display:none!important}
/* LV11: burnt-brown Partner workspace; photographs retain the quiet digital layer. */
body[data-mmd-partner-page="partner-dashboard"]{--pcr-bg:#160d08;--pcr-panel:#28180f;--pcr-line:#65432b;--pcr-gold:#e3b861;--pcr-copy:#ead9b9;--pcr-muted:#c2a77f;--mmdp-line:rgba(198,139,73,.35);background:radial-gradient(ellipse at 85% -10%,rgba(155,79,29,.18),transparent 45rem),linear-gradient(180deg,#160d08,#1d110a 58%,#120a06);color:var(--pcr-copy)}
body[data-mmd-partner-page="partner-dashboard"] .mmdp-nav{border-bottom-color:var(--pcr-line)}
body[data-mmd-partner-page="partner-dashboard"] .mmdp-brand span{color:#f3d58e}
body[data-mmd-partner-page="partner-dashboard"] .mmdp-nav>div a{font-family:var(--mmdp-font-th)}
body[data-mmd-partner-page="partner-dashboard"] .pcr-privacy{display:grid;grid-template-columns:20px minmax(0,1fr);align-items:center;gap:10px;border-color:var(--pcr-line);border-left:2px solid #e3b861;background:linear-gradient(90deg,#302013,#21140d);padding:12px 13px;margin-bottom:14px}
body[data-mmd-partner-page="partner-dashboard"] .pcr-privacy>span{font-size:0;width:12px;height:10px;border:1.5px solid #e4bd73;border-radius:2px;position:relative;margin:5px 0 0 2px}
body[data-mmd-partner-page="partner-dashboard"] .pcr-privacy>span:before{content:"";position:absolute;width:6px;height:6px;border:1.5px solid #e4bd73;border-radius:5px 5px 0 0;border-bottom:0;left:1.5px;top:-7px}
body[data-mmd-partner-page="partner-dashboard"] .pcr-privacy b{color:#f0cd83;font-size:13px;font-weight:600}
body[data-mmd-partner-page="partner-dashboard"] .pcr-privacy p{color:#ead9b9;font-size:13px;line-height:1.55}
body[data-mmd-partner-page="partner-dashboard"] .pcr-side{gap:7px}
body[data-mmd-partner-page="partner-dashboard"] .pcr-side button{position:relative;font-family:var(--mmdp-font-th);background:#28180f;color:#e4c996;border:1px solid var(--pcr-line);border-radius:7px;font-size:14px;font-weight:500;letter-spacing:.01em;transition:background .15s,border-color .15s,color .15s}
body[data-mmd-partner-page="partner-dashboard"] .pcr-side button:hover{background:#392315;border-color:#b48048;color:#f3d58e}
body[data-mmd-partner-page="partner-dashboard"] .pcr-side button[aria-current="page"]{background:#402713;border-color:#d0a35f;color:#ffe2a6;box-shadow:inset 0 -2px #e3b861}
body[data-mmd-partner-page="partner-dashboard"] .pcr-photo-hero{min-height:236px;border:1px solid #805632;border-radius:12px;background:#28180f;margin-bottom:18px;box-shadow:0 22px 60px rgba(18,8,2,.28)}
body[data-mmd-partner-page="partner-dashboard"] .pcr-photo-hero:before{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;background:repeating-linear-gradient(90deg,transparent 0 53px,rgba(244,201,132,.045) 54px),repeating-linear-gradient(0deg,transparent 0 53px,rgba(244,201,132,.035) 54px);mix-blend-mode:screen}
body[data-mmd-partner-page="partner-dashboard"] .pcr-photo-hero:after{background:linear-gradient(90deg,rgba(26,13,6,.92),rgba(26,13,6,.58) 54%,rgba(26,13,6,.10)),linear-gradient(0deg,rgba(26,13,6,.70),transparent 70%)}
body[data-mmd-partner-page="partner-dashboard"] .pcr-hero-rail,body[data-mmd-partner-page="partner-dashboard"] .pcr-hero-foot{position:relative;display:flex;justify-content:space-between;gap:10px;margin:0 17px;color:#f1d39a;font:500 11px/1.4 "General Sans",Arial,sans-serif;letter-spacing:.08em}
body[data-mmd-partner-page="partner-dashboard"] .pcr-hero-rail{padding:14px 0 10px;border-bottom:1px solid rgba(241,198,124,.36)}
body[data-mmd-partner-page="partner-dashboard"] .pcr-hero-rail b{color:#ffe2a6;font-weight:600;font-variant-numeric:tabular-nums}
body[data-mmd-partner-page="partner-dashboard"] .pcr-hero-foot{padding:10px 0 13px;border-top:1px solid rgba(241,198,124,.36);color:#e4c996}
body[data-mmd-partner-page="partner-dashboard"] .pcr-hero-copy{padding:33px 18px 20px}
body[data-mmd-partner-page="partner-dashboard"] .pcr-hero-copy p{color:#f3d58e;font-size:11px;letter-spacing:.12em}
body[data-mmd-partner-page="partner-dashboard"] .pcr-hero-copy h1{font-size:clamp(30px,6.4vw,46px);line-height:1.12;letter-spacing:-.035em;color:#f0cd83}
body[data-mmd-partner-page="partner-dashboard"] .pcr-hero-copy span{color:#f2dfbd;font-size:14px}
body[data-mmd-partner-page="partner-dashboard"] .pcr-top{margin-bottom:14px}
body[data-mmd-partner-page="partner-dashboard"] .pcr-top h2{font-size:23px}
body[data-mmd-partner-page="partner-dashboard"] .pcr-top p{color:#d7bc91;font-size:14px}
body[data-mmd-partner-page="partner-dashboard"] [data-view-panel]:not([data-view-panel="home"]) .pcr-top .mmdp-eyebrow{display:none}
body[data-mmd-partner-page="partner-dashboard"] [data-view-panel]:not([data-view-panel="home"]) .pcr-top h2{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
body[data-mmd-partner-page="partner-dashboard"] .pcr-metrics article,body[data-mmd-partner-page="partner-dashboard"] .pcr-section,body[data-mmd-partner-page="partner-dashboard"] .pcr-job,body[data-mmd-partner-page="partner-dashboard"] .pcr-model,body[data-mmd-partner-page="partner-dashboard"] .pcr-vault-card{background:linear-gradient(155deg,#2d1b11,#21140d);border-color:var(--pcr-line);border-radius:12px}
body[data-mmd-partner-page="partner-dashboard"] .pcr-metrics article{position:relative;min-height:104px;padding:15px 14px;overflow:hidden}
body[data-mmd-partner-page="partner-dashboard"] .pcr-metrics article:before{content:"";position:absolute;top:0;left:14px;width:27px;height:2px;background:#e3b861}
body[data-mmd-partner-page="partner-dashboard"] .pcr-metrics article:after{content:"";position:absolute;right:14px;top:15px;width:5px;height:5px;border:1px solid #c89b5b;transform:rotate(45deg)}
body[data-mmd-partner-page="partner-dashboard"] .pcr-metrics span{color:#d2b684;font-size:13px;line-height:1.4}
body[data-mmd-partner-page="partner-dashboard"] .pcr-metrics strong{font:600 clamp(22px,6vw,32px)/1.1 "General Sans",Anuphan,Arial,sans-serif;font-variant-numeric:tabular-nums;letter-spacing:-.045em;color:#f3d58e}
body[data-mmd-partner-page="partner-dashboard"] .pcr-section h3,body[data-mmd-partner-page="partner-dashboard"] .pcr-model h3{font-weight:600}
body[data-mmd-partner-page="partner-dashboard"] .pcr-telegram{background:#291a10;border-color:#765231;border-radius:12px}
body[data-mmd-partner-page="partner-dashboard"] .pcr-toolbar{border-top:1px solid var(--pcr-line);padding-top:15px}
body[data-mmd-partner-page="partner-dashboard"] :is(input,select,textarea){background:#1b110b;border-color:#795333;color:#f1dfc0}
body[data-mmd-partner-page="partner-dashboard"] :is(input,select,textarea)::placeholder{color:#c3a981;opacity:1}
body[data-mmd-partner-page="partner-dashboard"] :is(button,.mmdp-btn){background:#e3b861;color:#25150b}
body[data-mmd-partner-page="partner-dashboard"] :is(.pcr-toolbar button,.pcr-section-head button,.pcr-job button.ghost,.pcr-vault-actions button:not([data-unlock-vault])){background:#352115;border:1px solid #805735;color:#f3d58e}
body[data-mmd-partner-page="partner-dashboard"] .pcr-dashboard-links{border-top:1px solid var(--pcr-line);padding-top:16px;color:#d2b684}
body[data-mmd-partner-page="partner-dashboard"] .pcr-dialog,body[data-mmd-partner-page="partner-dashboard"] .pcr-dialog-head{background:#24160e;border-color:#805735}
body[data-mmd-partner-page="partner-dashboard"] .pcr-job dl div{background:#382419}
body[data-mmd-partner-page="partner-dashboard"] .pcr-flash{background:#382419;color:#f1dfc0}
body[data-mmd-partner-page="partner-dashboard"] .pcr-side small{color:#d2b684}
body[data-mmd-partner-page="partner-dashboard"] :is(.pcr-top h2,.pcr-section h3,.pcr-job h3,.pcr-model h3,.pcr-dialog-head h2,.pcr-vault-card h3){color:#f0cd83!important;-webkit-text-fill-color:#f0cd83!important}
body[data-mmd-partner-page="partner-dashboard"] .pcr-hero-copy h1{color:#f0cd83!important;-webkit-text-fill-color:#f0cd83!important}
@media(max-width:420px){body[data-mmd-partner-page="partner-dashboard"] .pcr-hero-rail,body[data-mmd-partner-page="partner-dashboard"] .pcr-hero-foot{font-size:10px;letter-spacing:.02em}}
@media print{body[data-mmd-partner-page="partner-dashboard"] :is(.pcr-photo-hero,.pcr-dashboard-links){display:none!important}}
@media(min-width:860px){
body[data-mmd-partner-page="partner-dashboard"] .mmd-partner-system{padding:28px 36px 48px}
body[data-mmd-partner-page="partner-dashboard"] .mmdp-nav>div{display:flex}
body[data-mmd-partner-page="partner-dashboard"] .pcr-shell{grid-template-columns:192px minmax(0,1fr);gap:28px}
body[data-mmd-partner-page="partner-dashboard"] .pcr-side{position:sticky;top:20px;align-self:start;display:flex;flex-direction:column;overflow:visible;padding:0}
body[data-mmd-partner-page="partner-dashboard"] .pcr-side small{display:block;color:#b9b0a5;padding:6px 12px 12px;letter-spacing:.12em}
body[data-mmd-partner-page="partner-dashboard"] .pcr-side button{width:100%;text-align:left;background:transparent;border-color:transparent}
body[data-mmd-partner-page="partner-dashboard"] .pcr-photo-hero{min-height:272px}
body[data-mmd-partner-page="partner-dashboard"] .pcr-hero-copy{padding:110px 32px 32px}
body[data-mmd-partner-page="partner-dashboard"] .pcr-metrics{grid-template-columns:repeat(4,minmax(0,1fr))}
body[data-mmd-partner-page="partner-dashboard"] .pcr-models,body[data-mmd-partner-page="partner-dashboard"] .pcr-form-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
body[data-mmd-partner-page="partner-dashboard"] .pcr-side{border-left:1px solid var(--pcr-line);gap:3px}
body[data-mmd-partner-page="partner-dashboard"] .pcr-side button[aria-current="page"]{box-shadow:inset 2px 0 #e3b861;background:#402713;border-color:transparent}
body[data-mmd-partner-page="partner-dashboard"] .pcr-photo-hero{min-height:286px}
body[data-mmd-partner-page="partner-dashboard"] .pcr-hero-rail,body[data-mmd-partner-page="partner-dashboard"] .pcr-hero-foot{margin:0 30px}
body[data-mmd-partner-page="partner-dashboard"] .pcr-hero-copy{padding:50px 32px 29px}
}
`;

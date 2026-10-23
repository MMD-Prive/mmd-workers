// Presentation only. Images are approved public Webflow artwork, never Partner data.
const asset = "https://s3.amazonaws.com/webflow-prod-assets/68f879d546d2f4e2ab186e90/";
const office = asset + "6aafacd73ae8f604b01ab51e_Partner%2001.webp";
const yuki = asset + "6aafacd62571b68a1a5c1737_Yuki%20Partner%2001.webp";
const portrait = asset + "6aafacd69860715ea7ff4eb0_Yuki%20Partner%2003.webp";
export const PARTNER_HERO_VIEWS = {
  home: { title: "Home & Jobs", image: yuki, position: "72% 15%" },
  models: { title: "Models", image: portrait, position: "70% 12%" },
  agreements: { title: "Agreements", image: office, position: "center" },
  earnings: { title: "Earnings", image: office, position: "center" },
  performance: { title: "Performance", image: yuki, position: "72% 15%" },
  console: { title: "Partner Console", image: portrait, position: "70% 12%" },
  activity: { title: "ประวัติ / แจ้งเตือน", image: office, position: "center" },
  privacy: { title: "Private Vault", image: office, position: "center" }
} as const;

export function renderPartnerDashboardHero(): string {
  const hero = PARTNER_HERO_VIEWS.home;
  return '<header class="pcr-photo-hero" data-partner-hero data-hero-view="home">' +
    '<img data-hero-image src="' + hero.image + '" alt="" width="1200" height="640" fetchpriority="high" decoding="async" referrerpolicy="no-referrer" style="object-position:' + hero.position + '">' +
    '<div class="pcr-hero-copy"><p>SĪGIL · PARTNER DIVISION</p><h1 data-hero-title>' + hero.title + '</h1><span>พื้นที่ทำงานของ Partner</span></div></header>';
}

// Runs in the existing authenticated closure; this map contains no private fields.
export const PARTNER_HERO_JS = String.raw`
  var partnerHeroViews = ${JSON.stringify(PARTNER_HERO_VIEWS)};
  function updatePartnerHero(name) {
    var config = partnerHeroViews[name], hero = $('[data-partner-hero]', root);
    if (!config || !hero) return;
    hero.dataset.heroView = name;
    var image = $('[data-hero-image]', hero);
    if (image.getAttribute('src') !== config.image) image.setAttribute('src', config.image);
    image.style.objectPosition = config.position;
    $('[data-hero-title]', hero).textContent = config.title;
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
}
`;

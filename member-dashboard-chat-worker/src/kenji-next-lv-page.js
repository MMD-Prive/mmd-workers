/** MMD NEXT LV · /member/kenji (presentation only).
 * Never receives tokens, account authority or unverified membership fields.
 * HTML / CSS / client JS form one CSP-nonced, same-origin document.
 * Assets: Kenji-04 owner-approved ZIP, uploaded to Webflow Kenji AI 20 (desktop/mobile/avatar); Curated=MMD 2027 gold-white logo, Private=SIGIL Logo 2027. Visual navigation does not grant access.
 */
import { KENJI_CURATED_LOGO, KENJI_PRIVATE_LOGO } from "./kenji-member-brand-assets.js";

const NEXT_LV_DOCUMENT = String.raw`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#101113"><meta name="robots" content="noindex,nofollow"><title>Kenji · MY MMD Concierge</title><meta name="description" content="Kenji — ผู้ช่วยข้อมูลสมาชิก MY MMD คำถามทั่วไปและโปรโมชั่นที่ประกาศแล้ว"><style nonce="test_nonce">
/* MMD Member Concierge · NEXT LV · Mobile-first clean rebuild */
/* Webflow MMD official registered fonts · fonts declared, not just named in a fallback stack. */
@font-face{font-family:"LINE Seed Sans TH";src:url("https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a619dd598baf067153fd1cc_LINESeedSansTH_W_Rg.woff2") format("woff2");font-style:normal;font-weight:400;font-display:swap}
@font-face{font-family:"LINE Seed Sans TH";src:url("https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a619dd4dc8d84b48cc84959_LINESeedSansTH_W_Bd.woff2") format("woff2");font-style:normal;font-weight:700;font-display:swap}
@font-face{font-family:"LINE Seed Sans TH";src:url("https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a619dd5cdf166a1e9e45b98_LINESeedSansTH_W_XBd.woff2") format("woff2");font-style:normal;font-weight:800;font-display:swap}
@font-face{font-family:"Canela";src:url("https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aa0f04650d5df1332b66adf_Canela-Regular-Trial.otf") format("opentype");font-style:normal;font-weight:400;font-display:swap}
@font-face{font-family:"Canela";src:url("https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aa0f046e832801d3092b914_Canela-RegularItalic-Trial.otf") format("opentype");font-style:italic;font-weight:500;font-display:swap}
@font-face{font-family:"Inter";src:url("https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aaf0d82bfb82da88bc38b16_Inter_18pt-Regular.ttf") format("truetype");font-style:normal;font-weight:400;font-display:swap}
@font-face{font-family:"Inter";src:url("https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aaf094cbae381fe8aed58b5_Inter_18pt-SemiBold.ttf") format("truetype");font-style:normal;font-weight:600;font-display:swap}

:root{color-scheme:dark;--bg:#101113;--panel:#191a1d;--surface2:#252529;--ink:#f6f2e9;--muted:#cbc3b9;--dim:#b0a79c;--border:rgba(239,226,208,.17);--wine:#a21e39;--wine2:#672638;--gold:#d3bc93;--focus:#ffe0a2}
*,*:before,*:after{box-sizing:border-box}
html,body{margin:0;width:100%;height:100%;min-height:100%;background:var(--bg)}
body{overflow:hidden;color:var(--ink);font-family:"LINE Seed Sans TH","Noto Sans Thai",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}button,textarea{font:inherit}button{cursor:pointer}button:disabled{opacity:.5;cursor:wait}
[hidden]{display:none!important}a:focus-visible,button:focus-visible,textarea:focus-visible{outline:3px solid var(--focus);outline-offset:3px}
.skip{position:fixed;top:2px;left:8px;z-index:30;transform:translateY(-150%);background:var(--ink);color:var(--bg);padding:12px;border-radius:9px}.skip:focus{transform:none}
.page{display:grid;grid-template-rows:auto minmax(0,1fr);height:100vh;height:100dvh;min-height:0;width:100%;max-width:1550px;margin:auto;background:var(--bg)}
.top{z-index:5;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:60px;padding:calc(9px + env(safe-area-inset-top)) 16px 9px;border-bottom:1px solid var(--border);background:#111214}
.brand{display:flex;align-items:center;gap:8px;min-width:0}.brand-mark{width:92px;height:31px;flex:0 0 auto;display:block;object-fit:contain;object-position:left center}.brand-rule{width:1px;height:24px;background:var(--border);flex:none}.brand-label{display:grid;gap:2px;min-width:0}.brand-label strong{font-size:11px;line-height:1.1;font-weight:800;letter-spacing:.15em;color:var(--ink)}.brand-label small{font-size:8px;white-space:nowrap;letter-spacing:.08em;color:var(--gold)}
.top-actions{display:flex;gap:10px;align-items:center}.top-link{display:inline-flex;align-items:center;min-height:44px;font-size:11px;font-weight:700;white-space:nowrap;color:var(--ink)}.top-link span{color:var(--gold);margin-left:4px}.top-link--outline{display:none}
.workspace{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:clamp(146px,22dvh,190px) minmax(0,1fr);height:100%;min-width:0;min-height:0;overflow:hidden}
.hero{position:relative;isolation:isolate;overflow:hidden;min-width:0;min-height:0;background:#151416}
.hero-picture,.hero-image{position:absolute;inset:0;width:100%;height:100%;display:block}.hero-image{object-fit:cover;object-position:52% 11%;filter:saturate(.91) contrast(1.02)}
.hero:before{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;background:linear-gradient(90deg,rgba(13,14,16,.97),rgba(13,14,16,.86) 34%,rgba(13,14,16,.12) 95%),linear-gradient(0deg,rgba(13,14,16,.52),transparent 65%)}
.hero-grain{position:absolute;inset:0;z-index:2;pointer-events:none;background:radial-gradient(circle at 85% 14%,rgba(221,170,108,.16),transparent 39%)}
.hero-copy{position:relative;z-index:3;display:flex;align-items:flex-start;flex-direction:column;width:73%;height:100%;padding:15px 17px 18px}
.eyebrow{font-size:8px;font-weight:800;letter-spacing:.15em;line-height:1.4;color:var(--gold)}
.hero-title{margin:8px 0 3px;font-family:Canela,"Times New Roman",Georgia,serif;font-size:clamp(45px,12vw,67px);font-weight:400;letter-spacing:-.055em;line-height:.89;color:var(--ink)}
.hero-italic{font:italic 500 13px/1.5 Canela,Georgia,serif;color:var(--ink)}
.hero-copy h1{margin:auto 0 0;font-size:14px;font-weight:650;line-height:1.45;color:var(--ink)}
.hero-body,.hero-links,.hero-divider,.hero-footnote{display:none}
.chat-shell{position:relative;z-index:4;display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden;margin-top:-13px;border-radius:18px 18px 0 0;background:var(--panel);border-top:1px solid var(--border)}
.chat-head{display:flex;align-items:center;justify-content:space-between;gap:9px;flex:none;padding:10px 16px 9px;border-bottom:1px solid var(--border)}
.chat-heading{display:flex;align-items:center;gap:9px;min-width:0}.small-avatar,.message__avatar{overflow:hidden;display:flex;align-items:center;justify-content:center;flex:none;border:1px solid rgba(222,188,147,.42);border-radius:50%;background:var(--wine2)}.small-avatar{width:36px;height:36px}.small-avatar img,.message__avatar img{display:block;width:100%;height:100%;object-fit:cover;object-position:50% 22%}.chat-name{display:grid;gap:1px}.chat-name strong{color:var(--ink);font-size:15px;line-height:1.2;font-weight:750}.chat-name small{color:var(--gold);font-size:9px;line-height:1.4;letter-spacing:.14em}
.clear{display:inline-flex;align-items:center;justify-content:center;flex:none;min-height:38px;padding:7px 12px;border:1px solid var(--border);border-radius:99px;background:transparent;font-size:11px;color:var(--muted)}
.member-line{display:flex;align-items:center;justify-content:space-between;gap:8px;flex:none;min-height:34px;padding:7px 16px;background:#221f21;border-bottom:1px solid var(--border);color:var(--muted);font-size:11px}.member-line span{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.member-line a{flex:none;max-width:38%;font-size:11px;text-decoration:underline;text-underline-offset:3px;color:var(--gold)}
.mode-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;flex:none;margin:10px 16px 0;padding:4px;border:1px solid var(--border);border-radius:13px;background:#111315}
.mode{min-height:42px;padding:8px 9px;border:0;border-radius:9px;background:none;color:var(--muted);font-size:12px;font-weight:750}.mode[aria-pressed="true"]{background:#582135;color:var(--ink);box-shadow:inset 0 0 0 1px rgba(229,150,171,.3)}
.intro-panel{flex:none;padding:10px 16px 5px}.intro-panel h2{margin:0 0 7px;color:var(--ink);font-size:12px;font-weight:700;line-height:1.5}
.prompt-row{display:flex;gap:7px;overflow-x:auto;overscroll-behavior-inline:contain;scrollbar-width:none;padding-bottom:4px}.prompt-row::-webkit-scrollbar{display:none}.prompt{flex:none;display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:8px 13px;border:1px solid var(--border);border-radius:99px;background:var(--surface2);color:var(--ink);font-size:12px;font-weight:650;white-space:nowrap}.prompt:hover{border-color:var(--gold)}
.promo-info{display:grid;gap:6px;max-height:165px;overflow:auto;padding:12px 14px;border:1px solid rgba(211,188,147,.35);border-radius:12px;background:#252021}.promo-info strong{font-size:13px;color:var(--ink)}.promo-info p{margin:0;font-size:12px;line-height:1.6;color:var(--muted)}.promo-info a{font-size:12px;font-weight:750;color:var(--gold)}.promo-info .prompt{justify-self:start;margin-top:2px}
.history{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:12px;padding:12px 16px 16px;scrollbar-color:#494041 transparent}
.message{display:flex;align-items:flex-end;gap:8px;max-width:92%}.message--bot{align-self:flex-start}.message--user{align-self:flex-end;flex-direction:row-reverse}.message__avatar{width:29px;height:29px}.message__bubble{min-width:0;max-width:100%;padding:11px 13px;border:1px solid var(--border);border-radius:15px 15px 15px 4px;background:#27282a;color:var(--ink);font-size:13px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere}.message--user .message__bubble{background:#4d2233;border-color:#7d3b53;border-radius:15px 15px 4px 15px}.message__action{display:inline-flex;align-items:center;min-height:38px;margin-top:9px;padding:7px 12px;border:1px solid var(--gold);border-radius:99px;color:var(--gold);font-size:12px;font-weight:750}.review-note{margin:8px 0 0;color:var(--gold);font-size:11px;line-height:1.5}
.status{flex:none;padding:0 16px;color:var(--muted);font-size:12px;line-height:1.55}.status:not(:empty){padding-top:8px;padding-bottom:7px}.status[data-tone="error"]{color:#ffb5c3}
.composer{flex:none;display:flex;flex-direction:column;gap:7px;padding:10px 16px calc(10px + env(safe-area-inset-bottom));border-top:1px solid var(--border);background:#111317}
.composer-row{display:grid;grid-template-columns:minmax(0,1fr) 48px;gap:9px;align-items:end}.composer textarea{display:block;width:100%;min-width:0;min-height:48px;max-height:122px;resize:none;padding:12px 13px;border:1px solid #4e484a;border-radius:14px;background:#242428;color:var(--ink);font-size:16px;line-height:1.5;outline:none}.composer textarea::placeholder{color:#c0b7af}.composer textarea:focus{border-color:var(--gold)}.send{display:flex;align-items:center;justify-content:center;width:48px;height:48px;border:0;border-radius:14px;background:var(--wine);color:#fff;font-size:23px}.send:hover{background:#bb314f}.composer-caption{display:flex;align-items:center;justify-content:space-between;gap:12px;color:var(--dim);font-size:10px;line-height:1.4}.composer-caption a{color:var(--muted);text-decoration:underline;text-underline-offset:3px}
@media(max-width:355px){.brand-mark{width:73px}.brand-label small{font-size:7px}.hero-copy{width:78%}.hero-title{font-size:43px}.eyebrow{font-size:7px}.top-link{font-size:10px}.chat-head{padding:8px 12px}.member-line,.intro-panel,.composer{padding-left:12px;padding-right:12px}.mode-row{margin-left:12px;margin-right:12px}.history{padding-left:12px;padding-right:12px}}
@media(max-height:670px) and (max-width:920px){.workspace{grid-template-rows:124px minmax(0,1fr)}.hero-copy{padding-top:10px;padding-bottom:13px}.hero-title{font-size:42px;margin:5px 0 2px}.hero-copy h1{font-size:12px}.chat-head{padding-top:7px;padding-bottom:6px}.intro-panel{padding-top:6px;padding-bottom:2px}.mode-row{margin-top:6px}.composer-caption{display:none}}
@media(min-width:680px) and (max-width:920px){.workspace{grid-template-rows:clamp(170px,24dvh,235px) minmax(0,1fr)}.hero-title{font-size:78px}.hero-italic{font-size:18px}.hero-copy h1{font-size:18px}.hero-copy{padding:22px 30px}.chat-head{padding:14px 25px 12px}.member-line{padding:8px 25px}.mode-row{margin:12px 25px 0}.intro-panel,.history,.composer{padding-left:25px;padding-right:25px}}
@media(min-width:921px){.page{grid-template-rows:76px minmax(0,1fr)}.top{padding:0 34px}.brand{gap:14px}.brand-mark{width:142px;height:43px}.brand-rule{height:29px}.brand-label strong{font-size:13px;letter-spacing:.18em}.brand-label small{font-size:9px;letter-spacing:.14em}.top-actions{gap:19px}.top-link{font-size:13px}.top-link--outline{display:inline-flex;min-height:42px;padding:10px 16px;border:1px solid var(--border);border-radius:99px}.workspace{grid-template-columns:minmax(0,.96fr) minmax(0,1.04fr);grid-template-rows:minmax(0,1fr);gap:20px;padding:21px 28px 27px}.hero{border:1px solid var(--border);border-radius:24px;background:#171517}.hero-image{object-position:100% center}.hero:before{background:linear-gradient(90deg,rgba(15,14,17,.96) 1%,rgba(15,14,17,.72) 42%,rgba(15,14,17,.09) 90%),linear-gradient(0deg,#171519,transparent 60%)}.hero-copy{width:91%;padding:clamp(28px,3.7vw,56px)}.eyebrow{font-size:10px;letter-spacing:.22em}.hero-title{margin:28px 0 11px;font-size:clamp(70px,6.5vw,103px)}.hero-italic{font-size:21px}.hero-copy h1{font-size:clamp(22px,2.15vw,29px);line-height:1.48;margin:auto 0 11px}.hero-body{display:block;max-width:340px;margin:0 0 19px;color:var(--muted);font-size:14px;line-height:1.75}.hero-links{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px}.hero-links a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:9px 15px;border:1px solid var(--border);border-radius:99px;font-size:12px;font-weight:750;background:#1c1d20}.hero-links a:first-child{background:var(--wine);border-color:#b84b64}.hero-divider{display:block;width:45px;height:1px;margin-bottom:13px;background:var(--gold)}.hero-footnote{display:block;max-width:300px;color:var(--dim);font-size:10px;line-height:1.6}.chat-shell{margin:0;border:1px solid var(--border);border-radius:24px}.chat-head{padding:17px 23px 13px}.small-avatar{width:42px;height:42px}.chat-name strong{font-size:16px}.chat-name small{font-size:10px}.member-line{padding:9px 23px;font-size:12px}.mode-row{margin:16px 23px 0}.mode{min-height:44px;font-size:13px}.intro-panel{padding:15px 23px 7px}.intro-panel h2{font-size:13px}.prompt{min-height:40px}.history{gap:14px;padding:19px 23px 24px}.message__bubble{font-size:14px;padding:12px 14px}.composer{padding:13px 23px 16px}.composer-caption{font-size:10px}.promo-info{max-height:240px;padding:14px 16px}}
@media(min-width:1350px){.workspace{grid-template-columns:minmax(0,.95fr) minmax(0,1.05fr);padding-left:39px;padding-right:39px}.hero-copy{padding:55px}.hero-title{font-size:105px}}
@media(prefers-reduced-motion:reduce){*,*:before,*:after{scroll-behavior:auto!important;transition:none!important;animation:none!important}}

/* Curated and Private are distinct brand worlds; navigation never grants entitlement. */
.world-nav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;flex:none;padding:9px 16px 0}
.world-link{display:flex;align-items:center;flex-direction:column;justify-content:center;gap:4px;min-width:0;min-height:73px;padding:8px 10px;border:1px solid var(--border);border-radius:12px;background:#202125;transition:border-color .16s}
.world-link:hover{border-color:var(--gold)}
.world-link img{display:block;flex:0 0 auto;max-width:100%;width:min(100%,132px);height:36px;object-fit:contain;object-position:center}
.world-link--private img{width:min(100%,140px)}
.world-link span{min-width:0;text-align:center;color:var(--muted);font-size:10px;font-weight:700;letter-spacing:.11em;line-height:1.2}
.world-link--curated{border-color:rgba(211,188,147,.39);background:#252123}
.world-link--curated span{color:var(--gold)}
.world-link--private{background:#1c2023}
@media(max-width:360px){.world-nav{gap:6px;padding-left:12px;padding-right:12px}.world-link{padding:6px 7px}.world-link img{width:min(100%,123px);height:31px}.world-link--private img{width:min(100%,128px)}.world-link span{font-size:9px}}
@media(max-height:670px) and (max-width:920px){.world-nav{padding-top:5px}.world-link{min-height:38px;flex-direction:row;gap:5px}.world-link img{max-width:62%;width:74px;height:24px;object-position:left center}.world-link--private img{width:85px}.world-link span{font-size:9px;letter-spacing:0;text-align:right}}
@media(min-width:921px){.world-nav{padding:14px 23px 0;gap:9px}.world-link{min-height:84px;padding:10px 13px}.world-link img{width:min(100%,150px);max-width:100%;height:45px}.world-link--private img{width:min(100%,160px)}.world-link span{font-size:11px}}


/* Compact landscape/short-phone QA: keep at least one full concierge bubble visible. */
@media(max-height:670px) and (max-width:920px){
.workspace{grid-template-rows:100px minmax(0,1fr)}
.hero-copy{padding-top:8px;padding-bottom:9px}.hero-title{font-size:38px;margin:3px 0 2px}.hero-italic{font-size:11px}.hero-copy h1{font-size:11px}
.chat-head{padding:5px 12px 4px}.small-avatar{width:29px;height:29px}.chat-name strong{font-size:13px}.clear{min-height:31px;padding:5px 9px}
.member-line{min-height:27px;padding:4px 12px;font-size:10px}
.world-nav{padding:4px 12px 0}.world-link{min-height:36px;padding:4px 8px}.world-link img{height:23px}
.mode-row{margin:5px 12px 0;padding:3px}.mode{min-height:35px;padding:5px;font-size:11px}
.intro-panel{padding:5px 12px 2px}.intro-panel h2{display:none}.prompt{min-height:30px;padding:4px 9px;font-size:11px}
.history{padding:8px 12px 10px;gap:8px}.message__avatar{width:25px;height:25px}.message__bubble{padding:8px 10px;font-size:11px;line-height:1.5}
.composer{padding:7px 12px 6px;gap:0}.composer textarea{min-height:43px;padding:9px 11px;font-size:14px}.send{height:43px;width:43px}
}

/* MMD app typography: LINE Seed TH for Thai UI, Inter for functional labels, Canela for the editorial Kenji name. */
body,button,textarea{font-family:"LINE Seed Sans TH","Noto Sans Thai",system-ui,sans-serif}
.eyebrow,.brand-label,.top-link,.chat-name small,.world-link span,.composer-caption{font-family:Inter,"LINE Seed Sans TH","Noto Sans Thai",system-ui,sans-serif}
.hero-title{font-family:Canela,Georgia,serif;letter-spacing:-.03em}
.hero-italic{font-family:Canela,Georgia,serif;font-style:italic;font-weight:500}
.hero-copy h1{font-size:16px;line-height:1.45}
.message__bubble{font-size:14px;line-height:1.63}
.mode,.prompt{font-size:13px}
.brand-mark{width:104px;height:34px}
@media(max-width:355px){.brand-mark{width:82px;height:28px}}
@media(min-width:921px){.brand-mark{width:144px;height:44px}}
@media(max-height:670px) and (max-width:920px){.hero-copy h1{font-size:12px}.message__bubble{font-size:12px;line-height:1.5}.mode,.prompt{font-size:11px}}

/* Final scoped readability guard: all text colors explicit. No global Webflow cascade dependence. */
.page :where(.hero-title,.hero-copy h1,.chat-name strong,.intro-panel h2,.message__bubble,.promo-info strong){color:var(--ink);-webkit-text-fill-color:var(--ink)}
.page :where(.hero-body,.promo-info p,.status,.member-line){color:var(--muted);-webkit-text-fill-color:var(--muted)}

</style></head><body>
  <a href="#kenji-input" class="skip">ข้ามไปช่องพิมพ์คำถาม</a>
  <div class="page">
    <header class="top">
      <a class="brand" href="/my-mmd/" aria-label="กลับ MY MMD"><img class="brand-mark" src="__KENJI_MMD_MARK__" alt="MMD Privé" width="240" height="76" decoding="async"><span class="brand-rule" aria-hidden="true"></span><span class="brand-label"><strong>KENJI</strong><small>MEMBER CONCIERGE</small></span></a>
      <nav class="top-actions" aria-label="ไปส่วนอื่น"><a class="top-link" href="/my-mmd/">MY MMD <span aria-hidden="true">↗</span></a><a class="top-link top-link--outline" href="/member/liff?intent=status">ตรวจสอบสิทธิ์</a></nav>
    </header>
    <main class="workspace">
      <section class="hero" aria-labelledby="hero-heading">
        <picture class="hero-picture"><source media="(max-width: 920px)" srcset="https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6af00f7040441227f49253cf_Kenji04%20Member%20NEXT%20LV%20Mobile%209x16.webp"><img class="hero-image" src="https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6af00f6c543fc6f65ec870cc_Kenji04%20Member%20NEXT%20LV%20Desktop%2016x9.webp" alt="Kenji ในห้องรับรอง MMD Privé" fetchpriority="high" decoding="async" width="1086" height="1448"></picture>
        <div class="hero-grain" aria-hidden="true"></div>
        <div class="hero-copy">
          <div class="eyebrow">MMD PRIVÉ BANGKOK / MEMBER SERVICES</div>
          <div class="hero-title" aria-hidden="true">Kenji.</div><div class="hero-italic">Your MMD Concierge</div>
          <h1 id="hero-heading">มีอะไรให้ผมจัดการครับ</h1>
          <p class="hero-body">คำถามทั่วไป สมาชิก MY MMD และการเข้าถึงโปรโมชั่นที่ประกาศแล้ว ทุกคำตอบยึดข้อมูลที่ตรวจสอบได้ครับ</p>
          <div class="hero-links"><a href="/my-mmd/">เข้า MY MMD</a><a href="/my-mmd/coupons">คูปองของฉัน</a></div>
          <div class="hero-divider"></div><div class="hero-footnote">PRIVATE BY DESIGN · ข้อมูลสมาชิกและสิทธิ์ต่าง ๆ ยืนยันจากระบบเท่านั้น</div>
        </div>
      </section>
      <section class="chat-shell" aria-label="สนทนากับ Kenji">
        <header class="chat-head"><div class="chat-heading"><div class="small-avatar" aria-hidden="true"><img src="https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6af00f73a5e7765e6ebdb688_Kenji04%20Member%20NEXT%20LV%20Chat%20Avatar.webp" alt="" width="40" height="40" decoding="async"></div><div class="chat-name"><strong>Kenji</strong><small>Q&A · PROMOTIONS</small></div></div><button class="clear" id="kenji-clear" type="button" aria-label="ลบข้อความในหน้าจอนี้">ล้างหน้าจอ</button></header>
        <div class="member-line"><span id="kenji-member">ยังไม่แสดงข้อมูลสมาชิก</span><a id="kenji-member-link" href="/member/liff?intent=status">ตรวจสอบสิทธิ์</a></div>
        <nav class="world-nav" aria-label="ประเภทบริการลูกค้า">
          <a class="world-link world-link--curated" href="/my-mmd/" aria-label="Curated · MY MMD">
            <img src="__KENJI_MMD_MARK__" alt="MMD Privé" width="240" height="76" decoding="async"><span>CURATED</span>
          </a>
          <a class="world-link world-link--private" href="/member/private" aria-label="Private · เปิดหน้า Private เพื่อตรวจสอบสิทธิ์">
            <img src="__KENJI_SIGIL_MARK__" alt="SĪGIL System" width="500" height="250" decoding="async"><span>PRIVATE<br>ตรวจสิทธิ์</span>
          </a>
        </nav>
        <div class="mode-row" aria-label="เลือกหัวข้อ"><button class="mode" type="button" data-mode="qa" aria-pressed="true">คำถามทั่วไป (Q&A)</button><button class="mode" type="button" data-mode="promo" aria-pressed="false">โปรโมชั่น</button></div>
        <div class="intro-panel" data-mode-panel="qa"><h2>เลือกคำถาม หรือพิมพ์ด้วยตัวเอง</h2><div class="prompt-row"><button type="button" class="prompt" data-prompt="สมัครสมาชิก MMD ต้องทำอย่างไร">สมัครสมาชิก</button><button type="button" class="prompt" data-prompt="เช็กสถานะสมาชิกที่ระบบยืนยันให้หน่อย">เช็กสมาชิก</button><button type="button" class="prompt" data-prompt="เช็ก Points ที่ระบบยืนยันให้หน่อย">Points</button><button type="button" class="prompt" data-prompt="ต่ออายุสมาชิกต้องทำอย่างไร">ต่ออายุ</button><button type="button" class="prompt" data-prompt="ช่องทางชำระเงินและการตรวจยอดเป็นอย่างไร">ชำระเงิน</button></div></div>
        <div class="intro-panel" data-mode-panel="promo" hidden><div class="promo-info"><strong>ดูโปรโมชั่นจากประกาศของ MMD</strong><p>รายการและสิทธิ์ส่วนบุคคลอาจเปลี่ยนแปลงได้ ตรวจสอบคูปองจาก MY MMD ก่อนใช้สิทธิ์ทุกครั้ง</p><a href="/my-mmd/coupons">เปิดคูปองใน MY MMD ↗</a><button type="button" class="prompt" data-prompt="สอบถามเงื่อนไขโปรโมชั่นที่ประกาศแล้ว">ถามเงื่อนไขโปรโมชั่น</button></div></div>
        <div class="history" id="kenji-history" role="log" aria-label="ข้อความสนทนา" aria-live="polite" aria-relevant="additions text"></div>
        <p class="status" id="kenji-status" role="status" aria-live="polite"></p>
        <form class="composer" id="kenji-form"><div class="composer-row"><textarea id="kenji-input" name="message" rows="1" maxlength="800" placeholder="พิมพ์คำถามของคุณ…" aria-label="พิมพ์คำถามถึง Kenji"></textarea><button type="submit" class="send" id="kenji-send" aria-label="ส่งข้อความ">➤</button></div><div class="composer-caption"><span>กดส่งเพื่อถาม · Ctrl/⌘ + Enter เพื่อส่ง</span><a href="/sigil/recovery">ต้องการความช่วยเหลือ?</a></div></form>
      </section>
    </main>
  </div><script nonce="test_nonce">
(function () {
  "use strict";
  const $ = function (id) { return document.getElementById(id); };
  const form = $("kenji-form");
  const input = $("kenji-input");
  const send = $("kenji-send");
  const history = $("kenji-history");
  const status = $("kenji-status");
  const member = $("kenji-member");
  const memberLink = $("kenji-member-link");
  const clear = $("kenji-clear");
  const modes = Array.from(document.querySelectorAll("[data-mode]"));
  const panels = Array.from(document.querySelectorAll("[data-mode-panel]"));
  let busy = false;
  let generation = 0;
  let activeRequest = null;
  const initialGreeting = "เลือกหัวข้อที่สนใจ หรือพิมพ์คำถามได้เลยครับ ผมจะอ้างอิงข้อมูลที่ระบบยืนยันได้เท่านั้น";

  function setStatus(value, tone) {
    status.textContent = value || "";
    status.dataset.tone = tone || "info";
  }
  function updateHeight() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 122) + "px";
  }
  function setBusy(value) {
    busy = Boolean(value);
    send.disabled = busy;
    input.setAttribute("aria-busy", String(busy));
    history.setAttribute("aria-busy", String(busy));
  }
  function safeAction(action) {
    if (!action || typeof action !== "object") return null;
    const label = typeof action.label === "string" ? action.label.trim().slice(0, 80) : "";
    const path = typeof action.url === "string" ? action.url.trim() : "";
    if (!label || !path || !/^\/(?!\/|\\)[a-z0-9/_?&=%#.+~-]*$/i.test(path)) return null;
    try {
      const target = new URL(path, window.location.origin);
      if (target.origin !== window.location.origin) return null;
    } catch (_) { return null; }
    return { label: label, path: path };
  }
  function appendMessage(text, kind, action, reviewRequired) {
    const wrap = document.createElement("article");
    wrap.className = "message message--" + kind;
    if (kind === "bot") {
      const mark = document.createElement("div");
      mark.className = "message__avatar";
      mark.setAttribute("aria-hidden", "true");
      const portrait = document.createElement("img");
      portrait.src = "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6af00f73a5e7765e6ebdb688_Kenji04%20Member%20NEXT%20LV%20Chat%20Avatar.webp";
      portrait.alt = "";
      portrait.width = 40;
      portrait.height = 40;
      portrait.decoding = "async";
      mark.appendChild(portrait);
      wrap.appendChild(mark);
    }
    const bubble = document.createElement("div");
    bubble.className = "message__bubble";
    const copy = document.createElement("div");
    copy.textContent = String(text || "");
    bubble.appendChild(copy);
    const safe = safeAction(action);
    if (safe) {
      const link = document.createElement("a");
      link.className = "message__action";
      link.href = safe.path;
      link.textContent = safe.label + " ↗";
      bubble.appendChild(link);
    }
    if (reviewRequired) {
      const note = document.createElement("p");
      note.className = "review-note";
      note.textContent = "ข้อมูลบางส่วนต้องให้ MMD ตรวจสอบก่อนครับ";
      bubble.appendChild(note);
    }
    wrap.appendChild(bubble);
    history.appendChild(wrap);
    history.scrollTop = history.scrollHeight;
  }
  function resetDisplay(preserveDraft) {
    const draft = preserveDraft ? input.value : "";
    generation += 1;
    if (activeRequest) activeRequest.abort();
    activeRequest = null;
    setBusy(false);
    history.replaceChildren();
    appendMessage(initialGreeting, "bot");
    input.value = draft;
    updateHeight();
    member.textContent = "ยังไม่แสดงข้อมูลสมาชิก";
    memberLink.textContent = "ตรวจสอบสิทธิ์";
    memberLink.href = "/member/liff?intent=status";
    setStatus("");
  }
  function applyMember(data) {
    if (!data || typeof data !== "object") return;
    const name = typeof data.display_name === "string" ? data.display_name.trim() : "";
    const tier = typeof data.membership_label === "string" ? data.membership_label.trim() : "";
    if (!name && !tier) return;
    member.textContent = "ยืนยันจากระบบ: " + [name, tier].filter(Boolean).join(" · ");
    memberLink.textContent = "MY MMD";
    memberLink.href = "/my-mmd/";
  }
  function markSessionLost() {
    resetDisplay(true);
    setStatus("กรุณายืนยัน Member Session ผ่าน LINE ก่อนส่งคำถามครับ", "error");
    memberLink.textContent = "ยืนยันผ่าน LINE";
    memberLink.href = "/member/liff?intent=status";
  }
  async function ask() {
    if (busy) return;
    const message = input.value.trim();
    if (!message) { input.focus(); return; }
    if (message.length > 800) { setStatus("ข้อความยาวเกิน 800 ตัวอักษรครับ", "error"); return; }
    const ownGeneration = generation;
    const controller = new AbortController();
    activeRequest = controller;
    setBusy(true);
    setStatus("กำลังตรวจสอบข้อมูลที่ยืนยันจากระบบ…");
    try {
      const response = await fetch("/api/member/kenji/chat", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", "accept": "application/json" },
        body: JSON.stringify({ message: message }),
        signal: controller.signal,
      });
      const result = await response.json().catch(function () { return null; });
      if (ownGeneration !== generation) return;
      if (response.status === 401) { markSessionLost(); return; }
      if (response.status === 423) { setStatus("ขณะนี้ MMD กำลังดูแลเรื่องนี้ โปรดลองอีกครั้งภายหลังครับ", "error"); return; }
      if (!response.ok || !result || result.ok !== true) {
        setStatus("ยังส่งคำถามไม่สำเร็จ ระบบยังไม่ยืนยันผล กรุณาตรวจสอบก่อนลองใหม่ครับ", "error");
        return;
      }
      appendMessage(message, "user");
      appendMessage(result.reply || "ตอนนี้ยังไม่มีข้อมูลที่ยืนยันได้ครับ", "bot", result.action, result.review_required === true);
      applyMember(result.member);
      input.value = "";
      updateHeight();
      setStatus("");
      history.scrollTop = history.scrollHeight;
    } catch (_) {
      if (ownGeneration === generation) setStatus("การเชื่อมต่อไม่สมบูรณ์ ยังยืนยันการส่งไม่ได้ กรุณาตรวจสอบก่อนลองใหม่ครับ", "error");
    } finally {
      if (ownGeneration === generation) {
        activeRequest = null;
        setBusy(false);
        input.focus();
      }
    }
  }
  form.addEventListener("submit", function (event) { event.preventDefault(); void ask(); });
  input.addEventListener("input", function () { updateHeight(); if (status.dataset.tone === "error") setStatus(""); });
  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void ask(); }
  });
  document.querySelectorAll("[data-prompt]").forEach(function (button) {
    button.addEventListener("click", function () {
      input.value = button.getAttribute("data-prompt") || "";
      updateHeight();
      input.focus();
    });
  });
  modes.forEach(function (button) {
    button.addEventListener("click", function () {
      const next = button.getAttribute("data-mode");
      modes.forEach(function (item) { item.setAttribute("aria-pressed", String(item === button)); });
      panels.forEach(function (item) { item.hidden = item.getAttribute("data-mode-panel") !== next; });
    });
  });
  clear.addEventListener("click", function () { resetDisplay(false); input.focus(); });
  // No transcript, drafts, member data or tokens are persisted in local or session storage.
  window.addEventListener("pagehide", function () { resetDisplay(false); });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") resetDisplay(false);
  });
  resetDisplay(false);
})();
</script></body></html>`;

export function renderKenjiNextLvPage(nonce) {
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(nonce)) throw new TypeError("Invalid CSP nonce");
  const html = NEXT_LV_DOCUMENT.replaceAll("test_nonce", nonce)
    .replaceAll("__KENJI_MMD_MARK__", KENJI_CURATED_LOGO)
    .replaceAll("__KENJI_SIGIL_MARK__", KENJI_PRIVATE_LOGO);
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, private, max-age=0",
      "content-security-policy": `default-src 'self'; style-src 'self' 'nonce-${nonce}'; script-src 'self' 'nonce-${nonce}'; connect-src 'self'; font-src 'self' https://cdn.prod.website-files.com; img-src 'self' data: https://cdn.prod.website-files.com https://s3.amazonaws.com; frame-ancestors 'self'; base-uri 'self'; form-action 'self'`,
      "referrer-policy": "strict-origin-when-cross-origin",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow",
      "x-mmd-kenji": "member-app-next-lv",
    },
  });
}

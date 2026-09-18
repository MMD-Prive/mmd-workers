import { ADMIN_LOGIN_DUO_DATA, ADMIN_LOGIN_MMS_LOGO_DATA } from "./admin-login-image-a-assets.js";

export const ADMIN_LOGIN_SESSION_PATH = "/internal/admin/login/session";
export const APPROVED_ADMIN_LOGIN_PAGE_ID = "admin-login-approved-hero";
export const APPROVED_ADMIN_LOGIN_HERO =
  "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a9c4646a60519ef8733bf67_SIGIL-Boss-Desktop.png";
export const APPROVED_ADMIN_LOGIN_PRIVACY_BG =
  "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a99809b35879b57714758cd_Privacy%20AI%20Stewardship.webp";
export const APPROVED_ADMIN_LOGIN_WALL_BG =
  "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a08f5600edcaaa6514e25f6_SigilWall.webp";
export const APPROVED_ADMIN_LOGIN_LOGO =
  "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a0f2cbc7e26b6735aee4cb2_SIGIL%20LOGO%20Transp.webp";
export const APPROVED_ADMIN_LOGIN_FAVICON =
  "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a0ea3f9421cae9dd223f50b_SIGIL%20only%20logo.webp";
export const APPROVED_ADMIN_LOGIN_APPLE_TOUCH_ICON =
  "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/69e34c91250ec9f6ee29d319_MMD%20SIGIL%20Logo.png";
export const ADMIN_CANONICAL_ORIGIN = "https://mmdbkk.com";

const MMD_BRAND_LOGO =
  "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a6c4486e7585ba74ab2eeb1_MMD_Prive%CC%81_logo_signature_transparent%20Final.webp";
const LINE_SEED_THAI_REGULAR =
  "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a619dd598baf067153fd1cc_LINESeedSansTH_W_Rg.woff2";
const LINE_SEED_THAI_BOLD =
  "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a619dd4dc8d84b48cc84959_LINESeedSansTH_W_Bd.woff2";
const LINE_SEED_THAI_EXTRABOLD =
  "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a619dd5cdf166a1e9e45b98_LINESeedSansTH_W_XBd.woff2";

const MMS_PARTNER_PATH = "/internal/admin/mms";
const CSP = [
  "default-src 'self'",
  "script-src 'unsafe-inline' 'self'",
  "style-src 'unsafe-inline' 'self'",
  "font-src https://cdn.prod.website-files.com",
  "img-src https://cdn.prod.website-files.com data:",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

export function renderApprovedAdminLogin(
  request,
  { status = 200, error = "", next = "/internal/admin/control-room" } = {},
) {
  const headers = loginHeaders();
  if (String(request?.method || "GET").toUpperCase() === "HEAD") {
    return new Response(null, { status, headers });
  }

  const partnerFirst = next === MMS_PARTNER_PATH;
  const html = `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <meta name="theme-color" content="#050403">
  <script>(()=>{if(location.protocol==='https:'&&location.hostname==='www.mmdbkk.com'){const path=(location.pathname.replace(/\\/+$/,'')||'/');if(path==='/internal/admin/login'){const canonical=new URL(location.href);canonical.hostname='mmdbkk.com';location.replace(canonical.toString());}}})();</script>
  <title>MMD Privé · Internal Login</title>
  <link rel="canonical" href="${ADMIN_CANONICAL_ORIGIN}/internal/admin/login">
  <link rel="icon" type="image/webp" href="${APPROVED_ADMIN_LOGIN_FAVICON}">
  <link rel="apple-touch-icon" href="${APPROVED_ADMIN_LOGIN_APPLE_TOUCH_ICON}">
  <style>
    @font-face{font-family:"LINE Seed Sans TH";src:url("${LINE_SEED_THAI_REGULAR}") format("woff2");font-style:normal;font-weight:400;font-display:swap}
    @font-face{font-family:"LINE Seed Sans TH";src:url("${LINE_SEED_THAI_BOLD}") format("woff2");font-style:normal;font-weight:700;font-display:swap}
    @font-face{font-family:"LINE Seed Sans TH";src:url("${LINE_SEED_THAI_EXTRABOLD}") format("woff2");font-style:normal;font-weight:800;font-display:swap}
    :root{color-scheme:dark;--bg:#050403;--gold:#d2a861;--gold-hi:#f4d28e;--gold-deep:#8f5c24;--text:#fff9f0;--muted:rgba(255,249,240,.67);--soft:rgba(255,249,240,.43);--green:#003704;--green-hi:#24ce78;--danger:#ffb8bd;--ok:#bfe4c8}
    *{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#050403}body{min-height:100svh;color:var(--text);font-family:"LINE Seed Sans TH","Noto Sans Thai","Noto Sans",system-ui,-apple-system,"Segoe UI",sans-serif;font-synthesis:none;-webkit-font-smoothing:antialiased}button,input{font:inherit}
    .mmd-login{position:relative;isolation:isolate;height:100svh;min-height:100svh;overflow:hidden;background:#050403}
    .mmd-login:before{content:"";position:fixed;inset:0;z-index:-4;background:linear-gradient(90deg,rgba(3,2,2,.18),rgba(3,2,2,.3) 44%,rgba(3,2,2,.6) 100%),url("${APPROVED_ADMIN_LOGIN_WALL_BG}") center/cover no-repeat;filter:saturate(.74) brightness(.56) contrast(1.08)}
    .mmd-login:after{content:"";position:fixed;inset:0;z-index:-3;background:radial-gradient(circle at 13% 22%,rgba(208,154,74,.13),transparent 31%),linear-gradient(90deg,rgba(1,1,1,.34) 0%,rgba(1,1,1,.08) 48%,rgba(1,1,1,.26) 100%),linear-gradient(180deg,rgba(0,0,0,.05),rgba(0,0,0,.37))}
    .duo-wrap{position:fixed;z-index:-1;right:3.4vw;bottom:0;width:min(49vw,760px);height:min(91svh,880px);pointer-events:none;display:flex;align-items:flex-end;justify-content:center}
    .duo{display:block;width:100%;height:100%;object-fit:contain;object-position:center bottom;filter:saturate(.82) contrast(1.05) brightness(.83);mask-image:linear-gradient(90deg,transparent 0%,#000 9%,#000 92%,transparent 100%)}
    .duo-vignette{position:absolute;inset:0;background:linear-gradient(90deg,rgba(5,4,3,.88) 0%,transparent 25%,transparent 78%,rgba(5,4,3,.65) 100%),linear-gradient(180deg,rgba(5,4,3,.04) 0%,transparent 58%,rgba(5,4,3,.18) 100%)}
    .stage{width:min(100%,1600px);height:100svh;margin:0 auto;display:flex;align-items:center;padding:16px clamp(22px,6.2vw,100px);position:relative}
    .access-card{width:min(610px,44vw);min-width:520px;max-height:calc(100svh - 32px);overflow:auto;overscroll-behavior:contain;scrollbar-width:none;border:1px solid rgba(224,183,104,.56);border-radius:12px;background:linear-gradient(145deg,rgba(13,11,9,.88),rgba(5,5,4,.82));box-shadow:0 24px 72px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.035);backdrop-filter:blur(20px);padding:clamp(22px,2.1vw,32px) clamp(24px,2.35vw,36px);position:relative}
    .access-card::-webkit-scrollbar{width:0;height:0}.access-card:before{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(116deg,rgba(225,170,80,.055),transparent 33%,transparent 74%,rgba(255,255,255,.018))}.access-card>*{position:relative;z-index:1}
    .kicker{margin:0 0 9px;color:var(--gold-hi);font-size:9px;font-weight:800;letter-spacing:.32em;text-transform:uppercase}.title{margin:0;color:#fff;font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;font-size:clamp(39px,3.1vw,52px);font-weight:400;line-height:.94;letter-spacing:-.04em;white-space:nowrap}.lead{margin:8px 0 11px;color:rgba(255,255,255,.78);font-size:14px;line-height:1.45}.rule{height:1px;margin:0 0 11px;background:linear-gradient(90deg,rgba(237,205,144,.52),rgba(237,205,144,.08))}.managed-label{margin:0 0 7px;color:rgba(255,255,255,.8);font-size:8.5px;font-weight:800;letter-spacing:.29em;text-transform:uppercase}
    .lanes{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 7px}.lane{position:relative;min-height:94px;border:1px solid rgba(234,195,121,.3);border-radius:7px;background:linear-gradient(145deg,rgba(25,19,14,.67),rgba(7,7,6,.84));color:#fff;cursor:pointer;padding:10px 13px;text-align:left;transition:border-color .18s ease,background .18s ease,transform .18s ease,box-shadow .18s ease}.lane:hover{transform:translateY(-1px);border-color:rgba(237,198,125,.54)}.lane:focus-visible{outline:2px solid var(--gold-hi);outline-offset:3px}.lane-status{position:absolute;top:10px;right:10px;width:16px;height:16px;border:2px solid rgba(255,255,255,.34);border-radius:50%}.lane.is-active .lane-status:after{content:"";position:absolute;inset:3px;border-radius:50%;background:var(--gold-hi)}
    .lane[data-lane="partner"].is-active{border-color:rgba(40,199,108,.79);background:linear-gradient(145deg,rgba(0,55,4,.72),rgba(2,27,12,.79));box-shadow:inset 0 0 0 1px rgba(58,220,131,.08)}.lane[data-lane="partner"].is-active .lane-status{border-color:#2cec8f}.lane[data-lane="partner"].is-active .lane-status:after{background:#2cec8f}
    .lane-brand{height:43px;display:flex;align-items:center}.lane-brand img{display:block;object-fit:contain;object-position:left center}.lane-brand .mmd-brand{width:106px;max-height:43px}.lane-brand .mms-brand{width:48px;height:43px;object-fit:contain}.lane b{display:block;margin-top:3px;color:#fff;font-size:14px;font-weight:700;letter-spacing:-.01em}.lane small{display:block;margin-top:0;color:var(--soft);font-size:9.5px;font-weight:700}.lane[data-lane="partner"] small{color:rgba(218,242,224,.58)}
    .account-note{margin:5px 0 9px;color:rgba(255,255,255,.55);font-size:9.5px;line-height:1.45}.panel[hidden]{display:none}.panel-head{margin:0 0 7px}.panel-head strong{font-size:11px;font-weight:800;letter-spacing:.01em}.panel-head span{display:inline-block;margin-top:1px;color:var(--soft);font-size:9.2px;line-height:1.35}.scope{display:none}
    form{display:grid;gap:8px}label{display:grid;gap:5px;color:rgba(255,255,255,.76);font-size:8.5px;font-weight:800;letter-spacing:.27em;text-transform:uppercase}.field{display:grid;grid-template-columns:1fr auto;border:1px solid rgba(255,255,255,.25);border-radius:5px;overflow:hidden;background:rgba(5,5,5,.31);transition:border-color .18s ease,box-shadow .18s ease}.field:focus-within{border-color:rgba(232,191,101,.69);box-shadow:0 0 0 3px rgba(232,191,101,.07)}.partner-panel .field:focus-within{border-color:rgba(49,180,100,.72);box-shadow:0 0 0 3px rgba(0,55,4,.2)}input{width:100%;min-height:43px;border:0;background:transparent;color:#fff;padding:0 13px;outline:0;font:700 12px/1.35 "LINE Seed Sans TH",sans-serif}.toggle{min-width:61px;border:0;border-left:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.018);color:#fff;font:800 8.5px/1.4 "LINE Seed Sans TH",sans-serif;cursor:pointer}.go{min-height:49px;margin-top:0;border:1px solid rgba(255,220,151,.62);border-radius:4px;background:linear-gradient(108deg,#9d6327 0%,#dfa854 22%,#f2c876 48%,#f7d792 63%,#ae6e2b 100%);color:#171006;-webkit-text-fill-color:#171006;font:800 11px/1.4 "LINE Seed Sans TH",sans-serif;letter-spacing:.14em;text-transform:uppercase;cursor:pointer;box-shadow:0 13px 24px rgba(0,0,0,.24);transition:transform .18s ease,filter .18s ease}.go:after{content:"  →"}.go:hover{transform:translateY(-1px);filter:brightness(1.04)}.go:disabled,.toggle:disabled{opacity:.54;cursor:wait;transform:none}.message{min-height:14px;margin:-1px 0 0;color:var(--soft);font-size:9px;line-height:1.4}.message.is-error{color:var(--danger)}.message.is-ok{color:var(--ok)}.privacy{margin:0;color:rgba(255,255,255,.32);font-size:8.5px;line-height:1.4}.links{display:flex;gap:12px;flex-wrap:wrap;margin-top:6px}.linkbtn{padding:0;border:0;background:transparent;color:rgba(209,232,215,.68);font:700 9px/1.4 "LINE Seed Sans TH",sans-serif;text-decoration:underline;text-underline-offset:3px;cursor:pointer}.subpanel{margin-top:9px;padding-top:9px;border-top:1px solid rgba(255,255,255,.1)}.recovery{display:none;margin-top:8px;border:1px solid rgba(72,155,97,.34);border-radius:8px;background:rgba(0,55,4,.2);padding:9px}.recovery.is-visible{display:block}.recovery b{font-size:10px;font-weight:800}.recovery code{display:block;margin-top:6px;padding:8px;border-radius:6px;background:rgba(0,0,0,.35);word-break:break-all;color:#effff2;font-size:10px}.recovery p{margin:5px 0 0;color:var(--muted);font-size:9px;line-height:1.45}
    .credit{margin-top:11px;padding-top:9px;border-top:1px solid rgba(255,255,255,.055);color:rgba(255,255,255,.31);font-size:8.5px;line-height:1.45}.credit b{color:rgba(255,225,169,.58);font-weight:800}.credit .thai-credit{display:inline;margin-left:4px;color:rgba(255,255,255,.29)}
    .sigil-corner{position:fixed;z-index:2;top:24px;right:30px;width:32px;height:32px;object-fit:contain;opacity:.86;filter:sepia(.34) saturate(1.18)}.side-mantra{position:fixed;z-index:2;right:30px;bottom:118px;display:grid;gap:7px;color:rgba(222,180,104,.58);font-size:7.5px;font-weight:800;letter-spacing:.31em;text-transform:uppercase;text-align:right}.secure{position:fixed;z-index:2;right:30px;bottom:22px;color:rgba(224,185,112,.7);font-size:7.5px;font-weight:800;letter-spacing:.29em;text-transform:uppercase}
    .visual{display:none}.visual:before{content:"";display:block;background:url("${APPROVED_ADMIN_LOGIN_PRIVACY_BG}") center/cover no-repeat;}.visual-logo{object-fit:contain;}.compat-marker{display:none!important}
    @media(max-width:1180px){.stage{padding-left:26px;padding-right:26px}.access-card{width:min(560px,55vw);min-width:470px}.title{font-size:44px;white-space:normal}.duo-wrap{right:-3vw;width:53vw}.side-mantra{display:none}.sigil-corner,.secure{right:20px}}
    @media(min-width:901px) and (max-height:760px){.stage{padding-top:10px;padding-bottom:10px}.access-card{max-height:calc(100svh - 20px);padding:18px 28px}.kicker{margin-bottom:6px}.title{font-size:40px}.lead{margin:6px 0 8px;font-size:12.5px}.rule{margin-bottom:8px}.managed-label{margin-bottom:5px}.lane{min-height:78px;padding:8px 11px}.lane-brand{height:33px}.lane-brand .mmd-brand{width:88px;max-height:34px}.lane-brand .mms-brand{width:38px;height:34px}.lane b{font-size:12.5px}.lane small{font-size:8.5px}.account-note{margin:4px 0 7px;font-size:8.5px}.panel-head{margin-bottom:5px}.panel-head span{font-size:8.4px}form{gap:6px}label{gap:4px;font-size:8px}input{min-height:38px}.go{min-height:43px}.message{min-height:11px}.links{margin-top:4px}.credit{margin-top:7px;padding-top:6px;font-size:7.8px}}
    @media(max-width:900px){
      .mmd-login{
        height:auto;
        min-height:100svh;
        overflow:auto;
      }

      .mmd-login:before{
        background:
          linear-gradient(
            180deg,
            rgba(4,3,2,.04) 0%,
            rgba(4,3,2,.12) 34%,
            rgba(4,3,2,.48) 58%,
            rgba(4,3,2,.88) 82%,
            rgba(4,3,2,.98) 100%
          ),
          url("${APPROVED_ADMIN_LOGIN_WALL_BG}") 58% top/cover no-repeat;
        filter:saturate(.82) brightness(.72) contrast(1.03);
      }

      .mmd-login:after{
        background:
          linear-gradient(
            180deg,
            rgba(0,0,0,.01) 0%,
            rgba(0,0,0,.03) 38%,
            rgba(0,0,0,.18) 56%,
            rgba(0,0,0,.58) 78%,
            rgba(0,0,0,.82) 100%
          );
      }

      .duo-wrap{
        position:absolute;
        top:0;
        right:-8%;
        bottom:auto;
        width:106%;
        height:52svh;
        min-height:330px;
        opacity:.91;
        justify-content:flex-end;
      }

      .duo{
        object-position:72% bottom;
        filter:saturate(.88) contrast(1.04) brightness(.9);
        mask-image:linear-gradient(
          180deg,
          #000 0%,
          #000 68%,
          rgba(0,0,0,.82) 82%,
          transparent 100%
        );
      }

      .duo-vignette{
        background:
          linear-gradient(
            90deg,
            rgba(5,4,3,.36) 0%,
            transparent 30%,
            transparent 84%,
            rgba(5,4,3,.2) 100%
          ),
          linear-gradient(
            180deg,
            rgba(5,4,3,.01) 0%,
            transparent 66%,
            rgba(5,4,3,.56) 100%
          );
      }

      .stage{
        display:flex;
        align-items:flex-end;
        justify-content:flex-start;
        height:auto;
        min-height:100svh;
        padding:44svh 14px 14px;
      }

      .access-card{
        width:min(91vw,390px);
        min-width:0;
        max-width:390px;
        max-height:none;
        overflow:visible;
        margin:0;
        border-radius:12px;
        padding:13px 13px 12px;
        background:
          linear-gradient(
            145deg,
            rgba(14,11,9,.84),
            rgba(5,5,4,.93)
          );
        backdrop-filter:blur(15px);
        box-shadow:
          0 18px 48px rgba(0,0,0,.42),
          inset 0 1px 0 rgba(255,255,255,.03);
      }

      .kicker{
        margin-bottom:4px;
        font-size:7px;
        letter-spacing:.26em;
      }

      .title{
        font-size:26px;
        line-height:.95;
        white-space:normal;
      }

      .lead{
        margin:4px 0 6px;
        font-size:10.5px;
        line-height:1.35;
      }

      .rule{
        margin-bottom:6px;
      }

      .managed-label{
        margin-bottom:4px;
        font-size:7.2px;
        letter-spacing:.23em;
      }

      .lanes{
        gap:5px;
        margin-bottom:5px;
      }

      .lane{
        min-height:61px;
        padding:6px 8px;
      }

      .lane-status{
        top:7px;
        right:7px;
        width:13px;
        height:13px;
      }

      .lane-brand{
        height:25px;
      }

      .lane-brand .mmd-brand{
        width:68px;
        max-height:25px;
      }

      .lane-brand .mms-brand{
        width:30px;
        height:25px;
      }

      .lane b{
        margin-top:2px;
        font-size:10.5px;
      }

      .lane small{
        font-size:7.2px;
      }

      .account-note{
        display:none;
      }

      .panel-head{
        margin:4px 0 5px;
      }

      .panel-head strong{
        font-size:9.5px;
      }

      .panel-head span{
        margin-top:0;
        font-size:7.8px;
        line-height:1.28;
      }

      form{
        gap:5px;
      }

      label{
        gap:3px;
        font-size:7.2px;
        letter-spacing:.22em;
      }

      input{
        min-height:39px;
        padding:0 10px;
        font-size:11px;
      }

      .toggle{
        min-width:52px;
        font-size:7.5px;
      }

      .go{
        min-height:42px;
        font-size:9px;
        letter-spacing:.12em;
      }

      .message{
        min-height:10px;
        font-size:7.7px;
      }

      .privacy{
        font-size:7.4px;
        line-height:1.35;
      }

      .links{
        gap:10px;
        margin-top:4px;
      }

      .linkbtn{
        font-size:8px;
      }

      .subpanel{
        margin-top:7px;
        padding-top:7px;
      }

      .credit{
        display:none;
      }

      .sigil-corner{
        top:14px;
        right:14px;
        width:27px;
        height:27px;
      }

      .side-mantra{
        display:none;
      }

      .secure{
        display:none;
      }
    }

    @media(max-width:460px){
      .stage{
        padding:46svh 10px 12px;
      }

      .duo-wrap{
        right:-10%;
        width:110%;
        height:54svh;
        min-height:350px;
      }

      .duo{
        object-position:70% bottom;
      }

      .access-card{
        width:min(90vw,360px);
        max-width:360px;
        padding:12px 11px 10px;
      }

      .title{
        font-size:24px;
      }

      .lead{
        font-size:10px;
      }

      .lane{
        min-height:57px;
        padding:5px 7px;
      }

      .lane-brand{
        height:23px;
      }

      .lane-brand .mmd-brand{
        width:62px;
        max-height:23px;
      }

      .lane-brand .mms-brand{
        width:27px;
        height:23px;
      }

      .lane b{
        font-size:10px;
      }

      input{
        min-height:38px;
      }

      .go{
        min-height:41px;
      }
    }

    @media(prefers-reduced-motion:reduce){*,*:before,*:after{scroll-behavior:auto!important;transition:none!important}}
  </style>
</head>
<body data-initial-lane="${partnerFirst ? "partner" : "owner"}">
<section class="mmd-login" data-mmd-login data-mmd-page="${APPROVED_ADMIN_LOGIN_PAGE_ID}" data-layout="image-a-cinematic" data-density="compact" data-approved-hero="${APPROVED_ADMIN_LOGIN_HERO}">
  <aside class="visual" aria-hidden="true"><img class="visual-logo" src="${APPROVED_ADMIN_LOGIN_LOGO}" alt="MMD SIGIL Internal Admin"></aside>
  <div class="duo-wrap" aria-hidden="true"><img class="duo" src="${ADMIN_LOGIN_DUO_DATA}" alt=""><span class="duo-vignette"></span></div>
  <img class="sigil-corner" src="${APPROVED_ADMIN_LOGIN_FAVICON}" alt="" width="34" height="34" aria-hidden="true">
  <div class="side-mantra" aria-hidden="true"><span>PEOPLE</span><span>SYSTEMS</span><span>A QUIETER</span><span>TOMORROW</span></div>
  <main class="stage">
    <article class="access-card">
      <span class="compat-marker" aria-hidden="true">INVITE ONLY · SECURE SESSION</span>
      <p class="kicker">BACK OFFICE ACCESS</p>
      <h1 class="title">Enter your Back Office</h1>
      <p class="lead">กรุณาเลือกบัญชีที่ท่านต้องการเข้าถึง</p>
      <div class="rule" aria-hidden="true"></div>
      <p class="managed-label">MANAGED ACCOUNTS</p>
      <div class="lanes" role="tablist" aria-label="Business access">
        <button class="lane" type="button" data-lane="owner" role="tab">
          <span class="lane-status" aria-hidden="true"></span>
          <span class="lane-brand"><img class="mmd-brand" src="${MMD_BRAND_LOGO}" alt="MMD Privé" width="139" height="58"></span>
          <b>MMD Privé</b><small>SIGIL System</small>
        </button>
        <button class="lane" type="button" data-lane="partner" role="tab">
          <span class="lane-status" aria-hidden="true"></span>
          <span class="lane-brand"><img class="mms-brand" src="${ADMIN_LOGIN_MMS_LOGO_DATA}" alt="MMS Male Massage" width="72" height="64"></span>
          <b>MMS</b><small>Male Massage</small>
        </button>
      </div>
      <p class="account-note">คุณสามารถดูแลหลายบัญชีได้ พร้อมกันสูงสุด 2 accounts ที่อยู่ภายใต้การดูแลของระบบนี้</p>

      <section class="panel" data-panel="owner">
        <div class="panel-head"><strong>MMD Privé · SIGIL System</strong><br><span>Owner / Internal Admin access</span></div>
        <div class="scope"><span>Approved access</span><span>Secure session</span><span>Private route</span></div>
        <form method="post" action="${ADMIN_LOGIN_SESSION_PATH}" id="ownerLoginForm" autocomplete="off">
          <input id="adminNext" type="hidden" name="next" value="${escapeAttribute(next)}">
          <label for="adminCredential">Access Code
            <span class="field"><input id="adminCredential" type="text" required readonly autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="text" data-mask="true" data-1p-ignore="true" data-lpignore="true" data-bwignore="true" data-form-type="other"><button class="toggle" type="button" data-toggle="adminCredential" aria-pressed="false">SHOW</button></span>
          </label>
          <p class="message${error ? " is-error" : ""}" id="ownerMessage" role="${error ? "alert" : "status"}">${error ? escapeHtml(error) : `Next: ${escapeHtml(next)}`}</p>
          <button class="go" type="submit">Enter Back Office</button>
          <p class="privacy">Secure HttpOnly session · SIGIL System internal route</p>
        </form>
      </section>

      <section class="panel partner-panel" data-panel="partner">
        <div class="panel-head"><strong>MMS Partner · Male Massage</strong><br><span>สำหรับ MMS Partner ใช้เข้าสู่ระบบควบคุมการทำงานหลังบ้านของ Male Massage เท่านั้น</span></div>
        <div class="scope partner"><span>Applications</span><span>Therapists</span><span>Matching</span><span>MMS only</span></div>
        <form id="partnerLoginForm" autocomplete="on">
          <input type="hidden" name="action" value="partner_login">
          <label for="partnerUsername">Username<span class="field"><input id="partnerUsername" name="username" required autocomplete="username" autocapitalize="none" spellcheck="false"></span></label>
          <label for="partnerPassword">Password<span class="field"><input id="partnerPassword" name="password" type="password" required minlength="12" maxlength="128" autocomplete="current-password"><button class="toggle" type="button" data-toggle="partnerPassword" aria-pressed="false">SHOW</button></span></label>
          <p class="message" id="partnerMessage" role="status">MMS Partner Operations · Male Massage Back Office</p>
          <button class="go" type="submit">Enter Back Office</button>
        </form>
        <div class="links"><button class="linkbtn" type="button" data-open="signup">สร้างบัญชี Partner</button><button class="linkbtn" type="button" data-open="recover">ลืมรหัสผ่าน?</button></div>

        <section class="subpanel" data-subpanel="signup" hidden>
          <form id="partnerSignupForm" autocomplete="off">
            <input type="hidden" name="action" value="partner_signup">
            <label>Username<span class="field"><input name="username" required autocomplete="off" autocapitalize="none" spellcheck="false"></span></label>
            <label>Password<span class="field"><input name="password" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></span></label>
            <label>Invite Code<span class="field"><input name="invite_code" type="password" required autocomplete="off"></span></label>
            <p class="message" id="signupMessage" role="status">Invite-only activation · ใช้รหัสเชิญที่ได้รับอนุมัติ</p>
            <button class="go" type="submit">Create Partner Account</button>
          </form>
        </section>

        <section class="subpanel" data-subpanel="recover" hidden>
          <form id="partnerRecoverForm" autocomplete="off">
            <input type="hidden" name="action" value="partner_recover">
            <label>Username<span class="field"><input name="username" required autocomplete="username" autocapitalize="none" spellcheck="false"></span></label>
            <label>Recovery Code<span class="field"><input name="recovery_code" type="password" required autocomplete="off"></span></label>
            <label>New Password<span class="field"><input name="new_password" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></span></label>
            <p class="message" id="recoverMessage" role="status">Recovery จะเปลี่ยนรหัสผ่านและออก Recovery Code ชุดใหม่</p>
            <button class="go" type="submit">Reset Password</button>
          </form>
        </section>
        <div class="recovery" id="recoveryBox"><b>Recovery Code ใหม่ — เก็บไว้ในที่ปลอดภัย</b><code id="recoveryCode"></code><p>รหัสนี้แสดงหลัง activation/reset เท่านั้น ระบบเก็บเฉพาะ hash</p></div>
        <p class="privacy" style="margin-top:8px">Partner session จำกัดไว้ที่ /internal/admin/mms และ /v1/admin/mms* เท่านั้น</p>
      </section>

      <footer class="credit"><b>SIGIL Systems</b><br>Design and Architecture by Per 2025-2026 <span class="thai-credit">(อีดอก กูเองค่ะมึง)</span></footer>
    </article>
  </main>
  <div class="secure">SECURE · PRIVATE · INTERNAL</div>
</section>
<script>(()=>{
  const sessionPath='${ADMIN_LOGIN_SESSION_PATH}';
  const initial=document.body.dataset.initialLane==='partner'?'partner':'owner';
  const lanes=[...document.querySelectorAll('[data-lane]')];
  const panels=[...document.querySelectorAll('[data-panel]')];
  function setLane(name){document.body.dataset.activeLane=name;lanes.forEach(b=>{const on=b.dataset.lane===name;b.classList.toggle('is-active',on);b.setAttribute('aria-selected',String(on));});panels.forEach(p=>p.hidden=p.dataset.panel!==name);}
  lanes.forEach(b=>b.addEventListener('click',()=>setLane(b.dataset.lane)));setLane(initial);
  document.querySelectorAll('[data-toggle]').forEach(button=>button.addEventListener('click',()=>{const input=document.getElementById(button.dataset.toggle);if(!input)return;const owner=input.id==='adminCredential';const showing=button.getAttribute('aria-pressed')==='true';button.setAttribute('aria-pressed',String(!showing));button.textContent=showing?'SHOW':'HIDE';if(owner){if(showing)input.setAttribute('data-mask','true');else input.removeAttribute('data-mask');}else input.type=showing?'password':'text';input.focus();}));
  const ownerInput=document.getElementById('adminCredential');if(ownerInput){ownerInput.value='';ownerInput.readOnly=false;}
  document.querySelectorAll('[data-open]').forEach(button=>button.addEventListener('click',()=>{const name=button.dataset.open;document.querySelectorAll('[data-subpanel]').forEach(p=>p.hidden=p.dataset.subpanel!==name);document.getElementById('recoveryBox').classList.remove('is-visible');}));
  async function postForm(form){const body=new URLSearchParams(new FormData(form));const response=await fetch(sessionPath,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8','X-MMD-Login-Fetch':'1'},credentials:'same-origin',redirect:'follow',cache:'no-store',body:body.toString()});let payload={};try{payload=await response.clone().json();}catch{}return {response,payload};}
  function setMessage(el,text,type=''){el.classList.remove('is-error','is-ok');if(type)el.classList.add(type);el.setAttribute('role',type==='is-error'?'alert':'status');el.textContent=text;}
  function genericError(status){if(status===429)return 'ลองใหม่อีกครั้งในภายหลัง';if(status>=500)return 'พื้นที่หลังบ้านยังไม่พร้อม ลองใหม่อีกครั้ง';return 'ข้อมูลเข้าสู่ระบบไม่ถูกต้อง หรือยังไม่ได้รับอนุมัติ';}
  const ownerForm=document.getElementById('ownerLoginForm');ownerForm?.addEventListener('submit',async e=>{e.preventDefault();const message=document.getElementById('ownerMessage');const submit=ownerForm.querySelector('.go');const input=ownerInput;const credential=input.value.trim();if(!credential){ownerInput.focus();return;}submit.disabled=true;setMessage(message,'Checking access…');try{const body=new URLSearchParams();body.set('action','owner_login');body.set('credential',credential);body.set('next',document.getElementById('adminNext').value||'/internal/admin/control-room');const response=await fetch(sessionPath,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8','X-MMD-Login-Fetch':'1'},credentials:'same-origin',redirect:'follow',cache:'no-store',body:body.toString()});let payload={};try{payload=await response.clone().json();}catch{}if(response.ok&&response.redirected){location.assign(response.url);return;}if(response.ok&&payload.ok){location.assign(payload.next||'/internal/admin/control-room');return;}setMessage(message,genericError(response.status),'is-error');}catch{setMessage(message,'ติดต่อระบบไม่ได้ ลอง refresh แล้วกดใหม่อีกครั้ง','is-error');}finally{submit.disabled=false;ownerInput.focus();}});
  const partnerForm=document.getElementById('partnerLoginForm');partnerForm?.addEventListener('submit',async e=>{e.preventDefault();const message=document.getElementById('partnerMessage');const submit=partnerForm.querySelector('.go');submit.disabled=true;setMessage(message,'Checking access…');try{const {response,payload}=await postForm(partnerForm);if(response.ok&&payload.ok){location.assign(payload.next||'${MMS_PARTNER_PATH}');return;}setMessage(message,genericError(response.status),'is-error');}catch{setMessage(message,'ติดต่อระบบไม่ได้ ลองใหม่อีกครั้ง','is-error');}finally{submit.disabled=false;}});
  function showRecovery(code){const box=document.getElementById('recoveryBox');document.getElementById('recoveryCode').textContent=code||'';box.classList.toggle('is-visible',Boolean(code));}
  const signupForm=document.getElementById('partnerSignupForm');signupForm?.addEventListener('submit',async e=>{e.preventDefault();const message=document.getElementById('signupMessage');const submit=signupForm.querySelector('.go');submit.disabled=true;showRecovery('');setMessage(message,'Creating account…');try{const {response,payload}=await postForm(signupForm);if(response.ok&&payload.ok){setMessage(message,'สร้างบัญชี Partner แล้ว ใช้ Username และ Password นี้เข้าสู่ระบบได้เลย','is-ok');showRecovery(payload.recovery_code);return;}setMessage(message,response.status===409?'บัญชีนี้เปิดใช้งานแล้ว หรือไม่สามารถเปิดซ้ำได้':genericError(response.status),'is-error');}catch{setMessage(message,'ติดต่อระบบไม่ได้ ลองใหม่อีกครั้ง','is-error');}finally{submit.disabled=false;}});
  const recoverForm=document.getElementById('partnerRecoverForm');recoverForm?.addEventListener('submit',async e=>{e.preventDefault();const message=document.getElementById('recoverMessage');const submit=recoverForm.querySelector('.go');submit.disabled=true;showRecovery('');setMessage(message,'Resetting password…');try{const {response,payload}=await postForm(recoverForm);if(response.ok&&payload.ok){setMessage(message,'เปลี่ยน Password แล้ว ใช้รหัสใหม่เข้าสู่ระบบได้เลย','is-ok');showRecovery(payload.recovery_code);return;}setMessage(message,genericError(response.status),'is-error');}catch{setMessage(message,'ติดต่อระบบไม่ได้ ลองใหม่อีกครั้ง','is-error');}finally{submit.disabled=false;}});
})();</script>
</body></html>`;
  return new Response(html, { status, headers });
}

function loginHeaders() {
  return {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store, private, max-age=0",
    "x-mmd-admin-origin": ADMIN_CANONICAL_ORIGIN,
    "content-security-policy": CSP,
    "x-mmd-admin-login": APPROVED_ADMIN_LOGIN_PAGE_ID,
    "x-mmd-login-ui": "browser-fetch-v5",
    "x-mmd-page": APPROVED_ADMIN_LOGIN_PAGE_ID,
    "x-mmd-route-owner": "admin-worker",
  };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}
function escapeAttribute(value) { return escapeHtml(value).replace(/`/g, "&#96;"); }

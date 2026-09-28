const LIFF_SHELL_PATHS = new Set(["/member/liff", "/member/liff/"]);
const LIFF_INTENTS = new Set(["signup", "renew", "status", "promo", "hall", "continue_payment", "unknown"]);
const LIFF_SDK_URL = "https://static.line-scdn.net/liff/edge/2/sdk.js";

export function isLiffMemberShellPath(url) {
  return LIFF_SHELL_PATHS.has(url.pathname.toLowerCase());
}

export function resolveTrustedWelcomeWorld(data, authority) {
  if (authority !== "my_mmd_entitlement_resolver_v1" || !data || typeof data !== "object") return "public";
  const tier = String(data.tier || "").trim().toLowerCase().replace(/[_-]/g, " ");
  const lifecycle = String(data.membership_status || "").trim().toLowerCase();
  return new Set(["vip", "svip", "black card"]).has(tier) && new Set(["active", "grace"]).has(lifecycle)
    ? "private"
    : "public";
}

export function handleLiffMemberShell(request, env = {}) {
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: shellHeaders({ allow: "GET, HEAD" }),
    });
  }

  const url = new URL(request.url);
  const config = {
    liffId: publicLiffId(env),
    intent: normalizeIntent(url.searchParams.get("intent") || url.searchParams.get("liff_intent")),
    campaign: normalizeCampaign(url.searchParams.get("campaign")),
    view: normalizeView(url.searchParams.get("view")),
    // Browser-controlled world/audience hints are never identity or entitlement.
    world: "public",
    language: normalizeLanguage(url.searchParams.get("lang") || url.searchParams.get("locale")),
    promoCode: normalizePromoCode(url.searchParams.get("promo_code") || url.searchParams.get("code")),
    startEndpoint: "/member/api/liff/start",
    profileEndpoint: "/member/api/liff/profile",
    welcomeContextEndpoint: "/member/api/liff/welcome-context",
    publicCatalogEndpoint: "/member/api/liff/public-membership/catalog",
    publicPurchaseEndpoint: "/member/api/liff/public-membership/purchase",
    careBackEndpoint: "/member/api/liff/care-back/claim",
    careBackStateEndpoint: "/member/api/liff/care-back/state",
    couponWalletEndpoint: "/member/api/liff/care-back/wallet",
    creditWalletEndpoint: "/api/member/app/credits",
    historyEndpoint: "/api/member/app/history",
    historyRecoveryEndpoint: "/api/member/app/history/recovery",
    customerRequestsEndpoint: "/member/api/liff/customer-requests",
    customerRequestEvidenceEndpoint: "/member/api/liff/customer-request-evidence",
    careBackWishEndpoint: "/member/api/liff/care-back/wish",
    stagingScenario: stagingScenario(env, url),
  };
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const html = renderShell(config, nonce);
  const headers = shellHeaders({
    "content-type": "text/html; charset=utf-8",
    "content-security-policy": `default-src 'self'; script-src 'self' https://static.line-scdn.net 'nonce-${nonce}'; connect-src 'self' https://api.line.me https://access.line.me; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; base-uri 'none'; form-action 'self'; object-src 'none'`,
  });
  return new Response(method === "HEAD" ? null : html, { status: 200, headers });
}

function renderShell(config, nonce) {
  const safeConfig = jsonForInlineScript(config);
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>MMD Privé</title>
  <style>
    :root{color-scheme:dark;font-family:"LINE Seed Sans TH","LINE","Noto Sans Thai","Noto",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#090909;color:#f5f2eb}
    html,body{margin:0;padding:0;width:100%;min-width:100%;min-height:100%;overflow-x:hidden}html{background:#090909}body{min-height:100vh;min-height:100dvh;background:#090909}
    *{box-sizing:border-box}body{margin:0;min-height:100vh;background:#090909;padding:20px 16px 40px}
    main{width:min(100%,760px);margin:0 auto;padding:24px 16px;border:1px solid rgba(212,181,123,.22);border-radius:8px;background:#101011;box-shadow:0 28px 80px rgba(0,0,0,.45)}
    .mark{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#d7bd8a}.title{margin:10px 0 8px;font-size:30px;line-height:1.08;font-weight:650}.sub{margin:0;color:#aaa29a;font-size:14px;line-height:1.55}
    #message{white-space:pre-line;margin:30px 0 0;font-size:18px;line-height:1.65}.actions{display:grid;gap:10px;margin-top:24px}.actions:empty{display:none}
    button,textarea,input,select{width:100%;border:1px solid rgba(216,189,137,.28);border-radius:12px;padding:12px 14px;background:#171511;color:#f7f3eb;font:inherit;text-align:left}button{cursor:pointer}button:disabled{opacity:.55;cursor:default}textarea{min-height:124px;resize:vertical;line-height:1.55}input[type=file]{padding:10px}.form-stack{display:grid;gap:10px}.form-stack label{display:grid;gap:6px}.form-stack button{background:#f0d892;color:#181207;font-weight:700;text-align:center}.form-note{margin:0;color:#aaa29a;font-size:12px;line-height:1.55}.wish{display:grid;gap:12px;margin-top:16px}.wish-result{white-space:pre-line;color:#e7d5ad;line-height:1.65}
    .signup{display:grid;gap:12px;margin-top:24px}.signup h2{margin:0;color:#f0d892;font-size:22px}.signup .card{display:grid;gap:8px}.signup .card strong{font-size:18px}.signup .card button{margin-top:4px;text-align:center;background:#f0d892;color:#181207;font-weight:700}.signup .card button:disabled{opacity:.5}.signup .private-link{display:block;border:1px solid rgba(216,189,137,.28);border-radius:16px;padding:14px 16px;color:#f0d892;text-align:center;text-decoration:none}.signup-note{color:#b7afa4;font-size:13px;line-height:1.6}.profile{display:block;margin-top:14px}.section-rail{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;overscroll-behavior-x:contain;padding:0 2px 12px;scrollbar-width:none}.section-rail::-webkit-scrollbar{display:none}.panel{display:flex;flex:0 0 100%;min-height:430px;flex-direction:column;gap:12px;scroll-snap-align:start;scroll-snap-stop:always}.summary{display:grid;grid-template-columns:1.2fr .8fr;gap:12px}.card{border:1px solid rgba(216,189,137,.18);border-radius:8px;padding:17px;background:#080809}.label{color:#948c82;font-size:11px;letter-spacing:.12em;text-transform:uppercase}.value{display:block;margin-top:6px;font-size:22px;line-height:1.15}.points{font-size:34px;color:#e6cb91}.history,.stack{display:grid;gap:9px;margin-top:12px}.event{display:grid;grid-template-columns:72px 1fr auto;gap:10px;align-items:center;padding:11px 0;border-top:1px solid rgba(255,255,255,.07);font-size:13px}.event:first-child{border-top:0}.event-date,.event-status{color:#8f8880}.event-delta{color:#d9bd82}.care{border-color:rgba(225,193,126,.38);background:#15120f}.care h2{margin:8px 0;font-size:21px}.care p{margin:0;color:#b7afa4;font-size:13px;line-height:1.6}.care-code{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:14px 0;padding:13px 14px;border-radius:8px;background:#080807}.care-code strong{font-size:24px;letter-spacing:.15em;color:#ecd18f}.care button{margin-top:14px;text-align:center;background:#f0d892;color:#181207;font-weight:700}.details{border-top:1px solid rgba(255,255,255,.08);padding-top:12px}.details summary{cursor:pointer;color:#e7e2d8;font-size:14px}.details[open] summary{margin-bottom:10px}.group-title{margin:4px 0;font-size:14px;color:#e7e2d8}.empty{margin:0;color:#aaa29a;font-size:14px;line-height:1.55}
    .member-nav{display:flex;gap:8px;overflow-x:auto;margin:22px 0 0;padding:4px;border:1px solid rgba(216,189,137,.18);border-radius:8px;background:rgba(0,0,0,.22);scrollbar-width:none}.member-nav::-webkit-scrollbar{display:none}.member-nav button{width:auto;white-space:nowrap;border:0;border-radius:999px;padding:10px 12px;background:transparent;color:#aaa29a;font-size:12px;text-align:center}.member-nav button[aria-current="true"]{background:#f0d892;color:#181207;font-weight:800}.status{margin-top:22px;color:#7f7972;font-size:12px;line-height:1.5}.hidden{display:none!important}@media(max-width:390px){main{padding:24px 16px}.summary,.detail-grid{grid-template-columns:1fr}.event{grid-template-columns:66px 1fr}.event-status{grid-column:2}}@media(min-width:700px){.panel{flex-basis:calc(50% - 6px)}.section-rail{flex-wrap:wrap;overflow:visible;scroll-snap-type:none}}@media(prefers-reduced-motion:reduce){.section-rail{scroll-behavior:auto}*{animation:none!important;transition:none!important}}

    body.signup-mode{width:100%;max-width:100%;min-height:100vh;min-height:100dvh;padding:0;overflow-x:clip;overflow-y:auto;background:radial-gradient(circle at 50% -8%,#473026 0,transparent 38%),#080809}
    body.signup-mode main{width:100%;max-width:none;min-height:100vh;min-height:100dvh;margin:0;padding:calc(26px + env(safe-area-inset-top)) max(18px,env(safe-area-inset-right)) calc(34px + env(safe-area-inset-bottom)) max(18px,env(safe-area-inset-left));border:0;border-radius:0;background:linear-gradient(160deg,#241d1c,#101012 55%,#09090b);box-shadow:none}
    body.signup-mode .mark{font-size:10px;letter-spacing:.25em}body.signup-mode .title{margin:12px 0 6px;color:#fff7ed;font-size:32px}body.signup-mode .sub{color:#c6bdb3}
    body.signup-mode #message{margin:16px 0 0;padding:11px 13px;border-left:2px solid #d9ae77;border-radius:0 8px 8px 0;background:#dfb58014;color:#e5d0b2;font-size:13px;line-height:1.55}
    body.signup-mode .member-nav,body.signup-mode #profile{display:none!important}body.signup-mode .signup{margin-top:18px;gap:15px}
    .signup-hero{position:relative;display:flex;align-items:center;min-height:150px;overflow:hidden;padding:22px;border:1px solid #e7bb8159;border-radius:18px;background:radial-gradient(circle at 85% 12%,#b6824f55,transparent 42%),linear-gradient(130deg,#292321,#131315 70%);box-shadow:0 18px 44px #0004}
    .signup-hero::before,.signup-hero::after{content:"";position:absolute;right:-43px;top:-78px;width:230px;height:230px;border:1px solid #f1cd9c45;border-radius:50%;pointer-events:none}.signup-hero::after{right:-14px;top:-49px;width:172px;height:172px;border-color:#f1cd9c30}
    .signup-crest{position:relative;z-index:1;display:grid;place-content:center;flex:0 0 94px;height:94px;margin-right:18px;border:1px solid #ffdeae94;border-radius:50%;box-shadow:inset 0 0 0 6px #e7b97c14,0 0 24px #e0a36120;color:#f9e4c1;font:26px Georgia,serif;letter-spacing:.09em;text-align:center}.signup-crest small{font:9px Georgia,serif;letter-spacing:.3em}
    .signup-hero-copy{position:relative;z-index:1}.signup-hero-copy span{color:#d2b894;font-size:10px;letter-spacing:.17em}.signup-hero-copy strong{display:block;margin-top:8px;color:#fff6e7;font-size:18px;line-height:1.35}.signup-hero-copy p{margin:6px 0 0;color:#bdb4ad;font-size:12px}
    .signup-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:0;padding:0;list-style:none}.signup-steps li{display:grid;gap:4px;padding:11px 8px;border:1px solid #e6c29224;border-radius:10px;background:#ffffff06;color:#c8c0b9;font-size:11px;text-align:center}.signup-steps b{color:#edc895;font-size:11px;letter-spacing:.12em}
    .signup-section-heading{display:flex;align-items:end;justify-content:space-between;gap:12px;margin-top:5px}.signup-section-heading h2{font-size:19px;color:#fff1dc}.signup-section-heading span{color:#a9a09a;font-size:11px}
    .signup-loading{margin:0;padding:22px;border:1px dashed #e6c29240;border-radius:14px;color:#d0c6bb;font-size:13px;text-align:center}.signup-line-entry{display:block;margin-top:12px;padding:14px;border:1px solid #eec79288;border-radius:12px;background:#e8c38e;color:#20170f;font-size:14px;font-weight:750;text-align:center;text-decoration:none}
    body.signup-mode .signup-package{position:relative;gap:10px;padding:18px;border-radius:16px;border-color:#f1d0a438;background:linear-gradient(140deg,#24201d,#141315 72%)}.signup-package::before{content:"";position:absolute;inset:0 auto 0 0;width:3px;border-radius:16px 0 0 16px;background:#c9ac82}
    .signup-package-elite{background:linear-gradient(135deg,#352023,#171315 72%)!important}.signup-package-elite::before{background:#d28086}.signup-package-red_card{background:linear-gradient(135deg,#411b24,#191316 72%)!important}.signup-package-red_card::before{background:#d55d72}
    .signup-package-top{display:flex;align-items:center;justify-content:space-between;gap:10px}.signup-package-top strong{color:#fff6ec}.signup-package-top span{padding:4px 8px;border:1px solid #e9c8a133;border-radius:100px;color:#d7b58a;font-size:10px;letter-spacing:.11em}
    .signup-price{display:flex;align-items:baseline;gap:6px}.signup-price .value{margin:0;color:#fff7ea;font-size:30px;font-weight:700;letter-spacing:-.04em}.signup-price small{color:#b9a894;font-size:12px}.signup-period{margin:0;color:#c4b5a9;font-size:12px}
    body.signup-mode .signup-package button{margin-top:6px;border:0;border-radius:11px;background:linear-gradient(100deg,#f1d8aa,#dfb879);box-shadow:0 8px 22px #dca56021;color:#1e160f;font-size:14px;text-align:center}
    body.signup-mode .signup-private{padding:18px;border-color:#d6be953d;border-radius:16px;background:linear-gradient(125deg,#171718,#101011)}.signup-private strong{color:#f2d7a9}.signup-private .signup-note{margin:0}
    .signup-footer{margin:1px 0 0;padding:13px 2px 0;border-top:1px solid #ecc69129;color:#a99f94;font-size:11px;line-height:1.6}body.signup-mode .status{margin-top:18px;text-align:center}
    @media(max-width:370px){.signup-hero{padding:16px;min-height:136px}.signup-crest{flex-basis:74px;height:74px;margin-right:12px;font-size:21px}.signup-hero-copy strong{font-size:16px}.signup-steps li{font-size:10px}}
    @media(min-width:600px){body.signup-mode{padding:0}body.signup-mode main{min-height:100vh;min-height:100dvh;border:0;border-radius:0;padding:calc(32px + env(safe-area-inset-top)) max(24px,env(safe-area-inset-right)) calc(40px + env(safe-area-inset-bottom)) max(24px,env(safe-area-inset-left))}body.signup-mode #app-status,body.signup-mode #actions,body.signup-mode #signup,body.signup-mode .status{width:min(100%,760px);margin-left:auto;margin-right:auto}}
    .detail-grid,.benefit-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.detail-grid .value{font-size:17px}.payment-status{color:#e6cb91}.benefit-grid{margin:14px 0}.benefit-card{padding:14px;border:1px solid rgba(216,189,137,.18);border-radius:14px;background:rgba(255,255,255,.025)}.benefit-card strong{display:block;margin-top:6px;color:#f0d892;font-size:20px}.wallet-code{letter-spacing:.16em}.wallet-state{color:#d9c18d}

    /* Dual first-screen worlds: public discovery stays bright; private access stays SIGIL. */
    body.world-public:not(.signup-mode){background:radial-gradient(circle at 50% -10%,#fffdf8 0,#f5eee3 52%,#eee3d4 100%);color:#2c2926}
    body.world-public:not(.signup-mode) main{border-color:#d7c8b6;background:linear-gradient(160deg,#fffdf9,#f7efe4 62%,#eee2d2);box-shadow:0 24px 70px rgba(100,75,45,.16)}
    body.world-public:not(.signup-mode) .mark{color:#8d684a}
    body.world-public:not(.signup-mode) .title{color:#26211d}
    body.world-public:not(.signup-mode) .sub{color:#76695d}
    body.world-public:not(.signup-mode) #message{color:#4e443a;border-left:2px solid #b98357;background:#fffaf3}
    body.world-public:not(.signup-mode) .member-nav{border-color:#d9cabb;background:#fffaf4}
    body.world-public:not(.signup-mode) .member-nav button{color:#7b6f64}
    body.world-public:not(.signup-mode) .member-nav button[aria-current="true"]{background:#1f1b18;color:#fffaf4}
    body.world-private:not(.signup-mode){background:radial-gradient(circle at 50% -10%,#2a201d 0,transparent 42%),#080809;color:#f5f2eb}
    body.world-private:not(.signup-mode) main{border-color:rgba(212,181,123,.22);background:#101011;box-shadow:0 28px 80px rgba(0,0,0,.45)}
    body.world-private:not(.signup-mode) .mark{color:#d7bd8a}
    body.world-private:not(.signup-mode) #message{color:#e5d0b2;border-left:2px solid #d9ae77;background:#dfb58014}
    body.world-private:not(.signup-mode) .member-nav button[aria-current="true"]{background:#f0d892;color:#181207}
    /* Full-screen mobile-first intro, then a deliberate hand-off into the app. */
    body.world-public:not(.signup-mode):not(.app-entered),
    body.world-private:not(.signup-mode):not(.app-entered){min-height:100svh;padding:0;overflow-x:hidden;overflow-y:auto}
    body.world-public:not(.signup-mode):not(.app-entered) main,
    body.world-private:not(.signup-mode):not(.app-entered) main{width:100%;max-width:none;min-height:100svh;margin:0;padding:clamp(28px,8vw,72px) clamp(20px,7vw,48px) max(28px,env(safe-area-inset-bottom));border:0;border-radius:0;display:flex;flex-direction:column;justify-content:center}
    body.world-public:not(.signup-mode):not(.app-entered) .intro-screen,
    body.world-private:not(.signup-mode):not(.app-entered) .intro-screen{min-height:100svh;display:flex;flex-direction:column;justify-content:center;gap:0}
    .intro-screen .title{max-width:680px;margin-top:14px;font-size:clamp(34px,10vw,68px);letter-spacing:-.04em}
    .intro-screen .sub{max-width:640px;margin-top:12px;font-size:clamp(14px,3.8vw,19px)}
    .intro-screen #message{max-width:680px;margin-top:clamp(22px,6vw,46px);font-size:clamp(15px,4.2vw,20px);line-height:1.78}
    .intro-continue{width:100%;max-width:360px;margin-top:clamp(24px,7vw,52px);padding:15px 20px;border:0;border-radius:999px;text-align:center;font-size:15px;font-weight:800;letter-spacing:.01em;box-shadow:0 12px 28px rgba(0,0,0,.16)}
    body.world-public:not(.signup-mode):not(.app-entered) .intro-continue{background:#b94a3f;color:#fffaf4}
    body.world-private:not(.signup-mode):not(.app-entered) .intro-continue{background:#e5bf72;color:#20170f}
    body:not(.app-entered) .actions,body:not(.app-entered) .member-nav,body:not(.app-entered) #profile,body:not(.app-entered) #signup{display:none!important}
    .app-status{display:none;margin:0 0 14px;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,.04);color:#bdb4ad;font-size:13px;line-height:1.55}.app-entered .app-status{display:block}
    body.app-entered .intro-screen{display:none}
    body.app-entered.world-public main,body.app-entered.world-private main{width:100%;max-width:none;min-height:100vh;min-height:100dvh;margin:0;padding:0;border:0;border-radius:0;display:block;box-shadow:none}
    body.app-entered.world-public,body.app-entered.world-private{min-height:100vh;min-height:100dvh;padding:0;overflow-x:clip;overflow-y:auto}
    @media(max-width:430px){.intro-screen #message{max-height:46svh;overflow:auto;padding-right:4px}.intro-continue{max-width:none}}
    /* MMD Memory theme locks: Bangkok ivory for Public, SIGIL Wall for Private. */
    body.world-public:not(.signup-mode){font-family:"Manrope","Noto Sans Thai","LINE Seed Sans TH",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:radial-gradient(ellipse at 50% 110%,rgba(184,132,82,.22),transparent 48%),linear-gradient(180deg,#fffdf8 0%,#f6ede2 56%,#e7d8c7 100%);color:#2a2521}
    body.world-public:not(.signup-mode) main{background:linear-gradient(160deg,rgba(255,253,249,.96),rgba(248,239,228,.94) 62%,rgba(235,220,203,.95));border-color:#d8c6b2;box-shadow:0 28px 90px rgba(105,77,47,.18)}
    body.world-public:not(.signup-mode) .mark{font-weight:800;letter-spacing:.22em;color:#9c6744}
    body.world-public:not(.signup-mode) .title{font-family:"Manrope","Noto Sans Thai",sans-serif;font-weight:800;color:#231e1a}
    body.world-public:not(.signup-mode) .sub{color:#715f51}
    body.world-public:not(.signup-mode) #message{color:#493d34;border-left-color:#b86f45;background:rgba(255,250,243,.84)}
    body.world-public:not(.signup-mode):not(.app-entered) .intro-continue{background:linear-gradient(100deg,#b7473d,#d06c55);color:#fffaf4;box-shadow:0 14px 30px rgba(152,62,47,.24)}
    body.world-public:not(.signup-mode) .member-nav{border-color:#d8c6b3;background:rgba(255,250,244,.86)}
    body.world-public:not(.signup-mode) .member-nav button{color:#78675b}
    body.world-public:not(.signup-mode) .member-nav button[aria-current="true"]{background:#24201d;color:#fffaf4}
    body.world-private:not(.signup-mode){font-family:"Noto Sans Thai","LINE Seed Sans TH","LINE",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:radial-gradient(circle at 50% 5%,rgba(128,89,48,.38),transparent 34%),repeating-linear-gradient(90deg,rgba(211,176,107,.045) 0,rgba(211,176,107,.045) 1px,transparent 1px,transparent 76px),linear-gradient(160deg,#0b0a0a 0%,#171210 52%,#070707 100%);color:#f3ead8}
    body.world-private:not(.signup-mode) main{background:linear-gradient(160deg,rgba(25,20,18,.96),rgba(14,13,13,.98));border-color:rgba(224,190,119,.3);box-shadow:0 30px 100px rgba(0,0,0,.58)}
    body.world-private:not(.signup-mode) .mark{font-weight:800;letter-spacing:.24em;color:#e0bf7a}
    body.world-private:not(.signup-mode) .title{font-family:"Noto Sans Thai","LINE Seed Sans TH",sans-serif;font-weight:750;color:#f7e8c9}
    body.world-private:not(.signup-mode) .sub{color:#c2b29a}
    body.world-private:not(.signup-mode) #message{color:#ecdcbd;border-left-color:#d2a95d;background:rgba(218,172,83,.08)}
    body.world-private:not(.signup-mode):not(.app-entered) .intro-continue{background:linear-gradient(100deg,#c79a4d,#f0d38c);color:#21170c;box-shadow:0 14px 32px rgba(194,148,63,.24)}
    body.world-private:not(.signup-mode) .member-nav{border-color:rgba(214,174,94,.28);background:rgba(13,11,10,.78)}
    body.world-private:not(.signup-mode) .member-nav button{color:#bcae96}
    body.world-private:not(.signup-mode) .member-nav button[aria-current="true"]{background:#e7c477;color:#241a0d}
    .welcome-benefits{display:grid;gap:7px;margin:18px 0 0;padding:0;list-style:none;color:#594b3e;font-size:14px;line-height:1.5}
    .welcome-benefits li::before{content:"•";margin-right:9px;color:#b94a3f;font-weight:900}
    body.world-private .welcome-benefits{color:#e1d1b5}.world-private .welcome-benefits li::before{color:#e5bf72}
    .per-letter{max-width:680px;margin-top:18px;border-top:1px solid currentColor;padding-top:13px;color:inherit}
    .per-letter summary{cursor:pointer;font-weight:750}.per-letter-copy{max-height:42svh;overflow:auto;margin-top:12px;padding-right:6px;white-space:pre-line;font-size:14px;line-height:1.75}
    /* MY MMD customer welcome: member world only, before the board. */
    body:not(.app-entered){background:#171715;color:#f4ede1}
    body:not(.app-entered) main,
    body.world-public:not(.signup-mode):not(.app-entered) main,
    body.world-private:not(.signup-mode):not(.app-entered) main{display:block;width:100%;max-width:none;min-height:100svh;margin:0;padding:0;border:0;border-radius:0;background:#171715;box-shadow:none}
    body:not(.app-entered) .my-mmd-welcome,
    body.world-public:not(.signup-mode):not(.app-entered) .my-mmd-welcome,
    body.world-private:not(.signup-mode):not(.app-entered) .my-mmd-welcome{display:block;min-height:100svh;background:#171715;color:#f4ede1}
    .welcome-hero{position:relative;min-height:178px;background:linear-gradient(90deg,rgba(12,12,11,.82) 0%,rgba(12,12,11,.64) 38%,rgba(12,12,11,.10) 78%),url("https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aa39420fe79ed62c01d842a_MMD%20Academy%20fback%20inside.webp") center 54%/cover no-repeat}
    body[data-welcome-audience="existing"] .welcome-hero{background-image:linear-gradient(90deg,rgba(12,12,11,.82) 0%,rgba(12,12,11,.64) 38%,rgba(12,12,11,.10) 78%),url("https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a317ccf809d2f8493a4632e_SIGIL%20Apply%20Hero.webp")}
    .welcome-brand{position:absolute;left:26px;bottom:22px;display:flex;align-items:center;gap:10px;min-width:0}.welcome-logo{display:grid;width:31px;height:31px;place-items:center;overflow:hidden;border-radius:5px;background:#090909}.welcome-logo img{display:block;width:31px;height:31px;object-fit:contain}.welcome-brand strong{display:block;color:#f4ede1;font-family:Georgia,"Times New Roman",serif;font-size:19px;font-weight:400;line-height:1.05;letter-spacing:.01em}.welcome-brand small{display:block;margin-top:4px;color:rgba(244,237,225,.68);font-size:9px;line-height:1.1;letter-spacing:.08em}
    .welcome-letter{padding:26px 26px max(42px,env(safe-area-inset-bottom))}.my-mmd-welcome .mark{color:#c9a866;font-size:10px;letter-spacing:.14em}.my-mmd-welcome .title{max-width:680px;margin:10px 0 7px;color:#f4ede1;font-family:Georgia,"Times New Roman","Noto Sans Thai",serif;font-size:clamp(30px,9vw,48px);font-weight:400;line-height:1.12;letter-spacing:-.025em}.my-mmd-welcome .sub{max-width:680px;margin:0;color:rgba(244,237,225,.68);font-size:13px;line-height:1.55}
    body.world-public:not(.signup-mode):not(.app-entered) .my-mmd-welcome .mark,
    body.world-private:not(.signup-mode):not(.app-entered) .my-mmd-welcome .mark{color:#c9a866}
    body.world-public:not(.signup-mode):not(.app-entered) .my-mmd-welcome .title,
    body.world-private:not(.signup-mode):not(.app-entered) .my-mmd-welcome .title{color:#f4ede1;font-family:Georgia,"Times New Roman","Noto Sans Thai",serif;font-weight:400}
    body.world-public:not(.signup-mode):not(.app-entered) .my-mmd-welcome .sub,
    body.world-private:not(.signup-mode):not(.app-entered) .my-mmd-welcome .sub{color:rgba(244,237,225,.68)}
    .my-mmd-welcome #message{max-width:680px;margin:18px 0 0;padding:12px 14px;border:1px solid rgba(201,168,102,.28);border-left:2px solid #c9a866;border-radius:0 8px 8px 0;background:rgba(201,168,102,.07);color:#eadcc1;font-size:13px;line-height:1.65}
    .my-mmd-welcome .per-letter{max-width:680px;margin:24px 0 0;padding:0;border:0;color:#f4ede1}.my-mmd-welcome .per-letter-copy{max-height:none;overflow:visible;margin:0;padding:0;white-space:pre-line;font-size:16px;line-height:1.65}
    .welcome-divider{width:min(100%,680px);height:1px;margin:30px 0 0;background:rgba(201,168,102,.34)}.my-mmd-welcome .intro-continue{width:195px;min-height:48px;margin:26px 0 0;padding:12px 20px;border:0;border-radius:999px;background:#c9a866!important;color:#171715!important;box-shadow:none;font-size:14px;font-weight:800;text-align:center;letter-spacing:.05em}.my-mmd-welcome .intro-continue:disabled{opacity:.55}
    body.context-resolving .my-mmd-welcome{visibility:visible}body.context-resolving .my-mmd-welcome .intro-continue{opacity:.55}
    @media(max-width:430px){.welcome-hero{min-height:178px}.welcome-letter{padding:24px 26px max(38px,env(safe-area-inset-bottom))}.my-mmd-welcome .per-letter-copy{font-size:16px;line-height:1.65}.my-mmd-welcome .intro-continue{width:195px;max-width:100%}}
    @media(max-width:340px){.welcome-hero{min-height:168px}.welcome-brand{left:24px;bottom:20px}.welcome-letter{padding-left:24px;padding-right:24px}.my-mmd-welcome .per-letter-copy{font-size:15px}}
    @media(min-width:700px){.welcome-hero{min-height:188px}.welcome-letter{width:min(100%,760px);margin:0 auto}}
    body.context-resolving .intro-screen{visibility:visible}

    /* Worker-rendered MY MMD LIFF Digital Home v3. Runtime and presentation remain Worker-owned. */
    body.app-entered:not(.signup-mode){--digital-bg:#080907;--digital-surface:#1c1d1b;--digital-raised:#272825;--digital-line:#555248;--digital-gold:#d8b26a;--digital-cream:#f6f1e7;--digital-muted:#bcb6aa;--digital-radius:8px;min-height:100vh;min-height:100dvh;width:100%;max-width:100%;padding:0;overflow-x:clip;overflow-y:auto;background:var(--digital-bg);color:var(--digital-cream)}
    body.app-entered:not(.signup-mode) main{width:100%;max-width:none;min-height:100vh;min-height:100dvh;margin:0;padding:calc(16px + env(safe-area-inset-top)) 16px calc(90px + env(safe-area-inset-bottom));padding-left:max(16px,env(safe-area-inset-left));padding-right:max(16px,env(safe-area-inset-right));border:0;border-radius:0;background:radial-gradient(ellipse 90% 34% at 50% 11%,rgba(80,64,34,.42),transparent 82%),linear-gradient(155deg,#11120e,#080907 62%);box-shadow:none}
    body.app-entered:not(.signup-mode) .intro-screen,body.app-entered:not(.signup-mode) .member-nav{display:none!important}
    body.app-entered:not(.signup-mode) #app-status{min-height:0;margin:0;color:#8d8e83;font-size:10px;text-align:right}
    body.app-entered:not(.signup-mode) .actions{margin:8px 0 0}
    body.app-entered:not(.signup-mode) .profile{display:block!important;margin:0}
    body.app-entered:not(.signup-mode) .section-rail{display:block;overflow:visible;padding:0}
    body.app-entered:not(.signup-mode) .panel{display:none;min-height:0;gap:10px}
    body.app-entered:not(.signup-mode) .panel[data-active="true"]{display:flex}
    body.app-entered:not(.signup-mode) .card{border:1px solid var(--digital-line);border-radius:var(--digital-radius);background:var(--digital-surface);box-shadow:none}
    body.app-entered:not(.signup-mode) .value{font-size:18px}
    body.app-entered:not(.signup-mode) .label{color:#a49b84}
    body.app-entered:not(.signup-mode) .empty{color:var(--digital-muted)}
    body.app-entered:not(.signup-mode) .digital-view{gap:0;padding-top:4px}
    body.app-entered:not(.signup-mode) .digital-view>.card,body.app-entered:not(.signup-mode) .digital-view>details.card{width:100%;margin:0;padding:16px 0;border:0;border-bottom:1px solid rgba(216,189,137,.18);border-radius:0;background:transparent;box-shadow:none}
    body.app-entered:not(.signup-mode) .digital-view>.card:first-child{padding-top:8px}
    body.app-entered:not(.signup-mode) .digital-view h2{margin:0 0 6px;color:var(--digital-cream);font-size:20px;line-height:1.25;letter-spacing:-.02em}
    body.app-entered:not(.signup-mode) .digital-view .history,body.app-entered:not(.signup-mode) .digital-view .stack{margin-top:10px;gap:0}
    body.app-entered:not(.signup-mode) .digital-view .details{padding-top:14px}
    body.app-entered:not(.signup-mode) .digital-view .details summary{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:2px 0;color:var(--digital-cream);font-size:12px;font-weight:700}
    body.app-entered:not(.signup-mode) #credits .detail-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
    body.app-entered:not(.signup-mode) #points .detail-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
    body.app-entered:not(.signup-mode) #credits .detail-grid,body.app-entered:not(.signup-mode) #points .detail-grid{gap:0;margin-top:14px;padding:10px 0;border-top:1px solid rgba(216,189,137,.14);border-bottom:1px solid rgba(216,189,137,.14)}
    body.app-entered:not(.signup-mode) #credits .detail-grid>div,body.app-entered:not(.signup-mode) #points .detail-grid>div{min-width:0;padding:0 10px;border-left:1px solid rgba(216,189,137,.14)}
    body.app-entered:not(.signup-mode) #credits .detail-grid>div:first-child,body.app-entered:not(.signup-mode) #points .detail-grid>div:first-child{padding-left:0;border-left:0}
    body.app-entered:not(.signup-mode) #credits .detail-grid>div:last-child,body.app-entered:not(.signup-mode) #points .detail-grid>div:last-child{padding-right:0}
    body.app-entered:not(.signup-mode) #credits .detail-grid .label,body.app-entered:not(.signup-mode) #points .detail-grid .label{display:block;overflow:hidden;font-size:9px;letter-spacing:.08em;text-overflow:ellipsis;white-space:nowrap}
    body.app-entered:not(.signup-mode) #credits .detail-grid .value,body.app-entered:not(.signup-mode) #points .detail-grid .value{font-size:16px}
    body.app-entered:not(.signup-mode) .digital-care{gap:0;padding-top:4px}
    body.app-entered:not(.signup-mode) .digital-care>.care{margin:0;padding:16px 0 20px;border:0;border-radius:0;background:transparent;box-shadow:none}
    body.app-entered:not(.signup-mode) .digital-care>.care>h2{margin:5px 0 7px;color:var(--digital-cream);font-size:22px;line-height:1.2;letter-spacing:-.025em}
    body.app-entered:not(.signup-mode) .digital-care #care-message{max-width:620px;color:var(--digital-muted);font-size:12px;line-height:1.6}
    body.app-entered:not(.signup-mode) .digital-care .benefit-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:14px 0}
    body.app-entered:not(.signup-mode) .digital-care .benefit-card{padding:12px;border:1px solid rgba(216,189,137,.16);border-radius:var(--digital-radius);background:rgba(255,255,255,.025)}
    body.app-entered:not(.signup-mode) .digital-care .care-code{margin:14px 0;padding:12px 0;border-top:1px solid rgba(216,189,137,.16);border-bottom:1px solid rgba(216,189,137,.16);border-radius:0;background:transparent}
    body.app-entered:not(.signup-mode) .digital-care #care-button,body.app-entered:not(.signup-mode) .digital-care #wish-submit{min-height:46px;border:0;border-radius:var(--digital-radius);background:var(--digital-gold);color:#17140d;font-weight:800;text-align:center}
    body.app-entered:not(.signup-mode) .digital-care #wish-text{border:1px solid var(--digital-line);border-radius:var(--digital-radius);background:var(--digital-surface)}
    body.app-entered:not(.signup-mode) .digital-requests{gap:0;padding-top:4px}
    body.app-entered:not(.signup-mode) .digital-requests>.card,body.app-entered:not(.signup-mode) .digital-requests>details.card{width:100%;margin:0;padding:15px 0;border:0;border-bottom:1px solid rgba(216,189,137,.18);border-radius:0;background:transparent;box-shadow:none}
    body.app-entered:not(.signup-mode) .digital-request-block>summary{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0;color:var(--digital-cream);list-style:none}
    body.app-entered:not(.signup-mode) .digital-request-block>summary::-webkit-details-marker{display:none}
    body.app-entered:not(.signup-mode) .digital-request-block>summary::after{content:"+";flex:none;color:var(--digital-gold);font-size:22px;font-weight:300}
    body.app-entered:not(.signup-mode) .digital-request-block[open]>summary::after{content:"–"}
    body.app-entered:not(.signup-mode) .digital-request-block>summary small{display:block;margin-bottom:4px;color:#a49b84;font-size:9px;font-weight:700;letter-spacing:.12em}
    body.app-entered:not(.signup-mode) .digital-request-block>summary strong{display:block;color:var(--digital-cream);font-size:15px;line-height:1.35}
    body.app-entered:not(.signup-mode) .digital-request-body{padding-top:14px}
    body.app-entered:not(.signup-mode) .digital-requests .form-stack{gap:12px;margin-top:14px}
    body.app-entered:not(.signup-mode) .digital-requests .form-stack label{gap:5px;color:var(--digital-muted);font-size:11px}
    body.app-entered:not(.signup-mode) .digital-requests input,body.app-entered:not(.signup-mode) .digital-requests select,body.app-entered:not(.signup-mode) .digital-requests textarea{border:1px solid var(--digital-line);border-radius:var(--digital-radius);background:var(--digital-surface);color:var(--digital-cream)}
    body.app-entered:not(.signup-mode) .digital-requests textarea{min-height:96px}
    body.app-entered:not(.signup-mode) .digital-requests .form-stack button{min-height:46px;border:0;border-radius:var(--digital-radius);background:var(--digital-gold);color:#17140d;font-weight:800;text-align:center}
    body.app-entered:not(.signup-mode) .digital-requests>.card>.history{margin-top:8px}
    .digital-home{position:relative}
    .digital-top{display:flex;align-items:center;justify-content:space-between;gap:10px}.digital-brand{font-size:13px;font-weight:850;letter-spacing:.18em}.digital-brand small{display:block;margin-top:3px;color:var(--digital-gold);font-size:9px;letter-spacing:.19em}.digital-session{border:1px solid rgba(231,204,137,.3);border-radius:999px;padding:7px 9px;color:var(--digital-gold);background:#191a14;font-size:9px}
    .digital-hello{margin-top:18px}.digital-eyebrow{margin:0 0 5px;color:var(--digital-gold);font-size:9px;font-weight:800;letter-spacing:.16em}.digital-hello h1{margin:0 0 4px;color:var(--digital-cream);font-size:27px;line-height:1.12;letter-spacing:-.04em}.digital-sub{margin:0;color:var(--digital-muted);font-size:11px;line-height:1.5}
    .digital-snapshot{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:11px;margin-top:14px;padding:12px;border:1px solid var(--digital-line);border-radius:var(--digital-radius);background:var(--digital-surface)}.digital-snapshot-icon{font-size:20px;color:var(--digital-gold)}.digital-snapshot strong{display:block;color:var(--digital-cream);font-size:12px}.digital-snapshot p{margin:3px 0 0;color:var(--digital-muted);font-size:10px}.digital-points{color:var(--digital-gold)!important;font-size:19px!important;text-align:right}
    .digital-kenji{display:grid;grid-template-columns:72px 1fr;align-items:center;gap:13px;margin:10px 0;padding:12px;border:1px solid var(--digital-line);border-radius:var(--digital-radius);background:var(--digital-raised)}.digital-orb{position:relative;width:66px;height:66px;display:grid;place-items:center;border-radius:50%;background:radial-gradient(circle,rgba(229,199,133,.28),rgba(88,66,29,.14) 42%,transparent 72%)}.digital-orb::before,.digital-orb::after{content:"";position:absolute;border-radius:50%}.digital-orb::before{inset:5px;border:1px solid rgba(231,204,137,.65);border-left-color:transparent}.digital-orb::after{inset:15px;border:1px dashed rgba(201,158,88,.62)}.digital-core{width:20px;height:20px;border-radius:50%;background:radial-gradient(circle at 30% 25%,#fff5cf,#e5bd6e 48%,#4d3618);box-shadow:0 0 20px rgba(223,185,102,.55)}.digital-kenji strong{display:block;font-size:13px}.digital-kenji p{margin:3px 0 8px;color:var(--digital-muted);font-size:10px;line-height:1.5}.digital-kenji a{display:inline-block;border:1px solid rgba(209,183,117,.48);border-radius:99px;padding:7px 10px;color:var(--digital-gold);background:#27251b;font-size:10px;font-weight:700;text-decoration:none}
    .digital-needs[hidden]{display:none!important}.digital-needs{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 13px;border-radius:var(--digital-radius);background:var(--digital-gold);color:#17140d}.digital-needs b{display:block;font-size:11px}.digital-needs span{font-size:10px;color:#514330}.digital-needs button{width:auto;flex:none;border:1px solid #725a30;border-radius:99px;padding:7px 10px;background:#201b13;color:#f4dfa9;font-size:10px}
    .digital-sectionline{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:4px}.digital-sectionline h2{margin:0;color:var(--digital-cream);font-size:20px}.digital-sectionline h2 small{display:block;margin-bottom:3px;color:var(--digital-gold);font-size:8px;letter-spacing:.15em}.digital-unread{border:1px solid rgba(231,204,137,.3);border-radius:99px;padding:5px 7px;color:var(--digital-gold);font-size:9px}
    .digital-news-feed{display:grid;gap:8px}.digital-news-card{width:100%;padding:12px;border:1px solid var(--digital-line);border-radius:var(--digital-radius);background:var(--digital-surface);color:var(--digital-cream);text-align:left}.digital-news-card.is-for-you{border-color:rgba(231,204,137,.5);background:linear-gradient(145deg,rgba(71,59,34,.58),var(--digital-surface))}.digital-news-card[data-feed-view]{cursor:pointer}.digital-news-card .meta{display:flex;justify-content:space-between;gap:8px;color:var(--digital-gold);font-size:9px}.digital-news-card h3{margin:7px 0 4px;font-size:13px}.digital-news-card p{margin:0;color:#c9c6b9;font-size:10px;line-height:1.5}.digital-feed-cta{display:block;margin-top:8px;color:var(--digital-gold);font-size:9px;font-weight:800}.digital-quiet{padding:20px 12px;border:1px dashed rgba(231,204,137,.32);border-radius:14px;color:var(--digital-muted);font-size:11px;text-align:center}
    .digital-quick{margin-top:4px}.digital-quick-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.digital-quick button{min-height:64px;padding:8px 2px;border:1px solid var(--digital-line);border-radius:var(--digital-radius);background:var(--digital-surface);color:var(--digital-cream);font-size:9px;text-align:center}.digital-quick button i{display:block;margin-bottom:4px;color:var(--digital-gold);font-size:16px;font-style:normal}
    .digital-data-cache{display:none!important}
    .digital-dock{position:fixed;z-index:10;bottom:0;left:0;right:0;width:100%;max-width:none;transform:none;display:none;grid-template-columns:repeat(4,1fr);padding:7px max(9px,env(safe-area-inset-right)) calc(7px + env(safe-area-inset-bottom)) max(9px,env(safe-area-inset-left));border-top:1px solid var(--digital-line);background:rgba(8,9,7,.96);backdrop-filter:blur(18px)}
    body.app-entered:not(.signup-mode) .digital-dock{display:grid}.digital-dock button,.digital-dock a{min-height:44px;border:0;background:none;color:var(--digital-muted);font-size:9px;text-align:center;text-decoration:none}.digital-dock button[aria-current="page"]{color:var(--digital-gold);font-weight:800;background:var(--digital-surface);border-radius:var(--digital-radius)}.digital-dock i{display:block;margin-bottom:2px;font-size:17px;font-style:normal}
    body.app-entered:not(.signup-mode) #status{display:none!important;margin:0}.digital-design-slot[hidden]{display:none!important}.digital-design-slot{padding:16px;border:1px solid var(--digital-line);border-radius:var(--digital-radius);background:var(--digital-surface)}.digital-design-slot .digital-eyebrow{display:block}.digital-design-slot p{margin:6px 0 0;color:var(--digital-muted);font-size:10px;line-height:1.5}
    @media(max-width:699px){body.app-entered:not(.signup-mode),body.app-entered:not(.signup-mode) main{width:100vw;max-width:100vw;min-height:100dvh}body.app-entered:not(.signup-mode) main{margin:0;border:0;border-radius:0}.digital-dock{width:100vw;max-width:100vw}}
    @media(min-width:700px){body.app-entered:not(.signup-mode) #app-status,body.app-entered:not(.signup-mode) #actions,body.app-entered:not(.signup-mode) #profile,body.app-entered:not(.signup-mode) #status{width:min(100%,760px);margin-left:auto;margin-right:auto}}
    @media(max-height:690px){body.app-entered:not(.signup-mode) main{padding-top:12px}.digital-hello{margin-top:12px}.digital-kenji{margin:7px 0}}
  </style>
</head>
<body class="${config.intent === "signup" ? "signup-mode " : "context-resolving "}world-${config.world}" data-world="${config.world}" data-mmd-liff-digital="v3">
<main>
  <section id="intro-screen" class="intro-screen my-mmd-welcome" aria-labelledby="intro-title">
    <div class="welcome-hero">
      <div class="welcome-brand">
        <span class="welcome-logo"><img src="https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a6c4486e7585ba74ab2eeb1_MMD_Prive%CC%81_logo_signature_transparent%20Final.webp" alt="MMD Privé" width="31" height="31"></span>
        <span><strong>MY MMD</strong><small>MMD PRIVÉ · MEMBER APP</small></span>
      </div>
    </div>
    <div class="welcome-letter">
      <div class="mark" data-copy="mark">MMD PRIVÉ · MY MMD</div>
      <h1 id="intro-title" class="title" data-copy="title">ยินดีที่ได้รู้จัก</h1>
      <p class="sub" data-copy="subtitle">MY MMD · แอปที่ออกแบบจากประสบการณ์จริงของเปอร์</p>
      <div id="message" class="welcome-context-note hidden" role="status" aria-live="polite"></div>
      <div id="per-letter" class="per-letter"><div id="per-letter-copy" class="per-letter-copy"></div></div>
      <div class="welcome-divider" aria-hidden="true"></div>
      <button id="intro-continue" class="intro-continue" type="button" aria-label="เข้าสู่บอร์ดสมาชิก MY MMD" aria-expanded="false" disabled>กำลังตรวจสอบ…</button>
    </div>
  </section>
  <div id="app-status" class="app-status" role="status" aria-live="polite"></div>
  <div id="actions" class="actions" aria-label="ตัวเลือก"></div>
  <section id="signup" class="signup${config.intent === "signup" ? "" : " hidden"}" aria-label="สมัครสมาชิกใน LINE">
    <div class="signup-hero">
      <div class="signup-crest" aria-hidden="true">MMD<small>PRIVÉ</small></div>
      <div class="signup-hero-copy"><span>MEMBER ACCESS · LINE</span><strong>โลกของ MMD<br>เริ่มจากตรงนี้</strong><p>เลือกเส้นทางสมาชิกที่เป็นคุณ</p></div>
    </div>
    <ol class="signup-steps" aria-label="ขั้นตอนสมัคร"><li><b>01</b>ยืนยัน LINE</li><li><b>02</b>เลือกแพ็กเกจ</li><li><b>03</b>ชำระและรอตรวจ</li></ol>
    <div class="signup-section-heading"><h2 id="signup-heading">Public Membership</h2><span>เลือกสิทธิ์ของคุณ</span></div>
    <p id="signup-note" class="signup-note">ราคาจากระบบ MMD เลือกแพ็กเกจเพื่อไปหน้าชำระเงิน</p>
    ${config.liffId ? `<a id="signup-line-entry" class="signup-line-entry" href="https://miniapp.line.me/${config.liffId}/?intent=signup&amp;view=signup">เปิดใน LINE เพื่อสมัคร</a>` : ""}
    <div id="signup-packages" class="stack" aria-live="polite"><p class="signup-loading">ยืนยัน LINE เพื่อดูแพ็กเกจที่สมัครได้</p></div>
    <div class="card signup-private"><strong>Private Access / Black Card</strong><p class="signup-note">สนใจเส้นทาง Private? ดูรายละเอียดและส่งคำขอผ่านระบบสมาชิก</p><a class="private-link" href="/sigil/member/membership?source=line&amp;intent=signup">ดู Private Membership</a></div>
    <p class="signup-footer">สิทธิสมาชิกเริ่มหลังระบบตรวจสอบการชำระเงินอย่างเป็นทางการ · ติดตามสถานะได้ที่ MY MMD</p>
  </section>
  <nav class="member-nav" aria-label="Member sections">
    <button type="button" data-view="home" aria-current="true" data-copy="navHome">👤 HOME</button>
    <button type="button" data-view="points" aria-current="false" data-copy="navPoints">Points</button>
    <button type="button" data-view="credits" aria-current="false" data-copy="navCredits">💳 CREDIT</button>
    <button type="button" data-view="package" aria-current="false" data-copy="navPackage">📦 PACKAGE</button>
    <button type="button" data-view="jobs" aria-current="false" data-copy="navJobs">💼 JOBS</button>
    <button type="button" data-view="history" aria-current="false" data-copy="navHistory">🧾 HISTORY</button>
    <button type="button" data-view="care" aria-current="false" data-copy="navCare">🎁 CARE</button>
    <button type="button" data-view="coupons" aria-current="false" data-copy="navCoupons">🎟 COUPONS</button>
    <button type="button" data-view="my-requests" aria-current="false">✦ MY REQUESTS</button>
  </nav>
  <section id="profile" class="profile hidden" aria-label="Member profile">
    <div class="section-rail">
    <section id="home" class="panel digital-home" aria-label="Home" data-active="true">
    <header class="digital-top"><div class="digital-brand">MMD PRIVÉ<small>MY MMD · MEMBER APP</small></div><span class="digital-session" id="digital-session">● LINE VERIFIED</span></header>
    <section class="digital-hello"><p class="digital-eyebrow">YOUR PRIVATE SPACE</p><h1 id="digital-greeting">MY MMD</h1><p class="digital-sub">เรื่องที่ต้องรู้ เรื่องที่ต้องทำ และอัปเดตจาก MMD ในที่เดียว</p></section>
    <section class="digital-snapshot" aria-label="Verified member snapshot"><span class="digital-snapshot-icon">◇</span><div><strong id="profile-tier">Member</strong><p id="profile-status">กำลังตรวจสอบสถานะ</p></div><strong id="profile-points" class="digital-points">—</strong></section>
    <section id="digital-companion" class="digital-design-slot" aria-label="Your Companion" hidden><span class="digital-eyebrow">FOR YOU · YOUR COMPANION</span><strong id="digital-companion-name"></strong><p id="digital-companion-note"></p></section>
    <div class="digital-needs" id="digital-needs" hidden><div><b>NEEDS YOU</b><span id="digital-needs-label"></span></div><button id="digital-needs-action" type="button">ดูขั้นตอน ↗</button></div>
    <section aria-labelledby="digital-news-title"><div class="digital-sectionline"><h2 id="digital-news-title"><small>PRIVATE FEED</small>MMD NOW</h2><span class="digital-unread" id="digital-unread" hidden></span></div><div class="digital-news-feed" id="digital-news-feed"><div class="digital-quiet">กำลังตรวจสอบอัปเดตล่าสุด</div></div></section>
    <section id="digital-tmib-story" class="digital-design-slot" aria-label="TMIB Story" hidden><span class="digital-eyebrow">TMIB STORY</span><strong id="digital-tmib-story-title"></strong><p id="digital-tmib-story-note"></p></section>
    <section class="digital-quick" aria-label="Quick access"><div class="digital-sectionline"><h2 style="font-size:12px;letter-spacing:.1em">QUICK ACCESS</h2><span style="font-size:9px;color:var(--digital-muted)">MY MMD</span></div><div class="digital-quick-grid"><button type="button" data-view="package"><i>◇</i>Member</button><button type="button" data-view="points"><i>✦</i>Points</button><button type="button" data-view="credits"><i>▤</i>Wallet</button><button type="button" data-view="coupons"><i>▣</i>Coupons</button></div></section>
    <section class="digital-kenji" aria-label="Kenji AI"><div class="digital-orb" aria-hidden="true"><span class="digital-core"></span></div><div><strong>Kenji AI</strong><p>ช่วยหาข้อมูลและพาไปขั้นตอนที่เกี่ยวข้อง โดยยึดข้อมูลที่ระบบยืนยันแล้ว</p><a href="/member/kenji-ai-20">เปิด Kenji ↗</a></div></section>
    <div class="digital-data-cache" aria-hidden="true">
      <strong id="profile-name">สมาชิก MMD</strong><span id="profile-email">—</span><span id="profile-phone">—</span>
      <div id="member-details" class="detail-grid hidden"><div id="expiry-card" class="card hidden"><strong id="profile-expiry">—</strong></div><div id="payment-card" class="card hidden"><strong id="profile-payment">—</strong></div></div>
      <div id="points-card"></div><strong id="home-package">—</strong><p id="home-package-note"></p><div id="next-job"></div><div id="history"></div>
    </div>
    </section>
    <section id="points" class="panel digital-view" aria-label="Points">
      <div class="card"><h2 data-copy="pointsTitle">⭐ Points</h2><strong id="points-total" class="value points">—</strong><p id="points-rate" class="sub"></p><p id="points-expiry" class="sub"></p></div>
      <div class="card"><span id="service-spend-label" class="label">Service spend</span><div class="detail-grid"><div><span id="lifetime-spend-label" class="label">Lifetime</span><strong id="points-lifetime-spend" class="value">—</strong></div><div><span id="spend-365-label" class="label">Last 365 days</span><strong id="points-365-spend" class="value">—</strong></div></div></div>
      <div class="card"><span class="label" data-copy="pointsHistoryLabel">Points history</span><div id="points-history" class="history"></div></div>
    </section>
    <section id="credits" class="panel digital-view" aria-label="Service Credit Wallet">
      <div class="card"><span class="label" data-copy="creditWalletLabel">MY MMD CREDIT</span><h2 data-copy="creditWalletTitle">💳 เครดิตบริการของฉัน</h2><p id="credit-wallet-message" class="sub" data-copy="creditChecking">กำลังตรวจสอบเครดิตบริการของคุณครับ</p>
        <div class="detail-grid"><div><span class="label" data-copy="creditAvailableLabel">ใช้ได้</span><strong id="credit-available" class="value">—</strong></div><div><span class="label" data-copy="creditReservedLabel">จองไว้</span><strong id="credit-reserved" class="value">—</strong></div><div><span class="label" data-copy="creditUsedLabel">ใช้แล้ว</span><strong id="credit-used" class="value">—</strong></div></div>
      </div>
      <div class="card"><span class="label" data-copy="creditRecentLabel">รายการล่าสุด</span><div id="credit-wallet" class="history"><p class="empty" data-copy="creditChecking">กำลังตรวจสอบเครดิตบริการของคุณครับ</p></div></div>
    </section>
    <section id="package" class="panel digital-view" aria-label="Package">
      <div class="card"><h2 data-copy="packageTitle">📦 Package</h2><div id="current-package" class="stack"></div></div>
      <details class="card details"><summary data-copy="packageHistoryLabel">Package history</summary><div id="package-history" class="stack"></div></details>
    </section>
    <section id="jobs" class="panel digital-view" aria-label="Jobs">
      <div class="card"><h2 data-copy="jobsTitle">💼 Jobs</h2><div id="jobs-groups" class="stack"></div></div>
      <details class="card details"><summary data-copy="requestsLabel">Recent requests</summary><div id="requests" class="stack"></div></details>
      <details class="card details"><summary data-copy="mmsLabel">MMS prebookings</summary><div id="mms" class="stack"></div></details>
    </section>
    <section id="history-panel" class="panel digital-view" aria-label="History">
      <div class="card"><h2 data-copy="historyTitle">🧾 History</h2><p id="history-window" class="sub"></p><div id="v2-history" class="history"></div></div>
      <details class="card details"><summary data-copy="paymentHistoryLabel">Payment history</summary><div id="payment-history" class="stack"></div></details>
    </section>
    <section id="care" class="panel digital-care" aria-label="Care"><div class="card care">
      <span class="label" data-copy="careLabel">6 Years · Care Back</span><h2 data-copy="careTitle">Personal Care-Back Privilege</h2>
      <p id="care-message">ตรวจสอบผ่าน LINE เพื่อเปิดสิทธิ์ CARE BACK ก่อน คูปองส่วนตัวจะเปิดหลังส่งคำอวยพรถึง MMD สำเร็จครับ</p>
      <div id="care-benefits" class="benefit-grid hidden" aria-label="Personalized benefits"></div>
      <div id="care-code" class="care-code hidden"><span class="label">Personal Code</span><strong id="care-code-value"></strong></div>
      <button id="care-button" type="button">ตรวจสิทธิ์ CARE BACK</button>
      <div id="wish" class="wish hidden">
        <label for="wish-text" class="label">Birthday Wish</label>
        <textarea id="wish-text" maxlength="600" placeholder="ฝากคำอวยพรวันเกิดให้ MMD ได้ที่นี่ครับ"></textarea>
        <button id="wish-submit" type="button">ส่งคำอวยพรให้ MMD</button>
        <div id="wish-result" class="wish-result hidden" role="status" aria-live="polite"></div>
      </div>
    </div></section>
    <section id="coupons" class="panel digital-view" aria-label="Coupon Wallet"><div class="card">
      <span class="label" data-copy="couponWalletLabel">MY MMD</span><h2 data-copy="couponWalletTitle">🎟 คูปองของฉัน</h2>
      <div id="coupon-wallet" class="stack"><p class="empty" data-copy="couponWalletEmpty">ยังไม่มีคูปองที่ออกให้กับบัญชีนี้ครับ</p></div>
    </div></section>
    <section id="my-requests" class="panel digital-requests" aria-label="My requests">
      <details class="card details digital-request-block">
        <summary><span><small>MY DETAILS</small><strong>ข้อมูลที่อยากให้ MMD ใช้ดูแลคุณ</strong></span></summary>
        <div class="digital-request-body"><p class="form-note">ข้อมูลนี้ส่งให้ทีม MMD ตรวจสอบก่อนอัปเดต จึงไม่เปลี่ยนประวัติที่ยืนยันแล้วเอง</p>
          <form id="customer-profile-form" class="form-stack"><label>อีเมล<input id="customer-email" type="email" maxlength="160" autocomplete="email"></label><label>เบอร์โทรศัพท์<input id="customer-phone" type="tel" maxlength="40" autocomplete="tel"></label><label>Telegram<input id="customer-telegram" type="text" maxlength="65" autocomplete="off" placeholder="username ไม่ต้องใส่ @"></label><label>ความชอบ / สเป็ก / สิ่งที่อยากให้ทีมรู้<textarea id="customer-preferences" maxlength="1200"></textarea></label><button type="submit">ส่งข้อมูลให้ MMD ตรวจสอบ</button></form>
        </div>
      </details>
      <details class="card details digital-request-block">
        <summary><span><small>YOUR REQUEST</small><strong>อยากให้ MMD ตามหาใคร</strong></span></summary>
        <div class="digital-request-body"><p class="form-note">อัปโหลดรูปที่คุณมีได้สูงสุด 3 รูป (JPG, PNG หรือ WebP) เพื่อให้ทีมตามหาเป็นการภายใน รูปจะไม่ขึ้นหน้า Public หรือโปรไฟล์โมเดลโดยอัตโนมัติ</p>
          <form id="your-request-form" class="form-stack"><label>ชื่อนายแบบ<input id="requested-model-name" type="text" maxlength="120" required></label><label>ลิงก์โซเชียล (ได้สูงสุด 3 ลิงก์)<textarea id="requested-model-social" maxlength="500" placeholder="https://..."></textarea></label><label>สนใจงานแบบไหน<select id="requested-model-audience"><option value="public">งานทั่วไป (Public)</option><option value="private">งาน Private</option></select></label><label>ทำไมอยากให้ MMD ตามหา<textarea id="requested-model-reason" maxlength="1800" required></textarea></label><label>รูปอ้างอิง (ไม่บังคับ)<input id="requested-model-evidence" type="file" accept="image/jpeg,image/png,image/webp" multiple></label><button type="submit">ส่ง Your Request</button></form>
          <div id="your-request-status" class="form-note" role="status" aria-live="polite"></div>
        </div>
      </details>
      <div class="card"><span class="label">REQUEST STATUS</span><div id="customer-request-list" class="history"><p class="empty">กำลังตรวจสอบคำขอของคุณ</p></div></div>
      <div class="card"><span class="label">SAVED MODELS</span><div id="saved-model-list" class="history"><p class="empty">ยังไม่มีนายแบบที่บันทึกไว้</p></div></div>
    </section>
    </div>
  </section>
  <nav class="digital-dock" aria-label="เมนู MY MMD"><button type="button" data-view="home" aria-current="page"><i>⌂</i>HOME</button><button type="button" data-view="history" aria-current="false"><i>▤</i>HISTORY</button><button type="button" data-view="credits" aria-current="false"><i>◈</i>WALLET</button><a href="/member/kenji-ai-20"><i>✦</i>KENJI</a></nav>
  <div id="status" class="status">MY MMD</div>
</main>
<script src="${LIFF_SDK_URL}"></script>
<script nonce="${nonce}">
(() => {
  "use strict";
  const CONFIG = ${safeConfig};
  const CANONICAL_POINTS_PATH = "/my-mmd/points";
  const message = document.getElementById("message");
  const appStatus = document.getElementById("app-status");
  const introContinue = document.getElementById("intro-continue");
  const actions = document.getElementById("actions");
  const signupLineEntry = document.getElementById("signup-line-entry");
  const profile = document.getElementById("profile");
  const signup = document.getElementById("signup");
  const signupPackages = document.getElementById("signup-packages");
  const careButton = document.getElementById("care-button");
  const wishPanel = document.getElementById("wish");
  const wishText = document.getElementById("wish-text");
  const wishSubmit = document.getElementById("wish-submit");
  const wishResult = document.getElementById("wish-result");
  const customerProfileForm = document.getElementById("customer-profile-form");
  const yourRequestForm = document.getElementById("your-request-form");
  const yourRequestStatus = document.getElementById("your-request-status");
  const locale = CONFIG.language || "th";
  const copy = {
    th: { mark:"MMD Privé · MY MMD", title:"My MMD", subtitle:"พื้นที่สมาชิกแบบดิจิทัลใน LINE ของ MMD", navProfile:"ภาพรวม", navHome:"👤 HOME", navPoints:"⭐ POINTS", navCredits:"💳 CREDIT", navPackage:"📦 PACKAGE", navJobs:"💼 JOBS", navHistory:"🧾 HISTORY", navCare:"🎁 CARE", memberLabel:"สวัสดีครับ", contactLabel:"ข้อมูลติดต่อ", emailLabel:"อีเมล", phoneLabel:"เบอร์โทร", tierLabel:"ระดับสมาชิก", pointsLabel:"คะแนนที่ใช้งานได้", expiryLabel:"สมาชิกใช้ได้ถึง", paymentLabel:"สถานะการชำระ", historyLabel:"History · Last 1 Year", pointsTitle:"⭐ Points", pointsHistoryLabel:"รายการคะแนน", creditWalletLabel:"MY MMD CREDIT", creditWalletTitle:"💳 เครดิตบริการของฉัน", creditChecking:"กำลังตรวจสอบเครดิตบริการของคุณครับ", creditAvailableLabel:"ใช้ได้", creditReservedLabel:"จองไว้", creditUsedLabel:"ใช้แล้ว", creditRecentLabel:"รายการล่าสุด", creditEmpty:"ยังไม่มีเครดิตบริการที่ยืนยันแล้วสำหรับบัญชีนี้ครับ", creditVerified:"แสดงเฉพาะเครดิตที่ยืนยันแล้ว", creditExpiry:"ใช้ได้ถึง", packageTitle:"📦 Package", packageHistoryLabel:"ประวัติแพ็กเกจ", jobsTitle:"💼 Jobs", requestsLabel:"คำขอล่าสุด", mmsLabel:"MMS prebookings", historyTitle:"🧾 History", paymentHistoryLabel:"ประวัติการชำระ", careLabel:"6 Years · Care Back", careTitle:"Personal Care-Back Privilege", careIntro:"ผมจะช่วยตรวจสอบสิทธิ์ CARE BACK ให้ก่อนครับ คูปองส่วนตัวจะเปิดหลังส่งคำอวยพรถึง MMD สำเร็จ", careButton:"ตรวจสิทธิ์ CARE BACK", wishPlaceholder:"ฝากคำอวยพรวันเกิดให้ MMD ได้ที่นี่ครับ", wishSubmit:"ส่งคำอวยพรให้ MMD", ready:"ผมเตรียมข้อมูลที่ยืนยันได้ของคุณไว้แล้วครับ", checking:"ผมกำลังตรวจสอบข้อมูลของคุณครับ", checkingPoints:"กำลังตรวจสอบคะแนนของคุณครับ", pointsRate:"ทุก 100 บาท = 1 คะแนน", expiring:"คะแนนใกล้หมดอายุ", empty:"ยังไม่มีรายการที่ยืนยันได้ในช่วงนี้ครับ", careLoading:"กำลังตรวจสอบสิทธิ์", careRetry:"ลองตรวจสอบอีกครั้ง", wishEmpty:"กรุณาเขียนคำอวยพรก่อนส่งครับ", wishSaving:"กำลังเก็บคำอวยพร", wishError:"ตอนนี้ยังเก็บคำอวยพรไม่ได้ครับ กรุณาลองใหม่อีกครั้ง", wishRetry:"ลองส่งอีกครั้ง", careChecked:"สิทธิ์ CARE BACK ของคุณถูกตรวจแล้ว ส่งคำอวยพรถึง MMD สำเร็จเพื่อเปิดคูปองส่วนตัว 10% ครับ", wishDone:"MMD ได้รับคำอวยพรของคุณแล้วครับ", wishPending:"ระบบกำลังยืนยันการบันทึกคำอวยพรเดิมอย่างปลอดภัย กรุณากลับมาตรวจสอบอีกครั้งครับ", wishReview:"ข้อมูลนี้ยังต้องตรวจสอบก่อนครับ ผมจะเก็บเส้นทางของคุณไว้อย่างปลอดภัย", couponReady:"ส่งคำอวยพรเพื่อเปิดคูปอง", claimMessage:"ผมจะอัปเดตสิทธิ์ตามสถานะสมาชิกและการยืนยันที่เกี่ยวข้องครับ", careCheckedButton:"ตรวจสิทธิ์ CARE BACK แล้ว", careResumedButton:"อัปเดตสิทธิ์ CARE BACK แล้ว", promoLoading:"กำลังตรวจสอบสิทธิ์ CARE BACK อย่างปลอดภัยครับ" },
    en: { mark:"MMD Privé · MY MMD", title:"My MMD", subtitle:"Your digital member space inside LINE.", navProfile:"Overview", navHome:"👤 HOME", navPoints:"⭐ POINTS", navPackage:"📦 PACKAGE", navJobs:"💼 JOBS", navHistory:"🧾 HISTORY", navCare:"🎁 CARE", memberLabel:"Member", contactLabel:"Contact", emailLabel:"Email", phoneLabel:"Phone", tierLabel:"Member tier", pointsLabel:"Active points", expiryLabel:"Membership valid until", paymentLabel:"Payment status", historyLabel:"History · Last 1 Year", pointsTitle:"⭐ Points", pointsHistoryLabel:"Points history", packageTitle:"📦 Package", packageHistoryLabel:"Package history", jobsTitle:"💼 Jobs", requestsLabel:"Recent requests", mmsLabel:"MMS prebookings", historyTitle:"🧾 History", paymentHistoryLabel:"Payment history", careLabel:"6 Years · Care Back", careTitle:"Personal Care-Back Privilege", careIntro:"We will check CARE BACK first. Your personal coupon becomes available after your wish is submitted successfully.", careButton:"Check CARE BACK", wishPlaceholder:"Leave a birthday wish for MMD here.", wishSubmit:"Send wish to MMD", ready:"Your confirmed information is ready.", checking:"We are checking your information.", checkingPoints:"Your points are being checked.", pointsRate:"Every THB 100 = 1 point", expiring:"Points expiring soon", empty:"No confirmed activity is available here yet.", careLoading:"Checking eligibility", careRetry:"Try checking again", wishEmpty:"Please write a wish before sending.", wishSaving:"Saving your wish", wishError:"Your wish could not be saved. Please try again.", wishRetry:"Try sending again", careChecked:"Your CARE BACK eligibility is checked. Submit a wish to unlock your personal 10% coupon.", wishDone:"MMD has received your wish.", wishPending:"We are securely confirming your previous wish. Please check again later.", wishReview:"This request needs further review. We have kept your route secure.", couponReady:"Send a wish to unlock the coupon", claimMessage:"MMD will update your privilege after the required membership and verification checks.", careCheckedButton:"CARE BACK checked", careResumedButton:"CARE BACK updated", promoLoading:"Checking your CARE BACK eligibility securely" },
    zh: { mark:"MMD Privé · MY MMD", title:"我的 MMD", subtitle:"在 LINE 内使用您的数字会员空间。", navProfile:"概览", navHome:"👤 HOME", navPoints:"⭐ POINTS", navPackage:"📦 PACKAGE", navJobs:"💼 JOBS", navHistory:"🧾 HISTORY", navCare:"🎁 CARE", memberLabel:"会员", contactLabel:"联系方式", emailLabel:"邮箱", phoneLabel:"电话", tierLabel:"会员等级", pointsLabel:"可用积分", expiryLabel:"会员有效期至", paymentLabel:"付款状态", historyLabel:"最近一年记录", pointsTitle:"⭐ 积分", pointsHistoryLabel:"积分记录", packageTitle:"📦 套餐", packageHistoryLabel:"套餐历史", jobsTitle:"💼 服务", requestsLabel:"最近请求", mmsLabel:"MMS 预订", historyTitle:"🧾 记录", paymentHistoryLabel:"付款记录", careLabel:"6 Years · Care Back", careTitle:"专属 Care Back 礼遇", careIntro:"请先检查 CARE BACK。成功提交祝福后，您的专属优惠券将会开启。", careButton:"检查 CARE BACK", wishPlaceholder:"在这里留下给 MMD 的生日祝福。", wishSubmit:"向 MMD 发送祝福", ready:"您的已确认信息已准备好。", checking:"正在检查您的信息。", checkingPoints:"正在检查您的积分。", pointsRate:"每 THB 100 = 1 积分", expiring:"即将到期的积分", empty:"目前没有可显示的已确认记录。", careLoading:"正在检查资格", careRetry:"再次检查", wishEmpty:"请先写下祝福再发送。", wishSaving:"正在保存祝福", wishError:"祝福暂时无法保存，请稍后再试。", wishRetry:"再次发送", careChecked:"您的 CARE BACK 资格已检查。成功提交祝福后即可开启专属 10% 优惠券。", wishDone:"MMD 已收到您的祝福。", wishPending:"系统正在安全确认您之前提交的祝福，请稍后再查看。", wishReview:"此请求仍需进一步审核，我们已安全保留您的流程。", couponReady:"发送祝福以开启优惠券", claimMessage:"MMD 将在完成会员与验证检查后更新您的礼遇。", careCheckedButton:"CARE BACK 已检查", careResumedButton:"CARE BACK 已更新", promoLoading:"正在安全检查 CARE BACK 资格" },
  }[locale] || {};
  Object.assign(copy, ({
    th:{navCoupons:"🎟 COUPONS",couponWalletLabel:"MY MMD",couponWalletTitle:"🎟 คูปองของฉัน",couponWalletEmpty:"ยังไม่มีคูปองที่ออกให้กับบัญชีนี้ครับ",pointsLabel:"คะแนนที่ใช้งานได้",pointsNoExpiry:"Points มีอายุ 365 วัน · หมดอายุเป็นราย lot จากวันที่เข้าระบบ",serviceSpendLabel:"ยอดใช้บริการที่ยืนยันแล้ว",lifetimeSpendLabel:"ยอดสะสมทั้งหมด",spend365Label:"ย้อนหลัง 365 วัน"},
    en:{navCoupons:"🎟 COUPONS",couponWalletLabel:"MY MMD",couponWalletTitle:"🎟 My coupons",couponWalletEmpty:"No coupon has been issued to this account yet.",navCredits:"💳 CREDIT",creditWalletLabel:"MY MMD CREDIT",creditWalletTitle:"💳 My service credit",creditChecking:"Checking your service credit.",creditAvailableLabel:"Available",creditReservedLabel:"Reserved",creditUsedLabel:"Used",creditRecentLabel:"Recent activity",creditEmpty:"No verified service credit is available for this account.",creditVerified:"Only verified credit is shown.",creditExpiry:"Valid until",pointsLabel:"Active points",pointsNoExpiry:"Points expire 365 days per lot from entry",serviceSpendLabel:"Verified service spend",lifetimeSpendLabel:"Lifetime",spend365Label:"Last 365 days"},
    zh:{navCoupons:"🎟 COUPONS",couponWalletLabel:"MY MMD",couponWalletTitle:"🎟 我的优惠券",couponWalletEmpty:"此账户暂未获发优惠券。",navCredits:"💳 CREDIT",creditWalletLabel:"MY MMD CREDIT",creditWalletTitle:"💳 我的服务额度",creditChecking:"正在核实您的服务额度。",creditAvailableLabel:"可用",creditReservedLabel:"已预留",creditUsedLabel:"已使用",creditRecentLabel:"最近记录",creditEmpty:"此账户暂无已验证的服务额度。",creditVerified:"仅显示已验证额度。",creditExpiry:"有效期至",pointsLabel:"可用积分",pointsNoExpiry:"积分按每批入账日起 365 天到期",serviceSpendLabel:"已确认服务消费",lifetimeSpendLabel:"累计",spend365Label:"最近 365 天"},
  })[locale] || {});
  const allowedIntentIds = new Set(["signup", "renew", "status"]);
  let busy = false;
  let digitalPersonalizedFeed = [];

  document.documentElement.lang = locale === "zh" ? "zh-CN" : locale;
  const resolveTrustedWelcomeWorldInBrowser = (${resolveTrustedWelcomeWorld.toString()});
  const WELCOME_COPY = {
    new: { title: "ยินดีที่ได้รู้จัก", subtitle: "MY MMD · แอปที่ออกแบบจากประสบการณ์จริงของเปอร์", note: "", letter: "ยินดีที่ได้รู้จัก\\n\\nMY MMD คือ APP ที่เปอร์สร้างขึ้นจากประสบการณ์การทำงานที่ผ่านมา และจากสิ่งที่เปอร์ค้นพบว่า ในยุคที่กำลังย่างเข้าสู่ปี 2027 โลกไปไกลมากแล้ว การมีระบบดูแลที่ดีจึงเป็นสิ่งที่ปลอดภัยที่สุด\\n\\nการใช้งานของคุณจะสะดวกขึ้น ค้นหาได้ง่ายขึ้น ตอบโจทย์ขึ้น และได้รับความสุขมากขึ้น\\n\\nที่นี่คุณสามารถใช้ค้นหา รับข่าวสาร รวมถึงบริการจองและจ่ายเงิน แล้วออกไปมีความสุขโดยไม่ต้องพะวงว่าจะมีเหตุการณ์เซอร์ไพรส์ ด้วยระบบ ETA นับถอยหลังนายแบบ การบรีฟงานที่เป็นลายลักษณ์อักษรอย่างชัดเจน รวมถึงรูปที่อัปเดตที่สุดจากน้อง ๆ เช่นกัน\\n\\nขอให้มีความสุข\\nเปอร์" },
    existing: { title: "ฮายยย เปอร์เองครับ เปอร์กลับมาแว้วว", subtitle: "MY MMD · ขอบคุณที่ยังอยู่และยังรอ", note: "กด Verify เพื่อรับสิทธิ์ต่ออายุสมาชิก 1 ปี ทั้งสมาชิกปัจจุบันและสมาชิกที่หมดอายุแล้ว เมื่อสมัครหรือต่ออายุอีกครั้ง ระบบจะรวมสิทธิ์ให้เป็น 2 ปี", letter: "ฮายยย เปอร์เองครับ เปอร์กลับมาแว้วว\\n\\nเปอร์หายไปนานจริง ๆ\\n(จริง ๆ ไม่นานหรอก…นานมากกก!!)\\n\\nถึงจะยังเห็นอัปเดตกันอยู่เรื่อย ๆ แต่เมื่อก่อนเปอร์อัปเดตถี่กว่านี้มาก\\n\\nเปอร์ไม่ได้หายไปติดผู้ชายนะครับ 5555\\nแต่ใช้เวลาปีกว่า ๆ ศึกษา เรียนรู้ และสร้างแอปกับระบบนี้ขึ้นมาจากที่ทำไม่เป็นเลย\\n\\nจริงๆแล้วเราจะทำงานกันแบบเดิมก็ได้ ที่ต้องมานั่งจ้องมือถือกัน\\nเมื่อไหร่จะจองสักทีวะ เมื่อไหร่จะตอบสักที\\n(อุ๊ย! ขออภัยที่คิดดัง) เมื่อไหร่จะตอบซักที ถามไป หายไม่มีคนตอบ\\nมีใครสะดวกบ้างก็ไม่รุ้ แล้วรำคาญกันไหม AI เปอร์ก็รำคาญนะ 555\\n\\nแต่เปอร์เลือกลงทุนเกือบสองแสนบาท และทำทุกอย่างด้วยตัวเอง\\nเพื่อให้ทุกคนค้นหา จอง จ่าย และติดตามงานกับ MMD ได้สะดวกและปลอดภัยขึ้น\\n\\nมันอาจยังไม่สมบูรณ์ทั้งหมดในวันนี้\\nแต่ทุกอย่างที่ทำ เปอร์ตั้งใจทำเพื่อพวกคุณจริง ๆ\\n\\nขอบคุณที่ยังอยู่\\nขอบคุณที่ยังรอ\\n\\nเปอร์เองครับ" },
  };
  function detectWorld(data, authority) {
    return resolveTrustedWelcomeWorldInBrowser(data, authority);
  }
  function resolveWelcomeAudience(data, authority) {
    return authority === "canonical_member_profile" && data?.audience === "existing" ? "existing" : "new";
  }
  function applyWorldTheme(data, authority = "", audienceAuthority = "") {
    const world = detectWorld(data, authority);
    const audience = resolveWelcomeAudience(data, audienceAuthority);
    const welcomeCopy = WELCOME_COPY[audience];
    document.body.classList.toggle("world-public", world === "public");
    document.body.classList.toggle("world-private", world === "private");
    document.body.dataset.world = world;
    document.body.dataset.welcomeAudience = audience;
    document.querySelector(".mark").textContent = "MMD PRIVÉ · MY MMD";
    document.querySelector(".title").textContent = welcomeCopy.title;
    document.querySelector(".sub").textContent = welcomeCopy.subtitle;
    message.textContent = welcomeCopy.note;
    message.classList.toggle("hidden", !welcomeCopy.note);
    document.getElementById("per-letter-copy").textContent = welcomeCopy.letter;
    if (introContinue) introContinue.textContent = "ENTER →";
  }
  applyWorldTheme();
  let welcomeContextPromise;
  async function resolveInitialWelcomeContext() {
     try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      let response;
      try {
        response = await fetch(CONFIG.welcomeContextEndpoint, { method: "GET", credentials: "same-origin", redirect: "error", headers: { accept: "application/json" }, signal: controller.signal });
      } finally { clearTimeout(timeout); }
      const payload = await response.json().catch(() => null);
      if (response.ok && payload?.ok === true) applyWorldTheme(payload.data || {}, response.headers.get("x-mmd-member-display-authority") || "", response.headers.get("x-mmd-welcome-audience-authority") || "");
    } catch {
      // Missing, stale, ambiguous, or unavailable identity evidence remains Public.
    } finally {
      document.body.classList.remove("context-resolving");
      introContinue.disabled = false;
    }
  }
  let appEntered = false;
  async function enterApp() {
    if (appEntered || !introContinue || introContinue.disabled) return;
    await welcomeContextPromise;
    introContinue.disabled = true;
    try {
      const existingProfile = await readProfile();
      if (existingProfile) {
        appEntered = true;
        document.body.classList.add("app-entered");
        introContinue.setAttribute("aria-expanded", "true");
        await readSignupCatalog();
        return;
      }
    } catch {
      // Continue into the normal LINE handshake; the visible app status remains available.
    }
    appEntered = true;
    document.body.classList.add("app-entered");
    introContinue.setAttribute("aria-expanded", "true");
    boot();
  }
  introContinue?.addEventListener("click", enterApp);
  for (const element of document.querySelectorAll("[data-copy]")) {
    const key = element.getAttribute("data-copy");
    if (copy[key]) element.textContent = copy[key];
  }
  applyWorldTheme();
  welcomeContextPromise = resolveInitialWelcomeContext();
  document.getElementById("care-message").textContent = copy.careIntro || document.getElementById("care-message").textContent;
  document.getElementById("service-spend-label").textContent = copy.serviceSpendLabel || "Service spend";
  document.getElementById("lifetime-spend-label").textContent = copy.lifetimeSpendLabel || "Lifetime";
  document.getElementById("spend-365-label").textContent = copy.spend365Label || "Last 365 days";
  careButton.textContent = copy.careButton || careButton.textContent;
  wishText.placeholder = copy.wishPlaceholder || wishText.placeholder;
  wishSubmit.textContent = copy.wishSubmit || wishSubmit.textContent;
  const initialView = CONFIG.view === "care" || CONFIG.intent === "promo" ? "care" : (CONFIG.view || "home");
  function showView(view, smooth = true) {
    if (view === "points") {
      window.location.assign(CANONICAL_POINTS_PATH);
      return;
    }
    const targetId = view === "history" ? "history-panel" : view;
    const target = document.getElementById(targetId) || document.getElementById("home");
    for (const panel of document.querySelectorAll(".section-rail > .panel")) panel.setAttribute("data-active", String(panel === target));
    for (const item of document.querySelectorAll("[data-view]")) {
      const active = item.getAttribute("data-view") === (target.id === "history-panel" ? "history" : target.id);
      item.setAttribute("aria-current", active ? "page" : "false");
    }
    if (smooth) window.scrollTo({ top: 0, behavior: "smooth" });
  }
  showView(initialView, false);
  for (const button of document.querySelectorAll("[data-view]")) {
    button.addEventListener("click", () => showView(button.getAttribute("data-view")));
  }

  function show(text) {
    const value = String(text || "ไม่สามารถดำเนินการต่อได้ครับ กรุณากลับมาเปิดผ่าน LINE ของ MMD อีกครั้ง");
    message.textContent = value;
    if (appStatus) appStatus.textContent = value;
  }

  function setBusy(value) {
    busy = Boolean(value);
    for (const button of actions.querySelectorAll("button")) button.disabled = busy;
    for (const button of signupPackages.querySelectorAll("button")) button.disabled = busy;
  }

  function verifiedCheckoutUrl(value) {
    try {
      const url = new URL(String(value || ""));
      const keys = [...url.searchParams.keys()];
      return url.protocol === "https:" && url.hostname === "mmdbkk.com" && url.pathname === "/pay/checkout"
        && !url.hash && keys.length === 1 && keys[0] === "t" && Boolean(url.searchParams.get("t")) ? url.href : "";
    } catch { return ""; }
  }

  async function purchasePublicMembership(packageCode) {
    if (busy) return;
    setBusy(true);
    show("กำลังเตรียมหน้าชำระเงินใน LINE ครับ");
    try {
      const response = await fetch(CONFIG.publicPurchaseEndpoint, {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json", "accept": "application/json" },
        body: JSON.stringify({ package_code: packageCode }),
      });
      const payload = await response.json().catch(() => null);
      if (response.status === 401) { show("กรุณาเปิดหน้าสมัครผ่าน Rich Menu ใน LINE อีกครั้งเพื่อยืนยันตัวตนครับ"); return; }
      const url = response.ok && payload?.ok === true && payload?.official_verification_required === true
        && payload?.entitlement_granted === false ? verifiedCheckoutUrl(payload.customer_payment_url) : "";
      if (!url) { show("ตอนนี้ยังเปิดหน้าชำระเงินไม่ได้ครับ กรุณาลองอีกครั้ง"); return; }
      window.location.assign(url);
    } catch { show("ตอนนี้ยังเปิดหน้าชำระเงินไม่ได้ครับ กรุณาลองอีกครั้ง"); }
    finally { setBusy(false); }
  }

  async function readSignupCatalog() {
    if (CONFIG.intent !== "signup") return;
    signup.classList.remove("hidden");
    signupPackages.replaceChildren();
    try {
      const response = await fetch(CONFIG.publicCatalogEndpoint, { method:"GET", credentials:"same-origin", headers:{"accept":"application/json"} });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true || !Array.isArray(payload.packages)) throw new Error("catalog_unavailable");
      const packages = payload.packages.filter((item) =>
        ["mmd_member", "elite", "red_card"].includes(item?.package_code)
        && Number.isInteger(item.amount_thb) && item.amount_thb > 0
        && Number.isInteger(item.duration_days) && item.duration_days > 0
      );
      if (packages.length !== 3) throw new Error("catalog_incomplete");
      for (const item of packages) {
        const card = document.createElement("div"); card.className = "card signup-package signup-package-" + item.package_code;
        const top = document.createElement("div"); top.className = "signup-package-top";
        const title = document.createElement("strong"); title.textContent = String(item.label || item.package_code);
        const tag = document.createElement("span"); tag.textContent = item.package_code === "mmd_member" ? "MEMBER" : item.package_code === "elite" ? "ELITE" : "RED CARD";
        top.append(title, tag);
        const price = document.createElement("div"); price.className = "signup-price";
        const amount = document.createElement("span"); amount.className = "value"; amount.textContent = new Intl.NumberFormat(locale === "th" ? "th-TH" : "en-US").format(item.amount_thb);
        const currency = document.createElement("small"); currency.textContent = "THB"; price.append(amount, currency);
        const period = document.createElement("p"); period.className = "signup-period";
        const term = item.duration_days === 365 ? 1 : item.duration_days === 730 ? 2 : null;
        period.textContent = term ? (locale === "th" ? "ระยะสมาชิก " + term + " ปี" : term + (term === 1 ? " year" : " years")) : (locale === "th" ? "ระยะเวลา " + item.duration_days + " วัน" : item.duration_days + " days");
        const button = document.createElement("button"); button.type = "button"; button.textContent = locale === "th" ? "เลือกแพ็กเกจนี้  →" : "Choose this package  →";
        button.addEventListener("click", () => purchasePublicMembership(item.package_code));
        card.append(top, price, period, button); signupPackages.append(card);
      }
      show(locale === "th" ? "เลือกแพ็กเกจและสมัครสมาชิกด้วยบัญชี LINE นี้ได้เลยครับ" : "Choose a package to continue with this LINE account.");
    } catch { show("ตอนนี้ยังแสดงแพ็กเกจไม่ได้ครับ กรุณาลองเปิดใหม่อีกครั้ง"); }
  }

  function isDiagnosticMode() {
    try { return new URLSearchParams(window.location.search).get("debug") === "1"; }
    catch { return false; }
  }

  function safeDiagnosticCode(value) {
    const code = String(value || "UNKNOWN_ERROR").trim().toUpperCase();
    return /^[A-Z0-9_]{2,80}$/.test(code) ? code : "UNKNOWN_ERROR";
  }

  function showTemporaryError(ref) {
    let message = "ตอนนี้ระบบตรวจสอบข้อมูลชั่วคราวยังไม่พร้อมครับ กรุณาลองใหม่อีกครั้ง";
    if (isDiagnosticMode() && ref) message += "\\nRef: " + ref;
    show(message);
  }

  async function call(endpoint, body) {
    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", "accept": "application/json" },
        body: JSON.stringify(body || {}),
      });
    } catch {
      showTemporaryError("CLIENT_FETCH_FAILED");
      return null;
    }
    const payload = await response.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      showTemporaryError("HTTP " + response.status + " · INVALID_RESPONSE");
      return null;
    }
    if (!response.ok || payload.ok !== true) {
      if (payload.data) render(payload.data);
      else showTemporaryError("HTTP " + response.status + " · " + safeDiagnosticCode(payload?.error?.code));
      return null;
    }
    render(payload.data || {});
    return payload.data || {};
  }

  function normalizeCanonicalHistory(payload) {
    const rows = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.items) ? payload.items : [];
    const state = Array.isArray(payload)
      ? "resolved"
      : String(payload?.state || (rows.length ? "resolved" : "checking")).trim().toLowerCase();
    return {
      state: state === "resolved" ? "resolved" : "checking",
      items: rows.slice(0, 100).map((item) => ({
        date: item?.occurredAt || item?.occurred_at || item?.date || null,
        title: String(item?.title || "MMD").slice(0, 160),
        status: item?.statusLabel || item?.status_label || item?.state || "verified",
        type: item?.kind || item?.type || "service",
        detail: item?.detail || null,
      })),
    };
  }

  function renderCanonicalHistory(payload, recoveryState = "") {
    const historyView = normalizeCanonicalHistory(payload);
    const checking = historyView.state !== "resolved";
    const home = document.getElementById("history");
    const detail = document.getElementById("v2-history");
    if (!home || !detail) return;

    home.replaceChildren();
    detail.replaceChildren();

    if (checking) {
      const review = recoveryState === "review_required"
        ? "ประวัติบางรายการอยู่ระหว่างการตรวจสอบโดย MMD"
        : (copy.checking || "กำลังตรวจสอบข้อมูลของคุณครับ");
      appendEmpty(home, review);
      appendEmpty(detail, review);
      return;
    }

    if (!historyView.items.length) {
      appendEmpty(home, copy.empty);
      appendEmpty(detail, copy.empty);
      return;
    }

    for (const item of historyView.items.slice(0, 3)) {
      home.append(eventRow(item.date, item.title, item.status, item.detail || item.type));
    }
    for (const item of historyView.items) {
      detail.append(eventRow(item.date, item.title, item.status, item.detail || item.type));
    }
  }

  async function readCanonicalHistory() {
    try {
      const response = await fetch(CONFIG.historyEndpoint, {
        method:"GET",
        credentials:"same-origin",
        cache:"no-store",
        headers:{accept:"application/json"},
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload === null) return null;

      let recoveryState = "";
      const normalized = normalizeCanonicalHistory(payload);
      if (normalized.state !== "resolved") {
        try {
          const recoveryResponse = await fetch(CONFIG.historyRecoveryEndpoint, {
            method:"GET",
            credentials:"same-origin",
            cache:"no-store",
            headers:{accept:"application/json"},
          });
          const recoveryPayload = await recoveryResponse.json().catch(() => null);
          if (recoveryResponse.ok && recoveryPayload?.ok === true) {
            recoveryState = String(recoveryPayload?.history_recovery?.state || "").trim().toLowerCase();
          }
        } catch {}
      }

      renderCanonicalHistory(payload, recoveryState);
      return payload;
    } catch {
      return null;
    }
  }

  async function readProfile() {
    const response = await fetch(CONFIG.profileEndpoint, { method: "GET", credentials: "same-origin", headers: { "accept": "application/json" } });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.ok !== true) return null;
    renderProfile(payload.data || {}, response.headers.get("x-mmd-member-display-authority") || "");
    renderCustomerContact(payload.data || {});
    await readCouponWallet();
    await readCreditWallet();
    await readCanonicalHistory();
    await readCustomerRequests();
    if (CONFIG.intent === "promo" && CONFIG.campaign === "care_back") await readCareBackState();
    return payload.data || {};
  }

  function requestId() {
    const uuid = typeof crypto?.randomUUID === "function" ? crypto.randomUUID().replace(/-/g, "") : String(Date.now()) + Math.random().toString(36).slice(2);
    return "req_" + uuid;
  }

  const customerRequestSession = (() => { try { return window.sessionStorage; } catch { return null; } })();
  const customerRequestStoragePrefix = "mmd.customer_request.pending.v1.";
  function customerRequestStorageKey(kind, token = "default") { return customerRequestStoragePrefix + kind + "." + token; }
  function pendingRequestId(kind, token = "default") {
    const key = customerRequestStorageKey(kind, token);
    const stored = customerRequestSession?.getItem(key) || "";
    if (/^req_[A-Za-z0-9_-]{12,80}$/.test(stored)) return stored;
    const next = requestId(); customerRequestSession?.setItem(key, next); return next;
  }
  function clearPendingRequest(kind, token = "default") { customerRequestSession?.removeItem(customerRequestStorageKey(kind, token)); }
  function terminalClientError(response) { return response.status >= 400 && response.status < 500 && ![408, 409, 425, 429].includes(response.status); }
  async function opaqueStorageToken(value) {
    const input = new TextEncoder().encode(String(value).slice(0, 500));
    if (crypto?.subtle) {
      const digest = await crypto.subtle.digest("SHA-256", input);
      return Array.from(new Uint8Array(digest)).slice(0, 12).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    let hash = 2166136261; for (const byte of input) { hash ^= byte; hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  async function requestJson(body) {
    const response = await fetch(CONFIG.customerRequestsEndpoint, { method:"POST", credentials:"same-origin", headers:{"content-type":"application/json",accept:"application/json"}, body:JSON.stringify(body) });
    const payload = await response.json().catch(() => null);
    return { response, payload };
  }

  function renderCustomerContact(data) {
    const contact = data.contactProfile || data.contact_profile || {};
    document.getElementById("customer-email").value = String(contact.email || "");
    document.getElementById("customer-phone").value = String(contact.phone || "");
    document.getElementById("customer-telegram").value = String(contact.telegramUsername || contact.telegram_username || contact.telegram || "").replace(/^@/, "");
  }

  async function readCustomerRequests() {
    const list = document.getElementById("customer-request-list");
    const saved = document.getElementById("saved-model-list");
    try {
      const response = await fetch(CONFIG.customerRequestsEndpoint, { method:"GET", credentials:"same-origin", headers:{accept:"application/json"} });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true || !Array.isArray(payload.items)) throw new Error("unavailable");
      renderCustomerRequests(payload.items);
    } catch {
      list.replaceChildren(); saved.replaceChildren();
      appendEmpty(list, "ตอนนี้ยังตรวจสอบคำขอไม่ได้ครับ กรุณาลองใหม่อีกครั้ง");
      appendEmpty(saved, "ตอนนี้ยังตรวจสอบรายการที่บันทึกไว้ไม่ได้ครับ");
    }
  }

  function renderCustomerRequests(items) {
    const list = document.getElementById("customer-request-list"); const saved = document.getElementById("saved-model-list");
    list.replaceChildren(); saved.replaceChildren();
    const requests = safeList(items).filter((item) => item?.request_type !== "saved_model");
    const savedItems = safeList(items).filter((item) => item?.request_type === "saved_model" && item.action === "save");
    if (!requests.length) appendEmpty(list, "ยังไม่มีคำขอที่ส่งจากบัญชีนี้");
    else for (const item of requests) list.append(eventRow(item.created_at, item.request_type === "your_request" ? (item.model_name || "Your Request") : "อัปเดตข้อมูลของฉัน", item.status, item.audience ? item.audience.toUpperCase() : "กำลังตรวจสอบ"));
    if (!savedItems.length) appendEmpty(saved, "ยังไม่มีนายแบบที่บันทึกไว้");
    else for (const item of savedItems) saved.append(eventRow(item.created_at, item.model_name || "Saved model", item.status, "บันทึกไว้"));
  }

  async function uploadRequestEvidence(files) {
    const ids = []; const storageKeys = [];
    for (const file of Array.from(files || []).slice(0, 3)) {
      const fingerprint = await opaqueStorageToken([file.type, file.size, file.lastModified, String(file.name || "").slice(0, 180)].join("|"));
      const storageKey = customerRequestStorageKey("evidence", fingerprint);
      const savedEvidenceId = customerRequestSession?.getItem(storageKey) || "";
      if (/^evidence_[a-f0-9]{32}$/.test(savedEvidenceId)) { ids.push(savedEvidenceId); storageKeys.push(storageKey); continue; }
      const form = new FormData(); form.append("file", file, file.name || "reference-image");
      const response = await fetch(CONFIG.customerRequestEvidenceEndpoint, { method:"POST", credentials:"same-origin", body:form });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true || !/^evidence_[a-f0-9]{32}$/.test(String(payload.evidence_id || ""))) throw new Error("upload_failed");
      ids.push(payload.evidence_id); storageKeys.push(storageKey); customerRequestSession?.setItem(storageKey, payload.evidence_id);
    }
    return { ids, storageKeys };
  }

  function clearEvidenceState(storageKeys) { for (const key of storageKeys || []) customerRequestSession?.removeItem(key); }

  // Catalog cards may call this bridge; the server still validates identity, model id and idempotency.
  window.MMD_LIFF_SAVE_MODEL = async (modelId, modelName = "") => {
    const action = "save"; const token = await opaqueStorageToken(action + ":" + modelId); const request_id = pendingRequestId("saved_model", token);
    const { response, payload } = await requestJson({ request_id, request_type:"saved_model", model_id:modelId, model_name:modelName, action });
    if (!response.ok || payload?.ok !== true) { if (terminalClientError(response)) clearPendingRequest("saved_model", token); throw new Error("save_model_failed"); }
    clearPendingRequest("saved_model", token);
    await readCustomerRequests();
    return payload.item;
  };

  customerProfileForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = customerProfileForm.querySelector("button"); button.disabled = true;
    try {
      const request_id = pendingRequestId("profile_update");
      const { response, payload } = await requestJson({ request_id, request_type:"profile_update", email:document.getElementById("customer-email").value, phone:document.getElementById("customer-phone").value, telegram_username:document.getElementById("customer-telegram").value, preferences:document.getElementById("customer-preferences").value });
      if (!response.ok || payload?.ok !== true) { if (terminalClientError(response)) clearPendingRequest("profile_update"); throw new Error("request_failed"); }
      clearPendingRequest("profile_update");
      show("รับข้อมูลแล้วครับ ทีม MMD จะตรวจสอบก่อนอัปเดต"); await readCustomerRequests();
    } catch { show("ตอนนี้ยังส่งข้อมูลไม่ได้ครับ กรุณาลองใหม่อีกครั้ง"); }
    finally { button.disabled = false; }
  });

  yourRequestForm?.addEventListener("submit", async (event) => {
    event.preventDefault(); const button = yourRequestForm.querySelector("button"); button.disabled = true; yourRequestStatus.textContent = "กำลังรับ Your Request อย่างปลอดภัย…";
    let evidenceState = { ids:[], storageKeys:[] };
    try {
      evidenceState = await uploadRequestEvidence(document.getElementById("requested-model-evidence").files);
      const request_id = pendingRequestId("your_request");
      const { response, payload } = await requestJson({ request_id, request_type:"your_request", model_name:document.getElementById("requested-model-name").value, model_social:document.getElementById("requested-model-social").value, audience:document.getElementById("requested-model-audience").value, reason:document.getElementById("requested-model-reason").value, evidence_ids:evidenceState.ids });
      if (!response.ok || payload?.ok !== true) { if (terminalClientError(response)) { clearPendingRequest("your_request"); clearEvidenceState(evidenceState.storageKeys); } throw new Error("request_failed"); }
      clearPendingRequest("your_request"); clearEvidenceState(evidenceState.storageKeys);
      yourRequestForm.reset(); yourRequestStatus.textContent = "MMD รับคำขอแล้วครับ ทีมจะตรวจสอบเป็นการภายใน"; await readCustomerRequests();
    } catch { yourRequestStatus.textContent = "ตอนนี้ยังส่งคำขอไม่ได้ครับ กรุณาลองใหม่อีกครั้ง"; }
    finally { button.disabled = false; }
  });

  async function readCouponWallet() {
    const response = await fetch(CONFIG.couponWalletEndpoint, { method:"GET",credentials:"same-origin",headers:{"accept":"application/json"} });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.ok !== true) return null;
    renderCouponWallet(payload.wallet || {});
    return payload.wallet || {};
  }

  async function readCreditWallet() {
    try {
      const response = await fetch(CONFIG.creditWalletEndpoint, { method:"GET",credentials:"same-origin",headers:{"accept":"application/json"} });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || payload.state !== "resolved" || payload.verificationState !== "verified_only") {
        renderCreditWalletChecking();
        return null;
      }
      renderCreditWallet(payload);
      return payload;
    } catch {
      renderCreditWalletChecking();
      return null;
    }
  }

  async function readCareBackState() {
    const response = await fetch(CONFIG.careBackStateEndpoint, { method:"GET",credentials:"same-origin",headers:{"accept":"application/json"} });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.ok !== true) return null;
    renderCareBackState(payload);
    return payload;
  }

  function renderCareBackState(data) {
    if (data && data.claim) renderCareBackClaim(data.claim);
    const state = String(data && data.state || "");
    if (state === "claim_required") {
      wishPanel.classList.add("hidden");
      careButton.classList.remove("hidden");
      return;
    }
    if (state === "wish_available") {
      careButton.classList.add("hidden");
      wishPanel.classList.remove("hidden");
      document.getElementById("care-message").textContent = copy.careChecked || "สิทธิ์ CARE BACK ของคุณถูกตรวจแล้ว ส่งคำอวยพรถึง MMD สำเร็จเพื่อเปิดคูปองส่วนตัว 10% ครับ";
      wishText.classList.remove("hidden");
      wishSubmit.classList.remove("hidden");
      wishResult.classList.add("hidden");
      return;
    }
    if (state === "submitted" || state === "completed") {
      careButton.classList.add("hidden");
      wishPanel.classList.remove("hidden");
      wishText.classList.add("hidden");
      wishSubmit.classList.add("hidden");
      wishResult.textContent = String(data.final_display && data.final_display.message || copy.wishDone || "MMD ได้รับคำอวยพรของคุณแล้วครับ");
      wishResult.classList.remove("hidden");
      return;
    }
    if (state === "write_pending") {
      careButton.classList.add("hidden");
      wishPanel.classList.remove("hidden");
      wishText.classList.add("hidden");
      wishSubmit.classList.add("hidden");
      wishResult.textContent = copy.wishPending || "ระบบกำลังยืนยันการบันทึกคำอวยพรเดิมอย่างปลอดภัย กรุณากลับมาตรวจสอบอีกครั้งครับ";
      wishResult.classList.remove("hidden");
      return;
    }
    if (state === "reconciliation_required" || state === "manual_review" || state === "not_eligible") {
      careButton.classList.add("hidden");
      wishPanel.classList.remove("hidden");
      wishText.classList.add("hidden");
      wishSubmit.classList.add("hidden");
      wishResult.textContent = copy.wishReview || "ข้อมูลนี้ยังต้องตรวจสอบก่อนครับ ระบบจะเก็บเส้นทางของคุณไว้อย่างปลอดภัย";
      wishResult.classList.remove("hidden");
    }
  }

  function digitalDate(value) {
    const date = new Date(String(value || ""));
    return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : locale === "en" ? "en-US" : "th-TH", { year:"numeric", month:"short", day:"numeric" }).format(date);
  }

  function digitalFeedCategory(item, personalized = false) {
    if (personalized) return "FOR YOU";
    const raw = String(item?.category || item?.tag || "").trim().toUpperCase();
    if (/EDITORIAL|TMIB|CITY|ACADEMY|MMS|BEHIND/.test(raw)) return "EDITORIAL";
    return "MMD UPDATE";
  }

  function renderDigitalNews(personalizedItems, updateItems, unreadCount = 0) {
    const feed = document.getElementById("digital-news-feed");
    const unread = document.getElementById("digital-unread");
    if (!feed || !unread) return;
    const personalized = Array.isArray(personalizedItems) ? personalizedItems.slice(0, 2) : [];
    const updates = Array.isArray(updateItems) ? updateItems.slice(0, 5) : [];
    const safe = [
      ...personalized.map((item) => ({ item, personalized:true })),
      ...updates.map((item) => ({ item, personalized:false })),
    ].slice(0, 6);
    unread.hidden = !(Number.isInteger(unreadCount) && unreadCount > 0);
    if (!unread.hidden) unread.textContent = locale === "en" ? "NEW " + unreadCount : locale === "zh" ? "新 " + unreadCount : "ใหม่ " + unreadCount;
    feed.replaceChildren();
    if (!safe.length) {
      const quiet = document.createElement("div"); quiet.className = "digital-quiet"; quiet.textContent = locale === "en" ? "No new updates right now." : locale === "zh" ? "目前没有新的更新。" : "ตอนนี้ยังไม่มีอัปเดตใหม่";
      feed.append(quiet); return;
    }
    const allowedViews = new Set(["history","package","care","jobs","points","credits","coupons"]);
    for (const entry of safe) {
      const item = entry.item;
      const title = String(item?.title || item?.headline || "").trim();
      if (!title) continue;
      const requestedView = entry.personalized ? String(item?.view || "").trim() : "";
      const targetView = allowedViews.has(requestedView) ? requestedView : "";
      const card = document.createElement(targetView ? "button" : "article");
      card.className = "digital-news-card" + (entry.personalized ? " is-for-you" : "");
      if (targetView) {
        card.type = "button";
        card.dataset.feedView = targetView;
        card.addEventListener("click", () => showView(targetView));
      }
      const meta = document.createElement("div"); meta.className = "meta";
      const category = document.createElement("span"); category.textContent = digitalFeedCategory(item, entry.personalized);
      const date = document.createElement("span"); date.textContent = digitalDate(item?.occurredAt || item?.published_at || item?.publishedAt || item?.date);
      meta.append(category, date);
      const heading = document.createElement("h3"); heading.textContent = title;
      const excerptText = String(item?.excerpt || item?.summary || "").trim();
      card.append(meta, heading);
      if (excerptText) { const excerpt = document.createElement("p"); excerpt.textContent = excerptText; card.append(excerpt); }
      if (targetView) { const cta = document.createElement("span"); cta.className = "digital-feed-cta"; cta.textContent = locale === "en" ? "OPEN →" : locale === "zh" ? "查看 →" : "ดูต่อ →"; card.append(cta); }
      feed.append(card);
    }
    if (!feed.children.length) {
      const quiet = document.createElement("div"); quiet.className = "digital-quiet"; quiet.textContent = "ตอนนี้ยังไม่มีอัปเดตใหม่"; feed.append(quiet);
    }
  }

  async function hydrateDigitalHome(profileData = {}) {
    const greeting = document.getElementById("digital-greeting");
    const needs = document.getElementById("digital-needs");
    const needsLabel = document.getElementById("digital-needs-label");
    const needsAction = document.getElementById("digital-needs-action");
    const name = String(profileData?.customer_360?.member?.display_name || profileData?.display_name || "").trim();
    if (greeting) greeting.textContent = name ? (locale === "en" ? "Hello " + name : locale === "zh" ? "你好 " + name : "สวัสดี " + name) : "MY MMD";

    try {
      const response = await fetch("/api/member/app/dashboard", { credentials:"same-origin", cache:"no-store", headers:{ accept:"application/json" } });
      const body = await response.json().catch(() => null);
      if (response.ok && body && typeof body === "object") {
        // Digital Home display truth comes from the canonical member-app dashboard.
        // The LIFF profile is intentionally privacy-filtered and may collapse protected
        // tiers (for example SVIP) to a generic Member label. Do not let that stale
        // presentation override an owner-approved canonical entitlement.
        const dashboard = body.data && typeof body.data === "object" ? body.data : body;
        const membership = dashboard.membership && typeof dashboard.membership === "object" ? dashboard.membership : {};
        const tierLabels = { public_member:"Member", elite:"Elite", red_card:"Red Card", trial_7d:"7 Days", standard:"Standard", premium:"Premium", vip:"VIP", svip:"SVIP", black_card:"Black Card" };
        const level = String(membership.level || "").trim().toLowerCase();
        const tierNode = document.getElementById("profile-tier");
        const statusNode = document.getElementById("profile-status");
        const pointsNode = document.getElementById("profile-points");
        if (tierNode && membership.levelVerified === true && tierLabels[level]) tierNode.textContent = tierLabels[level];
        if (statusNode) {
          const status = String(membership.status || membership.lifecycle || "").trim();
          if (status) {
            const expiry = safeDate(membership.expiresAt || membership.renewalDueAt);
            statusNode.textContent = membershipStatus(status) + (expiry ? " · ถึง " + shortDate(expiry) : "");
          }
        }
        if (pointsNode) {
          const confirmed = dashboard.points?.confirmedBalance;
          pointsNode.textContent = Number.isInteger(confirmed) && confirmed >= 0
            ? new Intl.NumberFormat(locale === "zh" ? "zh-CN" : locale === "en" ? "en-US" : "th-TH").format(confirmed)
            : "—";
        }

        const homeFeed = dashboard.homeFeed && typeof dashboard.homeFeed === "object" ? dashboard.homeFeed : null;
        digitalPersonalizedFeed = homeFeed
          && homeFeed.authority === "member_app_dashboard_v1"
          && homeFeed.state === "resolved"
          && Array.isArray(homeFeed.items)
          ? homeFeed.items.slice(0, 2)
          : [];

        const action = dashboard.nextAction || dashboard.next_action || membership.nextAction || membership.next_action || null;
        const allowed = { signup:"package", renew:"package", care_back_wish:"care" };
        const target = action && allowed[String(action.kind || "").trim()];
        if (target && String(action.label || "").trim()) {
          needsLabel.textContent = String(action.label).trim();
          needsAction.onclick = () => showView(target);
          needs.hidden = false;
        } else {
          needs.hidden = true;
        }
      }
    } catch { needs.hidden = true; digitalPersonalizedFeed = []; }

    try {
      const response = await fetch("/api/v1/member/updates/list?limit=10", { credentials:"same-origin", cache:"no-store", headers:{ accept:"application/json" } });
      const body = await response.json().catch(() => null);
      const items = Array.isArray(body?.items) ? body.items : Array.isArray(body?.news) ? body.news : [];
      const unread = Number(body?.unread_count ?? body?.unreadCount ?? 0);
      renderDigitalNews(digitalPersonalizedFeed, response.ok ? items : [], Number.isInteger(unread) ? unread : 0);
    } catch { renderDigitalNews(digitalPersonalizedFeed, [], 0); }
  }

  function renderProfile(data, authority = "") {
    applyWorldTheme(data, authority);
    const view = data && typeof data.customer_360 === "object" ? data.customer_360 : legacyCustomerView(data);
    const member = view.member || {};
    const points = view.points || {};
    const packages = view.packages || {};
    const jobs = view.jobs || {};
    const payments = view.payments || {};
    const historyView = view.history || {};
    profile.classList.remove("hidden");
    document.getElementById("profile-name").textContent = String(member.display_name || data.display_name || "สมาชิก MMD");
    document.getElementById("profile-tier").textContent = String(member.tier || data.tier || "Member");
    void hydrateDigitalHome(data);
    const contact = data.contactProfile || data.contact_profile || {};
    document.getElementById("profile-email").textContent = String(contact.email || "—");
    document.getElementById("profile-phone").textContent = String(contact.phone || "—");
    document.getElementById("profile-points").textContent = points.status === "verified" && Number.isInteger(points.active_points) ? new Intl.NumberFormat(locale === "zh" ? "zh-CN" : locale === "en" ? "en-US" : "th-TH").format(points.active_points) : "—";
    document.getElementById("profile-status").textContent = membershipStatus(member.membership_status || data.membership_status);
    const expiry = safeDate(member.membership_expires_at || data.membership_expires_at);
    const payment = safePaymentStatus(payments.status || data.payment_status);
    document.getElementById("member-details").classList.toggle("hidden", !expiry && !payment);
    document.getElementById("expiry-card").classList.toggle("hidden", !expiry);
    document.getElementById("payment-card").classList.toggle("hidden", !payment);
    if (expiry) document.getElementById("profile-expiry").textContent = shortDate(expiry);
    if (payment) document.getElementById("profile-payment").textContent = paymentStatus(payment);
    renderHome(packages, jobs, historyView);
    renderPoints(points);
    renderPackages(packages);
    renderJobs(jobs, view.requests || {}, view.mms || {});
    renderHistory(historyView, payments);
    show(copy.ready || "ผมเตรียมข้อมูลที่ยืนยันได้ของคุณไว้แล้วครับ");
    if (CONFIG.intent === "promo") showView("care", false);
    else showView(CONFIG.view || "home", false);
  }

  function legacyCustomerView(data) {
    return {
      member: { display_name:data.display_name, tier:data.tier, membership_status:data.membership_status, membership_expires_at:data.membership_expires_at },
      points: { status:Number.isInteger(data.points_records_count) ? "verified" : "checking", active_points:data.points, lifetime_service_spend_thb:data.lifetime_service_spend_thb, service_spend_365d_thb:data.service_spend_365d_thb, completed_service_count:data.completed_service_count, history:[] },
      packages: { status:"checking", current_package:null, package_history:[] },
      jobs: { status:"checking", upcoming_jobs:[], active_jobs:[], completed_jobs:[], cancelled_jobs:[] },
      payments: { status:data.payment_status, historical_verified:data.payment_history },
      history: { status:"verified", from:data.history_window?.from, to:data.history_window?.to, events:data.history },
      requests: { status:"checking", items:[] }, mms: { status:"not_available", prebookings:[] },
    };
  }

  function renderHome(packages, jobs, historyView) {
    const current = packages.status === "verified" ? packages.current_package : null;
    document.getElementById("home-package").textContent = current?.customer_safe_name || (packages.status === "checking" ? (copy.checking || "กำลังตรวจสอบ") : "—");
    document.getElementById("home-package-note").textContent = current ? [current.tier, current.end_date ? shortDate(current.end_date) : ""].filter(Boolean).join(" · ") : "";
    const next = document.getElementById("next-job"); next.replaceChildren();
    if (jobs.status !== "verified") appendEmpty(next, copy.checking || "กำลังตรวจสอบข้อมูลของคุณครับ");
    else {
      const job = safeList(jobs.upcoming_jobs)[0] || safeList(jobs.active_jobs)[0];
      if (!job) appendEmpty(next, copy.empty || "ยังไม่มีรายการที่ยืนยันได้ในช่วงนี้ครับ");
      else next.append(eventRow(job.date, job.service_title, job.status, [job.job_number ? "#" + job.job_number : "", job.model_display_name, job.start_time].filter(Boolean).join(" · ")));
    }
    const history = document.getElementById("history"); history.replaceChildren();
    const items = safeList(historyView.events).slice(0, 3);
    if (!items.length) appendEmpty(history, historyView.status === "checking" ? copy.checking : copy.empty);
    for (const item of items) history.append(eventRow(item.date, item.title, item.status, item.type === "points" ? signedPoints(item.points_delta) : item.type));
  }

  function renderPoints(points) {
    const verified = points.status === "verified";
    document.getElementById("points-total").textContent = verified && Number.isInteger(points.active_points) ? signedPoints(points.active_points).replace(/^\\+/, "") : "—";
    document.getElementById("points-rate").textContent = verified ? (copy.pointsRate || "") : (copy.checkingPoints || copy.checking || "");
    document.getElementById("points-expiry").textContent = verified ? (copy.pointsNoExpiry || "") : "";
    document.getElementById("points-lifetime-spend").textContent = verified ? formatThb(points.lifetime_service_spend_thb) : "—";
    document.getElementById("points-365-spend").textContent = verified ? formatThb(points.service_spend_365d_thb) : "—";
    const history = document.getElementById("points-history"); history.replaceChildren();
    if (points.status !== "verified") return appendEmpty(history, copy.checkingPoints || copy.checking);
    const items = safeList(points.history); if (!items.length) return appendEmpty(history, copy.empty);
    for (const item of items) history.append(eventRow(item.date, item.title, item.status, signedPoints(item.points_delta)));
  }

  function renderPackages(packages) {
    const current = document.getElementById("current-package"); current.replaceChildren();
    if (packages.status !== "verified") appendEmpty(current, copy.checking || "");
    else if (!packages.current_package) appendEmpty(current, copy.empty || "");
    else { const item = packages.current_package; current.append(eventRow(item.start_date || item.end_date, item.customer_safe_name, item.status, [item.tier, item.end_date ? shortDate(item.end_date) : ""].filter(Boolean).join(" · "))); }
    const history = document.getElementById("package-history"); history.replaceChildren();
    const items = packages.status === "verified" ? safeList(packages.package_history) : [];
    if (!items.length) return appendEmpty(history, packages.status === "checking" ? copy.checking : copy.empty);
    for (const item of items) history.append(eventRow(item.start_date || item.end_date, item.customer_safe_name, item.status, [item.tier, item.end_date ? shortDate(item.end_date) : ""].filter(Boolean).join(" · ")));
  }

  function renderJobs(jobs, requests, mms) {
    const groups = document.getElementById("jobs-groups"); groups.replaceChildren();
    if (jobs.status !== "verified") appendEmpty(groups, copy.checking || "");
    else {
      let rendered = false;
      for (const [key, state] of [["upcoming_jobs","upcoming"],["active_jobs","active"],["completed_jobs","completed"],["cancelled_jobs","cancelled"]]) {
        const items = safeList(jobs[key]); if (!items.length) continue; rendered = true;
        const heading = document.createElement("h3"); heading.className = "group-title"; heading.textContent = safeStatus(state); groups.append(heading);
        for (const job of items) groups.append(jobDetails(job));
      }
      if (!rendered) appendEmpty(groups, copy.empty || "");
    }
    renderBoundedRows("requests", requests.status === "verified" ? requests.items : [], requests.status === "checking" ? copy.checking : copy.empty, (item) => eventRow(item.preferred_date, item.requested_model_display_name || "MMD", item.status, [item.request_number ? "#" + item.request_number : "", item.preferred_time].filter(Boolean).join(" · ")));
    renderBoundedRows("mms", mms.status === "verified" ? mms.prebookings : [], mms.status === "checking" ? copy.checking : copy.empty, (item) => eventRow(item.date, item.service, item.status, [item.prebooking_number ? "#" + item.prebooking_number : "", item.therapist_display_name, item.time].filter(Boolean).join(" · ")));
  }

  function renderHistory(historyView, payments) {
    document.getElementById("history-window").textContent = safeDate(historyView.from) && safeDate(historyView.to) ? shortDate(historyView.from) + " - " + shortDate(historyView.to) : (historyView.status === "checking" ? (copy.checking || "") : "");
    renderBoundedRows("v2-history", historyView.status === "verified" ? historyView.events : [], historyView.status === "checking" ? copy.checking : copy.empty, (item) => eventRow(item.date, item.title, item.status, item.type === "points" ? signedPoints(item.points_delta) : item.type));
    renderBoundedRows("payment-history", payments.historical_verified, copy.empty, (item) => eventRow(item.date, item.title, item.status, Number.isInteger(item.amount) ? item.amount + " THB" : ""));
  }

  function renderBoundedRows(id, items, emptyCopy, renderItem) { const container = document.getElementById(id); container.replaceChildren(); const safe = safeList(items); if (!safe.length) return appendEmpty(container, emptyCopy); for (const item of safe) container.append(renderItem(item)); }
  function jobDetails(job) { const details = document.createElement("details"); details.className = "details"; const summary = document.createElement("summary"); summary.textContent = [job.job_number ? "#" + job.job_number : "", job.service_title].filter(Boolean).join(" · ") || "MMD"; details.append(summary); const content = document.createElement("div"); content.className = "history"; content.append(eventRow(job.date, job.model_display_name || job.service_title, job.status, [job.start_time, job.end_time, job.duration ? job.duration + " min" : ""].filter(Boolean).join(" · "))); if (job.location_customer_safe) { const place = document.createElement("p"); place.className = "sub"; place.textContent = job.location_customer_safe; content.append(place); } if (job.customer_safe_note) { const note = document.createElement("p"); note.className = "sub"; note.textContent = job.customer_safe_note; content.append(note); } details.append(content); return details; }
  function eventRow(dateValue, titleValue, stateValue, detail) { const row = document.createElement("div"); row.className = "event"; const date = document.createElement("span"); date.className = "event-date"; date.textContent = shortDate(dateValue); const title = document.createElement("strong"); title.textContent = String(titleValue || "MMD"); const state = document.createElement("span"); state.className = "event-status"; state.textContent = detail || safeStatus(stateValue); row.append(date, title, state); return row; }
  function appendEmpty(container, text) { const empty = document.createElement("p"); empty.className = "empty"; empty.textContent = String(text || copy.empty || ""); container.append(empty); }
  function safeList(value) { return Array.isArray(value) ? value : []; }

  function membershipStatus(value) { const labels = { th:{active:"สมาชิกใช้งานอยู่",grace:"อยู่ในช่วงผ่อนผัน",expired:"สมาชิกหมดอายุ",under_review:"อยู่ระหว่างตรวจสอบ",checking:"กำลังตรวจสอบ"}, en:{active:"Active member",grace:"Grace period",expired:"Expired",under_review:"Under review",checking:"Checking"}, zh:{active:"会员有效",grace:"宽限期",expired:"会员已过期",under_review:"审核中",checking:"检查中"} }; return (labels[locale] || labels.th)[value] || (labels[locale] || labels.th).checking; }
  function safeStatus(value) { const labels = { th:{completed:"เสร็จสิ้น",active:"ใช้งานอยู่",upcoming:"นัดหมายล่วงหน้า",cancelled:"ยกเลิก",expired:"หมดอายุ",posted:"บันทึกแล้ว",verified:"ตรวจสอบแล้ว",pending_review:"รอตรวจสอบ",checking:"กำลังตรวจสอบ"}, en:{completed:"Completed",active:"Active",upcoming:"Upcoming",cancelled:"Cancelled",expired:"Expired",posted:"Posted",verified:"Verified",pending_review:"Pending review",checking:"Checking"}, zh:{completed:"已完成",active:"有效",upcoming:"即将开始",cancelled:"已取消",expired:"已过期",posted:"已记录",verified:"已验证",pending_review:"待审核",checking:"检查中"} }; return (labels[locale] || labels.th)[value] || (labels[locale] || labels.th).checking; }
  function signedPoints(value) { const number = Number(value || 0); return (number >= 0 ? "+" : "") + new Intl.NumberFormat(locale === "zh" ? "zh-CN" : locale === "en" ? "en-US" : "th-TH").format(number) + " pts"; }
  function formatThb(value) { const number = Number(value); return Number.isFinite(number) && number >= 0 ? new Intl.NumberFormat(locale === "zh" ? "zh-CN" : locale === "en" ? "en-US" : "th-TH",{style:"currency",currency:"THB",maximumFractionDigits:2}).format(number) : "—"; }
  function shortDate(value) { const date = new Date(String(value || "") + "T00:00:00+07:00"); return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : locale === "en" ? "en-GB" : "th-TH",{day:"numeric",month:"short",year:"2-digit"}).format(date); }
  function safeDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : ""; }
  function safePaymentStatus(value) { return ["verified","pending_review","unavailable"].includes(String(value || "")) ? String(value) : ""; }
  function paymentStatus(value) { const labels = { th:{verified:"ตรวจสอบแล้ว",pending_review:"รอตรวจสอบ",unavailable:"ยังไม่พร้อมยืนยัน"}, en:{verified:"Verified",pending_review:"Pending review",unavailable:"Unavailable"}, zh:{verified:"已验证",pending_review:"待审核",unavailable:"暂不可确认"} }; return (labels[locale] || labels.th)[value] || "Unavailable"; }

  async function claimCareBack() {
    if (busy) return;
    setBusy(true); careButton.disabled = true; careButton.textContent = copy.careLoading || "กำลังตรวจสอบสิทธิ์";
    try {
      const response = await fetch(CONFIG.careBackEndpoint, { method:"POST",credentials:"same-origin",headers:{"content-type":"application/json","accept":"application/json"},body:"{}" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || payload.ok !== true) throw new Error("care_back_unavailable");
      renderCareBackClaim(payload.data || {});
      await readCareBackState();
    } catch {
      document.getElementById("care-message").textContent = copy.claimMessage || "ตอนนี้ยังออกโค้ดไม่ได้ครับ กรุณาลองใหม่อีกครั้งหรือติดต่อ HYPE";
      careButton.disabled = false; careButton.textContent = copy.careRetry || "ลองตรวจสอบอีกครั้ง";
    } finally { setBusy(false); }
  }

  async function submitBirthdayWish() {
    if (busy) return;
    const text = String(wishText.value || "").trim();
    if (!text) { wishResult.textContent = copy.wishEmpty || "กรุณาเขียนคำอวยพรก่อนส่งครับ"; wishResult.classList.remove("hidden"); return; }
    setBusy(true); wishSubmit.disabled = true; wishSubmit.textContent = copy.wishSaving || "กำลังเก็บคำอวยพร";
    try {
      const response = await fetch(CONFIG.careBackWishEndpoint, {
        method:"POST",credentials:"same-origin",headers:{"content-type":"application/json","accept":"application/json"},
        body:JSON.stringify({wish_text:text,request_id:crypto.randomUUID()}),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || payload.ok !== true) throw new Error("wish_unavailable");
      if (payload.claim) renderCareBackClaim(payload.claim);
      renderCareBackState(payload);
    } catch {
      wishResult.textContent = copy.wishError || "ตอนนี้ยังเก็บคำอวยพรไม่ได้ครับ กรุณาลองใหม่อีกครั้ง";
      wishResult.classList.remove("hidden");
      wishSubmit.disabled = false; wishSubmit.textContent = copy.wishRetry || "ลองส่งอีกครั้ง";
    } finally { setBusy(false); }
  }

  function renderCareBackClaim(data) {
    const code = String(data.personal_code || "");
    const codeWrap = document.getElementById("care-code");
    const couponState = String(data.coupon_state || "");
    document.getElementById("care-code-value").textContent = code;
    codeWrap.classList.toggle("hidden", !code);
    document.getElementById("care-message").textContent = String(data.coupon_message || data.message || copy.claimMessage || "MMD จะอัปเดตสิทธิ์ตามสถานะสมาชิกและการยืนยันที่เกี่ยวข้องครับ");
    renderPersonalizedBenefits(data.personalized_benefits);
    renderCouponWallet(data.coupon_wallet);
    careButton.textContent = data.resumed ? (copy.careResumedButton || "อัปเดตสิทธิ์ CARE BACK แล้ว") : (copy.careCheckedButton || "ตรวจสิทธิ์ CARE BACK แล้ว");
    if (couponState === "wish_required") careButton.textContent = copy.couponReady || "ส่งคำอวยพรเพื่อเปิดคูปอง";
  }

  function renderPersonalizedBenefits(items) {
    const container = document.getElementById("care-benefits");
    container.replaceChildren();
    const benefits = safeList(items).slice(0, 4);
    container.classList.toggle("hidden", benefits.length === 0);
    for (const benefit of benefits) {
      const type = String(benefit && benefit.type || "");
      const value = Number(benefit && benefit.value);
      if (!Number.isInteger(value) || value <= 0) continue;
      const card = document.createElement("div"); card.className = "benefit-card";
      const label = document.createElement("span"); label.className = "label"; label.textContent = benefitLabel(type);
      const amount = document.createElement("strong"); amount.textContent = benefitValue(type, value);
      const state = document.createElement("span"); state.className = "sub"; state.textContent = benefitState(benefit.state);
      card.append(label, amount, state); container.append(card);
    }
    container.classList.toggle("hidden", container.childElementCount === 0);
  }

  function renderCouponWallet(wallet) {
    const container = document.getElementById("coupon-wallet");
    container.replaceChildren();
    const code = String(wallet && wallet.code || "");
    const status = String(wallet && wallet.status || "verification_required");
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return appendEmpty(container, couponStateLabel(status));
    const card = document.createElement("div"); card.className = "benefit-card";
    const label = document.createElement("span"); label.className = "label"; label.textContent = "CARE BACK · 10%";
    const value = document.createElement("strong"); value.className = "wallet-code"; value.textContent = code;
    const state = document.createElement("span"); state.className = "wallet-state"; state.textContent = couponStateLabel(status);
    card.append(label, value, state);
    if (wallet.expires_at) { const expiry = document.createElement("span"); expiry.className = "sub"; expiry.textContent = String(wallet.expires_at).slice(0, 10); card.append(expiry); }
    container.append(card);
  }

  function renderCreditWalletChecking() {
    document.getElementById("credit-wallet-message").textContent = copy.creditChecking || copy.checking || "Checking";
    for (const id of ["credit-available", "credit-reserved", "credit-used"]) document.getElementById(id).textContent = "—";
    const container = document.getElementById("credit-wallet");
    container.replaceChildren();
    appendEmpty(container, copy.creditChecking || copy.checking || "Checking");
  }

  function safeCreditItem(item) {
    if (!item || typeof item !== "object" || item.verified !== true || item.verificationState !== "verified") return null;
    const status = String(item.status || "");
    if (!["available", "partially_used", "used", "refunded", "expired"].includes(status)) return null;
    const amount = (value) => { const number = Number(value); return Number.isFinite(number) && number >= 0 && number <= 100000000 ? number : null; };
    const creditId = String(item.creditId || "").trim();
    if (!creditId || creditId.length > 120) return null;
    const original = amount(item.originalAmountThb);
    const available = amount(item.availableAmountThb);
    const reserved = amount(item.reservedAmountThb);
    const applied = amount(item.appliedAmountThb);
    if (original === null || original <= 0 || available === null || reserved === null || applied === null) return null;
    if (available > original + 0.001 || reserved > original + 0.001 || applied > original + 0.001 || available + reserved + applied > original + 0.001) return null;
    const expiry = creditDatePart(item.expiresAt);
    return {
      creditId,
      status,
      original,
      available,
      reserved,
      applied,
      expiry,
      issued: creditDatePart(item.issuedAt) || creditDatePart(item.createdAt),
      note: String(item.customerDisplayNote || item.note || "").trim().slice(0, 500),
    };
  }

  function renderCreditWallet(data) {
    const balance = data && typeof data.balance === "object" ? data.balance : null;
    const availableBalance = Number(balance && balance.available);
    if (!balance || typeof balance.available !== "number" || balance.currency !== "THB" || !Number.isFinite(availableBalance) || availableBalance < 0 || availableBalance > 100000000) return renderCreditWalletChecking();
    if (!Array.isArray(data.items)) return renderCreditWalletChecking();
    const items = data.items.map(safeCreditItem);
    if (items.some((item) => !item)) return renderCreditWalletChecking();
    const creditIds = new Set(items.map((item) => item.creditId));
    if (creditIds.size !== items.length) return renderCreditWalletChecking();
    const calculatedAvailable = items.filter((item) => item.status === "available" || item.status === "partially_used").reduce((sum, item) => sum + item.available, 0);
    if (Math.abs(calculatedAvailable - availableBalance) > 0.001) return renderCreditWalletChecking();
    const availableBuckets = [balance.paidAvailableThb, balance.bonusAvailableThb, balance.carriedForwardAvailableThb];
    if (availableBuckets.some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0) || Math.abs(availableBuckets.reduce((sum, value) => sum + value, 0) - availableBalance) > 0.001) return renderCreditWalletChecking();
    const reserved = items.filter((item) => item.status === "available" || item.status === "partially_used").reduce((sum, item) => sum + item.reserved, 0);
    const applied = items.reduce((sum, item) => sum + item.applied, 0);
    document.getElementById("credit-available").textContent = formatThb(availableBalance);
    document.getElementById("credit-reserved").textContent = formatThb(reserved);
    document.getElementById("credit-used").textContent = formatThb(applied);
    document.getElementById("credit-wallet-message").textContent = items.length ? (copy.creditVerified || "Only verified credit is shown.") : (copy.creditEmpty || copy.empty || "");
    const container = document.getElementById("credit-wallet");
    container.replaceChildren();
    if (!items.length) return appendEmpty(container, copy.creditEmpty || copy.empty || "");
    for (const item of items.slice(0, 3)) {
      const card = document.createElement("div"); card.className = "event";
      const date = document.createElement("span"); date.className = "event-date"; date.textContent = item.issued ? shortDate(item.issued) : "—";
      const title = document.createElement("strong"); title.textContent = creditStatus(item.status);
      const detail = document.createElement("span"); detail.className = "event-status"; detail.textContent = item.expiry ? (copy.creditExpiry || "Valid until") + " · " + shortDate(item.expiry) : formatThb(item.available);
      card.append(date, title, detail);
      if (item.note) { const note = document.createElement("p"); note.className = "sub"; note.textContent = item.note; card.append(note); }
      container.append(card);
    }
  }

  function creditDatePart(value) { const match = /^(\\d{4}-\\d{2}-\\d{2})(?:T|$)/.exec(String(value || "")); return match ? match[1] : ""; }
  function creditStatus(value) { const labels = {th:{available:"พร้อมใช้",partially_used:"ใช้บางส่วน",used:"ใช้แล้ว",refunded:"คืนเงินแล้ว",expired:"หมดอายุ"},en:{available:"Available",partially_used:"Partially used",used:"Used",refunded:"Refunded",expired:"Expired"},zh:{available:"可用",partially_used:"已部分使用",used:"已使用",refunded:"已退款",expired:"已过期"}}; return (labels[locale] || labels.th)[value] || (copy.creditChecking || "Checking"); }

  function benefitLabel(type) { const labels = {th:{membership_extension:"ขยายเวลาสมาชิก",points_bonus:"คะแนนพิเศษ",personal_coupon:"คูปองส่วนตัว"},en:{membership_extension:"Membership extension",points_bonus:"Bonus points",personal_coupon:"Personal coupon"},zh:{membership_extension:"会员延期",points_bonus:"奖励积分",personal_coupon:"专属优惠券"}}; return (labels[locale] || labels.th)[type] || "CARE BACK"; }
  function benefitValue(type, value) { if (type === "membership_extension") return value + (locale === "en" ? " days" : locale === "zh" ? " 天" : " วัน"); if (type === "points_bonus") return "+" + value + " Points"; return value + "%"; }
  function benefitState(value) { const state = String(value || "pending"); const labels = {th:{ready:"พร้อมใช้",wish_required:"รอคำอวยพร",renewal_required:"รอต่ออายุ",payment_required:"รอยืนยันการชำระเงิน",verification_required:"รอตรวจสอบ",pending_application:"กำลังดำเนินการ",applied:"ได้รับแล้ว",used:"ใช้แล้ว",expired:"หมดอายุ"},en:{ready:"Ready",wish_required:"Wish required",renewal_required:"Renewal required",payment_required:"Payment verification required",verification_required:"Verification required",pending_application:"Processing",applied:"Applied",used:"Used",expired:"Expired"},zh:{ready:"可使用",wish_required:"等待祝福",renewal_required:"等待续费",payment_required:"等待付款验证",verification_required:"等待验证",pending_application:"处理中",applied:"已获得",used:"已使用",expired:"已过期"}}; return (labels[locale] || labels.th)[state] || (locale === "en" ? "Pending" : locale === "zh" ? "处理中" : "กำลังตรวจสอบ"); }
  function couponStateLabel(value) { return benefitState(value); }

  function render(data) {
    const screen = data && typeof data.screen === "object" ? data.screen : {};
    if (CONFIG.intent === "promo" && CONFIG.campaign === "care_back") {
      show(copy.promoLoading || "กำลังตรวจสอบสิทธิ์ CARE BACK อย่างปลอดภัยครับ");
      actions.replaceChildren();
      return;
    }
    if (CONFIG.intent === "signup") {
      actions.replaceChildren();
      show("กำลังเตรียมแพ็กเกจสมัครสมาชิกใน LINE ครับ");
      return;
    }
    show(screen.copy || "กำลังตรวจสอบข้อมูลให้ครับ");
    actions.replaceChildren();
    const serverActions = Array.isArray(screen.actions) ? screen.actions : [];
    for (const action of serverActions) {
      const id = String(action && action.id || "");
      const endpoint = String(action && action.endpoint || "");
      const label = String(action && action.label || "");
      if (!label || endpoint !== "/member/api/liff/intent" || !allowedIntentIds.has(id)) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", async () => {
        if (busy) return;
        setBusy(true);
        try { await call(endpoint, { liff_intent: id }); }
        catch { show("ตอนนี้ระบบตรวจสอบข้อมูลชั่วคราวยังไม่พร้อมครับ กรุณาลองใหม่อีกครั้ง"); }
        finally { setBusy(false); }
      });
      actions.append(button);
    }
  }

  async function boot() {
    if (CONFIG.stagingScenario) {
      try {
        show("STAGING · กำลังทดสอบสถานะ " + CONFIG.stagingScenario + " โดยไม่ใช้ข้อมูลสมาชิกจริงครับ");
        const body = {
          id_token: "care-back-staging-" + CONFIG.stagingScenario,
          liff_intent: CONFIG.intent,
        };
        if (CONFIG.promoCode) body.promo_code = CONFIG.promoCode;
        if (CONFIG.campaign) body.campaign = CONFIG.campaign;
        const started = await call(CONFIG.startEndpoint, body);
        if (started && started.member_resolved) await readProfile();
      } catch {
        show("STAGING · ระบบจำลองยังไม่พร้อมครับ");
      }
      return;
    }
    try {
      const existingProfile = await readProfile();
      if (existingProfile) { signupLineEntry?.classList.add("hidden"); await readSignupCatalog(); return; }
    } catch {
      // No valid same-site session yet. Fall through to the one-time LIFF handshake.
    }
    if (!CONFIG.liffId || !window.liff) {
      show("ช่องทางนี้ยังไม่พร้อมใช้งานครับ กรุณากลับมาเปิดผ่าน LINE ของ MMD อีกครั้ง");
      return;
    }
    try {
      await window.liff.init({ liffId: CONFIG.liffId });
      if (window.liff.isInClient()) signupLineEntry?.classList.add("hidden");
      if (!window.liff.isLoggedIn()) {
        if (CONFIG.intent === "signup" && !window.liff.isInClient()) {
          show("เปิดใน LINE ด้วยปุ่มด้านล่างเพื่อยืนยันตัวตนและสมัครสมาชิกครับ");
          return;
        }
        window.liff.login({ redirectUri: window.location.href });
        return;
      }
      signupLineEntry?.classList.add("hidden");
      const idToken = window.liff.getIDToken();
      if (!idToken) {
        show("ไม่สามารถยืนยัน LINE ได้ในตอนนี้ครับ กรุณาเปิดใหม่ผ่าน LINE ของ MMD");
        return;
      }
      const body = { id_token: idToken, liff_intent: CONFIG.intent };
      if (CONFIG.promoCode) body.promo_code = CONFIG.promoCode;
      if (CONFIG.campaign) body.campaign = CONFIG.campaign;
      const started = await call(CONFIG.startEndpoint, body);
      if (started) {
        if (started.member_resolved) await readProfile();
        await readSignupCatalog();
      }
    } catch {
      show("ตอนนี้ระบบตรวจสอบข้อมูลชั่วคราวยังไม่พร้อมครับ กรุณาลองใหม่อีกครั้ง");
    }
  }

  careButton.addEventListener("click", claimCareBack);
  wishSubmit.addEventListener("click", submitBirthdayWish);
  // Welcome screen is user-led; LINE verification begins after Continue.
})();
</script>
</body>
</html>`;
}

function stagingScenario(env, url) {
  if (String(env.CARE_BACK_STAGING_MODE || "") !== "synthetic") return "";
  if (!url.hostname.endsWith(".workers.dev")) return "";
  const scenario = String(url.searchParams.get("scenario") || "").trim().toLowerCase();
  return new Set(["current", "returning", "new"]).has(scenario) ? scenario : "";
}

function publicLiffId(env) {
  const value = String(env.LINE_LIFF_ID || env.LIFF_ID || "").trim();
  return value.length <= 160 && /^[A-Za-z0-9_-]+$/.test(value) ? value : "";
}

function normalizeIntent(value) {
  const intent = String(value || "unknown").trim().toLowerCase();
  return LIFF_INTENTS.has(intent) ? intent : "unknown";
}

function normalizePromoCode(value) {
  const code = String(value || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,62}$/.test(code) ? code : "";
}

function normalizeCampaign(value) {
  return String(value || "").trim().toLowerCase() === "care_back" ? "care_back" : "";
}

function normalizeView(value) {
  const view = String(value || "home").trim().toLowerCase();
  if (view === "profile") return "home";
  if (view === "care_back") return "care";
  return new Set(["home", "points", "credits", "package", "jobs", "history", "care", "coupons", "my-requests", "signup"]).has(view) ? view : "home";
}

function normalizeWorld(value) {
  const world = String(value || "public").trim().toLowerCase();
  return world === "private" || world === "sigil" ? "private" : "public";
}

function normalizeLanguage(value) {
  const language = String(value || "th").trim().toLowerCase().split(/[-_]/)[0];
  return new Set(["th", "en", "zh"]).has(language) ? language : "th";
}

function jsonForInlineScript(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function shellHeaders(extra = {}) {
  return {
    "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "SAMEORIGIN",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    ...extra,
  };
}

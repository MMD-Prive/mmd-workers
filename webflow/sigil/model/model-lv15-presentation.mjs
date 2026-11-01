// Additive presentation only. Existing owners retain every control and event handler.
import { LV15_FONT_CSS } from './model-lv15-fonts.mjs';
export const LV15_CSS = LV15_FONT_CSS + `
[data-lv15-world]{--v15-bg:#f8f7f4;--v15-panel:#fffefa;--v15-ink:#242621;--v15-muted:#686a61;--v15-line:#d7d7cf;--v15-accent:#b41332;--v15-soft:#eeede7;--v15-button-ink:#fff8ed;--v15-ui:"Outfit","Noto Sans Thai","LINE Seed Sans TH",sans-serif;--v15-display:"Playfair Display",Georgia,serif;--lv-bg:var(--v15-bg);--lv-text:var(--v15-ink);--lv-muted:var(--v15-muted);--lv-surface:var(--v15-panel);--lv-raised:var(--v15-soft);--lv-border:var(--v15-line);--lv-gold:var(--v15-accent);--lv-gold-ink:var(--v15-button-ink);--lv-glass:var(--v15-panel);--ca-page:var(--v15-bg);--ca-panel:var(--v15-panel);--ca-raised:var(--v15-soft);--ca-ink:var(--v15-ink);--ca-muted:var(--v15-muted);--ca-line:var(--v15-line);--ca-brass:var(--v15-accent);--mmd-bg:var(--v15-bg);--mmd-fg:var(--v15-ink);--mmd-surface:var(--v15-panel);--mmd-surface-raised:var(--v15-soft);--mmd-border:var(--v15-line);--mmd-primary:var(--v15-accent);--mmd-primary-fg:var(--v15-button-ink);--mmd-muted:var(--v15-muted);--mmd-muted-fg:var(--v15-muted);--bg:var(--v15-bg);--surface:var(--v15-panel);--surface2:var(--v15-soft);--line:var(--v15-line);--cream:var(--v15-ink);--gold:var(--v15-accent);--muted:var(--v15-muted);color-scheme:light;color:var(--v15-ink)!important;background:var(--v15-bg)!important;font-family:var(--v15-ui);position:relative;isolation:isolate}
[data-lv15-world="private"]{--v15-bg:#0b0f10;--v15-panel:#151a18;--v15-ink:#f2eee1;--v15-muted:#c6c1b3;--v15-line:#3d4239;--v15-accent:#d9bd77;--v15-soft:#222923;--v15-button-ink:#171b17;color-scheme:dark}
[data-lv15-world] [hidden]{display:none!important}
[data-lv15-world]:before{content:"";position:absolute;inset:0;pointer-events:none;z-index:-1;opacity:0}
[data-lv15-world="private"]:before{background:linear-gradient(#0b0f10bd,#0b0f10e8),url("https://s3.amazonaws.com/webflow-prod-assets/68f879d546d2f4e2ab186e90/6a2e89da3f9feeabc206fa8c_SIGIL_Wall.webp") center top/cover;opacity:.45}
[data-lv15-world] .lv15-masthead{position:relative;isolation:isolate;overflow:hidden;min-width:0;width:100%;padding:24px 0 27px;margin:0 0 25px;border-bottom:1px solid var(--v15-line);color:var(--v15-ink);order:-2}
[data-lv15-world] .lv15-masthead:before{content:"";position:absolute;inset:0;z-index:-2;pointer-events:none}
[data-lv15-world="private"] .lv15-masthead:before{background:linear-gradient(90deg,#0b0f1040,#0b0f100a 60%,#0b0f1040),url("https://s3.amazonaws.com/webflow-prod-assets/68f879d546d2f4e2ab186e90/6a61b1d19a4570eb40235c4b_SigilWall.webp") center 40%/cover;opacity:.55}
[data-lv15-world] .lv15-rain{position:absolute;inset:0;z-index:-1;background:url("https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6ad1028480c73d0f43f1c960_Midnight%20Bangkok%20Through%20Rainy%20Glass.webp") center/cover;opacity:.10;filter:brightness(1.10);pointer-events:none;display:none}
[data-lv15-world="private"] .lv15-rain{display:block;mix-blend-mode:soft-light}
[data-lv15-world] .lv15-topline{display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:1px solid var(--v15-line);padding-bottom:15px;margin-bottom:25px;min-height:62px}
[data-lv15-world] .lv15-parent-logo{display:block;width:54px;height:45px;object-fit:contain;flex-shrink:0}
[data-lv15-world="private"] .lv15-parent-logo{width:120px;height:72px}
[data-lv15-world] .lv15-controls{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:8px;min-width:0}
[data-lv15-world] .lv15-index{display:flex;justify-content:space-between;gap:12px;margin:0 0 22px;font:500 9px/1.5 var(--v15-ui);letter-spacing:.15em;color:var(--v15-muted)}
[data-lv15-world] .lv15-index>span:first-child{display:flex;align-items:center;gap:12px}
[data-lv15-world] .lv15-index>span:first-child:before{content:"";width:25px;height:1px;background:var(--v15-accent)}
[data-lv15-world] .lv15-wordmark{display:flex;align-items:flex-start;gap:24px;max-width:100%;width:max-content;text-decoration:none;color:var(--v15-ink)!important;position:relative;z-index:1}
[data-lv15-world] .lv15-my{font:italic 400 43px/1.25 var(--v15-display);letter-spacing:-.05em;position:relative;padding:5px 0 12px}
[data-lv15-world] .lv15-my:after{content:"";height:2px;position:absolute;bottom:0;left:0;right:0;background:var(--v15-accent);transform:skewY(-5deg)}
[data-lv15-world] .lv15-model{font:400 108px/1.08 var(--v15-display);letter-spacing:-.065em;border-bottom:1px solid var(--v15-line)}
[data-lv15-world] .lv15-brandline{display:flex;justify-content:space-between;align-items:flex-end;gap:15px;margin-top:18px;position:relative;z-index:1}
[data-lv15-world] .lv15-slogan{margin:0;color:var(--v15-muted);font:italic 400 17px/1.4 var(--v15-display)}
[data-lv15-world] .lv15-world-label{color:var(--v15-muted);font:500 8px/1.5 var(--v15-ui);letter-spacing:.12em}
[data-lv15-world] .lv15-skyline{position:absolute;right:-2%;bottom:0;width:74%;height:64%;color:var(--v15-accent);opacity:.10;pointer-events:none;z-index:-1}
[data-lv15-world="private"] .lv15-skyline{opacity:.07}
[data-lv15-world] .lv15-credits{border-top:1px solid var(--v15-line);padding:22px 0 18px;margin-top:30px;color:var(--v15-muted);font:11px/1.7 var(--v15-ui);order:9}
[data-lv15-world] .lv15-credits strong{font-weight:500;letter-spacing:.08em;color:var(--v15-ink)}
[data-lv15-world] .lv15-credits p{margin:6px 0;color:var(--v15-muted)}
[data-lv15-world] .lv15-accent{position:absolute;right:0;top:4px;width:145px;height:90px;opacity:.10;color:var(--v15-accent);pointer-events:none;z-index:-1}
[data-lv15-world] :is(.lv15-accent,.lv15-skyline) *{pointer-events:none!important}
/* Webflow home: every original form and dock link remains in its owner. */
#mmd-model-home-v4[data-lv15-world]{--lv-bg:var(--v15-bg)!important;--lv-text:var(--v15-ink)!important;--lv-muted:var(--v15-muted)!important;--lv-surface:var(--v15-panel)!important;--lv-raised:var(--v15-soft)!important;--lv-border:var(--v15-line)!important;--lv-gold:var(--v15-accent)!important;--lv-gold-ink:var(--v15-button-ink)!important;--lv-glass:var(--v15-panel)!important;min-height:100svh;padding-bottom:120px}
#mmd-model-home-v4[data-lv15-world] .mmhome-shell{width:min(100%,1120px)!important;max-width:1120px!important;padding:0 44px 25px!important}
#mmd-model-home-v4[data-lv15-world] .mm-lv-atmosphere{opacity:.10;filter:brightness(1.10)}
#mmd-model-home-v4[data-lv15-world]:not([data-lv15-world="private"]) .mm-lv-atmosphere{visibility:hidden}
#mmd-model-home-v4[data-lv15-world] .lv15-controls .mm-lv-header{position:static!important;inset:auto!important;display:flex!important;flex-wrap:wrap!important;justify-content:flex-end!important;margin:0!important;padding:0!important;min-height:44px!important;background:none!important;border:0!important;backdrop-filter:none!important;gap:8px!important}
#mmd-model-home-v4[data-lv15-world] .mm-lv-header .mm-lv-brand{display:none!important}
#mmd-model-home-v4[data-lv15-world] .mm-lv-header-status{margin:0!important;font-size:10px!important;color:var(--v15-muted)!important;flex-basis:100%;text-align:right}
#mmd-model-home-v4[data-lv15-world] :is(.mmcard,.mm-lv-panel){border-radius:0!important;box-shadow:none!important;background:transparent!important;border-color:var(--v15-line)!important}
#mmd-model-home-v4[data-lv15-world] .mmhome-hero{padding:0 0 25px!important}
#mmd-model-home-v4[data-lv15-world] .mmhome-hero h1{font-size:clamp(25px,3vw,36px)!important;line-height:1.4!important;font-weight:500!important}
#mmd-model-home-v4[data-lv15-world] .mm-lv-quick{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:0!important;border-top:1px solid var(--v15-line);margin:22px 0!important}
#mmd-model-home-v4[data-lv15-world] .mm-lv-quick a{display:flex!important;flex-direction:column!important;justify-content:center!important;gap:11px!important;min-height:95px!important;border:0!important;border-bottom:1px solid var(--v15-line)!important;border-radius:0!important;padding:12px 5px!important;background:none!important;font-size:12px!important;text-align:center}
#mmd-model-home-v4[data-lv15-world] .mmprimary{border-radius:30px!important;min-height:49px!important;font-weight:500!important;background:var(--v15-accent)!important;color:var(--v15-button-ink)!important;-webkit-text-fill-color:var(--v15-button-ink)!important}
#mmd-model-home-v4[data-lv15-world] .mm-lv-work-art{width:160px!important;opacity:.10!important}
#mmd-model-home-v4[data-lv15-world] :is(.mm-lv-languages,.mm-lv-languages button){border-color:var(--v15-line)!important;background:var(--v15-soft)!important;color:var(--v15-muted)!important}
#mmd-model-home-v4[data-lv15-world] .mm-lv-languages button[aria-checked="true"]{background:var(--v15-panel)!important;color:var(--v15-ink)!important}
/* Worker-rendered nested pages share the same tokens without replacing their screens. */
.app[data-mmd-app-digital][data-lv15-world]{width:min(100%,1120px)!important;max-width:1120px;overflow-x:clip;background:var(--v15-bg)!important}
.app[data-mmd-app-digital][data-lv15-world]>.shell{padding:0 44px 130px!important}
.app[data-mmd-app-digital][data-lv15-world] .lv15-controls>.top{position:static!important;margin:0!important;padding:0!important;background:none!important;border:0!important;min-height:44px;justify-content:flex-end!important}
.app[data-mmd-app-digital][data-lv15-world] .top>.brand{display:none!important}
.app[data-mmd-app-digital][data-lv15-world] .hero{margin:22px 0!important;padding:0 0 23px!important;border-bottom:1px solid var(--v15-line);background:none!important;border-radius:0!important;min-height:0!important;display:block!important}
.app[data-mmd-app-digital][data-lv15-world] .home-hero>img{display:none!important}
.app[data-mmd-app-digital][data-lv15-world] .hero:before,.app[data-mmd-app-digital][data-lv15-world] .hero:after{display:none!important}
.app[data-mmd-app-digital][data-lv15-world] .home-hero>div{position:static!important;inset:auto!important;min-height:0!important;padding:0!important;width:auto!important;background:none!important}
.app[data-mmd-app-digital][data-lv15-world] .hero h1{font:500 clamp(25px,3vw,36px)/1.4 var(--v15-ui)!important;color:var(--v15-ink)!important}
.app[data-mmd-app-digital][data-lv15-world] .hero-caption{display:none!important}
.app[data-mmd-app-digital][data-lv15-world] :is(.card,.snapshot,.tart,.empty,.history article){border-radius:0!important;box-shadow:none!important;background:transparent!important;border-color:var(--v15-line)!important;color:var(--v15-ink)!important}
.app[data-mmd-app-digital][data-lv15-world] :is(.card,.snapshot,.tart){border-width:0 0 1px!important}
.app[data-mmd-app-digital][data-lv15-world] .primary{background:var(--v15-accent)!important;color:var(--v15-button-ink)!important;border-color:transparent!important;border-radius:30px!important;font-size:14px!important;font-weight:500!important}
.app[data-mmd-app-digital][data-lv15-world] .secondary{background:var(--v15-panel)!important;color:var(--v15-ink)!important;border-color:var(--v15-line)!important;border-radius:30px!important;font-size:14px!important}
.app[data-mmd-app-digital][data-lv15-world] .quick{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:0!important;border-top:1px solid var(--v15-line)}
.app[data-mmd-app-digital][data-lv15-world] .quick a{min-height:94px!important;flex-direction:column!important;justify-content:center!important;gap:10px!important;border:0!important;border-bottom:1px solid var(--v15-line)!important;border-radius:0!important;background:none!important;padding:12px 5px!important;font:12px/1.5 var(--v15-ui)!important;text-align:center}
.app[data-mmd-app-digital][data-lv15-world] .quick a:after{display:none!important}
.app[data-mmd-app-digital][data-lv15-world] .quick i{color:var(--v15-accent)!important;margin:0!important}
.app[data-mmd-app-digital][data-lv15-world] :is(input,textarea,select){background:var(--v15-panel)!important;color:var(--v15-ink)!important;border-color:var(--v15-line)!important;font-size:16px!important}
.app[data-mmd-app-digital][data-lv15-world] :is(.sub,.label,.field label,.statusline,.snapshot p,.history span){color:var(--v15-muted)!important}
.app[data-mmd-app-digital][data-lv15-world] :is(.value,.history b,.sectionhead h2){color:var(--v15-ink)!important}
.app[data-mmd-app-digital][data-lv15-world] .seg button{background:var(--v15-panel)!important;color:var(--v15-muted)!important;border-color:var(--v15-line)!important}
.app[data-mmd-app-digital][data-lv15-world] .seg button.active{background:var(--v15-soft)!important;color:var(--v15-accent)!important}
/* Console: style existing runtime nodes and keep its original action/payout markup. */
#sigil-model-console-v3[data-lv15-world]{--ca-page:var(--v15-bg)!important;--ca-panel:var(--v15-panel)!important;--ca-raised:var(--v15-soft)!important;--ca-ink:var(--v15-ink)!important;--ca-muted:var(--v15-muted)!important;--ca-line:var(--v15-line)!important;--ca-brass:var(--v15-accent)!important;padding:0 0 125px!important}
#sigil-model-console-v3[data-lv15-world]>.lv15-masthead{width:min(1032px,calc(100% - 88px));margin:0 auto 20px}
#sigil-model-console-v3[data-lv15-world] .smcv3-shell{width:min(1032px,calc(100% - 88px))!important;padding-top:0!important}
#sigil-model-console-v3[data-lv15-world] .lv15-controls>.smcv3-head{position:static!important;inset:auto!important;background:none!important;border:0!important;margin:0!important;padding:0!important;min-height:44px!important;border-radius:0!important;flex-wrap:wrap!important}
#sigil-model-console-v3[data-lv15-world] .lv15-controls .smcv3-brand{display:none!important}
#sigil-model-console-v3[data-lv15-world] .smcv3-hero{display:none!important}
#sigil-model-console-v3[data-lv15-world] :is(.smcv3-card,.smcv3-state){background:transparent!important;border:0!important;border-bottom:1px solid var(--v15-line)!important;border-radius:0!important;padding:22px 0!important;margin-bottom:12px!important;box-shadow:none!important}
#sigil-model-console-v3[data-lv15-world] .smcv3-summary{isolation:isolate;position:relative;overflow:visible!important}
#sigil-model-console-v3[data-lv15-world] :is(.smcv3-h1,.smcv3-h2){font-family:var(--v15-ui)!important;font-weight:500!important;font-size:clamp(23px,3vw,32px)!important;line-height:1.4!important;color:var(--v15-ink)!important}
#sigil-model-console-v3[data-lv15-world] .smcv3-label{color:var(--v15-muted)!important}
#sigil-model-console-v3[data-lv15-world] .ca-accent{display:block!important;opacity:.10!important;width:150px!important;max-width:35%!important}
#sigil-model-console-v3[data-lv15-world] [data-primary-actions]>button{background:var(--v15-accent)!important;color:var(--v15-button-ink)!important;-webkit-text-fill-color:var(--v15-button-ink)!important;border-color:transparent!important;border-radius:30px!important;min-height:49px;font:500 14px/1.5 var(--v15-ui)!important}
#sigil-model-console-v3[data-lv15-world] [data-primary-actions]>button[data-action="decline_job"]{background:var(--v15-soft)!important;color:var(--v15-ink)!important;-webkit-text-fill-color:var(--v15-ink)!important;border:1px solid var(--v15-line)!important}
#sigil-model-console-v3[data-lv15-world] :is(.mmd-lang button,.smcv3-btn,.smcv3-chip){background:var(--v15-panel)!important;color:var(--v15-ink)!important;-webkit-text-fill-color:var(--v15-ink)!important;border-color:var(--v15-line)!important;border-radius:25px!important}
#sigil-model-console-v3[data-lv15-world] :is(input,textarea){background:var(--v15-panel)!important;color:var(--v15-ink)!important;-webkit-text-fill-color:var(--v15-ink)!important;border-color:var(--v15-line)!important}
#sigil-model-console-v3[data-lv15-world] .mt9{background:transparent!important;border:0!important;border-block:1px solid var(--v15-line)!important;border-radius:0!important;margin:22px 0;padding:20px 0!important}
#sigil-model-console-v3[data-lv15-world] .lv15-credits{max-width:1032px;margin:30px auto 0;width:calc(100% - 88px)}

#sigil-model-console-v3[data-lv15-world] .lv15-dock{position:fixed;z-index:40;left:50%;bottom:max(14px,env(safe-area-inset-bottom));transform:translateX(-50%);width:min(530px,calc(100% - 28px));display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;padding:6px;border:1px solid var(--v15-line);border-radius:60px;background:var(--v15-panel);backdrop-filter:blur(18px);box-shadow:0 10px 35px #00000014}
#sigil-model-console-v3[data-lv15-world] .lv15-dock a{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;min-height:58px;padding:7px 0;border-radius:40px;font:400 10px/1.4 var(--v15-ui);color:var(--v15-muted)!important;text-decoration:none}
#sigil-model-console-v3[data-lv15-world] .lv15-dock svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}
#sigil-model-console-v3[data-lv15-world] .lv15-dock [aria-current="page"]{background:var(--v15-soft);color:var(--v15-accent)!important}
/* Capsule navigation reuses the owner's real anchors. */
#mmd-model-home-v4[data-lv15-world] .mm-lv-dock,.app[data-mmd-app-digital][data-lv15-world] .dock{left:50%!important;right:auto!important;bottom:max(14px,env(safe-area-inset-bottom))!important;width:min(530px,calc(100% - 28px))!important;max-width:530px!important;min-height:0!important;padding:6px!important;transform:translateX(-50%)!important;border:1px solid var(--v15-line)!important;border-radius:60px!important;background:var(--v15-panel)!important;backdrop-filter:blur(18px);box-shadow:0 10px 35px #00000014}
#mmd-model-home-v4[data-lv15-world] .mm-lv-dock a,.app[data-mmd-app-digital][data-lv15-world] .dock a{min-height:58px!important;font-size:10px!important;font-weight:400!important;color:var(--v15-muted)!important;border-radius:40px!important}
#mmd-model-home-v4[data-lv15-world] .mm-lv-dock [aria-current="page"],.app[data-mmd-app-digital][data-lv15-world] .dock a.active{background:var(--v15-soft)!important;color:var(--v15-accent)!important}
[data-lv15-world] :is(a,button,input,select,textarea,summary):focus-visible{outline:2px solid var(--v15-accent)!important;outline-offset:4px}
[data-lv15-world] button:disabled{cursor:not-allowed;opacity:.55}
@media(max-width:650px){
[data-lv15-world] .lv15-masthead{padding:18px 0 22px;margin-bottom:22px}.lv15-topline{gap:8px!important}[data-lv15-world] .lv15-index{font-size:7px;letter-spacing:.12em}[data-lv15-world] .lv15-wordmark{gap:17px}[data-lv15-world] .lv15-my{font-size:clamp(27px,8.2vw,36px);padding:2px 0 10px}[data-lv15-world] .lv15-model{font-size:clamp(48px,17.2vw,78px)}[data-lv15-world] .lv15-slogan{font-size:14px}[data-lv15-world] .lv15-world-label{font-size:7px}[data-lv15-world] .lv15-parent-logo{width:48px;height:43px}[data-lv15-world="private"] .lv15-parent-logo{width:120px;height:72px}[data-lv15-world] .lv15-controls{gap:6px}[data-lv15-world] .lv15-topline{min-height:54px;padding-bottom:13px;margin-bottom:22px}
#mmd-model-home-v4[data-lv15-world] .mmhome-shell,.app[data-mmd-app-digital][data-lv15-world]>.shell{padding-left:24px!important;padding-right:24px!important}
#mmd-model-home-v4[data-lv15-world] .mm-lv-quick a,.app[data-mmd-app-digital][data-lv15-world] .quick a{font-size:10px!important;min-height:85px!important;padding-inline:3px!important}
#sigil-model-console-v3[data-lv15-world]>.lv15-masthead,#sigil-model-console-v3[data-lv15-world] .smcv3-shell{width:calc(100% - 48px)!important}#sigil-model-console-v3[data-lv15-world] .lv15-credits{width:calc(100% - 48px)}
#sigil-model-console-v3[data-lv15-world] .lv15-topline{flex-wrap:wrap;align-items:center}#sigil-model-console-v3[data-lv15-world] .lv15-controls{margin-left:auto}#sigil-model-console-v3[data-lv15-world] .mmd-lang button{min-width:40px!important;min-height:40px!important}
}
@media(max-width:350px){[data-lv15-world] .lv15-wordmark{gap:14px}[data-lv15-world] .lv15-model{font-size:17vw}[data-lv15-world] .lv15-my{font-size:27px}[data-lv15-world] .lv15-index{font-size:6px}#mmd-model-home-v4[data-lv15-world] .mmhome-shell,.app[data-mmd-app-digital][data-lv15-world]>.shell{padding-inline:20px!important}#sigil-model-console-v3[data-lv15-world]>.lv15-masthead,#sigil-model-console-v3[data-lv15-world] .smcv3-shell{width:calc(100% - 40px)!important}}
@media(prefers-reduced-motion:reduce){[data-lv15-world],[data-lv15-world] *,[data-lv15-world] *:before,[data-lv15-world] *:after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}

/* Keep the editorial app mark above legacy Webflow font resets. */
[data-lv15-world] .lv15-model{font-family:var(--v15-display)!important;font-weight:400!important;line-height:1.08!important}
[data-lv15-world] .lv15-my,[data-lv15-world] .lv15-slogan{font-family:var(--v15-display)!important;font-style:italic!important;font-weight:400!important}
[data-lv15-world=public]{--v15-display:"Canela","Playfair Display",Georgia,serif}

body[data-lv15-canvas]{background:#f8f7f4!important}body[data-lv15-canvas=private]{background:#0b0f10!important}
.app[data-mmd-app-digital][data-lv15-world] :is(.sub,.value,.row p,.card p,.empty){font-size:14px!important;line-height:1.7!important;color:var(--v15-muted)!important}
.app[data-mmd-app-digital][data-lv15-world] .value{color:var(--v15-ink)!important;font-weight:500!important}
.app[data-mmd-app-digital][data-lv15-world] :is(.sectionhead h2,.name){font-size:21px!important;line-height:1.4!important}
.app[data-mmd-app-digital][data-lv15-world] :is(.label,.statusline,.sectionhead>span){font-size:11px!important;color:var(--v15-muted)!important}
.app[data-mmd-app-digital][data-lv15-world] :is(input,select,textarea){font-size:16px!important;background:var(--v15-panel)!important;color:var(--v15-ink)!important;border-color:var(--v15-line)!important}

/* Inner screens keep the LV15 wall while prioritizing the existing next action. */
:is(#sigil-model-console-v3,.app[data-mmd-app-digital])[data-lv15-world] :is(.lv15-index,.lv15-brandline){display:none!important}
:is(#sigil-model-console-v3,.app[data-mmd-app-digital])[data-lv15-world] .lv15-masthead{padding-bottom:19px;margin-bottom:20px}
:is(#sigil-model-console-v3,.app[data-mmd-app-digital])[data-lv15-world] .lv15-topline{margin-bottom:16px}
:is(#sigil-model-console-v3,.app[data-mmd-app-digital])[data-lv15-world] .lv15-model{font-size:66px}
:is(#sigil-model-console-v3,.app[data-mmd-app-digital])[data-lv15-world] .lv15-my{font-size:27px;padding-top:2px;padding-bottom:7px}
@media(max-width:650px){:is(#sigil-model-console-v3,.app[data-mmd-app-digital])[data-lv15-world] .lv15-model{font-size:48px}:is(#sigil-model-console-v3,.app[data-mmd-app-digital])[data-lv15-world] .lv15-my{font-size:22px}}

[data-lv15-world=public] .lv15-masthead:before{background:url("https://s3.amazonaws.com/webflow-prod-assets/68f879d546d2f4e2ab186e90/6aa3942052d84281cd18f80d_MMD%20Academy%20front.webp") center/cover;opacity:.025;filter:grayscale(1)}
`;

export function installModelLv15(doc = document) {
  const win = doc.defaultView;
  if (!win) return null;
  const roots = Array.from(doc.querySelectorAll('#mmd-model-home-v4,#sigil-model-console-v3,.app[data-mmd-app-digital]'));
  const skyline = '<svg class="lv15-skyline" viewBox="0 0 700 200" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true" focusable="false"><path d="M0 190h700M20 190V96h35v94m12 0V60h26v130m15 0V32h38v158m13 0V100h21v90m16 0V78h26v112m11 0V6h27v184m15 0V112h32v78m15 0V88h27v102m16 0V45h36v145m19 0V119h33v71m16 0V85h30v105m15 0V25h26v165m17 0V130h34v60m15 0V99h30v91m14 0V59h41v131"/></svg>';
  const accent = '<svg class="lv15-accent" viewBox="0 0 180 100" fill="none" stroke="currentColor" stroke-width=".8" aria-hidden="true" focusable="false"><path d="M9 90h164M22 90V45l29-18v63m0-44 40-24 38 24v44M91 22V7m0 0 59 35v48M66 90V59h20v31m15 0V59h15v31M34 48v14m0 7v14M137 45v38M9 96h164"/><path d="M4 36h25m113-20h30M162 9v14"/></svg>';
  function lane(session) {
    if (!session || typeof session !== 'object' || !session.session_id) return 'neutral';
    const work = String(session.model_work_lane || '').trim().toLowerCase();
    const money = String(session.payout_terms?.money_lane || '').trim().toLowerCase();
    if (money && money !== work) return 'neutral';
    return work === 'public_model' ? 'public' : work === 'private_model' ? 'private' : 'neutral';
  }
  function updateRoot(root, world) {
    world = ['public', 'private'].includes(world) ? world : 'neutral';
    if (root.dataset.lv15World !== world) root.dataset.lv15World = world;
    doc.body.dataset.lv15Canvas = world;
    const privateWorld = world === 'private';
    const logo = root.querySelector('.lv15-parent-logo');
    if (logo) {
      const url = privateWorld
        ? 'https://s3.amazonaws.com/webflow-prod-assets/68f879d546d2f4e2ab186e90/6a0798f3b04827b18da9c500_LOGO%20SIGIL%20small.webp'
        : 'https://s3.amazonaws.com/webflow-prod-assets/68f879d546d2f4e2ab186e90/6a8ea257c27c93043f03e65c_04-mmd-prive-compact-m-symbol-gold.webp';
      if (logo.getAttribute('src') !== url) logo.src = url;
      logo.alt = privateWorld ? 'SĪGIL System' : 'MMD Privé';
    }
    const label = root.querySelector('.lv15-world-label');
    if (label) label.textContent = privateWorld ? 'PRIVATE / SĪGIL' : world === 'public' ? 'PUBLIC / MMD' : 'MY MODEL WORKSPACE';
    const credit = root.querySelector('.lv15-credit');
    if (credit) credit.textContent = privateWorld ? 'SĪGIL system design by Per' : 'create and design by Per MMD';
    const tagline = root.querySelector('.lv15-tagline');
    if (tagline) tagline.hidden = privateWorld;
  }
  for (const root of roots) {
    if (root.dataset.lv15Installed === '1') continue;
    root.dataset.lv15Installed = '1';
    const isConsole = root.id === 'sigil-model-console-v3';
    const isHome = root.id === 'mmd-model-home-v4';
    const shell = root.querySelector(isConsole ? '.smcv3-shell' : isHome ? '.mmhome-shell' : '.shell') || root;
    const oldHead = root.querySelector(isConsole ? '.smcv3-head' : isHome ? '.mm-lv-header' : '.top');
    const masthead = doc.createElement('header');
    masthead.className = 'lv15-masthead';
    masthead.innerHTML = '<div class="lv15-rain" aria-hidden="true"></div><div class="lv15-topline"><img class="lv15-parent-logo" alt="MMD Privé" width="54" height="45"><div class="lv15-controls"></div></div><div class="lv15-index"><span>DIGITAL MODEL WORKSPACE</span><span>BANGKOK / TH</span></div><a class="lv15-wordmark" href="/sigil/model/dashboard" aria-label="MY MODEL Home"><span class="lv15-my" lang="en">MY</span><span class="lv15-model" lang="en">MODEL</span></a><div class="lv15-brandline"><p class="lv15-slogan" lang="en">Your work.<br>In focus.</p><span class="lv15-world-label"></span></div>' + skyline;
    if (oldHead) masthead.querySelector('.lv15-controls').append(oldHead);
    (isConsole ? root : shell).prepend(masthead);
    const credits = doc.createElement('footer');
    credits.className = 'lv15-credits';
    credits.innerHTML = '<strong>MY MODEL</strong><p class="lv15-credit"></p><p class="lv15-tagline">Discreet by Desire. Elegant by Choice.</p>';
    shell.append(credits);
    if (isConsole) {
      const dock = doc.createElement('nav');
      dock.className = 'lv15-dock';
      dock.setAttribute('aria-label', 'MY MODEL navigation');
      const navItems = [
        ['/sigil/model/dashboard', 'HOME', '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>'],
        ['/sigil/model/dashboard/jobs', 'JOBS', '<rect x="4" y="6" width="16" height="15" rx="2"/><path d="M9 6V3h6v3M4 11h16"/>'],
        ['#sigil-model-console-v3', 'CONSOLE', '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7 9 3 3-3 3M13 15h4"/>'],
        ['/sigil/model/dashboard/more', 'YOU', '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>'],
      ];
      for (const [href, label, paths] of navItems) {
        const link = doc.createElement('a');
        link.href = href;
        if (label === 'CONSOLE') link.setAttribute('aria-current', 'page');
        link.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + paths + '</svg><span>' + label + '</span>';
        dock.append(link);
      }
      root.append(dock);
    }
    // Graphics use their own non-interactive nodes, never replace job/form contents.
    for (const target of root.querySelectorAll(isConsole ? '.smcv3-summary' : isHome ? '.mm-lv-work' : '.snapshot,.tart')) {
      if (target.querySelector('.lv15-accent')) continue;
      target.style.position = target.style.position || 'relative';
      target.style.isolation = 'isolate';
      target.insertAdjacentHTML('afterbegin', accent);
    }
    const stateHost = root.querySelector(isConsole ? '[data-view="work"]' : isHome ? '[data-mm-workspace]' : '#active');
    const fromOwner = () => {
      const ownerWorld = isConsole ? root.dataset.consoleLane : isHome ? root.dataset.mmLvLane : root._lv15SessionWorld;
      const recovering = !stateHost || stateHost.hidden || (!isConsole && !isHome && root.querySelector('#identity')?.textContent !== 'LINE · VERIFIED');
      updateRoot(root, recovering ? 'neutral' : ownerWorld);
    };
    if (!isConsole && !isHome) {
      const identityHost = root.querySelector('#identity');
      if (identityHost) {
        const identityObserver = new win.MutationObserver(fromOwner);
        identityObserver.observe(identityHost, {childList:true,subtree:true,characterData:true});
        root._lv15IdentityObserver = identityObserver;
      }
    }
    root._lv15Sync = fromOwner;
    fromOwner();
    if (isConsole || isHome) {
      const observer = new win.MutationObserver(fromOwner);
      observer.observe(root, { attributes: true, attributeFilter: [isConsole ? 'data-console-lane' : 'data-mm-lv-lane'] });
      root._lv15Observer = observer;
    }
    if (stateHost) {
      const visibility = new win.MutationObserver(fromOwner);
      visibility.observe(stateHost, { attributes: true, attributeFilter: ['hidden'] });
      root._lv15VisibilityObserver = visibility;
    }
  }
  const api = {
    update(session) {
      const world = lane(session);
      for (const root of roots) {
        if (!root.matches('.app[data-mmd-app-digital]')) continue;
        root._lv15SessionWorld = world;
        root._lv15Sync?.();
      }
    },
  };
  win.MMDLv15 = api;
  return api;
}

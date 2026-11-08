// A complete, scoped internal surface. The renderer marks it as already themed
// so the shared Worker decorator does not add another navigation shell.
export const ADMIN_CONSOLE_STYLES = String.raw`
@font-face{font-family:"LINE Seed Sans TH";src:url("https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a619dd598baf067153fd1cc_LINESeedSansTH_W_Rg.woff2") format("woff2");font-style:normal;font-weight:400;font-display:swap}
@font-face{font-family:"LINE Seed Sans TH";src:url("https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a619dd4dc8d84b48cc84959_LINESeedSansTH_W_Bd.woff2") format("woff2");font-style:normal;font-weight:700;font-display:swap}
html{color-scheme:light;scroll-padding-top:20px}
body.ac-page{margin:0;background:#fff;color:#272b30;-webkit-font-smoothing:antialiased}
#admin-console{--ac-ink:#272b30;--ac-muted:#545c66;--ac-line:#c7ccd2;--ac-soft:#f3f4f6;--ac-orange:#fed7aa;--ac-rust:#9a4a0b;--ac-focus:#9a4a0b;font:400 16px/1.55 "LINE Seed Sans TH","Noto Sans Thai",system-ui,-apple-system,"Segoe UI",sans-serif;font-synthesis:none;min-height:100svh}
#admin-console *,#admin-console *::before,#admin-console *::after{box-sizing:border-box}
#admin-console [hidden]{display:none!important}
#admin-console :is(h1,h2,h3,p,dl,dd){margin:0}
#admin-console :is(button,input,select,textarea){font:inherit;color:inherit}
#admin-console :is(button,a,input,summary){-webkit-tap-highlight-color:transparent}
#admin-console a{color:inherit;text-decoration:none}
#admin-console button{cursor:pointer}
#admin-console button:disabled{cursor:not-allowed}
#admin-console :focus-visible,.ac-skip:focus-visible{outline:3px solid #9a4a0b;outline-offset:3px}
#admin-console svg{display:block;flex-shrink:0}
#admin-console .ac-icon{width:20px;height:20px}
#admin-console .ac-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.ac-skip{position:fixed;z-index:20;left:12px;top:12px;transform:translateY(-160%);padding:10px 16px;background:#272b30;color:#fff;font:16px/1.5 "LINE Seed Sans TH",system-ui,sans-serif;border-radius:8px;text-decoration:none}
.ac-skip:focus{transform:translateY(0)}
#admin-console.ac-shell{display:grid;grid-template-columns:minmax(0,1fr)}
#admin-console .ac-workspace{min-width:0}
#admin-console .ac-sidebar{display:none}
#admin-console .ac-header{position:relative;min-height:64px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;border-bottom:1px solid var(--ac-line);background:#fff}
#admin-console .ac-mobile-brand svg{width:156px;height:auto}
#admin-console .ac-breadcrumb{display:none;align-items:center;gap:12px;color:var(--ac-muted);font-size:14px}
#admin-console .ac-breadcrumb a:hover{text-decoration:underline;text-underline-offset:4px}
#admin-console .ac-breadcrumb [aria-current]{color:var(--ac-ink)}
#admin-console .ac-header-actions{display:flex;align-items:center;gap:8px}
#admin-console .ac-owner-note{display:none;align-items:center;gap:7px;font-size:14px;color:var(--ac-muted)}
#admin-console .ac-owner-note .ac-icon{width:16px;height:16px}
#admin-console .ac-button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;max-width:100%;padding:9px 14px;border:1px solid var(--ac-line);border-radius:9px;font-size:15px;font-weight:700;line-height:1.5;white-space:normal;text-align:center;transition:background .14s ease,border-color .14s ease}
#admin-console .ac-button-primary{background:var(--ac-orange);border-color:#c47a38;color:var(--ac-ink)}
#admin-console .ac-button-quiet{background:#fff;color:var(--ac-ink)}
#admin-console .ac-button:disabled{background:#f3f4f6;color:var(--ac-muted);border-color:var(--ac-line);opacity:1}
#admin-console .ac-main{max-width:1490px;margin:0 auto;padding:20px 16px 22px}
#admin-console .ac-main:focus{outline:none}
#admin-console .ac-tool-bar{margin-bottom:12px}
#admin-console .ac-tool-frame{display:block;width:100%;height:calc(100dvh - 150px);min-height:360px;border:1px solid var(--ac-line);border-radius:12px;background:#fff}
#admin-console .ac-heading{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px 12px;margin-bottom:20px}
#admin-console .ac-heading-copy{min-width:0}
#admin-console .ac-eyebrow{display:flex;align-items:center;flex-wrap:wrap;gap:8px;color:var(--ac-muted);font-size:13px;line-height:1.5;min-height:20px}
#admin-console .ac-timezone{display:none;font-family:Outfit,"LINE Seed Sans TH",sans-serif;font-size:10px;font-weight:700;letter-spacing:.12em}
#admin-console h1{font-family:Outfit,"LINE Seed Sans TH",system-ui,sans-serif;font-size:32px;line-height:1.15;font-weight:700;letter-spacing:-.035em;margin-top:6px}
#admin-console .ac-description{grid-column:1/-1;color:var(--ac-muted);font-size:15px;max-width:650px}
#admin-console .ac-create{flex-shrink:0;align-self:center;margin-top:12px}
#admin-console .ac-create .ac-icon{width:18px;height:18px}
#admin-console .ac-mobile-tools{border:1px solid var(--ac-line);border-radius:9px;background:#fff}
#admin-console .ac-mobile-tools>summary{display:flex;align-items:center;justify-content:center;gap:10px;width:42px;min-height:42px;padding:10px;font-size:15px;font-weight:700;cursor:pointer;list-style:none}
#admin-console .ac-mobile-tools[open]>summary{background:#fff0de;border-radius:9px;color:var(--ac-rust)}
#admin-console :is(.ac-mobile-tools,.ac-more-tools,.ac-job-details)>summary::-webkit-details-marker{display:none}
#admin-console .ac-disclosure-icon{margin-left:auto;transition:transform .14s ease}
#admin-console details[open]>summary>.ac-disclosure-icon{transform:rotate(180deg)}
#admin-console .ac-mobile-tools>nav{position:absolute;z-index:10;right:12px;top:calc(100% + 6px);width:min(390px,calc(100% - 24px));max-height:calc(100svh - 88px);overflow:auto;display:grid;grid-template-columns:minmax(0,1fr);gap:2px;padding:8px;border:1px solid var(--ac-line);border-radius:11px;background:#fff;box-shadow:0 10px 28px rgb(39 43 48 / .10)}
#admin-console .ac-nav-link{display:flex;align-items:center;gap:11px;min-height:44px;padding:10px 12px;border-radius:8px;font-size:15px;line-height:1.45;overflow-wrap:anywhere}
#admin-console .ac-nav-link>.ac-icon{width:18px;height:18px;color:var(--ac-muted)}
#admin-console .ac-nav-link[aria-current=page]{background:#fff0de;color:var(--ac-rust);font-weight:700;box-shadow:inset 3px 0 var(--ac-rust)}
#admin-console .ac-nav-link[aria-current=page]>.ac-icon{color:var(--ac-rust)}
#admin-console .ac-overview{margin-bottom:24px}
#admin-console .ac-section-caption{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:2px 12px;margin-bottom:10px}
#admin-console .ac-section-caption h2{font-size:14px;font-weight:700}
#admin-console .ac-section-caption p{font-size:12px;line-height:1.5;color:var(--ac-muted)}
#admin-console .ac-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border:1px solid var(--ac-line);border-radius:12px;background:#fff;overflow:hidden}
#admin-console .ac-metric{position:relative;min-width:0;padding:13px 16px;border-bottom:1px solid var(--ac-line)}
#admin-console .ac-metric:nth-child(odd){border-right:1px solid var(--ac-line)}
#admin-console .ac-metric:nth-last-child(-n+2){border-bottom:0}
#admin-console .ac-metric dt{font-size:14px;color:var(--ac-muted);line-height:1.45}
#admin-console .ac-metric dd{font-family:Outfit,"LINE Seed Sans TH",sans-serif;font-size:28px;line-height:1.2;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:-.025em;margin-top:5px;overflow-wrap:anywhere}
#admin-console .ac-metric:first-child dd{color:var(--ac-rust)}
#admin-console .ac-content-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:24px;align-items:start}
#admin-console .ac-board{min-width:0;border:1px solid var(--ac-line);border-radius:12px;background:#fff;overflow:hidden}
#admin-console .ac-board-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:19px 16px 16px}
#admin-console h2{font-size:19px;line-height:1.4;font-weight:700;letter-spacing:-.01em}
#admin-console .ac-period-label{font-size:13px;line-height:1.5;color:var(--ac-rust);background:#fff0de;border-radius:5px;padding:4px 8px;overflow-wrap:anywhere}
#admin-console .ac-period-label:empty{display:none}
#admin-console .ac-filters{display:grid;grid-template-columns:minmax(0,1fr);gap:15px;padding:0 16px 17px}
#admin-console .ac-filters label{display:block;font-size:14px;font-weight:700;margin-bottom:6px}
#admin-console .ac-date-controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
#admin-console .ac-date-controls>input[type=date]{flex:1 1 calc(10ch + 3em);width:auto;min-width:min(100%,calc(10ch + 3em))}
#admin-console input{min-width:0;width:100%;max-width:100%;min-height:44px;padding:10px 11px;border:1px solid #929ba6;border-radius:8px;background:#fff;color:var(--ac-ink);font-size:16px;line-height:1.4}
#admin-console input::placeholder{color:#69727e;opacity:1}
#admin-console input[type=date]{font-variant-numeric:tabular-nums;padding:9px 10px}
#admin-console input[type=date]::-webkit-date-and-time-value{text-align:left;min-width:0}
#admin-console .ac-date-options{display:flex;gap:4px}
#admin-console .ac-choice{min-height:44px;padding:8px 10px;border:1px solid var(--ac-line);border-radius:8px;background:#fff;font-size:14px;font-weight:700;line-height:1.4;white-space:nowrap}
#admin-console .ac-choice[aria-pressed=true]{background:#fff0de;color:var(--ac-rust);border-color:#b87944;box-shadow:inset 0 0 0 1px #b87944}
#admin-console .ac-search-controls{display:flex;align-items:stretch;gap:8px}
#admin-console .ac-search-input{position:relative;display:flex;flex:1;min-width:0}
#admin-console .ac-search-input>.ac-icon{position:absolute;top:12px;left:11px;width:18px;height:18px;color:var(--ac-muted);pointer-events:none}
#admin-console .ac-search-input>input{padding-left:36px}
#admin-console .ac-search-controls>.ac-button{flex-shrink:0;padding-left:13px;padding-right:13px}
#admin-console .ac-search-hint{display:block;font-size:12px;color:var(--ac-muted);margin-top:5px}
#admin-console .ac-scope{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:12px 16px;border-top:1px solid var(--ac-line);background:#fff8ef;font-size:14px}
#admin-console .ac-scope>div{display:grid;gap:3px;min-width:0}
#admin-console .ac-scope-text,#admin-console #ac-scope-text{color:var(--ac-muted);overflow-wrap:anywhere;font-size:13px}
#admin-console .ac-scope .ac-text-button{flex-shrink:0;max-width:100px;text-align:right}
#admin-console .ac-results-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:46px;padding:7px 16px;border-top:1px solid var(--ac-line);background:#f8f9fa}
#admin-console .ac-results-meta p{font-size:13px;color:var(--ac-muted);line-height:1.5;font-variant-numeric:tabular-nums}
#admin-console .ac-text-button{min-height:40px;padding:6px 0;background:none;border:0;color:var(--ac-rust);font-size:13px;font-weight:700;text-underline-offset:4px;line-height:1.4}
#admin-console .ac-text-button:hover{text-decoration:underline}
#admin-console .ac-progress{display:block;width:100%;height:3px;margin:0;border:0;border-radius:0;accent-color:var(--ac-rust)}
#admin-console .ac-progress::-webkit-progress-bar{background:#f1e9de}
#admin-console .ac-progress::-webkit-progress-value{background:var(--ac-rust)}
#admin-console .ac-progress::-moz-progress-bar{background:var(--ac-rust)}
#admin-console .ac-loading{display:flex;align-items:center;justify-content:center;gap:12px;min-height:175px;padding:24px 20px;color:var(--ac-muted);font-size:15px}
#admin-console .ac-loading-mark{width:20px;height:20px;border:2px solid #e4d0bb;border-top-color:var(--ac-rust);border-radius:50%;animation:ac-spin .8s linear infinite;flex-shrink:0}
@keyframes ac-spin{to{transform:rotate(360deg)}}
#admin-console .ac-notice{display:flex;align-items:flex-start;gap:12px;margin:16px;padding:18px;border:1px solid #b27d85;background:#fff8f8;border-radius:10px}
#admin-console .ac-notice>.ac-icon{color:#a12535;margin-top:3px}
#admin-console .ac-notice>div{min-width:0}
#admin-console .ac-notice h3{font-size:17px;line-height:1.5;margin-bottom:5px}
#admin-console .ac-notice p{font-size:15px;color:var(--ac-muted);overflow-wrap:anywhere}
#admin-console .ac-notice-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}
#admin-console .ac-jobs{list-style:none;margin:0;padding:0}
#admin-console .ac-job{padding:17px 16px 0;border-top:1px solid var(--ac-line)}
#admin-console .ac-job:first-child{border-top:0}
#admin-console .ac-job-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:13px 10px;min-width:0}
#admin-console .ac-job-time{grid-column:1;grid-row:1;min-width:0;align-self:center}
#admin-console .ac-job-time strong{display:inline-block;font-size:20px;line-height:1.25;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
#admin-console .ac-job-time strong.ac-time-unknown{font-size:14px;line-height:1.5;color:var(--ac-muted);letter-spacing:0}
#admin-console .ac-job-time span{display:block;color:var(--ac-muted);font-size:13px;margin-top:3px;line-height:1.45}
#admin-console .ac-job-people{grid-column:1/-1;grid-row:2;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;min-width:0}
#admin-console .ac-person{display:grid;gap:3px;min-width:0;align-content:start}
#admin-console .ac-field-label{font-size:12px;font-weight:400;line-height:1.45;color:var(--ac-muted)}
#admin-console .ac-person strong{font-size:16px;font-weight:700;line-height:1.5;overflow-wrap:anywhere}
#admin-console .ac-job-state{grid-column:1/-1;grid-row:3;display:flex;align-items:center;flex-wrap:wrap;gap:7px 10px;min-width:0}
#admin-console .ac-status-pill{display:inline-block;max-width:100%;padding:3px 8px;border-radius:5px;background:#edf0f3;color:#454b54;font-size:13px;font-weight:700;line-height:1.5;overflow-wrap:anywhere}
#admin-console .ac-status-pill[data-tone=warm]{background:#fff0de;color:#895209}
#admin-console .ac-status-pill[data-tone=green]{background:#edf6f0;color:#286442}
#admin-console .ac-status-pill[data-tone=red]{background:#fff0f2;color:#a12535}
#admin-console .ac-payment-state{color:var(--ac-muted);font-size:13px;line-height:1.5;overflow-wrap:anywhere}
#admin-console .ac-job-amount{grid-column:1/-1;grid-row:4;display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 9px;min-width:0}
#admin-console .ac-job-amount>strong{font-size:18px;line-height:1.45;font-variant-numeric:tabular-nums;overflow-wrap:anywhere;letter-spacing:-.015em}
#admin-console .ac-job-amount>small{font-size:13px;line-height:1.45;color:var(--ac-muted);margin-left:auto;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
#admin-console .ac-job-go{grid-column:2;grid-row:1;align-self:center;max-width:125px}
#admin-console .ac-open-job{min-height:44px;font-size:14px;padding:8px 12px;background:#fff0de;border-color:#d6b391}
#admin-console .ac-open-job .ac-icon{width:16px;height:16px}
#admin-console .ac-unavailable-link{font-size:13px;line-height:1.5;color:#a12535;text-align:right;display:block}
#admin-console .ac-job-details{margin-top:13px;border-top:1px dashed #d7dce2}
#admin-console .ac-job-details>summary{display:flex;align-items:center;gap:8px;min-height:44px;cursor:pointer;list-style:none;color:var(--ac-muted);font-size:13px;font-weight:700}
#admin-console .ac-job-details>summary .ac-icon{width:16px;height:16px;margin-left:auto;transition:transform .14s ease}
#admin-console .ac-job-details[open]>summary .ac-icon{transform:rotate(180deg)}
#admin-console .ac-job-detail-body{padding:3px 0 17px}
#admin-console .ac-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px 13px}
#admin-console .ac-fact{min-width:0}
#admin-console .ac-fact dt{font-size:12px;color:var(--ac-muted);line-height:1.5}
#admin-console .ac-fact dd{font-size:14px;line-height:1.55;margin-top:3px;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
#admin-console .ac-fact dd.ac-reference{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;line-height:1.65}
#admin-console .ac-detail-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:17px}
#admin-console .ac-detail-actions a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:8px 12px;border:1px solid var(--ac-line);border-radius:7px;color:var(--ac-rust);font-size:14px;font-weight:700;line-height:1.5}
#admin-console .ac-empty{text-align:center;padding:32px 22px 35px;max-width:520px;margin:0 auto}
#admin-console .ac-empty-icon{display:flex;align-items:center;justify-content:center;width:44px;height:44px;margin:0 auto 12px;border:1px solid var(--ac-line);border-radius:12px;background:#f8f9fa;color:var(--ac-muted)}
#admin-console .ac-empty h3{font-size:18px;line-height:1.5;margin-bottom:7px}
#admin-console .ac-empty p{font-size:15px;color:var(--ac-muted);line-height:1.6;margin-bottom:17px}
#admin-console .ac-pagination{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:8px;padding:15px 16px;border-top:1px solid var(--ac-line)}
#admin-console .ac-pagination>span{text-align:center;font-size:13px;line-height:1.45;color:var(--ac-muted);font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
#admin-console .ac-pagination .ac-button{font-size:14px;padding:8px 11px}
#admin-console .ac-board-note{padding:13px 16px;background:#f8f9fa;border-top:1px solid var(--ac-line);color:var(--ac-muted);font-size:12px;line-height:1.6}
#admin-console .ac-tools-panel{display:none}
#admin-console .ac-footer{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px 18px;margin-top:20px;color:var(--ac-muted);font-size:12px;line-height:1.6;padding-bottom:env(safe-area-inset-bottom,0px)}
@media(min-width:360px) and (max-width:599px){
  #admin-console .ac-metrics{grid-template-columns:repeat(4,minmax(0,1fr))}
  #admin-console .ac-metric{padding:12px 10px;border-bottom:0;border-right:1px solid var(--ac-line)}
  #admin-console .ac-metric:last-child{border-right:0}
  #admin-console .ac-metric dt{font-size:12px;line-height:1.5}
  #admin-console .ac-metric dd{font-size:27px;margin-top:4px}
}
@media(hover:hover){
  #admin-console .ac-button-primary:hover{background:#fdc88e;border-color:#9a4a0b}
  #admin-console .ac-button-quiet:hover,#admin-console .ac-choice:hover,#admin-console .ac-detail-actions a:hover{background:#f3f4f6;border-color:#929ba6}
  #admin-console .ac-nav-link:hover{background:#f3f4f6}
  #admin-console .ac-open-job:hover{background:#fed7aa;border-color:#c47a38}
  #admin-console .ac-tool-link:hover .ac-tool-copy strong,#admin-console .ac-system-link:hover strong{color:var(--ac-rust)}
}
@media(max-width:359px){
  #admin-console .ac-main{padding:20px 12px}
  #admin-console .ac-header{padding:9px 12px}
  #admin-console .ac-mobile-brand svg{width:137px}
  #admin-console .ac-header .ac-button{font-size:14px;padding:8px 10px}
  #admin-console .ac-description{font-size:14px}
  #admin-console .ac-create{font-size:14px;padding:9px 10px;gap:5px}
  #admin-console .ac-date-controls{display:grid;grid-template-columns:minmax(0,1fr)}
  #admin-console .ac-date-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}
  #admin-console .ac-job-amount>small{margin-left:0;width:100%}
  #admin-console .ac-pagination .ac-button{font-size:13px;padding:8px 9px}
}
@media(min-width:600px){
  #admin-console .ac-main{padding:28px 24px}
  #admin-console .ac-header{padding-left:24px;padding-right:24px}
  #admin-console .ac-owner-note{display:flex}
  #admin-console .ac-timezone{display:inline-block}
  #admin-console .ac-heading{margin-bottom:25px}
  #admin-console h1{font-size:36px}
  #admin-console .ac-create{margin-top:19px}
  #admin-console .ac-mobile-tools>nav{width:430px;grid-template-columns:repeat(2,minmax(0,1fr))}
  #admin-console .ac-metrics{grid-template-columns:repeat(4,minmax(0,1fr))}
  #admin-console .ac-metric{padding:16px 20px;border-bottom:0;border-right:1px solid var(--ac-line)}
  #admin-console .ac-metric:last-child{border-right:0}
  #admin-console .ac-metric dd{font-size:32px}
  #admin-console .ac-board-heading{padding:21px 22px 17px}
  #admin-console .ac-filters{padding:0 22px 19px}
  #admin-console :is(.ac-results-meta,.ac-scope,.ac-pagination,.ac-board-note){padding-left:22px;padding-right:22px}
  #admin-console .ac-job{padding-left:22px;padding-right:22px}
}
@media(min-width:780px){
  #admin-console .ac-filters{grid-template-columns:minmax(0,.9fr) minmax(0,1.15fr);gap:20px}
  #admin-console .ac-date-controls{display:grid;grid-template-columns:minmax(0,1fr)}
  #admin-console .ac-date-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}
  #admin-console .ac-search-field{align-self:start}
  #admin-console .ac-job-row{grid-template-columns:94px minmax(0,1.3fr) minmax(100px,.9fr) minmax(105px,.85fr) auto;gap:16px;align-items:start}
  #admin-console .ac-job-time{grid-column:1;grid-row:1;align-self:start;padding-top:3px}
  #admin-console .ac-job-people{grid-column:2;grid-row:1;display:grid;grid-template-columns:minmax(0,1fr);gap:9px}
  #admin-console .ac-person{gap:1px}
  #admin-console .ac-job-state{grid-column:3;grid-row:1;display:flex;align-items:flex-start;flex-direction:column;gap:7px;padding-top:4px}
  #admin-console .ac-job-amount{grid-column:4;grid-row:1;display:grid;gap:3px;padding-top:2px}
  #admin-console .ac-job-amount>small{margin-left:0;font-size:12px}
  #admin-console .ac-job-go{grid-column:5;grid-row:1;align-self:start;padding-top:3px}
  #admin-console .ac-open-job{padding:8px 10px}
  #admin-console .ac-open-job>.ac-icon{display:none}
  #admin-console .ac-facts{grid-template-columns:repeat(3,minmax(0,1fr));gap:15px 22px}
  #admin-console .ac-job-details{margin-top:15px}
}
@media(min-width:1100px){
  #admin-console.ac-shell{grid-template-columns:208px minmax(0,1fr)}
  #admin-console .ac-sidebar{position:sticky;top:0;display:flex;flex-direction:column;min-width:0;height:100svh;max-height:100svh;overflow:auto;padding:25px 14px 18px;border-right:1px solid var(--ac-line);background:#fbfbfc}
  #admin-console .ac-brand{display:block;padding:3px 9px 0;margin-bottom:30px}
  #admin-console .ac-brand svg{width:162px;height:auto;max-width:100%}
  #admin-console .ac-sidebar-caption{padding:0 11px;margin-bottom:11px;color:var(--ac-muted);font-family:Outfit,"LINE Seed Sans TH",sans-serif;font-size:10px;font-weight:700;letter-spacing:.13em}
  #admin-console .ac-nav{display:grid;gap:5px}
  #admin-console .ac-nav-link{font-size:14px;padding:11px 11px;gap:10px;min-height:46px}
  #admin-console .ac-room-link{display:flex;align-items:center;gap:10px;margin-top:25px;padding:17px 11px;border-top:1px solid var(--ac-line);font-size:14px}
  #admin-console .ac-room-link .ac-icon{width:17px;height:17px}
  #admin-console .ac-room-link .ac-icon:last-child{margin-left:auto}
  #admin-console .ac-sidebar-bottom{display:flex;align-items:center;gap:9px;color:var(--ac-muted);margin-top:auto;padding:26px 11px 0}
  #admin-console .ac-sidebar-bottom strong{display:block;font-size:13px;font-weight:400}
  #admin-console .ac-sidebar-bottom small{display:block;font-size:11px;line-height:1.5;margin-top:2px}
  #admin-console .ac-sidebar-bottom>.ac-icon{width:16px;height:16px}
  #admin-console .ac-mobile-brand,#admin-console .ac-mobile-tools{display:none}
  #admin-console .ac-breadcrumb{display:flex}
  #admin-console .ac-main{padding:30px 28px 25px}
  #admin-console .ac-header{padding-left:28px;padding-right:28px}
  #admin-console .ac-overview{margin-bottom:28px}
  #admin-console .ac-date-controls{display:flex}
  #admin-console .ac-date-options{display:flex}
}
@media(min-width:1380px){
  #admin-console.ac-shell{grid-template-columns:214px minmax(0,1fr)}
  #admin-console .ac-content-grid{grid-template-columns:minmax(0,1fr) 244px;gap:24px}
  #admin-console .ac-tools-panel{display:block;padding:3px 0 0;min-width:0}
  #admin-console .ac-tools-panel h2{font-size:16px;margin-bottom:13px}
  #admin-console .ac-tool-links{border-top:1px solid var(--ac-line)}
  #admin-console .ac-tool-link{display:flex;align-items:flex-start;gap:10px;padding:17px 0;border-bottom:1px solid var(--ac-line)}
  #admin-console .ac-tool-icon{display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:7px;background:#fff0de;color:var(--ac-rust);flex-shrink:0}
  #admin-console .ac-tool-icon>.ac-icon{width:17px;height:17px}
  #admin-console .ac-tool-copy{min-width:0;flex:1;padding-top:2px}
  #admin-console .ac-tool-copy strong{display:block;font-size:14px;line-height:1.5;font-weight:700;transition:color .14s ease}
  #admin-console .ac-tool-copy>span{display:block;font-size:12px;color:var(--ac-muted);line-height:1.6;margin-top:5px}
  #admin-console .ac-tool-arrow{width:16px;height:16px;margin-top:7px;color:var(--ac-muted)}
  #admin-console .ac-more-tools{border-bottom:1px solid var(--ac-line)}
  #admin-console .ac-more-tools>summary{display:flex;align-items:center;min-height:55px;gap:10px;font-size:14px;font-weight:700;cursor:pointer;list-style:none}
  #admin-console .ac-more-tools nav{display:grid;padding:0 0 12px}
  #admin-console .ac-more-tools nav a{display:flex;align-items:center;min-height:44px;font-size:14px;color:var(--ac-muted)}
  #admin-console .ac-system-link{display:flex;align-items:center;gap:12px;margin-top:22px;padding:16px;border:1px solid var(--ac-line);border-radius:10px;background:#f8f9fa}
  #admin-console .ac-system-link>span{min-width:0;flex:1}
  #admin-console .ac-system-link strong{display:block;font-family:Outfit,"LINE Seed Sans TH",sans-serif;font-size:15px;font-weight:700}
  #admin-console .ac-system-link>span>span{display:block;font-size:12px;line-height:1.6;color:var(--ac-muted);margin-top:5px}
  #admin-console .ac-system-link .ac-icon{width:16px;height:16px}
  #admin-console .ac-date-controls{display:grid;grid-template-columns:minmax(0,1fr)}
  #admin-console .ac-date-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}
  #admin-console .ac-job-row{grid-template-columns:78px minmax(0,1.25fr) minmax(94px,.9fr) minmax(99px,.85fr) auto;gap:12px}
}
@media(min-width:1650px){
  #admin-console .ac-main{padding-left:36px;padding-right:36px}
  #admin-console .ac-header{padding-left:36px;padding-right:36px}
  #admin-console .ac-content-grid{grid-template-columns:minmax(0,1fr) 270px;gap:30px}
  #admin-console .ac-date-controls{display:flex}
  #admin-console .ac-date-options{display:flex}
  #admin-console .ac-job-row{grid-template-columns:95px minmax(0,1.35fr) minmax(110px,1fr) minmax(115px,.85fr) auto;gap:18px}
}
@media(prefers-reduced-motion:reduce){
  #admin-console *,#admin-console *::before,#admin-console *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}
}
@media print{
  #admin-console.ac-shell{display:block}
  #admin-console :is(.ac-sidebar,.ac-header,.ac-mobile-tools,.ac-tools-panel,.ac-filters,.ac-create,.ac-job-go,.ac-pagination,.ac-text-button){display:none!important}
  #admin-console .ac-main{padding:0;max-width:none}
  #admin-console .ac-board{border:0}
  #admin-console .ac-job{break-inside:avoid}
}
`;

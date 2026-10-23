// Dashboard-only presentation. Keep operational states, links and data intact.
export const DASHBOARD_POLISH_CSS = String.raw`
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-top{background:transparent!important;border:0!important;box-shadow:none!important;backdrop-filter:none;padding:8px 0 20px;min-height:0;gap:20px}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-top h1{font-size:clamp(26px,2.4vw,32px);font-weight:650;line-height:1.3;letter-spacing:-.025em;margin-top:12px}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-sub{font-size:14px;line-height:1.65;margin-top:8px;max-width:640px}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 :is(.adm27-card,.adm27-focus,.adm27-hub,.adm27-workspaces,.adm27-login){background:#fff!important;border:1px solid #cfd4da!important;border-radius:18px;box-shadow:0 2px 8px rgb(39 43 48 / .025)!important}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 :is(a,button,b,summary){color:#272b30!important;-webkit-text-fill-color:#272b30!important}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 :is(p,small,time,em,.adm27-empty){color:#545c66!important;-webkit-text-fill-color:#545c66!important}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 :is(.adm27-summary span,.adm27-summary a span,.adm27-footnote,.adm27-truth span,.adm27-quick span){color:#545c66!important;-webkit-text-fill-color:#545c66!important;font-size:13px;line-height:1.5;letter-spacing:0}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-summary article{padding:18px 20px;border-radius:14px}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-summary strong{font-size:30px;font-weight:650;line-height:1.15;margin-top:10px}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 :is(.adm27-card h2,.adm27-owner h2,.adm27-hub h2,.adm27-workspaces h2){font-size:20px;font-weight:650;line-height:1.4;letter-spacing:-.015em}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-focusbody{margin:0;padding:0;border:0;align-items:center}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-focusbody strong{font-size:17px;font-weight:650;line-height:1.45}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-focusbody p{font-size:14px;line-height:1.65;max-width:760px}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 :is(.adm27-row,.adm27-empty,.adm27-statusgrid p,.adm27-truth p){background:#fff!important;border-color:#d7dce2!important;border-radius:12px}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-row{padding:14px 16px;align-items:center;gap:16px;transition:background-color .15s,border-color .15s}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-row:hover{background:#edf0f3!important;border-color:#aeb6c0!important;box-shadow:none}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-row strong{font-size:15px;font-weight:600;line-height:1.5}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-row p{font-size:13px;line-height:1.6;margin-top:4px}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 :is(.adm27-row em,.adm27-chip,.adm27-state){background:#edf0f3!important;border:1px solid #d7dce2!important;color:#545c66!important;-webkit-text-fill-color:#545c66!important;font-size:12px;line-height:1.5;letter-spacing:0;padding:5px 10px;border-radius:999px;font-style:normal;box-shadow:none}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-state.is-live{color:#286442!important;-webkit-text-fill-color:#286442!important;background:#eef5f0!important;border-color:#c6dacd!important}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-state.is-bad{color:#a12535!important;-webkit-text-fill-color:#a12535!important;background:#fcf0f1!important;border-color:#e9c9cf!important}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 :is(.adm27-btn,.adm27-refresh){min-height:42px;font-size:13px;font-weight:600;line-height:1.4;border-radius:10px;padding:10px 15px}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-btn.is-primary{color:#272b30!important;-webkit-text-fill-color:#272b30!important;background:#fed7aa!important;border-color:#c47a38!important}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 :is(.adm27-link,.adm27-routecard b,.adm27-opgrid b){color:#a93e09!important;-webkit-text-fill-color:#a93e09!important;font-size:13px}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-disclosure{background:#fff!important;border-color:#cfd4da!important;border-radius:14px}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-disclosure>summary{background:transparent!important;font-size:14px;font-weight:600;line-height:1.5}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-sidebar{background:#272b30!important;border-color:#454b54!important;border-radius:18px}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-sidebrand{padding:4px 8px 18px;border-color:#454b54}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-sidebrand small{display:none}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-sidegroup{border-color:#454b54;padding:14px 0;gap:3px}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-sidegroup>span{color:#b9c0c8!important;-webkit-text-fill-color:#b9c0c8!important;font-size:12px;font-weight:600;line-height:1.5}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-sidegroup>a{color:#e5e7eb!important;-webkit-text-fill-color:#e5e7eb!important;font-size:14px;font-weight:400;min-height:40px;padding:9px 10px}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-sidegroup>a:hover{background:#353b43!important;color:#fff!important;-webkit-text-fill-color:#fff!important}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-sidegroup>a[aria-current="page"]{background:#fed7aa!important;color:#272b30!important;-webkit-text-fill-color:#272b30!important}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 :is(.adm27-sidebrand strong,.adm27-mobmenu summary){color:#fff!important;-webkit-text-fill-color:#fff!important}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 :focus-visible{outline:2px solid #b9470d;outline-offset:3px}
@media(max-width:700px){html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-top{padding:8px 0 16px}html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-row{grid-template-columns:minmax(0,1fr);gap:8px;padding:12px 14px}html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-row em{justify-self:start}html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-summary article{padding:14px}html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-focusbody .adm27-actions{width:100%}}
@media(prefers-reduced-motion:reduce){html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-row{transition:none}}
`;

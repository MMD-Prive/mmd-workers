// Dashboard-only presentation. Keep operational states, links and data intact.
export const DASHBOARD_POLISH_CSS = String.raw`
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-top{background:transparent!important;border:0!important;box-shadow:none!important;backdrop-filter:none;padding:8px 0 20px;min-height:0;gap:20px}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-top h1{font-size:clamp(26px,2.4vw,32px);font-weight:650;line-height:1.3;letter-spacing:0;margin-top:12px}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-sub{font-size:16px;line-height:1.7;margin-top:8px;max-width:640px}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 :is(.adm27-card,.adm27-focus,.adm27-hub,.adm27-workspaces,.adm27-login){background:#fff!important;border:1px solid #cfd4da!important;border-radius:18px;box-shadow:0 2px 8px rgb(39 43 48 / .025)!important}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 :is(a,button,b,summary){color:#272b30!important;-webkit-text-fill-color:#272b30!important}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 :is(p,small,time,em,.adm27-empty){color:#545c66!important;-webkit-text-fill-color:#545c66!important}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 :is(.adm27-summary span,.adm27-summary a span,.adm27-footnote,.adm27-truth span,.adm27-quick span){color:#545c66!important;-webkit-text-fill-color:#545c66!important;font-size:15px;line-height:1.5;letter-spacing:0}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-summary article{padding:18px 20px;border-radius:14px}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-summary strong{font-size:30px;font-weight:650;line-height:1.15;margin-top:10px}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 :is(.adm27-card h2,.adm27-owner h2,.adm27-hub h2,.adm27-workspaces h2){font-size:22px;font-weight:650;line-height:1.4;letter-spacing:0}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-focusbody{margin:0;padding:0;border:0;align-items:center}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-focusbody strong{font-size:17px;font-weight:650;line-height:1.45}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-focusbody p{font-size:16px;line-height:1.7;max-width:760px}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 :is(.adm27-row,.adm27-empty,.adm27-statusgrid p,.adm27-truth p){background:#fff!important;border-color:#d7dce2!important;border-radius:12px}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-row{padding:14px 16px;align-items:center;gap:16px;transition:background-color .15s,border-color .15s}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-row:hover{background:#edf0f3!important;border-color:#aeb6c0!important;box-shadow:none}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-row strong{font-size:17px;font-weight:600;line-height:1.5}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-row p{font-size:16px;line-height:1.6;margin-top:4px}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 :is(.adm27-row em,.adm27-chip,.adm27-state){background:#edf0f3!important;border:1px solid #d7dce2!important;color:#545c66!important;-webkit-text-fill-color:#545c66!important;font-size:14px;line-height:1.5;letter-spacing:0;padding:5px 10px;border-radius:999px;font-style:normal;box-shadow:none}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-state.is-live{color:#286442!important;-webkit-text-fill-color:#286442!important;background:#eef5f0!important;border-color:#c6dacd!important}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-state.is-bad{color:#a12535!important;-webkit-text-fill-color:#a12535!important;background:#fcf0f1!important;border-color:#e9c9cf!important}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 :is(.adm27-btn,.adm27-refresh){min-height:44px;font-size:15px;font-weight:600;line-height:1.4;border-radius:10px;padding:10px 15px}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-btn.is-primary{color:#272b30!important;-webkit-text-fill-color:#272b30!important;background:#fed7aa!important;border-color:#c47a38!important}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 :is(.adm27-link,.adm27-routecard b,.adm27-opgrid b){color:#a93e09!important;-webkit-text-fill-color:#a93e09!important;font-size:15px}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-disclosure{background:#fff!important;border-color:#cfd4da!important;border-radius:14px}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-disclosure>summary{background:transparent!important;font-size:16px;font-weight:600;line-height:1.5}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-sidebar{background:#fff!important;border-color:#cfd4da!important;border-radius:18px}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-sidebrand{padding:4px 8px 18px;border-color:#454b54}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-sidebrand small{display:none}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-sidegroup{border-color:#454b54;padding:14px 0;gap:3px}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-sidegroup>span{color:#545c66!important;-webkit-text-fill-color:#545c66!important;font-size:14px;font-weight:600;line-height:1.5}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-sidegroup>a{color:#272b30!important;-webkit-text-fill-color:#272b30!important;font-size:15px;font-weight:400;min-height:44px;padding:9px 10px}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-sidegroup>a:hover{background:#fff7ed!important;color:#272b30!important;-webkit-text-fill-color:#272b30!important}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-sidegroup>a[aria-current="page"]{background:#fed7aa!important;color:#272b30!important;-webkit-text-fill-color:#272b30!important}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 :is(.adm27-sidebrand strong,.adm27-mobmenu summary){color:#272b30!important;-webkit-text-fill-color:#272b30!important}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 :focus-visible{outline:2px solid #b9470d;outline-offset:3px}
@media(max-width:700px){html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-top{padding:8px 0 16px}html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-row{grid-template-columns:minmax(0,1fr);gap:8px;padding:12px 14px}html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-row em{justify-self:start}html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-summary article{padding:14px}html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-focusbody .adm27-actions{width:100%}}
@media(prefers-reduced-motion:reduce){html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-row{transition:none}}

/* Dashboard-only cascade protection against late Webflow and workspace styles.
   No visibility, DOM, data, link or operational-state changes. */
html[data-sigil-internal-theme="silver-orange-v1"]:root body:has(#adm27){background:#fff!important}
html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27,
html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 :is(.adm27-app,.adm27-main){background:#fff!important;color:#272b30!important;min-width:0}
html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27{font:16px/1.7 "Noto Sans Thai","LINE Seed Sans TH",Tahoma,system-ui,sans-serif!important;padding-bottom:104px}
html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 :is(h1,h2,h3,p,a,button,summary,label,input,select,textarea,strong,b,small,span,time,em){font-family:"Noto Sans Thai","LINE Seed Sans TH",Tahoma,system-ui,sans-serif!important;text-shadow:none!important;letter-spacing:normal;overflow-wrap:anywhere}
html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 :is(h1,h2,h3,strong,b,summary){color:#272b30!important;-webkit-text-fill-color:currentColor!important;background-image:none!important}
html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 :is(p,small,time,em,.adm27-empty){font-size:16px;line-height:1.7;color:#545c66!important;-webkit-text-fill-color:currentColor!important}
html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 .adm27-main{gap:24px}
html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 :is(.adm27-sub,.adm27-ownerhead p,.adm27-ownergrid>a span,.adm27-annualgrid small,.adm27-annualnote){font-size:16px!important;line-height:1.7!important}
html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 :is(.adm27-cardtop,.adm27-ownerhead,.adm27-topright,.adm27-actions){flex-wrap:wrap;gap:12px}
html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 :is(.adm27-cardtop,.adm27-ownerhead){align-items:flex-start}
html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 :is(.adm27-owner,.adm27-summary article,.adm27-summary>a,.adm27-ownergrid>a,.adm27-annualgrid article){background:#fff!important;border-color:#cfd4da!important;color:#272b30!important}
html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 .adm27-ownergrid>a{padding:18px;gap:8px;min-height:112px}
html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 .adm27-ownergrid>a strong{font-size:18px;line-height:1.5}
html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 :is(.adm27-link,.adm27-daily a,.adm27-disclosure>summary){font-size:16px;line-height:1.6;min-height:44px}
html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 .adm27-link{display:inline-flex;align-items:center;text-decoration:underline;text-underline-offset:4px}
html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 :is(.adm27-summary,.adm27-summary-v3){grid-template-columns:repeat(2,minmax(0,1fr))}
html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 .adm27-summary span{font-size:15px!important;line-height:1.6!important}
html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 .adm27-summary strong{font-variant-numeric:tabular-nums;font-size:32px;line-height:1.3}
html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 :is(.adm27-sidebrand,.adm27-sidegroup){border-color:#d7dce2!important}
html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 #sigil-workspace-directory{background:#fff!important;color:#272b30!important;border-color:#cfd4da!important;box-shadow:none!important}
html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 #sigil-workspace-directory :is(summary,a,h3){color:#272b30!important;-webkit-text-fill-color:currentColor!important;letter-spacing:0;font-size:15px!important;line-height:1.65!important}
html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 #sigil-workspace-directory a{min-height:44px}
html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 #sigil-workspace-directory a[aria-current="page"]{background:#fed7aa!important;color:#272b30!important}
html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 #my-mmd-management{background:#fff!important;border-color:#cfd4da!important;color:#272b30!important}
html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 #my-mmd-management :is(h2,h3,strong,summary,a){color:#272b30!important;-webkit-text-fill-color:currentColor!important}
html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 #my-mmd-management :is(p,small){color:#545c66!important;-webkit-text-fill-color:currentColor!important;font-size:16px;line-height:1.7}
html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 #my-mmd-management :is(article,.adm27-memberhub-map>div){background:#fff!important;border-color:#cfd4da!important}
html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 #my-mmd-management .adm27-memberhub-tag{background:#fff7ed!important;color:#7c3b0b!important;-webkit-text-fill-color:currentColor!important}
html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 :is(.adm27-btn,.adm27-refresh){min-height:48px;font-size:16px!important;line-height:1.5!important;white-space:normal}
html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 :is(.adm27-btn,.adm27-refresh):is(:disabled,[aria-disabled="true"]){background:#edf0f3!important;color:#545c66!important;-webkit-text-fill-color:currentColor!important;border-color:#929ba6!important;opacity:1!important;cursor:not-allowed}
@media(hover:hover){
 html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 :is(.adm27-ownergrid>a,.adm27-summary>a,.adm27-sidegroup>a):hover,
 html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 #sigil-workspace-directory a:hover{background:#fff7ed!important;border-color:#c47a38!important;color:#272b30!important}
}
html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 :is(.adm27-ownergrid>a,.adm27-sidegroup>a):active{background:#ffedd5!important}
html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 :focus-visible{outline:3px solid #9a4a0b!important;outline-offset:3px}
@media(min-width:1100px){html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 :is(.adm27-summary,.adm27-summary-v3){grid-template-columns:repeat(4,minmax(0,1fr))}}
@media(max-width:700px){
 html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27{width:calc(100% - 24px);padding-top:12px}
 html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 :is(.adm27-workgrid,.adm27-ownergrid,.adm27-memberhub-grid,.adm27-memberhub-map){grid-template-columns:minmax(0,1fr)!important}
 html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 :is(.adm27-card,.adm27-owner,.adm27-focus){padding:18px}
 html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 .adm27-focusbody{align-items:stretch;flex-direction:column}
 html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 .adm27-actions{display:grid;grid-template-columns:minmax(0,1fr);width:100%}
 html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 .adm27-list{max-height:none;overflow:visible}
 html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 .adm27-row{grid-template-columns:minmax(0,1fr);align-items:start}
 html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 #sigil-workspace-directory nav{max-height:240px}
}
html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 .adm27-sidebrand svg [fill="#F5F1E8"]{fill:#272b30}
html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 .adm27-sidebrand svg [fill="#B9B7B0"]{fill:#545c66}
html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 :is(.adm27-btn,.adm27-refresh):not(:disabled):not([aria-disabled="true"]){background:#fed7aa!important;color:#272b30!important;-webkit-text-fill-color:currentColor!important;border-color:#c47a38!important}
@media(hover:hover){html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 :is(.adm27-btn,.adm27-refresh):hover:not(:disabled):not([aria-disabled="true"]){background:#fdba74!important;border-color:#9a4a0b!important}}
html[data-sigil-internal-theme="silver-orange-v1"]:root #adm27 :is(.adm27-btn,.adm27-refresh):active:not(:disabled):not([aria-disabled="true"]){background:#fb923c!important;border-color:#9a4a0b!important}
`;


// Shared presentation adapters for Worker HTML, Webflow embeds and Session Creator.
// Keep selectors scoped to the internal theme; never change visibility or form behavior.
export const WHITE_ORANGE_WORKSPACE_CSS = String.raw`
html[data-sigil-internal-theme="silver-orange-v1"]:root {
  --background:#fff;--foreground:#272b30;--surface:#fff;--surface-2:#f3f4f6;
  --primary:#fed7aa;--primary-foreground:#272b30;--secondary:#fff7ed;--secondary-foreground:#272b30;
  --accent:#ffedd5;--accent-foreground:#272b30;--muted-foreground:#545c66;--ring:#9a4a0b;
}
html[data-sigil-internal-theme="silver-orange-v1"] body {
  font-family:"LINE Seed Sans TH","Noto Sans Thai",Tahoma,system-ui,sans-serif!important;
  font-size:16px;line-height:1.65;background:#fff!important;color:#272b30!important;
}
html[data-sigil-internal-theme="silver-orange-v1"] #adm27 .adm27-ownerhead span {color:#545c66!important;-webkit-text-fill-color:#545c66!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(#mmd-shop-inventory-admin-v1,#mmd-shop-products-admin-v1) :is(.shopops-nav a,.shopops-field span,.shopops-kicker) {color:#545c66!important;font-size:14px!important;-webkit-text-fill-color:currentColor!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(#mmd-shop-inventory-admin-v1,#mmd-shop-products-admin-v1) .shopops-nav a.is-active {background:#fed7aa!important;color:#272b30!important;border-color:#c47a38!important}
html[data-sigil-internal-theme="silver-orange-v1"] #sigil-telegram-brief .tb-rail :is(.tb-brand,a,p,span,strong) {color:#272b30!important;-webkit-text-fill-color:#272b30!important}
html[data-sigil-internal-theme="silver-orange-v1"] #sigil-telegram-brief .tb-nav a:is(:hover,[aria-current]) {background:#fed7aa!important;color:#272b30!important}
/* These roots define local dark tokens, so root-only variables cannot reach them. */
html[data-sigil-internal-theme="silver-orange-v1"] :is(#mmd-cj-split-v1,.mmd-cs-v14,.session-pro-theme,.ajb,.mc3,.crx,.ka,.internal-admin-theme,#adm27,#aud27,#money-control-v3,#mmd-payment-review,#mmd-auto-card-inbox,#mmdStudioUploadR5,#mmdStudioR5,#mmd-bank-design,#sigil-telegram-brief,#mmd-shop-inventory-admin-v1,#mmd-shop-products-admin-v1) {
  color-scheme:light;--bg:#fff;--bg-2:#fff;--paper:#fff;--panel:#fff;--panel2:#f3f4f6;
  --studio-bg:#fff;--studio-panel:#fff;--studio-panel-soft:#f3f4f6;--studio-input:#fff;--studio-text:#272b30;--studio-text-soft:#545c66;--studio-muted:#545c66;--studio-dim:#545c66;--studio-gold:#9a4a0b;--studio-border:#c7ccd2;--studio-border-soft:#c7ccd2;--canvas:#fff;--body:#545c66;--panel-strong:#fff;--panel-soft:#f3f4f6;--lv11-panel:#fff;--background:#fff;--foreground:#272b30;
  --card:#fff;--card-foreground:#272b30;--popover:#fff;--popover-foreground:#272b30;
  --text:#272b30;--ink:#272b30;--text-soft:#545c66;--text-dim:#545c66;
  --shadow:0 4px 18px rgb(39 43 48 / .06);--shadow-soft:0 2px 10px rgb(39 43 48 / .04);--line:#c7ccd2;--line-soft:#d7dce2;--line-gold:#c47a38;--border:#c7ccd2;
  --gold:#9a4a0b;--gold-soft:#9a4a0b;--primary:#fed7aa;--primary-foreground:#272b30;
  --ok:#286442;--warn:#895209;--danger:#a12535;--public:#245e88;--private:#89334f;
  background:#fff!important;color:#272b30!important;font-family:inherit!important;
}
html[data-sigil-internal-theme="silver-orange-v1"] .session-pro-theme {--muted:#f3f4f6;--muted-foreground:#545c66;--sidebar-background:#fff;--sidebar-foreground:#272b30;--sidebar-primary:#fed7aa;--sidebar-primary-foreground:#272b30}

html[data-sigil-internal-theme="silver-orange-v1"]:root body:has(#mmd-cj-split-v1) {background:#fff!important}
html[data-sigil-internal-theme="silver-orange-v1"]:root :is(body,#adm27,#mmd-cj-split-v1) :is(main,section,article,header,aside,nav,dialog,.hero,.panel,.card,.bg-surface,.bg-muted,.pf-card,.pf-panel,.mu-note,.mu-card,.mc3-card,.aud27-card) {background:#fff!important;color:#272b30!important;border-color:#c7ccd2!important}
html[data-sigil-internal-theme="silver-orange-v1"]:root :is(body,#adm27,#mmd-cj-split-v1) :is(a,strong,b,span,small) { -webkit-text-fill-color:currentColor!important }
html[data-sigil-internal-theme="silver-orange-v1"]:root :is(body,#adm27,#mmd-cj-split-v1) :is(.cr4__rail,.sigil-navigation-rail,.access-card,.adm27-sidebar) :is(a,strong,b,span,small) {color:#272b30!important;-webkit-text-fill-color:currentColor!important}

/* ID-scoped legacy layouts and late-loaded styles need the same specificity. */
html[data-sigil-internal-theme="silver-orange-v1"] :is(body,#adm27,#mmd-cj-split-v1) :is(
  .mmd-cj__top,.mmd-cj__rail,.mmd-cj__card,.mmd-cj__cardHead,.mmd-cj__aside,.mmd-cj__side,.mmd-cj__footer,
  .mmd-cs-v14__shell,.mmd-cs-v14__hero,.mmd-cs-v14__section,.mmd-cs-v14__summaryCard,.mmd-cs-v14__pickedCard,
  .adm27-sidebar,.access-card,.mmd-cs-v14__topbar,.mmd-cs-v14__dock,.mmd-cs-v14__thumb,.mmd-cs-v14__toolbar,.mmd-cs-v14__modelBudget,.mmd-cs-v14__notice,.mmd-cs-v14__modelPick,
  .ajb-panel,.ajb-hero,.ajb-top,.ajb-stats>article,.ka__header,.ka__card,.ka__notice,.ka__empty,
  .bg-background,.bg-card,.bg-popover,.bg-sidebar,.bg-sidebar-background) {
  background:#fff!important;color:#272b30!important;border-color:#c7ccd2!important;
}
html[data-sigil-internal-theme="silver-orange-v1"] :is(body,#adm27,#mmd-cj-split-v1) :is(h1,h2,h3,h4,h5,h6,label,legend,.text-white,.text-foreground,.text-card-foreground) {
  color:#272b30!important;-webkit-text-fill-color:currentColor!important;background-image:none!important;
}
html[data-sigil-internal-theme="silver-orange-v1"] :is(body,#adm27,#mmd-cj-split-v1) :is(p,small,.text-muted-foreground,.mmd-cj__lead) {color:#545c66!important;-webkit-text-fill-color:currentColor!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(button,a,input,textarea,select,summary) {font-family:inherit!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(body,#adm27,#mmd-cj-split-v1) :is(button,[role="button"],.btn,.adm27-btn,.cr4__btn,.mmd-cj__btn,.mmd-cj__ghost,.mmd-cs-v14__btn,.ajb-back,.ajb-refresh,.pf-btn,.mu-btn,.mc3-btn,.tb-btn,.se-chip) {
  background:#fed7aa!important;color:#272b30!important;-webkit-text-fill-color:#272b30!important;
  border:1px solid #c47a38!important;border-radius:10px;min-height:44px;min-width:0;max-width:100%;box-sizing:border-box;
  font-size:16px!important;line-height:1.5!important;white-space:normal;overflow-wrap:anywhere;
}
html[data-sigil-internal-theme="silver-orange-v1"] :is(body,#adm27,#mmd-cj-split-v1) :is(button,[role="button"],.btn,.adm27-btn,.cr4__btn) :where(*) {color:inherit!important;-webkit-text-fill-color:currentColor!important}
@media(hover:hover) {
  html[data-sigil-internal-theme="silver-orange-v1"] :is(body,#adm27,#mmd-cj-split-v1) :is(button,[role="button"],.btn,.adm27-btn,.cr4__btn):hover:not(:disabled):not([aria-disabled="true"]) {background:#fdba74!important;border-color:#9a4a0b!important}
}
html[data-sigil-internal-theme="silver-orange-v1"] :is(body,#adm27,#mmd-cj-split-v1) :is(button,[role="button"],.btn,.adm27-btn,.cr4__btn):is(:active,.active,.is-active,[aria-pressed="true"],[aria-selected="true"]):not(:disabled):not([aria-disabled="true"]) {background:#fb923c!important;border-color:#9a4a0b!important;box-shadow:inset 0 0 0 1px #9a4a0b}
html[data-sigil-internal-theme="silver-orange-v1"] :is(body,#adm27,#mmd-cj-split-v1) :is(input,textarea,select) {background:#fff!important;color:#272b30!important;-webkit-text-fill-color:#272b30!important;border-color:#929ba6!important;font-size:16px!important;line-height:1.5!important;max-width:100%;accent-color:#9a4a0b}
html[data-sigil-internal-theme="silver-orange-v1"] :is(body,#adm27,#mmd-cj-split-v1) :is(button,input,textarea,select,[role="button"],.btn):is(:disabled,[aria-disabled="true"]) {background:#edf0f3!important;color:#545c66!important;-webkit-text-fill-color:#545c66!important;border-color:#929ba6!important;opacity:1!important;box-shadow:none!important;cursor:not-allowed}
html[data-sigil-internal-theme="silver-orange-v1"] :is(body,#adm27,#mmd-cj-split-v1) :focus-visible {outline:3px solid #9a4a0b!important;outline-offset:3px}
html[data-sigil-internal-theme="silver-orange-v1"] :is(input,textarea)::placeholder {color:#545c66!important;-webkit-text-fill-color:#545c66!important;opacity:1}
/* Reset stale glyph fill without replacing icon fonts or SVG artwork. */
html[data-sigil-internal-theme="silver-orange-v1"] :is(.mmd-cs-v14,#mmd-cj-split-v1,.session-pro-theme,.ajb,.ka) :where(*) {-webkit-text-fill-color:currentColor}
html[data-sigil-internal-theme="silver-orange-v1"] :is(.mr-danger,.btn.bad,[data-variant="destructive"]) {border-color:#a12535!important}
@media(max-width:760px) {
  html[data-sigil-internal-theme="silver-orange-v1"] :is(#mmd-cj-split-v1,.mmd-cs-v14) {height:auto!important;min-height:100svh;max-width:100%;padding:12px!important;overflow:visible!important}
  html[data-sigil-internal-theme="silver-orange-v1"]:root body:has(#mmd-cj-split-v1) {overflow:auto!important}
  html[data-sigil-internal-theme="silver-orange-v1"] #mmd-cj-split-v1 :is(.mmd-cj__shell,.mmd-cj__grid) {height:auto!important;grid-template-columns:minmax(0,1fr)!important;grid-template-rows:auto!important}
  html[data-sigil-internal-theme="silver-orange-v1"] #mmd-cj-split-v1 :is(.mmd-cj__top,.mmd-cj__rail,.mmd-cj__grid) {grid-column:auto!important;grid-row:auto!important}
  html[data-sigil-internal-theme="silver-orange-v1"] #mmd-cj-split-v1 :is(.mmd-cj__top,.mmd-cj__cardHead,.mmd-cj__card,.mmd-cj__main,.mmd-cj__aside,.mmd-cj__rail) {height:auto!important;min-height:0!important;overflow:visible!important}
  html[data-sigil-internal-theme="silver-orange-v1"] #mmd-cj-split-v1 :is(.mmd-cj__lead,.mmd-cj__cardHead p,.mmd-cj__steps span,.mmd-cj__railStatus .mmd-cj__alert) {font-size:14px!important;line-height:1.65!important;white-space:normal!important;max-width:100%!important}
  html[data-sigil-internal-theme="silver-orange-v1"] #mmd-cj-split-v1 .mmd-cj__steps button {height:auto!important;min-height:44px!important}
  html[data-sigil-internal-theme="silver-orange-v1"] :is(.mmd-cs-v14__fields--4,.mmd-cs-v14__fields--3) {grid-template-columns:minmax(0,1fr)!important}
}
`;

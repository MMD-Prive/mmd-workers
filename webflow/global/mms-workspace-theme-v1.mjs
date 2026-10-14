// A single palette for MMS operations and shop workspaces, including future shops.
export const MMS_WORKSPACE_CSS = String.raw`
html[data-mms-theme="white-green-v1"]:root{color-scheme:light;--ink:#253a2e;--ink-soft:#3d5146;--muted:#66736c;--paper:#f4f6f5;--paper-2:#ecefed;--card:#fff;--sage:#789482;--sage-deep:#2f6b4b;--sage-soft:#e9f2ec;--lime:#b7d6bb;--line:#dce3df;--shadow:0 8px 28px rgb(37 58 46 / .05);--bg:#f4f6f5;--panel:#fff;--text:#253a2e;--gold:#2f6b4b;--gold2:#2f6b4b}
html[data-mms-theme="white-green-v1"]:root body{background:#f4f6f5!important;color:#253a2e!important;font-family:"LINE Seed Sans TH","Noto Sans Thai",system-ui,sans-serif!important;line-height:1.65}
html[data-mms-theme="white-green-v1"]:root .mms-admin{--ink:#253a2e;--muted:#66736c;--paper:#f4f6f5;--line:#dce3df;--lime:#b7d6bb;--sage:#789482;--sage-deep:#2f6b4b;background:#f4f6f5!important;color:#253a2e!important}
html[data-mms-theme="white-green-v1"]:root :is(.card,.form-card,.record-card,.stat,.action-card,.branch-sheet){background:#fff!important;color:#253a2e!important;border-color:#dce3df!important;box-shadow:0 4px 20px rgb(37 58 46 / .035)!important}
html[data-mms-theme="white-green-v1"]:root .hero{background:#edf5ef!important;color:#253a2e!important;border:1px solid #d6e4da;box-shadow:none}
html[data-mms-theme="white-green-v1"]:root .hero :is(h1,h2,h3){color:#253a2e!important;-webkit-text-fill-color:#253a2e!important;font-size:clamp(28px,3vw,42px);line-height:1.25;font-weight:600;letter-spacing:-.025em}
html[data-mms-theme="white-green-v1"]:root .hero :is(p,strong){color:#4e6356!important;-webkit-text-fill-color:#4e6356!important}
html[data-mms-theme="white-green-v1"]:root :is(.kicker,.eyebrow,.section-kicker){color:#2f6b4b!important;-webkit-text-fill-color:#2f6b4b!important}
html[data-mms-theme="white-green-v1"]:root :is(.hero-note,.ops-note,.cost,.detail){background:#edf2ef!important;color:#4e6356!important;border-color:#d6e4da!important}
html[data-mms-theme="white-green-v1"]:root :is(button,.btn,.desktop-tab){background:#fff;color:#253a2e;border-color:#dce3df;font-family:inherit!important}
html[data-mms-theme="white-green-v1"]:root :is(.primary,.btn.primary,.desktop-tab.active,.nav a[aria-current="page"],.branch-next){background:#2f6b4b!important;border-color:#2f6b4b!important;color:#fff!important;-webkit-text-fill-color:#fff!important}
html[data-mms-theme="white-green-v1"]:root :is(.primary,.btn.primary,.desktop-tab.active,.nav a[aria-current="page"],.branch-next):hover:not(:disabled){background:#26573d!important;border-color:#26573d!important}
html[data-mms-theme="white-green-v1"]:root .nav a:not([aria-current="page"]){background:#fff!important;border-color:#dce3df!important;color:#4e6356!important}
html[data-mms-theme="white-green-v1"]:root :is(input,select,textarea){background:#fff!important;color:#253a2e!important;border-color:#cbd6cf!important;accent-color:#2f6b4b;font-family:inherit!important}
html[data-mms-theme="white-green-v1"]:root :is(input,textarea)::placeholder{color:#748279!important}
html[data-mms-theme="white-green-v1"]:root label{color:#4e6356!important;line-height:1.5}
html[data-mms-theme="white-green-v1"]:root :is(.muted,.code,.stat small,.section-head p,.record-main p){color:#66736c!important;-webkit-text-fill-color:#66736c!important}
html[data-mms-theme="white-green-v1"]:root :is(.pill,.alert:not(.error),.flow span){background:#e9f2ec!important;color:#2f6b4b!important;border-color:#c9ddce!important}
html[data-mms-theme="white-green-v1"]:root .alert.error{background:#fcf0ee!important;color:#8d3e38!important;border-color:#e9cac6!important}
html[data-mms-theme="white-green-v1"]:root .mobile-branch{background:#294c37!important;border-color:#476b54!important}
html[data-mms-theme="white-green-v1"]:root .sheet-link[aria-current="true"]:after{background:#2f6b4b!important}
html[data-mms-theme="white-green-v1"]:root :focus-visible{outline:3px solid #2f6b4b!important;outline-offset:3px}
html[data-mms-theme="white-green-v1"]:root :is(h1,h2,h3,h4,strong){color:#253a2e!important;-webkit-text-fill-color:#253a2e!important}
html[data-mms-theme="white-green-v1"]:root :is(p,li,small){color:#66736c!important;-webkit-text-fill-color:#66736c!important}
html[data-mms-theme="white-green-v1"]:root :is(.primary,.btn.primary,.branch-next) :is(span,strong,b){color:#fff!important;-webkit-text-fill-color:#fff!important}
html[data-mms-theme="white-green-v1"]:root .alert.error :is(p,strong){color:#8d3e38!important;-webkit-text-fill-color:#8d3e38!important}
html[data-mms-theme="white-green-v1"]:root .hero .mms-powered{color:#2f6b4b!important;-webkit-text-fill-color:#2f6b4b!important;font-size:12px;font-weight:600;letter-spacing:.08em;margin:8px 0 18px}
html[data-mms-theme="white-green-v1"]:root :is(h2,h3){font-weight:600;line-height:1.4;letter-spacing:-.015em}
@media(max-width:760px){html[data-mms-theme="white-green-v1"]:root .hero{padding:24px}html[data-mms-theme="white-green-v1"]:root .hero h1{font-size:30px}}
`;

export function usesMmsWorkspace(pathname) {
  const path = String(pathname || '/').replace(/\/+$/, '') || '/';
  return /^\/internal\/admin\/mms(?:\/|$)/.test(path) || ['/partner/dashboard/relax-spa', '/partner/dashboard/kalima-massage'].some(p => path === p || path.startsWith(p + '/'));
}

export function installMmsWorkspaceTheme(doc) {
  doc.documentElement.dataset.mmsTheme = 'white-green-v1';
  delete doc.documentElement.dataset.sigilInternalTheme;
  let style = doc.getElementById('mms-white-green-v1');
  if (!style) { style = doc.createElement('style'); style.id = 'mms-white-green-v1'; doc.head.appendChild(style); }
  if (style.textContent !== MMS_WORKSPACE_CSS) style.textContent = MMS_WORKSPACE_CSS;
}

export function withMmsWorkspaceTheme(html) {
  const nonceValue = html.match(/<script\b[^>]*\bnonce=["']([A-Za-z0-9+/_=-]+)["']/i)?.[1];
  const nonce = nonceValue ? ` nonce="${nonceValue}"` : '';
  return html.replace(/<html\b/i, '<html data-mms-theme="white-green-v1"').replace(/<\/head>/i, `<style id="mms-white-green-v1"${nonce}>${MMS_WORKSPACE_CSS}</style></head>`);
}

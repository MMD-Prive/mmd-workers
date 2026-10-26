// Shared visual layer for internal HTML served by Workers and Webflow.
// No requests, storage, authentication, routing or business mutations.
import { internalBrandLoader, SYSTEM_LIGHT, SYMBOL_BLACK, BRAND_SELECTOR } from './sigil-brand-v1.mjs';
import { WHITE_ORANGE_WORKSPACE_CSS } from './sigil-white-orange-v2.mjs';
import { DASHBOARD_POLISH_CSS } from './sigil-dashboard-polish-v2.mjs';
import { STUDIO_READABLE_CSS } from './sigil-studio-readable-v1.mjs';
import { usesMmsWorkspace, installMmsWorkspaceTheme } from './mms-workspace-theme-v1.mjs';
import { internalWorkspaceLoader } from './sigil-internal-workspace-v3.mjs';
export function usesSilverWorkspace(pathname) {
  const path = String(pathname || '/').replace(/\/+$/, '') || '/';
  if (usesMmsWorkspace(path)) return false;
  return /^\/internal(?:\/|$)/.test(path);
}

// Isolated from legacy Webflow loaders that replace the shared theme node.
export const PAYMENT_INBOX_READABLE_CSS = String.raw`
html body #sigil-workspace-directory#sigil-workspace-directory,
html body #sigil-workspace-directory#sigil-workspace-directory :is(nav,section,summary){background:#fff!important;color:#27313b!important;border-color:#c7ccd2!important}
html body #sigil-workspace-directory#sigil-workspace-directory :is(summary,h3,a,input,span,strong){color:#27313b!important;-webkit-text-fill-color:#27313b!important;opacity:1!important}
html body #sigil-workspace-directory#sigil-workspace-directory a{background:transparent!important}
html body #sigil-workspace-directory#sigil-workspace-directory a:is(:hover,[aria-current="page"]){background:#ffdab0!important}
html body:has(#mmd-payment-review) #mmdK{position:relative!important;inset:auto!important;width:auto!important;max-width:100%!important;margin:16px!important;background:#fff!important;border:1px solid #c7ccd2!important;box-shadow:none!important}
html body:has(#mmd-payment-review) #mmdK :is(a,b,span,strong){color:#27313b!important;-webkit-text-fill-color:#27313b!important}
html body #mmd-payment-review .pf-filters{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important;overflow:visible!important}
html body #mmd-payment-review .pf-filters button{width:100%!important;min-width:0!important;min-height:44px;white-space:normal!important;padding:10px 8px!important;background:#ffdab0!important;color:#27313b!important;-webkit-text-fill-color:#27313b!important;border:1px solid #c7833c!important}
html body #mmd-payment-review .pf-filters button[aria-pressed="true"]{background:#ffc88c!important;box-shadow:inset 0 0 0 1px #a65b17!important;font-weight:700}
`;

export const SILVER_WORKSPACE_CSS = String.raw`
/* Keep menus readable even when an older Webflow loader created them first. */
html[data-sigil-internal-theme] body #sigil-workspace-directory,
html[data-sigil-internal-theme] body #sigil-workspace-directory :is(nav,section,summary){background:#fff!important;color:#27313b!important;border-color:#c7ccd2!important}
html[data-sigil-internal-theme] body #sigil-workspace-directory :is(summary,h3,a,input,span,strong){color:#27313b!important;-webkit-text-fill-color:#27313b!important;opacity:1!important}
html[data-sigil-internal-theme] body #sigil-workspace-directory a{background:transparent!important}
html[data-sigil-internal-theme] body #sigil-workspace-directory a:is(:hover,[aria-current="page"]){background:#ffdab0!important;color:#27313b!important;-webkit-text-fill-color:#27313b!important}
/* Audience keeps the source list and its existing navigation in the light theme. */
html[data-sigil-internal-theme] body .aud27 .aud27-sourcebar,
html[data-sigil-internal-theme] body .aud27 .aud27-sourcebar :is(span,b,strong,small,code,a){background:#fff!important;color:#27313b!important;-webkit-text-fill-color:#27313b!important;border-color:#c7ccd2!important}
html[data-sigil-internal-theme] body .aud27 .aud27-sourcebar{flex-wrap:wrap;gap:8px}
html[data-sigil-internal-theme] body .aud27 .aud27-btn,
html[data-sigil-internal-theme] body .aud27 .aud27-nav button{background:#ffdab0!important;color:#27313b!important;-webkit-text-fill-color:#27313b!important;border-color:#c7833c!important}
html[data-sigil-internal-theme] body .aud27 .aud27-nav button:is(:hover,.is-active){background:#ffc88c!important;color:#27313b!important;-webkit-text-fill-color:#27313b!important}
html[data-sigil-internal-theme] body:has(.aud27) #mmdK{position:relative!important;inset:auto!important;width:auto!important;max-width:100%!important;margin:16px!important;background:#fff!important;color:#27313b!important;border:1px solid #c7ccd2!important;box-shadow:none!important}
html[data-sigil-internal-theme] body:has(.aud27) #mmdK :is(a,b,span,strong){color:#27313b!important;-webkit-text-fill-color:#27313b!important}

.sigil-system-logo{display:block!important;width:190px;max-width:100%;background:none!important;border:0!important;padding:0!important}.sigil-system-logo svg{display:block!important;width:100%!important;height:auto!important}@media(max-width:640px){.sigil-system-logo{width:160px}}
html[data-sigil-internal-theme="silver-orange-v1"]{color-scheme:light;--bg:#ffffff;--paper:#ffffff;--panel:#ffffff;--panel2:#edf0f3;--soft:#edf0f3;--ink:#272b30;--text:#272b30;--muted:#545c66;--mute:#545c66;--gold2:#a93e09;--line:#c7ccd2;--line2:#c7ccd2;--lime:#fed7aa;--sage:#edf0f3;--sage-deep:#454b54;--chip:#edf0f3;--background:#fff;--foreground:oklch(0.28714359 0.01078794 254.00936431);--surface:#fff;--surface-2:oklch(0.95 0.004 260);--card:var(--surface);--card-foreground:var(--foreground);--popover:var(--surface);--popover-foreground:var(--foreground);--primary:#fed7aa;--primary-foreground:#272b30;--gold:var(--primary);--gold-foreground:var(--primary-foreground);--gold-muted:oklch(.953 .028 55);--border:oklch(.81 .009 255);--input:var(--border);--ring:oklch(0.54607639 0.15962265 41.74058897 / 65%)}
html[data-sigil-internal-theme="silver-orange-v1"] body{background:#ffffff!important;color:#272b30!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(#adm27,.cr4,.c360,.ohub,.ohf,[data-mmd-owner-actions-summary]){--bg:#ffffff;--paper:#ffffff;--panel:#ffffff;--panel2:#edf0f3;--ink:#272b30;--text:#272b30;--muted:#545c66;--gold:#fed7aa;--gold2:#a93e09;--line:#c7ccd2;background-color:#ffffff!important;color:#272b30!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(main,header,aside,nav,section,article,details,dialog){border-color:#c7ccd2!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(#adm27 .adm27-card,#adm27 .adm27-focus,#adm27 .adm27-owner,#adm27 .adm27-summary article,#adm27 .adm27-disclosure,#adm27 .adm27-routecard,#adm27 .adm27-opgrid>a,#adm27 .adm27-quick a,#adm27 .adm27-ownergrid>a,#adm27 .adm27-annualgrid article,.cr4__section,.cr4__app,.cr4__details,.cr4__lock,.cr4__audit,.cr4__owner,.c360 .panel,.c360 .metric,.c360 .card,.c360 .memory-guide,.ohub-shell,.ohf-wrap,[data-mmd-owner-actions-summary]){background:#ffffff!important;border-color:#c7ccd2!important;color:#272b30!important;box-shadow:0 4px 18px rgb(39 43 48 / .04)!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(#adm27 .adm27-daily a,#adm27 .adm27-nav a,.cr4__quick a,.c360 .filters button){background:#edf0f3!important;border-color:#c7ccd2!important;color:#272b30!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(#adm27 h1,#adm27 h2,#adm27 h3,#adm27 strong,#adm27 .adm27-ownergrid>a strong,.cr4__top h1,.cr4__head h3,.cr4__app h4,.c360 h1,.c360 h2,.c360 h3,.ohub h2,.ohf h2,.ohf h3){color:#272b30!important;-webkit-text-fill-color:#272b30!important;background-image:none!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(#adm27 p,#adm27 small,#adm27 .adm27-ownergrid>a span,#adm27 .adm27-sectionhead>p,.cr4__head p,.cr4__app p,.cr4__app code,.cr4__detailsBody,.cr4__lock span,.ohub p,.ohf p){color:#545c66!important;-webkit-text-fill-color:#545c66!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(#adm27 .adm27-btn.is-primary,.cr4__btn.is-primary,.c360 .btn.primary){background:#fed7aa!important;border-color:#c47a38!important;color:#272b30!important;-webkit-text-fill-color:#272b30!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(#adm27 .adm27-refresh,#adm27 .adm27-btn:not(.is-primary),.cr4__btn:not(.is-primary),.c360 .btn:not(.primary)){background:#ffffff!important;border-color:#c7ccd2!important;color:#272b30!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(#adm27 .adm27-link,#adm27 .adm27-routecard b,#adm27 .adm27-opgrid b,.cr4__app b,.cr4__kicker,.cr4__details summary:after,.c360 .k){color:#a93e09!important;-webkit-text-fill-color:#a93e09!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(.cr4__rail,.sigil-navigation-rail,.access-card[aria-label="เมนูระบบภายใน"]){background:#272b30!important;color:#ffffff!important;border-color:#454b54!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(.cr4__rail,.sigil-navigation-rail,.access-card[aria-label="เมนูระบบภายใน"]) :is(a,strong,b,span,small){color:#ffffff!important;-webkit-text-fill-color:#ffffff!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(.cr4__rail,.sigil-navigation-rail,.access-card[aria-label="เมนูระบบภายใน"]) a[aria-current="page"]{background:#fed7aa!important;color:#272b30!important;-webkit-text-fill-color:#272b30!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(input,textarea,select){background-color:#ffffff!important;color:#272b30!important;border-color:#aeb6c0!important;caret-color:#fed7aa}
html[data-sigil-internal-theme="silver-orange-v1"] :is(.cr4__hero,.cr4__visual,.cr4__wall) :is(h2,h3,p){color:#fff!important;-webkit-text-fill-color:#fff!important}
html[data-sigil-internal-theme="silver-orange-v1"] :focus-visible{outline-color:#fed7aa!important}
/* Worker-rendered operational rooms share the same tokens and neutral surfaces. */
html[data-sigil-internal-theme="silver-orange-v1"] :is(.mms-admin,.mmdop,#mmd-review){color-scheme:light;--paper:#ffffff;--ink:#272b30;--muted:#545c66;--line:#c7ccd2;--lime:#fed7aa;--sage:#edf0f3;--sage-deep:#454b54;--mr-bg:#ffffff;--mr-panel:#ffffff;--mr-line:#c7ccd2;--mr-text:#272b30;--mr-muted:#545c66;--mr-gold:#fed7aa;background:#ffffff!important;color:#272b30!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(.panel,.metric,.card,.record-card,.form-card,.stat,.action-card,.tree,.fact,.case-row,.mmdop__topbar,.mr-card,.branch-sheet){background:#ffffff!important;color:#272b30!important;border-color:#c7ccd2!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(.btn,.mr-card button,.mr-actions button,.desktop-tab,.sheet-close,.record-edit summary,.mmdop__ghost){background:#edf0f3!important;color:#272b30!important;border-color:#c7ccd2!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(.btn.primary,.btn.gold,.mr-primary,.desktop-tab.active,.branch-next,.nav a[aria-current=page]){background:#fed7aa!important;color:#272b30!important;-webkit-text-fill-color:#272b30!important;border-color:#fed7aa!important}
html[data-sigil-internal-theme="silver-orange-v1"] .mobile-branch{background:#272b30!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(.mms-admin .hero,.top+.hero){background:#272b30!important;color:#fff!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(.mr-danger,.btn.bad){color:#a12535!important;border-color:#a12535!important}
html[data-sigil-internal-theme="silver-orange-v1"] .btn.good{color:#286442!important;border-color:#286442!important}
html[data-sigil-internal-theme="silver-orange-v1"] .btn.warn{color:#895209!important;border-color:#895209!important}

/* Light surfaces must not inherit a sidebar's white glyph fill. */
html[data-sigil-internal-theme="silver-orange-v1"] :is(.panel,.metric,.card,.record-card,.form-card,.stat,.action-card,.tree,.fact,.case-row,.mr-card,.branch-sheet,.internal-admin-theme) :where(*){-webkit-text-fill-color:currentColor}
html[data-sigil-internal-theme="silver-orange-v1"] :is(input,textarea)::placeholder{color:#545c66!important;opacity:1}
html[data-sigil-internal-theme="silver-orange-v1"] :is(button,input,select,textarea):disabled{opacity:1!important;background:#edf0f3!important;color:#545c66!important;-webkit-text-fill-color:#545c66!important;border-color:#c7ccd2!important;cursor:not-allowed}
html[data-sigil-internal-theme="silver-orange-v1"] button:disabled :where(*){color:inherit!important;-webkit-text-fill-color:currentColor!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(.mmdop,#mmd-review,.c360) :is(.muted,.hint,.meta,small){color:#545c66!important;-webkit-text-fill-color:#545c66!important}

/* Model Link keeps every expanded review surface readable under silver tokens. */
html[data-sigil-internal-theme="silver-orange-v1"] .model-line-link-page{--ok:#286442;--danger:#a12535;--blue:#245e88;--burg:#89334f;background:#ffffff!important}
html[data-sigil-internal-theme="silver-orange-v1"] .model-line-link-page :is(.origin-section,.pill,.badge,.folder-tree,.candidate,.avatar,.empty,.notice){background:#ffffff!important;color:#545c66!important;border-color:#c7ccd2!important}
html[data-sigil-internal-theme="silver-orange-v1"] .model-line-link-page :is(.card,.tree-lane,.folder-children,.claim-workflow,.mini,.back){border-color:#c7ccd2!important}
html[data-sigil-internal-theme="silver-orange-v1"] .model-line-link-page :is(.category-btn,.lane-btn,.folder-pick,button.secondary){background:#edf0f3!important;color:#272b30!important;border:1px solid #c7ccd2!important}
html[data-sigil-internal-theme="silver-orange-v1"] .model-line-link-page :is(button:not(.secondary):not(.category-btn):not(.lane-btn):not(.folder-pick):not(:disabled),.category-btn.active,.lane-btn.active,.folder-pick.active){background:#fed7aa!important;color:#272b30!important;-webkit-text-fill-color:#272b30!important;border-color:#fed7aa!important}
html[data-sigil-internal-theme="silver-orange-v1"] .model-line-link-page :is(button.secondary){background:#edf0f3!important;color:#272b30!important;-webkit-text-fill-color:#272b30!important}
html[data-sigil-internal-theme="silver-orange-v1"] .model-line-link-page button:disabled{opacity:1!important;background:#edf0f3!important;color:#545c66!important;-webkit-text-fill-color:#545c66!important;border:1px solid #c7ccd2!important}
html[data-sigil-internal-theme="silver-orange-v1"] .model-line-link-page :is(.status,.eyebrow,.origin-count,.claim-workflow>summary,.origin-section>summary:after,.claim-workflow>summary:after,.avatar .initial,.mini.drive){color:#a93e09!important}
html[data-sigil-internal-theme="silver-orange-v1"] .model-line-link-page :is(.notice.ok,.verified,.mini.airtable){color:#286442!important}
html[data-sigil-internal-theme="silver-orange-v1"] .model-line-link-page .notice.err{color:#a12535!important}
html[data-sigil-internal-theme="silver-orange-v1"] .model-line-link-page .mini.public{color:#245e88!important}
html[data-sigil-internal-theme="silver-orange-v1"] .model-line-link-page .mini.private{color:#89334f!important}
html[data-sigil-internal-theme="silver-orange-v1"] .model-line-link-page :is(button,a,input,summary):focus-visible{outline:3px solid #fed7aa!important;outline-offset:3px}

${DASHBOARD_POLISH_CSS}
${WHITE_ORANGE_WORKSPACE_CSS}
/* Keep CEO navigation surfaces and glyphs on the same light palette. */
html[data-sigil-ceo-theme="blue-v1"] #sigil-workspace-directory#sigil-workspace-directory,
html[data-sigil-ceo-theme="blue-v1"] #sigil-workspace-directory#sigil-workspace-directory :is(nav,section){background:#fff!important;color:#272b30!important;border-color:#c7ccd2!important}
html[data-sigil-ceo-theme="blue-v1"] #sigil-workspace-directory#sigil-workspace-directory :is(summary,a,h3,input){color:#272b30!important;-webkit-text-fill-color:#272b30!important;opacity:1!important}
html[data-sigil-ceo-theme="blue-v1"] #sigil-workspace-directory#sigil-workspace-directory a{background:transparent!important}
html[data-sigil-ceo-theme="blue-v1"] #sigil-workspace-directory#sigil-workspace-directory a:hover{background:#fff7ed!important}
html[data-sigil-ceo-theme="blue-v1"] #sigil-workspace-directory#sigil-workspace-directory a[aria-current="page"]{background:#fed7aa!important;color:#272b30!important;-webkit-text-fill-color:#272b30!important}
html[data-sigil-ceo-theme="blue-v1"] #sigil-workspace-directory#sigil-workspace-directory :is(a,summary,input):focus-visible{outline:3px solid #9a4a0b!important;outline-offset:2px}
html[data-sigil-ceo-theme="blue-v1"] #ceo28 .ceo28-list,
html[data-sigil-ceo-theme="blue-v1"] #ceo28 .ceo28-list :is(div,p,small){color:#545c66!important;-webkit-text-fill-color:#545c66!important;opacity:1!important}
/* Preserve every shortcut while removing the fixed dock's content overlap. */
html[data-sigil-ceo-theme="blue-v1"] body #mmdK{position:static!important;inset:auto!important;width:auto!important;max-width:100%!important;margin:16px!important;box-sizing:border-box;flex-wrap:wrap!important}
html[data-sigil-ceo-theme="blue-v1"] body .mmd-aiops-btn{bottom:16px!important;right:16px!important}
html[data-sigil-ceo-theme="blue-v1"] body{padding-bottom:88px!important}

${STUDIO_READABLE_CSS}
`;

export function silverWorkspaceLoader() {
  return `(()=>{const usesMmsWorkspace=${usesMmsWorkspace.toString()};const eligible=${usesSilverWorkspace.toString()};if(!eligible(location.pathname))return;document.documentElement.dataset.sigilInternalTheme='silver-orange-v1';if(/^\\/internal\\/ceo(?:\\/|$)/.test(location.pathname))document.documentElement.dataset.sigilCeoTheme='blue-v1';else delete document.documentElement.dataset.sigilCeoTheme;let style=document.getElementById('sigil-internal-silver-v1');if(!style){style=document.createElement('style');style.id='sigil-internal-silver-v1';document.head.appendChild(style)}style.textContent=${JSON.stringify(SILVER_WORKSPACE_CSS)};${internalBrandLoader(true)}})();`;
}

export function installInternalSilverTheme(doc = document, loc = location) {
  if (usesMmsWorkspace(loc.pathname)) { installMmsWorkspaceTheme(doc); return; }
  if (!usesSilverWorkspace(loc.pathname)) return;
  const silver = usesSilverWorkspace(loc.pathname);
  if (/^\/internal\/ceo(?:\/|$)/.test(loc.pathname)) doc.documentElement.dataset.sigilCeoTheme = 'blue-v1';
  else delete doc.documentElement.dataset.sigilCeoTheme;
  if (silver) doc.documentElement.dataset.sigilInternalTheme = 'silver-orange-v1';
  else delete doc.documentElement.dataset.sigilInternalTheme;
  let style = doc.getElementById('sigil-internal-silver-v1');
  if (!style) {
    style = doc.createElement('style'); style.id = 'sigil-internal-silver-v1';
    doc.head.appendChild(style);
  }
  const css = silver ? SILVER_WORKSPACE_CSS : SILVER_WORKSPACE_CSS.split('html[data-sigil-internal-theme=')[0];
  // A pinned new loader must also upgrade older Worker-injected styles.
  if (style.textContent !== css) style.textContent = css;
  doc.querySelectorAll(BRAND_SELECTOR).forEach(node => {
    if (node.dataset.sigilBrand === 'v1') return;
    const holder = doc.createElement('span'); holder.className = 'sigil-system-logo';
    holder.innerHTML = SYSTEM_LIGHT;
    node.replaceChildren(holder); node.dataset.sigilBrand = 'v1'; node.setAttribute('aria-label', 'SĪGIL System');
  });
  let icon = doc.querySelector('link[rel="icon"]');
  if (!icon) { icon = doc.createElement('link'); icon.rel = 'icon'; doc.head.appendChild(icon); }
  icon.href = 'data:image/svg+xml,' + encodeURIComponent(SYMBOL_BLACK); icon.type = 'image/svg+xml';
}

export async function decorateInternalSilverTheme(request, response) {
  const path = new URL(request.url).pathname;
  if (request.method !== 'GET' || !usesSilverWorkspace(path) || response.status !== 200 || !(response.headers.get('content-type') || '').includes('text/html')) return response;
  let html = await response.text();
  if (!/<html\b/i.test(html)) return new Response(html, response);
  // Legacy pinned loaders replace the shared style after page load. Keep the
  // Audience contrast repair in a separate style node that they do not own.
  if (path.replace(/\/$/, '') === '/internal/ceo/audience' && !html.includes('id="sigil-audience-contrast-v1"')) {
    const nonce = html.match(/<script\b[^>]*\bnonce=["']([A-Za-z0-9+/_=-]+)["']/i)?.[1];
    const contrast = SILVER_WORKSPACE_CSS.split('.sigil-system-logo')[0];
    html = html.replace(/<\/head>/i, `<style id="sigil-audience-contrast-v1"${nonce ? ` nonce="${nonce}"` : ''}>${contrast}</style></head>`);
  }
  if (path.replace(/\/+$/, '') === '/internal/ceo/payment-slip-inbox' && !html.includes('id="sigil-payment-inbox-readable-v1"')) {
    const nonce = html.match(/<script\b[^>]*\bnonce=["']([A-Za-z0-9+/_=-]+)["']/i)?.[1];
    html = html.replace(/<\/head>/i, `<style id="sigil-payment-inbox-readable-v1"${nonce ? ` nonce="${nonce}"` : ''}>${PAYMENT_INBOX_READABLE_CSS}</style></head>`);
  }
  // Studio link cards are not semantic sections. Their background and text must
  // stay paired, including when a legacy loader replaces the shared style node.
  if (path.replace(/\/+$/, '') === '/internal/admin/studio' && !html.includes('id="sigil-studio-readable-v1"')) {
    const nonce = html.match(/<script\b[^>]*\bnonce=["']([A-Za-z0-9+/_=-]+)["']/i)?.[1];
    html = html.replace(/<\/head>/i, `<style id="sigil-studio-readable-v1"${nonce ? ` nonce="${nonce}"` : ''}>${STUDIO_READABLE_CSS}</style></head>`);
  }
  if (html.includes('id="sigil-internal-silver-v1"')) {
    const headers = new Headers(response.headers);
    headers.delete('content-length'); headers.delete('content-encoding'); headers.delete('etag');
    return new Response(html, {status: response.status, statusText: response.statusText, headers});
  }
  // The MMS exception is checked before reading or decorating the response.
  const silver = usesSilverWorkspace(path);
  const css = silver ? SILVER_WORKSPACE_CSS : SILVER_WORKSPACE_CSS.split('html[data-sigil-internal-theme=')[0];
  const ceoTheme = /^\/internal\/ceo(?:\/|$)/.test(path) ? ' data-sigil-ceo-theme="blue-v1"' : '';
  const branded = silver ? html.replace(/<html\b/i, `<html data-sigil-internal-theme="silver-orange-v1"${ceoTheme}`) : html;
  const nonceValue = html.match(/<script\b[^>]*\bnonce=["']([A-Za-z0-9+/_=-]+)["']/i)?.[1];
  const nonce = nonceValue ? ` nonce="${nonceValue}"` : '';
  const workspace = path !== '/internal/admin/payments' && /^\/internal\/(?:admin|ceo)(?:\/|$)/.test(path) ? `<script data-sigil-workspace="v3"${nonce}>document.addEventListener('DOMContentLoaded',()=>{${internalWorkspaceLoader()}});</script>` : '';
  const themed = branded.replace(/<\/head>/i, `<style id="sigil-internal-silver-v1"${nonce}>${css}</style><script data-sigil-brand="v1"${nonce}>${internalBrandLoader(true)}</script>${workspace}</head>`);
  const headers = new Headers(response.headers);
  headers.delete('content-length'); headers.delete('content-encoding'); headers.delete('etag');
  headers.set('x-sigil-internal-theme', silver ? 'silver-orange-v1' : 'preserved-job-theme');
  return new Response(themed, { status: response.status, statusText: response.statusText, headers });
}

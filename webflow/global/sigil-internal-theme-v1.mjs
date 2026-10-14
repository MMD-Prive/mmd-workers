// Shared visual layer for internal HTML served by Workers and Webflow.
// No requests, storage, authentication, routing or business mutations.
import { internalBrandLoader, SYSTEM_LIGHT, SYSTEM_DARK, SYMBOL_BLACK, BRAND_SELECTOR } from './sigil-brand-v1.mjs';
import { DASHBOARD_POLISH_CSS } from './sigil-dashboard-polish-v2.mjs';
import { usesMmsWorkspace, installMmsWorkspaceTheme } from './mms-workspace-theme-v1.mjs';
export function usesSilverWorkspace(pathname) {
  const path = String(pathname || '/').replace(/\/+$/, '') || '/';
  if (usesMmsWorkspace(path)) return false;
  if (!/^\/internal\/(?:admin|ceo)(?:\/|$)/.test(path)) return false;
  return !['/internal/admin/jobs/create-job', '/internal/admin/jobs/create-session', '/internal/admin/jobs/job-board', '/internal/admin/job-board', '/internal/admin/jobs/broadcast', '/internal/admin/broadcast-work'].some(route => path === route || path.startsWith(route + '/'));
}

export const SILVER_WORKSPACE_CSS = String.raw`
.sigil-system-logo{display:block!important;width:190px;max-width:100%;background:none!important;border:0!important;padding:0!important}.sigil-system-logo svg{display:block!important;width:100%!important;height:auto!important}@media(max-width:640px){.sigil-system-logo{width:160px}}
html[data-sigil-internal-theme="silver-orange-v1"]{color-scheme:light;--bg:#e5e7eb;--paper:#f7f8fa;--panel:#f7f8fa;--panel2:#edf0f3;--soft:#edf0f3;--ink:#272b30;--text:#272b30;--muted:#545c66;--mute:#545c66;--gold2:#a93e09;--line:#c7ccd2;--line2:#c7ccd2;--lime:#b9470d;--sage:#edf0f3;--sage-deep:#454b54;--chip:#edf0f3;--background:oklch(0.92758230 0.00581351 264.53129120);--foreground:oklch(0.28714359 0.01078794 254.00936431);--surface:oklch(0.97893222 0.00286514 264.54207416);--surface-2:oklch(0.95 0.004 260);--card:var(--surface);--card-foreground:var(--foreground);--popover:var(--surface);--popover-foreground:var(--foreground);--primary:oklch(0.54607639 0.15962265 41.74058897);--primary-foreground:oklch(.99 0 0);--gold:var(--primary);--gold-foreground:var(--primary-foreground);--gold-muted:oklch(.953 .028 55);--border:oklch(.81 .009 255);--input:var(--border);--ring:oklch(0.54607639 0.15962265 41.74058897 / 65%)}
html[data-sigil-internal-theme="silver-orange-v1"] body{background:#e5e7eb!important;color:#272b30!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(#adm27,.cr4,.c360,.ohub,.ohf,[data-mmd-owner-actions-summary]){--bg:#e5e7eb;--paper:#f7f8fa;--panel:#f7f8fa;--panel2:#edf0f3;--ink:#272b30;--text:#272b30;--muted:#545c66;--gold:#b9470d;--gold2:#a93e09;--line:#c7ccd2;background-color:#e5e7eb!important;color:#272b30!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(main,header,aside,nav,section,article,details,dialog){border-color:#c7ccd2!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(#adm27 .adm27-card,#adm27 .adm27-focus,#adm27 .adm27-owner,#adm27 .adm27-summary article,#adm27 .adm27-disclosure,#adm27 .adm27-routecard,#adm27 .adm27-opgrid>a,#adm27 .adm27-quick a,#adm27 .adm27-ownergrid>a,#adm27 .adm27-annualgrid article,.cr4__section,.cr4__app,.cr4__details,.cr4__lock,.cr4__audit,.cr4__owner,.c360 .panel,.c360 .metric,.c360 .card,.c360 .memory-guide,.ohub-shell,.ohf-wrap,[data-mmd-owner-actions-summary]){background:#f7f8fa!important;border-color:#c7ccd2!important;color:#272b30!important;box-shadow:0 4px 18px rgb(39 43 48 / .04)!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(#adm27 .adm27-daily a,#adm27 .adm27-nav a,.cr4__quick a,.c360 .filters button){background:#edf0f3!important;border-color:#c7ccd2!important;color:#272b30!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(#adm27 h1,#adm27 h2,#adm27 h3,#adm27 strong,#adm27 .adm27-ownergrid>a strong,.cr4__top h1,.cr4__head h3,.cr4__app h4,.c360 h1,.c360 h2,.c360 h3,.ohub h2,.ohf h2,.ohf h3){color:#272b30!important;-webkit-text-fill-color:#272b30!important;background-image:none!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(#adm27 p,#adm27 small,#adm27 .adm27-ownergrid>a span,#adm27 .adm27-sectionhead>p,.cr4__head p,.cr4__app p,.cr4__app code,.cr4__detailsBody,.cr4__lock span,.ohub p,.ohf p){color:#545c66!important;-webkit-text-fill-color:#545c66!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(#adm27 .adm27-btn.is-primary,.cr4__btn.is-primary,.c360 .btn.primary){background:#b9470d!important;border-color:#b9470d!important;color:#fff!important;-webkit-text-fill-color:#fff!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(#adm27 .adm27-refresh,#adm27 .adm27-btn:not(.is-primary),.cr4__btn:not(.is-primary),.c360 .btn:not(.primary)){background:#f7f8fa!important;border-color:#c7ccd2!important;color:#272b30!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(#adm27 .adm27-link,#adm27 .adm27-routecard b,#adm27 .adm27-opgrid b,.cr4__app b,.cr4__kicker,.cr4__details summary:after,.c360 .k){color:#a93e09!important;-webkit-text-fill-color:#a93e09!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(.cr4__rail,.sigil-navigation-rail,.access-card[aria-label="เมนูระบบภายใน"]){background:#272b30!important;color:#f7f8fa!important;border-color:#454b54!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(.cr4__rail,.sigil-navigation-rail,.access-card[aria-label="เมนูระบบภายใน"]) :is(a,strong,b,span,small){color:#e5e7eb!important;-webkit-text-fill-color:#e5e7eb!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(.cr4__rail,.sigil-navigation-rail,.access-card[aria-label="เมนูระบบภายใน"]) a[aria-current="page"]{background:#b9470d!important;color:#fff!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(input,textarea,select){background-color:#f7f8fa!important;color:#272b30!important;border-color:#aeb6c0!important;caret-color:#b9470d}
html[data-sigil-internal-theme="silver-orange-v1"] :is(.cr4__hero,.cr4__visual,.cr4__wall) :is(h2,h3,p){color:#fff!important;-webkit-text-fill-color:#fff!important}
html[data-sigil-internal-theme="silver-orange-v1"] :focus-visible{outline-color:#b9470d!important}
/* Worker-rendered operational rooms share the same tokens and neutral surfaces. */
html[data-sigil-internal-theme="silver-orange-v1"] :is(.mms-admin,.mmdop,#mmd-review){color-scheme:light;--paper:#f7f8fa;--ink:#272b30;--muted:#545c66;--line:#c7ccd2;--lime:#b9470d;--sage:#edf0f3;--sage-deep:#454b54;--mr-bg:#e5e7eb;--mr-panel:#f7f8fa;--mr-line:#c7ccd2;--mr-text:#272b30;--mr-muted:#545c66;--mr-gold:#b9470d;background:#e5e7eb!important;color:#272b30!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(.panel,.metric,.card,.record-card,.form-card,.stat,.action-card,.tree,.fact,.case-row,.mmdop__topbar,.mr-card,.branch-sheet){background:#f7f8fa!important;color:#272b30!important;border-color:#c7ccd2!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(.btn,.mr-card button,.mr-actions button,.desktop-tab,.sheet-close,.record-edit summary,.mmdop__ghost){background:#edf0f3!important;color:#272b30!important;border-color:#c7ccd2!important}
html[data-sigil-internal-theme="silver-orange-v1"] :is(.btn.primary,.btn.gold,.mr-primary,.desktop-tab.active,.branch-next,.nav a[aria-current=page]){background:#b9470d!important;color:#fff!important;border-color:#b9470d!important}
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

${DASHBOARD_POLISH_CSS}
`;

export function silverWorkspaceLoader() {
  return `(()=>{const eligible=${usesSilverWorkspace.toString()};if(!eligible(location.pathname))return;document.documentElement.dataset.sigilInternalTheme='silver-orange-v1';if(document.getElementById('sigil-internal-silver-v1'))return;const style=document.createElement('style');style.id='sigil-internal-silver-v1';style.textContent=${JSON.stringify(SILVER_WORKSPACE_CSS)};document.head.appendChild(style)})();` + internalBrandLoader();
}

export function installInternalSilverTheme(doc = document, loc = location) {
  if (usesMmsWorkspace(loc.pathname)) installMmsWorkspaceTheme(doc);
  if (!/^\/internal\/(?:admin|ceo)(?:\/|$)/.test(loc.pathname)) return;
  const silver = usesSilverWorkspace(loc.pathname);
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
    holder.innerHTML = node.closest('.cr4__rail,aside,.access-card') ? SYSTEM_DARK : SYSTEM_LIGHT;
    node.replaceChildren(holder); node.dataset.sigilBrand = 'v1'; node.setAttribute('aria-label', 'SĪGIL System');
  });
  let icon = doc.querySelector('link[rel="icon"]');
  if (!icon) { icon = doc.createElement('link'); icon.rel = 'icon'; doc.head.appendChild(icon); }
  icon.href = 'data:image/svg+xml,' + encodeURIComponent(SYMBOL_BLACK); icon.type = 'image/svg+xml';
}

export async function decorateInternalSilverTheme(request, response) {
  const path = new URL(request.url).pathname;
  if (request.method !== 'GET' || !/^\/internal\/(?:admin|ceo)(?:\/|$)/.test(path) || response.status !== 200 || !(response.headers.get('content-type') || '').includes('text/html')) return response;
  const html = await response.text();
  if (!/<html\b/i.test(html) || html.includes('id="sigil-internal-silver-v1"')) return new Response(html, response);
  // Excluded pages retain their colors; only the brand artwork changes there.
  const silver = usesSilverWorkspace(path);
  const css = silver ? SILVER_WORKSPACE_CSS : SILVER_WORKSPACE_CSS.split('html[data-sigil-internal-theme=')[0];
  const branded = silver ? html.replace(/<html\b/i, '<html data-sigil-internal-theme="silver-orange-v1"') : html;
  const nonceValue = html.match(/<script\b[^>]*\bnonce=["']([A-Za-z0-9+/_=-]+)["']/i)?.[1];
  const nonce = nonceValue ? ` nonce="${nonceValue}"` : '';
  const themed = branded.replace(/<\/head>/i, `<style id="sigil-internal-silver-v1"${nonce}>${css}</style><script data-sigil-brand="v1"${nonce}>${internalBrandLoader()}</script></head>`);
  const headers = new Headers(response.headers);
  headers.delete('content-length'); headers.delete('content-encoding'); headers.delete('etag');
  headers.set('x-sigil-internal-theme', silver ? 'silver-orange-v1' : 'preserved-job-theme');
  return new Response(themed, { status: response.status, statusText: response.statusText, headers });
}

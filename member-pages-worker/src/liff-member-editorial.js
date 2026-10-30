// Presentation only. Audience remains the canonical Worker projection; no API/session code.
import {ENTRY_PUBLIC_WORDMARK,ENTRY_PRIVATE_WORDMARK} from './liff-entry-wordmarks.js';
import {ENTRY_SIGIL_WALL} from './liff-entry-editorial-assets.js';
export function renderMemberEditorialMasthead(){return `<div class="member-editorial-identity"><p class="member-editorial-wordmark member-editorial-public" aria-label="MY MMD">${ENTRY_PUBLIC_WORDMARK}</p><p class="member-editorial-wordmark member-editorial-private" aria-label="MY SĪGIL">${ENTRY_PRIVATE_WORDMARK}</p><p class="member-editorial-neutral">MY MMD</p><p class="member-editorial-slogan">Discreet by desire,<br>Elegance by choice.</p></div>`;}
export const MEMBER_EDITORIAL_CSS = `
/* Shares CI with entry. All rules require entered state and exclude signup. */
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode){--v4-bg:#f9f9f9;--v4-panel:#fff;--v4-raised:#f0efeb;--v4-ink:#202320;--v4-muted:#666861;--v4-line:#dad8d0;--v4-gold:#6b6250;--digital-bg:var(--v4-bg);--digital-surface:var(--v4-panel);--digital-raised:var(--v4-raised);--digital-line:var(--v4-line);--digital-gold:var(--v4-gold);--digital-cream:var(--v4-ink);--digital-muted:var(--v4-muted);--digital-radius:6px;--mmd-base:var(--v4-bg);--mmd-graphite:var(--v4-panel);--mmd-ivory:var(--v4-ink);--mmd-muted:var(--v4-muted);--mmd-gold:var(--v4-gold);--mmd-line:var(--v4-line);background:var(--v4-bg);color:var(--v4-ink);color-scheme:light}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode)[data-brand-audience="public"]{--v4-gold:#b21d33}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode)[data-brand-audience="private"]{--v4-bg:#0b0e10;--v4-panel:#15191a;--v4-raised:#202524;--v4-ink:#f3f0e8;--v4-muted:#c6bcaa;--v4-line:#c9b38a40;--v4-gold:#c9b38a;color-scheme:dark}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode),body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) :is(h1,h2,h3,button,input,textarea,select,summary){font-family:EntryUI,EntryThai,system-ui,sans-serif!important}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) main{position:relative;isolation:isolate;background:var(--digital-bg);padding-top:calc(14px + env(safe-area-inset-top));color:var(--digital-cream)}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) main::before{content:"";position:absolute;inset:0 0 auto;height:460px;z-index:-1;pointer-events:none}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode)[data-brand-audience="private"] main::before{background:linear-gradient(180deg,#0b0e1030,#0b0e10 100%),url('${ENTRY_SIGIL_WALL}') center 12%/cover no-repeat;opacity:.65}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) #profile{max-width:520px;padding-inline:20px;background:transparent;border:0;box-shadow:none}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) .section-rail{background:transparent;border:0;box-shadow:none}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) .digital-home{padding:0;gap:16px;background:transparent}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) .digital-top{flex-direction:row;justify-content:space-between;align-items:center;min-height:58px;margin:0;padding:0 0 12px;border-bottom:1px solid var(--digital-line);background:transparent;gap:12px}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) .digital-top>div:last-child{align-self:center;order:0;max-width:62%;gap:6px}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) .customer-brand-v6{width:auto;max-width:135px;display:block;margin:0;justify-content:start}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) .customer-brand-v6 [data-brand-panel="private"]{flex-direction:row;gap:8px;text-align:left}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) .customer-brand-v6 [data-brand-panel="private"] img{width:19px;height:34px;filter:none}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) .customer-brand-v6 p{font:500 10px/1.4 EntryUI,EntryThai,sans-serif;color:var(--digital-cream);letter-spacing:.08em;margin:0}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) :is(.digital-session,.digital-signout){color:var(--digital-muted);background:transparent;border-color:var(--digital-line)}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) .digital-signout{min-height:44px}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) .digital-bangkok-trace{height:26px;color:var(--digital-gold);opacity:.22;margin-bottom:-10px}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) .digital-hello{position:relative;margin:0;padding:0 0 6px}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode)[data-brand-audience="public"] .digital-hello{background:radial-gradient(ellipse at 94% 10%,#df794f14,transparent 65%)}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) .member-editorial-identity{position:relative;display:flex;justify-content:space-between;align-items:center;gap:14px;margin-bottom:16px;min-width:0}
.member-editorial-wordmark{display:none;margin:0;width:64%;max-width:240px;flex:none}.member-editorial-wordmark svg{display:block;width:100%;height:auto}.member-editorial-slogan{display:none;margin:0;color:var(--digital-muted);font:italic 13px/1.45 EntryDisplay,serif}.member-editorial-neutral{margin:12px 0;font-size:22px;letter-spacing:.08em}
body[data-brand-audience="public"].app-entered:not(.signup-mode) .member-editorial-public{display:block;color:var(--digital-cream);--ed-accent:#c91e35}
body[data-brand-audience="private"].app-entered:not(.signup-mode) .member-editorial-private{display:block;color:#dfca98}
body:is([data-brand-audience="public"],[data-brand-audience="private"]).app-entered:not(.signup-mode) .member-editorial-slogan{display:block}
body:is([data-brand-audience="public"],[data-brand-audience="private"]).app-entered:not(.signup-mode) .member-editorial-neutral{display:none}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) .digital-hello h1{font-size:23px;font-weight:500;line-height:1.5;margin:0 0 5px}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) .digital-sub{font-size:12px;line-height:1.7;color:var(--digital-muted)}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) :is(.digital-news-disclosure,.digital-snapshot,.pm,.digital-mission,.digital-design-slot){margin:0;padding:16px;border:1px solid var(--digital-line);border-radius:6px;background:var(--digital-surface);box-shadow:none;color:var(--digital-cream)}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) .digital-news-disclosure{padding:0;border-top:2px solid var(--digital-gold)}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) .digital-news-summary{padding:13px 16px;min-height:58px;border:0;background:transparent;color:var(--digital-cream)}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) .digital-news-feed{padding:0 14px 14px;background:transparent}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) :is(.digital-news-card,.digital-quiet){background:var(--digital-bg);border-color:var(--digital-line);border-radius:4px;color:var(--digital-muted)}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) .digital-snapshot{grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) .digital-snapshot strong{color:var(--digital-cream);font-weight:500}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) .digital-points{font:400 26px/1.2 EntryDisplay,serif!important;color:var(--digital-gold)!important}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) .pm-heading h2{font-size:18px;font-weight:500;line-height:1.5}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) .pm-choices button{padding:7px;border-radius:4px;background:transparent;color:var(--digital-cream)}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) .pm-choices img{height:116px;object-position:center top;border-radius:3px}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) .pm-portrait{display:block;width:100%;height:116px;overflow:hidden;border-radius:3px}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode)[data-brand-audience="private"] [data-pm-choice="hima"] .pm-portrait img{object-position:50% 0%;transform:scale(1.32);transform-origin:50% 0%}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) .pm button{font-size:12px}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) .pm>button{width:auto;margin-top:12px;padding:8px 16px;border:1px solid var(--digital-line);border-radius:4px;background:transparent;color:var(--digital-muted)}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) .digital-blackcard-entry a{display:inline-block;min-height:44px;padding-block:12px;color:var(--digital-muted);font-size:11px;text-decoration:none;border-bottom:1px solid var(--digital-line)}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) .digital-quick-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) .digital-quick-grid button{min-width:0;min-height:68px;border:1px solid var(--digital-line);border-radius:5px;background:var(--digital-surface);color:var(--digital-cream);font-size:10px;line-height:1.5}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) .digital-dock{background:var(--digital-bg);border-color:var(--digital-line);box-shadow:0 -8px 24px #00000008}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) .digital-dock :is(button,a){min-height:48px;background:transparent;color:var(--digital-muted)}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) .digital-dock button[aria-current="page"]{background:var(--digital-surface);color:var(--digital-gold)}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) .digital-view>.card{border-color:var(--digital-line);background:transparent}
body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) :is(.digital-view,.digital-requests,.digital-care) :is(input,textarea,select){background:var(--digital-surface);border-color:var(--digital-line);color:var(--digital-cream)}
@media(max-width:360px){body[data-mmd-graphics="v6"][data-mmd-liff-compact="v4"].app-entered:not(.signup-mode) #profile{padding-inline:15px}.member-editorial-slogan{font-size:11px}.member-editorial-wordmark{width:62%}}
`;

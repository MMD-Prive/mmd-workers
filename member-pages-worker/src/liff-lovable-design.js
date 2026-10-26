// Presentation snapshot from Lovable My MMD; no runtime fetch or member authority.
// Project: 773a8fe9-7282-49f2-8061-83cd0b6d4db3
// Source: docs/worker-design-export/my-mmd-tokens.css
// Commit: b91ad04dbeb0da9767be5e4a37d09c19751145f1
// Refresh deliberately after reviewing the source design; never import preview data.
// The verification surface uses the same reviewed palette before app-entered.
// Neutral branding remains in place until the existing Worker resolves identity.
export const MY_MMD_VERIFICATION_CSS = `
body:not(.signup-mode) #hype-loader,
body:not(.signup-mode) #intro-screen {
  --verify-base:#111110;--verify-surface:#1C1B19;--verify-ink:#F5F1E8;
  --verify-muted:#bcb6aa;--verify-gold:#C6A16A;--verify-line:#555248;
  font-family:MmdV6Thai,"Noto Sans Thai",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
}
body.context-resolving:not(.signup-mode) #hype-loader {
  background:radial-gradient(ellipse at 50% 30%,#272825 0,transparent 65%),var(--verify-base);
  color:var(--verify-ink);gap:16px;padding:max(24px,env(safe-area-inset-top)) 24px max(24px,env(safe-area-inset-bottom));
  overflow-y:auto;
}
#hype-loader .verification-art{position:relative;flex:none;display:grid;place-items:center;width:min(64vw,240px);height:min(64vw,240px)}
#hype-loader .verification-art .customer-graphic{inset:auto 0 0;width:100%;height:90px;color:var(--verify-gold);opacity:.24}
#hype-loader .verification-hype{display:block;position:relative;width:176px;height:176px;max-width:100%;object-fit:contain}
#hype-loader .verification-still{display:none}
#hype-loader .verification-logo{display:block;width:64px;height:64px;object-fit:contain}
#hype-loader .hype-loader-text{color:var(--verify-gold);font-size:11px;letter-spacing:.18em}
#hype-loader .hype-loader-text::after{display:none;animation:none}
#hype-loader .hype-progress{width:min(100%,300px);margin:0;color:var(--verify-muted);font-size:12px;line-height:1.6}
#hype-loader progress{height:6px;accent-color:var(--verify-gold)}
#hype-loader #customer-boot-retry{width:min(100%,300px);min-height:48px;border:1px solid var(--verify-line);border-radius:999px;background:var(--verify-surface);color:var(--verify-ink);text-align:center}
body:not(.signup-mode):not(.app-entered) #intro-screen{background:var(--verify-base);color:var(--verify-ink)}
body:not(.signup-mode):not(.app-entered) #intro-screen :is(.title,.welcome-brand strong){font-family:inherit;font-weight:600;color:var(--verify-ink)}
body:not(.signup-mode):not(.app-entered) #intro-screen :is(.sub,.remember-login-note){color:var(--verify-muted)}
body:not(.signup-mode):not(.app-entered) #intro-screen .intro-continue{background:var(--verify-gold)!important;color:var(--verify-base)!important}
@media(max-height:540px){#hype-loader .verification-art{width:120px;height:120px}#hype-loader .verification-hype{width:112px;height:112px}#hype-loader .verification-logo{width:40px;height:40px}}
@media(prefers-reduced-motion:reduce){#hype-loader .verification-motion{display:none}#hype-loader .verification-still{display:block}}
`;

export const MY_MMD_LOVABLE_DESIGN_CSS = `
body.app-entered:not(.signup-mode) {
  --mmd-base: #111110;
  --mmd-graphite: #1C1B19;
  --mmd-raised: #272825;
  --mmd-ivory: #F5F1E8;
  --mmd-muted: #bcb6aa;
  --mmd-gold: #C6A16A;
  --mmd-line: #555248;
  --mmd-focus: #C6A16A;
  --mmd-space-1: 4px;
  --mmd-space-2: 8px;
  --mmd-space-3: 12px;
  --mmd-space-4: 16px;
  --mmd-space-5: 20px;
  --mmd-radius: 8px;
  --mmd-type-caption: 12px;
  --mmd-type-body: 14px;
  --mmd-type-heading: 20px;
  --digital-bg: var(--mmd-base);
  --digital-surface: var(--mmd-graphite);
  --digital-raised: var(--mmd-raised);
  --digital-line: var(--mmd-line);
  --digital-gold: var(--mmd-gold);
  --digital-cream: var(--mmd-ivory);
  --digital-muted: var(--mmd-muted);
  --digital-radius: var(--mmd-radius);
  --digital-reading-max: 520px;
  --digital-shell-max: 552px;
}
body.app-entered:not(.signup-mode) main { background: var(--mmd-base); }
body.app-entered:not(.signup-mode) :focus-visible { outline: 2px solid var(--mmd-focus); outline-offset: 3px; }
body.app-entered:not(.signup-mode) .digital-dock { background: var(--mmd-base); }
@media (min-width: 700px) {
  body.app-entered:not(.signup-mode) .digital-dock {
    padding-left: max(16px, env(safe-area-inset-left), calc((100% - 520px) / 2));
    padding-right: max(16px, env(safe-area-inset-right), calc((100% - 520px) / 2));
  }
}
body.app-entered:not(.signup-mode) .digital-dock button,
body.app-entered:not(.signup-mode) .digital-dock a { font-size: var(--mmd-type-caption); }
body.app-entered:not(.signup-mode) .digital-snapshot {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--mmd-space-4);
  padding: var(--mmd-space-4);
  border-color: var(--mmd-line);
  background: var(--mmd-graphite);
}
body.app-entered:not(.signup-mode) .digital-snapshot-member { display: flex; align-items: center; gap: var(--mmd-space-3); min-width: 0; }
body.app-entered:not(.signup-mode) .digital-snapshot-member > div { min-width: 0; }
body.app-entered:not(.signup-mode) .digital-snapshot-icon { flex: none; }
body.app-entered:not(.signup-mode) .digital-snapshot-label,
body.app-entered:not(.signup-mode) .digital-points-note { display: block; color: var(--mmd-muted); font-size: var(--mmd-type-caption); line-height: 1.4; }
body.app-entered:not(.signup-mode) .digital-snapshot-points { min-width: 86px; text-align: right; }
body.app-entered:not(.signup-mode) .digital-points { font-variant-numeric: tabular-nums; }
@media (max-width: 360px) {
  body.app-entered:not(.signup-mode) .digital-snapshot { grid-template-columns: 1fr; }
  body.app-entered:not(.signup-mode) .digital-snapshot-points { padding-top: var(--mmd-space-3); border-top: 1px solid var(--mmd-line); text-align: left; }
  body.app-entered:not(.signup-mode) .digital-points { text-align: left; }
}
body.app-entered:not(.signup-mode) .digital-sub,
body.app-entered:not(.signup-mode) .digital-snapshot p,
body.app-entered:not(.signup-mode) .digital-news-card p { font-size: var(--mmd-type-body); line-height: 1.5; }
body.app-entered:not(.signup-mode) .digital-snapshot strong,
body.app-entered:not(.signup-mode) .digital-news-card h3 { font-size: var(--mmd-type-body); }
body.app-entered:not(.signup-mode) .digital-eyebrow,
body.app-entered:not(.signup-mode) .digital-news-card .meta,
body.app-entered:not(.signup-mode) .digital-feed-cta { font-size: var(--mmd-type-caption); }
body.app-entered:not(.signup-mode) .digital-news-card,
body.app-entered:not(.signup-mode) .digital-snapshot { min-width: 0; overflow-wrap: anywhere; }
body.app-entered:not(.signup-mode) .digital-quick button,
body.app-entered:not(.signup-mode) .digital-mission-toggle,
body.app-entered:not(.signup-mode) .digital-needs button { min-height: 44px; }
/* Carry the published MMD NOW image/CTA from the reviewed Public presentation.
   The existing Worker feed still decides which posts and URLs are customer-safe. */
body.app-entered:not(.signup-mode) .digital-news-card.has-image {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  align-items: start;
  gap: 12px;
}
body.app-entered:not(.signup-mode) .digital-news-image {
  display: block;
  width: 64px;
  height: 64px;
  border-radius: 4px;
  object-fit: cover;
  background: var(--digital-raised);
}
body.app-entered:not(.signup-mode) .digital-news-copy { min-width: 0; }
body.app-entered:not(.signup-mode) a.digital-feed-cta {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  color: var(--digital-gold);
  text-decoration: underline;
  text-underline-offset: 3px;
}
body.app-entered:not(.signup-mode) .digital-news-retry {
  display: block;
  min-height: 44px;
  width: 100%;
  border: 1px solid var(--digital-line);
  border-radius: var(--digital-radius);
  background: var(--digital-surface);
  color: var(--digital-cream);
  font: inherit;
}
`;

// Public composition stays scoped; the canonical Worker brand decision is unchanged.
export const MY_MMD_PUBLIC_BLEND_CSS = `
body.app-entered:not(.signup-mode) .digital-public-wordmark,
body.app-entered:not(.signup-mode) .digital-public-slogan{display:none}
body.app-entered:not(.signup-mode)[data-brand-audience="public"]{background:#f4f1eb;color:#221e20;color-scheme:light;--v4-bg:#f4f1eb;--v4-panel:#fffdfa;--v4-ink:#221e20;--v4-muted:#665d5d;--v4-line:#d6cec7;--v4-gold:#a41d36;--digital-text:#221e20;--digital-bg:#f4f1eb;--digital-surface:#fffdfa;--digital-raised:#ede9e2;--digital-cream:#221e20;--digital-muted:#665d5d;--digital-gold:#a41d36;--digital-line:#d6cec7;--mmd-base:#f4f1eb;--mmd-graphite:#fffdfa;--mmd-ivory:#221e20;--mmd-muted:#665d5d;--mmd-gold:#a41d36;--mmd-line:#d6cec7;--mmd-focus:#a41d36}
body.app-entered:not(.signup-mode)[data-brand-audience="public"] .digital-public-wordmark{display:block;font-size:clamp(30px,8vw,42px);font-weight:650;letter-spacing:-.045em;margin:0 0 10px;color:var(--digital-cream)}
body.app-entered:not(.signup-mode)[data-brand-audience="public"] .digital-public-wordmark span{border-bottom:3px solid #a41d36}
body.app-entered:not(.signup-mode)[data-brand-audience="public"] .digital-public-slogan{display:block;font-size:12px;line-height:1.5}
body.app-entered:not(.signup-mode)[data-brand-audience="public"] :is(main,.digital-home,.digital-snapshot,.digital-news-disclosure,.digital-news-feed,.digital-quick,.digital-dock,.customer-progress){background:var(--digital-bg);color:var(--digital-cream)}
body.app-entered:not(.signup-mode)[data-brand-audience="public"] :is(.digital-greeting,.digital-sub,.digital-news-summary,.digital-snapshot strong,.digital-quick-grid button){color:var(--digital-cream)}
body.app-entered:not(.signup-mode)[data-brand-audience="public"] .pm-choices img,
body.app-entered:not(.signup-mode)[data-brand-audience="public"] .pm [data-pm-avatar]{object-position:center top}
body.app-entered:not(.signup-mode)[data-brand-audience="public"] .digital-news-summary{border-top:2px solid var(--digital-gold)}
body.app-entered:not(.signup-mode)[data-brand-audience="public"] .digital-news-card.has-image{grid-template-columns:80px minmax(0,1fr)}
body.app-entered:not(.signup-mode)[data-brand-audience="public"] .digital-news-image{width:80px;height:96px}
body.app-entered:not(.signup-mode)[data-brand-audience="public"] .digital-quick-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
body.app-entered:not(.signup-mode)[data-brand-audience="public"] .digital-quick-grid button{min-width:0;min-height:56px;white-space:normal;overflow-wrap:anywhere;font-size:12px}
body.app-entered:not(.signup-mode) .digital-account-row{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;padding:14px 0;border-bottom:1px solid var(--digital-line);overflow-wrap:anywhere}
body.app-entered:not(.signup-mode) #digital-account progress{width:100%;accent-color:var(--digital-gold)}
@media(max-width:430px){body.app-entered:not(.signup-mode)[data-brand-audience="public"] .digital-home{padding-inline:16px}body.app-entered:not(.signup-mode)[data-brand-audience="public"] .digital-snapshot{gap:12px;padding:14px}body.app-entered:not(.signup-mode)[data-brand-audience="public"] .digital-news-image{width:64px;height:80px}body.app-entered:not(.signup-mode)[data-brand-audience="public"] .digital-news-card.has-image{grid-template-columns:64px minmax(0,1fr)}}
`;

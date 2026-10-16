// Presentation snapshot from Lovable My MMD; no runtime fetch or member authority.
// Project: 773a8fe9-7282-49f2-8061-83cd0b6d4db3
// Source: docs/worker-design-export/my-mmd-tokens.css
// Commit: b91ad04dbeb0da9767be5e4a37d09c19751145f1
// Refresh deliberately after reviewing the source design; never import preview data.
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
`;

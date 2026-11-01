// Presentation-only adaptation of the verified LV15 source. Keep Worker V4 logic unchanged.
export const MY_MMD_LIFF_LV15_CSS = `/*
 * MY MMD LV15 / Worker presentation bridge.
 * Design authority: MMD-Prive/my-mmd-member-profile,
 * src/styles/level15-shell.css, src/components/mmd/{level15-page,app-shell}.
 * Only presentation, only after Worker-resolved brand. No account/session logic.
 * V4 contract and V6 graphics remain intact for verified data and rollback.
 */
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode)[data-brand-audience="public"] {
  --l15-bg:#f6f1e8; --l15-surface:#fffdf8; --l15-raised:#fbf6ee;
  --l15-ink:#252722; --l15-muted:#5f5a57; --l15-line:#d6cfc4;
  --l15-accent:#a91d35; --l15-on-accent:#fffdf8;
  --digital-bg:var(--l15-bg); --digital-surface:var(--l15-surface);
  --digital-raised:var(--l15-raised); --digital-line:var(--l15-line);
  --digital-gold:var(--l15-accent); --digital-cream:var(--l15-ink);
  --digital-muted:var(--l15-muted); --digital-radius:14px;
  --v4-bg:var(--l15-bg); --v4-panel:var(--l15-surface); --v4-raised:var(--l15-raised);
  --v4-ink:var(--l15-ink); --v4-muted:var(--l15-muted);
  --v4-gold:var(--l15-accent); --v4-line:var(--l15-line);
  color-scheme:light; background:var(--l15-bg); color:var(--l15-ink);
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode)[data-brand-audience="private"] {
  --l15-bg:#0b0a08; --l15-surface:#15140f; --l15-raised:#201e18;
  --l15-ink:#f3ead8; --l15-muted:#b9ae98; --l15-line:#3b3629;
  --l15-accent:#dcc48e; --l15-on-accent:#11100c;
  --digital-bg:var(--l15-bg); --digital-surface:var(--l15-surface);
  --digital-raised:var(--l15-raised); --digital-line:var(--l15-line);
  --digital-gold:var(--l15-accent); --digital-cream:var(--l15-ink);
  --digital-muted:var(--l15-muted); --digital-radius:14px;
  --v4-bg:var(--l15-bg); --v4-panel:var(--l15-surface); --v4-raised:var(--l15-raised);
  --v4-ink:var(--l15-ink); --v4-muted:var(--l15-muted);
  --v4-gold:var(--l15-accent); --v4-line:var(--l15-line);
  color-scheme:dark; background:var(--l15-bg); color:var(--l15-ink);
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) {
  font-family:"LINE Seed Sans TH","Noto Sans Thai",system-ui,sans-serif;
  -webkit-font-smoothing:antialiased;
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) main {
  min-height:100svh; background:var(--l15-bg); color:var(--l15-ink);
  padding-bottom:calc(92px + env(safe-area-inset-bottom,0px));
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) #profile {
  width:min(100%,520px); margin-inline:auto; color:var(--l15-ink);
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) :is(.digital-home,.digital-view,.digital-care,.digital-requests) {
  min-width:0; color:var(--l15-ink);
}
/* LV15 house identity: compact, brand-resolved, no synthetic logo replacement. */
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) .digital-top {
  min-height:76px; padding:12px 0; margin:0 0 10px;
  display:flex; flex-direction:row; justify-content:space-between; align-items:center;
  gap:12px; border-bottom:1px solid var(--l15-line);
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode)[data-brand-audience="public"] .digital-top {
  background:transparent;
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode)[data-brand-audience="private"] .digital-top {
  min-height:100px; padding:13px 15px;
  margin-inline:-15px; border-bottom-color:var(--l15-line);
  background-position:center 38%;
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode)[data-brand-audience="private"] .digital-top>div:last-child {
  order:0; align-self:center; display:flex; align-items:center; gap:7px;
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) .customer-brand-v6 {
  width:auto; max-width:155px; margin:0; min-width:0;
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode)[data-brand-audience="private"] .customer-brand-v6 [data-brand-panel="private"] {
  flex-direction:row; align-items:center; text-align:left; gap:8px;
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode)[data-brand-audience="private"] .customer-brand-v6 [data-brand-panel="private"] img {
  width:49px; height:65px; object-fit:contain;
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode)[data-brand-audience="private"] .customer-brand-v6 [data-brand-panel="private"] p {
  font-size:12px; line-height:1.4; letter-spacing:.08em; margin:0;
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) .digital-signout {
  min-width:44px; min-height:44px; padding:8px 10px; font-size:12px;
  color:var(--l15-muted); border-color:var(--l15-line);
  background:var(--l15-surface);
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) .digital-session {
  min-height:30px; padding:5px 8px; color:var(--l15-accent);
  background:var(--l15-surface); border-color:var(--l15-line);
  font-size:10px;
}
/* Editorial masthead, keeping the original visible name and resolved fields. */
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) .digital-hello {
  margin:16px 0 18px; padding:0 0 16px; border-bottom:1px solid var(--l15-line);
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) .digital-public-wordmark {
  font-family:Georgia,"Times New Roman",serif; font-size:clamp(32px,10vw,56px);
  letter-spacing:-.055em; line-height:1.1; color:var(--l15-ink);
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) .digital-public-slogan {
  font-family:Georgia,serif; font-style:italic; color:var(--l15-muted);
  font-size:14px; line-height:1.5; margin:5px 0 12px;
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) .digital-hello h1 {
  color:var(--l15-ink); font-size:clamp(24px,6vw,31px); line-height:1.35; letter-spacing:-.03em;
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) :is(.digital-sub,.digital-snapshot p,.digital-kenji p,.digital-news-card p,.renewal-note,.empty,.sub) {
  color:var(--l15-muted); font-size:14px; line-height:1.65;
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) :is(.digital-eyebrow,.digital-sectionline h2 small,.digital-snapshot-label,.digital-points-note,.label) {
  color:var(--l15-muted); font-size:12px; line-height:1.5;
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) :is(.digital-sectionline h2,.digital-view h2,.digital-news-summary strong) {
  color:var(--l15-ink); font-size:21px; line-height:1.4;
}
/* One clear confirmed member summary; keep ledger and expiration truth as-is. */
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) .digital-snapshot {
  border:1px solid var(--l15-line); border-radius:14px;
  padding:16px; gap:12px; background:var(--l15-surface);
  box-shadow:0 8px 28px -28px #0008;
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) .digital-snapshot strong {
  color:var(--l15-ink); font-size:16px; line-height:1.4;
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) .digital-points {
  color:var(--l15-accent)!important; font-size:22px!important; font-variant-numeric:tabular-nums;
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) .digital-kenji {
  border:1px solid var(--l15-line); border-radius:14px;
  background:var(--l15-raised); padding:14px; margin:12px 0;
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) .digital-kenji strong {
  font-size:16px; color:var(--l15-ink);
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) .digital-kenji a {
  min-height:44px; display:inline-flex; align-items:center; border-radius:12px;
  color:var(--l15-accent); border:1px solid var(--l15-accent);
  background:var(--l15-surface); font-size:14px;
}
/* LV15 two-column card grid. All eight existing actions remain available. */
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) .digital-quick {
  margin:18px 0 22px;
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) .digital-quick-grid {
  display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin-top:10px;
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) .digital-quick-grid button {
  min-width:0; min-height:94px; padding:14px; border:1px solid var(--l15-line);
  border-radius:14px; background:var(--l15-surface); color:var(--l15-ink);
  font-size:16px; font-weight:600; line-height:1.45; text-align:left;
  transition:border-color .16s ease, background .16s ease;
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) .digital-quick-grid button i {
  font-size:23px; color:var(--l15-accent); margin-bottom:8px;
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) .digital-quick-grid button:first-child {
  background:var(--l15-accent); border-color:var(--l15-accent); color:var(--l15-on-accent);
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) .digital-quick-grid button:first-child i {color:inherit}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) .digital-quick-grid button:nth-child(n+5) {
  min-height:62px; padding:12px; font-size:14px;
}
/* Keep native MMD NOW disclosure, verified mission and wallet untouched. */
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) :is(.digital-news-disclosure,.digital-mission,.digital-design-slot,.digital-news-card) {
  color:var(--l15-ink); background:var(--l15-surface);
  border:1px solid var(--l15-line); border-radius:14px;
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) .digital-news-summary {min-height:56px; color:var(--l15-ink)}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) .digital-news-card h3 {color:var(--l15-ink);font-size:16px;line-height:1.5}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) :is(.digital-news-card .meta,.digital-feed-cta,.digital-unread,.digital-mission-eta) {color:var(--l15-accent);font-size:12px}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) .digital-mission-toggle {
  min-height:48px; border:1px solid var(--l15-accent); border-radius:12px;
  background:var(--l15-surface); color:var(--l15-accent); font-size:14px;
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) .renewal-card {
  background:var(--l15-surface); border-color:var(--l15-accent); border-radius:14px;
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) :is(.renewal-action,.digital-care #care-button,.digital-care #wish-submit,.digital-requests .form-stack button) {
  min-height:48px; border-radius:12px; background:var(--l15-accent);
  color:var(--l15-on-accent); font-size:15px;
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) .digital-needs {
  background:var(--l15-accent); color:var(--l15-on-accent); border-radius:12px;
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) .digital-needs span {color:var(--l15-on-accent)}
/* Four true navigation controls, 64px touch targets and iPhone safe area. */
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) .digital-dock {
  grid-template-columns:repeat(4,minmax(0,1fr)); gap:3px;
  min-height:72px; padding:7px max(8px,env(safe-area-inset-right,0px))
    calc(7px + env(safe-area-inset-bottom,0px))
    max(8px,env(safe-area-inset-left,0px));
  border-top:1px solid var(--l15-line); border-radius:20px 20px 0 0;
  background:var(--l15-surface); box-shadow:0 -8px 24px #0002;
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) .digital-dock :is(button,a) {
  min-width:0; min-height:64px; padding:8px 3px; border-radius:12px;
  color:var(--l15-ink); font-size:12px; font-weight:600; line-height:1.35;
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) .digital-dock button[aria-current="page"] {
  color:var(--l15-on-accent); background:var(--l15-accent); border-radius:12px;
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) .digital-view :is(input,textarea,select) {
  min-height:44px; max-width:100%; background:var(--l15-surface);
  color:var(--l15-ink); border-color:var(--l15-line); font-size:16px;
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) :is(.digital-view,.digital-care,.digital-requests) :is(p,li,.history,.stack) {
  overflow-wrap:anywhere;
}
body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) :focus-visible {
  outline:2px solid var(--l15-accent); outline-offset:3px;
}
@media(max-width:360px) {
  body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) .digital-quick-grid {gap:9px}
  body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) .digital-quick-grid button {padding:12px;min-height:84px;font-size:15px}
  body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) .digital-snapshot {grid-template-columns:minmax(0,1fr)}
}
@media(min-width:700px) {
  body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) .digital-dock {
    padding-left:max(12px,calc((100% - 520px)/2));
    padding-right:max(12px,calc((100% - 520px)/2));
  }
}
@media(prefers-reduced-motion:reduce) {
  body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) *,
  body[data-mmd-liff-level="15"].app-entered:not(.signup-mode):is([data-brand-audience="public"],[data-brand-audience="private"]) *::before {
    scroll-behavior:auto!important; transition:none!important; animation:none!important;
  }
}`;

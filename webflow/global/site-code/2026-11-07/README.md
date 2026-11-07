# Webflow Global Head / Footer — source extraction & migration plan

**Read on 2026-11-07 (Asia/Bangkok), SĪGIL System — MMD.** This is a source-only PR. NO WEBFLOW WRITES, NO PUBLISH, NO PRODUCTION CLAIM.

## Inventory

- Global Head: 49214 characters, 17 inline JS/CSS blocks.
- Global Footer: 49340 characters, 4 inline JS/CSS blocks and 19 hosted script tags, of which 15 load mmd-i18n on every page.
- Exact rollback snapshots: `snapshots/webflow-site-head.html` and `snapshots/webflow-site-footer.html`.
- All inline JS/CSS moved into `sources/head/` and `sources/footer/` without changing their source. Source order, IDs and external URLs are in `manifest.json`.
- These extracted files must NOT be loaded indiscriminately. They require route bundling, DOM-ready testing, pinned SHA/SRI, and a Webflow binding swap.
- Reference: [PR #3109](https://github.com/MMD-Prive/mmd-workers/pull/3109) is merged. GitHub merge and Webflow publish are separate states.

## Candidate scopes (not yet deployed)

- `rules`: 1 blocks
- `studio`: 3 blocks
- `legacy-global-review`: 4 blocks
- `mms`: 2 blocks
- `review`: 1 blocks
- `partner`: 3 blocks
- `public`: 2 blocks
- `internal`: 5 blocks

## Decisions and known risks

1. Global Head currently carries Rules lane and Studio operational/visual code, public logos and header, Partner CSS/JS, an MMS header override, and SĪGIL internal workspace/admin styling. Route-specific code should move to page/world bundles.
2. The original global typography CSS overrides typography across `html,body,button,input,select,textarea`; this violates the scoped-only pattern of `mmd-i18n/MMD-CSS-LOCK-SPEC-v2.md`. Do not remove until every world has an approved scoped equivalent.
3. Global Footer currently loads Black Card, Profiles, MMS, MMD Shop and CARE BACK translations on all pages. Keep canonical engine/dict shared, move page dictionaries to route-scoped loading. Do not duplicate language dictionaries in this repository.
4. Global Footer also carries MMS therapist copy, internal admin JS/CSS, Kenji matrix guards, PostHog files and a large Partner Thai rewrite. Verify server authorization, analytics event duplication and dependency order before any removal.
5. i18n policy conflict must be resolved: `mmd-i18n/README.md` and the Restore Contract say TH-only, whereas deployed `i18n.core.v21.js` enables TH/EN/ZH. No rollout-policy change is included here.
6. The PR #3109 hosted script registrations have versions and SHA/SRI, but their live per-page bindings and removal of the original inline blocks must still be inspected.

## Global code contract

- **Git always:** MMD display and action code in `mmd-workers`, canonical localization data/engine in `mmd-i18n`.
- Site Head: favicon/touch icon, approved font preconnects, minimal global tokens/bootstrap only; no page business logic or universal selectors.
- Site Footer: one canonical bootstrap when applicable, shared analytics with correct internal exclusions, no page-specific dictionaries.
- Page Head: world tokens → scoped component CSS → page CSS. Link pinned Git SHA and SRI. Do not load CSS across worlds.
- Page Footer: only route-scoped JS and localized copy, run once, preserve DOM-ready/load order and i18n Thai fallback.
- Existing `<div class="mmd-system">…</div>` CSS lock remains intact; do not rename hard-locked tokens or classes.
- Never weaken LIFF identity, payment authorization/verification, signed links, Model confirmation or Kenji scoped reply controls.

## Rollout gates

- [x] Snapshot the exact live site-global Head and Footer.
- [x] Extract each inline code block and map each hosted reference; no live changes.
- [ ] Confirm affected routes against the Webflow inventory (331 pages; the first API page covered 100).
- [ ] Implement exact route-scoped loader in GitHub, with SRI and test coverage.
- [ ] Reconcile TH-only vs TH/EN/ZH runtime policy with owner.
- [ ] Validate PR #3109 bindings, then remove duplicate page inline code where hosted scripts are confirmed working.
- [ ] Staging regression: Public, Member/LIFF, SĪGIL, MY MODEL, MMS, Partner, Internal/Admin, Studio, Campaign.
- [ ] Replace the Webflow Global blocks, smoke test, publish and verify. Restore exact snapshots if regression occurs.

This is a staged extraction: **global code remains unchanged on Webflow**.

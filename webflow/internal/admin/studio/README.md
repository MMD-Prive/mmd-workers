# MMD Studio — Webflow Closeout Contract

Canonical Studio flow:

1. Upload → `/internal/admin/studio/upload`
2. Review → `/internal/admin/studio/review`
3. Final Preview → `/internal/admin/studio/model-preview`

Studio has no Publish step. Boss/backend review and production publication happen after Studio.

## Closeout lock — 2026-09-08

- `/internal/admin/studio` is a three-step launchpad only.
- The legacy site-wide `Send to Preview` injection is retired. Review reaches Final Preview only through the canonical decision-driven handoff.
- The Review top navigation must not provide an independent Preview bypass.
- Studio controls use the SF-first stack after global internal-admin CSS:
  `-apple-system`, `BlinkMacSystemFont`, `SF Pro Text`, `SF Pro Display`, `Helvetica Neue`, `Noto Sans Thai`, `Noto Sans`, `Arial`, `sans-serif`.
- GWs/EMs Title Bar remains editable in Upload and Review only. Final Preview consumes it as display/read-only state.
- Missing GWs/EMs Title Bar remains fail-closed in Review and Final Preview.
- Preserve `?t=...` across internal Studio navigation where present.

## Upload visual lock — 2026-09-08

`/internal/admin/studio/upload` must visually continue the Studio launchpad rather than render as a generic/raw Webflow form.

- Scope all Upload theme overrides under `#mmdStudioUploadR5`.
- Keep the Studio surface near-black / warm ivory with restrained bronze-gold Upload accents.
- Primary copy must remain high-contrast (`#f2e8d9` / `#cfc4b3` family); do not use the old dark-blue heading color on the black Studio surface.
- Use the same SF-first Studio typography stack.
- `Send to Review` is the primary Upload CTA. `Build Draft` and `Back to Studio` remain secondary actions.
- Source intake, draft setup, source upload, and draft preview should read as compact operator panels, not public-facing hero blocks.
- Remove parser placeholders from rendered Webflow markup, including `##INLINE11##`, `##INLINE12##`, `##INLINE13##`, and `##INLINE22##`.
- When no preview source exists, use a controlled empty state such as `ยังไม่มีภาพต้นทาง` / `เลือก Source แล้วกด Build Draft` rather than exposing parser tokens.
- Upload remains presentation/local-draft only and must not gain production publication authority.

## Authority boundary

Webflow Studio prepares presentation state only. It must not publish production profiles, issue authentication, hold bearer tokens or confirmation keys, mutate payment or entitlement truth, or grant protected access.

GitHub remains source truth; Workers remain runtime authority; Webflow remains presentation/compatibility.

## Files

- `studio-launchpad.html` — source mirror of the canonical three-step Webflow launchpad.
- `studio-final-lock.js` — scoped runtime final lock for typography, query continuity, and Review bypass removal.
- `studio-upload-theme-lock.css` — scoped Upload theme/token lock matching the Studio launchpad visual system.

## Model Card Master Frame V2

- `studio-compcard-template-selector.js` is the source mirror for the local-draft template selector and read-only Final Preview renderer.
- Existing template IDs remain stable for compatibility: `straight`, `gay`, `foreigner`, `gws`, `ems`, `travel`, and `extreme`.
- The visible graphic is now one metallic silver / graphite-gunmetal frame family with a small category accent cue. The old split-panel / diagonal-seam treatment is retired.
- No role, tier, Public/Private label, Straight/Gay label, Travel/Extreme word, or `SĪGIL SYSTEM` copy belongs on the final card.
- Standard, Premium, Foreign, Travel and Extreme use the canonical `working_name` as the visible Model ID/name exactly as stored, including any suffix/letter that is part of that ID; they also show large height/weight. Template/category labels never replace the Model ID/name.
- GWs and EMs retain their assigned RUN identity plus large height/weight; their accent cue may be slightly stronger.
- Travel is a public MMD PRIVÉ card identified only by the small cyan/blue edge cue. Extreme uses the same public frame with a small red edge cue.
- The approved logo is small at the lower right: MMD PRIVÉ for public cards, SIGIL for private/exclusive cards.
- This pack preserves the Upload → Review → Final Preview flow and does not add production publication authority.

## Automatic profile-card inbox — 2026-09-27

The automatic 1322 × 1200 drafts are a separate inbox beside the existing
manual/My Card intake. They use the same owner-approved Master Frame V2 contract
in `docs/model/MMD_APP_AUTOMATIC_CARD_DRAFTS.md`; the automatic renderer and the
manual preview remain separate implementations but must show the same graphic rules.

- HTML: `auto-card-inbox.html`, root `#mmd-auto-card-inbox`.
- CSS: `auto-card-inbox.css`, fully scoped with final contrast protection.
- JavaScript: `auto-card-inbox.js`, guarded initialization, same-origin cookie
  auth, fixed endpoint validation, 20-second timeouts, serialized actions,
  defensive JSON/PNG parsing and private object-URL cleanup.
- Tests: `auto-card-inbox.test.mjs`, runs the actual HTML/JS in a DOM harness.

Webflow draft connection was read back and matched on 2026-09-27:
site `68f879d546d2f4e2ab186e90`, Upload page `6a1be738a8018a51046e5335`.
New HtmlEmbed `41eef2d7-b8dc-70c2-eb57-632c620d3b4e` sits directly before
`muUploadForm` within the existing page. CSS is appended to page head as
`mmd-auto-card-inbox-css-v1`; minified JS is appended last in page footer as
`mmd-auto-card-inbox-js-v1`. Existing page code was preserved byte for byte.
The saved footer is 49,881 characters, below Webflow's accepted limit; do not
append more code without checking the limit or moving to a hosted asset.

The new module does not navigate or rewrite the Studio URL. Login retry retains
the original path/query, including `t`. Worker cookies and existing server
authorization remain authoritative. Every API request is authenticated; a
401/403 clears displayed drafts, a 404 reports an unavailable backend, and
`enabled: false` reports paused generation while allowing existing previews.
No browser secrets, photo persistence or public image URLs are introduced.

No production publish, merge, paid generation or feature activation has been
performed. API key, approved logo objects and Browser Run readiness remain
activation prerequisites. Read-back and 7 DOM + 83 backend tests passed;
a live authenticated end-to-end run and visual browser check remain unverified.

Rollback the draft integration by removing this new embed and the two exact
marked style/script blocks only. Preserve all existing Upload controllers.

UI test command after installing `linkedom@0.18.12` to a temporary directory:

```sh
MMD_CARD_DOM_MODULE=/tmp/mmd-card-ui/node_modules/linkedom/esm/index.js \
  node --test webflow/internal/admin/studio/auto-card-inbox.test.mjs
```

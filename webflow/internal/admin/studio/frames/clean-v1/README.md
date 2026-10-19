# Studio clean frame replacement — not released

The owner requested five general visual color frames, in this order:
**matte gray, green, cyan, red, orange**. These are presentation choices, not
ST/GY/FR/EN/EX category assignments. The corrected EMs/GWs frames remain
separate, with their original labels and empty Run Number boxes.

The five revised general PNGs are pending. `release_ready: false` prevents
release packaging of the superseded general artwork. The QA fixtures may use
those old files only while explicitly displaying a superseded-artwork notice.
Nothing is installed in live Studio.

## State and authority

`studio-compcard-template-selector.js` now draws the supplied assets through
`studio-clean-frame-renderer.js`. The picker displays actual asset thumbnails
and color labels. A general visual selection updates only
`visual_variant_number`, `visual_frame_number`, `visual_frame_version` in the
existing local draft stores. It does not set or default category, Field,
Family, `template_id`, canonical model data, media selection or approval state.
Blank Family remains blank. Choosing a color does not unlock backend Review.

All existing category template IDs remain stable:
`sigil-straight-bronze`, `sigil-gay-plum`, `sigil-foreigner-emerald`,
`mmd-prive-travel`, `mmd-prive-extreme`, `sigil-ems-aureate`,
`sigil-gws-nightwave`. The existing Family dropdown remains a separate control.
EMs/GWs use labeled artwork 6/7 according to the already-selected Family;
incompatible general frames are disabled for those exclusive identities.
All other categories, including Travel/Extreme and unconfirmed Family, may
choose any of the five general colors without being reclassified.

Final Preview consumes the stored visual selection without writing to state,
adding navigation, bypassing Review or adding publication controls. No source
photo bytes or URLs are persisted by this selector. A photo style observer
keeps the preview in sync with the existing controller's source selection.

The original PNGs are opaque. Artwork sits behind a contained photo inset at
left 7%, top 12%, width 64%, height 76%, using the native 1316 × 1195 aspect
ratio. No face edits, filters, additional logos or divider lines are added.
Only zero-padded digits are drawn inside the original EMs/GWs number boxes;
missing numbers stay blank. Model names and large measurements use the right
reserved area. Frame geometry and source photo proportions are preserved.

## Provenance and validation

`manifest.json` keeps Library IDs, original filenames, dimensions, SHA-256
hashes and content-addressed filenames. General assets 1–5 will be replaced
with the exact revised Library PNGs before `release_ready` can become true.
Old artwork is never recolored programmatically or treated as the new palette.

```sh
npm ci --ignore-scripts
node --test webflow/internal/admin/studio/studio-clean-frame-renderer.test.mjs webflow/internal/admin/studio/studio-clean-frame-integration.test.mjs admin-worker/studio-webflow-source.test.mjs
node scripts/studio-clean-frame-preview.mjs
```

Local QA: `http://127.0.0.1:4179`, `/upload`, `/model-preview`.
These fixtures use a synthetic model/source and do not execute the backend
Review decision gate. Tests run the built/minified runtime and cover every
general color with ST/GY/FR/EN/EX and blank Family, preservation of category
IDs and unrelated state, reload, read-only Final Preview, exclusive Run Number
updates, wrong-frame protection, photo refresh, original hashes and absence
of extra logos. Existing Studio API source contracts are also checked.

## Exact asset hosting and publication plan

The established asset publisher uses R2 bucket `mmd-models`, account
`b176eda1172b741fd2e58904cc9d77c5`, exposed at
`https://models.mmdbkk.com/`. Repository precedent:
`.github/workflows/deploy-kenji-admin-assets.yml`. Its existing
`/webflow/internal/admin/kenji/kenji-admin-v1.js` returned HTTP 200 and
`application/javascript` on 2026-10-19. This verifies the host, not upload of
these new Studio assets. No credentials or external resource permissions
have been changed.

Reserved object prefix: `webflow/internal/admin/studio/frames/clean-v1/`.
After the revised palette has been imported and reviewed:

1. Verify all seven source hashes and final colors; set manifest
   `release_ready: true`. Build the exact release using
   `node scripts/build-studio-clean-frame-release.mjs /tmp/studio-clean-frame-release`.
   This produces seven content-addressed PNGs, a content-addressed minified
   registry/renderer/selector bundle, `release.json` and the small
   `webflow-loader.html`. The builder refuses a pending/superseded registry.
2. Obtain required merge/release authorization for the reviewed exact commit.
   Upload only these static files to the reserved prefix using the existing
   dedicated R2 publisher credential, `image/png` or `application/javascript`,
   with immutable caching. Read back and compare every digest. Verify public
   GET responses and PNG dimensions before touching a Webflow loader.
3. Read current Webflow site/page code. Verify documented site
   `68f879d546d2f4e2ab186e90`, Upload page `6a1be738a8018a51046e5335`, and the
   current Final Preview page before any mutation. Replace only the old
   selector script block with the generated hosted loader on both surfaces;
   preserve all other controllers, legacy source intake and Review gates.
   Do not load both old and new selectors. The documented footer was already
   49,881 characters; use the loader rather than embedded JS/base64 PNGs.
4. Read the saved draft code back. Inspect actual publish scope and unrelated
   pending Webflow drafts, obtain publication approval, then publish only the
   reviewed presentation change. No Worker deployment or route change is
   needed for this manual rendering path.
5. Verify authenticated live Upload → Review → Final Preview using safe draft
   fixtures: all five color choices, category unchanged, exact source photo,
   persistence, name/metric placement, corrected EMs/GWs blank/filled number
   boxes, no duplicate logos or labels, and no new publish/send controls.
   Claim installation only after these live checks pass.

Rollback restores the previously saved exact selector blocks/loaders only.
Content-addressed assets can remain unused; no deletion or canonical data
rollback is required. Do not repair the unrelated file chooser as part of this
release. No Telegram sends, paid generation or model publication are included.

## Separate automatic pipeline

`admin-worker/src/model-card-design.js` is a separate 1322 × 1200 automatic
renderer. It currently draws the previous CSS frame and approved runtime
logo and will not inherit these manual PNGs. It needs separate reviewed
reconciliation to show the same clean artwork, including an explicit
1316 × 1195 → 1322 × 1200 sizing decision. This change does not alter it or
activate automatic generation. `MODEL_CARD_AUTO_ENABLED` and release gates
remain unchanged.

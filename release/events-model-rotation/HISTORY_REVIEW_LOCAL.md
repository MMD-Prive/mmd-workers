# Safe-hold release preparation update

The owner-authorized scope now permits releasing the safety hold while verified history ingestion and owner-alert delivery remain unavailable. Automatic model posts may all pause. No alert delivery or restored automation is claimed. The protected production manifest combines the original PR3138 overlay with the exact same tested history candidate (85a851f8de481f70875076f356beefba140e896e592ea756915c00564f00b9a5). The workflow and all actual review gates remain unchanged. The local companion manifest is not an approval receipt.

For reproduction, place a read-only downloaded live module in `live-baseline.mjs`; the builder requires its pinned hash. Full live code and generated bundles are intentionally not committed. The builder now reads frozen `pr3138-overlay-manifest.json` and writes the combined `overlay-manifest.json`; candidate tests run from temporary files to keep the Git checkout clean.

The earlier local-only status below is superseded only for explicitly authorized safe-hold release; ingestion/alert requirements still apply before claiming the full feature or restored publication.

# Local history-review overlay, not a production release

This draft overlays the exact active module (SHA-256 d517c7ef259f17f66d1cb991a8cfd69748f08228540ea057b08adc3662cec8ee). It first reproduces the merged PR3138 candidate e89dba7fa99721f9bd74f4ac22ae768e42695383bd59147a9f1edd1593a55e16, then inserts the new history module in a private closure within the daily section and four precise runner/readiness replacements. All other bytes are preserved; reversal is checked. No broad main build, promotion changes, registry modifications or customer test messages occur.

The original production manifest, transport and workflow remain unchanged. The new history-review-local-manifest.json deliberately has production_execution_permitted=false. It is not accepted as a deployment approval or a deployable manifest. Generated history-review-testable.mjs and history-review-compiled.test.mjs are offline test-only files, never production payloads.

## Reproduce locally

From the audit workspace:
- node scripts/build-events-history-review-local.mjs
- node --check release/events-model-rotation/history-review-local-candidate.mjs
- node scripts/test-events-history-review-local.mjs
- node --test scripts/events-model-rotation-release.test.mjs scripts/events-rotation-release-transport.test.mjs

The builder rejects any unreviewed source runner delta, changed live baseline, ambiguous anchors, unexpected module imports, and nonreversible unrelated-byte changes. It records source hashes so later source edits require rebuilding and retesting.

## Important operational limits

Three calendar months in Asia/Bangkok is a publication-history review window, not a replacement of the seven-day selection preference with a universal 90-day cooldown. Recent evidence or incomplete coverage causes a hold. Tinn exclusion and different-person room selection remain from PR3138. Historical terminal receipts are not rewritten. Multi-room model plans are conservatively held as a whole rather than partially sent.

No verified all-room history ingestion pipeline or owner-alert transport has been implemented here. With no valid fresh history proof, model posts hold. Warning records explicitly say undelivered. An outbox write must never be described as a delivered owner notification. Do not deploy while presenting those capabilities as complete.

## Required before production

1. Complete and review verified room-history ingestion, identity coverage and owner-alert delivery.
2. Review new source plus exact candidate, all scope changes and end-to-end no-send tests. Resolve blanket holds/operational impact deliberately.
3. Publish/merge only with appropriate authorization; adapt the protected exact-live workflow to a separately reviewed new manifest and enforce its hashes. Do not repoint the existing workflow to an unreviewed local artifact.
4. Recheck live version, latest version, deployment, source bytes, all bindings/settings/routes/cron; preserve HYPE_PROMOTION_ENABLED=false.
5. Authenticate GitHub dispatch and pass a truthful request reference plus exact reviewed main SHA; Per must complete the real mmd-production-mutation environment review. Do not spoof or bypass it.
6. Verify the resulting active candidate hash and 100% version, inherited flags/configuration, and no customer test sends. Reconcile uncertain outcomes read-only, without retry.

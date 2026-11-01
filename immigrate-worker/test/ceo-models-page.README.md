# CEO Models presentation repair

The authenticated ingress replaces the single `model-supply-v3` inline runtime captured from the published Webflow page on 2026-10-24. It retains review decisions, media viewer, and markup. The replacement is limited to GET HTML at `/internal/ceo/models`; upstream authentication remains in place. If the marker changes or is duplicated, replacement is skipped.

Validation: `node --test immigrate-worker/test/ceo-models-page.test.mjs` from the repo root, plus bundle the ingress with esbuild.

Deployment target: immigrate-worker. Following authorized deployment, verify menu contrast, white/orange cards, mobile layout, Kenji in document flow, lookup, refresh, and partial-load errors. Do not approve/reject real reviews during visual QA.

The list endpoint returns at most 100 records without pagination metadata. Counters describe the loaded subset, not total inventory. Missing readiness fields stay unknown. A review queue backend failure stays visible; this patch does not invent review data or repair that separate backend dependency.

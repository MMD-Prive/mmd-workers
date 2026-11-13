# Model asset review backlog (offline, not a posting queue)

## What this draft implements

Reconcile verified, locally exported metadata for **all canonical Models**, not
only folders with recent timestamps. Identify three separate review needs:

1. Newly observed files or changed content in a Model folder.
2. Existing compcards for which only a reviewed old template is present.
3. Existing Models with no compcard found in a fully checked source scope.

This is a local review planner. It does not collect a live Drive inventory,
render/update a card, enable automation, generate promotional media, upload to
READY/R2, change Airtable, select a destination or publish anything. It has no
credentials, network calls, runtime imports or approval action. Every result
retains `live_eligible: false`, `generation_permitted: false` and
`publication_permitted: false`, including rows marked reviewed.

## Existing work and boundaries

- Reuse `docs/model-source-sync-contract.md`: exact canonical Model IDs, scoped
  source bindings, retained revisions and separate media/publication review.
- Reuse `docs/architecture/COMPCARD_LIBRARY_V1.md`: original cards and explicit
  owner-reviewed canonical links are evidence. A matching name is never a link.
- The approved-intake builder `scripts/hype-prepare-intake.mjs` prepares finished
  images only. This planner is deliberately not compatible with its registry.
- Rotation/history holds and exclusions in #3138, #3161, #3163, #3172 and #3174
  are not changed. Card presence never proves room-history clearance, current
  availability, work category or consent. Do not use this output to bypass them.
- New Drive change notification/recovery ingestion remains a separate integration
  described by the source-sync contract. No webhook, cron or flags are enabled.

## Obtain evidence before running

An authorized read-only collector/operator must exhaust source pagination and
record the scope and coverage. An empty page with a continuation cursor is not
complete. The planner validates the input contract; it **cannot independently
verify** that these reads occurred or that the declared scope is comprehensive.

1. Enumerate the canonical Models within an explicit scope, including old Models
   without cards. Keep inactive/unresolved eligibility separate from this asset
   audit; the planner never declares a Model eligible. Set `models_complete`
   false if the Model enumeration was partial.
2. Resolve exact source folder ID + root + scope key bindings from canonical
   evidence, not names or images. Retain unresolved/duplicate mappings in the
   collector's exception list; do not silently omit them or claim full coverage.
   The planner rejects ambiguous bindings instead of choosing a person. A
   physical canonical folder cannot be assigned to multiple Models by changing
   its root or scope label; shared card folders use explicit Library links.
3. Reconcile every bound folder and the relevant card archives/Library/Studio
   completed assets. Include already completed cards, even if not in READY or
   not in the automatic posting registry. A single shared folder can contain
   cards with different explicit canonical Library links. A registry containing
   no cards is **not** evidence that no cards have been made.
4. For every file record its observed revision, modification time, and hash when
   actually available. Classify kind from reviewed evidence. Use `unknown` for
   unreviewed media. Record `template_id: null` unless the exact card's template
   has been reviewed; dimensions or filename are not template evidence.
5. Set each Model's `inventory_complete` true only after all relevant sources in
   the declared scope were successfully reconciled and their evidence retained.
   Failed, partially paged, unclassified or inaccessible sources stay incomplete.
   `no_compcard_in_verified_scope` means no card in that documented scope, not
   that the person has never had a card anywhere.

`evidence_ref` values are opaque references to private read/review receipts, not
URLs, tokens or copied profile data. Keep actual snapshots and plans private,
outside the repository. No real Model names, folder IDs or media are included in
this PR. Input fields are allowlisted; contacts, rates, raw profiles, image URLs
and approval claims are rejected.

## Snapshot contract

Synthetic example with an old Model and no card observed:

```json
{
  "schema": "hype_model_asset_snapshot_v1",
  "captured_at": "2026-11-13T00:00:00.000Z",
  "scope": {
    "id": "synthetic-scope",
    "evidence_ref": "scope-read-1",
    "root_ids": ["synthetic-root"]
  },
  "models_complete": true,
  "models": [{
    "model_id": "recSynthetic001",
    "folder_bindings": [{
      "root_id": "synthetic-root",
      "folder_id": "synthetic-folder",
      "scope_key": "portrait",
      "evidence_ref": "binding-read-1"
    }],
    "inventory_complete": true,
    "inventory_evidence_ref": "inventory-read-1"
  }],
  "assets": []
}
```

Each asset requires exactly: `asset_id`, `model_id`, `folder_id`, `root_id`,
`scope_key`, `revision`, `content_sha256` (64 lowercase hex characters or null),
`modified_at`, `kind` (`photo`, `compcard`, `other`, `unknown`), `template_id`
(opaque reviewed template ID or null), `identity_source`, and `evidence_ref`.
Times are exact UTC ISO strings with milliseconds. Use namespaced stable asset
IDs when combining providers. IDs are opaque, not display names.

`identity_source` is `canonical_folder_binding` for the exact canonical folder
binding, or `reviewed_library_link` for a compcard explicitly linked to its
canonical Model by the existing Library review. The latter permits shared card
folders under approved roots; it is an input attestation, not a link this tool
creates or verifies. Never invent a Library link to make validation pass.

## Run and track review

```sh
node scripts/hype-model-asset-review.mjs \
  --current /private/current-snapshot.json \
  --previous /private/review-baseline.json \
  --target-template REVIEWED_TEMPLATE_ID \
  --decisions /private/review-decisions.json \
  --out /private/review-plan.json
```

`--previous` and `--decisions` are optional. First run labels baseline review;
it never calls every old photo a new upload. New file IDs are only “newly
observed,” not proof of a new person or recently created bytes. Identical hashes
with changed metadata do not become changed photographs. If both hashes are not
available, revision/hash-evidence drift is `asset_change_unverified`.

The previous snapshot is the **fixed review baseline**, not an automatically
advanced last-scan cursor. Keep it until outstanding differences have been
reviewed; otherwise a rolling snapshot could remove unresolved changes from the
next diff. This PR provides neither a durable queue nor a background collector.
Snapshot replacement/retention and any automation need a separately reviewed
integration. Keep previous plans as audit history. Removed files/models remain
visible as absences with completeness information, never as automatic deletions.
Changed Model folder bindings invalidate absence comparisons even when the new
inventory is declared complete; re-establish a reviewed baseline before making
missing-card conclusions for that source scope.

The review key binds exact canonical ID, source scope/evidence, template target,
inventory evidence, bindings, reasons and asset fingerprints. Decisions are a
local array of `{ "review_key": "64-hex-key", "state": "reviewed" | "deferred",
"reviewed_at": "UTC-ISO-time", "evidence_ref": "private-review-receipt" }`.
Only exact matching keys carry forward; changed evidence reopens review. A
review decision tracks triage only. It does not certify consent, visual safety,
facts, work category, room history, publication approval or a finished card.

Choose the target template only after checking the actual accepted reference.
This PR intentionally does not guess which pattern is current. Review current
cards before commissioning replacements so existing completed work is reused.

Inputs are bounded to 10 MB and 20,000 models/assets per array. Output is created
with mode 0600 and exclusive-create, refusing existing files and symlinks rather
than overwriting evidence. Logs show aggregate counts only.

## Verification and remaining work

```sh
node --check scripts/hype-model-asset-review.mjs
node --test scripts/hype-model-asset-review.test.mjs
```

The dedicated read-only PR CI runs these offline fixtures without secrets,
dependency installation or deployment. Tests cover old Models without cards,
partial sources, unknown media/template evidence, existing current cards, shared
Library folders, content vs metadata changes, identity conflicts, removals,
repeat runs, private output and safe review carryover.

This draft is not the completed end-to-end Promote or card-remaking workflow.
Live collection, a persistent internal review UI/queue, actual visual QA and any
permitted card production require further implementation and evidence. No live
Model inventory was used to certify the synthetic test results. Separate review
and permission are required before any production integration, merge or release.

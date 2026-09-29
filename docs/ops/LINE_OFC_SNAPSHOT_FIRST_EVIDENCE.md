# LINE OFC snapshot-first evidence routing

Owner intent: when MMD needs historical truth, do not make the runtime guess from memory. Capture LINE OFC chat or note evidence into Airtable first, then let MY MMD, Create Job, Kenji, resolver, and release gates read from reviewed Airtable evidence.

## Source priority

1. LINE OFC snapshot/export evidence.
2. Owner-provided or owner-confirmed evidence from Per.
3. Customer historical notes when attached to the canonical customer context.
4. Model group/chat/album evidence for a specific day or narrow window.

Do not require a full historical crawl for lightweight history acceptance. One strong LINE OFC evidence item is enough; use at most two if a second item is needed to disambiguate.

## Airtable routing

| Evidence | Airtable destination | Purpose |
| --- | --- | --- |
| Verified LINE OFC customer export / chat note / current LINE rename | `MMD — LINE OFC Client Import Staging` (`tblOs8yyLK09SKrCt`) | Private first snapshot. Stores raw LINE notes, sensitive application context, behavior/care context, service-history candidates, source hash, and optional canonical client link. |
| Large LINE OFC archive chunk / compressed transcript batch | `LINE OFC Per-Rename Source Chunks` (`tblUXJvU47SzdVUwy`) | Raw/archive preservation and hash-backed identity evidence without forcing every chat into a materialized customer row. |
| Contact identity extracted from LINE archive | `LINE OA Historical Contact Evidence` (`tbl4wqlFG9Ovmtp4c`) | Identity matching evidence such as display names, emails, phones, Telegram candidates, and match status. |
| Approved customer service/payment history | `MMD — Customer History Reviews` (`tblnpDFQMpo8AmNQv`) | Human-reviewed historical service/payment rows that may be materialized into customer history and points. |
| MY MMD readback projection | `MMD — Client Lifecycle Reconciliation` (`tblNV1b5sMC2fQPxt`) | Batch projection read by MY MMD for current points, service count, spend, and recovery/review state. |
| Customer preference / care / behavior note | `MMD — Client Intelligence Evidence` (`tblx7NdfHO5iY6qtg`) | Customer memory evidence for Kenji/HYPE, never entitlement truth by itself. |
| Model LINE note or group job note | `LINE Model Notes Import` (`tblLdo5jBkVnNdJ0C`) or `Model History Imports` (`tbljrlOK5m4iBXgST`) | Model-side evidence, including group/chat/album windows, before profile/job facts are promoted. |

## Existing import route

Use the existing admin route for customer LINE OFC snapshots:

`POST /v1/admin/kenji/control/line-ofc/import`

This route writes to the private LINE OFC staging table first, then projects only safe identity evidence to reviewed staging and the pre-session index. It must not mutate membership, entitlement, Telegram state, payments, or points directly.

Minimum payload for a customer snapshot:

```json
{
  "import_id": "line-ofc-20260929-client-001",
  "line_user_id": "Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "current_line_rename": "Per Rename + date/name from LINE OFC",
  "raw_line_notes": "LINE OFC note/chat snapshot text",
  "service_history_candidate": [{ "date": "2026-09-29", "summary": "optional extracted service evidence" }],
  "source_hash": "sha256:<hash-of-source-snapshot>",
  "reason": "Snapshot LINE OFC evidence before resolver/history review"
}
```

If the record cannot be matched to exactly one canonical Client, it remains review-required/candidate-only. Runtime flows may search the identity candidate but must keep access/rights fail-closed until resolver truth exists.

## Batch helper

Use `scripts/line-official-legacy/line-ofc-snapshot-batch.mjs` to turn one or two LINE OFC evidence snippets into import payloads with stable `source_hash` values and replay-safe `import_id` defaults.

Build payloads without writing:

```sh
node scripts/line-official-legacy/line-ofc-snapshot-batch.mjs snapshots.json > payloads.json
```

Post to the existing import route after owner review:

```sh
LINE_OFC_IMPORT_URL="https://www.mmdbkk.com/v1/admin/kenji/control/line-ofc/import" \
LINE_OFC_IMPORT_TOKEN="<internal token>" \
node scripts/line-official-legacy/line-ofc-snapshot-batch.mjs snapshots.json --post
```

Input may be a single object or `{ "snapshots": [...] }`. Each snapshot requires `line_user_id` and at least one of `raw_line_notes`, `membership_application_sensitive`, `behaviour_care_context`, or `service_history_candidate`. `source_priority` must be one of `line_ofc`, `owner_confirmed`, `customer_note`, or `model_group_album`.

The helper enforces the lightweight rule: no more than two evidence items per `case_key`. Use one strong LINE OFC item whenever possible.

## Acceptance contract

- Snapshot first, resolve second.
- Raw LINE OFC notes stay in private Airtable staging.
- Public/search/card surfaces may only use approved public-safe projections.
- Historical MY MMD acceptance can close with one strong LINE OFC item plus lifecycle readback, without waiting for every old note to be reconciled.
- MMD APP Job handoff and campaign destination smoke still require real production events before always-on campaign enablement.

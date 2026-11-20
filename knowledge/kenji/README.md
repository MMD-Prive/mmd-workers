# Kenji Versioned Knowledge

This directory is the Git source of truth for Kenji AI knowledge content and safety policy.

## Operating model

- Git stores canonical knowledge, schema, routes, boundaries, and published cards.
- Pull requests are the review and approval gate.
- Workers may load only validated published cards.
- Internal admin pages may draft, preview, and propose changes, but must not become the final source of truth by themselves.
- The public runtime de-duplicates Airtable rows by `knowledge_id` and appends any missing reviewed canonical fallback cards. Airtable remains the live override when the same ID exists.

## Archived campaign knowledge

- `cards/promotion/care-back-2026-final-lock-th.json` — **Archived 2026-11-20**. The September-only coupon/Points guidance conflicts with the November canonical policy; it is historical reference only and **must not feed published Public Kenji answers**.
- The legacy runtime ID `kenji_20_011_care_back_2026` is also filtered from both public and internal published read paths, including Airtable "active" overrides. No Airtable customer/knowledge rows are changed.
- Current public promotions require the separate read-only approval/publication/revision evidence gate described at `docs/knowledge/KENJI_PUBLIC_PROMOTION_EVIDENCE_V1_20261120.md`.

## Validation

```bash
node knowledge/kenji/validate.mjs
```

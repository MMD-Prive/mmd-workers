# Kenji Versioned Knowledge

This directory is the Git source of truth for Kenji AI knowledge content and safety policy.

## Operating model

- Git stores canonical knowledge, schema, routes, boundaries, and published cards.
- Pull requests are the review and approval gate.
- Workers may load only validated published cards.
- Internal admin pages may draft, preview, and propose changes, but must not become the final source of truth by themselves.
- The public runtime de-duplicates Airtable rows by `knowledge_id` and appends any missing reviewed canonical fallback cards. Airtable remains the live override when the same ID exists.

## Published campaign knowledge

- `cards/promotion/care-back-2026-final-lock-th.json` — CARE BACK 2026 final policy, Birthday Wish coupon gate, verified status benefits, and canonical campaign route.

## Validation

```bash
node knowledge/kenji/validate.mjs
```

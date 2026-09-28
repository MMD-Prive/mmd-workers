# MMD MODEL historical evidence intake

This importer stages old model work evidence in Airtable `Model History Imports`.
It never makes a record visible in MMD MODEL by itself.

## Accepted input

Use a JSON array, `{ "rows": [] }`, or CSV. Each row may contain:

- `source` (or pass `--source`): `line_model_group`, `line_group_note`,
  `line_team_group`, `line_private_chat`, `chat_backup`, `slip_evidence`, or
  `manual_admin`
- `source_ref`: stable message, note, album, or archive reference (recommended)
- `raw_text`: original chat or note text
- `model_name`
- `model_id_candidate`: exact Airtable `rec...` model record ID only
- `original_message_time`, `work_date`, `model_payout`, `work_type`
- `attachment_url`: HTTPS slip or evidence URL

Private chat and chat backup sources are stored as Airtable `other`, with the
original source variant preserved in `source_name` and the internal audit note.

## Safe flow

Run a dry-run first (the default):

```bash
node scripts/model-history/model-history-evidence-intake.js \
  --file ./model-history.json \
  --source chat_backup
```

The command reports only sanitized metadata; it does not print raw chat text.
To create internal review records after checking the dry-run:

```bash
AIRTABLE_API_KEY=... node scripts/model-history/model-history-evidence-intake.js \
  --file ./model-history.json \
  --source chat_backup \
  --apply
```

Every created record starts as `review_status=needs_review` and
`privacy_level=internal`. A missing slip is only an evidence gap and is never
treated as proof that the model was unpaid. The owner must verify identity,
date, job, and amount, then explicitly approve the record and change privacy to
`model_summary_allowed` before it can appear in MMD MODEL.

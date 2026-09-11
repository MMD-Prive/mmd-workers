# MMS customer history using the MMD history pipeline

Requested by Per on 2026-09-10. This change is an implementation, not evidence
that historical customer data has been imported or that production is deployed.

## Customer entry

- `/member/liff?view=mms-history` — mobile customer history, using the existing
  LINE verification flow and staying on MMS after verification.
- `GET /member/api/liff/mms/history` — browser identity parameters are rejected.
  The rotated, server-verified LINE session resolves one canonical Client using
  the same MMD identity lookup. A paid PRIVATE membership is not required.
- Existing Therapist approval and MY MMS work-app access are separate.

Only completed `job_type=MMS` Sessions linked to that exact Client are exposed.
Imported Sessions must also be approved. Payment evidence is checked separately
in Payments. Raw LINE notes, rename, email, location and private care notes never
leave the server. Records sharing an email cannot substitute for a Client link.
The newest 50 confirmed services are displayed, with no one-year date cutoff.
Storage errors and unresolved identities display a checking/unavailable state.
The current MMD identity lookup requires a canonical customer email; if missing,
the customer stays in checking until the existing identity review resolves it.

## Import the existing notes

Use an authorized export/capture of customer notes from **LINE OA @malemassage**.
No Messaging API note-export capability or access to an archive is assumed.
Do not treat the Male Massage crew group's notes as a customer's OA notes.
A `source_ref`/`note_id` must identify the original customer and note/event
stably across exports. One note with several visits needs event-level review;
do not approve its total as one visit or reuse one approval for multiple visits.

Input shape (illustrative only; never import this example):

```json
{
  "source": "line_ofc",
  "note_id": "<stable-customer-reference>:<original-note-or-event-id>",
  "line_user_id": "<verified/source LINE user ID when available>",
  "current_line_rename": "<name Per uses in LINE>",
  "raw_line_notes": "<exact original note>",
  "evidence_kind": "service_history"
}
```

1. Inspect the source and run a read-only plan with the same Airtable environment
   used by the MMD importer:

   ```sh
   node scripts/line-official-legacy/mms-history-evidence-intake.js \
     --source line_ofc --file /path/to/authorized-mms-notes.json \
     --batch-id mms_ofc_20260910
   ```

2. After inspecting that plan, repeat with `--apply-evidence` to stage evidence.
   This cannot create a Client or change payments, points, entitlements or jobs.
   Missing/ambiguous matches require the existing identity review. Rename is a
   discovery hint, never proof of ownership. Preserve the reviewed canonical
   Client link and `decision_source=manual_review`.
3. Prepare the existing history queue for that batch:

   ```sh
   node scripts/line-official-legacy/history-review-queue.js \
     --batch-id mms_ofc_20260910 --apply
   ```

4. Review each event's date, service amount and payment coverage in the same
   MMD history review process. Points need their own explicit decision; choose
   `not_applicable` when no points are approved. Nothing automatically grants
   membership or points from a LINE note.
5. Run `history-materializer.js --import-id <id>` for the approved event, inspect
   its plan, then use `--apply` to materialize it. The existing two review gates
   and idempotency keys remain. MMS provenance makes `job_type=MMS` and retains
   the source import/review references. Ordinary MMD history keeps its old type.
6. New MMS jobs already use `job_type=MMS` through `mms-job-bridge.js`. Once their
   canonical lifecycle says Completed, the same history reader picks them up.

No new Airtable fields are required. The existing generic materializer's
reviewed date/amount and payment coverage requirements still apply. Therapist
names, massage type and duration are not invented from unreviewed notes.

## Release and acceptance

- Run `MMS customer history contract` and existing required PR checks.
- Merge through normal review, then deploy member-pages-worker and
  member-dashboard-chat-worker. The existing `/member/liff` and
  `/member/api/liff/*` routes cover this change.
- Verify anonymous history is 401, a reviewed customer sees only their own MMS
  records, unresolved identities show checking, and LINE returns to the MMS page.
- Publish the updated Webflow booking history CTA only after both Workers pass.
  The repository booking HTML may be older than the live design: change only the
  existing My MMD/history link to `/member/liff?view=mms-history`, preserving the
  published page's other markup. Do not overwrite the whole live page with it.
- The source archive, reviewed customer matching, actual historical import,
  production deployments and real LINE account acceptance remain operational
  steps; test fixtures do not demonstrate any of those completed.

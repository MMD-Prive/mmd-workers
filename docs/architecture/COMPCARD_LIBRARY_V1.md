# Internal Compcard Library

Owner-approved purpose: maintain a searchable internal archive of original
compcards from existing Drive folders, owner uploads and Job Board applications.
This is independent of unfinished MY MODEL activation and does not require models
to sign up again. A job-specific partner selection page is a later consumer.

## Entry points and storage

- Page: `/internal/admin/compcards` (owner/admin cookie only).
- API: `/v1/admin/compcards` with the same credential-bound session on every
  data, original, source-preview and metadata request.
- Originals, entries and metadata history use the existing private
  `PRIVATE_MODEL_MEDIA` binding, under `compcard-library/v1/`.
- `JOB_BOARD_COMPCARDS` reads the existing `mmd-public-access-evidence` bucket.
  The library never writes to this source bucket or changes application status.
- No new R2 bucket, D1 database, Durable Object or Airtable table is required.

## Model identity and provenance

Each entry retains its original filename, aliases, provider, stable source
reference, source path/revision, byte size and content hash. Its ID combines
provider source identity and content hash: renaming a Drive file does not
duplicate identical bytes; replacing its contents produces another retained
version. The original bytes are copied to content-addressed private objects at
import, so later edits or deletions at the source do not alter archived cards.

Canonical model linking is an explicit owner choice. Search shows matching
Models records; a name match never auto-links or merges people. Linking reads
the selected canonical record and saves a dated snapshot without changing the
Models table. Missing and duplicate names stay in the `unmatched` queue.

Printed card metrics, applicant-supplied metrics and dated canonical profile
metrics have separate provenance. Current availability, payout eligibility,
sexual orientation and work scope are not inferred from an image. Card presence
or a canonical status snapshot does not certify present availability or rates.

Metadata saves require the last etag. The API preserves the prior metadata and
uses an R2 conditional write so stale editors get a conflict instead of an
unannounced overwrite. Archive/retired states retain the original files.

## Existing Job Board boundary

At implementation time, `public-job-board-v2.js` stores numbered `uploads`
associated with submitted applications. This record format does not identify
which numbered photo is a compcard. The library therefore shows submitted image
summaries and lets the owner select actual compcards for import. It does not
label every applicant photo a compcard, auto-book a model, or expose applicant
phone/LINE details in the library.

## Drive setup before deployment

Set `COMPCARD_DRIVE_ROOTS_JSON` as an admin-worker runtime secret containing an
array of `{ "id": "DRIVE_FOLDER_ID", "name": "Display name", "world": "private", "work_types": [] }` objects. Use the
archive roots supplied by the owner (Private Standard, Private Premium and Public
Travel). Configure the Public Travel root with `world: "public"` and
`work_types: ["travel"]`. The IDs are not
committed to the public repository. The library supports the existing
`GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET` and
`GOOGLE_DRIVE_REFRESH_TOKEN` bindings. It verifies the OAuth account against
`COMPCARD_DRIVE_OWNER_EMAIL` (default `malemodel.bkk@gmail.com`) before reading
files. `GOOGLE_SERVICE_ACCOUNT_JSON` is also supported when configured, and
takes precedence. The selected runtime identity must have read access to the
roots. Interactive connector access does not establish Worker runtime access.

The UI reports missing configuration or access separately from an empty folder.
Every Drive read rechecks ancestry under one configured root, rejects folders
outside that scope, bounds file size and verifies the version after download.
Drive navigation and registry searches preserve opaque continuation cursors;
an empty filtered page does not imply that the rest of the archive is empty.

Supported files: JPEG, PNG, WebP and PDF, at most 15 MiB. PDF originals download
as attachments. The library does not generate replacement model images or OCR
unreviewed identity/measurements.

## Release checklist

1. Run `npm run test:compcard-library`.
2. Deploy admin-worker after review with the source R2 binding and Drive roots
   configured. No partner/customer access is enabled by this implementation.
3. In an owner browser, confirm unauthenticated originals are denied; browse
   both authorized Drive roots; import one original and repeat to check dedupe.
4. Choose a real submitted Job Board compcard and confirm byte integrity and
   model linking. Check the source application is unchanged.
5. Check on mobile that search, metadata edits, archive filters, prior metadata
   and source versions work. Review the initial unmatched queue before bulk use.

Local tests use synthetic data only. Real Drive/Job Board imports and deployed
browser behavior must be recorded at release time; passing fixture tests is not
production verification.

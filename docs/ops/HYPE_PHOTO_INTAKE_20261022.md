# HYPE photo intake — 22 October 2026

Owner request: reduce Promotion posts, increase Standard compcards from Studio,
and provide one place to drop photos for ongoing preparation and customer delivery.
This runbook covers the private photo queue and approved Standard-card handoff.

## Folder and schedule

Use the connected Drive account **malemodel.bkk@gmail.com**. Keep these folders
private; the sender uploads approved image bytes to Telegram, not a public Drive link.

| Purpose | Drive folder ID |
| --- | --- |
| Inbox: MMD HYPE — วางรูปให้ทำ | `1H_P5W1OzXUYdOkwmfaS_syDgAog0gNQ3` |
| READY: finished cards eligible for verification and queuing | `1CPnNgAY2sKRyh5u0nfr9WpexFV6A_HT6` |
| SENT: cards with verified Premium and Standard delivery receipts | `1tEqGSDCNX-WcoEBg7P5ed8wlrAmVY8Go` |
| NEEDS INFO: ambiguous identity, facts, source or quality | `1j_E8XsHv-yKbNEuj8GNWimG2f2KnUEqB` |

The recurring processing task checks new Inbox and READY files at **13:00
Asia/Bangkok** and prepares **up to two new Standard cards per day**. This is a
generation/work limit, not a promise that two cards will be delivered that day.
It does not create another Telegram sending schedule. Events Worker retains the
16:30 normal compcard slot, the configured 20:00 Promotion/extra-Standard cadence,
room identities, frozen plans, cooldown and delivery receipts.

The owner has authorized ordinary Standard-card preparation and sending within
this workflow. Ask only about a concrete unresolved identity, factual conflict,
new creative instruction or capability/access blocker. Existing Studio draft
review and production gates remain authoritative.

## Process one source

1. List Inbox and READY using Drive metadata. Inspect only new eligible image
   files. Do not treat nested folders or documents as source images.
2. Read the private intake registry first. If any existing entry has this
   `review.source_file_id`, including a historical nonselectable entry, do not
   generate the same source again. Also check READY and SENT for an already
   prepared output from that source before spending on image generation. For a
   newly generated output, put the exact canonical Model record ID, original
   Drive file ID and original-byte SHA-256 in its upload filename:
   `HYPE--{model_id}--src-{source_file_id}--sha-{source_sha256}.png` (or `.jpg`).
   This filename is recovery provenance, not evidence of identity or approval;
   independently verify those facts below. Preserve existing Studio export
   filenames and use their actual Drive IDs as source references. Changed bytes
   under a previously processed source ID need review; do not silently turn a
   retry into a new creative revision. Do not rely on Drive description edits:
   the connected update action does not support that field.
3. Resolve the model from an exact canonical name/record ID in the filename or
   owner brief, then read live Airtable **appsV1ILPRfIjkaYg / Models
   (tblI4B0bI446vp9GX)**. Match exactly one active Standard record and confirm
   `working_name`, height, weight, private tier and client visibility. Do not
   identify a person by their face, guess a model ID, invent measurements or infer
   Standard status from appearance. Put unresolved items in NEEDS INFO with a
   short explanation of what is missing.
4. Inspect the original image. For an already finished Studio export, retain its
   exact bytes after quality review; do not regenerate it. An export placed in
   READY is usable only after its required Studio review. A Studio
   `awaiting_owner_review` draft is not an approved export. Never unlock the
   Studio pilot or alter `MODEL_CARD_AUTO_ENABLED` as an intake shortcut.
5. For a raw photo, use the supported image-editing tool and the approved card
   template. Preserve the real Standard model's identity. Produce a **1322 × 1200**
   PNG/JPEG with the model on the left, canonical name and large measurement
   numbers on the right, and the approved frame/logo. Use public **MMD PRIVÉ** or
   private **SIGIL** branding according to canonical classification; the current
   Standard intake follows the private classification. Show measurements as
   `178 / 65`, with no `cm`, `kg`, `HEIGHT`, `WEIGHT` or tier/category label printed
   on the card. Do not substitute a fictional model or invent a replacement logo.
6. Open the final file and review likeness, canonical text, exact measurements,
   logo, layout, legibility and image quality. Confirm suitability for the two
   customer rooms. The metadata booleans below are attestations of work actually
   performed; preparing JSON is not visual review.
7. Save the finished image to READY and read its metadata back. Use the resulting
   actual Drive file ID as `file_id`. Preserve the original Inbox/Studio source ID
   as `review.source_file_id`. Keep the provenance filename when moving a newly
   generated card between these private folders. Reuse a completed READY output
   on retries; the registry's source ID remains the authoritative processed-source
   record after queuing. Source-image SHA-256 in the filename and finished-card
   `sha256` in the registry are separate digests and must not be substituted.
8. Prepare the local asset/entry JSON, upload and read back the private asset,
   then merge the entry into the latest registry as described below. Stop if the
   registry changed concurrently; reread and merge rather than overwriting.

If a tool, image editor, brand asset or source download is unavailable, report
the specific blocked item. Do not mark it prepared, queued or sent.

## Local preparation helper

`scripts/hype-prepare-intake.mjs` reads a finished local PNG/JPEG and explicit
verified metadata. It computes MIME, dimensions, size and SHA-256 from the bytes,
and writes `asset.json` and `entry.json` with owner-only file permissions. It
does not render, regenerate, upload, access Airtable or send Telegram messages.
It checks image container/header structure; visual review remains required.

```sh
node scripts/hype-prepare-intake.mjs \
  --image /absolute/path/finished-card.png \
  --metadata /absolute/path/verified-metadata.json \
  --out-dir /absolute/path/prepared-card
```

The output directory must not already contain `asset.json` or `entry.json`.
Use actual verified IDs and facts in the following metadata shape; the bracketed
values are placeholders, not records to create or submit:

```json
{
  "file_id": "<finished file ID observed in READY>",
  "source_folder_id": "1CPnNgAY2sKRyh5u0nfr9WpexFV6A_HT6",
  "model_id": "<exact canonical Airtable Model record ID>",
  "canonical_name": "<exact live working_name>",
  "display_name": "<exact approved visible name>",
  "category": "standard",
  "approved": true,
  "status": "active",
  "selectable": true,
  "height_cm": 178,
  "weight_kg": 65,
  "caption_stats_allowed": true,
  "review": {
    "reviewed_by": "assistant",
    "reviewed_at": "<actual new Date().toISOString() UTC timestamp>",
    "source_file_id": "<actual original Drive source file ID>",
    "identity_verified": true,
    "canonical_facts_verified": true,
    "finished_material": true,
    "visual_qa_passed": true,
    "public_safe": true
  }
}
```

The example measurements are illustrative, never defaults. `public_safe` records
that the image passed the required content review; it does not grant public
access, change the model's tier or authorize another destination. The helper
requires every review flag explicitly and rejects missing/unverified assertions.

## Private storage contract

Use the existing private **mmd-hype-compcard-state** R2 bucket. Do not enable
public access and do not store assets in a public model bucket.

The Events integration requires `HYPE_INTAKE_ENABLED="true"` and
`HYPE_INTAKE_READY_FOLDER_ID="1CPnNgAY2sKRyh5u0nfr9WpexFV6A_HT6"`.
Verify deployed values and the deployed source version before describing the
queue as connected. A missing registry is an empty intake; malformed metadata
is not permission to fall back to sending an unreviewed source.

| Object | Key / contract |
| --- | --- |
| Registry | `hype-compcards/v1/intake/approved.json` |
| Finished asset | `hype-compcards/v1/intake/assets/{sha256}.json` |
| Card ID | `intake_{finished_drive_file_id}_{sha256}` |

`asset.json` is a bounded JSON envelope so approved bytes can be uploaded through
the Cloudflare API without exposing a public source URL:

```json
{
  "schema": "hype_compcard_intake_asset_v1",
  "success": true,
  "result": {
    "encoding": "base64",
    "content_type": "image/png",
    "sha256": "<digest of the original finished image bytes>",
    "data": "<canonical base64 of those same bytes>"
  }
}
```

`entry.json` is the raw card object for the registry's `result.cards` array. Its
source is `owner_drive_intake`; it includes the verified metadata, calculated
hash/size/dimensions/MIME, exact READY folder and immutable `asset_key`.

```json
{
  "schema": "hype_compcard_intake_registry_v1",
  "success": true,
  "result": {
    "revision": "<new nonempty version, at most 120 characters>",
    "ready_folder_id": "1CPnNgAY2sKRyh5u0nfr9WpexFV6A_HT6",
    "cards": []
  }
}
```

Upload the asset **before** registering its entry. Read it back and verify the
decoded bytes against the calculated SHA-256. Keep base64 payloads out of chat,
console output and run reports. A successful Cloudflare envelope is not a
delivery receipt.

Merge into a freshly read registry; maximum **500 entries / 1 MiB**. Reuse an
identical card ID and hash on retries. Permit at most **one selectable card per
model**. When approving a new version, retain older entries and immutable asset
objects with `approved:true`, `status:"active"`, `selectable:false` so existing
frozen plans can finish. Do not delete, repurpose or rehash an old card under its
existing ID; do not reset journals or create alternate delivery keys to force a
send. If a registry limit is reached, hold new intake and report it for a scoped
archive decision rather than discarding delivery history.

## Delivery and SENT

HYPE reads the approved registry, validates each card and asset, and applies the
existing live model eligibility checks, room mapping and per-model cooldown.
Standard cards go to **Premium + Standard Telegram**. The private registry cannot
override destination chat IDs, captions, schedules or promotion terms.

After scheduled delivery, check the matching frozen plan and delivery records
for the exact card ID/hash, publishing date and destination. Move the finished
Drive card to SENT only when **both intended rooms have verified sent receipts**.
An unsent, reserved, partial, failed, unknown or `delivery_uncertain` outcome is
not completion. Keep uncertain items in READY, record the concrete status and
do not retry them through another path. A `duplicate:true` receipt refers to the
existing delivery; it is not a new send.

Report distinct counts for examined, prepared, queued, blocked and verified
delivered items. An empty day is normal; do not make filler cards or substitute
Promotion to consume an unused Standard slot.

## Local verification

```sh
node --test --test-isolation=none scripts/hype-prepare-intake.test.mjs
```

These tests cover exact-byte preparation, required review facts, dimension and
size rejection, private extra-field rejection, local outputs and overwrite
protection. They make no network calls and do not establish visual quality or
production delivery.

## Existing source references

- `events-worker/src/compcard-intake.js`: approved private-registry and asset reader.
- `events-worker/src/compcard-daily.js`: scheduled selection and sending.
- `events-worker/src/compcard-policy.js`: canonical eligibility, category routing and cooldown.
- `events-worker/src/compcard-journal.js`: immutable plans and delivery evidence.
- `admin-worker/src/model-card-automation.js`: Studio private draft generation;
  `awaiting_owner_review` is a draft state, not publication approval.
- `docs/model/MMD_APP_AUTOMATIC_CARD_DRAFTS.md` and
  `ops/release-gates/studio-master-frame-v2.json`: existing Studio release boundary.

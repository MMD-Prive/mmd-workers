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
| NEEDS INFO: prepared drafts awaiting a canonical link/facts, or items needing clarification | `1j_E8XsHv-yKbNEuj8GNWimG2f2KnUEqB` |

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

## What the owner supplies

**Original photo filenames can stay exactly as they are.** They do not have to
match a folder, a model name or an Airtable record. Use one immediate subfolder
of Inbox per model, with a recognizable name and a `PROFILE.txt`, `PROFILE.md` or
equivalent owner brief beside the photos. The folder associates those files with
the brief; it is not proof of canonical registration. Photos already placed directly in
Inbox remain usable when an owner brief clearly identifies which files belong
to which model.

The minimum brief for a complete draft is:

```text
ชื่อที่จะใช้บนการ์ด: <ชื่อที่เจ้าของหรือนายแบบระบุ>
ส่วนสูง (ซม.): <ตัวเลขที่แจ้ง>
น้ำหนัก (กก.): <ตัวเลขที่แจ้ง>
ประเภทขาย: Standard
```

An owner message containing these facts is also acceptable; a new text file is
not compulsory if the association is already clear. Gender is optional, accepted
only when supplied by the owner/model, and is never inferred from a photo or
automatically printed/published. Missing gender does not block the workflow.
Commercial tier is separate from gender and must not be inferred from appearance.

Owner-supplied facts are sufficient to **prepare artwork before Airtable is
populated**. Registration and sending still require one linked live canonical
record and verification of the required factual fields. This workflow does not
create or edit Airtable records automatically. It does not add a separate
application or identity-verification process; it checks the specific canonical
link, facts, status, tier and visibility already required for publication.

## Process one source

1. List Inbox and its immediate model subfolders, **one folder level only**.
   Skip the exact READY, SENT and NEEDS INFO folder IDs during raw-source
   traversal; inspect them separately for queue/recovery state. Read a model
   subfolder's `PROFILE.txt`/`PROFILE.md`/owner brief and its images together. Do
   not recurse farther, treat a brief as an image, or mix different models' photos. Keep all
   original image names, IDs and folder associations intact. Respect connector
   pagination; report a partial scan rather than claiming all files were checked.
2. Read the private intake registry first. If any existing entry has this
   `review.source_file_id`, including a historical nonselectable entry, do not
   generate the same source again. Also check READY, SENT and NEEDS INFO for an
   existing prepared result before spending on image generation. For each model,
   select one primary photo from the associated images and record any additional
   references; do not make one competing card per photo. Compare the original
   source digest and the saved brief digest on retries. A changed source or brief
   requires reconciliation of the existing draft, not an automatic duplicate.
   Do not rely on Drive description edits: the connected update action does not
   support that field.
3. Use the owner/model-supplied name, height, weight and commercial tier for draft
   preparation. Check live Airtable **appsV1ILPRfIjkaYg / Models
   (tblI4B0bI446vp9GX)** for an exact canonical match when available. No match does
   **not** prevent preparing the draft from a complete brief. An ambiguous match
   must not be guessed. Do not identify a person by their face, invent a record
   ID or measurements, or automatically copy brief facts into Airtable. If a
   required brief fact is missing, ask for that specific fact rather than asking
   the owner to rename photos or complete the whole database first.
4. Inspect the original image. For an already finished Studio export, retain its
   exact bytes after quality review; do not regenerate it. An export placed in
   READY is usable only after its required Studio review. A Studio
   `awaiting_owner_review` draft is not an approved export. Never unlock the
   Studio pilot or alter `MODEL_CARD_AUTO_ENABLED` as an intake shortcut.
5. For a raw photo, use the supported image-editing tool and the approved card
   template. Preserve the real Standard model's identity. Produce a **1322 × 1200**
   PNG/JPEG with the model on the left, the supplied name and large measurement
   numbers on the right, and the approved frame/logo. Use public **MMD PRIVÉ** or
   private **SIGIL** branding according to the supplied commercial classification,
   checked against canonical data when linked; the current Standard intake follows
   the private classification. Show measurements as
   `178 / 65`, with no `cm`, `kg`, `HEIGHT`, `WEIGHT` or tier/category label printed
   on the card. Do not substitute a fictional model or invent a replacement logo.
6. Open the final file and review likeness, supplied text, exact measurements,
   logo, layout, legibility and image quality. Confirm suitability for the two
   customer rooms. The metadata booleans below are attestations of work actually
   performed; preparing JSON is not visual review. Reviewing owner-supplied facts
   does not establish that the same facts have been verified in Airtable.
7. When no unique canonical record is linked, save the actual finished draft in
   NEEDS INFO with status **prepared-awaiting-link**. When linked but required
   canonical name/height/weight/tier facts are missing or conflict, use
   **prepared-awaiting-facts**. Keep a private JSON preparation note beside the
   draft containing the actual draft file ID, source folder/file ID, original
   image SHA-256, supplied brief file ID plus SHA-256 of its retrieved UTF-8 text,
   and the exact unresolved fields. For a brief supplied in chat, retain its
   supplied text and digest with `brief_file_id:null`; do not invent a Drive ID.
   Record additional reference image IDs/digests if used. This note is recovery
   state, not a registry entry or publication approval. A draft name such as
   `DRAFT--src-{source_file_id}--sha-{source_sha256}.png` needs no model record ID.
   Leave originals and the profile brief in the model folder; only the generated
   draft and its preparation note belong in NEEDS INFO. Reuse them on subsequent runs.
8. Before queuing, match exactly one live canonical Standard record and verify
   `working_name`, height, weight, active status, private tier and client visibility.
   Reconcile the artwork against those verified facts. If any required canonical
   fact remains missing, keep the prepared draft unqueued. Never set
   `canonical_facts_verified:true` merely because an owner brief supplied a value.
   Do not fabricate an ID, create a record or relax runtime checks to clear a hold.
   Missing gender is not a hold. This runbook does not enable sending without
   Airtable; the owner brief enables preparation while the canonical link/facts
   are resolved separately.
9. Save or move only the fully verified finished output to READY and read its
   metadata back. Use that actual Drive file ID as `file_id` and preserve the
   original source ID as `review.source_file_id`. The registry's source ID is the
   authoritative processed-source record after queuing. Source-image SHA-256 in
   the preparation note and finished-card `sha256` in the registry are separate
   digests. A finished export already in READY still needs these checks; folder
   membership alone is not a queued or sent status.
10. Prepare the local asset/entry JSON, upload and read back the private asset,
    then merge the entry into the latest registry as described below. Stop if the
    registry changed concurrently; reread and merge rather than overwriting.

If a tool, image editor, brand asset or source download is unavailable, report
the specific blocked item. Report a completed unqueued draft as prepared and
state its actual remaining link/facts; do not call it queued or sent.

## Local preparation helper

`scripts/hype-prepare-intake.mjs` reads a finished local PNG/JPEG and explicit
verified metadata. It computes MIME, dimensions, size and SHA-256 from the bytes,
and writes `asset.json` and `entry.json` with owner-only file permissions. It
does not render, regenerate, upload, access Airtable or send Telegram messages.
It checks image container/header structure; visual review remains required.
This helper prepares **verified publication metadata**, not the earlier
owner-brief draft. It cannot represent `prepared-awaiting-link` or
`prepared-awaiting-facts`; keep those drafts out of this helper and the registry
until the real canonical ID and required facts have been verified.

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

Report distinct counts for examined, **prepared-awaiting-link**,
**prepared-awaiting-facts**, **queued**, blocked-without-a-draft and verified
delivered items. State the exact missing link or fields. An owner-brief draft is
real completed artwork, but it is not evidence that no-Airtable sending works.
An empty day is normal; do not make filler cards or substitute Promotion to
consume an unused Standard slot.

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

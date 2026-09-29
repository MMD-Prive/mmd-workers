# MMD APP — first primary photo → card draft

Status: implementation for review; production flag OFF. No live image request,
secret provisioning, brand asset upload, production deployment or publish was
performed during implementation.

When a model successfully saves their first approved primary profile photo,
`POST /v1/model/media/:media_id/set-main` queues one automatic draft. Saving a
profile is independent of generation success. Selecting an unapproved photo
still follows the existing media review process; it does not bypass approval.

The model can leave the app while a Durable Object alarm processes the job.
Status appears on Profile/Photos. Studio Upload gets a separate automatic-card
inbox with authenticated preview and PNG download. Every generated image remains
a private draft for Per to inspect. No public URL, Media Assets approval,
visibility change, Telegram notification or model identity write is performed.

## Visual contract

Final output is **1322 × 1200 PNG**. The image API generates only the person and
background. A server-side browser adds the **Master Frame V2** overlay, exact
typography and the approved logo, then the PNG header dimensions are checked
before the draft is marked ready.

Master Frame V2 is the owner-approved graphic direction from 2026-09-28:

- One shared **metallic silver / graphite-gunmetal frame** across all categories.
- No large category name, role, tier, `PUBLIC`, `PRIVATE`, `Straight`, `Gay`,
  `TRAVEL`, `EXTREME`, or `SĪGIL SYSTEM` copy is printed on the final card.
- No decorative right-side seam and no long color banner. Category is signaled
  only by a **small edge accent cue**.
- The approved logo is small at the lower right. Public cards use MMD PRIVÉ;
  private/exclusive cards use the approved SIGIL logo.
- Non-exclusive cards print the **model name only**. Canonical two-letter suffixes
  remain metadata and are not printed.
- GWs/EMs keep their assigned RUN identity (for example `GWs19`, `EMs11`).
- Every card shows the two measurements as large numbers without `cm` / `kg`.
- Travel is recognized by the small **cyan/blue** edge cue only; the word
  `TRAVEL` is never printed on the card.
- Extreme follows the same rule with a small **red** edge cue.
- GWs/EMs retain their distinct portrait treatment while using the same frame
  family; their accent cue is slightly stronger, not a separate text-heavy card.
- A blank/master-frame graphic contains no person, copy or logo. Those are
  runtime layers and must not be baked into a reusable frame asset.

| Canonical category | Field | Tone / logo | Accent | Visible identity | Face |
| --- | --- | --- | --- | --- | --- |
| Straight | ST | Dark / SIGIL | `#a7adb4` | Model name | Preserve reference identity |
| Gay | GY | Dark / SIGIL | `#d96aa8` | Model name | Preserve reference identity |
| Farang | FR | Dark / SIGIL | `#45bd7a` | Model name | Preserve reference identity |
| Travel | EN | Light / MMD | `#4aa9d8` | Model name | Preserve reference identity |
| Extreme | EX | Light / MMD | `#d83a48` | Model name | Preserve reference identity |
| GWs | GWs | Dark / SIGIL | `#36c4c7` | Assigned GWs RUN | Distinct fictional face, loose resemblance |
| EMs | EMs | Dark / SIGIL | `#d3b45c` | Assigned EMs RUN | Distinct fictional face, loose resemblance |

Province mode uses the selected category color plus a small explicit province
code. It is not a new color. `CM` means Chiang Mai; `BKK` suppresses the badge.
Location is never inferred from a legacy folder (for example Bonn CNX).

The automatic renderer is versioned as `mmd-primary-v2`; the version is part of
the saved design fingerprint so an old graphic recipe is not silently treated as
the same design.

## Canonical data and incomplete profiles

The live Airtable schema was read on 2026-09-27 without modifying it:
`appsV1ILPRfIjkaYg / Models (tblI4B0bI446vp9GX)`.

- `sales_layer`: public/private; `both` requires an unambiguous canonical
  `folder_scope_key` for this inventory record.
- `MMD Public Category`: Travel or Extreme.
- `recognition_class` / `exclusive_group`: GWs or EMs, with conflicts held.
- `catalog_group`: explicit FR/Farang/Foreigner, otherwise `orientation_label`
  supplies the ordinary private category. No image-based classification.
- `working_name`, `suffix_code`, `height_cm`, `weight_kg`, `status`.
- GWs/EMs require an already assigned name such as `EMs11`. Other records still
  require their canonical two-letter suffix metadata for identity hygiene, but
  Master Frame V2 does not print that suffix. The job does not allocate or
  overwrite identities.
- Province codes come from the server-owned `MODEL_CARD_PROVINCE_BY_MODEL_JSON`
  mapping, keyed by exact canonical Model record ID. Default `{}` omits badges.

Missing or ambiguous data produces `waiting_profile` with specific blockers in
Studio. Fill the canonical record, then use **ตรวจข้อมูลแล้วดำเนินต่อ**. No charge
is incurred before metadata, source and logo preflight pass. HEIC/HEIF sources
are held for conversion to JPG/PNG/WebP; their original uploads remain intact.
Automatic card inputs above 12 MiB are held for compression to keep the Worker
memory bounded; the application's existing 25 MiB upload allowance is unchanged.
Before the first paid attempt, selecting a corrected approved primary reuses the
same held job. After an image attempt, primary changes need owner review instead.

## Durability and cost bounds

One Durable Object per canonical model reserves the first job atomically. Repeated
clicks and subsequent primary selections return the same job rather than spend
again. The saved source digest and design fingerprint are kept for audit.

A global Durable Object limits new image attempts to 20 per UTC day by default
(`MODEL_CARD_DAILY_LIMIT`, maximum 100). One request asks for one medium-quality
image. Image generation is never automatically repeated after an uncertain
provider response or a crash during that call. Such a job needs owner review.
Saved portraits can resume the rendering step without another image request;
render attempts are limited to three. A new creative revision is deliberately
outside this first-photo automation.

The source's raw linked Model ID, media approval, primary role, object ownership,
ETag and canonical design are checked before generation, before/after rendering
and whenever an owner opens the preview. Source deletion, reassignment or data
changes stop a stale card from being served. Private draft bytes and a bounded
review index live under `studio-card-drafts/` in the existing private bucket.
This implementation does not establish a new retention policy for that bucket.

## API and UI

| Endpoint | Authority | Result |
| --- | --- | --- |
| Existing `POST /v1/model/media/:id/set-main` | Model session + origin + owned approved image | Adds `card_generation` receipt after save |
| `GET /v1/model/media/card-status` | Current model session | Safe state, dimensions, timestamps; no storage keys or internal blockers |
| `POST /studio/api/model-cards/list` | Existing Studio admin gate | Private draft summaries, paginated cursor |
| `POST /studio/api/model-cards/preview` | Existing Studio admin gate | Authenticated PNG; exact model ID + job ID required |
| `POST /studio/api/model-cards/resume` | Existing Studio admin gate | Resume a preflight hold or saved-portrait render only |

The inbox returns up to 50 drafts in global newest-created-first order. New index
keys under `studio-card-drafts/index-by-created/` start with a reverse timestamp;
model and job IDs break ties deterministically. The opaque `v1:` cursor records
the last returned key, so newer arrivals do not shift later pages. Refresh the
inbox to see those arrivals. Cursors from the previous R2-only format are rejected
with `invalid_cursor`; start again without a cursor after upgrading.

Existing `studio-card-drafts/index/` summaries remain readable and are merged
before pagination. Saving a job writes its ordered entry first, then removes only
its obsolete legacy index entry. Failed writes preserve the old entry; failed
cleanup uses the existing retry alarm. When both entries exist, the ordered one
wins. Listing is read-only and scans all remaining legacy summaries; ordered
entries fetch at most one page plus a lookahead unless objects disappear during
the read. Images and draft jobs are not deleted by this index migration.

The existing MMD APP presentation addon displays status. Studio Upload uses the
standalone `auto-card-inbox.html`, `.css` and `.js` split module. The live Webflow
page uses `#mmdStudioUploadR5` and `#muUploadForm`, not the generic production
bridge form hooks. The three split parts were saved in the Webflow draft on
2026-09-27; they are not published. The backend and MMD APP presentation still
need release for the complete user experience. The list API returns `enabled`
so the inbox distinguishes paused automation from an empty queue.

## Activation after owner review

1. Review this branch. It adds the `ModelCardCoordinator` SQLite migration,
   `MODEL_CARD_COORDINATOR` binding and `MODEL_CARD_BROWSER` browser binding.
   Production config remains `MODEL_CARD_AUTO_ENABLED = "false"`.
2. Confirm the OpenAI project can use `gpt-image-2.5-sunburst` and provision
   `OPENAI_IMAGE_API_KEY` through the existing secure Worker secret process.
   Do not paste a key into chat, a browser form, Git, logs or this document.
3. Enable Cloudflare Browser Run for the account and verify the binding supports
   `quickAction("screenshot", ...)`. No separate browser API token is used.
4. After approval, place the exact approved MMD logo at
   `studio-card-brand/mmd-approved.png` and the user-specified SIGIL V4 asset at
   `studio-card-brand/sigil-v4.webp`, with correct PNG/WebP content types and each
   no more than 1 MiB. The code does not invent or fetch replacement logos.
   SIGIL V4 source supplied by Per:
   https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aa68e4027f3ee081df76f28_SIGIL%20Apply%20V4%20Logo.webp
5. Populate province mappings only for current confirmed locations. BKK needs no
   mapping. No Airtable schema change is required.
6. Deploy the backend with the feature OFF, deploy MMD APP presentation and the
   Studio Upload split module through their existing release paths. A merge to main
   triggers existing production workflows; keep the PR draft until approved.
7. Enable for a controlled owner-approved real model example. Verify one image
   charge, identity treatment, logo, color, exact dimensions, model status, Studio
   preview/download, and the absence of public publication. Then expand use.

Rollback: set `MODEL_CARD_AUTO_ENABLED` to `false`. New jobs stop and queued jobs
pause; completed drafts remain available for authenticated review. Do not roll
back or remove already-applied Durable Object migrations.

## Verification

```sh
node --experimental-global-webcrypto --test \
  admin-worker/model-card-automation.test.mjs \
  admin-worker/model-media-upload.test.mjs \
  admin-worker/model-dashboard-policy.test.mjs \
  admin-worker/studio-real-worker.test.mjs \
  admin-worker/studio-webflow-source.test.mjs \
  model-dashboard-presentation-worker/index.test.mjs
```

Tests use fake image/provider/storage adapters: they verify routing, ownership,
concurrency, cost bounds, safe projections, stale-source handling, retries and
dimension enforcement. They are not a claim of live image quality or production
E2E. Real likeness, logo compositing and Browser Run output must be inspected at
the controlled activation step. No live paid API call has been made.

API references checked during implementation:

- https://developers.openai.com/api/docs/guides/image-generation
- https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst
- https://developers.cloudflare.com/browser-run/quick-actions/screenshot-endpoint/
- https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
